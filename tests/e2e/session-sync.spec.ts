import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let fakeClaude: string;
let app: ElectronApplication;

test.beforeAll(async () => {
  fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-"));
  const projDir = path.join(fakeClaude, "projects", "-my-project");
  fs.mkdirSync(projDir, { recursive: true });
  const ts = new Date().toISOString();
  // The sidebar and tab chrome render Claude Code's session title (emitted
  // via `custom-title` / `summary` JSONL events); the raw sessionId is no
  // longer shown as the visible label. Seed a `custom-title` line so the
  // assertions below have a stable string to match.
  const lines = [
    {
      type: "custom-title",
      title: "sess-abc demo",
      sessionId: "sess-abc",
      uuid: "u-0",
      timestamp: ts
    },
    {
      type: "user",
      message: { role: "user", content: "hello" },
      sessionId: "sess-abc",
      uuid: "u-1",
      timestamp: ts
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "t-1",
            name: "Read",
            input: { file_path: "/tmp/x.ts" }
          }
        ]
      },
      sessionId: "sess-abc",
      uuid: "u-2",
      timestamp: ts
    }
  ];
  fs.writeFileSync(path.join(projDir, "sess-abc.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

  app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CLAUDE_CONFIG_DIR: fakeClaude, CV_HOOK_PORT: "0" }
  });
});

test.afterAll(async () => {
  await app?.close();
  if (fakeClaude) fs.rmSync(fakeClaude, { recursive: true, force: true });
});

test("a new session file shows up in the sidebar", async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await expect
    .poll(async () => await window.locator("aside").innerText(), {
      timeout: 5_000,
      intervals: [100, 250, 500]
    })
    .toContain("sess-abc");
});

test("active session auto-opens a tab and renders the village canvas", async () => {
  const window = await app.firstWindow();
  await expect(window.locator("nav")).toContainText("sess-abc");
  // TabBody renders the Three.js canvas once the session is the active tab.
  await expect(window.locator("canvas").first()).toBeVisible({ timeout: 5_000 });
});

test("Sidebar footer icons open Settings, Help, and About dialogs", async () => {
  const window = await app.firstWindow();
  // Sidebar icon buttons live in the aside column; they use fixed-size 36x36
  // icon-only buttons with accessible names.

  // Settings
  await window.getByRole("button", { name: "Open settings" }).click({ force: true });
  await expect(window.getByRole("heading", { name: "Settings" })).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.getByRole("heading", { name: "Settings" })).toBeHidden();

  // Help
  await window.getByRole("button", { name: "Open help" }).click({ force: true });
  await expect(window.getByRole("heading", { name: /claude-village - Help/ })).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.getByRole("heading", { name: /claude-village - Help/ })).toBeHidden();

  // About
  await window.getByRole("button", { name: "Open about" }).click({ force: true });
  await expect(window.getByText("Created by Haim Adrian for Claude Code users.")).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.getByText("Created by Haim Adrian for Claude Code users.")).toBeHidden();
});
