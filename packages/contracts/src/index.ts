export const IpcChannels = {
  GET_APP_VERSION: "app:get-version",
  PICK_FOLDER: "dialog:pick-folder",
  OPEN_EXTERNAL: "shell:open-external",
  SET_THEME: "theme:set",
  ON_THEME_CHANGED: "theme:changed",
  GET_FULLSCREEN: "window:get-fullscreen",
  ON_FULLSCREEN_CHANGED: "window:fullscreen-changed",
  GET_ZOOM_FACTOR: "window:get-zoom",
  ON_ZOOM_CHANGED: "window:zoom-changed",
} as const;

export type Theme = "light" | "dark" | "system";
export type Platform = "darwin" | "win32" | "linux";

export interface DesktopBridge {
  readonly platform: Platform;
  getAppVersion(): Promise<string>;
  pickFolder(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  onThemeChanged(listener: (theme: Theme) => void): () => void;
  /** Current macOS full-screen state — used to hide the traffic-light gutter. */
  isFullScreen(): Promise<boolean>;
  onFullScreenChanged(listener: (isFullScreen: boolean) => void): () => void;
  /** Renderer zoom factor — used to keep the titlebar at native size so it
   *  stays aligned with the constant traffic lights. */
  getZoomFactor(): Promise<number>;
  onZoomChanged(listener: (factor: number) => void): () => void;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
