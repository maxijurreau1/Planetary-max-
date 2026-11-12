import { beforeEach, describe, expect, it } from 'vitest';
import { EdgeJWTGenerator, decodeUtf8Json } from '../src/utils/jwt';
import { verifyRealUserSession } from '../src/secureAuth';

class MockKV {
  private readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async put(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

describe('BEEMAX session JWT verification', () => {
  const secret = 'a-random-secret-with-at-least-32-bytes-0001';
  const issuer = 'https://auth.example.test';
  const audience = 'beemax-edge-core';
  let kv: MockKV;
  let generator: EdgeJWTGenerator;

  const env = () => ({ JWT_SECRET: secret, JWT_ISSUER: issuer, JWT_AUDIENCE: audience, SESSION_KV: kv });
  const requestWithToken = (token: string) => new Request('https://worker.test/', {
    headers: { Cookie: `beemax_auth_session=${token}` },
  });

  beforeEach(() => {
    kv = new MockKV();
    generator = new EdgeJWTGenerator(secret, issuer, audience);
  });

  it('authorizes a valid signed token only when its session is active in KV', async () => {
    const token = await generator.generate({ sub: 'user-123', role: 'operator' }, 3600);
    const payload = decodeUtf8Json(token.split('.')[1]) as { sub: string; jti: string };
    await kv.put(`session:active:${payload.sub}:${payload.jti}`, 'active');

    await expect(verifyRealUserSession(requestWithToken(token), env())).resolves.toEqual({
      authorized: true,
      userId: 'user-123',
      role: 'operator',
    });
  });

  it('fails closed when the active KV record is absent or not active', async () => {
    const token = await generator.generate({ sub: 'user-123' });
    await expect(verifyRealUserSession(requestWithToken(token), env())).resolves.toEqual({ authorized: false });
    const payload = decodeUtf8Json(token.split('.')[1]) as { sub: string; jti: string };
    await kv.put(`session:active:${payload.sub}:${payload.jti}`, 'revoked');
    await expect(verifyRealUserSession(requestWithToken(token), env())).resolves.toEqual({ authorized: false });
  });

  it('rejects issuer and audience mismatches', async () => {
    const wrongIssuer = await new EdgeJWTGenerator(secret, 'https://other.example.test', audience).generate({ sub: 'user-123' });
    const wrongAudience = await new EdgeJWTGenerator(secret, issuer, 'other-service').generate({ sub: 'user-123' });
    await expect(verifyRealUserSession(requestWithToken(wrongIssuer), env())).resolves.toEqual({ authorized: false });
    await expect(verifyRealUserSession(requestWithToken(wrongAudience), env())).resolves.toEqual({ authorized: false });
  });

  it('rejects malformed, tampered, and invalidly signed tokens', async () => {
    await expect(verifyRealUserSession(requestWithToken('x.y.z'), env())).resolves.toEqual({ authorized: false });
    const token = await generator.generate({ sub: 'user-123' });
    const [header, payload, signature] = token.split('.');
    const tampered = `${header}.${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}.${signature}`;
    await expect(verifyRealUserSession(requestWithToken(tampered), env())).resolves.toEqual({ authorized: false });
  });

  it('rejects unsupported roles and inconsistent generator input', async () => {
    await expect(generator.generate({ sub: 'user-123', role: 'root' })).rejects.toThrow(/role/i);
    await expect(generator.generate({ sub: 'user-123', jti: 'short' })).rejects.toThrow(/jti/i);
    await expect(generator.generate({ sub: 'user-123', nbf: Math.floor(Date.now() / 1000) + 60 })).rejects.toThrow(/nbf/i);
  });
});
