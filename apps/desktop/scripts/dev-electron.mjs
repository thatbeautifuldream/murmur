import { spawn } from "node:child_process";
import { existsSync, mkdirSync, watch } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = dirname(here);
const require = createRequire(import.meta.url);
const electronPath = require("electron");

const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
if (!devServerUrl) {
  throw new Error("VITE_DEV_SERVER_URL is required for desktop development.");
}
const devServer = new URL(devServerUrl);
const port = Number.parseInt(devServer.port || "80", 10);

const watchedDir = join(desktopDir, "dist-electron");
mkdirSync(watchedDir, { recursive: true });
const bundledFiles = ["main.cjs", "preload.cjs"].map((f) => join(watchedDir, f));

const restartDebounceMs = 120;
let shuttingDown = false;
let currentApp = null;
let restartTimer = null;

function waitForFile(path) {
  return new Promise((resolve) => {
    if (existsSync(path)) return resolve();
    const parent = dirname(path);
    mkdirSync(parent, { recursive: true });
    const watcher = watch(parent, () => {
      if (existsSync(path)) {
        watcher.close();
        resolve();
      }
    });
    if (existsSync(path)) {
      watcher.close();
      resolve();
    }
  });
}

function waitForTcp(host, port) {
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = createConnection({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 250);
      });
    };
    tryConnect();
  });
}

async function waitForReady() {
  await Promise.all([
    ...bundledFiles.map(waitForFile),
    waitForTcp(devServer.hostname, port),
  ]);
}

function startApp() {
  if (shuttingDown || currentApp) return;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = spawn(electronPath, ["dist-electron/main.cjs"], {
    cwd: desktopDir,
    env,
    stdio: "inherit",
  });
  currentApp = app;
  app.once("exit", () => {
    if (currentApp === app) currentApp = null;
  });
}

function stopApp() {
  return new Promise((resolve) => {
    const app = currentApp;
    if (!app) return resolve();
    currentApp = null;
    app.once("exit", () => resolve());
    app.kill("SIGTERM");
    setTimeout(() => app.kill("SIGKILL"), 1500).unref();
  });
}

function scheduleRestart() {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    await stopApp();
    startApp();
  }, restartDebounceMs);
}

await waitForReady();
watch(watchedDir, (_eventType, filename) => {
  if (filename === "main.cjs" || filename === "preload.cjs") scheduleRestart();
});
startApp();

async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopApp();
  process.exit(code);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));
