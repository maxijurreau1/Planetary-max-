# Secure session authentication and node authorization

The secure-session verifier requires these Worker bindings:

- `DB`: the D1 database containing `users`, `nodes`, and `user_node_permissions`.
- `SESSION_KV`: the KV namespace used to register active sessions. A valid session must have `session:active:<userId>:<jti>` set to `active`; missing KV records fail closed.
- `JWT_SECRET`: an encrypted Worker secret containing at least 32 bytes of cryptographically random key material.
- `JWT_ISSUER` and `JWT_AUDIENCE`: exact, non-secret expected JWT claim values configured for the Worker.

Configure the D1 database and KV namespace IDs for the **beemax-core Worker** in its Wrangler configuration or dashboard. Keep secrets out of Wrangler variables, source files, commits, and browser code. Do not use the example issuer values from development tests in production.

The D1 authorization query requires an active user and an ACL row with role `operator` or `admin` for the requested registered node. JWT role claims do not replace this node-level authorization check. Database errors and missing rows fail closed.

Session issuance is intentionally not implemented here. Do not add a login endpoint that issues tokens until real credential verification against the application's identity store is integrated. Password hashes must be generated and verified with an established password hashing scheme such as Argon2id or scrypt; ordinary fast hashes are not suitable for passwords. A successful issuer must write the active KV record before setting the HttpOnly, Secure, SameSite cookie, and use the exact same issuer, audience, key format, and TTL constraints as the verifier.

The configured `ALLOWED_ORIGIN` must be the exact HTTPS console origin. Do not copy an example hostname into production. Session and WebSocket ticket issuance remain unavailable until all required bindings, JWT secrets, and the real user/ACL integration are configured.

Run the worker tests and apply the existing Durable Object migration sequence before deploying. This is a separate Worker from the repository root Worker.
