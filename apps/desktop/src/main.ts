import { app, BrowserWindow, screen } from "electron";
import * as path from "node:path";
import * as url from "node:url";
import { registerIpcHandlers } from "./ipc/handlers";
import { toggleDictation } from "./dictation";
import { listenForOptionTap } from "./option-key-listener";
import { installApplicationMenu } from "./window-chrome";

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

// Fixed footprint sized for the expanded (listening) pill, with the pill
// itself bottom-anchored inside it via flex. Sizing the window this way
// instead of resizing on state change avoids OS-level resize jank on a
// frameless/transparent window.
const PILL_WIDTH = 280;
const PILL_AREA_HEIGHT = 72;
const BOTTOM_MARGIN = 28;

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const { workArea } = screen.getPrimaryDisplay();

  const window = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_AREA_HEIGHT,
    x: Math.round(workArea.x + (workArea.width - PILL_WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height - PILL_AREA_HEIGHT - BOTTOM_MARGIN),
    title: "Murmur",
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Float over full-screen apps and every Space, since dictation needs to
  // work no matter what has focus. macOS treats a full-screen app as its own
  // Space, so this has to be reasserted once the window is actually up —
  // setting it only at construction time is unreliable.
  const floatEverywhere = () => {
    if (!isMac) return;
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(true, "screen-saver");
  };
  floatEverywhere();
  window.once("ready-to-show", floatEverywhere);
  window.on("show", floatEverywhere);

  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadURL(url.pathToFileURL(resolveRendererIndex()).toString());
  }

  return window;
}

// A second instance would spawn a second pill and a second global-key
// listener — both toggling the same murmur-speechd. Refuse to duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let stopOptionListener: (() => void) | undefined;

app.whenReady().then(() => {
  // A pure overlay pill has no reason to hold a dock icon or take focus like
  // a regular app — this also helps it behave as an accessory window macOS
  // is willing to float over full-screen Spaces.
  app.dock?.hide();

  registerIpcHandlers();
  installApplicationMenu();
  createMainWindow();

  stopOptionListener = listenForOptionTap(() => void toggleDictation());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("will-quit", () => {
  stopOptionListener?.();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
