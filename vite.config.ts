import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri-oriented Vite config: fixed port for the dev webview, no clearing of
// Rust compiler output, and src-tauri excluded from the file watcher.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2400,
  },
});
