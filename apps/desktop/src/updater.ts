import { app, dialog, powerMonitor } from "electron";
import * as electronUpdater from "electron-updater";

// electron-updater is CJS with __esModule:true but NO default export — `autoUpdater`
// is a lazy getter on the namespace. A default import resolves to `.default`
// (undefined) once bundled; go through the namespace so the getter is reached.
const { autoUpdater } = electronUpdater;

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let isInitialized = false;
// Set while a user-triggered check is in flight so we can surface a dialog on
// the outcome — background checks stay silent.
let manualCheckPending = false;

/** Wires electron-updater to the GitHub Releases feed baked in at build time
 *  (see the `publish` block in electron-builder.config.cjs). Updates download
 *  in the background and install on quit; no-ops when unpackaged or when the
 *  app isn't running from /Applications (where macOS forbids self-update). */
export function initializeAutoUpdater(): void {
  if (isInitialized) return;
  isInitialized = true;

  if (!app.isPackaged) return;
  if (process.platform === "darwin" && !app.isInApplicationsFolder()) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-not-available", () => {
    if (!manualCheckPending) return;
    manualCheckPending = false;
    void dialog.showMessageBox({
      type: "info",
      message: "You're up to date",
      detail: `Murmur ${app.getVersion()} is the latest version.`,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    manualCheckPending = false;
    void dialog
      .showMessageBox({
        type: "info",
        buttons: ["Restart", "Later"],
        defaultId: 0,
        message: "Update ready",
        detail: `Murmur ${info.version} has been downloaded. Restart to install.`,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (error: Error) => {
    if (!manualCheckPending) return;
    manualCheckPending = false;
    void dialog.showMessageBox({
      type: "error",
      message: "Update check failed",
      detail: error.message || "Failed to check for updates.",
    });
  });

  // A machine that slept through the interval should re-check on wake.
  powerMonitor.on("resume", () => void autoUpdater.checkForUpdates());

  void autoUpdater.checkForUpdates();
  setInterval(() => void autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS).unref();
}

/** Triggered from the app menu; surfaces a dialog when there's nothing to
 *  install so the click has visible feedback. */
export function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    void dialog.showMessageBox({
      type: "info",
      message: "Updates are disabled in development",
    });
    return;
  }
  manualCheckPending = true;
  void autoUpdater.checkForUpdates();
}
