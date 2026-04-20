import { defineConfig } from "vitest/config";

// Vitest picks up any `*.spec.ts` by default, which would sweep the Playwright
// e2e suite under `tests/e2e/` and fail because `test.beforeAll` and the
// Electron APIs only exist at Playwright runtime. Restrict vitest to the unit
// tests under `tests/unit/` so `pnpm test` and `pnpm e2e` stay disjoint.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.{test,spec}.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "out/**"]
  }
});
