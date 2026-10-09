import { LayoutDashboard, Inbox as InboxIcon, Settings, RefreshCw } from "lucide-react";
import { useInboxStore } from "../../stores/inbox";

export type View = "dashboard" | "inbox" | "settings";

interface SidebarProps {
  current: View;
  onChange: (v: View) => void;
}

export function Sidebar({ current, onChange }: SidebarProps) {
  const syncing = useInboxStore((s) => s.syncing);
  const progress = useInboxStore((s) => s.progress);
  const syncNow = useInboxStore((s) => s.syncNow);

  const nav: { id: View; icon: React.ReactNode; label: string }[] = [
    { id: "dashboard", icon: <LayoutDashboard size={18} />, label: "Dashboard" },
    { id: "inbox", icon: <InboxIcon size={18} />, label: "Inbox" },
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

      <nav className="flex-1 py-2 space-y-0.5 px-2">
        {nav.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              current === id
                ? "bg-white/15 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {icon}
            <span className="text-left">{label}</span>
          </button>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-2">
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
        <button
          onClick={() => void syncNow()}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white transition-colors"
        >
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
    </aside>
  );
}