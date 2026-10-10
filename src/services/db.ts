import Database from "@tauri-apps/plugin-sql";
import {
  Category,
  DashboardStats,
  Email,
  EmailAccount,
  TrendSeries,
} from "../types";

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:concierge.db");
  }
  return db;
}

// ─── Row mappers ────────────────────────────────────────────────────────────

type EmailRow = Record<string, unknown>;

function rowToEmail(row: EmailRow): Email {
  return {
    id: row.id as string,
    accountId: row.account_id as string,
    threadId: (row.thread_id as string) || undefined,
    subject: (row.subject as string) || "",
    fromName: (row.from_name as string) || "",
    fromEmail: (row.from_email as string) || "",
    date: (row.date as string) || undefined,
    snippet: (row.snippet as string) || undefined,
    bodyText: (row.body_text as string) || undefined,
    unread: !!row.unread,
    summary: (row.summary as string) || undefined,
    categoryIds: [],
    confidences: {},
    createdAt: row.created_at as string,
    fetchedAt: row.fetched_at as string,
  };
}

function rowToCategory(row: Record<string, unknown>): Category {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    kind: row.kind as Category["kind"],
    personEmail: (row.person_email as string) || undefined,
    sortOrder: Number(row.sort_order ?? 0),
    builtin: !!row.builtin,
  };
}

function rowToAccount(row: Record<string, unknown>): EmailAccount {
  return {
    id: row.id as string,
    provider: (row.provider as EmailAccount["provider"]) || "gmail",
    email: row.email as string,
    label: (row.label as string) || undefined,
    refreshToken: (row.refresh_token as string) || undefined,
    accessToken: (row.access_token as string) || undefined,
    accessTokenAt: (row.access_token_at as string) || undefined,
    createdAt: row.created_at as string,
  };
}

// ─── Accounts ───────────────────────────────────────────────────────────────

export async function listAccounts(): Promise<EmailAccount[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM email_accounts ORDER BY created_at ASC"
  );
  return rows.map(rowToAccount);
}

export async function createAccount(
  input: { email: string; label?: string }
): Promise<EmailAccount> {
  const d = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d.execute(
    `INSERT INTO email_accounts (id, provider, email, label, created_at)
     VALUES ($1, 'gmail', $2, $3, $4)`,
    [id, input.email, input.label ?? null, now]
  );
  return {
    id,
    provider: "gmail",
    email: input.email,
    label: input.label,
    createdAt: now,
  };
}

export async function saveAccountTokens(
  id: string,
  tokens: { refreshToken?: string; accessToken?: string }
): Promise<void> {
  const d = await getDb();
  const now = new Date().toISOString();
  await d.execute(
    `UPDATE email_accounts
     SET refresh_token = COALESCE($1, refresh_token),
         access_token = $2,
         access_token_at = $3
     WHERE id = $4`,
    [tokens.refreshToken ?? null, tokens.accessToken ?? null, now, id]
  );
}

export async function updateAccountToken(
  id: string,
  accessToken: string
): Promise<void> {
  await saveAccountTokens(id, { accessToken });
}

export async function deleteAccount(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM email_categories WHERE email_id IN (SELECT id FROM emails WHERE account_id = $1)", [id]);
  await d.execute("DELETE FROM emails WHERE account_id = $1", [id]);
  await d.execute("DELETE FROM sync_state WHERE account_id = $1", [id]);
  await d.execute("DELETE FROM email_accounts WHERE id = $1", [id]);
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    `SELECT * FROM categories
     ORDER BY CASE kind WHEN 'person' THEN 1 ELSE 0 END, sort_order ASC, name ASC`
  );
  return rows.map(rowToCategory);
}

export async function ensureDefaultCategories(
  seeds: { name: string; color: string }[]
): Promise<void> {
  const d = await getDb();
  const existing = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM categories");
  if ((existing[0]?.n ?? 0) > 0) return;

  for (let i = 0; i < seeds.length; i++) {
    const { name, color } = seeds[i];
    await d.execute(
      `INSERT INTO categories (id, name, color, kind, sort_order, builtin)
       VALUES ($1, $2, $3, 'topic', $4, 1)`,
      [crypto.randomUUID(), name, color, i]
    );
  }
}

