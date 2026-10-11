import { AlertTriangle } from "lucide-react";
import { useInboxStore } from "../../stores/inbox";
import { useCategoriesStore } from "../../stores/categories";
import { StatsBar } from "./StatsBar";
import { CategoryCard } from "./CategoryCard";
import { CategoryBarChart, CategoryTrendChart } from "./TrendCharts";

export function Dashboard({ onOpenCategory }: { onOpenCategory: (id: string) => void }) {
  const stats = useInboxStore((s) => s.stats);
  const counts = useInboxStore((s) => s.counts);
  const trend = useInboxStore((s) => s.trend);
  const lastError = useInboxStore((s) => s.lastError);
  const categories = useCategoriesStore((s) => s.categories);
  // Merged aliases are folded into their parent — show only root categories.
  const roots = categories.filter((c) => !c.mergedInto);

  const barData = roots.map((c) => ({
    name: c.name,
    color: c.color,
    count: counts[c.id] ?? 0,
  }));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6 w-full">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Your inbox, sorted into categories.
          </p>
        </div>
      </div>

      {lastError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{lastError}</span>
        </div>
      )}

      <StatsBar stats={stats} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
          Categories
        </h2>
        {roots.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
            No categories yet — run a sync to classify your inbox.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {roots.map((c) => (
              <CategoryCard
                key={c.id}
                category={c}
                count={counts[c.id] ?? 0}
                onClick={() => onOpenCategory(c.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
          Messages per category
        </h2>
        <CategoryBarChart data={barData} />
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">
          Volume by month (12 months)
        </h2>
        <CategoryTrendChart series={trend} />
      </section>
    </div>
  );
}