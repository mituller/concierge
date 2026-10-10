import { useState } from "react";
import { ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { Category, Email } from "../../types";
import { useCategoriesStore } from "../../stores/categories";
import { useSettingsStore } from "../../stores/settings";
import { useInboxStore } from "../../stores/inbox";
import { fetchEmailBody, summarizeEmail } from "../../services/classify";
import { removeEmailCategory } from "../../services/db";

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function EmailRow({ email }: { email: Email }) {
  const [open, setOpen] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>(email.categoryIds);
  const [body, setBody] = useState<string | undefined>(email.bodyText);
  const [summary, setSummary] = useState<string | undefined>(email.summary);
  const [loadingBody, setLoadingBody] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useCategoriesStore((s) => s.categories);
  const settings = useSettingsStore((s) => s.settings);

  const chips = categoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);

  async function handleRemove(categoryId: string) {
    const prev = categoryIds;
    setCategoryIds(prev.filter((id) => id !== categoryId));
    try {
      await removeEmailCategory(email.id, categoryId);
      // Refresh counts so the dashboard cards — and any open category view — update.
      void useInboxStore.getState().refresh();
    } catch (e) {
      setCategoryIds(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadBody() {
    setLoadingBody(true);
    setError(null);
    try {
      const b = await fetchEmailBody(email, settings);
      setBody(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingBody(false);
    }
  }

  async function runSummary() {
    setLoadingSummary(true);
    setError(null);
    try {
      const s = await summarizeEmail(email, settings);
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSummary(false);
    }
  }

  return (
    <div className="border-b border-gray-100 dark:border-gray-700/60">
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-start gap-3 min-w-0 flex-1 text-left"
        >
          <ChevronDown
            size={16}
            className={`shrink-0 mt-0.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {email.fromName || email.fromEmail || "(unknown sender)"}
              </span>
              <span className="text-xs text-gray-400 shrink-0">{fmtDate(email.date)}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{email.subject}</p>
            {email.snippet && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                {email.snippet}
              </p>
            )}
          </div>
        </button>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end shrink-0 max-w-[45%] pt-0.5">
            {chips.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1 py-1 text-xs font-medium"
                style={{ backgroundColor: c.color + "22", color: c.color }}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                {c.name}
                <button
                  type="button"
                  onClick={() => void handleRemove(c.id)}
                  title={`Remove from ${c.name}`}
                  aria-label={`Remove from ${c.name}`}
                  className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-black/10 dark:hover:bg-white/15"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="px-12 pb-4 space-y-3">
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
            {body ? body : "Message body not fetched yet."}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!body && (
              <button
                onClick={() => void loadBody()}
                disabled={loadingBody}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                {loadingBody && <Loader2 size={12} className="animate-spin" />}
                Load body
              </button>
            )}

            {body && !summary && (
              <button
                onClick={() => void runSummary()}
                disabled={loadingSummary}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#0F2A43] text-white hover:bg-[#163a5c] disabled:opacity-50"
              >
                {loadingSummary ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                Summarize with DeepSeek
              </button>
            )}

            {summary && (
              <div className="w-full rounded-lg bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400 mb-0.5">
                  Summary
                </p>
                {summary}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}