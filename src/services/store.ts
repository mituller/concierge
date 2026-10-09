import { load } from "@tauri-apps/plugin-store";
import { AppSettings, DEFAULT_SETTINGS } from "../types";

const STORE_FILE = "concierge-settings.json";

async function getStore() {
  return load(STORE_FILE);
}

export async function getSettings(): Promise<AppSettings> {
  const store = await getStore();
  const saved = await store.get<Partial<AppSettings>>("settings");
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set("settings", settings);
}