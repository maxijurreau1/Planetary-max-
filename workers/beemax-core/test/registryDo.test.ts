import { describe, it, expect, beforeEach } from 'vitest';
import { NodeRegistryDO, type NodeSecretState } from '../src/registryDo';

class MockDurableObjectStorage {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.store.get(key);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as T;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.parse(JSON.stringify(value)));
  }

  async transaction<T>(closure: (txn: MockDurableObjectStorage) => Promise<T>): Promise<T> {
    // These are unit-level state-transition tests. Cloudflare Durable Object
    // storage supplies transaction isolation in deployment.
    return closure(this);
  }

  async list<T>(options: { prefix?: string; limit?: number; cursor?: string } = {}): Promise<Map<string, T> & { list_complete: boolean; cursor?: string }> {
    const rows = [...this.store.entries()]
      .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
      .sort(([a], [b]) => a.localeCompare(b));
    const start = options.cursor ? Number(options.cursor) : 0;
    const limit = options.limit ?? rows.length;
    const selected = rows.slice(start, start + limit);
    const result = new Map(selected.map(([key, value]) => [key, JSON.parse(JSON.stringify(value)) as T])) as Map<string, T> & { list_complete: boolean; cursor?: string };
    result.list_complete = start + selected.length >= rows.length;
    if (!result.list_complete) result.cursor = String(start + selected.length);
    return result;
  }
}

class MockDurableObjectState {
  storage = new MockDurableObjectStorage();
}

const SECRET_V1 = 'secret-v1-0123456789-abcdefghijkl';
const SECRET_V2 = 'secret-v2-0123456789-abcdefghijkl';
const SECRET_V3 = 'secret-v3-0123456789-abcdefghijkl';
const INTERNAL_TOKEN = 'internal-test-token';

