import { create } from "zustand";
import { DashboardStats, SyncProgress, TrendSeries } from "../types";
import {
  buildTrendSeries,
  countByCategory,
  getDashboardStats,
  getTrendByMonth,
  listCategories,
} from "../services/db";
import { classifyUncategorized, syncMailbox } from "../services/classify";
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
  cancelRequested: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  cancel: () => void;
}

export const useInboxStore = create<InboxStore>((set, get) => ({
  stats: { total: 0, unread: 0, categorized: 0 },
  counts: {},
  trend: [],
  syncing: false,
  progress: null,
  lastError: null,
  loaded: false,
  cancelRequested: false,

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

  cancel: () => set({ cancelRequested: true }),

  syncNow: async () => {
    if (get().syncing) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings.imapEmail || !settings.imapPassword) {
      set({ lastError: "Add your IMAP settings in Settings first (Settings → Gmail)." });
      return;
    }

    set({
      syncing: true,
      cancelRequested: false,
      lastError: null,
      progress: { label: "Starting…", done: 0, total: 0 },
    });
    const shouldCancel = () => get().cancelRequested;

    try {
      await syncMailbox(
        settings,
        (p) => set((s) => ({ progress: p, stats: { ...s.stats, total: p.done } })),
        shouldCancel
      );
      if (shouldCancel()) return;

      await classifyUncategorized({
        settings,
        onProgress: (p) => {
          set({ progress: p });
          // Refresh counts + stats live so the dashboard cards (and any open
          // category view via refreshKey) update as emails get categorized.
          void get().refresh();
        },
        shouldCancel,
      });
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ syncing: false, progress: null, cancelRequested: false });
      // Always refresh so the dashboard reflects whatever made it to disk
      // (including a partial sync/classification after a cancel).
      void useCategoriesStore.getState().load();
      void get().refresh();
    }
  },
}));