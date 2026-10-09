import { useInboxStore } from "../../stores/inbox";
import { EmailList } from "../email/EmailList";

export function InboxView() {
  const total = useInboxStore((s) => s.stats.total);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-4 w-full">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inbox</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {total.toLocaleString()} synced messages, most recent first.
        </p>
      </div>

      <EmailList emptyText="No messages yet — run a sync to pull in your inbox." />
    </div>
  );
}