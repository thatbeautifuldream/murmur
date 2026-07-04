import { app, BrowserWindow, globalShortcut } from "electron";
import * as path from "node:path";
import * as url from "node:url";
import { IpcChannels } from "@app/contracts";
import { registerIpcHandlers } from "./ipc/handlers";
import { toggleDictation } from "./dictation";
import {
  TRAFFIC_LIGHT_POSITION,
  installApplicationMenu,
  broadcastZoom,
} from "./window-chrome";

// Option+Space — toggles dictation from anywhere, not just while Murmur is
// focused, since the whole point is inserting text into whatever app has
// the cursor.
const DICTATION_SHORTCUT = "Alt+Space";

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function resolveRendererIndex(): string {
  // Packaged: renderer is copied to resources/renderer by electron-builder.
  // Unpackaged build (bun run build && bun run start): load apps/web/dist directly.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "renderer", "index.html");
  }
  return path.join(__dirname, "..", "..", "web", "dist", "index.html");
}

const TITLEBAR_HEIGHT = 40;

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    title: "Murmur",
    backgroundColor: "#0a0a0a",
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    // Constant position centered in the header row. The renderer keeps its
    // titlebar at native size on zoom so this line always matches (window-chrome).
    trafficLightPosition: isMac ? TRAFFIC_LIGHT_POSITION : undefined,
    titleBarOverlay: isMac
      ? undefined
      : {
          color: "#0a0a0a",
          symbolColor: "#f5f5f5",
          height: TITLEBAR_HEIGHT,
        },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Tell the renderer when full-screen toggles so it can hide the traffic-light
  // gutter — macOS removes the window controls in full screen.
  const emitFullScreen = (value: boolean) =>
    window.webContents.send(IpcChannels.ON_FULLSCREEN_CHANGED, value);
  window.on("enter-full-screen", () => emitFullScreen(true));
  window.on("leave-full-screen", () => emitFullScreen(false));

  // Feed the renderer the zoom factor so it can keep the titlebar native-sized:
  // once the page settles, and on pinch / ctrl-scroll zoom (menu zoom too).
  window.webContents.on("did-finish-load", () => broadcastZoom(window));
  window.webContents.on("zoom-changed", () => broadcastZoom(window));

  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadURL(url.pathToFileURL(resolveRendererIndex()).toString());
  }

  return window;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  installApplicationMenu();
  createMainWindow();

  globalShortcut.register(DICTATION_SHORTCUT, () => void toggleDictation());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
