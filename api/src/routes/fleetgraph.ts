import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

export async function proxyToFleetGraph(req: Request, res: Response): Promise<void> {
  const serviceUrl = process.env.FLEETGRAPH_SERVICE_URL;
  const token = process.env.FLEETGRAPH_API_TOKEN;

  if (!serviceUrl || !token) {
    res.status(503).json({ error: 'FleetGraph not configured' });
    return;
  }

  // M2: Strip trailing slash to prevent double-slash URLs
  const baseUrl = serviceUrl.replace(/\/+$/, '');

  // M1: For GET requests, append workspaceId as query parameter
  let targetUrl = `${baseUrl}${req.originalUrl}`;
  if (req.method === 'GET' && req.workspaceId) {
    const separator = targetUrl.includes('?') ? '&' : '?';
    targetUrl += `${separator}workspaceId=${encodeURIComponent(req.workspaceId)}`;
  }

  const body = req.method !== 'GET' ? JSON.stringify({
    ...req.body,
    workspaceId: req.workspaceId || req.body.workspaceId,
  }) : undefined;

  // M3: Only set Content-Type when there's a body
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    });

    // H2/L2: Read as text first, then try JSON — forward non-JSON responses faithfully
    const responseText = await response.text();
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        const data = JSON.parse(responseText);
        res.status(response.status).json(data);
      } catch {
        res.status(response.status).type('text').send(responseText);
      }
    } else {
      res.status(response.status).type(contentType || 'text/plain').send(responseText);
    }
  } catch (err) {
    console.error(`[fleetgraph-proxy] ${req.method} ${targetUrl} failed:`, err);
    res.status(502).json({ error: 'FleetGraph service unavailable' });
  }
}

// All routes require authentication — unauthenticated requests never reach FleetGraph
router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  await proxyToFleetGraph(req, res);
});

router.post('/resume', authMiddleware, async (req: Request, res: Response) => {
  await proxyToFleetGraph(req, res);
});

router.get('/findings', authMiddleware, async (req: Request, res: Response) => {
  await proxyToFleetGraph(req, res);
});

router.post('/analyze', authMiddleware, async (req: Request, res: Response) => {
  await proxyToFleetGraph(req, res);
});

export default router;
