import {
  AppSettings,
  Category,
  Email,
  MAX_AUTO_PEOPLE,
  PERSON_CATEGORY_COLORS,
  SyncProgress,
} from "../types";
import {
  backfillPersonCategory,
  countEmails,
  countUncategorized,
  createCategory,
  emailExists,
  getPersonMentionCounts,
  getSyncState,
  getUncategorizedEmails,
  listCategories,
  persistClassificationBatch,
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

const META_BATCH = 500;
const CLASSIFY_BATCH = 50;
/** Rebuild the top-N auto people every N batches (~500 emails) as mentions accrue. */
const BOOTSTRAP_EVERY = 10;
/** Parallel AI calls per batch. Bodies are prefetched, so this is AI-bound. */
const CLASSIFY_CONCURRENCY = 16;
/** Fast/cheap model for people extraction — entity names don't need a reasoning model. */
const PEOPLE_MODEL = "deepseek/deepseek-v4.1-flash";
// ─── Sync (IMAP, metadata-first) ────────────────────────────────────────────

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

// ─── People: who the email is ABOUT (AI entity detection) ──────────────────

interface ExtractedPerson {
  name: string;
  email?: string;
}

export function peopleSystemPrompt(): string {
  return `Identify the people an email is ABOUT — the people central to its content (mentioned, scheduled, discussed, the reason it was written). Use the BODY, not just the From header. Ignore companies, brands, products, and mailing lists unless they are a specific person.

Return ONLY valid JSON (no markdown fences) in this exact shape:
{"people":[{"name":"Full Name","email":"email or null"}]}

- At most 3 people, most important first.
- If the email isn't about any specific person, return {"people":[]}.`;
}

export function peopleUserPrompt(email: Email, body: string): string {
  return `FROM: ${email.fromName} <${email.fromEmail}>
SUBJECT: ${email.subject}
DATE: ${email.date ?? "unknown"}

BODY:
${body.slice(0, 8000) || email.snippet || "(empty)"}`;
}

async function extractPeopleWithAI(
  settings: AppSettings,
  email: Email,
  body: string
): Promise<ExtractedPerson[]> {
  try {
    const raw = await openRouterChat(
      settings.openRouterApiKey,
      PEOPLE_MODEL,
      [
        { role: "system", content: peopleSystemPrompt() },
        { role: "user", content: peopleUserPrompt(email, body) },
      ],
      { json: true, maxTokens: 200 }
    );
    const parsed = parseJson(raw);
    const ppl = (parsed.people as Array<{ name?: string; email?: string }> | undefined) ?? [];
    const out: ExtractedPerson[] = [];
    for (const p of ppl) {
      const name = (p.name ?? "").trim();
      if (!name) continue;
      out.push({ name, email: (p.email ?? "").trim() || undefined });
    }
    return out.slice(0, 3);
  } catch (err) {
    console.warn("people extraction failed:", err);
    return [];
  }
}

/** Match an extracted person to an existing person category (email first, then name). */
export function matchPersonToCategory(
  p: ExtractedPerson,
  personCats: Category[]
): Category | undefined {
  if (p.email) {
    const byEmail = personCats.find(
      (c) => c.personEmail && c.personEmail.toLowerCase() === p.email!.toLowerCase()
    );
    if (byEmail) return byEmail;
  }
  const pName = p.name.toLowerCase();
  const byName = personCats.find(
    (c) => c.name.toLowerCase() === pName && (!c.personEmail || !p.email || c.personEmail.toLowerCase() === p.email.toLowerCase())
  );
  return byName;
}

/** Create/backfill person categories for the top-MOST-mentioned people (cap
 *  MAX_AUTO_PEOPLE total auto people). Adds what's missing, then assigns the
 *  accumulated mentions to them. */
async function bootstrapPeople(): Promise<number> {
  const categories = await listCategories();
  const peopleCats = categories.filter((c) => c.kind === "person");
  const room = Math.max(0, MAX_AUTO_PEOPLE - peopleCats.length);
  if (room === 0) return 0;

  const counts = await getPersonMentionCounts();
  let created = 0;

  for (const row of counts) {
    if (created >= room) break;

    const taken = peopleCats.some((c) => {
      if (c.personEmail && row.email && c.personEmail.toLowerCase() === row.email.toLowerCase()) {
        return true;
      }
      return c.name.toLowerCase() === row.name.toLowerCase();
    });
    if (taken) continue;

    const color = PERSON_CATEGORY_COLORS[created % PERSON_CATEGORY_COLORS.length];
    const cat = await createCategory({
      name: row.name,
      color,
      kind: "person",
      personEmail: row.email,
    });
    await backfillPersonCategory(cat);
    peopleCats.push(cat);
    created++;
  }
  return created;
}

// ─── Classification (topics via Jev/DeepSeek + people via DeepSeek) ────────

export function classifySystemPrompt(topicNames: string[]): string {
  const list = topicNames.map((n, i) => `${i + 1}. ${n}`).join("\n");
  return `You are a mail triage assistant. Classify the email in the next message into zero or more of these categories:

${list}

Return ONLY valid JSON (no markdown fences, no commentary) in this exact shape:
{"categories":[{"name":"Category Name","confidence":0.0}],"people":[{"name":"Person Name","email":"email or null"}]}

Rules:
- "confidence" is 0.0–1.0 (how sure you are this category applies).
- Include only categories that genuinely apply; return an empty array if none do.
- Do not invent new category names — only use the exact names above.
- "people" = the people this email is ABOUT (central to its content — use the body, not just the From header). Ignore companies/brands/mailing lists unless they are a specific person. At most 3, most important first; empty array if none.`;
}

export function classifyUserPrompt(email: Email, body: string): string {
  return `FROM: ${email.fromName} <${email.fromEmail}>
SUBJECT: ${email.subject}
DATE: ${email.date ?? "unknown"}

BODY:
${body.slice(0, 6000) || email.snippet || "(empty)"}`;
}

export function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function mapLimitCollect<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Should we spend an AI call extracting people for this email? Once the top-N
 *  person categories exist, only bother when one of them might actually appear —
 *  the AI then confirms "about", and we skip the call entirely otherwise. */
export function shouldExtractPeople(email: Email, body: string, personCats: Category[]): boolean {
  if (personCats.length < MAX_AUTO_PEOPLE) return true; // still discovering the top people
  const text = `${email.fromEmail} ${email.fromName} ${email.subject} ${body}`.toLowerCase();
  for (const c of personCats) {
    if (c.personEmail && text.includes(c.personEmail.toLowerCase())) return true;
    const name = c.name.toLowerCase();
    if (name.length >= 3 && text.includes(name)) return true;
    const first = name.split(/\s+/)[0];
    if (first.length >= 3 && text.includes(first)) return true;
  }
  return false;
}

/** Classify one email: topic assignments + extracted people. */
async function classifyEmail(
  settings: AppSettings,
  email: Email,
  body: string,
  topics: Category[],
  nameToId: Map<string, string>,
  personCats: Category[],
  extractPeople: boolean
): Promise<{ assignments: { categoryId: string; confidence: number }[]; people: ExtractedPerson[] }> {
  let people: ExtractedPerson[] = [];

  if (settings.classifier === "jev") {
    // Topics (Jev) and people (DeepSeek) used to run one-after-the-other; now
    // they run IN PARALLEL. People extraction is skipped entirely when no known
    // person appears in the email — the common case for newsletters/spam.
    const [jevRes, extracted] = await Promise.all([
      classifyEmailWithJev(settings.openRouterApiKey, email, body, topics),
      extractPeople
        ? extractPeopleWithAI(settings, email, body)
        : Promise.resolve<ExtractedPerson[]>([]),
    ]);
    people = extracted;

    const assignments = jevRes
      .filter((r) => r.confidence >= JEV_YES_THRESHOLD)
      .map((r) => ({ categoryId: r.categoryId, confidence: r.confidence }));
    for (const p of people) {
      const cat = matchPersonToCategory(p, personCats);
      if (cat && !assignments.some((a) => a.categoryId === cat.id)) {
        assignments.push({ categoryId: cat.id, confidence: 1.0 });
      }
    }
    return { assignments, people };
  }

  // DeepSeek: one call returns categories AND people. Stable instructions go in
  // a system message (cacheable across the thousands of calls); the email is the
  // user message so the cacheable prefix stays identical call-to-call.
  const raw = await openRouterChat(
    settings.openRouterApiKey,
    settings.openRouterModel,
    [
      { role: "system", content: classifySystemPrompt(topics.map((t) => t.name)) },
      { role: "user", content: classifyUserPrompt(email, body) },
    ],
    { json: true, maxTokens: 400 }
  );
  const parsed = parseJson(raw);

  const out: { categoryId: string; confidence: number }[] = [];
  const cats = (parsed.categories as Array<{ name: string; confidence: number }> | undefined) ?? [];
  for (const item of cats) {
    const id = nameToId.get(item.name.toLowerCase());
    if (!id) continue;
    const confidence = Math.max(0, Math.min(1, Number(item.confidence) || 0.5));
    if (confidence < 0.25) continue;
    if (out.some((a) => a.categoryId === id)) continue;
    out.push({ categoryId: id, confidence });
  }

  const ppl = (parsed.people as Array<{ name?: string; email?: string }> | undefined) ?? [];
  for (const p of ppl) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    const person = { name, email: (p.email ?? "").trim() || undefined };
    people.push(person);
    const cat = matchPersonToCategory(person, personCats);
    if (cat && !out.some((a) => a.categoryId === cat.id)) {
      out.push({ categoryId: cat.id, confidence: 1.0 });
    }
  }

  return { assignments: out, people };
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
  let batches = 0;

  while (true) {
    if (shouldCancel?.()) break;
    const batch = await getUncategorizedEmails(CLASSIFY_BATCH);
    if (batch.length === 0) break;

    const engineLabel =
      settings.classifier === "jev" ? "~typesafe/jev-latest" : settings.openRouterModel;

    // Person categories may grow between batches as bootstrapPeople runs.
    const personCats = (await listCategories()).filter((c) => c.kind === "person");

    // Fetch bodies for the whole batch in ONE IMAP connection (the old code
    // opened a connection per email — the main reason classification felt slow).
    const cfg = imapConfigFromSettings(settings);
    const missingUids = batch.filter((e) => !e.bodyText).map((e) => Number(e.id));
    const bodyMap = new Map<string, string>();
    if (missingUids.length > 0) {
      try {
        const raws = await imapFetchBodies(cfg, missingUids);
        for (const r of raws) {
          bodyMap.set(String(r.uid), rawToBody(r.raw));
        }
        for (const [id, body] of bodyMap) {
          await setEmailBody(id, body);
        }
      } catch (err) {
        // Body fetch is best-effort: fall back to snippets / skip stragglers.
        console.warn(`body prefetch failed for ${missingUids.length} message(s):`, err);
      }
    }

    const results = await mapLimitCollect(batch, CLASSIFY_CONCURRENCY, async (email) => {
      const empty = {
        emailId: email.id,
        assignments: [] as { categoryId: string; confidence: number }[],
        mentions: [] as { name: string; email?: string; confidence: number }[],
      };
      try {
        if (topics.length === 0) return empty;
        const body = email.bodyText ?? bodyMap.get(email.id) ?? email.snippet ?? "";
        const { assignments, people } = await classifyEmail(
          settings,
          email,
          body,
          topics,
          nameToId,
          personCats,
          shouldExtractPeople(email, body, personCats)
        );
        const finalAssignments =
          assignments.length > 0
            ? assignments
            : fallback
              ? [{ categoryId: fallback, confidence: 0.3 }]
              : [];
        return {
          emailId: email.id,
          assignments: finalAssignments,
          mentions: people.map((p) => ({ name: p.name, email: p.email, confidence: 1.0 })),
        };
      } catch (err) {
        // Skip a problematic message instead of aborting the whole pass.
        console.warn(`classification skipped ${email.id}:`, err);
        return empty;
      }
    });

    // Persist the whole batch in a few statements rather than several per email.
    await persistClassificationBatch(batch.map((e) => e.id), results);

    done += batch.length;
    batches++;
    onProgress?.({
      label: `Classifying with ${engineLabel}… ${done.toLocaleString()} / ${Math.max(
        total,
        done,
        1
      ).toLocaleString()}`,
      done,
      total: Math.max(total, done, 1),
    });

    // Let auto-people appear (and backfill) as mentions accumulate.
    if (batches % BOOTSTRAP_EVERY === 0) {
      await bootstrapPeople();
    }
  }

  // Final bootstrap pass with the full mention set.
  await bootstrapPeople();
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

  const summary = await openRouterChat(
    settings.openRouterApiKey,
    settings.openRouterModel,
    [
      {
        role: "system",
        content:
          'Summarize an email in exactly two plain sentences. First sentence: what the email is about. Second sentence: why it needs follow-up, or "no follow-up needed". No preamble, no labels.',
      },
      {
        role: "user",
        content: `FROM: ${email.fromName} <${email.fromEmail}>
SUBJECT: ${email.subject}

${body.slice(0, 8000) || email.snippet || "(empty)"}`,
      },
    ],
    { maxTokens: 200 }
  );
  const cleaned = summary.replace(/```/g, "").trim();
  await setEmailSummary(email.id, cleaned);
  return cleaned;
}