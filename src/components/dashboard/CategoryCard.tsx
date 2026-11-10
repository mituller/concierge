import { Category } from "../../types";

interface Props {
  category: Category;
  count: number;
  /** Messages in the last 7 days. */
  recent: number;
  /** Monthly counts, oldest → newest (last 12 months). */
  trend?: number[];
  onClick: () => void;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 72;
  const h = 24;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CategoryCard({ category, count, recent, trend, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
        />
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
          {category.name}
        </span>
        {category.kind === "person" && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
            person
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <div className="min-w-0">
          <p className="text-3xl font-bold text-gray-900 dark:text-white leading-none">
            {count.toLocaleString()}
          </p>
          <p
            className={`text-xs mt-1.5 ${
              recent > 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {recent > 0 ? `+${recent.toLocaleString()} this week` : "Nothing new this week"}
          </p>
        </div>
        {trend && trend.some((v) => v > 0) && <Sparkline values={trend} color={category.color} />}
      </div>
    </button>
  );
}
