import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { headless: true }
});
