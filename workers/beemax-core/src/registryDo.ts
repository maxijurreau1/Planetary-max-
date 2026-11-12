export interface NodeSecretState {
  nodeId: string;
  currentSecret: string;
  currentVersion: number;
  nextSecret?: string;
  nextVersion?: number;
  nextExpiresAt?: number;
}

export interface NodeMetadata {
  nodeId: string;
  currentVersion: number;
  nextVersion?: number;
  nextExpiresAt?: number;
}

interface RegistryStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  transaction<T>(closure: (txn: RegistryStorage) => Promise<T>): Promise<T>;
  list<T>(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<Map<string, T> & { list_complete?: boolean; cursor?: string }>;
}

interface RegistryState {
  storage: RegistryStorage;
}

interface RegistryEnv {
  REGISTRY_INTERNAL_TOKEN?: string;
  QAL_SECRET?: string;
  DEFAULT_NODE_ID?: string;
}

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const NODE_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 512;
const MIN_GRACE_PERIOD_MS = 60_000;
const MAX_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function isValidSecret(secret: unknown): secret is string {
  if (typeof secret !== 'string') return false;
  const length = new TextEncoder().encode(secret).byteLength;
  return length >= MIN_SECRET_BYTES && length <= MAX_SECRET_BYTES;
}

