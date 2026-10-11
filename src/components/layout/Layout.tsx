import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Search, X } from "lucide-react";
import { Sidebar, View } from "./Sidebar";
import { Dashboard } from "../dashboard/Dashboard";
import { InboxView } from "../inbox/InboxView";
import { Settings } from "../settings/Settings";
import { CategoryDetail } from "../category/CategoryDetail";
import { EmailList } from "../email/EmailList";
import { useInboxStore } from "../../stores/inbox";
import { countEmailMatches } from "../../services/db";

export function Layout() {
  const [view, setView] = useState<View>("dashboard");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [resultCount, setResultCount] = useState<number | null>(null);
  const syncNow = useInboxStore((s) => s.syncNow);

  // Debounce so we don't run a query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Result count for the header ("N results for …").
  useEffect(() => {
    let cancelled = false;
    if (!debounced) {
      setResultCount(null);
      return;
    }
    countEmailMatches(debounced)
      .then((n) => {
        if (!cancelled) setResultCount(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const unsettings = listen("menu-settings", () => {
      setCategoryId(null);
      setSearch("");
      setView("settings");
    });
    const unsync = listen("menu-sync", () => {
      void syncNow();
    });
    return () => {
      unsettings.then((f) => f());
      unsync.then((f) => f());
    };
  }, [syncNow]);

  // ⌘K / Ctrl-K focuses the search box; Escape clears it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      } else if (e.key === "Escape") {
        setSearch("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searching = debounced.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar
        current={view}
        onChange={(v) => {
          setCategoryId(null);
          setSearch("");
          setView(v);
        }}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="shrink-0 flex items-center justify-end px-6 py-2.5">
          <div className="relative w-72 max-w-full">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              id="global-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mail…  (⌘K)"
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-8 py-1.5 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-4 w-4 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {searching ? (
            <div className="max-w-4xl mx-auto px-6 py-8 space-y-4 w-full">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Search</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {resultCount === null
                    ? "Searching…"
                    : `${resultCount.toLocaleString()} result${resultCount === 1 ? "" : "s"} for “${debounced}”`}
                </p>
              </div>
              <EmailList
                search={debounced}
                emptyText={`No messages match “${debounced}”.`}
              />
            </div>
          ) : categoryId ? (
            <CategoryDetail categoryId={categoryId} onBack={() => setCategoryId(null)} />
          ) : (
            <>
              {view === "dashboard" && <Dashboard onOpenCategory={setCategoryId} />}
              {view === "inbox" && <InboxView />}
              {view === "settings" && <Settings />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}