import { app, BrowserWindow } from "electron";
import * as path from "node:path";
import * as url from "node:url";
import { IpcChannels } from "@app/contracts";

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

/** Packaged: renderer is copied to resources/renderer by electron-builder.
 *  Unpackaged build (bun run build && bun run start): load apps/web/dist directly. */
export function resolveRendererIndex(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "renderer", "index.html");
  }
  return path.join(__dirname, "..", "..", "web", "dist", "index.html");
}

/** The renderer uses hash-based routing so the same `index.html` can be
 *  deep-linked to a route without a server to rewrite paths. */
export function resolveRendererUrl(hash = ""): string {
  const base =
    isDev && devServerUrl ? devServerUrl : url.pathToFileURL(resolveRendererIndex()).toString();
  return hash ? `${base}#${hash}` : base;
}

let appWindow: BrowserWindow | undefined;

/** Opens (or focuses) the full-size windowed app — Settings, Transforms,
 *  History, About — as distinct from the always-on-top dictation pill. */
export function openAppWindow(hash = "/history"): void {
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.show();
    appWindow.focus();
    return;
  }

  appWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 640,
    minHeight: 420,
    title: "Murmur",
    show: false,
    // Matches the app's dark background (index.css `.dark { --background }`)
    // so there's no white flash before the page paints its own background.
    backgroundColor: "#141414",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 20, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void appWindow.loadURL(resolveRendererUrl(hash));
  appWindow.once("ready-to-show", () => appWindow?.show());
  appWindow.on("closed", () => {
    appWindow = undefined;
  });

  // macOS hides the traffic-light controls in full screen — tell the
  // renderer so it can reclaim the gutter reserved for them.
  const emitFullScreen = (value: boolean) => {
    appWindow?.webContents.send(IpcChannels.ON_WINDOW_FULLSCREEN_CHANGED, value);
  };
  appWindow.on("enter-full-screen", () => emitFullScreen(true));
  appWindow.on("leave-full-screen", () => emitFullScreen(false));
}
