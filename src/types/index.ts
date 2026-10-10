// ─── Concierge domain types ────────────────────────────────────────────────

export type Theme = "light" | "dark" | "automatic";
export type CategoryKind = "topic" | "person";

/** Which engine classifies emails: Jev (typed yes/no, cheap) or DeepSeek (chat + JSON). */
export type ClassifierEngine = "jev" | "deepseek";

export interface EmailAccount {
  id: string;
  provider: "gmail";
  email: string;
  label?: string;
  refreshToken?: string;
  accessToken?: string;
  accessTokenAt?: string;
  createdAt: string;
}

export interface Email {
  id: string;
  accountId: string;
  threadId?: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  date?: string;      // ISO-8601
  snippet?: string;
  bodyText?: string;
  unread: boolean;
  summary?: string;
  categoryIds: string[];
  confidences: Record<string, number>;
  createdAt: string;
  fetchedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  kind: CategoryKind;
  personEmail?: string;   // sender email (person categories only)
  sortOrder: number;
  builtin: boolean;
}

export interface TopicCategorySeed {
  name: string;
  color: string;
}

export interface AppSettings {
  theme: Theme;
  userName: string;
  // IMAP (read-only) connection — Gmail app password recommended
  imapHost: string;
  imapPort: number;
  imapEmail: string;
  imapPassword: string;
  imapFolder: string;
  // Classification engine: Jev (Decisions API) or DeepSeek (chat + JSON).
  // Summaries always use the OpenRouter chat model below.
  classifier: ClassifierEngine;
  // DeepSeek via OpenRouter (summaries + deepseek classifier)
  openRouterApiKey: string;
  openRouterModel: string;
  // A sender becomes an auto person-category once seen this many times
  personThreshold: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "automatic",
  userName: "",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapEmail: "",
  imapPassword: "",
  imapFolder: "INBOX",
  classifier: "jev",
  openRouterApiKey: "",
  openRouterModel: "deepseek/deepseek-v4.1-flash",
  personThreshold: 5,
};

export const DEFAULT_TOPIC_CATEGORIES: TopicCategorySeed[] = [
  { name: "Follow-up required", color: "#f59e0b" },
  { name: "Potential spam", color: "#ef4444" },
  { name: "Billing", color: "#3b82f6" },
  { name: "Sales", color: "#f97316" },
  { name: "Health", color: "#14b8a6" },
  { name: "Personal", color: "#ec4899" },
  { name: "Newsletters / promotions", color: "#a855f7" },
  { name: "Invoices / receipts", color: "#10b981" },
  { name: "Other", color: "#6b7280" },
];

/** Max auto-created person categories (the top-N by how often they're the
 *  *subject* of your mail). Add more people manually in Settings. */
export const MAX_AUTO_PEOPLE = 10;

export const PERSON_CATEGORY_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
  "#f43f5e",
  "#84cc16",
];

// ─── Dashboard / chart types ────────────────────────────────────────────────

export interface DashboardStats {
  total: number;
  unread: number;
  categorized: number;
  lastSyncAt?: string;
}

export interface TrendPoint {
  month: string; // "YYYY-MM"
  count: number;
}

export interface TrendSeries {
  categoryId: string;
  name: string;
  color: string;
  points: TrendPoint[];
}

export interface SyncProgress {
  label: string;
  done: number;
  total: number;
}