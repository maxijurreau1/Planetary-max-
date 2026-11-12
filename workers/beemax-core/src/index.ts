import { NodeRegistryDO } from './registryDo';
import { verifyQALRequestDO, type NodeRegistryNamespace } from './verifier';

export { NodeRegistryDO };

interface Env {
  NODE_REGISTRY: NodeRegistryNamespace;
  OPERATOR_ADMIN_TOKEN?: string;
  REGISTRY_INTERNAL_TOKEN?: string;
}

function safeTokenEqual(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(actual);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function isOperatorAuthorized(request: Request, env: Env): boolean {
  const token = request.headers.get('Authorization');
  return safeTokenEqual(token, env.OPERATOR_ADMIN_TOKEN ? `Bearer ${env.OPERATOR_ADMIN_TOKEN}` : undefined);
}

function internalRequest(request: Request, env: Env, path: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${env.REGISTRY_INTERNAL_TOKEN ?? ''}`);
  const url = new URL(request.url);
  url.hostname = 'registry';
  url.pathname = path;
  return new Request(url, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/registry/rotate' && request.method === 'POST') {
      if (!isOperatorAuthorized(request, env)) {
        return Response.json({ error: 'Unauthorized operator rotation attempt' }, { status: 401 });
      }
      if (!env.REGISTRY_INTERNAL_TOKEN) {
        return Response.json({ error: 'Registry internal authentication is not configured' }, { status: 503 });
      }
      const id = env.NODE_REGISTRY.idFromName('global-node-registry');
      return env.NODE_REGISTRY.get(id).fetch(internalRequest(request, env, '/registry/rotate'));
    }

    // Administrative listing and per-node metadata are both operator-only.
    if ((url.pathname === '/registry/nodes' || /^\/registry\/nodes\/[^/]+$/.test(url.pathname)) && request.method === 'GET') {
      if (!isOperatorAuthorized(request, env)) {
        return Response.json({ error: 'Unauthorized administrative access' }, { status: 401 });
      }
      if (!env.REGISTRY_INTERNAL_TOKEN) {
        return Response.json({ error: 'Registry internal authentication is not configured' }, { status: 503 });
      }
      const id = env.NODE_REGISTRY.idFromName('global-node-registry');
      const path = `${url.pathname}${url.search}`;
      return env.NODE_REGISTRY.get(id).fetch(internalRequest(request, env, path));
    }

    if (url.pathname.startsWith('/api/secure/')) {
      const verification = await verifyQALRequestDO(request, env.NODE_REGISTRY, env.REGISTRY_INTERNAL_TOKEN ?? '');
      if (!verification.valid) {
        return Response.json({ error: verification.error }, { status: 401 });
      }
      if (url.pathname === '/api/secure/identity' && request.method === 'GET') {
        return Response.json({ authenticated: true, nodeId: verification.nodeId });
      }
      return Response.json({ error: 'Protected route not implemented' }, { status: 404 });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