function registryRequest(path: string, options: { method?: string; body?: object; authorized?: boolean } = {}): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.authorized !== false) headers.set('Authorization', `Bearer ${INTERNAL_TOKEN}`);
  return new Request(`https://registry${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function rotateRequest(body: object): Request {
  return registryRequest('/registry/rotate', { method: 'POST', body });
}

describe('NodeRegistryDO bootstrap, listing, and rotation', () => {
  let registryDO: NodeRegistryDO;
  let mockState: MockDurableObjectState;

  beforeEach(() => {
    mockState = new MockDurableObjectState();
    registryDO = new NodeRegistryDO(mockState as never, {
      REGISTRY_INTERNAL_TOKEN: INTERNAL_TOKEN,
      DEFAULT_NODE_ID: 'node-alpha',
      QAL_SECRET: SECRET_V1,
    });
  });

  it('lists only node metadata and never exposes secret values', async () => {
    await mockState.storage.put('node:node-alpha', {
      nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 1,
      nextSecret: SECRET_V2, nextVersion: 2, nextExpiresAt: Date.now() + 60_000,
    } satisfies NodeSecretState);
    await mockState.storage.put('other:record', { secret: 'must-not-appear' });

    const response = await registryDO.fetch(registryRequest('/registry/nodes'));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('node-alpha');
    expect(body).not.toContain(SECRET_V1);
    expect(body).not.toContain(SECRET_V2);
    expect(body).not.toContain('must-not-appear');
    expect(JSON.parse(body).nodes).toEqual([{
      nodeId: 'node-alpha', currentVersion: 1, nextVersion: 2,
      nextExpiresAt: expect.any(Number),
    }]);
  });

  it('requires internal authorization for administrative listing', async () => {
    const response = await registryDO.fetch(registryRequest('/registry/nodes', { authorized: false }));
    expect(response.status).toBe(401);
  });

  it('bootstraps only the configured default node from the legacy Worker secret', async () => {
    const response = await registryDO.fetch(registryRequest('/registry/internal/state/node-alpha'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 1 });

    const otherNode = await registryDO.fetch(registryRequest('/registry/internal/state/node-other'));
    expect(otherNode.status).toBe(404);
  });

  it('fails closed without a configured legacy secret and has no hard-coded fallback credential', async () => {
    const withoutLegacySecret = new NodeRegistryDO(mockState as never, { REGISTRY_INTERNAL_TOKEN: INTERNAL_TOKEN, DEFAULT_NODE_ID: 'node-alpha' });
    const response = await withoutLegacySecret.fetch(registryRequest('/registry/internal/state/node-alpha'));
    expect(response.status).toBe(404);
  });

  it('requires internal authorization for secret state and rotation', async () => {
    const stateResponse = await registryDO.fetch(registryRequest('/registry/internal/state/node-alpha', { authorized: false }));
    expect(stateResponse.status).toBe(401);
    const rotationResponse = await registryDO.fetch(registryRequest('/registry/rotate', {
      method: 'POST', body: { nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1 }, authorized: false,
    }));
    expect(rotationResponse.status).toBe(401);
  });

  it('rotates a registered node when expectedVersion matches without exposing secrets', async () => {
    await mockState.storage.put('node:node-alpha', { nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 1 } satisfies NodeSecretState);
    const tooShortGrace = await registryDO.fetch(rotateRequest({ nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1, gracePeriodMs: 5000 }));
    expect(tooShortGrace.status).toBe(400);

    const response = await registryDO.fetch(rotateRequest({ nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1, gracePeriodMs: 60_000 }));
    expect(response.status).toBe(200);
    const metadata = await response.json() as Record<string, unknown>;
    expect(metadata.currentVersion).toBe(1);
    expect(metadata.nextVersion).toBe(2);
    expect(metadata.nextExpiresAt).toBeTypeOf('number');
    expect(metadata.currentSecret).toBeUndefined();
    expect(metadata.nextSecret).toBeUndefined();
  });

  it('rejects stale expectedVersion with 409', async () => {
    await mockState.storage.put('node:node-alpha', { nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 3 } satisfies NodeSecretState);
    const response = await registryDO.fetch(rotateRequest({ nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1 }));
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain('Version conflict');
  });

  it('rejects rotation while an unexpired next secret is pending', async () => {
    await mockState.storage.put('node:node-alpha', {
      nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 1,
      nextSecret: SECRET_V2, nextVersion: 2, nextExpiresAt: Date.now() + 100_000,
    } satisfies NodeSecretState);
    const response = await registryDO.fetch(rotateRequest({ nodeId: 'node-alpha', newSecret: SECRET_V3, expectedVersion: 1 }));
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain('Existing nextSecret is still valid');
  });

  it('promotes an expired next secret before scheduling the next rotation', async () => {
    await mockState.storage.put('node:node-alpha', {
      nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 1,
      nextSecret: SECRET_V2, nextVersion: 2, nextExpiresAt: Date.now() - 1,
    } satisfies NodeSecretState);
    const response = await registryDO.fetch(rotateRequest({ nodeId: 'node-alpha', newSecret: SECRET_V3, expectedVersion: 1 }));
    expect(response.status).toBe(200);
    expect(await mockState.storage.get<NodeSecretState>('node:node-alpha')).toMatchObject({ currentSecret: SECRET_V2, currentVersion: 2, nextSecret: SECRET_V3, nextVersion: 3 });
  });

  it('can seed and rotate the default node in one authorized operation', async () => {
    const response = await registryDO.fetch(rotateRequest({ nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1 }));
    expect(response.status).toBe(200);
    expect(await mockState.storage.get<NodeSecretState>('node:node-alpha')).toMatchObject({ currentSecret: SECRET_V1, currentVersion: 1, nextSecret: SECRET_V2, nextVersion: 2 });
  });

  it('does not create an unregistered non-default node during rotation', async () => {
    const response = await registryDO.fetch(rotateRequest({ nodeId: 'node-missing', newSecret: SECRET_V2, expectedVersion: 1 }));
    expect(response.status).toBe(404);
  });
});
