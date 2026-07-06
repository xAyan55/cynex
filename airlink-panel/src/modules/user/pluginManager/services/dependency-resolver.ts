import { ModrinthClient } from './modrinth-client';
import { ModrinthProject, ModrinthVersion } from '../types/modrinth-api';
import {
  isCompatibleLoader,
  isCompatibleMinecraftVersion,
  getGroupLoaders,
  getLoaderGroup,
} from './compatibility-service';

export interface ResolvedDependency {
  projectId: string;
  projectName: string;
  versionId: string;
  versionNumber: string;
  downloadUrl: string;
  filename: string;
  required: boolean;
}

export class DependencyResolver {
  constructor(
    private readonly client: ModrinthClient,
    private readonly logger: { warn: (message: string, ...args: unknown[]) => void },
  ) {}

  async resolve(
    version: ModrinthVersion,
    minecraftVersion: string | null,
    loader: string | null,
    visited = new Set<string>(),
  ): Promise<ResolvedDependency[]> {
    const dependencies: ResolvedDependency[] = [];

    for (const dependency of version.dependencies) {
      if (!dependency.project_id) continue;
      if (dependency.dependency_type !== 'required' && dependency.dependency_type !== 'optional') continue;
      if (visited.has(dependency.project_id)) continue;

      visited.add(dependency.project_id);

      try {
        const [project, versions] = await Promise.all([
          this.client.getProject(dependency.project_id),
          this.client.getProjectVersions(dependency.project_id),
        ]);

        const resolvedVersion = this.pickVersion(versions, dependency.version_id, minecraftVersion, loader);
        if (!resolvedVersion) continue;

        const primaryFile = resolvedVersion.files.find((file) => file.primary) || resolvedVersion.files[0];
        if (!primaryFile) continue;

        dependencies.push({
          projectId: project.id,
          projectName: project.title,
          versionId: resolvedVersion.id,
          versionNumber: resolvedVersion.version_number,
          downloadUrl: primaryFile.url,
          filename: primaryFile.filename,
          required: dependency.dependency_type === 'required',
        });

        const nested = await this.resolve(resolvedVersion, minecraftVersion, loader, visited);
        dependencies.push(...nested);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to resolve dependency ${dependency.project_id}: ${message}`);
      }
    }

    return dependencies;
  }

  private pickVersion(
    versions: ModrinthVersion[],
    explicitVersionId: string | null | undefined,
    minecraftVersion: string | null,
    loader: string | null,
  ): ModrinthVersion | null {
    if (explicitVersionId) {
      return versions.find((entry) => entry.id === explicitVersionId) ?? null;
    }

    return versions.find((entry) => {
      const matchesLoader = isCompatibleLoader(loader, entry.loaders);
      const matchesGame = isCompatibleMinecraftVersion(minecraftVersion, entry.game_versions);
      return matchesLoader && matchesGame;
    }) ?? null;
  }
}
