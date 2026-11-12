-- Limited-edition inventory and order edition tracking.
ALTER TABLE artworks ADD COLUMN edition_number INTEGER NOT NULL DEFAULT 1 CHECK (edition_number >= 1);
ALTER TABLE artworks ADD COLUMN total_editions INTEGER NOT NULL DEFAULT 1 CHECK (total_editions >= 1 AND edition_number <= total_editions);
ALTER TABLE marketplace_orders ADD COLUMN edition_number INTEGER;

CREATE TABLE IF NOT EXISTS artwork_editions (
  id TEXT PRIMARY KEY,
  artwork_base_id TEXT NOT NULL,
  edition_number INTEGER NOT NULL CHECK (edition_number >= 1),
  total_editions INTEGER NOT NULL CHECK (total_editions >= 1 AND edition_number <= total_editions),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold')),
  owner_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (artwork_base_id) REFERENCES artworks(id),
  FOREIGN KEY (owner_id) REFERENCES users(id),
  UNIQUE (artwork_base_id, edition_number)
);

-- Preserve existing single-piece inventory status as edition #1 during migration.
INSERT OR IGNORE INTO artwork_editions (id, artwork_base_id, edition_number, total_editions, status)
SELECT id || ':edition:1', id, 1, total_editions,
       CASE WHEN status IN ('reserved', 'sold') THEN status ELSE 'available' END
FROM artworks;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_active_artwork_edition
ON marketplace_orders (artwork_id, edition_number)
WHERE edition_number IS NOT NULL AND payment_status NOT IN ('cancelled', 'failed');
CREATE INDEX IF NOT EXISTS idx_artwork_editions_status ON artwork_editions (artwork_base_id, status, edition_number);
