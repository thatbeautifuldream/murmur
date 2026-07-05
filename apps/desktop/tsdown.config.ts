import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  outExtensions: () => ({ js: ".cjs" }),
  // `electron` is a devDependency, which tsdown would otherwise bundle — but the
  // dev package's entry is a path-resolver (getElectronPath) that throws
  // "Electron failed to install correctly" when run inside a packaged app.
  // Keep it external so require("electron") resolves to Electron's built-in
  // runtime module instead.
  external: ["electron"],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
    noExternal: (id) => id.startsWith("@app/"),
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
    noExternal: (id) => id.startsWith("@app/"),
  },
]);
