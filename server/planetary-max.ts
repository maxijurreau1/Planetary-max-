import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { verifyQALRequestSignature } from './qal';

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  QAL_SECRET?: string;
};

type Variables = {
  qalNodeId: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('/api/*', cors({
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-QAL-Signature', 'X-Node-ID', 'X-QAL-Timestamp'],
}));

app.get('/api/assets', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT asset_id, creator, title, category, quantum_hash, signature, created_at FROM planetary_assets ORDER BY created_at DESC'
    ).all();
    return c.json({ success: true, assets: results });
  } catch (error) {
    console.error('Failed to fetch planetary assets:', error);
    return c.json({ success: false, error: 'Unable to load assets' }, 500);
  }
});

const requireQALAuth: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const signature = c.req.header('X-QAL-Signature');
  const nodeId = c.req.header('X-Node-ID');
  const timestamp = c.req.header('X-QAL-Timestamp');

  if (!signature || !nodeId || !timestamp || !/^\d{13}$/.test(timestamp) || !/^[a-zA-Z0-9._:-]{1,128}$/.test(nodeId)) {
    return c.json({ success: false, error: 'QAL_AUTH_FAILED: Missing or malformed authentication headers' }, 401);
  }

  const requestTime = Number(timestamp);
  if (!Number.isSafeInteger(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
    return c.json({ success: false, error: 'QAL_AUTH_FAILED: Timestamp expired' }, 401);
  }

  const secret = c.env.QAL_SECRET;
  if (!secret) {
    console.error('QAL_SECRET is not configured');
    return c.json({ success: false, error: 'QAL authentication is not configured' }, 503);
  }

  const registeredNode = await c.env.DB.prepare(
    'SELECT node_id FROM qal_nodes WHERE node_id = ?'
  ).bind(nodeId).first<{ node_id: string }>();
  if (!registeredNode) {
    return c.json({ success: false, error: 'QAL_AUTH_FAILED: Node is not registered' }, 403);
  }

  // Bind authentication to this exact HTTP method, path/query, and request body.
  const valid = await verifyQALRequestSignature(secret, c.req.raw, nodeId, timestamp, signature);
  if (!valid) {
    return c.json({ success: false, error: 'QAL_AUTH_FAILED: Invalid request signature' }, 403);
  }

  await c.env.DB.prepare(
    'UPDATE qal_nodes SET last_authenticated = ? WHERE node_id = ?'
  ).bind(Date.now(), nodeId).run();

  c.set('qalNodeId', nodeId);
  await next();
};

app.get('/api/secure/telemetry/:nodeId', requireQALAuth, async (c) => {
  const requestedNodeId = c.req.param('nodeId');
  const authenticatedNodeId = c.get('qalNodeId');

  // A registered node may only read its own telemetry through this endpoint.
  if (requestedNodeId !== authenticatedNodeId) {
    return c.json({ success: false, error: 'QAL_AUTH_FAILED: Node access denied' }, 403);
  }

  const telemetry = await c.env.DB.prepare(
    'SELECT node_id, status, mesh_region, dat_balance, last_heartbeat FROM node_telemetry WHERE node_id = ?'
  ).bind(authenticatedNodeId).first();

  return c.json({ success: true, telemetry: telemetry ?? null });
});

app.all('*', async (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
