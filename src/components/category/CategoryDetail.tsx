import { useCategoriesStore } from "../../stores/categories";
import { useInboxStore } from "../../stores/inbox";
import { EmailList } from "../email/EmailList";

export function CategoryDetail({ categoryId }: { categoryId: string }) {
  const category = useCategoriesStore((s) => s.categories.find((c) => c.id === categoryId));
  const counts = useInboxStore((s) => s.counts);
  const trend = useInboxStore((s) => s.trend);

  const series = trend.find((t) => t.categoryId === categoryId);
  const peak = series
    ? series.points.reduce((best, p) => (p.count > best.count ? p : best), series.points[0])
    : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-4 w-full">
      <div className="flex items-center gap-3">
        <span
          className="h-4 w-4 rounded-full shrink-0"
          style={{ backgroundColor: category?.color ?? "#888" }}
        />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {category?.name ?? "Category"}
        </h1>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">
        {(counts[categoryId] ?? 0).toLocaleString()}{" "}
        {counts[categoryId] === 1 ? "message" : "messages"}
        {peak && peak.count > 0
          ? ` · peak ${new Date(peak.month + "-01").toLocaleString(undefined, { month: "long", year: "numeric" })} (${peak.count})`
          : ""}
        {category?.kind === "person" && category.personEmail ? ` · ${category.personEmail}` : ""}
      </p>

      <EmailList
        categoryId={categoryId}
        emptyText="No messages in this category yet."
        filterable
        refreshKey={counts[categoryId] ?? 0}
      />
    </div>
  );
}