import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Pure unit tests only — nothing touches the Tauri runtime or network.
    isolate: true,
  },
});