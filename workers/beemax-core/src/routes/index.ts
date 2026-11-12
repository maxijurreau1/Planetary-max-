import { verifyRealUserSession, checkUserNodeAuthorization } from '../secureAuth';

export interface Env {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  ALLOWED_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    };

    try {
      if (request.method === 'POST' && url.pathname === '/api/v1/auth/register') {
        const { handleRegister } = await import('./register');
        return handleRegister(request, env);
      }

      if (request.method === 'POST' && url.pathname === '/api/v1/auth/login') {
        const { handleLogin } = await import('./login');
        return handleLogin(request, env);
      }

      if (request.method === 'POST' && url.pathname === '/api/v1/auth/logout') {
        const { handleLogout } = await import('./logout');
        return handleLogout(request, env);
      }

      const nodeMatch = url.pathname.match(/^\/api\/v1\/nodes\/([^\/]+)$/);
      if (nodeMatch) {
        const targetNodeId = nodeMatch[1];
        const auth = await verifyRealUserSession(request, env);

        if (!auth.authorized || !auth.userId) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        if (auth.role !== 'operator') {
          const permission = await checkUserNodeAuthorization(env.DB, auth.userId, targetNodeId);
          if (!permission) {
            return Response.json({ error: 'Access Denied' }, { status: 403, headers: corsHeaders });
          }
        }

        return Response.json({
          success: true,
          message: `Authorized access to edge node ${targetNodeId}`,
          user: { id: auth.userId, role: auth.role ?? 'user' },
        }, { status: 200, headers: corsHeaders });
      }

      return Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders });
    } catch {
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
  },
};






































































