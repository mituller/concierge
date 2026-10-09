import { DashboardStats } from "../../types";

function fmtWhen(iso?: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StatsBar({ stats }: { stats: DashboardStats }) {
  const items = [
    { label: "Synced messages", value: stats.total.toLocaleString() },
    { label: "Unread", value: stats.unread.toLocaleString() },
    {
      label: "Categorized",
      value: `${stats.categorized.toLocaleString()} of ${stats.total.toLocaleString()}`,
    },
    { label: "Last sync", value: fmtWhen(stats.lastSyncAt) },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {it.label}
          </p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-0.5 truncate">
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}