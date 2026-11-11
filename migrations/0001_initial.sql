-- Core mesh tables
CREATE TABLE IF NOT EXISTS node_telemetry (
  node_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  mesh_region TEXT NOT NULL,
  dat_balance REAL NOT NULL DEFAULT 0.0,
  last_heartbeat INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS planetary_assets (
  asset_id TEXT PRIMARY KEY,
  creator TEXT NOT NULL DEFAULT 'MaxJ',
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  quantum_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mesh_transactions (
  tx_id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount REAL NOT NULL,
  timestamp INTEGER NOT NULL
);

-- Quantum Authentication Layer tables
CREATE TABLE IF NOT EXISTS qal_nodes (
  node_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  trust_tier TEXT NOT NULL DEFAULT 'STANDARD',
  registered_at INTEGER NOT NULL,
  last_authenticated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS qal_sessions (
  session_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  auth_token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  FOREIGN KEY (node_id) REFERENCES qal_nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qal_sessions_node ON qal_sessions(node_id);
CREATE INDEX IF NOT EXISTS idx_qal_sessions_expiry ON qal_sessions(expires_at);
