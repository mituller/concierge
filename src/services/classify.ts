import {
  AppSettings,
  Category,
  Email,
  PERSON_CATEGORY_COLORS,
  SyncProgress,
} from "../types";
import {
  assignCategoryToSender,
  assignEmailCategories,
  createCategory,
  emailExists,
  getSenderFrequencies,
  getSyncState,
  getUncategorizedEmails,
  listCategories,
  markEmailClassified,
  countEmails,
  countUncategorized,
  saveSyncState,
  setEmailBody,
  setEmailSummary,
  upsertEmail,
} from "./db";
import {
  hasImapConfig,
  imapConfigFromSettings,
  imapFetchBodies,
  imapFetchMeta,
  metaToEmail,
  rawToBody,
} from "./imap";
import { openRouterChat } from "./openRouter";
import { classifyEmailWithJev, JEV_YES_THRESHOLD } from "./jev";

export type ProgressFn = (p: SyncProgress) => void;

// ─── Sync (IMAP, metadata-first) ────────────────────────────────────────────

const META_BATCH = 300;

/** Full/incremental mailbox sync over IMAP. Metadata only — bodies are fetched
 *  lazily during classification/summarization. Read-only: the Rust backend uses
 *  EXAMINE + BODY.PEEK, so nothing is ever flagged or deleted. */
export async function syncMailbox(
  settings: AppSettings,
  onProgress?: ProgressFn,
  shouldCancel?: () => boolean
): Promise<number> {
  if (!hasImapConfig(settings)) {
    throw new Error("Set your IMAP settings first (Settings → Gmail).");
  }
  const cfg = imapConfigFromSettings(settings);
  const accountId = cfg.email;

  const state = await getSyncState(accountId);
  let lastUid = state?.nextPageToken ? Number(state.nextPageToken) : 0;
  let added = 0;
  let mailboxTotal = 0;

  while (true) {
    if (shouldCancel?.()) break;

    const { total, messages } = await imapFetchMeta(cfg, lastUid, META_BATCH);
    if (total > 0) mailboxTotal = total;
    if (messages.length === 0) break;

    for (const meta of messages) {
      if (meta.uid > lastUid) lastUid = meta.uid;
      if (await emailExists(String(meta.uid))) continue;
      await upsertEmail(metaToEmail(cfg, meta));
      added++;
    }

    const synced = await countEmails();
    onProgress?.({
      label: `Syncing ${cfg.email}… ${synced.toLocaleString()} / ${(
        mailboxTotal || synced
      ).toLocaleString()}`,
      done: synced,
      total: mailboxTotal || synced,
    });
    await saveSyncState(accountId, { nextPageToken: String(lastUid) });

    if (messages.length < META_BATCH) break;
  }

  await saveSyncState(accountId, {
    lastSyncAt: new Date().toISOString(),
    nextPageToken: String(lastUid),
  });
  return added;
}

// ─── Auto person categories (sender frequency, no AI) ──────────────────────

export async function autoCreatePeople(settings: AppSettings): Promise<number> {
  const freqs = await getSenderFrequencies(Math.max(1, settings.personThreshold));
  const categories = await listCategories();
  const existing = new Set(
    categories.filter((c) => c.kind === "person").map((c) => c.personEmail?.toLowerCase())
  );

  let created = 0;
  for (const f of freqs) {
    const key = f.fromEmail.toLowerCase();
    if (existing.has(key)) continue;

    // Avoid names that collide with an existing topic category.
    if (categories.some((c) => c.name.toLowerCase() === f.fromName.toLowerCase())) continue;

    const color = PERSON_CATEGORY_COLORS[created % PERSON_CATEGORY_COLORS.length];
    const cat = await createCategory({
      name: f.fromName,
      color,
      kind: "person",
      personEmail: f.fromEmail,
    });
    await assignCategoryToSender(f.fromEmail, cat.id);
    existing.add(key);
    created++;
  }
  return created;
}

// ─── Classification (Jev or DeepSeek Pro) ───────────────────────────────────

function buildClassifyPrompt(email: Email, body: string, topicNames: string[]): string {
  const list = topicNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
  return `You are a mail triage assistant. Classify the email below into zero or more of these categories:

${list}

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{"categories":[{"name":"Category Name","confidence":0.0}]}

Rules:
- "confidence" is 0.0–1.0 (how sure you are this category applies).
- Include only categories that genuinely apply; return an empty array if none do.
- Do not invent new category names — only use the exact names above.

FROM: ${email.fromName} <${email.fromEmail}>
SUBJECT: ${email.subject}
DATE: ${email.date ?? "unknown"}

BODY:
${body.slice(0, 6000) || email.snippet || "(empty)"}`;
}

