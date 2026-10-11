import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Email } from "../../types";
import { queryEmailPage } from "../../services/db";
import { EmailRow } from "./EmailRow";

const PAGE = 50;

interface Props {
  categoryId?: string;
  unreadOnly?: boolean;
  search?: string;
  emptyText: string;
  /** When this value changes, the first page reloads (e.g. the category's
   *  live count) so newly-added messages appear while the view is open. */
  refreshKey?: number;
}

export function EmailList({ categoryId, unreadOnly, search, emptyText, refreshKey }: Props) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(
    async (off: number, replace: boolean) => {
      setLoading(true);
      try {
        const rows = await queryEmailPage({ categoryId, unreadOnly, search, offset: off, limit: PAGE });
        setEmails((prev) => (replace ? rows : [...prev, ...rows]));
        setOffset(off + rows.length);
        setHasMore(rows.length === PAGE);
      } finally {
        setLoading(false);
      }
    },
    [categoryId, unreadOnly, search, refreshKey]
  );

  useEffect(() => {
    void loadPage(0, true);
  }, [loadPage]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      {emails.length === 0 && !loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">{emptyText}</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {emails.map((e) => (
            <EmailRow key={e.id} email={e} />
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}

      {hasMore && emails.length > 0 && !loading && (
        <div className="px-4 py-3 flex justify-center">
          <button
            onClick={() => void loadPage(offset, false)}
            className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}