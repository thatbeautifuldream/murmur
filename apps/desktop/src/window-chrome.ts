import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { IpcChannels } from "@app/contracts";

// The traffic lights are native chrome and stay at a CONSTANT position. Rather
// than chase them on zoom, the renderer keeps its titlebar at native size (it
// counter-scales by the zoom factor), so the header line always meets the
// lights. We just broadcast the zoom factor so the renderer can do that.
//
// Constant position: centered in the header row whose content centerline is at
// 28px native (see app-shell / app-sidebar). Eyeball-tuned so the glyph centers
// land on the toggle + title line.
export const TRAFFIC_LIGHT_POSITION = { x: 20, y: 20 };

/** Tell the renderer the current zoom factor so it can size the titlebar. */
export function broadcastZoom(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  window.webContents.send(IpcChannels.ON_ZOOM_CHANGED, window.webContents.getZoomFactor());
}

const ZOOM_STEP = 0.5; // matches Electron's default zoom-level increment
const MIN_ZOOM_LEVEL = -3;
const MAX_ZOOM_LEVEL = 6;

function applyZoom(window: BrowserWindow | undefined, delta: number | "reset"): void {
  if (!window || window.isDestroyed()) return;
  const wc = window.webContents;
  const next =
    delta === "reset"
      ? 0
      : Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, wc.getZoomLevel() + delta));
  wc.setZoomLevel(next);
  broadcastZoom(window);
}

/**
 * Install an application menu whose zoom items broadcast the new zoom factor.
 * We override the default View → Zoom roles because those change zoom without
 * notifying the renderer, leaving the titlebar unable to keep itself native.
 */
export function installApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const zoomItems: MenuItemConstructorOptions[] = [
    {
      label: "Actual Size",
      accelerator: "CmdOrCtrl+0",
      click: (_item, window) => applyZoom(window as BrowserWindow | undefined, "reset"),
    },
    {
      label: "Zoom In",
      accelerator: "CmdOrCtrl+Plus",
      click: (_item, window) => applyZoom(window as BrowserWindow | undefined, ZOOM_STEP),
    },
    // Alias so the unshifted Cmd+= also zooms in (the common keypress).
    {
      label: "Zoom In",
      accelerator: "CmdOrCtrl+=",
      visible: false,
      click: (_item, window) => applyZoom(window as BrowserWindow | undefined, ZOOM_STEP),
    },
    {
      label: "Zoom Out",
      accelerator: "CmdOrCtrl+-",
      click: (_item, window) => applyZoom(window as BrowserWindow | undefined, -ZOOM_STEP),
    },
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" } as MenuItemConstructorOptions] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        ...zoomItems,
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
