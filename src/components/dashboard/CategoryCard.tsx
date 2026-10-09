import { Category } from "../../types";

interface Props {
  category: Category;
  count: number;
  onClick: () => void;
}

export function CategoryCard({ category, count, onClick }: Props) {
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
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{count.toLocaleString()}</p>
    </button>
  );
}