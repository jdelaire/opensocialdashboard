CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  followers INTEGER NULL,
  measurement_kind TEXT NOT NULL DEFAULT 'exact',
  method TEXT NOT NULL,
  confidence TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  raw_excerpt TEXT NULL,
  collected_at TEXT NOT NULL,
  UNIQUE(account_id, date),
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_date ON snapshots(account_id, date DESC);
