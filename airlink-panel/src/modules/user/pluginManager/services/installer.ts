import crypto from 'crypto';
import type { Images } from '../../../../generated/prisma/client';
import { ModrinthClient } from './modrinth-client';
import { PluginDaemonClient } from './daemon-client';
import { DependencyResolver } from './dependency-resolver';
import { CompatibilityChecker } from './compatibility-checker';
import { PluginBackupService } from './backup-service';
import { pluginProgressTracker } from './progress-tracker';
import { PLUGIN_MANAGER_CONFIG } from '../config';
import { sanitizeFilename } from '../utils/validation';
import { ResolvedDependency } from './dependency-resolver';
import { PLUGIN_SERVER_LOADERS } from '../../../../handlers/utils/server/pluginServer';

interface ServerRecord {
  UUID: string;
  Variables: string | null;
  image: Images;
  node: {
    address: string;
    port: number;
    key: string;
  };
}

export class PluginInstaller {
  constructor(
    private readonly prisma: { $executeRaw: Function },
    private readonly modrinthClient: ModrinthClient,
    private readonly daemon: PluginDaemonClient,
    private readonly dependencyResolver: DependencyResolver,
    private readonly compatibilityChecker: CompatibilityChecker,
    private readonly backupService: PluginBackupService,
    private readonly logger: { error: (message: string, ...args: unknown[]) => void },
  ) {}

  createOperationId(projectId: string): string {
    return `${projectId}-${crypto.randomBytes(4).toString('hex')}`;
  }

