# Secure session authentication and node authorization

The secure-session implementation uses three Worker bindings:

- `DB`: the D1 database containing `users`, `nodes`, and `user_node_permissions`.
- `SESSION_KV`: the KV namespace used to mark revoked sessions.
- `JWT_SECRET`: an encrypted Worker secret containing the HS256 signing key.

Configure the D1 database and KV namespace IDs for the **beemax-core Worker** in its Wrangler configuration or dashboard. Resource IDs were not included in the repository changes, so no fictitious IDs are committed. Set `JWT_SECRET` with `wrangler secret put JWT_SECRET` or the Cloudflare dashboard. The session JWT must be signed with HS256 and include `sub`, `jti`, and integer `exp` claims. Revocation markers use `session:active:<sub>:<jti>` with value `revoked`.

The D1 authorization query requires an active user and an ACL row with role `operator` or `admin` for the requested registered node. `viewer` permissions do not authorize a console session. Database and KV failures fail closed.

The configured `ALLOWED_ORIGIN` must be the exact HTTPS console origin. Do not copy an example hostname into production. Session issuance remains unavailable until all required bindings, JWT secret, and origin are configured.

Run the worker tests and apply the existing Durable Object migration sequence before deploying. This is a separate Worker from the repository root Worker.
