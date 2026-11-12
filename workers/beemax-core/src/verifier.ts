import type { NodeSecretState } from './registryDo';

export interface NodeRegistryNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request | string, init?: RequestInit): Promise<Response> };
}

export interface QALVerificationResult {
  valid: boolean;
  error?: string;
  nodeId?: string;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function validNodeState(value: unknown, nodeId: string): value is NodeSecretState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<NodeSecretState>;
  const secretLength = (secret: unknown) => typeof secret === 'string' && new TextEncoder().encode(secret).byteLength >= 32;
  return record.nodeId === nodeId &&
    secretLength(record.currentSecret) &&
    Number.isSafeInteger(record.currentVersion) &&
    (record.nextSecret === undefined || secretLength(record.nextSecret)) &&
    (record.nextVersion === undefined || Number.isSafeInteger(record.nextVersion)) &&
    (record.nextExpiresAt === undefined || Number.isSafeInteger(record.nextExpiresAt));
}

async function verifyHmac(message: string, secret: string, signatureHex: string): Promise<boolean> {
  if (!/^[\da-fA-F]{64}$/.test(signatureHex)) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signature = new Uint8Array(signatureHex.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)));
    return await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

/**
 * Canonical format: nodeId:timestamp:METHOD:path?query:sha256(raw-body).
 * Signers must use the exact same bytes, casing, and query-string ordering.
 */
export async function verifyQALRequestDO(
  request: Request,
  nodeRegistryNamespace: NodeRegistryNamespace,
  registryInternalToken: string,
): Promise<QALVerificationResult> {
  const nodeId = request.headers.get('X-Node-ID');
  const timestamp = request.headers.get('X-QAL-Timestamp');
  const signature = request.headers.get('X-QAL-Signature');

  if (!nodeId || !/^[a-zA-Z0-9._:-]{1,128}$/.test(nodeId) || !timestamp || !/^\d{13}$/.test(timestamp) || !signature) {
    return { valid: false, error: 'Missing or malformed QAL verification headers' };
  }

  const requestTime = Number(timestamp);
  if (!Number.isSafeInteger(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
    return { valid: false, error: 'QAL timestamp expired or outside acceptable clock skew window' };
  }

  if (!registryInternalToken) return { valid: false, error: 'QAL registry is not configured' };

  try {
    const id = nodeRegistryNamespace.idFromName('global-node-registry');
    const secretUrl = `https://registry/registry/internal/state/${encodeURIComponent(nodeId)}`;
    const stateResponse = await nodeRegistryNamespace.get(id).fetch(new Request(secretUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${registryInternalToken}` },
    }));
    if (!stateResponse.ok) return { valid: false, error: 'Unregistered QAL node or registry error' };

    const record: unknown = await stateResponse.json();
    if (!validNodeState(record, nodeId)) return { valid: false, error: 'Invalid QAL registry state' };

    const url = new URL(request.url);
    const pathAndQuery = `${url.pathname}${url.search}`;
    const bodyHash = await sha256Hex(await request.clone().arrayBuffer());
    const canonicalMessage = `${nodeId}:${timestamp}:${request.method.toUpperCase()}:${pathAndQuery}:${bodyHash}`;

    if (await verifyHmac(canonicalMessage, record.currentSecret, signature)) {
      return { valid: true, nodeId };
    }

    if (
      record.nextSecret &&
      record.nextVersion === record.currentVersion + 1 &&
      typeof record.nextExpiresAt === 'number' &&
      Date.now() <= record.nextExpiresAt &&
      await verifyHmac(canonicalMessage, record.nextSecret, signature)
    ) {
      return { valid: true, nodeId };
    }

    return { valid: false, error: 'Cryptographic signature verification failed' };
  } catch {
    return { valid: false, error: 'QAL registry verification unavailable' };
  }
}
