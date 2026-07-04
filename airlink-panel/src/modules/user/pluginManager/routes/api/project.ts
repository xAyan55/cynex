import { Router, Request, Response } from 'express';
import { ModrinthClient } from '../../services/modrinth-client';
import { validateProjectId } from '../../utils/validation';

export function createProjectRoutes(modrinthClient: ModrinthClient): Router {
  const router = Router({ mergeParams: true });

  router.get('/:projectId', async (req: Request, res: Response) => {
    console.log('[PM ROUTE] GET /:projectId called. params:', req.params, 'originalUrl:', req.originalUrl);
    try {
      const validation = validateProjectId(String(req.params.projectId));
      console.log('[PM ROUTE] validation:', validation);
      if (!validation.valid) {
        res.status(400).json({ success: false, error: validation.error });
        return;
      }

      const projectId = String(req.params.projectId);
      console.log('[PM ROUTE] fetching project:', projectId);
      const [project, versions] = await Promise.all([
        modrinthClient.getProject(projectId),
        modrinthClient.getProjectVersions(projectId),
      ]);
      console.log('[PM ROUTE] got project:', project?.title, 'versions:', versions?.length);

      res.json({ success: true, data: { project, versions } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load project';
      console.error('[PM ROUTE] error:', message);
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
