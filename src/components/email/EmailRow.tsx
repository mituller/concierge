import { forwardRef, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Category, Email } from "../../types";
import { useCategoriesStore } from "../../stores/categories";
import { useSettingsStore } from "../../stores/settings";
import { useInboxStore } from "../../stores/inbox";
import { fetchEmailBody, summarizeEmail } from "../../services/classify";
import { assignEmailCategory, removeEmailCategory } from "../../services/db";
import { EmailBody, Highlight } from "./richText";

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

interface Props {
  email: Email;
  open: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  /** Search term to highlight. */
  highlight?: string;
  /** Incremented by the list's "s" shortcut to request a summary. */
  summarizeTick?: number;
}

export const EmailRow = forwardRef<HTMLDivElement, Props>(function EmailRow(
  { email, open, selected, onToggle, onSelect, highlight, summarizeTick = 0 },
  ref
) {
  const [categoryIds, setCategoryIds] = useState<string[]>(email.categoryIds);
  const [body, setBody] = useState<string | undefined>(email.bodyText);
  const [summary, setSummary] = useState<string | undefined>(email.summary);
  const [loadingBody, setLoadingBody] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const categories = useCategoriesStore((s) => s.categories);
  const settings = useSettingsStore((s) => s.settings);

  const chips = categoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => !!c);
  const addable = categories.filter((c) => !c.mergedInto && !categoryIds.includes(c.id));

  // Fetch the body automatically the first time the row is expanded.
  useEffect(() => {
    if (open && !body && !loadingBody) void loadBody();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // "s" shortcut from the list.
  const lastTick = useRef(summarizeTick);
  useEffect(() => {
    const fired = summarizeTick > lastTick.current;
    lastTick.current = summarizeTick;
    if (fired && !summary && !loadingSummary) void runSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summarizeTick]);

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

  async function handleAdd(categoryId: string) {
    setPickerOpen(false);
    const prev = categoryIds;
    setCategoryIds([...prev, categoryId]);
    try {
      await assignEmailCategory(email.id, categoryId, 1);
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
      if (!body && email.bodyText) setBody(email.bodyText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSummary(false);
    }
  }

  const unread = email.unread;

  return (
    <div
      ref={ref}
      onMouseDown={onSelect}
      className={`relative ${selected ? "bg-sky-50/70 dark:bg-sky-950/30" : ""}`}
    >
      {selected && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-sky-500" />}
      <div
        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
          selected ? "" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
        }`}
      >
        <button onClick={onToggle} className="flex items-start gap-3 min-w-0 flex-1 text-left">
          <span className="relative shrink-0 mt-0.5">
            <ChevronDown
              size={16}
              className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                {unread && (
                  <span
                    className="h-2 w-2 rounded-full bg-sky-500 shrink-0"
                    aria-label="Unread"
                    title="Unread"
                  />
                )}
                <span
                  className={`text-sm truncate ${
                    unread
                      ? "font-semibold text-gray-900 dark:text-white"
                      : "font-medium text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <Highlight
                    text={email.fromName || email.fromEmail || "(unknown sender)"}
                    term={highlight}
                  />
                </span>
              </span>
              <span
                className={`text-xs shrink-0 ${
                  unread ? "text-gray-600 dark:text-gray-300 font-medium" : "text-gray-400"
                }`}
              >
                {fmtDate(email.date)}
              </span>
            </div>
            <p
              className={`text-sm truncate ${
                unread
                  ? "font-medium text-gray-800 dark:text-gray-100"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              <Highlight text={email.subject} term={highlight} />
            </p>
            {email.snippet && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                <Highlight text={email.snippet} term={highlight} />
              </p>
            )}
          </div>
        </button>

        <div className="relative flex flex-wrap items-center gap-1.5 justify-end shrink-0 max-w-[45%] pt-0.5">
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

          {addable.length > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              title="Add to category"
              aria-label="Add to category"
              className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:text-gray-700 hover:border-gray-400 dark:hover:text-gray-200"
            >
              <Plus size={13} />
            </button>
          )}

          {pickerOpen && (
            <CategoryPicker
              options={addable}
              onPick={(id) => void handleAdd(id)}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {open && (
        <div className="px-12 pb-4 space-y-3">
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {summary && (
            <div className="w-full rounded-lg bg-sky-50 dark:bg-sky-950/40 px-3 py-2 text-sm text-gray-700 dark:text-gray-200">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400 mb-0.5">
                Summary
              </p>
              {summary}
            </div>
          )}

          {body ? (
            <EmailBody body={body} term={highlight} />
          ) : loadingBody ? (
            <p className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Loading message…
            </p>
          ) : (
            <button
              onClick={() => void loadBody()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Load message
            </button>
          )}

          {!summary && (
            <button
              onClick={() => void runSummary()}
              disabled={loadingSummary}
              title={`Uses ${settings.openRouterModel || "the model set in Settings"}  ·  shortcut: s`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#0F2A43] text-white hover:bg-[#163a5c] disabled:opacity-50"
            >
              {loadingSummary ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              Summarize
            </button>
          )}
        </div>
      )}
    </div>
  );
});

function CategoryPicker({
  options,
  onPick,
  onClose,
}: {
  options: Category[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-20 w-52 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
    >
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Add to category
      </p>
      {options.map((c) => (
        <button
          key={c.id}
          onClick={() => onPick(c.id)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
          <span className="truncate">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
