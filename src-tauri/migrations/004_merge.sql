-- Concierge schema v4: category merging (alias → parent pointer).
-- A category with merged_into set is an alias; its mail, counts, and future
-- matches resolve to the parent.

ALTER TABLE categories ADD COLUMN merged_into TEXT;

CREATE INDEX IF NOT EXISTS idx_categories_merged_into ON categories(merged_into);