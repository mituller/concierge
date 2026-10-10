-- Concierge schema v2: AI-extracted people mentions (who an email is *about*)
-- plus new default topic categories (Sales, Health).

CREATE TABLE IF NOT EXISTS person_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT NOT NULL,
  person_email TEXT,                 -- canonical email when known (lowercased)
  person_name TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0
);

CREATE INDEX IF NOT EXISTS idx_person_mentions_email ON person_mentions(email_id);
CREATE INDEX IF NOT EXISTS idx_person_mentions_person ON person_mentions(person_email, person_name);

-- New default topic categories for existing installs (no-op if already present).
INSERT INTO categories (id, name, color, kind, sort_order, builtin)
SELECT lower(hex(randomblob(16))), 'Sales', '#f97316', 'topic',
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = 'sales');

INSERT INTO categories (id, name, color, kind, sort_order, builtin)
SELECT lower(hex(randomblob(16))), 'Health', '#14b8a6', 'topic',
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = 'health');