export async function createCategory(input: {
  name: string;
  color: string;
  kind: Category["kind"];
  personEmail?: string;
}): Promise<Category> {
  const d = await getDb();
  const id = crypto.randomUUID();
  const rows = await d.select<{ m: number }[]>(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories"
  );
  const sortOrder = (rows[0]?.m ?? -1) + 1;
  await d.execute(
    `INSERT INTO categories (id, name, color, kind, person_email, sort_order, builtin)
     VALUES ($1, $2, $3, $4, $5, $6, 0)`,
    [id, input.name, input.color, input.kind, input.personEmail ?? null, sortOrder]
  );
  return {
    id,
    name: input.name,
    color: input.color,
    kind: input.kind,
    personEmail: input.personEmail,
    sortOrder,
    builtin: false,
  };
}

export async function updateCategory(
  id: string,
  patch: { name?: string; color?: string }
): Promise<void> {
  const d = await getDb();
  if (patch.name !== undefined) {
    await d.execute("UPDATE categories SET name = $1 WHERE id = $2", [patch.name, id]);
  }
  if (patch.color !== undefined) {
    await d.execute("UPDATE categories SET color = $1 WHERE id = $2", [patch.color, id]);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM email_categories WHERE category_id = $1", [id]);
  await d.execute("DELETE FROM categories WHERE id = $1", [id]);
}

// ─── Emails ─────────────────────────────────────────────────────────────────

export async function upsertEmail(email: Email): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR IGNORE INTO emails
       (id, account_id, thread_id, subject, from_name, from_email, date, snippet, body_text, unread, created_at, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      email.id,
      email.accountId,
      email.threadId ?? null,
      email.subject,
      email.fromName,
      email.fromEmail,
      email.date ?? null,
      email.snippet ?? null,
      email.bodyText ?? null,
      email.unread ? 1 : 0,
      email.createdAt,
      email.fetchedAt,
    ]
  );
}

export async function emailExists(id: string): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM emails WHERE id = $1", [id]);
  return (rows[0]?.n ?? 0) > 0;
}

async function attachCategories(emails: Email[]): Promise<void> {
  if (emails.length === 0) return;
  const d = await getDb();
  const ids = emails.map((e) => e.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await d.select<Record<string, unknown>[]>(
    `SELECT ec.email_id, ec.category_id, ec.confidence
     FROM email_categories ec
     WHERE ec.email_id IN (${placeholders})`,
    ids
  );
  const byEmail = new Map<string, string[]>();
  const confByEmail = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const emailId = r.email_id as string;
    const categoryId = r.category_id as string;
    const confidence = Number(r.confidence ?? 1);
    if (!byEmail.has(emailId)) byEmail.set(emailId, []);
    if (!confByEmail.has(emailId)) confByEmail.set(emailId, {});
    byEmail.get(emailId)!.push(categoryId);
    confByEmail.get(emailId)![categoryId] = confidence;
  }
  for (const e of emails) {
    e.categoryIds = byEmail.get(e.id) ?? [];
    e.confidences = confByEmail.get(e.id) ?? {};
  }
}

export async function queryEmailPage(params: {
  categoryId?: string;
  unreadOnly?: boolean;
  offset: number;
  limit: number;
}): Promise<Email[]> {
  const d = await getDb();
  let sql = "SELECT * FROM emails e";
  const clauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.categoryId) {
    sql += " JOIN email_categories ec ON ec.email_id = e.id";
    clauses.push(`ec.category_id = $${i++}`);
    values.push(params.categoryId);
  }
  if (params.unreadOnly) {
    clauses.push(`e.unread = 1`);
  }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");
  sql += " ORDER BY e.date DESC";
  sql += ` LIMIT $${i++} OFFSET $${i++}`;
  values.push(params.limit, params.offset);

  const rows = await d.select<Record<string, unknown>[]>(sql, values);
  const emails = rows.map(rowToEmail);
  await attachCategories(emails);
  return emails;
}

export async function getEmail(id: string): Promise<Email | null> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM emails WHERE id = $1",
    [id]
  );
  if (rows.length === 0) return null;
  const emails = [rowToEmail(rows[0])];
  await attachCategories(emails);
  return emails[0];
}

export async function setEmailSummary(id: string, summary: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE emails SET summary = $1 WHERE id = $2", [summary, id]);
}

/** Cache a lazily-fetched body (only fills it in if it isn't already present). */
export async function setEmailBody(id: string, bodyText: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE emails SET body_text = $1 WHERE id = $2 AND (body_text IS NULL OR body_text = '')",
    [bodyText, id]
  );
}

