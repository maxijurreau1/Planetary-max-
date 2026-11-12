export interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  jti: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

export type JWTSignInput = Omit<JWTPayload, 'iat' | 'exp' | 'jti'> & {
  /** Optional token ID for controlled integrations; normally generated automatically. */
  jti?: string;
};

const MAX_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_SECRET_BYTES = 32;

/** Signs short-lived HS256 JWTs in the Workers Web Crypto runtime. */
export class EdgeJWTGenerator {
  private readonly encoder = new TextEncoder();
  private readonly key: Promise<CryptoKey>;

  constructor(secret: string) {
    if (typeof secret !== 'string' || new TextEncoder().encode(secret).byteLength < MIN_SECRET_BYTES) {
      throw new Error('JWT secret must contain at least 32 bytes and be configured as a Worker secret.');
    }

    this.key = crypto.subtle.importKey(
      'raw',
      this.encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }

  private base64UrlEncode(input: string | ArrayBuffer): string {
    const bytes = typeof input === 'string'
      ? this.encoder.encode(input)
      : new Uint8Array(input);
    let binary = '';
    // Convert in chunks to avoid argument limits for larger inputs.
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  async generate(input: JWTSignInput, expiresInSeconds = 3600): Promise<string> {
    if (!input || typeof input.sub !== 'string' || input.sub.length < 1 || input.sub.length > 256) {
      throw new Error('JWT subject must be a non-empty string of at most 256 characters.');
    }
    if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_TOKEN_TTL_SECONDS) {
      throw new Error(`expiresInSeconds must be an integer between 1 and ${MAX_TOKEN_TTL_SECONDS}.`);
    }
    if (input.jti !== undefined && (typeof input.jti !== 'string' || input.jti.length < 1 || input.jti.length > 256)) {
      throw new Error('JWT jti must be a non-empty string of at most 256 characters.');
    }

    const now = Math.floor(Date.now() / 1000);
    const { jti: providedJti, ...claims } = input;
    const payload: JWTPayload = {
      ...claims,
      jti: providedJti ?? crypto.randomUUID(),
      iat: now,
      exp: now + expiresInSeconds,
    };
    const encodedHeader = this.base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign('HMAC', await this.key, this.encoder.encode(signingInput));
    return `${signingInput}.${this.base64UrlEncode(signature)}`;
  }
}
