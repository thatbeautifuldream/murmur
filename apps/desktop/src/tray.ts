import { Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions, type NativeImage } from "electron";
import { LOCAL_HTTP_PORT, type DictationStatus } from "@app/contracts";
import { getDictationStatus, onDictationStatusChanged, toggleDictation } from "./dictation";
import { getModes, setModes } from "./settings-store";
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

function buildModesSubmenu(): MenuItemConstructorOptions[] {
  const config = getModes();
  return [
    {
      label: "Auto (by app)",
      type: "checkbox",
      checked: config.overrideModeId === null,
      click: () => setModes({ ...config, overrideModeId: null }),
    },
    { type: "separator" },
    ...config.modes.map<MenuItemConstructorOptions>((mode) => ({
      label: mode.name,
      type: "checkbox",
      checked: config.overrideModeId === mode.id,
      click: () => setModes({ ...config, overrideModeId: mode.id }),
    })),
  ];
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
    { label: "Mode", submenu: buildModesSubmenu() },
    { type: "separator" },
    { label: "Show History", click: () => openAppWindow("/history") },
    {
      label: "Open in Browser",
      click: () => void shell.openExternal(`http://127.0.0.1:${LOCAL_HTTP_PORT}`),
    },
    {
      label: "API Docs",
      click: () => void shell.openExternal(`http://127.0.0.1:${LOCAL_HTTP_PORT}/docs`),
    },
    { type: "separator" },
    { role: "quit" },
  ]);
  tray.popUpContextMenu(menu);
}

export function installTray(): void {
  tray = new Tray(createTrayIcon());
  updateTray();

  tray.on("click", openTrayMenu);
  tray.on("right-click", openTrayMenu);

  removeStatusListener = onDictationStatusChanged(updateTray);
}

export function uninstallTray(): void {
  removeStatusListener?.();
  removeStatusListener = undefined;
  tray?.destroy();
  tray = undefined;
}
