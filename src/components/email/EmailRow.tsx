import { useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Category, Email } from "../../types";
import { useCategoriesStore } from "../../stores/categories";
import { useSettingsStore } from "../../stores/settings";
import { fetchEmailBody, summarizeEmail } from "../../services/classify";

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
  const [body, setBody] = useState<string | undefined>(email.bodyText);
  const [summary, setSummary] = useState<string | undefined>(email.summary);
  const [loadingBody, setLoadingBody] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useCategoriesStore((s) => s.categories);
  const settings = useSettingsStore((s) => s.settings);

  const chips = email.categoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);

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
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
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
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{email.snippet}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1 justify-end max-w-[40%] shrink-0">
          {chips.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: c.color + "22", color: c.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </button>

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