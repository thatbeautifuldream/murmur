import { Menu, type MenuItemConstructorOptions } from "electron";

/** Standard app menu — Murmur's window is frameless, so this is the only
 *  place Cmd+Q, Cmd+H, copy/paste, etc. come from. */
export function installApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" } as MenuItemConstructorOptions] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
