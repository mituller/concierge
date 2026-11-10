import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Email } from "../../types";
import { queryEmailPage } from "../../services/db";
import { EmailRow } from "./EmailRow";

const PAGE = 50;

interface Props {
  categoryId?: string;
  search?: string;
  emptyText: string;
  /** Show the All / Unread toggle above the list. */
  filterable?: boolean;
  /** When this value changes, the first page reloads (e.g. the category's
   *  live count) so newly-added messages appear while the view is open. */
  refreshKey?: number;
}

/** True when the key event came from a text field, where shortcuts must not fire. */
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function EmailList({ categoryId, search, emptyText, filterable, refreshKey }: Props) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [summarize, setSummarize] = useState<{ id: string; tick: number } | null>(null);

  const loadingRef = useRef(false);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (off: number, replace: boolean) => {
      if (loadingRef.current && !replace) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const rows = await queryEmailPage({ categoryId, unreadOnly, search, offset: off, limit: PAGE });
        setEmails((prev) => (replace ? rows : [...prev, ...rows]));
        setOffset(off + rows.length);
        setHasMore(rows.length === PAGE);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryId, unreadOnly, search, refreshKey]
  );

  useEffect(() => {
    void loadPage(0, true);
  }, [loadPage]);

  // Reset selection when the list's filter changes (not on live refreshes).
  useEffect(() => {
    setSelected(-1);
    setOpenIds(new Set());
  }, [categoryId, unreadOnly, search]);

  // Infinite scroll: load the next page when the sentinel comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadPage(offset, false);
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, offset, loadPage]);

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Keyboard: j/k (or ↓/↑) move, Enter/o expands, s summarizes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (emails.length === 0) return;
      const key = e.key;
      if (key === "j" || key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(selected + 1, emails.length - 1);
        setSelected(next);
        if (next >= emails.length - 5 && hasMore) void loadPage(offset, false);
      } else if (key === "k" || key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if ((key === "Enter" || key === "o") && selected >= 0) {
        e.preventDefault();
        toggle(emails[selected].id);
      } else if (key === "s" && selected >= 0) {
        e.preventDefault();
        const id = emails[selected].id;
        setOpenIds((prev) => new Set(prev).add(id));
        setSummarize((p) => ({ id, tick: (p?.tick ?? 0) + 1 }));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [emails, selected, hasMore, offset, loadPage, toggle]);

  useEffect(() => {
    if (selected >= 0) rowRefs.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="space-y-3">
      {filterable && (
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5 text-xs font-medium">
            {[
              { label: "All", value: false },
              { label: "Unread", value: true },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setUnreadOnly(o.value)}
                className={`px-3 py-1 rounded ${
                  unreadOnly === o.value
                    ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 hidden sm:block">
            <Kbd>j</Kbd>/<Kbd>k</Kbd> move · <Kbd>↵</Kbd> open · <Kbd>s</Kbd> summarize
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {emails.length === 0 && !loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
            {unreadOnly ? "No unread messages here." : emptyText}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {emails.map((e, i) => (
              <EmailRow
                key={e.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                email={e}
                open={openIds.has(e.id)}
                selected={i === selected}
                onToggle={() => toggle(e.id)}
                onSelect={() => setSelected(i)}
                highlight={search}
                summarizeTick={summarize?.id === e.id ? summarize.tick : 0}
              />
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-4 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {hasMore && emails.length > 0 && <div ref={sentinel} className="h-px" />}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block min-w-[1.25rem] text-center rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-1 font-sans text-[10px] text-gray-500 dark:text-gray-300">
      {children}
    </kbd>
  );
}
