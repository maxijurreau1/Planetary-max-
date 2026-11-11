/** Verify an HMAC-SHA256 hex signature using the Workers Web Crypto API. */
export async function verifyHmacSignature(
  secret: string,
  payload: string,
  signatureHex: string,
): Promise<boolean> {
  // SHA-256 HMAC signatures are exactly 32 bytes (64 hex characters).
  if (!/^[\da-fA-F]{64}$/.test(signatureHex)) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signature = new Uint8Array(
      signatureHex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)),
    );
    return await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payload));
  } catch (error) {
    // Do not log signature material or secrets.
    console.error('QAL signature verification failed:', error);
    return false;
  }
}
