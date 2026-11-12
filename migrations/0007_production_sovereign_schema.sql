-- Production marketplace extensions adapted to the existing D1 schema.
-- Earlier migrations already define users, artworks, marketplace_orders,
-- artwork_editions, and provenance_certificates, so this migration extends
-- those tables instead of recreating them.

-- Preserve existing username-based accounts. New account flows should populate
-- email and password_salt; legacy rows remain nullable until upgraded.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN public_key TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Extend the existing artwork catalog without changing its established status
-- values or artist-profile relationship.
ALTER TABLE artworks ADD COLUMN currency TEXT NOT NULL DEFAULT 'DAT';
ALTER TABLE artworks ADD COLUMN metadata_hash TEXT;
ALTER TABLE artworks ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
CREATE INDEX IF NOT EXISTS idx_artworks_artist_id ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);

-- Limited-edition slots are created by migration 0005. Add the update timestamp
-- and retain its existing uniqueness and inventory constraints.
ALTER TABLE artwork_editions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
CREATE INDEX IF NOT EXISTS idx_artwork_editions_base_id ON artwork_editions(artwork_base_id);
CREATE INDEX IF NOT EXISTS idx_artwork_editions_owner_id ON artwork_editions(owner_id);

-- Add escrow-related order details to the existing marketplace order table.
ALTER TABLE marketplace_orders ADD COLUMN edition_id TEXT REFERENCES artwork_editions(id) ON DELETE RESTRICT;
ALTER TABLE marketplace_orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'DAT';
ALTER TABLE marketplace_orders ADD COLUMN escrow_expires_at TEXT;
ALTER TABLE marketplace_orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
CREATE INDEX IF NOT EXISTS idx_orders_artwork_id ON marketplace_orders(artwork_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON marketplace_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON marketplace_orders(payment_status);

-- Require a single active reservation per artwork edition. Migration 0005
-- already creates the equivalent partial uniqueness constraint while allowing
-- legacy NULL edition numbers and cancelled/failed orders.

CREATE TABLE IF NOT EXISTS escrow_signatures (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  signer_id TEXT NOT NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('buyer', 'artist', 'admin')),
  signature_hash TEXT NOT NULL,
  signed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (order_id) REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (signer_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (order_id, signer_id)
);
CREATE INDEX IF NOT EXISTS idx_escrow_signatures_order_id ON escrow_signatures(order_id);

-- Migration 0006 already defines provenance_certificates. Extend it with the
-- protocol version and enforce unique certificate hashes.
ALTER TABLE provenance_certificates ADD COLUMN protocol_version TEXT NOT NULL DEFAULT 'DAT-JURREAUISM-v1';
CREATE UNIQUE INDEX IF NOT EXISTS idx_provenance_hash ON provenance_certificates(hash_signature);
CREATE INDEX IF NOT EXISTS idx_provenance_artwork_id ON provenance_certificates(artwork_id);
CREATE INDEX IF NOT EXISTS idx_provenance_owner_id ON provenance_certificates(owner_id);

-- Optional append-only audit events for marketplace and edge state transitions.
CREATE TABLE IF NOT EXISTS beemax_ledger_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  payload_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_beemax_events_entity ON beemax_ledger_events(entity_type, entity_id);
