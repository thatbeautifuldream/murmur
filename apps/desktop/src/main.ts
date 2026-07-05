import { app, BrowserWindow, screen, session, systemPreferences } from "electron";
import * as path from "node:path";
import { registerIpcHandlers } from "./ipc/handlers";
import { toggleDictation, onDictationStatusChanged } from "./dictation";
import type { DictationStatus } from "@app/contracts";
import {
  hasAccessibilityAccess,
  listenForOptionTap,
  openAccessibilitySettings,
} from "./option-key-listener";
import { installApplicationMenu } from "./window-chrome";
import { startSpeechd, stopSpeechd } from "./speechd-manager";
import { installTray, uninstallTray } from "./tray";
import { closeTranscriptHistoryStore } from "./transcript-history";
import { resolveRendererUrl } from "./app-window";
import { startLocalServer, stopLocalServer } from "./local-server";
import { initializeAutoUpdater } from "./updater";

// Footprint sized for the expanded (listening) pill, with the pill itself
// bottom-anchored inside it via flex. The extra margin beyond the pill's own
// size (see app-shell's padding) isn't just breathing room — the CSS box
// shadow needs real transparent canvas to blur into, or the window's own
// rectangular bounds hard-clip it into a visible cut edge. The height/width
// also leave room above the pill for the live raw-transcript caption to
// grow into (up to its own max-h/max-w, then it scrolls internally).
//
// When idle, though, that full canvas would swallow every click over a large
// bottom-center patch of the screen even though only the 4px flatline is
// visible. So the window collapses to a low idle height (just enough for the
// flatline plus its transparent padding) and only grows to the full footprint
// while dictation is active — the bottom edge stays pinned so the pill never
// moves.
const PILL_WIDTH = 360;
const PILL_AREA_HEIGHT = 340;
const PILL_IDLE_HEIGHT = 64;
const BOTTOM_MARGIN = 28;

function isPillExpanded(status: DictationStatus): boolean {
  return status === "listening" || status === "processing" || status === "inserting";
}

// Where the pill is anchored: its left edge and its bottom edge. Defaults to
// bottom-center, but a drag overwrites it (see the "move" handler) so the
// resize below never yanks a repositioned pill back to the middle.
let pillAnchor: { x: number; bottom: number } | undefined;

function defaultPillAnchor(): { x: number; bottom: number } {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + (workArea.width - PILL_WIDTH) / 2),
    bottom: workArea.y + workArea.height - BOTTOM_MARGIN,
  };
}

// Keep the window bottom-anchored while swapping between the idle and expanded
// heights, so the pill holds its on-screen position through the resize.
function applyPillBounds(window: BrowserWindow, expanded: boolean): void {
  const anchor = pillAnchor ?? defaultPillAnchor();
  const height = expanded ? PILL_AREA_HEIGHT : PILL_IDLE_HEIGHT;
  window.setBounds({
    x: anchor.x,
    y: Math.round(anchor.bottom - height),
    width: PILL_WIDTH,
    height,
  });
  // While idle the flatline is decorative — the hotkey is the control surface —
  // so let every click fall through to whatever's underneath. `forward` still
  // delivers mouse-move so hover would work if we ever needed it; the window
  // recaptures clicks only once it expands into the interactive pill.
  window.setIgnoreMouseEvents(!expanded, { forward: true });
}

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const { workArea } = screen.getPrimaryDisplay();

  const window = new BrowserWindow({
    width: PILL_WIDTH,
    height: PILL_IDLE_HEIGHT,
    x: Math.round(workArea.x + (workArea.width - PILL_WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height - PILL_IDLE_HEIGHT - BOTTOM_MARGIN),
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

  // Starts idle, so clicks pass straight through until dictation expands it.
  window.setIgnoreMouseEvents(true, { forward: true });

  // Remember wherever the pill is dragged to (by its left/bottom edge) so the
  // idle<->expanded resize re-anchors there instead of snapping to center. Our
  // own setBounds re-fires this, but it writes back the same anchor, so it's a
  // no-op in that case.
  window.on("move", () => {
    if (window.isDestroyed()) return;
    const { x, y, height } = window.getBounds();
    pillAnchor = { x, bottom: y + height };
  });

  void window.loadURL(resolveRendererUrl());

  return window;
}

let mainWindow: BrowserWindow | undefined;
let stopOptionListener: (() => void) | undefined;
let accessibilityPoll: ReturnType<typeof setInterval> | undefined;

// The Option-tap hook needs macOS Accessibility. Prompt for it, and since the
// grant can't attach to an already-running tap (and the user grants it out of
// band in System Settings), start the listener only once trusted — polling so
// no app relaunch is needed after the toggle is flipped.
function startOptionListenerWhenTrusted(): void {
  if (hasAccessibilityAccess(true)) {
    stopOptionListener = listenForOptionTap(() => void toggleDictation());
    return;
  }
  openAccessibilitySettings();
  accessibilityPoll = setInterval(() => {
    if (hasAccessibilityAccess(false)) {
      clearInterval(accessibilityPoll);
      accessibilityPoll = undefined;
      stopOptionListener = listenForOptionTap(() => void toggleDictation());
    }
  }, 1000);
}

// A second instance would spawn a second pill and a second global-key
// listener — both toggling the same murmur-speechd. Refuse to duplicate:
// bail out of the whole startup and hand focus back to the running instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
  bootstrap();
}

function bootstrap(): void {
  app.whenReady().then(async () => {
  // A pure overlay pill has no reason to hold a dock icon or take focus like
  // a regular app — this also helps it behave as an accessory window macOS
  // is willing to float over full-screen Spaces.
  app.dock?.hide();

  // The renderer's own getUserMedia() call (for the live waveform) is a
  // second, independent mic consumer from murmur-speechd's — Electron denies
  // it outright unless a permission handler explicitly allows "media", and
  // macOS still gates the underlying TCC prompt on askForMediaAccess.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "media");
  if (process.platform === "darwin") {
    // Never let a mic-permission failure abort startup — the pill must still
    // appear even if the user denies access.
    await systemPreferences.askForMediaAccess("microphone").catch(() => false);
  }

  registerIpcHandlers();
  startLocalServer();
  installApplicationMenu();
  installTray();
  mainWindow = createMainWindow();
  // Grow the window to the full pill footprint only while dictation is active,
  // and drop it back to the low idle height (so idle clicks fall through to
  // whatever's underneath) once it stops.
  onDictationStatusChanged((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      applyPillBounds(mainWindow, isPillExpanded(status));
    }
  });
  startSpeechd();
  initializeAutoUpdater();

  startOptionListenerWhenTrusted();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
  });
}

app.on("will-quit", () => {
  if (accessibilityPoll) clearInterval(accessibilityPoll);
  stopOptionListener?.();
  uninstallTray();
  stopSpeechd();
  stopLocalServer();
  closeTranscriptHistoryStore();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
