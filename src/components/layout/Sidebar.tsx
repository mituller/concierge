import {
  AlertTriangle,
  LayoutDashboard,
  Inbox as InboxIcon,
  Settings,
  RefreshCw,
  X,
} from "lucide-react";
import { useInboxStore } from "../../stores/inbox";
import { useCategoriesStore } from "../../stores/categories";

export type View = "dashboard" | "inbox" | "settings";

interface SidebarProps {
  current: View;
  categoryId: string | null;
  onChange: (v: View) => void;
  onOpenCategory: (id: string) => void;
}

export function Sidebar({ current, categoryId, onChange, onOpenCategory }: SidebarProps) {
  const syncing = useInboxStore((s) => s.syncing);
  const progress = useInboxStore((s) => s.progress);
  const syncNow = useInboxStore((s) => s.syncNow);
  const cancel = useInboxStore((s) => s.cancel);
  const counts = useInboxStore((s) => s.counts);
  const unread = useInboxStore((s) => s.stats.unread);
  const lastError = useInboxStore((s) => s.lastError);
  const dismissError = useInboxStore((s) => s.dismissError);
  const categories = useCategoriesStore((s) => s.categories);
  const roots = categories.filter((c) => !c.mergedInto);

  const nav: { id: View; icon: React.ReactNode; label: string; badge?: number }[] = [
    { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
    { id: "inbox", icon: <InboxIcon size={18} />, label: "Inbox", badge: unread },
    { id: "settings", icon: <Settings size={18} />, label: "Settings" },
  ];

  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <aside className="w-56 shrink-0 bg-[#0F2A43] flex flex-col h-full text-white">
      <div className="px-4 py-4 border-b border-white/10 flex items-center gap-3">
        <img src="/icon.svg" alt="Concierge" className="w-10 h-10 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <p className="font-semibold text-lg tracking-tight leading-tight">Concierge</p>
          <p className="text-[11px] text-white/50 leading-tight truncate">
            The mail concierge for a crowded inbox
          </p>
        </div>
      </div>

      <nav className="py-2 space-y-0.5 px-2">
        {nav.map(({ id, icon, label, badge }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              current === id && !categoryId
                ? "bg-white/15 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {icon}
            <span className="flex-1 text-left">{label}</span>
            {!!badge && (
              <span className="text-[11px] tabular-nums text-white/50">{badge.toLocaleString()}</span>
            )}
          </button>
        ))}
      </nav>

      {roots.length > 0 && (
        <div className="flex-1 min-h-0 flex flex-col border-t border-white/10">
          <p className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Categories
          </p>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {roots.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCategory(c.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  categoryId === c.id
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="flex-1 text-left truncate">{c.name}</span>
                <span className="text-[11px] tabular-nums text-white/40">
                  {(counts[c.id] ?? 0).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {roots.length === 0 && <div className="flex-1" />}

      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {lastError && (
          <div className="flex items-start gap-2 rounded-md bg-red-500/15 border border-red-400/30 px-2.5 py-2 text-[11px] text-red-100">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-red-300" />
            <span className="flex-1 min-w-0 line-clamp-4 break-words" title={lastError}>
              {lastError}
            </span>
            <button
              onClick={dismissError}
              aria-label="Dismiss error"
              className="shrink-0 text-red-200/70 hover:text-white"
            >
              <X size={13} />
            </button>
          </div>
        )}
        {syncing && progress && (
          <div className="space-y-1">
            <p className="text-[11px] text-white/60 truncate">{progress.label}</p>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {syncing ? (
          <button
            onClick={cancel}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-red-500 hover:bg-red-400 text-white transition-colors"
          >
            <X size={15} /> Cancel
          </button>
        ) : (
          <button
            onClick={() => void syncNow()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-sky-500 hover:bg-sky-400 text-white transition-colors"
          >
            <RefreshCw size={15} /> Sync now
          </button>
        )}
      </div>
    </aside>
  );
}
