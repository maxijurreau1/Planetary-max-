import { EdgeJWTGenerator } from '../utils/jwt';

export type AuthEnv = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  ALLOWED_ORIGIN: string;
};

type DbUser = {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  status: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return new Uint8Array(bits);
}

async function hashPassword(password: string, iterations = 200_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePbkdf2(password, salt, iterations);
  return `pbkdf2_sha256$${iterations}$${base64UrlEncode(salt)}$${base64UrlEncode(digest)}`;
}

async function verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
  const match = storedHash.match(/^pbkdf2_sha256\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/);
  if (!match) return false;

  const [, iterationsRaw, saltB64, expectedB64] = match;
  const iterations = Number(iterationsRaw);
  const salt = Uint8Array.from(
    atob((saltB64 + '='.repeat((4 - (saltB64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')),
    (char) => char.charCodeAt(0)
  );

  const digest = await derivePbkdf2(password, salt, iterations);
  return base64UrlEncode(digest) === expectedB64;
}

export async function handleRegister(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await request.json() as { username?: string; password?: string; role?: string };
    const username = body.username?.trim();
    const password = body.password;
    const role = body.role ?? 'user';

    if (!username || !password || username.length < 3 || password.length < 8) {
      return Response.json({ error: 'Invalid username or password' }, { status: 400 });
    }

    if (!['user', 'operator', 'admin', 'auditor', 'node-agent'].includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }

    const existing = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
    if (existing) {
      return Response.json({ error: 'User already exists' }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await env.DB.prepare(`
      INSERT INTO users (id, username, password_hash, role, status)
      VALUES (?, ?, ?, ?, 'active')
    `).bind(userId, username, passwordHash, role).run();

    return Response.json({
      success: true,
      user: { id: userId, username, role },
    }, { status: 201 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function handleLogin(request: Request, env: AuthEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await request.json() as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return Response.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const user = await env.DB.prepare(
      'SELECT id, username, password_hash, role, status FROM users WHERE username = ?'
    ).bind(username).first<DbUser>();

    if (!user || user.status !== 'active') {
      return Response.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const passwordValid = await verifyPasswordHash(password, user.password_hash);
    if (!passwordValid) {
      return Response.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const generator = new EdgeJWTGenerator(env.JWT_SECRET, env.JWT_ISSUER, env.JWT_AUDIENCE);
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();
    const ttlSeconds = 24 * 60 * 60;

    const token = await generator.generate(
      {
        sub: user.id,
        role: user.role,
        jti,
        nbf: now - 30,
      },
      ttlSeconds
    );

    await env.SESSION_KV.put(`session:active:${user.id}:${jti}`, 'active', {
      expirationTtl: ttlSeconds,
    });

    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': `beemax_auth_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ttlSeconds}`,
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
          'Access-Control-Allow-Credentials': 'true',
          'Vary': 'Origin',
        },
      }
    );
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function handleLogout(request: Request, env: Pick<AuthEnv, 'SESSION_KV'>): Promise<Response> {
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const match = cookieHeader.match(/beemax_auth_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : null;

  if (token) {
    try {
      const payloadPart = token.split('.')[1];
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      if (payload.sub && payload.jti) {
        await env.SESSION_KV.delete(`session:active:${payload.sub}:${payload.jti}`);
      }
    } catch {
      // fail closed: never expose token or cookie details to callers
    }
  }

  return Response.json(
    { success: true },
    {
      status: 200,
      headers: {
        'Set-Cookie': 'beemax_auth_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
      },
    }
  );
}

export { hashPassword, verifyPasswordHash };


































































































































































































































































