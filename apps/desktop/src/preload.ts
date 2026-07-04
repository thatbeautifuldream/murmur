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
  isFullScreen: () => ipcRenderer.invoke(IpcChannels.GET_FULLSCREEN),
  onFullScreenChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: boolean) => listener(value);
    ipcRenderer.on(IpcChannels.ON_FULLSCREEN_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_FULLSCREEN_CHANGED, wrapped);
  },
  getZoomFactor: () => ipcRenderer.invoke(IpcChannels.GET_ZOOM_FACTOR),
  onZoomChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, factor: number) => listener(factor);
    ipcRenderer.on(IpcChannels.ON_ZOOM_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_ZOOM_CHANGED, wrapped);
  },
  startDictation: (locale) => ipcRenderer.invoke(IpcChannels.DICTATION_START, locale),
  stopDictation: () => ipcRenderer.invoke(IpcChannels.DICTATION_STOP),
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
};

contextBridge.exposeInMainWorld("desktopBridge", bridge);
