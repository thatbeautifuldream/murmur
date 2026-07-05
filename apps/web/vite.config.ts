import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST?.trim() || "localhost";

// Same source Electron's `app.getVersion()` reads (apps/desktop/package.json),
// baked in at build time so the About page shows the right version whether
// it's running inside Electron or as a plain web page with no IPC bridge.
const desktopPackageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, "../desktop/package.json"), "utf-8"),
) as { version: string };

export default defineConfig({
  // Relative asset paths so index.html loads under Electron's file:// protocol
  // (packaged renderer), not just from a server root.
  base: "./",
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(desktopPackageJson.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host,
    port,
    strictPort: true,
    hmr: { protocol: "ws", host },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
