import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  computeMerged,
  computeRemoved,
  installHook,
  uninstallHook,
  resolveSettingsPath,
  readSettings
} from "../../src/main/hook-installer";

// Tight unit coverage for the pure helpers. We do not need the electron or
// filesystem layer here; the helpers are specifically structured to be
// callable with plain JS values, which is why they exist as a separate
// module.

const OUR_URL = "http://127.0.0.1:49251/event";
const OUR_CMD = `curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- ${OUR_URL} >/dev/null 2>&1 || true`;

describe("computeMerged", () => {
  it("installs all desired hooks into an empty file", () => {
    const merged = computeMerged({});
    const hooks = (merged.hooks ?? {}) as Record<string, unknown>;
    expect(Object.keys(hooks).sort()).toEqual(
      ["PostToolUse", "PreToolUse", "SessionStart", "Stop", "SubagentStart"].sort()
    );

    // PreToolUse should have the `.*` matcher; SessionStart should not.
    const pre = (merged.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    expect(pre[0]?.matcher).toBe(".*");
    expect(pre[0]?.hooks[0]?.command).toContain("127.0.0.1:49251");

    const start = (merged.hooks?.SessionStart ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    expect(start[0]?.matcher).toBeUndefined();
    expect(start[0]?.hooks[0]?.command).toContain("127.0.0.1:49251");
  });

  it("preserves unrelated hooks and unrelated top-level keys", () => {
    const input = {
      model: "claude-opus",
      env: { FOO: "bar" },
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo user-bash-hook" }]
          }
        ],
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "echo user-prompt" }] }
        ]
      }
    };
    const merged = computeMerged(input);

    // Untouched top-level keys.
    expect(merged.model).toBe("claude-opus");
    expect(merged.env).toEqual({ FOO: "bar" });

    // User's Bash matcher group for PreToolUse is preserved as a separate
    // group; we add a `.*` group alongside.
    const pre = (merged.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    expect(pre).toHaveLength(2);
    const userGroup = pre.find((g) => g.matcher === "Bash");
    const ourGroup = pre.find((g) => g.matcher === ".*");
    expect(userGroup?.hooks[0]?.command).toBe("echo user-bash-hook");
    expect(ourGroup?.hooks[0]?.command).toContain("127.0.0.1:49251");

    // Unrelated event (UserPromptSubmit) is left fully alone.
    expect(merged.hooks?.UserPromptSubmit).toEqual(input.hooks.UserPromptSubmit);
  });

  it("is idempotent when our hooks already exist", () => {
    const installed = computeMerged({});
    const reinstalled = computeMerged(installed);
    expect(JSON.stringify(reinstalled)).toBe(JSON.stringify(installed));

    // No duplicated command entries.
    const pre = (reinstalled.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    const ourGroup = pre.find((g) => g.matcher === ".*");
    expect(ourGroup?.hooks).toHaveLength(1);
  });

  it("appends our command to an existing .* group rather than duplicating the group", () => {
    const input = {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [{ type: "command", command: "echo user-wildcard" }]
          }
        ]
      }
    };
    const merged = computeMerged(input);
    const pre = (merged.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    // One group, two hooks (user's + ours).
    expect(pre).toHaveLength(1);
    expect(pre[0]?.hooks).toHaveLength(2);
    expect(pre[0]?.hooks[0]?.command).toBe("echo user-wildcard");
    expect(pre[0]?.hooks[1]?.command).toContain("127.0.0.1:49251");
  });

  it("treats a missing matcher on existing group as distinct from `.*`", () => {
    // If the user has a PreToolUse group with no matcher (applies globally),
    // we should NOT clobber it - our entry specifically uses matcher `.*`.
    const input = {
      hooks: {
        PreToolUse: [
          { hooks: [{ type: "command", command: "echo no-matcher" }] }
        ]
      }
    };
    const merged = computeMerged(input);
    const pre = (merged.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    expect(pre).toHaveLength(2);
    expect(pre.find((g) => g.matcher === undefined)?.hooks[0]?.command).toBe(
      "echo no-matcher"
    );
    expect(pre.find((g) => g.matcher === ".*")?.hooks[0]?.command).toContain(
      "127.0.0.1:49251"
    );
  });
});

