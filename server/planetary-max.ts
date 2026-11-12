import { Hono, type Context, type MiddlewareHandler } from 'hono';
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
  PROVENANCE_SECRET?: string;
};
type Variables = { qalNodeId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
type UserRecord = { id: string; username: string; password_hash: string };
type SessionUser = { id: string; username: string };
type ArtworkRecord = { id: string; price_cents: number; total_editions: number; status: string };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const SESSION_TTL_SECONDS = 60 * 60 * 24;
const PASSWORD_ITERATIONS = 100_000;

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
  const [scheme, iterationText, saltText, hashText, ...extra] = stored.split('$');
  const iterations = Number(iterationText);
  if (scheme !== 'pbkdf2' || extra.length || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 500_000) return false;
  try {
    const salt = fromBase64(saltText);
    const expected = fromBase64(hashText);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ actual[i];
    return diff === 0;
  } catch { return false; }
}
function cookieValue(c: AppContext, name: string): string | null {
  const value = c.req.header('Cookie') || '';
  const match = value.match(new RegExp(`(?:^|;\\s*)${name}=([A-Za-z0-9_-]{20,128})(?:;|$)`));
  return match?.[1] ?? null;
}
function sessionCookie(value: string, maxAge: number): string {
  return `session_id=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
async function getSessionUser(c: AppContext): Promise<SessionUser | null> {
  const sessionId = cookieValue(c, 'session_id');
  if (!sessionId) return null;
  const raw = await c.env.SESSION_KV.get(sessionId);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { id?: unknown };
    if (typeof session.id !== 'string') return null;
    return await c.env.DB.prepare("SELECT id, username FROM users WHERE id = ? AND status = 'active'")
      .bind(session.id).first<SessionUser>();
  } catch { return null; }
}
async function createSession(c: AppContext, user: SessionUser) {
  const sessionId = base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  await c.env.SESSION_KV.put(sessionId, JSON.stringify({ id: user.id }), { expirationTtl: SESSION_TTL_SECONDS });
  c.header('Set-Cookie', sessionCookie(sessionId, SESSION_TTL_SECONDS));
  return c.json({ success: true, user });
}

app.get('/api/artworks', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT a.id, a.artist_id, a.title, a.medium, a.dimensions, a.price_cents, a.image_url,
              CASE WHEN EXISTS (SELECT 1 FROM artwork_editions e WHERE e.artwork_base_id = a.id AND e.status = 'available') THEN 'available' ELSE a.status END AS status,
              a.edition_number, a.total_editions,
              (SELECT COUNT(*) FROM artwork_editions e WHERE e.artwork_base_id = a.id AND e.status <> 'available') AS reserved_editions_count,
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

app.get('/api/artworks/:artworkId/editions', async (c) => {
  try {
    const artworkId = c.req.param('artworkId');
    const artwork = await c.env.DB.prepare('SELECT total_editions FROM artworks WHERE id = ?').bind(artworkId).first<{ total_editions: number }>();
    if (!artwork) return c.json({ error: 'Artwork not found' }, 404);
    const { results } = await c.env.DB.prepare(
      "SELECT edition_number, status FROM artwork_editions WHERE artwork_base_id = ? ORDER BY edition_number"
    ).bind(artworkId).all<{ edition_number: number; status: string }>();
    return c.json({ total_editions: artwork.total_editions, editions: results ?? [] });
  } catch (error) {
    console.error('Failed to retrieve edition availability:', error);
    return c.json({ error: 'Failed to retrieve edition availability' }, 500);
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
      `SELECT id, artist_id, title, medium, dimensions, price_cents, image_url, status, edition_number, total_editions, created_at
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
  const user = { id: `user_${crypto.randomUUID()}`, username: body.username };
  try {
    const passwordHash = await hashPassword(body.password);
    await c.env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status) VALUES (?, ?, ?, 'user', 'active')")
      .bind(user.id, user.username, passwordHash).run();
    return createSession(c, user);
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return c.json({ error: 'That username is already in use.' }, 409);
    console.error('Failed to create user account:', error);
    return c.json({ error: 'Unable to create account right now.' }, 500);
  }
});

