# BEEMAX Core Worker deployment notes

This folder is a separate Worker from the repository's root `planetary-max` Worker. Deploying it does not automatically change the root Worker or its QAL middleware.

## Configure secrets

In the Cloudflare dashboard, open the `beemax-core` Worker and add these encrypted secrets under **Settings → Variables and Secrets**:

- `REGISTRY_INTERNAL_TOKEN`: a long, random credential shared only by the Worker entrypoint and its NodeRegistry Durable Object. The code uses it to protect internal state reads and rotation requests.
- `OPERATOR_ADMIN_TOKEN`: a separate long, random credential required by the public rotation route.
- `QAL_SECRET`: the existing legacy secret for the configured default node, used only for one-time bootstrap. There is intentionally no built-in fallback secret. Use at least 32 random UTF-8 bytes.

`DEFAULT_NODE_ID` is a non-secret Wrangler variable set in `wrangler.toml`. Change it to the exact legacy node ID before deploying if necessary. Do not put secret values in `wrangler.toml`, source files, commits, or browser code.

## Deploy and verify

1. Ensure the Durable Object binding and `v1-node-registry` migration in `wrangler.toml` are included in this Worker deployment.
2. Deploy the `workers/beemax-core` project using your existing trusted deployment pipeline or Cloudflare's connected Git deployment. Do not deploy this subdirectory as if it were the root `planetary-max` Worker.
3. Verify `GET /health` returns `{ "ok": true }`.
4. Verify a protected QAL route rejects a missing signature and accepts a correctly signed request for the seeded default node. Sign the canonical string documented in `src/verifier.ts`; include the exact path and query string and SHA-256 hash of the raw body.
5. Verify unauthenticated `POST /registry/rotate` is rejected. Then submit an authorized rotation with `expectedVersion: 1`; confirm the response includes only version metadata and the next-key expiry, not secret values.
6. During the grace period, verify the pending secret is accepted and an invalid/expired pending secret is rejected. After expiry, the rotation state machine promotes the pending secret when the next authorized rotation occurs.

The test suite includes unit checks for bootstrap fail-closed behavior, authorization, version conflicts, pending-key expiry, and metadata not revealing secret values. Run it in a trusted development/CI environment before deployment.

## Security limitations

- The bootstrap path seeds only the configured default node and only if `QAL_SECRET` is present and meets the minimum length. Remove the legacy secret after successful migration and provisioning.
- The current `NodeRegistryDO` singleton serializes registry operations. Plan migrations and backups before operational use.
- Timestamp freshness alone does not prevent replay of an identical signed request within the acceptance window. Any future state-changing endpoint must enforce a durable idempotency key and authorization at the operation layer.
- This registry provides node authentication, not human user sessions or an economic ledger.