function parseJson(raw: string): { categories?: { name: string; confidence: number }[] } {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

async function classifyEmail(
  settings: AppSettings,
  email: Email,
  body: string,
  topics: Category[],
  nameToId: Map<string, string>
): Promise<{ categoryId: string; confidence: number }[]> {
  if (settings.classifier === "jev") {
    const res = await classifyEmailWithJev(settings.openRouterApiKey, email, body, topics);
    return res
      .filter((r) => r.confidence >= JEV_YES_THRESHOLD)
      .map((r) => ({ categoryId: r.categoryId, confidence: r.confidence }));
  }

  const prompt = buildClassifyPrompt(email, body, topics.map((t) => t.name));
  const raw = await openRouterChat(
    settings.openRouterApiKey,
    settings.openRouterModel,
    [{ role: "user", content: prompt }],
    { json: true, maxTokens: 300 }
  );
  const parsed = parseJson(raw);
  const out: { categoryId: string; confidence: number }[] = [];
  for (const item of parsed.categories ?? []) {
    const id = nameToId.get(item.name.toLowerCase());
    if (!id) continue;
    const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0.5));
    if (confidence < 0.25) continue;
    if (out.some((a) => a.categoryId === id)) continue;
    out.push({ categoryId: id, confidence });
  }
  return out;
}

export async function classifyUncategorized(params: {
  settings: AppSettings;
  onProgress?: ProgressFn;
  shouldCancel?: () => boolean;
}): Promise<number> {
  const { settings, onProgress, shouldCancel } = params;
  if (!settings.openRouterApiKey) {
    throw new Error("Set an OpenRouter API key in Settings first.");
  }
  if (settings.classifier === "deepseek" && !settings.openRouterModel) {
    throw new Error("Choose an OpenRouter model in Settings (the DeepSeek classifier needs one).");
  }

  const categories = await listCategories();
  const topics = categories.filter((c) => c.kind === "topic");
  const nameToId = new Map<string, string>();
  for (const t of topics) nameToId.set(t.name.toLowerCase(), t.id);
  const fallback = nameToId.get("other");

  const total = await countUncategorized();
  let done = 0;

  while (true) {
    if (shouldCancel?.()) break;
    const batch = await getUncategorizedEmails(50);
    if (batch.length === 0) break;

    const engineLabel =
      settings.classifier === "jev" ? "~typesafe/jev-latest" : settings.openRouterModel;

    await mapLimit(batch, 3, async (email) => {
      try {
        if (topics.length > 0) {
          const body = await ensureEmailBody(email, settings);
          const assignments = await classifyEmail(settings, email, body, topics, nameToId);
          if (assignments.length === 0 && fallback) {
            assignments.push({ categoryId: fallback, confidence: 0.3 });
          }
          await assignEmailCategories(email.id, assignments);
        }
      } catch (err) {
        // Skip a problematic message instead of aborting the whole pass.
        console.warn(`classification skipped ${email.id}:`, err);
      } finally {
        await markEmailClassified(email.id);
      }
    });

    done += batch.length;
    onProgress?.({
      label: `Classifying with ${engineLabel}… ${done.toLocaleString()} / ${Math.max(
        total,
        done,
        1
      ).toLocaleString()}`,
      done,
      total: Math.max(total, done, 1),
    });
  }

  return done;
}

// ─── Body fetch + summaries ─────────────────────────────────────────────────

async function ensureEmailBody(email: Email, settings: AppSettings): Promise<string> {
  if (email.bodyText) return email.bodyText;
  if (!hasImapConfig(settings)) return email.snippet ?? "";

  const cfg = imapConfigFromSettings(settings);
  const uid = Number(email.id);
  if (!Number.isInteger(uid)) return email.snippet ?? "";

  const raws = await imapFetchBodies(cfg, [uid]);
  const raw = raws.find((r) => r.uid === uid)?.raw;
  if (!raw) return email.snippet ?? "";

  const body = rawToBody(raw);
  await setEmailBody(email.id, body);
  return body;
}

export async function fetchEmailBody(email: Email, settings: AppSettings): Promise<string> {
  return ensureEmailBody(email, settings);
}

export async function summarizeEmail(email: Email, settings: AppSettings): Promise<string> {
  if (email.summary) return email.summary;
  const body = await ensureEmailBody(email, settings);

  const prompt = `Summarize this email in exactly two plain sentences. First sentence: what the email is about. Second sentence: why it needs follow-up, or "no follow-up needed". No preamble, no labels.

FROM: ${email.fromName} <${email.fromEmail}>
SUBJECT: ${email.subject}

${body.slice(0, 8000) || email.snippet || "(empty)"}`;

  const summary = await openRouterChat(
    settings.openRouterApiKey,
    settings.openRouterModel,
    [{ role: "user", content: prompt }],
    { maxTokens: 200 }
  );
  const cleaned = summary.replace(/```/g, "").trim();
  await setEmailSummary(email.id, cleaned);
  return cleaned;
}