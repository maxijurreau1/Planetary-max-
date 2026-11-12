import { checkUserNodeAuthorization, verifyRealUserSession } from './secureAuth';

export interface UpgradeTicket {
  token: string;
  nodeId: string;
  createdAt: number;
  expiresAt: number;
  sessionExpiresAt: number;
}

interface SecureStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<Map<string, T> & { list_complete?: boolean; cursor?: string }>;
  transaction<T>(closure: (txn: SecureStorage) => Promise<T>): Promise<T>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
}

interface SecureSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

interface SecureState {
  storage: SecureStorage;
  acceptWebSocket(socket: SecureSocket): void;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

interface SecureEnv {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  JWT_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
}

interface SocketAttachment {
  nodeId: string;
  sessionExpiresAt: number;
}

const ALLOWED_FRAME_TYPES = new Set(['handshake', 'heartbeat', 'event']);
const NODE_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const MAX_FRAME_LENGTH = 10_240;
const TICKET_TTL_MS = 60_000;
const SOCKET_TTL_MS = 15 * 60_000;
const NONCE_TTL_MS = 5 * 60_000;

declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class BEEMAXSecureNodeRegistryDO {
  constructor(private readonly state: SecureState, private readonly env: SecureEnv) {
    void this.state.blockConcurrencyWhile(async () => {
      if (!(await this.state.storage.getAlarm())) await this.state.storage.setAlarm(Date.now() + 60_000);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/beemax/session' && request.method === 'POST') return this.issueUpgradeTicket(request);
    if (url.pathname === '/ws') {
      if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      return this.upgradeWebSocket(request);
    }
    return json({ error: 'Not found' }, 404);
  }

  private async issueUpgradeTicket(request: Request): Promise<Response> {
    const userAuth = await verifyRealUserSession(request, this.env);
    if (!userAuth.authorized || !userAuth.userId) return json({ error: 'Unauthorized: valid user session required' }, 401);

    let body: unknown;
    try {
      const contentLength = Number(request.headers.get('Content-Length') ?? '0');
      if (contentLength > 4096) return json({ error: 'Request body too large' }, 413);
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 4096) return json({ error: 'Request body too large' }, 413);
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const nodeId = isRecord(body) ? body.nodeId : undefined;
    if (typeof nodeId !== 'string' || !NODE_ID_PATTERN.test(nodeId)) return json({ error: 'Invalid nodeId' }, 400);
    if (!(await checkUserNodeAuthorization(this.env.DB, userAuth.userId, nodeId))) {
      return json({ error: 'Forbidden: user is not authorized for this node' }, 403);
    }

    const token = crypto.randomUUID();
    const now = Date.now();
    const ticket: UpgradeTicket = {
      token,
      nodeId,
      createdAt: now,
      expiresAt: now + TICKET_TTL_MS,
      sessionExpiresAt: now + SOCKET_TTL_MS,
    };
    try {
      await this.state.storage.put(`ticket:${token}`, ticket);
    } catch {
      return json({ error: 'Unable to create WebSocket ticket' }, 503);
    }

    const cookie = `beemax_upgrade_ticket=${token}; HttpOnly; Secure; SameSite=Strict; Path=/ws; Max-Age=60`;
    return new Response(JSON.stringify({ status: 'ready', nodeId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookie },
    });
  }

  private async upgradeWebSocket(request: Request): Promise<Response> {
    const token = this.extractCookie(request, 'beemax_upgrade_ticket');
    if (!token || !/^[\da-f-]{36}$/i.test(token)) return new Response('Unauthorized WebSocket upgrade', { status: 401 });

    const now = Date.now();
    let ticket: UpgradeTicket | undefined;
    try {
      ticket = await this.state.storage.transaction(async (txn) => {
        const key = `ticket:${token}`;
        const stored = await txn.get<UpgradeTicket>(key);
        if (
          !stored || stored.token !== token || !NODE_ID_PATTERN.test(stored.nodeId) ||
          !Number.isSafeInteger(stored.expiresAt) || stored.expiresAt <= now ||
          !Number.isSafeInteger(stored.sessionExpiresAt) || stored.sessionExpiresAt <= now
        ) return undefined;
        await txn.delete(key);
        return stored;
      });
    } catch {
      return new Response('WebSocket ticket validation unavailable', { status: 503 });
    }
    if (!ticket) return new Response('Invalid or expired WebSocket ticket', { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as unknown as SecureSocket;
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ nodeId: ticket.nodeId, sessionExpiresAt: ticket.sessionExpiresAt } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  async webSocketMessage(socket: SecureSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const value: unknown = socket.deserializeAttachment();
      const attachment = isRecord(value) && typeof value.nodeId === 'string' && Number.isSafeInteger(value.sessionExpiresAt)
        ? value as unknown as SocketAttachment
        : null;
      if (!attachment || attachment.sessionExpiresAt <= Date.now()) {
        socket.send(JSON.stringify({ error: 'Session expired or unauthenticated socket' }));
        socket.close(1008, 'Session expired');
        return;
      }
      if (typeof message !== 'string' || message.length > MAX_FRAME_LENGTH) {
        socket.send(JSON.stringify({ error: 'Oversized or malformed frame' }));
        return;
      }

      const parsed: unknown = JSON.parse(message);
      if (!isRecord(parsed)) {
        socket.send(JSON.stringify({ error: 'Invalid frame' }));
        return;
      }
      const { type, nodeId, nonce, issuedAt } = parsed;
      if (
        typeof type !== 'string' || !ALLOWED_FRAME_TYPES.has(type) || nodeId !== attachment.nodeId ||
        typeof nonce !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
        typeof issuedAt !== 'number' || !Number.isSafeInteger(issuedAt)
      ) {
        socket.send(JSON.stringify({ error: 'Invalid frame schema or type' }));
        return;
      }
      if (Math.abs(Date.now() - issuedAt) > NONCE_TTL_MS) {
        socket.send(JSON.stringify({ error: 'Stale timestamp' }));
        return;
      }

      const nonceKey = `nonce:${attachment.nodeId}:${nonce}`;
      const expiresAt = Date.now() + NONCE_TTL_MS;
      const consumed = await this.state.storage.transaction(async (txn) => {
        if (await txn.get<number>(nonceKey)) return false;
        await txn.put(nonceKey, expiresAt);
        return true;
      });
      if (!consumed) {
        socket.send(JSON.stringify({ error: 'Nonce replayed' }));
        return;
      }
      // Operation-specific authorization and durable idempotency are still required before state changes.
      socket.send(JSON.stringify({ status: 'acknowledged', type, nodeId: attachment.nodeId }));
    } catch {
      socket.send(JSON.stringify({ error: 'Malformed frame payload' }));
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const prefix of ['ticket:', 'nonce:']) {
      const entries = await this.state.storage.list<UpgradeTicket | number>({ prefix, limit: 500 });
      for (const [key, value] of entries) {
        const expiry = typeof value === 'number' ? value : value.expiresAt;
        if (expiry <= now) await this.state.storage.delete(key);
      }
    }
    await this.state.storage.setAlarm(Date.now() + 60_000);
  }

  private extractCookie(request: Request, name: string): string | null {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;
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
}
