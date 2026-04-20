import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/main", rollupOptions: { input: "src/main/index.ts" } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: "src/preload/index.ts",
        // Electron's preload context requires CommonJS (even though our main
        // process is ESM). Force a .cjs output so `require("electron")` works
        // inside the preload sandbox.
        output: { format: "cjs", entryFileNames: "index.cjs" }
      }
    }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: { outDir: "out/renderer" }
  }
});
