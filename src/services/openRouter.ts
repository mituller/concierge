import { fetch } from "@tauri-apps/plugin-http";
import { load } from "@tauri-apps/plugin-store";

/**
 * OpenRouter model catalog + chat completions.
 *
 * The catalog endpoint (https://openrouter.ai/api/v1/models) is public and
 * returns hundreds of models with per-token pricing. We fetch it through the
 * Tauri http plugin (scoped to https://**) and cache it for 24h so the Settings
 * picker doesn't hammer the API.
 */

export interface OpenRouterModel {
  /** Slug used in API calls, e.g. "deepseek/deepseek-v4.1-flash" */
  id: string;
  /** Human name, e.g. "DeepSeek: DeepSeek Flash Latest" */
  name: string;
  /** USD per 1M input tokens */
  priceIn: number;
  /** USD per 1M output tokens */
  priceOut: number;
  contextLength: number;
}

/** Curated "Recommended" list, ordered. DeepSeek V4.1 Flash first — pinned
 *  explicitly so you always know which version runs (the `~…-latest` alias
 *  silently follows new releases). */
export const RECOMMENDED_MODEL_IDS = [
  "deepseek/deepseek-v4.1-flash",
  "~deepseek/deepseek-flash-latest",
  "~deepseek/deepseek-pro-latest",
  "~anthropic/claude-sonnet-latest",
  "~openai/gpt-luna-latest",
  "~google/gemini-flash-latest",
  "~anthropic/claude-haiku-latest",
  "~x-ai/grok-latest",
  "~z-ai/glm-latest",
  "meta-llama/llama-4-maverick",
  "~moonshotai/kimi-latest",
];

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE = "openrouter-catalog.json";

let memCache: { fetchedAt: number; models: OpenRouterModel[] } | null = null;

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseModel(raw: Record<string, unknown>): OpenRouterModel {
  const id = String(raw.id ?? "");
  const pricing = (raw.pricing ?? {}) as Record<string, unknown>;
  const perToken = (v: unknown): number => {
    if (typeof v !== "string") return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n * 1_000_000 : 0;
  };
  return {
    id,
    name: String(raw.name ?? id),
    priceIn: perToken(pricing.prompt),
    priceOut: perToken(pricing.completion),
    contextLength: Number(raw.context_length ?? 0),
  };
}

interface CatalogPage {
  data?: Array<Record<string, unknown>>;
  links?: { next?: string | null };
}

async function fetchCatalogPages(): Promise<OpenRouterModel[]> {
  let next: string | null = `${CATALOG_URL}?limit=1000`;
  let models: OpenRouterModel[] = [];
  let pages = 0;
  while (next && pages < 5) {
    const url = next.startsWith("http") ? next : `https://openrouter.ai${next}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: could not load the model list`);
    const body = (await res.json()) as CatalogPage;
    models.push(...(body.data ?? []).map(parseModel));
    next = body.links?.next ?? null;
    pages++;
  }
  return models;
}

// ─── Caching ────────────────────────────────────────────────────────────────

async function readDiskCache(): Promise<{ fetchedAt: number; models: OpenRouterModel[] } | null> {
  try {
    const store = await load(CACHE_FILE);
    return (await store.get<{ fetchedAt: number; models: OpenRouterModel[] }>("catalog")) ?? null;
  } catch {
    return null;
  }
}

async function writeDiskCache(payload: { fetchedAt: number; models: OpenRouterModel[] }) {
  try {
    const store = await load(CACHE_FILE);
    await store.set("catalog", payload);
  } catch {
    /* cache is best-effort; picker works without it */
  }
}

export async function getOpenRouterCatalog(force = false): Promise<OpenRouterModel[]> {
  const now = Date.now();
  if (!force) {
    if (memCache && now - memCache.fetchedAt < CACHE_TTL_MS) return memCache.models;
    const disk = await readDiskCache();
    if (disk && now - disk.fetchedAt < CACHE_TTL_MS) {
      memCache = disk;
      return disk.models;
    }
  }

  try {
    const models = await fetchCatalogPages();
    const payload = { fetchedAt: now, models };
    memCache = payload;
    await writeDiskCache(payload);
    return models;
  } catch (e) {
    const stale = memCache ?? (await readDiskCache());
    if (stale && stale.models.length > 0) return stale.models;
    throw e;
  }
}

export async function lookupOpenRouterModel(id: string): Promise<OpenRouterModel | null> {
  const parts = id.split("/");
  if (parts.length < 2) return null;
  const [author, ...rest] = parts;
  const url = `https://openrouter.ai/api/v1/model/${encodeURIComponent(author)}/${encodeURIComponent(rest.join("/"))}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    return body.data ? parseModel(body.data) : null;
  } catch {
    return null;
  }
}

export function formatModelPrice(m: OpenRouterModel): string {
  const usd = (v: number): string => {
    if (v <= 0) return "";
    const s = v < 1 ? v.toFixed(3) : v.toFixed(2);
    return "$" + s.replace(/0+$/, "").replace(/\.$/, "");
  };
  const inS = usd(m.priceIn);
  const outS = usd(m.priceOut);
  if (!inS && !outS) return "";
  return `${inS || "?"} in · ${outS || "?"} out /1M`;
}

// ─── Chat completions (DeepSeek via OpenRouter) ─────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  /** Request JSON output and instruct the model to return only JSON. */
  json?: boolean;
}

/**
 * OpenAI-compatible chat completion through OpenRouter. The app's webview
 * already has blanket `https://**` HTTP scope (see capabilities).
 */
export async function openRouterChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 1024,
  };
  if (options.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Concierge",
      "HTTP-Referer": "https://github.com/mituller/concierge",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
  };

  const message = data.choices?.[0]?.message;
  return message?.content?.trim() || message?.reasoning?.trim() || "";
}

/** Verify the model slug exists on OpenRouter before relying on it. */
export function hasOpenRouterConfig(apiKey: string, model: string): boolean {
  return !!(apiKey && model);
}