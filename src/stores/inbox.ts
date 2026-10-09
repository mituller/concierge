import { create } from "zustand";
import { DashboardStats, SyncProgress, TrendSeries } from "../types";
import {
  buildTrendSeries,
  countByCategory,
  getDashboardStats,
  getTrendByMonth,
  listCategories,
} from "../services/db";
import { autoCreatePeople, classifyUncategorized, syncMailbox } from "../services/classify";
import { useSettingsStore } from "./settings";
import { useCategoriesStore } from "./categories";

interface InboxStore {
  stats: DashboardStats;
  counts: Record<string, number>;
  trend: TrendSeries[];
  syncing: boolean;
  progress: SyncProgress | null;
  lastError: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export const useInboxStore = create<InboxStore>((set, get) => ({
  stats: { total: 0, unread: 0, categorized: 0 },
  counts: {},
  trend: [],
  syncing: false,
  progress: null,
  lastError: null,
  loaded: false,

  load: async () => {
    await get().refresh();
    set({ loaded: true });
  },

  refresh: async () => {
    const [stats, counts, categories, rawTrend] = await Promise.all([
      getDashboardStats(),
      countByCategory(),
      listCategories(),
      getTrendByMonth(),
    ]);
    const countMap: Record<string, number> = {};
    for (const c of counts) countMap[c.categoryId] = c.count;
    set({
      stats,
      counts: countMap,
      trend: buildTrendSeries(rawTrend, categories),
    });
  },

  syncNow: async () => {
    if (get().syncing) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings.imapEmail || !settings.imapPassword) {
      set({ lastError: "Add your IMAP settings in Settings first (Settings → Gmail)." });
      return;
    }

    set({ syncing: true, lastError: null, progress: { label: "Starting…", done: 0, total: 0 } });
    try {
      await syncMailbox(settings, (p) => set({ progress: p }));

      set({ progress: { label: "Building person categories…", done: 0, total: 0 } });
      await autoCreatePeople(settings);

      await classifyUncategorized({
        settings,
        onProgress: (p) => set({ progress: p }),
      });

      await useCategoriesStore.getState().load();
      await get().refresh();
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ syncing: false, progress: null });
    }
  },
}));