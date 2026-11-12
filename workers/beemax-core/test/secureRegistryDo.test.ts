import { describe, expect, it } from 'vitest';
import { BEEMAXSecureNodeRegistryDO } from '../src/secureRegistryDo';

class MockStorage {
  private values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, value); }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
  async list<T>(options: { prefix?: string; limit?: number } = {}): Promise<Map<string, T> & { list_complete: boolean }> {
    const entries = [...this.values.entries()].filter(([key]) => !options.prefix || key.startsWith(options.prefix)).slice(0, options.limit ?? Infinity);
    const result = new Map(entries) as Map<string, T> & { list_complete: boolean };
    result.list_complete = true;
    return result;
  }
  async transaction<T>(closure: (txn: MockStorage) => Promise<T>): Promise<T> { return closure(this); }
  async getAlarm(): Promise<number | null> { return null; }
  async setAlarm(_time: number): Promise<void> {}
}

class MockState {
  storage = new MockStorage();
  acceptWebSocket(_socket: unknown): void {}
  async blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> { return callback(); }
}

describe('BEEMAX secure registry fail-closed authentication', () => {
  it('does not issue a ticket until real user authentication is configured', async () => {
    const state = new MockState();
    const registry = new BEEMAXSecureNodeRegistryDO(state as never, {});
    const response = await registry.fetch(new Request('https://worker/api/beemax/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: 'node-default' }),
    }));
    expect(response.status).toBe(401);
    expect(await state.storage.list({ prefix: 'ticket:' })).toHaveLength(0);
  });

  it('requires an actual WebSocket upgrade for /ws', async () => {
    const registry = new BEEMAXSecureNodeRegistryDO(new MockState() as never, {});
    const response = await registry.fetch(new Request('https://worker/ws'));
    expect(response.status).toBe(426);
  });
});
