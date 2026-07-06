import { BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { IpcChannels } from "@app/contracts";
import { getDictationStatus, toggleDictation } from "./dictation";
import { openAppWindow } from "./app-window";
import { checkForUpdatesManually } from "./updater";

function sendMenuCommand(channel: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel);
  }
}

/** Standard app menu — Murmur's window is frameless, so this is the only
 *  place Cmd+Q, Cmd+H, copy/paste, etc. come from. */
export function installApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const dictationLabel = () =>
    getDictationStatus() === "listening" ? "Stop Dictation" : "Start Dictation";

  const appMenu: MenuItemConstructorOptions = {
    role: "appMenu",
    submenu: [
      { role: "about" },
      { label: "Check for Updates…", click: () => checkForUpdatesManually() },
      {
        label: "Settings…",
        accelerator: "CommandOrControl+,",
        click: () => openAppWindow("/settings"),
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    {
      role: "fileMenu",
      submenu: [
        {
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: () => openAppWindow("/history"),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Dictation",
      submenu: [
        {
          label: dictationLabel(),
          accelerator: "CommandOrControl+Shift+D",
          enabled: getDictationStatus() !== "processing" && getDictationStatus() !== "inserting",
          click: () => void toggleDictation(),
        },
        { type: "separator" },
        {
          label: "Show History",
          accelerator: "CommandOrControl+Y",
          click: () => openAppWindow("/history"),
        },
      ],
    },
    {
      role: "viewMenu",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CommandOrControl+B",
          click: () => sendMenuCommand(IpcChannels.MENU_TOGGLE_SIDEBAR),
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Keyboard Shortcuts",
          accelerator: "CommandOrControl+/",
          click: () => sendMenuCommand(IpcChannels.MENU_SHOW_KEYBOARD_SHORTCUTS),
        },
        {
          label: "Murmur API Docs",
          click: () => void shell.openExternal("http://127.0.0.1:47850/docs"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