function safeTokenEqual(actual: string | null, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(actual);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function metadataFor(state: NodeSecretState): NodeMetadata {
  return {
    nodeId: state.nodeId,
    currentVersion: state.currentVersion,
    nextVersion: state.nextVersion,
    nextExpiresAt: state.nextExpiresAt,
  };
}

function isInternalRequest(request: Request, env: RegistryEnv): boolean {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  return safeTokenEqual(token, env.REGISTRY_INTERNAL_TOKEN);
}

export class NodeRegistryDO {
  constructor(
    private readonly state: RegistryState,
    private readonly env: RegistryEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Secret-bearing state and all registry administration are internal-only.
    if (url.pathname.startsWith('/registry/internal/') || url.pathname === '/registry/rotate' || url.pathname === '/registry/nodes' || /^\/registry\/nodes\//.test(url.pathname)) {
      if (!isInternalRequest(request, this.env)) return json({ error: 'Unauthorized' }, 401);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/registry/internal/state/')) {
      const nodeId = decodeURIComponent(url.pathname.slice('/registry/internal/state/'.length));
      return this.getSecretState(nodeId);
    }

    if (request.method === 'GET' && url.pathname === '/registry/nodes') {
      return this.listAllNodes(url);
    }

    const metadataMatch = url.pathname.match(/^\/registry\/nodes\/([^/]+)$/);
    if (request.method === 'GET' && metadataMatch) {
      return this.getNodeMetadata(decodeURIComponent(metadataMatch[1]));
    }

    if (request.method === 'POST' && url.pathname === '/registry/rotate') {
      return this.rotateSecret(request);
    }

    return json({ error: 'Not found' }, 404);
  }

  private async getSecretState(nodeId: string): Promise<Response> {
    if (!NODE_ID_PATTERN.test(nodeId)) return json({ error: 'Invalid node ID' }, 400);
    try {
      const record = await this.state.storage.transaction(async (txn) => {
        const key = `node:${nodeId}`;
        const existing = await txn.get<NodeSecretState>(key);
        if (existing) return existing;

        // One-time migration of the configured legacy node secret. Never seed
        // from a hard-coded/default secret; QAL_SECRET must be configured as a
        // Worker secret and only the designated legacy node can be bootstrapped.
        const defaultNodeId = this.env.DEFAULT_NODE_ID ?? 'node-default';
        if (nodeId !== defaultNodeId || !isValidSecret(this.env.QAL_SECRET)) return undefined;

        const initial: NodeSecretState = {
          nodeId,
          currentSecret: this.env.QAL_SECRET,
          currentVersion: 1,
        };
        await txn.put(key, initial);
        return initial;
      });

      if (!record) return json({ error: 'Node not found and legacy bootstrap is unavailable' }, 404);
      return json(record);
    } catch {
      return json({ error: 'Node registry unavailable' }, 503);
    }
  }

  private async listAllNodes(url: URL): Promise<Response> {
    const rawLimit = Number(url.searchParams.get('limit') ?? '100');
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 100;
    const cursor = url.searchParams.get('cursor') ?? undefined;

    try {
      const entries = await this.state.storage.list<NodeSecretState>({ prefix: 'node:', limit, cursor });
      const nodes: NodeMetadata[] = [];
      for (const [, record] of entries) {
        // Never serialize the stored record: it contains current and possibly
        // next secrets. Project only the explicitly public metadata fields.
        if (!record || typeof record.nodeId !== 'string' || !Number.isSafeInteger(record.currentVersion)) continue;
        nodes.push(metadataFor(record));
      }
      const complete = entries.list_complete ?? entries.size < limit;
      return json({ nodes, total: nodes.length, complete, cursor: complete ? undefined : entries.cursor });
    } catch {
      return json({ error: 'Unable to list registry nodes' }, 500);
    }
  }

  private async getNodeMetadata(nodeId: string): Promise<Response> {
    if (!NODE_ID_PATTERN.test(nodeId)) return json({ error: 'Invalid node ID' }, 400);
    const record = await this.state.storage.get<NodeSecretState>(`node:${nodeId}`);
    if (!record) return json({ error: 'Node not found' }, 404);
    return json(metadataFor(record));
  }

  private async rotateSecret(request: Request): Promise<Response> {
    let input: {
      nodeId?: unknown;
      newSecret?: unknown;
      expectedVersion?: unknown;
      gracePeriodMs?: unknown;
    };

    try {
      input = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { nodeId, newSecret, expectedVersion } = input;
    const gracePeriodMs = input.gracePeriodMs ?? 24 * 60 * 60 * 1000;

    if (typeof nodeId !== 'string' || !NODE_ID_PATTERN.test(nodeId)) {
      return json({ error: 'Invalid nodeId' }, 400);
    }
    if (!isValidSecret(newSecret)) {
      return json({ error: 'newSecret must contain 32 to 512 UTF-8 bytes' }, 400);
    }
    if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1) {
      return json({ error: 'expectedVersion must be a positive integer' }, 400);
    }
    if (!Number.isSafeInteger(gracePeriodMs) || (gracePeriodMs as number) < MIN_GRACE_PERIOD_MS || (gracePeriodMs as number) > MAX_GRACE_PERIOD_MS) {
      return json({ error: 'gracePeriodMs must be between 60 seconds and 30 days' }, 400);
    }

    try {
      const result = await this.state.storage.transaction(async (txn) => {
        const storageKey = `node:${nodeId}`;
        let existing = await txn.get<NodeSecretState>(storageKey);

        // Permit rotation to initialize only the configured legacy node, using
        // the explicitly configured legacy secret. Missing/weak secrets fail closed.
        const defaultNodeId = this.env.DEFAULT_NODE_ID ?? 'node-default';
        if (!existing && nodeId === defaultNodeId && isValidSecret(this.env.QAL_SECRET)) {
          existing = { nodeId, currentSecret: this.env.QAL_SECRET, currentVersion: 1 };
        }
        if (!existing) return { error: 'Node not found', status: 404 as const };

        if (existing.nodeId !== nodeId || !isValidSecret(existing.currentSecret) || !Number.isSafeInteger(existing.currentVersion)) {
          return { error: 'Stored node secret state is invalid', status: 500 as const };
        }
        if (existing.currentVersion !== expectedVersion) {
          return { error: `Version conflict: expected ${expectedVersion}, found ${existing.currentVersion}`, status: 409 as const };
        }

        const now = Date.now();
        const pendingIsValid = Boolean(
          existing.nextSecret &&
          Number.isSafeInteger(existing.nextVersion) &&
          Number.isSafeInteger(existing.nextExpiresAt) &&
          now < (existing.nextExpiresAt as number),
        );
        if (pendingIsValid) {
          return { error: 'Existing nextSecret is still valid and unexpired. Promote or wait for expiration.', status: 409 as const };
        }

        let currentSecret = existing.currentSecret;
        let currentVersion = existing.currentVersion;
        if (existing.nextSecret && existing.nextExpiresAt !== undefined && now >= existing.nextExpiresAt) {
          if (!isValidSecret(existing.nextSecret) || !Number.isSafeInteger(existing.nextVersion)) {
            return { error: 'Stored pending secret state is invalid', status: 500 as const };
          }
          currentSecret = existing.nextSecret;
          currentVersion = existing.nextVersion as number;
        }

        if (newSecret === currentSecret) {
          return { error: 'newSecret must differ from the active secret', status: 400 as const };
        }

        const updated: NodeSecretState = {
          nodeId,
          currentSecret,
          currentVersion,
          nextSecret: newSecret,
          nextVersion: currentVersion + 1,
          nextExpiresAt: now + (gracePeriodMs as number),
        };
        await txn.put(storageKey, updated);
        return { metadata: metadataFor(updated) };
      });

      if ('error' in result) return json({ error: result.error }, result.status);
      return json({ success: true, ...result.metadata }, 200);
    } catch {
      return json({ error: 'Secret rotation failed' }, 500);
    }
  }
}
