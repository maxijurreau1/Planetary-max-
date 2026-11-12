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

/**
 * Build the canonical QAL message. Signers must use the exact same format:
 * nodeId:timestamp:METHOD:path-and-query:sha256(body)
 *
 * The URL path and query are included so a signature cannot be moved to a
 * different endpoint or query. The body hash binds the signature to the exact
 * request bytes (including an empty body).
 */
export async function createQALCanonicalMessage(
  request: Request,
  nodeId: string,
  timestamp: string,
): Promise<string> {
  const body = await request.clone().arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', body);
  const bodyHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const url = new URL(request.url);
  const pathAndQuery = `${url.pathname}${url.search}`;

  return `${nodeId}:${timestamp}:${request.method.toUpperCase()}:${pathAndQuery}:${bodyHash}`;
}

/** Verify a request whose HMAC covers its node, timestamp, method, path/query, and body. */
export async function verifyQALRequestSignature(
  secret: string,
  request: Request,
  nodeId: string,
  timestamp: string,
  signatureHex: string,
): Promise<boolean> {
  const canonicalMessage = await createQALCanonicalMessage(request, nodeId, timestamp);
  return verifyHmacSignature(secret, canonicalMessage, signatureHex);
}
