import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { verifyQALRequestSignature } from './qal';

// Keep the Durable Object classes exported from the deployed Worker entry point.
// Cloudflare requires this when publishing a new version of a Worker that owns
// existing Durable Objects.
export { NodeRegistryDO } from '../workers/beemax-core/src/registryDo';
export { BEEMAXSecureNodeRegistryDO } from '../workers/beemax-core/src/secureRegistryDo';

type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_KV: KVNamespace;
  QAL_SECRET?: string;
};

type Variables = {
  qalNodeId: string;
};

type UserRecord = { id: string; username: string; password_hash: string };
type SessionUser = { id: string; username: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_ITERATIONS = 100_000;
const SESSION_COOKIE = 'session_id';

app.use('/api/*', cors({
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-QAL-Signature', 'X-Node-ID', 'X-QAL-Timestamp'],
}));

function base64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${base64(salt)}$${base64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 500_000) return false;
  try {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ bits[index];
    return difference === 0;
  } catch {
    return false;
  }
}

function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function startSession(c: Parameters<typeof app.get>[1] extends never ? never : any, user: SessionUser) {
  const sessionId = newSessionId();
  await c.env.SESSION_KV.put(sessionId, JSON.stringify({ id: user.id }), { expirationTtl: SESSION_TTL_SECONDS });
  c.header('Set-Cookie', sessionCookie(sessionId, SESSION_TTL_SECONDS));
  return c.json({ success: true, user });
}

async function getSessionUser(c: any): Promise<SessionUser | null> {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([A-Za-z0-9_-]{20,128})(?:;|$)/);
  if (!match) return null;
  const sessionData = await c.env.SESSION_KV.get(match[1]);
  if (!sessionData) return null;
  try {
    const parsed = JSON.parse(sessionData) as { id?: unknown };
    if (typeof parsed.id !== 'string') return null;
    const user = await c.env.DB.prepare(
      "SELECT id, username FROM users WHERE id = ? AND status = 'active'"
    ).bind(parsed.id).first<SessionUser>();
    return user ?? null;
  } catch {
    return null;
  }
}

app.get('/api/artworks', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT a.id, a.artist_id, a.title, a.medium, a.dimensions, a.price_cents, a.image_url, a.status,
              u.username AS artist_name, p.bio, p.portfolio_url
       FROM artworks a
       JOIN users u ON u.id = a.artist_id AND u.status = 'active'
       LEFT JOIN artist_profiles p ON p.user_id = a.artist_id
       ORDER BY a.created_at DESC`
    ).all();
    return c.json({ artworks: results ?? [] });
  } catch (error) {
    console.error('Failed to retrieve artwork inventory:', error);
    return c.json({ error: 'Failed to retrieve artwork inventory' }, 500);
  }
});

app.get('/api/artists/:artistId', async (c) => {
  try {
    const artistId = c.req.param('artistId');
    const artist = await c.env.DB.prepare(
      `SELECT u.id, u.username AS artist_name, ap.bio, ap.portfolio_url, ap.verified_status
       FROM users u LEFT JOIN artist_profiles ap ON ap.user_id = u.id
       WHERE u.id = ? AND u.status = 'active'`
    ).bind(artistId).first();
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    const works = await c.env.DB.prepare(
      `SELECT id, artist_id, title, medium, dimensions, price_cents, image_url, status, created_at
       FROM artworks WHERE artist_id = ? ORDER BY created_at DESC`
    ).bind(artistId).all();
    return c.json({ artist, artworks: works.results ?? [] });
  } catch (error) {
    console.error('Failed to retrieve artist profile:', error);
    return c.json({ error: 'Failed to retrieve artist profile' }, 500);
  }
});

app.post('/api/auth/register', async (c) => {
  let body: { username?: unknown; password?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request body' }, 400); }
  if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_]{3,32}$/.test(body.username) ||
      typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) {
    return c.json({ error: 'Choose a 3–32 character username and a password of at least 12 characters.' }, 400);
  }

  const user: SessionUser = { id: `user_${crypto.randomUUID()}`, username: body.username };
  try {
    const passwordHash = await hashPassword(body.password);
    await c.env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, role, status) VALUES (?, ?, ?, 'user', 'active')"
    ).bind(user.id, user.username, passwordHash).run();
    return startSession(c, user);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return c.json({ error: 'That username is already in use.' }, 409);
    console.error('Failed to create user account:', error);
    return c.json({ error: 'Unable to create account right now.' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  let body: { username?: unknown; password?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid credentials' }, 401); }
  if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 128) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  const user = await c.env.DB.prepare(
    "SELECT id, username, password_hash FROM users WHERE username = ? AND status = 'active'"
  ).bind(body.username).first<UserRecord>();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  return startSession(c, { id: user.id, username: user.username });
});

app.get('/api/auth/session', async (c) => {
  const user = await getSessionUser(c);
  return c.json({ authenticated: Boolean(user), user });
});

app.post('/api/auth/logout', async (c) => {
  const cookie = c.req.header('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session_id=([A-Za-z0-9_-]{20,128})(?:;|$)/);
  if (match) await c.env.SESSION_KV.delete(match[1]);
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ success: true });
});

app.post('/api/marketplace/orders', async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: 'Sign in to reserve this artwork.' }, 401);

  let body: { artwork_id?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request body' }, 400); }
  if (typeof body.artwork_id !== 'string' || body.artwork_id.length < 1 || body.artwork_id.length > 128) {
    return c.json({ error: 'A valid artwork_id is required.' }, 400);
  }

  const orderId = `order_${crypto.randomUUID()}`;
  try {
    // D1 batch executes these statements transactionally. The order is inserted only
    // when the conditional inventory update reserved an available artwork.
    const results = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE artworks SET status = 'reserved' WHERE id = ? AND status = 'available'").bind(body.artwork_id),
      c.env.DB.prepare(
        `INSERT INTO marketplace_orders (id, artwork_id, buyer_id, amount_cents, payment_status)
         SELECT ?, id, ?, price_cents, 'pending' FROM artworks
         WHERE id = ? AND status = 'reserved' AND changes() = 1`
      ).bind(orderId, user.id, body.artwork_id),
    ]);
    if (!results[0]?.meta?.changes) return c.json({ error: 'Artwork is no longer available.' }, 409);
    if (!results[1]?.meta?.changes) {
      console.error('Artwork reservation did not create an order', { artworkId: body.artwork_id });
      return c.json({ error: 'Unable to create reservation.' }, 500);
    }
    return c.json({ success: true, order_id: orderId, payment_status: 'pending' }, 201);
  } catch (error) {
    console.error('Failed to reserve artwork:', error);
    return c.json({ error: 'Unable to create reservation right now.' }, 500);
  }
});

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
