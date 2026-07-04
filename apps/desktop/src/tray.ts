import { Menu, nativeImage, Tray, type NativeImage } from "electron";
import type { DictationStatus } from "@app/contracts";
import { getDictationStatus, onDictationStatusChanged, toggleDictation } from "./dictation";
import { openAppWindow } from "./app-window";

const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
  <path fill="#000" d="M9 1.75a3 3 0 0 0-3 3v4.5a3 3 0 1 0 6 0v-4.5a3 3 0 0 0-3-3Zm5.5 7a.75.75 0 0 0-1.5 0 4 4 0 0 1-8 0 .75.75 0 0 0-1.5 0 5.5 5.5 0 0 0 4.75 5.45v1.05H6.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H9.75V14.2a5.5 5.5 0 0 0 4.75-5.45Z"/>
</svg>`;
const INACTIVE_TRAY_SYMBOL = "microphone.badge.ellipsis";
const ACTIVE_TRAY_SYMBOL = "microphone.badge.ellipsis.fill";

let tray: Tray | undefined;
let removeStatusListener: (() => void) | undefined;

function traySymbol(status: DictationStatus): string {
  return status === "listening" || status === "processing" || status === "inserting"
    ? ACTIVE_TRAY_SYMBOL
    : INACTIVE_TRAY_SYMBOL;
}

function createTrayIcon(status = getDictationStatus()): NativeImage {
  const icon =
    process.platform === "darwin"
      ? nativeImage.createFromNamedImage(traySymbol(status), {
          pointSize: 16,
          weight: "regular",
          scale: "small",
        })
      : nativeImage.createFromDataURL(
          `data:image/svg+xml;base64,${Buffer.from(TRAY_ICON_SVG).toString("base64")}`,
        );
  const trayIcon = icon.resize({ width: 18, height: 18 });
  trayIcon.setTemplateImage(true);
  return trayIcon;
}

function createMenuIcon(status = getDictationStatus()): NativeImage | undefined {
  if (process.platform !== "darwin") return undefined;
  return nativeImage.createMenuSymbol(traySymbol(status));
}

function statusLabel(status: DictationStatus): string {
  if (status === "listening") return "Stop Dictation";
  if (status === "processing") return "Processing...";
  if (status === "inserting") return "Inserting...";
  return "Start Dictation";
}

function updateTray(status = getDictationStatus()): void {
  if (!tray) return;
  tray.setImage(createTrayIcon(status));
  tray.setToolTip(`Murmur - ${statusLabel(status)}`);
}

function openTrayMenu(): void {
  if (!tray) return;
  const status = getDictationStatus();
  const menu = Menu.buildFromTemplate([
    {
      label: statusLabel(status),
      icon: createMenuIcon(status),
      enabled: status !== "processing" && status !== "inserting",
      click: () => void toggleDictation(),
    },
    { type: "separator" },
    { label: "Show History", click: () => openAppWindow("/history") },
    { type: "separator" },
    { role: "quit" },
  ]);
  tray.popUpContextMenu(menu);
}

export function installTray(): void {
  tray = new Tray(createTrayIcon());
  updateTray();

  tray.on("click", () => openAppWindow("/history"));
  tray.on("right-click", openTrayMenu);

  removeStatusListener = onDictationStatusChanged(updateTray);
}

export function uninstallTray(): void {
  removeStatusListener?.();
  removeStatusListener = undefined;
  tray?.destroy();
  tray = undefined;
}
