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
  const lines = [
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: fakeClaude }
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

test("Settings gear opens Settings, and Settings opens the About modal", async () => {
  const window = await app.firstWindow();
  // The Three.js canvas covers the whole tab body; force-click the gear button
  // which sits on top via `position: fixed`.
  await window.getByRole("button", { name: "Open settings" }).click({ force: true });
  await expect(window.getByRole("heading", { name: "Settings" })).toBeVisible();
  await window.getByRole("button", { name: "About" }).click();
  await expect(window.getByText("Created by Haim Adrian for Claude Code users.")).toBeVisible();
  // Two buttons named "Close" may exist (about + settings); press Escape instead.
  await window.keyboard.press("Escape");
  await expect(window.getByText("Created by Haim Adrian for Claude Code users.")).toBeHidden();
  await window.keyboard.press("Escape");
  await expect(window.getByRole("heading", { name: "Settings" })).toBeHidden();
});
