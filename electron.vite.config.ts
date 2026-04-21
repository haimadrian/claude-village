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
    build: {
      outDir: "out/renderer",
      // Keep every .glb (and other non-text bundled asset) as a real emitted
      // file rather than a base64 data URL. @react-three/drei's `useGLTF`
      // picks the loader by URL extension; inlined data URLs lose the
      // `.glb` suffix and break the GLTFLoader path. Any asset below the
      // default 4 KiB threshold was previously inlined - explicitly disable
      // that here so every model goes through the asset emitter.
      assetsInlineLimit: 0
    }
  }
});
