import { contextBridge, ipcRenderer } from "electron";
import {
  IpcChannels,
  type AgentStatus,
  type AgentToolApprovalRequest,
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
  restoreTranscriptHistoryEntries: (entries) =>
    ipcRenderer.invoke(IpcChannels.TRANSCRIPT_HISTORY_RESTORE, entries),
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
  onDictationPartialTranscript: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, text: string) => listener(text);
    ipcRenderer.on(IpcChannels.ON_DICTATION_PARTIAL_TRANSCRIPT, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_DICTATION_PARTIAL_TRANSCRIPT, wrapped);
  },
  onTranscriptHistoryChanged: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on(IpcChannels.ON_TRANSCRIPT_HISTORY_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_TRANSCRIPT_HISTORY_CHANGED, wrapped);
  },
  setPillInteractive: (interactive) =>
    ipcRenderer.send(IpcChannels.WINDOW_SET_PILL_INTERACTIVE, interactive),
  getNotchMode: () => ipcRenderer.invoke(IpcChannels.WINDOW_GET_NOTCH_MODE),
  isFullScreen: () => ipcRenderer.invoke(IpcChannels.WINDOW_GET_FULLSCREEN),
  onFullScreenChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, isFullScreen: boolean) =>
      listener(isFullScreen);
    ipcRenderer.on(IpcChannels.ON_WINDOW_FULLSCREEN_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_WINDOW_FULLSCREEN_CHANGED, wrapped);
  },
  onMenuToggleSidebar: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on(IpcChannels.MENU_TOGGLE_SIDEBAR, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.MENU_TOGGLE_SIDEBAR, wrapped);
  },
  onMenuShowKeyboardShortcuts: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on(IpcChannels.MENU_SHOW_KEYBOARD_SHORTCUTS, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.MENU_SHOW_KEYBOARD_SHORTCUTS, wrapped);
  },
  getActivationShortcut: () => ipcRenderer.invoke(IpcChannels.SETTINGS_GET_ACTIVATION_SHORTCUT),
  setActivationShortcut: (shortcut) =>
    ipcRenderer.invoke(IpcChannels.SETTINGS_SET_ACTIVATION_SHORTCUT, shortcut),
  getModes: () => ipcRenderer.invoke(IpcChannels.SETTINGS_GET_MODES),
  setModes: (config) => ipcRenderer.invoke(IpcChannels.SETTINGS_SET_MODES, config),
  onAgentStatusChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: AgentStatus) => listener(status);
    ipcRenderer.on(IpcChannels.ON_AGENT_STATUS_CHANGED, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_AGENT_STATUS_CHANGED, wrapped);
  },
  onAgentTextDelta: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, delta: string) => listener(delta);
    ipcRenderer.on(IpcChannels.ON_AGENT_TEXT_DELTA, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_AGENT_TEXT_DELTA, wrapped);
  },
  onAgentMessageComplete: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, text: string) => listener(text);
    ipcRenderer.on(IpcChannels.ON_AGENT_MESSAGE_COMPLETE, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_AGENT_MESSAGE_COMPLETE, wrapped);
  },
  onAgentToolApprovalRequest: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: AgentToolApprovalRequest) =>
      listener(request);
    ipcRenderer.on(IpcChannels.ON_AGENT_TOOL_APPROVAL_REQUEST, wrapped);
    return () => ipcRenderer.removeListener(IpcChannels.ON_AGENT_TOOL_APPROVAL_REQUEST, wrapped);
  },
  respondToolApproval: (id, approved) =>
    ipcRenderer.invoke(IpcChannels.AGENT_RESPOND_TOOL_APPROVAL, id, approved),
  newAgentConversation: () => ipcRenderer.invoke(IpcChannels.AGENT_NEW_CONVERSATION),
  getAgentConfig: () => ipcRenderer.invoke(IpcChannels.AGENT_GET_CONFIG),
  setAgentConfig: (config) => ipcRenderer.invoke(IpcChannels.AGENT_SET_CONFIG, config),
  getAgentShortcut: () => ipcRenderer.invoke(IpcChannels.AGENT_GET_SHORTCUT),
  setAgentShortcut: (shortcut) => ipcRenderer.invoke(IpcChannels.AGENT_SET_SHORTCUT, shortcut),
};

contextBridge.exposeInMainWorld("desktopBridge", bridge);
