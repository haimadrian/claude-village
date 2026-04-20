import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/main", rollupOptions: { input: "src/main/index.ts" } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/preload", rollupOptions: { input: "src/preload/index.ts" } }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: { outDir: "out/renderer" }
  }
});
