# BEEMAX Core Worker deployment notes

This folder is a separate Worker from the repository's root `planetary-max` Worker. Deploying it does not automatically change the root Worker or its QAL middleware.

## Configure secrets and origin

In the Cloudflare dashboard, configure encrypted Worker secrets for `REGISTRY_INTERNAL_TOKEN`, `OPERATOR_ADMIN_TOKEN`, and (only during legacy migration) `QAL_SECRET`. Keep all secrets out of Wrangler vars, source files, commits, and browser code.

Set `ALLOWED_ORIGIN` to the exact HTTPS origin serving the console (scheme and host, no path or trailing slash). The secure session and WebSocket routes fail closed if this is missing, invalid, or does not exactly match the request's `Origin` header. Do not use the example domain as a production value.

The secure-session methods `verifyRealUserSession` and `checkUserNodeAuthorization` intentionally deny access until connected to the application's real user-session and node-ACL systems. Configure those integrations before expecting session issuance to work. Do not replace these fail-closed defaults with allow-all or hard-coded user/node lists.

`DEFAULT_NODE_ID` is a non-secret Wrangler variable. `QAL_SECRET` is a secret used only for one-time bootstrap of that configured node.

## Deploy and verify

1. Deploy this subdirectory as the separate `beemax-core` Worker, not as the repository root Worker.
2. Apply the `v2-secure-registry` Durable Object migration after the existing `v1-node-registry` migration.
3. Run the tests in a trusted development/CI environment. The secure registry tests assert that session issuance remains denied until real authentication is wired.
4. Verify `/health`, then verify cross-origin and missing-origin session/upgrade requests are rejected. Verify unauthenticated session issuance is rejected and no ticket is stored.
5. After integrating real identity and ACL checks, verify an authorized user can obtain a single-use HttpOnly upgrade ticket for an allowed node, connect once, and cannot reuse the ticket. Verify expired tickets and socket sessions are rejected.

## Security limitations

- WebSocket frames are authorized by the authenticated socket attachment; this code does not perform per-frame HMAC. Add operation-specific authorization and durable idempotency before implementing state-changing event handlers.
- The current `NodeRegistryDO` singleton serializes registry operations. Plan migrations and backups before operational use.
- Timestamp freshness and nonce storage are replay defenses for frames but do not replace operation-level idempotency for business actions.
- This registry provides node authentication, not human user sessions or an economic ledger.
