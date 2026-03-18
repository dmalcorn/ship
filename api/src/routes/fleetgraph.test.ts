import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Router, Request, Response } from 'express';
import { proxyToFleetGraph } from './fleetgraph.js';

// H1 fix: Tests now use the REAL proxyToFleetGraph from the production module.
// We skip authMiddleware (covered by Ship's existing auth tests) but test the actual proxy logic.

function createTestApp(envOverrides: Record<string, string | undefined> = {}) {
  // Set env vars before creating app so proxyToFleetGraph reads them
  const originalEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(envOverrides)) {
    originalEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const app = express();
  app.use(express.json());

  const router = Router();

  // Simulate authMiddleware injecting workspaceId
  router.use((req: Request, _res: Response, next) => {
    (req as any).workspaceId = 'test-workspace-id';
    next();
  });

  router.post('/chat', async (req, res) => proxyToFleetGraph(req, res));
  router.post('/resume', async (req, res) => proxyToFleetGraph(req, res));
  router.get('/findings', async (req, res) => proxyToFleetGraph(req, res));
  router.post('/analyze', async (req, res) => proxyToFleetGraph(req, res));

  app.use('/api/fleetgraph', router);

  // Return cleanup function to restore env
  const cleanup = () => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  return { app, cleanup };
}

describe('FleetGraph Proxy', () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof vi.fn> & typeof fetch;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockFetch = vi.fn() as any;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup?.();
    cleanup = undefined;
  });

  describe('when FleetGraph env vars are not configured', () => {
    it('returns 503 for POST /chat', async () => {
      const result = createTestApp({ FLEETGRAPH_SERVICE_URL: undefined, FLEETGRAPH_API_TOKEN: undefined });
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({ message: 'hello' });

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'FleetGraph not configured' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns 503 when only URL is missing', async () => {
      const result = createTestApp({ FLEETGRAPH_SERVICE_URL: undefined, FLEETGRAPH_API_TOKEN: 'token' });
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({});

      expect(res.status).toBe(503);
    });

    it('returns 503 when only token is missing', async () => {
      const result = createTestApp({ FLEETGRAPH_SERVICE_URL: 'http://fg:3001', FLEETGRAPH_API_TOKEN: undefined });
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({});

      expect(res.status).toBe(503);
    });
  });

  describe('when FleetGraph is configured', () => {
    const env = {
      FLEETGRAPH_SERVICE_URL: 'http://fleetgraph:3001',
      FLEETGRAPH_API_TOKEN: 'test-bearer-token',
    };

    it('proxies POST /chat with enriched workspaceId', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ findings: [], message: 'No issues found' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({ documentId: 'doc-1', message: 'analyze this' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ findings: [], message: 'No issues found' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0] as [string, any];
      expect(url).toBe('http://fleetgraph:3001/api/fleetgraph/chat');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Authorization']).toBe('Bearer test-bearer-token');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.workspaceId).toBe('test-workspace-id');
      expect(body.documentId).toBe('doc-1');
      expect(body.message).toBe('analyze this');
    });

    it('proxies POST /resume', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ status: 'resumed' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/resume')
        .send({ threadId: 't-1', decision: 'confirm' });

      expect(res.status).toBe(200);
      const [url] = mockFetch.mock.calls[0] as [string, any];
      expect(url).toBe('http://fleetgraph:3001/api/fleetgraph/resume');
    });

    it('proxies GET /findings without body and with workspaceId query param', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ findings: [{ id: 'f1' }] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app).get('/api/fleetgraph/findings');

      expect(res.status).toBe(200);
      expect(res.body.findings).toHaveLength(1);

      const [url, opts] = mockFetch.mock.calls[0] as [string, any];
      expect(opts.method).toBe('GET');
      expect(opts.body).toBeUndefined();
      // M1: workspaceId appended as query param for GET
      expect(url).toContain('workspaceId=test-workspace-id');
      // M3: No Content-Type header on GET (no body)
      expect(opts.headers['Content-Type']).toBeUndefined();
    });

    it('proxies POST /analyze', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ runId: 'run-1' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/analyze')
        .send({});

      expect(res.status).toBe(200);
      const [url] = mockFetch.mock.calls[0] as [string, any];
      expect(url).toBe('http://fleetgraph:3001/api/fleetgraph/analyze');
    });

    it('forwards FleetGraph 4xx errors unchanged', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 422,
        text: async () => JSON.stringify({ error: 'Missing documentId' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({});

      expect(res.status).toBe(422);
      expect(res.body).toEqual({ error: 'Missing documentId' });
    });

    it('forwards FleetGraph 5xx errors unchanged', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: async () => JSON.stringify({ error: 'Internal server error' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    it('returns 502 on network error (ECONNREFUSED)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({ message: 'test' });

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: 'FleetGraph service unavailable' });
    });

    it('returns 502 on timeout', async () => {
      const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      mockFetch.mockRejectedValueOnce(timeoutError);

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({ message: 'test' });

      expect(res.status).toBe(502);
      expect(res.body).toEqual({ error: 'FleetGraph service unavailable' });
    });

    it('prefers session workspaceId over body workspaceId', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({ workspaceId: 'user-supplied-ws', message: 'test' });

      const body = JSON.parse((mockFetch.mock.calls[0] as [string, any])[1].body);
      // Session workspaceId ('test-workspace-id') takes precedence
      expect(body.workspaceId).toBe('test-workspace-id');
    });

    // H2: Non-JSON response forwarded faithfully instead of throwing
    it('forwards non-JSON error responses as text (AC4)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 502,
        text: async () => '<html><body>Bad Gateway</body></html>',
        headers: new Headers({ 'content-type': 'text/html' }),
      });

      const result = createTestApp(env);
      cleanup = result.cleanup;
      const res = await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({ message: 'test' });

      expect(res.status).toBe(502);
      expect(res.text).toContain('Bad Gateway');
    });

    // M2: Trailing slash normalization
    it('handles trailing slash in FLEETGRAPH_SERVICE_URL', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const result = createTestApp({
        FLEETGRAPH_SERVICE_URL: 'http://fleetgraph:3001/',
        FLEETGRAPH_API_TOKEN: 'test-bearer-token',
      });
      cleanup = result.cleanup;
      await request(result.app)
        .post('/api/fleetgraph/chat')
        .send({});

      const [url] = mockFetch.mock.calls[0] as [string, any];
      // No double slash
      expect(url).toBe('http://fleetgraph:3001/api/fleetgraph/chat');
    });
  });
});
