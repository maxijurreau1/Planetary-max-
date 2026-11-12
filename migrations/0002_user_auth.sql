CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','operator','admin','auditor','node-agent')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS user_node_permissions (
  user_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator','admin')),
  PRIMARY KEY (user_id, node_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_node_permissions_node ON user_node_permissions(node_id);
