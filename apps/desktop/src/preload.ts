import { contextBridge, ipcRenderer } from "electron";
import {
  IpcChannels,
  type DesktopBridge,
  type DictationStatus,
  type Platform,
  type Theme,
} from "@app/contracts";

const platform = process.platform as Platform;

const bridge: DesktopBridge = {
  platform,
  getAppVersion: () => ipcRenderer.invoke(IpcChannels.GET_APP_VERSION),
  pickFolder: () => ipcRenderer.invoke(IpcChannels.PICK_FOLDER),
  openExternal: (url) => ipcRenderer.invoke(IpcChannels.OPEN_EXTERNAL, url),
  setTheme: (theme) => ipcRenderer.invoke(IpcChannels.SET_THEME, theme),
  onThemeChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, theme: Theme) => listener(theme);
    ipcRenderer.on(IpcChannels.ON_THEME_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_THEME_CHANGED, wrapped);
  },
  startDictation: (locale) => ipcRenderer.invoke(IpcChannels.DICTATION_START, locale),
  stopDictation: () => ipcRenderer.invoke(IpcChannels.DICTATION_STOP),
  listTranscriptHistory: (limit) =>
    ipcRenderer.invoke(IpcChannels.TRANSCRIPT_HISTORY_LIST, limit),
  deleteTranscriptHistoryEntry: (id) =>
    ipcRenderer.invoke(IpcChannels.TRANSCRIPT_HISTORY_DELETE, id),
  clearTranscriptHistory: () => ipcRenderer.invoke(IpcChannels.TRANSCRIPT_HISTORY_CLEAR),
  readTranscriptAudio: (id) =>
    ipcRenderer.invoke(IpcChannels.TRANSCRIPT_HISTORY_READ_AUDIO, id),
  onDictationStatusChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: DictationStatus) =>
      listener(status);
    ipcRenderer.on(IpcChannels.ON_DICTATION_STATUS_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_DICTATION_STATUS_CHANGED, wrapped);
  },
  onDictationTranscript: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, text: string) => listener(text);
    ipcRenderer.on(IpcChannels.ON_DICTATION_TRANSCRIPT, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_DICTATION_TRANSCRIPT, wrapped);
  },
  onTranscriptHistoryChanged: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on(IpcChannels.ON_TRANSCRIPT_HISTORY_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_TRANSCRIPT_HISTORY_CHANGED, wrapped);
  },
};

contextBridge.exposeInMainWorld("desktopBridge", bridge);
