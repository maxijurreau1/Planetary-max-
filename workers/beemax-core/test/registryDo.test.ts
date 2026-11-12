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
    // Tests exercise single operations. Cloudflare Durable Object storage
    // provides the transaction isolation in deployment.
    return closure(this);
  }
}

class MockDurableObjectState {
  storage = new MockDurableObjectStorage();
}

const SECRET_V1 = 'secret-v1-0123456789-abcdefghijkl';
const SECRET_V2 = 'secret-v2-0123456789-abcdefghijkl';
const SECRET_V3 = 'secret-v3-0123456789-abcdefghijkl';

function rotateRequest(body: object): Request {
  return new Request('https://registry/registry/rotate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer internal-test-token',
    },
    body: JSON.stringify(body),
  });
}

describe('NodeRegistryDO transactional rotation', () => {
  let registryDO: NodeRegistryDO;
  let mockState: MockDurableObjectState;

  beforeEach(() => {
    mockState = new MockDurableObjectState();
    registryDO = new NodeRegistryDO(mockState as never, { REGISTRY_INTERNAL_TOKEN: 'internal-test-token' });
  });

  it('rotates a registered node when expectedVersion matches without exposing secrets', async () => {
    const initialState: NodeSecretState = {
      nodeId: 'node-alpha',
      currentSecret: SECRET_V1,
      currentVersion: 1,
    };
    await mockState.storage.put('node:node-alpha', initialState);

    const response = await registryDO.fetch(rotateRequest({
      nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1, gracePeriodMs: 5000,
    }));
    expect(response.status).toBe(400); // Grace periods shorter than 60 seconds are rejected.

    const accepted = await registryDO.fetch(rotateRequest({
      nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1, gracePeriodMs: 60_000,
    }));
    expect(accepted.status).toBe(200);
    const metadata = await accepted.json() as Record<string, unknown>;
    expect(metadata.currentVersion).toBe(1);
    expect(metadata.nextVersion).toBe(2);
    expect(metadata.nextExpiresAt).toBeTypeOf('number');
    expect(metadata.currentSecret).toBeUndefined();
    expect(metadata.nextSecret).toBeUndefined();
  });

  it('rejects stale expectedVersion with 409', async () => {
    await mockState.storage.put('node:node-alpha', {
      nodeId: 'node-alpha', currentSecret: SECRET_V1, currentVersion: 3,
    } satisfies NodeSecretState);

    const response = await registryDO.fetch(rotateRequest({
      nodeId: 'node-alpha', newSecret: SECRET_V2, expectedVersion: 1,
    }));
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain('Version conflict');
  });

  it('rejects rotation while an unexpired next secret is pending', async () => {
    await mockState.storage.put('node:node-alpha', {
      nodeId: 'node-alpha',
      currentSecret: SECRET_V1,
      currentVersion: 1,
      nextSecret: SECRET_V2,
      nextVersion: 2,
      nextExpiresAt: Date.now() + 100_000,
    } satisfies NodeSecretState);

    const response = await registryDO.fetch(rotateRequest({
      nodeId: 'node-alpha', newSecret: SECRET_V3, expectedVersion: 1,
    }));
    expect(response.status).toBe(409);
    expect((await response.json() as { error: string }).error).toContain('Existing nextSecret is still valid');
  });

  it('does not create an unregistered node during rotation', async () => {
    const response = await registryDO.fetch(rotateRequest({
      nodeId: 'node-missing', newSecret: SECRET_V2, expectedVersion: 1,
    }));
    expect(response.status).toBe(404);
  });
});