  async installFromModrinth(
    server: ServerRecord,
    projectId: string,
    versionId: string,
    operationId: string,
    options: {
      force?: boolean;
      isAdmin: boolean;
      installDependencies?: boolean;
      dependencyIds?: string[];
    },
  ): Promise<void> {
    try {
      pluginProgressTracker.initialize(server.UUID, operationId, projectId, '');

      const [project, version] = await Promise.all([
        this.modrinthClient.getProject(projectId),
        this.modrinthClient.getVersion(versionId),
      ]);

      const loaderNames = PLUGIN_SERVER_LOADERS as readonly string[];
      const isPluginVersion = version.loaders.some(l => loaderNames.includes(l.toLowerCase()));
      if (!isPluginVersion) {
        const supported = Array.from(loaderNames).map(l => l.charAt(0).toUpperCase() + l.slice(1)).join(', ');
        throw new Error(`Selected version does not support any known server loader (${supported}).`);
      }

      pluginProgressTracker.initialize(server.UUID, operationId, projectId, project.title);

      const compatibility = this.compatibilityChecker.check(server.image, server.Variables, version, options.isAdmin);
      if (!compatibility.compatible && !(options.force && options.isAdmin)) {
        throw new Error(compatibility.errors.join(' '));
      }
      for (const warning of compatibility.warnings) {
        pluginProgressTracker.addWarning(server.UUID, operationId, warning);
      }

      const primaryFile = version.files.find((file) => file.primary) || version.files[0];
      if (!primaryFile) throw new Error('No downloadable files found for this plugin version.');

      const dependencies = options.installDependencies
        ? await this.dependencyResolver.resolve(version, compatibility.minecraftVersion, compatibility.loader)
        : [];

      const selectedDependencies = dependencies.filter((dependency) =>
        dependency.required || options.dependencyIds?.includes(dependency.projectId),
      );

      for (const dependency of selectedDependencies) {
        await this.installResolvedDependency(server, dependency, operationId);
      }

      await this.installPrimaryFile(server, project.id, project.title, version.id, version.version_number, primaryFile.filename, primaryFile.url, primaryFile.hashes?.sha1, primaryFile.size, operationId);
      pluginProgressTracker.complete(server.UUID, operationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Installation failed';
      pluginProgressTracker.fail(server.UUID, operationId, message);
      this.logger.error(`Plugin install failed for ${projectId}:`, message);
      throw error;
    }
  }

  async uploadJar(
    server: ServerRecord,
    filename: string,
    buffer: Buffer,
    operationId: string,
  ): Promise<void> {
    pluginProgressTracker.initialize(server.UUID, operationId, 'upload', filename);

    try {
      if (!this.daemon.isValidJar(buffer)) {
        throw new Error('Uploaded file is not a valid JAR archive.');
      }

      const sanitized = sanitizeFilename(filename);
      if (!sanitized.toLowerCase().endsWith('.jar')) {
        throw new Error('Only .jar plugin files are supported.');
      }

      pluginProgressTracker.updateStage(server.UUID, operationId, 'validating', 'Validating uploaded plugin...');
      await this.daemon.createDirectory(server, PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY);

      const targetPath = `${PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY}/${sanitized}`;
      try {
        await this.backupService.backupPluginFile(server, sanitized, 'upload');
      } catch {
        pluginProgressTracker.addWarning(server.UUID, operationId, 'Could not create backup before upload.');
      }

      pluginProgressTracker.updateStage(server.UUID, operationId, 'installing', 'Uploading plugin...');
      await this.daemon.uploadFile(server, PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY, sanitized, buffer);

      await this.recordInstallation(server.UUID, null, sanitized.replace(/\.jar$/i, ''), null, null, sanitized, buffer.length, null);
      pluginProgressTracker.complete(server.UUID, operationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      pluginProgressTracker.fail(server.UUID, operationId, message);
      throw error;
    }
  }

  async deletePlugin(server: ServerRecord, filename: string): Promise<void> {
    const sanitized = sanitizeFilename(filename);
    try {
      await this.backupService.backupPluginFile(server, sanitized.replace(/\.disabled$/i, ''), 'delete');
    } catch {
      // Continue even if backup fails; deletion is still requested.
    }

    await this.daemon.deletePath(server, `${PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY}/${sanitized}`);
    await this.prisma.$executeRaw`
      UPDATE PluginManagerInstallation
      SET status = 'removed', updatedAt = datetime('now')
      WHERE serverId = ${server.UUID} AND filename = ${sanitized.replace(/\.disabled$/i, '')}
    `;
  }

  async togglePlugin(server: ServerRecord, filename: string, enabled: boolean): Promise<string> {
    const sanitized = sanitizeFilename(filename);
    const baseName = sanitized.replace(/\.disabled$/i, '');
    const fromPath = `${PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY}/${sanitized}`;
    const toName = enabled ? `${baseName}.jar` : `${baseName}.jar.disabled`;
    const toPath = `${PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY}/${toName}`;

    await this.daemon.renamePath(server, fromPath, toPath);
    await this.prisma.$executeRaw`
      UPDATE PluginManagerInstallation
      SET enabled = ${enabled ? 1 : 0}, filename = ${toName}, updatedAt = datetime('now')
      WHERE serverId = ${server.UUID} AND filename IN (${sanitized}, ${baseName}, ${`${baseName}.jar`}, ${`${baseName}.jar.disabled`})
    `;

    return toName;
  }

  private async installResolvedDependency(
    server: ServerRecord,
    dependency: ResolvedDependency,
    operationId: string,
  ): Promise<void> {
    pluginProgressTracker.addWarning(
      server.UUID,
      operationId,
      `Installing dependency: ${dependency.projectName}`,
    );
    await this.installPrimaryFile(
      server,
      dependency.projectId,
      dependency.projectName,
      dependency.versionId,
      dependency.versionNumber,
      dependency.filename,
      dependency.downloadUrl,
      undefined,
      undefined,
      operationId,
    );
  }

  private async installPrimaryFile(
    server: ServerRecord,
    projectId: string | null,
    projectName: string,
    versionId: string | null,
    versionNumber: string | null,
    filename: string,
    downloadUrl: string,
    expectedHash: string | undefined,
    fileSize: number | undefined,
    operationId: string,
  ): Promise<void> {
    const sanitized = sanitizeFilename(filename);
    pluginProgressTracker.updateStage(server.UUID, operationId, 'downloading', `Downloading ${sanitized}...`);

    try {
      await this.backupService.backupPluginFile(server, sanitized, 'replace');
    } catch {
      pluginProgressTracker.addWarning(server.UUID, operationId, `No existing backup created for ${sanitized}.`);
    }

    const buffer = await this.daemon.downloadFile(downloadUrl, sanitized, expectedHash);
    pluginProgressTracker.updateStage(server.UUID, operationId, 'validating', 'Validating plugin archive...');

    if (!this.daemon.isValidJar(buffer)) {
      throw new Error(`Downloaded file ${sanitized} is not a valid JAR archive.`);
    }

    pluginProgressTracker.updateStage(server.UUID, operationId, 'installing', 'Installing plugin on server...');
    await this.daemon.createDirectory(server, PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY);
    await this.daemon.uploadFile(server, PLUGIN_MANAGER_CONFIG.PLUGINS_DIRECTORY, sanitized, buffer);

    pluginProgressTracker.updateStage(server.UUID, operationId, 'moving', 'Finalizing installation...');
    await this.recordInstallation(
      server.UUID,
      projectId,
      projectName,
      versionId,
      versionNumber,
      sanitized,
      fileSize ?? buffer.length,
      null,
    );
  }

  private async recordInstallation(
    serverId: string,
    projectId: string | null,
    projectName: string,
    versionId: string | null,
    versionNumber: string | null,
    filename: string,
    fileSize: number,
    author: string | null,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO PluginManagerInstallation (
        serverId, projectId, projectName, versionId, versionNumber, filename, fileSize, author, status, enabled
      ) VALUES (
        ${serverId}, ${projectId}, ${projectName}, ${versionId}, ${versionNumber}, ${filename}, ${fileSize}, ${author}, 'completed', 1
      )
    `;
  }
}
