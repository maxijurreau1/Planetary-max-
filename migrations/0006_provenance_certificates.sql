CREATE TABLE IF NOT EXISTS provenance_certificates (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  artwork_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  edition_string TEXT NOT NULL,
  hash_signature TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES marketplace_orders(id),
  FOREIGN KEY (artwork_id) REFERENCES artworks(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_provenance_owner ON provenance_certificates (owner_id, order_id);
