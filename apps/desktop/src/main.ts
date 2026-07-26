import { app, BrowserWindow, dialog, screen, session, systemPreferences } from "electron";
import * as path from "node:path";
import { registerIpcHandlers } from "./ipc/handlers";
import { getDictationStatus, onDictationStatusChanged } from "./dictation";
import type { DictationStatus } from "@app/contracts";
import {
  initActivationShortcut,
  initAgentShortcut,
  setAgentCancelShortcutEnabled,
  teardownActivationShortcut,
  teardownAgentShortcut,
} from "./activation-shortcut";
import { abortAgentTurn, getAgentStatus, initAgentSessionManager, onAgentApprovalPendingChanged, onAgentStatusChanged } from "./agent-session";
import { installApplicationMenu } from "./window-chrome";
import { startSpeechd, stopSpeechd } from "./speechd-manager";
import { getCachedNotchGeometry, refreshNotchGeometry } from "./notch-geometry-manager";
import { installTray, uninstallTray } from "./tray";
import { closeTranscriptHistoryStore } from "./transcript-history";
import { resolveRendererUrl } from "./app-window";
import { startLocalServer, stopLocalServer } from "./local-server";
import { initializeAutoUpdater } from "./updater";
import { migrateLegacyUserData } from "./userdata-migration";

// Electron derives app.getName() (menu bar name, About panel, userData path)
// from package.json's "name" field, which is "@app/desktop" for this
// workspace package — override it before anything reads the default.
app.setName("Murmur");

// Without this, an unhandled error anywhere (e.g. a corrupt settings/history
// file) silently kills the whole background app — invisible to a user whose
// only surface is the menu bar, with no clue why dictation just vanished.
function reportFatalError(error: unknown): void {
  console.error(error);
  dialog.showErrorBox(
    "Murmur crashed",
    error instanceof Error ? error.message : String(error),
  );
}
process.on("uncaughtException", reportFatalError);
process.on("unhandledRejection", reportFatalError);

// Footprint sized for the expanded (listening) pill, with the pill itself
// top-anchored inside it via flex. The extra margin beyond the pill's own
// size (see app-shell's padding) isn't just breathing room — the CSS box
// shadow needs real transparent canvas to blur into, or the window's own
// rectangular bounds hard-clip it into a visible cut edge. The height/width
// also leave room below the pill for the live raw-transcript caption to
// grow into (up to its own max-h/max-w, then it scrolls internally).
//
// When idle, the window is sized and positioned to the physical MacBook
// notch's own pixel dimensions (see notch-geometry-manager.ts) so it never
// swallows clicks over real menu-bar content. It can't render truly flush at
// y:0 though — macOS's window server reserves the menu-bar strip itself, and
// no window (any level, any type) can paint above it without the private
// CGSSpace APIs native notch-utility apps use, which are unreachable from
// Electron. In practice the window ends up a few points below the real
// notch/menu-bar regardless of the y we request. Rather than show a visibly
// detached black rectangle there, the renderer paints nothing at all in the
// idle state (see routes/index.tsx) — the hotkey/hover hit-test area is still
// exactly where the real notch is, it's just invisible until dictation
// starts, at which point the pill grows downward from that same anchor. On
// non-notched hardware it falls back to a small idle height inside a wider
// hit-test window — the notch case leaves the same kind of low idle
// footprint that only grows to the full expanded size while dictation is
// active — the top edge stays pinned so the pill only ever grows downward.
const PILL_WIDTH = 360;
const PILL_AREA_HEIGHT = 340;
// Extra downward growth when a tool-approval card is stacked under the pill —
// the default PILL_AREA_HEIGHT only leaves room for the caption, and the
// approval card (title + JSON preview + actions) needs ~this much more or it
// would be clipped by the transparent window's own bounds.
const PILL_APPROVAL_EXTRA_HEIGHT = 260;
const PILL_IDLE_HEIGHT = 64;
const TOP_MARGIN = 8;

function isPillExpanded(status: DictationStatus): boolean {
  return status === "listening" || status === "processing" || status === "inserting";
}

function isPillExpandedForAnyStatus(): boolean {
  return isPillExpanded(getDictationStatus()) || getAgentStatus() !== "idle";
}

// Whether the inline tool-approval card is currently mounted in the renderer —
// drives the extra window height below. Toggled by the agent-session approval
// listeners (tool_call requested / responded / conversation reset).
let approvalPending = false;

