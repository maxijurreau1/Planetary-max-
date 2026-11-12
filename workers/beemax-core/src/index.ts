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

function internalRequest(request: Request, env: Env, path: string): Request {
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${env.REGISTRY_INTERNAL_TOKEN ?? ''}`);
  const url = new URL(request.url);
  url.hostname = 'registry';
  url.pathname = path;
  url.search = '';
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
      if (!safeTokenEqual(request.headers.get('Authorization'), env.OPERATOR_ADMIN_TOKEN ? `Bearer ${env.OPERATOR_ADMIN_TOKEN}` : undefined)) {
        return Response.json({ error: 'Unauthorized operator rotation attempt' }, { status: 401 });
      }
      if (!env.REGISTRY_INTERNAL_TOKEN) {
        return Response.json({ error: 'Registry internal authentication is not configured' }, { status: 503 });
      }
      const id = env.NODE_REGISTRY.idFromName('global-node-registry');
      return env.NODE_REGISTRY.get(id).fetch(internalRequest(request, env, '/registry/rotate'));
    }

    const metadataMatch = url.pathname.match(/^\/registry\/nodes\/([a-zA-Z0-9._:-]{1,128})$/);
    if (metadataMatch && request.method === 'GET') {
      if (!env.REGISTRY_INTERNAL_TOKEN) {
        return Response.json({ error: 'Registry internal authentication is not configured' }, { status: 503 });
      }
      const id = env.NODE_REGISTRY.idFromName('global-node-registry');
      const path = `/registry/nodes/${encodeURIComponent(metadataMatch[1])}`;
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