app.post('/api/auth/login', async (c) => {
  let body: { username?: unknown; password?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid credentials' }, 401); }
  if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 128) return c.json({ error: 'Invalid credentials' }, 401);
  const user = await c.env.DB.prepare("SELECT id, username, password_hash FROM users WHERE username = ? AND status = 'active'")
    .bind(body.username).first<UserRecord>();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) return c.json({ error: 'Invalid credentials' }, 401);
  return createSession(c, { id: user.id, username: user.username });
});

app.get('/api/auth/session', async (c) => {
  const user = await getSessionUser(c);
  return c.json({ authenticated: Boolean(user), user });
});

app.post('/api/auth/logout', async (c) => {
  const sessionId = cookieValue(c, 'session_id');
  if (sessionId) await c.env.SESSION_KV.delete(sessionId);
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ success: true });
});

app.post('/api/marketplace/orders', async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: 'Unauthorized: Sign in to reserve an edition.' }, 401);

  let body: { artwork_id?: unknown; edition_number?: unknown };
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request body' }, 400); }
  if (typeof body.artwork_id !== 'string' || body.artwork_id.length < 1 || body.artwork_id.length > 128) {
    return c.json({ error: 'A valid artwork_id is required.' }, 400);
  }
  const editionNumber = body.edition_number === undefined ? 1 : body.edition_number;
  if (!Number.isSafeInteger(editionNumber) || (editionNumber as number) < 1) return c.json({ error: 'edition_number must be a positive integer.' }, 400);

  try {
    const artwork = await c.env.DB.prepare('SELECT id, price_cents, total_editions, status FROM artworks WHERE id = ?')
      .bind(body.artwork_id).first<ArtworkRecord>();
    if (!artwork) return c.json({ error: 'Artwork not found.' }, 404);
    if ((editionNumber as number) > artwork.total_editions) return c.json({ error: `Invalid edition number. Total editions: ${artwork.total_editions}` }, 400);

    const orderId = `order_${crypto.randomUUID()}`;
    // The unique active-order index plus D1's transactional batch prevents two
    // concurrent requests from reserving the same edition. Amount is sourced from D1.
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO marketplace_orders (id, artwork_id, buyer_id, amount_cents, payment_status, edition_number)
         SELECT ?, a.id, ?, a.price_cents, 'reserved', ?
         FROM artworks a JOIN artwork_editions e ON e.artwork_base_id = a.id
         WHERE a.id = ? AND e.edition_number = ? AND e.status = 'available'`
      ).bind(orderId, user.id, editionNumber, body.artwork_id, editionNumber),
      c.env.DB.prepare(
        `UPDATE artwork_editions SET status = 'reserved', owner_id = ?
         WHERE artwork_base_id = ? AND edition_number = ? AND status = 'available'
         AND EXISTS (SELECT 1 FROM marketplace_orders o WHERE o.id = ? AND o.buyer_id = ? AND o.edition_number = ?)`
      ).bind(user.id, body.artwork_id, editionNumber, orderId, user.id, editionNumber),
      c.env.DB.prepare(
        `UPDATE artworks SET status = CASE WHEN EXISTS (
           SELECT 1 FROM artwork_editions e WHERE e.artwork_base_id = artworks.id AND e.status = 'available'
         ) THEN 'available' ELSE 'reserved' END WHERE id = ?`
      ).bind(body.artwork_id),
    ]);
    if (!results[0]?.meta?.changes || !results[1]?.meta?.changes) return c.json({ error: `Edition #${editionNumber} is no longer available.` }, 409);
    return c.json({ success: true, order_id: orderId, edition_number: editionNumber, total_editions: artwork.total_editions, payment_status: 'reserved', message: `Edition #${editionNumber} of ${artwork.total_editions} reserved. Payment is not connected; no charge was made.` }, 201);
  } catch (error) {
    const detail = String(error).toLowerCase();
    if (detail.includes('unique')) return c.json({ error: `Edition #${editionNumber} is already reserved or sold.` }, 409);
    console.error('Failed to reserve artwork edition:', error);
    return c.json({ error: 'Failed to process reservation.' }, 500);
  }
});

