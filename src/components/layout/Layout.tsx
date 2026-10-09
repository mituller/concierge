import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Sidebar, View } from "./Sidebar";
import { Dashboard } from "../dashboard/Dashboard";
import { InboxView } from "../inbox/InboxView";
import { Settings } from "../settings/Settings";
import { CategoryDetail } from "../category/CategoryDetail";
import { useInboxStore } from "../../stores/inbox";

export function Layout() {
  const [view, setView] = useState<View>("dashboard");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const syncNow = useInboxStore((s) => s.syncNow);

  useEffect(() => {
    const unsettings = listen("menu-settings", () => {
      setCategoryId(null);
      setView("settings");
    });
    const unsync = listen("menu-sync", () => {
      void syncNow();
    });
    return () => {
      unsettings.then((f) => f());
      unsync.then((f) => f());
    };
  }, [syncNow]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar
        current={view}
        onChange={(v) => {
          setCategoryId(null);
          setView(v);
        }}
      />
      <main className="flex-1 overflow-y-auto flex flex-col">
        {categoryId ? (
          <CategoryDetail
            categoryId={categoryId}
            onBack={() => setCategoryId(null)}
          />
        ) : (
          <>
            {view === "dashboard" && <Dashboard onOpenCategory={setCategoryId} />}
            {view === "inbox" && <InboxView />}
            {view === "settings" && <Settings />}
          </>
        )}
      </main>
    </div>
  );
}