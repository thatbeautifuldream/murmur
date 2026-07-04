import { Menu, type MenuItemConstructorOptions } from "electron";
import { checkForUpdatesManually } from "./updater";

/** Standard app menu — Murmur's window is frameless, so this is the only
 *  place Cmd+Q, Cmd+H, copy/paste, etc. come from. */
export function installApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const appMenu: MenuItemConstructorOptions = {
    role: "appMenu",
    submenu: [
      { role: "about" },
      { label: "Check for Updates…", click: () => checkForUpdatesManually() },
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
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
