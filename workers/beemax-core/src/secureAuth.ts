export interface AuthEnv {
  SESSION_KV: KVNamespace;
  JWT_SECRET: string;
}

export interface SessionVerificationResult {
  authorized: boolean;
  userId?: string;
}

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
  [key: string]: unknown;
}

interface JwtPayload {
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  jti?: unknown;
  [key: string]: unknown;
}

function extractCookie(cookieHeader: string, name: string): string | null {
  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJsonPart<T>(value: string): T | null {
  const bytes = decodeBase64Url(value);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as T;
  } catch {
    return null;
  }
}

/**
 * Verifies an HS256 user-session JWT and checks its revocation marker in KV.
 * The JWT must include sub, exp, and jti claims. Missing configuration,
 * invalid claims/signature, KV errors, and revoked sessions all fail closed.
 */
export async function verifyRealUserSession(request: Request, env: AuthEnv): Promise<SessionVerificationResult> {
  try {
    if (!env.JWT_SECRET || !env.SESSION_KV) return { authorized: false };
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return { authorized: false };

    const token = extractCookie(cookieHeader, 'beemax_auth_session');
    if (!token || token.length > 8192) return { authorized: false };
    const parts = token.split('.');
    if (parts.length !== 3) return { authorized: false };
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = decodeJsonPart<JwtHeader>(encodedHeader);
    const payload = decodeJsonPart<JwtPayload>(encodedPayload);
    const signature = decodeBase64Url(encodedSignature);
    if (!header || !payload || !signature || header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT')) {
      return { authorized: false };
    }
    if (Object.hasOwn(header, 'crit') || Object.hasOwn(header, 'b64')) return { authorized: false };

    const userId = payload.sub;
    const tokenId = payload.jti;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      typeof userId !== 'string' || userId.length < 1 || userId.length > 256 ||
      typeof tokenId !== 'string' || tokenId.length < 1 || tokenId.length > 256 ||
      typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp) || payload.exp <= nowSeconds ||
      (payload.iat !== undefined && (typeof payload.iat !== 'number' || !Number.isSafeInteger(payload.iat) || payload.iat > nowSeconds + 60)) ||
      (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || !Number.isSafeInteger(payload.nbf) || payload.nbf > nowSeconds))
    ) {
      return { authorized: false };
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
    if (!validSignature) return { authorized: false };

    const revoked = await env.SESSION_KV.get(`session:active:${userId}:${tokenId}`);
    if (revoked === 'revoked') return { authorized: false };
    return { authorized: true, userId };
  } catch {
    // Never log cookies, JWTs, or signature material.
    return { authorized: false };
  }
}

/**
 * Returns true only for active users with an operator/admin ACL entry for an
 * existing node. Database errors and missing rows fail closed.
 */
export async function checkUserNodeAuthorization(db: D1Database, userId: string, nodeId: string): Promise<boolean> {
  try {
    if (!userId || !nodeId) return false;
    const result = await db.prepare(`
      SELECT 1
      FROM users AS u
      INNER JOIN user_node_permissions AS p ON p.user_id = u.id
      INNER JOIN nodes AS n ON n.id = p.node_id
      WHERE u.id = ?
        AND n.id = ?
        AND u.status = 'active'
        AND p.role IN ('operator', 'admin')
      LIMIT 1
    `).bind(userId, nodeId).first<{ 1: number }>();
    return result !== null;
  } catch {
    // Fail closed without logging identifiers or credentials.
    return false;
  }
}
