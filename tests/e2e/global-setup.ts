import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

/**
 * Prepares the build outputs so an Electron e2e launch can succeed.
 *
 * Two pre-existing issues the plan will address in later tasks (out of
 * Task 16 source scope) are handled here without touching any main / preload
 * / renderer source files:
 *
 * 1. `pnpm test` (vitest) runs `pretest: rebuild:node` and leaves
 *    better-sqlite3 bound to the host Node ABI. Electron then cannot load
 *    the native module ("NODE_MODULE_VERSION mismatch"). We re-run
 *    `rebuild:electron` here so the harness is order-independent. The
 *    `.forge-meta` cache must be wiped first or electron-builder
 *    short-circuits.
 * 2. `src/main/index.ts` references `../preload/index.js` but electron-vite
 *    emits `index.mjs` (project is ESM via `"type": "module"`). Electron's
 *    sandboxed preloads further require CommonJS. We drop a tiny CJS shim
 *    at `out/preload/index.js` mirroring the exposed surface from
 *    `src/preload/index.ts`. Production packaging (Task 17) will resolve
 *    the underlying mismatch.
 */
export default function globalSetup(): void {
  const preloadDir = path.join(repoRoot, "out", "preload");
  if (!fs.existsSync(preloadDir)) {
    throw new Error(
      `Missing build output at ${preloadDir}. Run \`pnpm build\` before \`pnpm e2e\`.`
    );
  }

  try {
    const meta = execSync(
      "find node_modules/.pnpm -maxdepth 6 -name .forge-meta -path '*better-sqlite3*' -print -quit",
      { cwd: repoRoot, encoding: "utf8" }
    ).trim();
    if (meta) fs.rmSync(path.resolve(repoRoot, meta), { force: true });
  } catch {
    /* best-effort - the rebuild will still produce a valid binary */
  }
  execSync("pnpm run rebuild:electron", { cwd: repoRoot, stdio: "ignore" });

  fs.writeFileSync(
    path.join(preloadDir, "index.js"),
    `const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("claudeVillage", {
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  getSession: (id) => ipcRenderer.invoke("session:get", id),
  pinSession: (id) => ipcRenderer.invoke("session:pin", id),
  unpinSession: (id) => ipcRenderer.invoke("session:unpin", id),
  onPatch: (cb) => {
    const listener = (_e, p) => cb(p);
    ipcRenderer.on("session:patch", listener);
    return () => ipcRenderer.off("session:patch", listener);
  },
  onMenuAbout: (cb) => {
    const l = () => cb();
    ipcRenderer.on("menu:about", l);
    return () => ipcRenderer.off("menu:about", l);
  }
});
`
  );
}
