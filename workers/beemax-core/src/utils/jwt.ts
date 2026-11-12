export interface JWTPayload {
  sub: string;
  iss: string;
  aud: string;
  role?: string;
  jti: string;
  iat: number;
  exp: number;
  nbf?: number;
}

export type JWTSignInput = {
  sub: string;
  role?: string;
  /** Normally generated automatically. Supply only for controlled integrations. */
  jti?: string;
  nbf?: number;
};

const MAX_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECRET_BYTES = 32;
const ALLOWED_ROLES = new Set(['operator', 'admin', 'auditor', 'node-agent', 'user']);
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Strictly decodes an unpadded base64url segment. */
export function base64UrlToBytes(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    // Reject non-canonical encodings, including non-zero unused pad bits.
    return bytesToBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

/** Decodes a base64url-encoded UTF-8 JSON value. */
export function decodeUtf8Json(value: string): unknown | null {
  const bytes = base64UrlToBytes(value);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** Signs short-lived HS256 JWTs in the Workers Web Crypto runtime. */
export class EdgeJWTGenerator {
  private readonly key: Promise<CryptoKey>;

  constructor(
    secret: string,
    private readonly expectedIssuer: string,
    private readonly expectedAudience: string,
  ) {
    const secretBytes = encoder.encode(secret);
    if (secretBytes.byteLength < MIN_SECRET_BYTES) {
      throw new Error('JWT secret must contain at least 32 random bytes and be configured as a Worker secret.');
    }
    if (!expectedIssuer || !expectedAudience) {
      throw new Error('Explicit expectedIssuer and expectedAudience must be provided.');
    }
    this.key = crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }

  async generate(input: JWTSignInput, expiresInSeconds = 3600): Promise<string> {
    if (!input || typeof input.sub !== 'string' || !input.sub.trim() || input.sub.trim().length > 128) {
      throw new Error('JWT subject must be a non-empty string of at most 128 characters.');
    }
    if (input.role !== undefined && (typeof input.role !== 'string' || !ALLOWED_ROLES.has(input.role))) {
      throw new Error('Invalid JWT role.');
    }
    if (input.jti !== undefined && (typeof input.jti !== 'string' || input.jti.length < 8 || input.jti.length > 64)) {
      throw new Error('JWT jti must be between 8 and 64 characters.');
    }
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_TOKEN_TTL_SECONDS) {
      throw new Error(`expiresInSeconds must be an integer between 1 and ${MAX_TOKEN_TTL_SECONDS}.`);
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInSeconds;
    if (!Number.isSafeInteger(exp)) throw new Error('JWT expiration is out of range.');
    if (input.nbf !== undefined && (
      !Number.isSafeInteger(input.nbf) || input.nbf > now + 30 || input.nbf >= exp
    )) {
      throw new Error('JWT nbf must be a safe timestamp within 30 seconds of now and earlier than exp.');
    }

    const payload: JWTPayload = {
      sub: input.sub.trim(),
      iss: this.expectedIssuer,
      aud: this.expectedAudience,
      role: input.role ?? 'user',
      jti: input.jti ?? crypto.randomUUID(),
      iat: now,
      exp,
      ...(input.nbf === undefined ? {} : { nbf: input.nbf }),
    };
    const encodedHeader = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign('HMAC', await this.key, encoder.encode(signingInput));
    return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
  }
}