/** Emails the classifier has not processed yet (the backlog). */
export async function getUncategorizedEmails(limit: number): Promise<Email[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    `SELECT e.* FROM emails e
     WHERE e.classified = 0
     ORDER BY e.date DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map(rowToEmail);
}

export async function countUncategorized(): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM emails WHERE classified = 0"
  );
  return Number(rows[0]?.n ?? 0);
}

export async function markEmailClassified(id: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE emails SET classified = 1 WHERE id = $1", [id]);
}

export async function assignEmailCategory(
  emailId: string,
  categoryId: string,
  confidence: number
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR REPLACE INTO email_categories (email_id, category_id, confidence)
     VALUES ($1, $2, $3)`,
    [emailId, categoryId, confidence]
  );
}

export async function assignEmailCategories(
  emailId: string,
  assignments: { categoryId: string; confidence: number }[]
): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM email_categories WHERE email_id = $1", [emailId]);
  for (const a of assignments) {
    await d.execute(
      `INSERT INTO email_categories (email_id, category_id, confidence)
       VALUES ($1, $2, $3)`,
      [emailId, a.categoryId, a.confidence]
    );
  }
}

export async function persistClassificationBatch(
  allIds: string[],
  entries: {
    emailId: string;
    assignments: { categoryId: string; confidence: number }[];
    mentions: { name: string; email?: string; confidence: number }[];
  }[]
): Promise<void> {
  if (allIds.length === 0) return;
  const d = await getDb();
  const ph = allIds.map((_, i) => `$${i + 1}`).join(",");

  await d.execute(`DELETE FROM email_categories WHERE email_id IN (${ph})`, allIds);
  await d.execute(`DELETE FROM person_mentions WHERE email_id IN (${ph})`, allIds);

  // Assignments — one multi-row INSERT instead of N per-email round-trips.
  const aVals: unknown[] = [];
  const aRows: string[] = [];
  for (const e of entries) {
    for (const a of e.assignments) {
      aRows.push(`($${aVals.length + 1},$${aVals.length + 2},$${aVals.length + 3})`);
      aVals.push(e.emailId, a.categoryId, a.confidence);
    }
  }
  if (aRows.length > 0) {
    await d.execute(
      `INSERT INTO email_categories (email_id, category_id, confidence) VALUES ${aRows.join(",")}`,
      aVals
    );
  }

  // Person mentions.
  const mVals: unknown[] = [];
  const mRows: string[] = [];
  for (const e of entries) {
    for (const m of e.mentions) {
      mRows.push(
        `($${mVals.length + 1},$${mVals.length + 2},$${mVals.length + 3},$${mVals.length + 4})`
      );
      mVals.push(e.emailId, m.email ? m.email.toLowerCase() : null, m.name, m.confidence);
    }
  }
  if (mRows.length > 0) {
    await d.execute(
      `INSERT INTO person_mentions (email_id, person_email, person_name, confidence) VALUES ${mRows.join(",")}`,
      mVals
    );
  }

  // Mark the whole batch classified (including any that errored, so they don't loop).
  await d.execute(`UPDATE emails SET classified = 1 WHERE id IN (${ph})`, allIds);
}

export async function assignCategoryToSender(
  fromEmail: string,
  categoryId: string
): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR IGNORE INTO email_categories (email_id, category_id, confidence)
     SELECT id, $1, 1.0 FROM emails
     WHERE lower(from_email) = lower($2)`,
    [categoryId, fromEmail]
  );
}

// ─── Person mentions (who an email is about — AI-extracted) ────────────────

export interface PersonMention {
  email?: string;
  name: string;
  confidence: number;
}

/** Replace the AI-extracted people mentions for one email. */
export async function storePersonMentions(
  emailId: string,
  mentions: PersonMention[]
): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM person_mentions WHERE email_id = $1", [emailId]);
  for (const m of mentions) {
    await d.execute(
      `INSERT INTO person_mentions (email_id, person_email, person_name, confidence)
       VALUES ($1, $2, $3, $4)`,
      [emailId, m.email ? m.email.toLowerCase() : null, m.name, m.confidence]
    );
  }
}

export interface PersonMentionCount {
  key: string;
  email?: string;
  name: string;
  count: number;
}

/** Top people ranked by how many distinct emails mention them. */
export async function getPersonMentionCounts(limit = 30): Promise<PersonMentionCount[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    `SELECT
       COALESCE(lower(person_email), lower(person_name)) AS key,
       COALESCE(MAX(person_email), '') AS person_email,
       MAX(person_name) AS person_name,
       COUNT(DISTINCT email_id) AS n
     FROM person_mentions
     GROUP BY key
     ORDER BY n DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    key: r.key as string,
    email: (r.person_email as string) || undefined,
    name: r.person_name as string,
    count: Number(r.n),
  }));
}

/** Assign every email whose mentions match this person category (by email or
 *  exact name) to it. Backfills previously-classified emails. */
