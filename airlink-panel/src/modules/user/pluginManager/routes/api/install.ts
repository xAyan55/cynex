import { Router, Request, Response } from 'express';
import { PluginInstaller } from '../../services/installer';
import { ModrinthClient } from '../../services/modrinth-client';
import { CompatibilityChecker } from '../../services/compatibility-checker';
import { DependencyResolver } from '../../services/dependency-resolver';
import { pluginProgressTracker } from '../../services/progress-tracker';
import { validateProjectId, validateVersionId } from '../../utils/validation';
import { loadPluginServerContext } from '../../utils/context';

export function createInstallRoutes(
  installer: PluginInstaller,
  modrinthClient: ModrinthClient,
  compatibilityChecker: CompatibilityChecker,
  dependencyResolver: DependencyResolver,
): Router {
  const router = Router({ mergeParams: true });
  const activeInstallations = new Map<string, boolean>();

  router.post('/check', async (req: Request, res: Response) => {
    try {
      const context = await loadPluginServerContext(req, req.params.id);
      if (context.status !== 'ready') {
        res.status(context.status === 'unsupported' ? 403 : 404).json({ success: false, error: context.message });
        return;
      }

      const version = await modrinthClient.getVersion(req.body.versionId);
      const compatibility = compatibilityChecker.check(
        context.server.image,
        context.server.Variables,
        version,
        Boolean(req.session?.user?.isAdmin),
      );
      const dependencies = await dependencyResolver.resolve(
        version,
        compatibility.minecraftVersion,
        compatibility.loader,
      );

      res.json({ success: true, data: { compatibility, dependencies } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compatibility check failed';
      res.status(400).json({ success: false, error: message });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const projectValidation = validateProjectId(req.body.projectId);
      const versionValidation = validateVersionId(req.body.versionId);
      if (!projectValidation.valid || !versionValidation.valid) {
        res.status(400).json({
          success: false,
          error: projectValidation.error || versionValidation.error,
        });
        return;
      }

      const context = await loadPluginServerContext(req, req.params.id);
      if (context.status !== 'ready') {
        res.status(context.status === 'unsupported' ? 403 : 404).json({ success: false, error: context.message });
        return;
      }

      const operationId = installer.createOperationId(req.body.projectId);
      const installKey = `${req.params.id}:${operationId}`;
      if (activeInstallations.has(installKey)) {
        res.status(409).json({ success: false, error: 'Installation already in progress' });
        return;
      }

      activeInstallations.set(installKey, true);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const sendEvent = (data: Record<string, unknown>) => {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Client disconnected.
        }
      };

      sendEvent({ type: 'started', operationId, message: 'Starting installation...' });

      const unsubscribe = pluginProgressTracker.subscribe(
        String(req.params.id),
        operationId,
        (progress) => {
          sendEvent({ type: 'progress', ...pluginProgressTracker.serialize(progress) });
        },
      );

      const cleanup = () => {
        unsubscribe();
        activeInstallations.delete(installKey);
        try {
          res.end();
        } catch {
          // Client disconnected.
        }
      };

      req.on('close', () => {
        activeInstallations.delete(installKey);
        unsubscribe();
      });

      installer.installFromModrinth(
        context.server,
        req.body.projectId,
        req.body.versionId,
        operationId,
        {
          force: Boolean(req.body.force),
          isAdmin: Boolean(req.session?.user?.isAdmin),
          installDependencies: Boolean(req.body.installDependencies),
          dependencyIds: Array.isArray(req.body.dependencyIds) ? req.body.dependencyIds : [],
        },
      )
        .then(() => {
          sendEvent({ type: 'complete', operationId, message: 'Installation completed successfully' });
          cleanup();
        })
        .catch((error: Error) => {
          sendEvent({ type: 'error', operationId, message: error.message || 'Installation failed' });
          cleanup();
        });
    } catch (error) {
      if (!res.headersSent) {
        const message = error instanceof Error ? error.message : 'Failed to start installation';
        res.status(500).json({ success: false, error: message });
      }
    }
  });

  return router;
}
