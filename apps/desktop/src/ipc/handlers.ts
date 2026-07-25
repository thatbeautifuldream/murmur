import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from "electron";
import { IpcChannels, type ActivationShortcut, type ModesConfig, type Theme } from "@app/contracts";
import { startDictation, stopDictation } from "../dictation";
import { changeActivationShortcut } from "../activation-shortcut";
import { getActivationShortcut, getModes, setModes } from "../settings-store";
import { getCachedNotchGeometry } from "../notch-geometry-manager";
import {
  clearTranscriptHistory,
  deleteTranscriptHistoryEntry,
  listTranscriptHistory,
  readTranscriptAudio,
  restoreTranscriptHistoryEntries,
} from "../transcript-history";

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.DICTATION_START, (_event, locale?: string) => startDictation(locale));
  ipcMain.handle(IpcChannels.DICTATION_STOP, () => stopDictation());
  ipcMain.handle(IpcChannels.TRANSCRIPT_HISTORY_LIST, (_event, limit?: number) =>
    listTranscriptHistory(limit),
  );
  ipcMain.handle(IpcChannels.TRANSCRIPT_HISTORY_DELETE, (_event, id: string) => {
    return deleteTranscriptHistoryEntry(id);
  });
  ipcMain.handle(IpcChannels.TRANSCRIPT_HISTORY_CLEAR, () => {
    return clearTranscriptHistory();
  });
  ipcMain.handle(IpcChannels.TRANSCRIPT_HISTORY_RESTORE, (_event, entries) => {
    restoreTranscriptHistoryEntries(entries);
  });
  ipcMain.handle(IpcChannels.TRANSCRIPT_HISTORY_READ_AUDIO, (_event, id: string) =>
    readTranscriptAudio(id),
  );

  ipcMain.handle(
    IpcChannels.WINDOW_GET_FULLSCREEN,
    (event) => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false,
  );

  // The pill window ignores the mouse while idle (so clicks pass through); the
  // renderer flips this on/off as the cursor enters/leaves the pill so it stays
  // clickable without capturing the empty canvas around it.
  ipcMain.on(IpcChannels.WINDOW_SET_PILL_INTERACTIVE, (event, interactive: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setIgnoreMouseEvents(!interactive, {
      forward: true,
    });
  });

  ipcMain.handle(IpcChannels.WINDOW_GET_NOTCH_MODE, () => {
    const geometry = getCachedNotchGeometry();
    return {
      hasNotch: geometry?.hasNotch ?? false,
      width: geometry?.hasNotch ? geometry.notchWidth : 0,
      height: geometry?.hasNotch ? geometry.notchHeight : 0,
    };
  });

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

  ipcMain.handle(IpcChannels.SETTINGS_GET_ACTIVATION_SHORTCUT, () => getActivationShortcut());

  ipcMain.handle(
    IpcChannels.SETTINGS_SET_ACTIVATION_SHORTCUT,
    (_event, shortcut: ActivationShortcut) => changeActivationShortcut(shortcut),
  );

  ipcMain.handle(IpcChannels.SETTINGS_GET_MODES, () => getModes());

  ipcMain.handle(IpcChannels.SETTINGS_SET_MODES, (_event, config: ModesConfig) => setModes(config));

  nativeTheme.on("updated", () => {
    const theme: Theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IpcChannels.ON_THEME_CHANGED, theme);
    }
  });
}
