import { useState } from "react";
import { TrendSeries } from "../../types";

// ─── Bar chart (count per category) — responsive CSS bars ───────────────────

export function CategoryBarChart({ data }: { data: { name: string; color: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-2 h-44">
      {data.map((d) => (
        <div key={d.name} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            {d.count > 0 ? d.count.toLocaleString() : ""}
          </span>
          <div
            className="w-full rounded-t-md"
            style={{
              height: `${Math.max((d.count / max) * 100, d.count > 0 ? 2 : 0)}%`,
              backgroundColor: d.color,
            }}
            title={`${d.name}: ${d.count}`}
          />
          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate w-full text-center">
            {d.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Multi-line trend (counts by month) — hand-rolled SVG ───────────────────

const W = 760;
const H = 260;
const PAD = { left: 44, right: 12, top: 14, bottom: 28 };

function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

export function CategoryTrendChart({ series }: { series: TrendSeries[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const months = series[0]?.points.map((p) => p.month) ?? [];
  const visible = series.filter((s) => !hidden.has(s.categoryId));
  const maxCount = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.count)));

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => (months.length <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (months.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxCount) * innerH;

  const yTicks = [0, 0.5, 1].map((f) => Math.round(f * maxCount));

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {series.length === 0 || months.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
          No categorized emails yet.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* gridlines + y labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="currentColor"
                className="text-gray-200 dark:text-gray-700"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-gray-400"
                fontSize="10"
              >
                {t}
              </text>
            </g>
          ))}

          {/* x labels */}
          {months.map((m, i) =>
            i % 2 === 0 || i === months.length - 1 ? (
              <text
                key={m}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-gray-400"
                fontSize="10"
              >
                {shortMonth(m)}
              </text>
            ) : null
          )}

          {/* lines */}
          {visible.map((s) => {
            const pts = s.points
              .map((p, i) => `${x(i)},${y(p.count)}`)
              .join(" ");
            return (
              <polyline
                key={s.categoryId}
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-2 mt-2">
        {series.map((s) => {
          const off = hidden.has(s.categoryId);
          return (
            <button
              key={s.categoryId}
              onClick={() => toggle(s.categoryId)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
                off ? "opacity-40" : "opacity-100"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className={off ? "line-through" : ""}>{s.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}