import path from "node:path";
import { defineConfig } from "vitest/config";

// Vitest picks up any `*.spec.ts` by default, which would sweep the Playwright
// e2e suite under `tests/e2e/` and fail because `test.beforeAll` and the
// Electron APIs only exist at Playwright runtime. Restrict vitest to the unit
// tests under `tests/unit/` so `pnpm test` and `pnpm e2e` stay disjoint.
//
// The `electron` and `electron-log/main` modules load the Electron runtime at
// import time, which is unavailable in plain Node. Alias both to lightweight
// stubs under `tests/unit/stubs/` so unit tests can import main-process
// modules (session-store, session-watcher, ...) that transitively pull in the
// logger.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.{test,spec}.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "out/**", "tests/unit/stubs/**"]
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, "tests/unit/stubs/electron.ts"),
      "electron-log/main.js": path.resolve(__dirname, "tests/unit/stubs/electron-log-main.ts"),
      "electron-log/renderer.js": path.resolve(__dirname, "tests/unit/stubs/electron-log-main.ts"),
      "electron-log/main": path.resolve(__dirname, "tests/unit/stubs/electron-log-main.ts"),
      "electron-log/renderer": path.resolve(__dirname, "tests/unit/stubs/electron-log-main.ts")
    }
  }
});
