-- Concierge schema v3: add default topic category "Invoices / receipts".

INSERT INTO categories (id, name, color, kind, sort_order, builtin)
SELECT lower(hex(randomblob(16))), 'Invoices / receipts', '#10b981', 'topic',
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = 'invoices / receipts');