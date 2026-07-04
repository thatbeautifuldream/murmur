import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { IpcChannels, type Theme } from "@app/contracts";
import { startDictation, stopDictation } from "../dictation";

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.DICTATION_START, (_event, locale?: string) => startDictation(locale));
  ipcMain.handle(IpcChannels.DICTATION_STOP, () => stopDictation());

  ipcMain.handle(IpcChannels.GET_APP_VERSION, () => app.getVersion());

  ipcMain.handle(IpcChannels.PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.OPEN_EXTERNAL, async (_event, target: string) => {
    if (typeof target !== "string") return;
    if (!/^https?:\/\//i.test(target)) return;
    await shell.openExternal(target);
  });

  ipcMain.handle(IpcChannels.SET_THEME, (_event, theme: Theme) => {
    nativeTheme.themeSource = theme;
  });

  nativeTheme.on("updated", () => {
    const theme: Theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.ON_THEME_CHANGED, theme);
    }
  });
}