app.get('/api/provenance/verify/:orderId', async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.json({ error: 'Sign in to verify this certificate.' }, 401);
  try {
    const certificate = await c.env.DB.prepare(
      `SELECT pc.id, pc.order_id, pc.artwork_id, pc.owner_id, pc.edition_string, pc.hash_signature, pc.issued_at
       FROM provenance_certificates pc JOIN marketplace_orders o ON o.id = pc.order_id
       WHERE pc.order_id = ? AND pc.owner_id = ? AND o.buyer_id = ? AND o.payment_status = 'confirmed'`
    ).bind(c.req.param('orderId'), user.id, user.id).first();
    if (!certificate) return c.json({ error: 'No settled provenance certificate is available for this order.' }, 404);
    return c.json(certificate);
  } catch (error) {
    console.error('Failed to retrieve provenance certificate:', error);
    return c.json({ error: 'Unable to verify certificate.' }, 500);
  }
});

// Call only from a trusted payment-settlement handler after a verified capture.
// Reservations alone must never receive a certificate or be presented as sales.
export async function issueProvenanceCertificate(
  env: Bindings, orderId: string, artworkId: string, buyerId: string, editionNumber: number, totalEditions: number,
) {
  if (!env.PROVENANCE_SECRET) throw new Error('PROVENANCE_SECRET is not configured');
  const order = await env.DB.prepare(
    "SELECT id FROM marketplace_orders WHERE id = ? AND artwork_id = ? AND buyer_id = ? AND edition_number = ? AND payment_status = 'confirmed'"
  ).bind(orderId, artworkId, buyerId, editionNumber).first();
  if (!order) throw new Error('Certificate may only be issued for a confirmed order');
  const editionString = `${editionNumber}/${totalEditions}`;
  const payload = `${orderId}\n${artworkId}\n${buyerId}\n${editionString}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.PROVENANCE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  const hashSignature = [...signature].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const certId = `cert_${crypto.randomUUID()}`;
  await env.DB.prepare(
    'INSERT INTO provenance_certificates (id, order_id, artwork_id, owner_id, edition_string, hash_signature) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(certId, orderId, artworkId, buyerId, editionString, hashSignature).run();
  return { certId, hashSignature };
}

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
  if (!Number.isSafeInteger(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) return c.json({ success: false, error: 'QAL_AUTH_FAILED: Timestamp expired' }, 401);
  const secret = c.env.QAL_SECRET;
  if (!secret) {
    console.error('QAL_SECRET is not configured');
    return c.json({ success: false, error: 'QAL authentication is not configured' }, 503);
  }
  const registeredNode = await c.env.DB.prepare('SELECT node_id FROM qal_nodes WHERE node_id = ?').bind(nodeId).first<{ node_id: string }>();
  if (!registeredNode) return c.json({ success: false, error: 'QAL_AUTH_FAILED: Node is not registered' }, 403);
  const valid = await verifyQALRequestSignature(secret, c.req.raw, nodeId, timestamp, signature);
  if (!valid) return c.json({ success: false, error: 'QAL_AUTH_FAILED: Invalid request signature' }, 403);
  await c.env.DB.prepare('UPDATE qal_nodes SET last_authenticated = ? WHERE node_id = ?').bind(Date.now(), nodeId).run();
  c.set('qalNodeId', nodeId);
  await next();
};

app.get('/api/secure/telemetry/:nodeId', requireQALAuth, async (c) => {
  const requestedNodeId = c.req.param('nodeId');
  const authenticatedNodeId = c.get('qalNodeId');
  if (requestedNodeId !== authenticatedNodeId) return c.json({ success: false, error: 'QAL_AUTH_FAILED: Node access denied' }, 403);
  const telemetry = await c.env.DB.prepare(
    'SELECT node_id, status, mesh_region, dat_balance, last_heartbeat FROM node_telemetry WHERE node_id = ?'
  ).bind(authenticatedNodeId).first();
  return c.json({ success: true, telemetry: telemetry ?? null });
});

app.all('*', async (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
