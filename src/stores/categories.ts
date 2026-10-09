import { create } from "zustand";
import { Category, DEFAULT_TOPIC_CATEGORIES } from "../types";
import {
  createCategory,
  deleteCategory,
  ensureDefaultCategories,
  listCategories,
  updateCategory,
} from "../services/db";

interface CategoriesStore {
  categories: Category[];
  loaded: boolean;
  load: () => Promise<void>;
  addTopic: (name: string, color: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  recolor: (id: string, color: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useCategoriesStore = create<CategoriesStore>((set) => ({
  categories: [],
  loaded: false,

  load: async () => {
    await ensureDefaultCategories(DEFAULT_TOPIC_CATEGORIES);
    const categories = await listCategories();
    set({ categories, loaded: true });
  },

  addTopic: async (name, color) => {
    await createCategory({ name, color, kind: "topic" });
    const categories = await listCategories();
    set({ categories });
  },

  rename: async (id, name) => {
    await updateCategory(id, { name });
    const categories = await listCategories();
    set({ categories });
  },

  recolor: async (id, color) => {
    await updateCategory(id, { color });
    const categories = await listCategories();
    set({ categories });
  },

  remove: async (id) => {
    await deleteCategory(id);
    const categories = await listCategories();
    set({ categories });
  },
}));