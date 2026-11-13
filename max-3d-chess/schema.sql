-- MAX 3D Chess match metadata. Gameplay state is persisted by each MatchRoom Durable Object.
CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  player_white TEXT NOT NULL,
  player_black TEXT NOT NULL,
  stake_amount INTEGER NOT NULL DEFAULT 0 CHECK (stake_amount = 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SETTLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Reserved for a future, independently audited payment integration. The game never writes
-- to this table and does not hold, transfer, or promise funds.
CREATE TABLE IF NOT EXISTS sovereign_ledger (
  txn_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(match_id),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  routing_destination TEXT NOT NULL CHECK (routing_destination IN ('TREASURY_RESERVE', 'ESCROW')),
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
