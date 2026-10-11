-- Concierge schema v5: add default topic category "Security".

INSERT INTO categories (id, name, color, kind, sort_order, builtin)
SELECT lower(hex(randomblob(16))), 'Security', '#6366f1', 'topic',
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = 'security');