export async function backfillPersonCategory(cat: Category): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT OR IGNORE INTO email_categories (email_id, category_id, confidence)
     SELECT DISTINCT pm.email_id, $1, $2 FROM person_mentions pm
     WHERE lower(pm.person_email) = lower($3)`,
    [cat.id, 1.0, cat.personEmail ?? null]
  );
  await d.execute(
    `INSERT OR IGNORE INTO email_categories (email_id, category_id, confidence)
     SELECT DISTINCT pm.email_id, $1, $2 FROM person_mentions pm
     WHERE lower(pm.person_name) = lower($3)`,
    [cat.id, 1.0, cat.name]
  );
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const d = await getDb();
  const totals = await d.select<{ total: number; unread: number }[]>(
    "SELECT COUNT(*) AS total, COALESCE(SUM(unread), 0) AS unread FROM emails"
  );
  const categorized = await d.select<{ n: number }[]>(
    "SELECT COUNT(DISTINCT email_id) AS n FROM email_categories"
  );
  const lastSync = await d.select<{ t: string | null }[]>(
    "SELECT MAX(last_sync_at) AS t FROM sync_state"
  );
  return {
    total: Number(totals[0]?.total ?? 0),
    unread: Number(totals[0]?.unread ?? 0),
    categorized: Number(categorized[0]?.n ?? 0),
    lastSyncAt: lastSync[0]?.t ?? undefined,
  };
}

export async function countEmails(): Promise<number> {
  const d = await getDb();
  const rows = await d.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM emails");
  return Number(rows[0]?.n ?? 0);
}

export async function countByCategory(): Promise<{ categoryId: string; count: number }[]> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    `SELECT c.id AS category_id, COUNT(ec.email_id) AS count
     FROM categories c
     LEFT JOIN email_categories ec ON ec.category_id = c.id
     GROUP BY c.id`
  );
  return rows.map((r) => ({
    categoryId: r.category_id as string,
    count: Number(r.count ?? 0),
  }));
}

export async function getTrendByMonth(): Promise<
  { categoryId: string; month: string; count: number }[]
> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    `SELECT ec.category_id AS category_id, substr(e.date, 1, 7) AS month, COUNT(*) AS count
     FROM email_categories ec
     JOIN emails e ON e.id = ec.email_id
     WHERE e.date IS NOT NULL
     GROUP BY category_id, month
     ORDER BY month ASC`
  );
  return rows.map((r) => ({
    categoryId: r.category_id as string,
    month: r.month as string,
    count: Number(r.count ?? 0),
  }));
}

/** Build zero-filled monthly series (last 12 months) per category. */
export function buildTrendSeries(
  raw: { categoryId: string; month: string; count: number }[],
  categories: Category[],
  monthCount = 12
): TrendSeries[] {
  // Generate month keys backwards from the current month.
  const now = new Date();
  const months: string[] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = monthCount - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }

  const byCat = new Map<string, Map<string, number>>();
  for (const r of raw) {
    if (!byCat.has(r.categoryId)) byCat.set(r.categoryId, new Map());
    byCat.get(r.categoryId)!.set(r.month, r.count);
  }

  return categories.map((c) => {
    const counts = byCat.get(c.id) ?? new Map();
    return {
      categoryId: c.id,
      name: c.name,
      color: c.color,
      points: months.map((m) => ({ month: m, count: counts.get(m) ?? 0 })),
    };
  });
}

// ─── Sync state ─────────────────────────────────────────────────────────────

export async function getSyncState(accountId: string): Promise<{
  lastSyncAt?: string;
  nextPageToken?: string;
} | null> {
  const d = await getDb();
  const rows = await d.select<Record<string, unknown>[]>(
    "SELECT * FROM sync_state WHERE account_id = $1",
    [accountId]
  );
  if (rows.length === 0) return null;
  return {
    lastSyncAt: (rows[0].last_sync_at as string) || undefined,
    nextPageToken: (rows[0].next_page_token as string) || undefined,
  };
}

export async function saveSyncState(
  accountId: string,
  state: { lastSyncAt?: string; nextPageToken?: string }
): Promise<void> {
  const d = await getDb();
  const now = new Date().toISOString();
  await d.execute(
    `INSERT INTO sync_state (account_id, last_sync_at, next_page_token, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(account_id) DO UPDATE SET
       last_sync_at = COALESCE($2, last_sync_at),
       next_page_token = $3,
       updated_at = $4`,
    [accountId, state.lastSyncAt ?? null, state.nextPageToken ?? null, now]
  );
}