describe("computeRemoved", () => {
  it("is a no-op on a file with no hooks", () => {
    expect(computeRemoved({})).toEqual({});
    expect(computeRemoved({ model: "x" })).toEqual({ model: "x" });
  });

  it("removes only our entries and keeps user hooks intact", () => {
    const installed = computeMerged({
      model: "claude",
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "echo user-bash" }]
          }
        ],
        Stop: [
          { hooks: [{ type: "command", command: "echo user-stop" }] }
        ]
      }
    });

    const removed = computeRemoved(installed);
    expect(removed.model).toBe("claude");
    const pre = (removed.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    // Only the user's Bash group survives; our `.*` group disappears.
    expect(pre).toHaveLength(1);
    expect(pre[0]?.matcher).toBe("Bash");
    expect(pre[0]?.hooks[0]?.command).toBe("echo user-bash");

    // User's Stop hook is preserved; our Stop group disappears.
    const stop = (removed.hooks?.Stop ?? []) as Array<{
      hooks: Array<{ command: string }>;
    }>;
    expect(stop).toHaveLength(1);
    expect(stop[0]?.hooks[0]?.command).toBe("echo user-stop");

    // Events that only had our hooks are dropped entirely.
    expect(removed.hooks?.SessionStart).toBeUndefined();
    expect(removed.hooks?.SubagentStart).toBeUndefined();
    expect(removed.hooks?.PostToolUse).toBeUndefined();
  });

  it("drops the hooks key entirely when nothing is left", () => {
    const installed = computeMerged({});
    const removed = computeRemoved(installed);
    expect(removed.hooks).toBeUndefined();
  });

  it("keeps user hooks that happen to share a group with ours", () => {
    const input = {
      hooks: {
        PreToolUse: [
          {
            matcher: ".*",
            hooks: [
              { type: "command", command: "echo user-wildcard" },
              { type: "command", command: OUR_CMD }
            ]
          }
        ]
      }
    };
    const removed = computeRemoved(input);
    const pre = (removed.hooks?.PreToolUse ?? []) as Array<{
      matcher?: string;
      hooks: Array<{ command: string }>;
    }>;
    expect(pre).toHaveLength(1);
    expect(pre[0]?.hooks).toHaveLength(1);
    expect(pre[0]?.hooks[0]?.command).toBe("echo user-wildcard");
  });
});

describe("resolveSettingsPath", () => {
  it("uses CLAUDE_CONFIG_DIR when set", () => {
    expect(resolveSettingsPath({ CLAUDE_CONFIG_DIR: "/tmp/fake-cfg" })).toBe(
      "/tmp/fake-cfg/settings.json"
    );
  });

  it("falls back to ~/.claude/settings.json", () => {
    expect(resolveSettingsPath({})).toBe(path.join(os.homedir(), ".claude", "settings.json"));
  });
});

describe("installHook / uninstallHook (filesystem round-trip)", () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cv-hook-installer-"));
    settingsPath = path.join(tmpDir, "settings.json");
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a new settings.json when missing and writes installed hooks", async () => {
    expect(fs.existsSync(settingsPath)).toBe(false);
    const res = await installHook(settingsPath);
    expect(res.changed).toBe(true);
    const written = await fsp.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(written) as { hooks: Record<string, unknown> };
    expect(parsed.hooks.PreToolUse).toBeDefined();
    expect(parsed.hooks.SessionStart).toBeDefined();
  });

  it("is idempotent: install twice does not change the file on the second pass", async () => {
    await installHook(settingsPath);
    const first = await fsp.readFile(settingsPath, "utf8");
    const second = await installHook(settingsPath);
    const afterSecond = await fsp.readFile(settingsPath, "utf8");
    expect(second.changed).toBe(false);
    expect(afterSecond).toBe(first);
  });

  it("uninstall removes only our entries", async () => {
    await fsp.writeFile(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: "echo user" }]
              }
            ]
          }
        },
        null,
        2
      )
    );
    await installHook(settingsPath);
    const uninstall = await uninstallHook(settingsPath);
    expect(uninstall.changed).toBe(true);
    const parsed = JSON.parse(await fsp.readFile(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ matcher?: string; hooks: unknown[] }> };
    };
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.matcher).toBe("Bash");
  });

  it("readSettings flags an installed file as installed=true", async () => {
    await installHook(settingsPath);
    const read = await readSettings(settingsPath);
    expect(read.isInstalled).toBe(true);
  });

  it("readSettings on a missing file returns a diff that adds our hooks", async () => {
    const read = await readSettings(settingsPath);
    expect(read.isInstalled).toBe(false);
    expect(read.currentText).toBe("");
    expect(read.mergedText).toContain("127.0.0.1:49251");
    expect(read.diffText).toContain("+ ");
  });
});
