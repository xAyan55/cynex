import { Router, Request, Response } from 'express';
import { ModrinthClient } from '../../services/modrinth-client';
import { validateProjectId } from '../../utils/validation';
import { loadPluginServerContext } from '../../utils/context';
import {
  detectServerSoftware,
  getLoaderGroup,
  filterVersionsByGroup,
  sortVersions,
  debugVersion,
} from '../../services/compatibility-service';

export function createProjectRoutes(modrinthClient: ModrinthClient): Router {
  const router = Router({ mergeParams: true });

  router.get('/:projectId', async (req: Request, res: Response) => {
    try {
      const validation = validateProjectId(String(req.params.projectId));
      if (!validation.valid) {
        res.status(400).json({ success: false, error: validation.error });
        return;
      }

      const context = await loadPluginServerContext(req, req.params.id);
      if (context.status !== 'ready') {
        res.status(context.status === 'unsupported' ? 403 : 404).json({ success: false, error: context.message });
        return;
      }

      const projectId = String(req.params.projectId);
      const [project, rawVersions] = await Promise.all([
        modrinthClient.getProject(projectId),
        modrinthClient.getProjectVersions(projectId),
      ]);

      const serverLoader = detectServerSoftware(context.server.image);
      const serverGroup = getLoaderGroup(serverLoader);

      const filtered = filterVersionsByGroup(rawVersions, serverLoader);
      const versions = sortVersions(filtered);

      for (const v of rawVersions) {
        const info = debugVersion(v, serverLoader, null);
        console.log(
          `[COMPAT] v${info.versionNumber} (${info.versionName}) | ` +
          `loader=${info.loaders.join(',')} | ` +
          `group=${info.serverLoaderGroup} | ` +
          `accepted=${info.loaderAccepted} | ` +
          `reason=${info.loaderReason}`
        );
      }

      console.log(
        `[COMPAT] ${project.title}: ${rawVersions.length} total → ${filtered.length} after group filter (${serverGroup || 'N/A'} group)`
      );

      res.json({ success: true, data: { project, versions } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load project';
      res.status(502).json({ success: false, error: message });
    }
  });

  router.get('/:projectId/version/:versionId', async (req: Request, res: Response) => {
    try {
      const version = await modrinthClient.getVersion(String(req.params.versionId));
      res.json({ success: true, data: version });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load version';
      res.status(502).json({ success: false, error: message });
    }
  });

  return router;
}