// The renderer's collapse sequence (waveform fade, then shape shrink) takes
// ~290ms (see shapeTransition/contentTransition in routes/index.tsx). Shrinking
// the native window's bounds is instant, so if it fired the moment status left
// an expanded state, the window would snap down to the idle height *before*
// the still-expanded pill had visually shrunk to fit — clipping its top edge
// against the new, smaller window for the rest of the transition. Expanding
// has no such race (the window only ever needs to grow ahead of content that's
// also growing), so only the shrink is deferred.
const COLLAPSE_ANIMATION_MS = 320;
let shrinkTimer: NodeJS.Timeout | undefined;

function schedulePillBounds(window: BrowserWindow, expanded: boolean): void {
  if (shrinkTimer) {
    clearTimeout(shrinkTimer);
    shrinkTimer = undefined;
  }
  // Growth applies immediately so the window leads the renderer's enter
  // animation; any shrink (whether to idle or just dropping the approval
  // card) is deferred so the exiting content can animate out before its
  // container clips it.
  const currentHeight = window.isDestroyed() ? Number.POSITIVE_INFINITY : window.getBounds().height;
  const geometry = getCachedNotchGeometry();
  const notch = geometry?.hasNotch ? geometry : undefined;
  const baseHeight = expanded ? PILL_AREA_HEIGHT : (notch?.notchHeight ?? PILL_IDLE_HEIGHT);
  const targetHeight = expanded && approvalPending ? baseHeight + PILL_APPROVAL_EXTRA_HEIGHT : baseHeight;
  if (targetHeight >= currentHeight) {
    applyPillBounds(window, expanded);
    return;
  }
  shrinkTimer = setTimeout(() => {
    shrinkTimer = undefined;
    if (!window.isDestroyed()) applyPillBounds(window, expanded);
  }, COLLAPSE_ANIMATION_MS);
}

// The Electron `Display` that actually has the notch, matched against the
// native helper's reported screen size — `screen.getPrimaryDisplay()` isn't
// reliably the built-in display once an external monitor is connected.
function pillDisplay(): Electron.Display {
  const geometry = getCachedNotchGeometry();
  if (geometry) {
    const match = screen
      .getAllDisplays()
      .find(
        (d) =>
          Math.abs(d.bounds.width - geometry.screenWidth) < 1 &&
          Math.abs(d.bounds.height - geometry.screenHeight) < 1,
      );
    if (match) return match;
  }
  return screen.getPrimaryDisplay();
}

// Where the pill is anchored: the horizontal center it's docked around, and
// its top edge — the notch's own center (or screen-top-center on non-notched
// hardware). The pill isn't user-repositionable (it's meant to read as part
// of the notch itself), so this is always recomputed fresh rather than
// persisted; it only actually changes when the notch geometry does (see the
// display-change handling in bootstrap). Center (not left edge) is what's
// anchored on because idle and expanded widths differ on notched hardware —
// anchoring on center keeps both states concentric on the same point.
function pillAnchor(): { centerX: number; top: number } {
  const display = pillDisplay();
  const geometry = getCachedNotchGeometry();
  if (geometry?.hasNotch) {
    return {
      centerX: display.bounds.x + geometry.notchX + geometry.notchWidth / 2,
      top: display.bounds.y,
    };
  }
  return {
    centerX: display.workArea.x + display.workArea.width / 2,
    top: display.workArea.y + TOP_MARGIN,
  };
}

// Keep the window top-anchored while swapping between the idle and expanded
// sizes, so the pill holds its on-screen position through the resize. Idle
// size matches the physical notch exactly when one is present (flush, no
// gap); expanded always grows to the full footprint, top edge pinned so
// growth is purely downward.
function applyPillBounds(window: BrowserWindow, expanded: boolean): void {
  const anchor = pillAnchor();
  const geometry = getCachedNotchGeometry();
  const notch = geometry?.hasNotch ? geometry : undefined;
  const width = expanded ? PILL_WIDTH : (notch?.notchWidth ?? PILL_WIDTH);
  const baseHeight = expanded ? PILL_AREA_HEIGHT : (notch?.notchHeight ?? PILL_IDLE_HEIGHT);
  const height = expanded && approvalPending ? baseHeight + PILL_APPROVAL_EXTRA_HEIGHT : baseHeight;
  window.setBounds({
    x: Math.round(anchor.centerX - width / 2),
    y: Math.round(anchor.top),
    width: Math.round(width),
    height: Math.round(height),
  });
  // While idle the flatline/notch-flush shape is decorative — the hotkey is
  // the control surface — so let every click fall through to whatever's
  // underneath. `forward` still delivers mouse-move so hover would work if we
  // ever needed it; the window recaptures clicks only once it expands into
  // the interactive pill.
  window.setIgnoreMouseEvents(!expanded, { forward: true });
}

function createMainWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const anchor = pillAnchor();
  const geometry = getCachedNotchGeometry();
  const notch = geometry?.hasNotch ? geometry : undefined;
  const idleWidth = notch?.notchWidth ?? PILL_WIDTH;
  const idleHeight = notch?.notchHeight ?? PILL_IDLE_HEIGHT;

  const window = new BrowserWindow({
    width: Math.round(idleWidth),
    height: Math.round(idleHeight),
    x: Math.round(anchor.centerX - idleWidth / 2),
    y: Math.round(anchor.top),
    title: "Murmur",
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    movable: false,
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
  // setting it only at construction time is unreliable. Level "status" (not
  // "screen-saver") sits just above the menu bar, matching where notch-dock
  // reference apps (e.g. Boring Notch's `.mainMenu + 3`) actually float —
  // "screen-saver" is meant for full-screen takeover surfaces and risks
  // fighting the real screensaver/lock transitions.
  const floatEverywhere = () => {
    if (!isMac) return;
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(true, "status");
  };
  floatEverywhere();
  window.once("ready-to-show", floatEverywhere);
  window.on("show", floatEverywhere);

  // Starts idle, so clicks pass straight through until dictation expands it.
  window.setIgnoreMouseEvents(true, { forward: true });

  void window.loadURL(resolveRendererUrl());

  return window;
}

let mainWindow: BrowserWindow | undefined;

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
  // Runs before anything below reads userData. Copies the v0.0.1
  // ~/Library/Application Support/@app/desktop/ DB, settings, and recordings
  // into the post-rename Murmur/ folder so an upgrade doesn't look like the
  // user's history and shortcut both vanished.
  migrateLegacyUserData();

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
  initAgentSessionManager();
  startLocalServer();
  installApplicationMenu();
  installTray();
  // Needed before the window is created so its initial idle bounds are
  // sized to the real notch instead of the PILL_WIDTH/PILL_IDLE_HEIGHT
  // fallback for one frame.
  await refreshNotchGeometry();
  mainWindow = createMainWindow();
  // Grow the window to the full pill footprint only while dictation is active,
  // and drop it back to the low idle height (so idle clicks fall through to
  // whatever's underneath) once it stops.
    onDictationStatusChanged(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        schedulePillBounds(mainWindow, isPillExpandedForAnyStatus());
      }
      installApplicationMenu();
    });
    onAgentStatusChanged((agentStatus) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        schedulePillBounds(mainWindow, isPillExpandedForAnyStatus());
      }
      setAgentCancelShortcutEnabled(
        agentStatus === "listening" || agentStatus === "thinking" || agentStatus === "speaking",
      );
    });
    onAgentApprovalPendingChanged((pending) => {
      approvalPending = pending;
      if (mainWindow && !mainWindow.isDestroyed()) {
        schedulePillBounds(mainWindow, isPillExpandedForAnyStatus());
      }
    });
  // Await the spawn so the port-reclaim pre-flight finishes before the
  // activation shortcut is armed: otherwise dictation triggered in the first
  // ~second could land on a stale squatter still holding port 8722. The spawn
  // itself is the slow part only when a reclaim is needed (port free → no-op).
  await startSpeechd();
  initializeAutoUpdater();

  initActivationShortcut();
  initAgentShortcut();
  // External-monitor connect/disconnect (or a resolution change) can change
  // which display has the notch, or its geometry — re-query and re-anchor.
  // macOS fires this event multiple times in a burst per change, so debounce.
  let displayChangeTimer: NodeJS.Timeout | undefined;
  const handleDisplayChange = () => {
    if (displayChangeTimer) clearTimeout(displayChangeTimer);
    displayChangeTimer = setTimeout(() => {
      displayChangeTimer = undefined;
      void refreshNotchGeometry().then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          applyPillBounds(mainWindow, isPillExpandedForAnyStatus());
        }
      });
    }, 200);
  };
  screen.on("display-metrics-changed", handleDisplayChange);
  screen.on("display-added", handleDisplayChange);
  screen.on("display-removed", handleDisplayChange);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
  });
}

app.on("will-quit", () => {
  teardownActivationShortcut();
  teardownAgentShortcut();
  void abortAgentTurn();
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
