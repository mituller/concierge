-- Concierge schema (v1). All timestamps are ISO-8601 strings.

CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email TEXT NOT NULL,
  label TEXT,
  refresh_token TEXT,
  access_token TEXT,
  access_token_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,            -- Gmail message id
  account_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  from_email TEXT,
  date TEXT,                      -- ISO date (from Gmail internalDate)
  snippet TEXT,
  body_text TEXT,
  unread INTEGER NOT NULL DEFAULT 1,
  summary TEXT,                   -- cached DeepSeek summary (on-demand)
  classified INTEGER NOT NULL DEFAULT 0,  -- 1 once classification has run (even if no category matched)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'topic',   -- 'topic' | 'person'
  person_email TEXT,                    -- sender email (person categories only)
  sort_order INTEGER NOT NULL DEFAULT 0,
  builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS email_categories (
  email_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (email_id, category_id)
);

CREATE TABLE IF NOT EXISTS sync_state (
  account_id TEXT PRIMARY KEY,
  last_sync_at TEXT,
  next_page_token TEXT,           -- resume a partially-completed full sync
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date);
CREATE INDEX IF NOT EXISTS idx_emails_classified ON emails(classified);
CREATE INDEX IF NOT EXISTS idx_emails_from_email ON emails(from_email);
CREATE INDEX IF NOT EXISTS idx_email_categories_category ON email_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_email_categories_email ON email_categories(email_id);
CREATE INDEX IF NOT EXISTS idx_categories_kind ON categories(kind);