import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TSettingsPage = "profile" | "general" | "about" | null;

/** Docked-sidebar width bounds. Matches the HIG split-view notion of a
 *  resizable leading column that never collapses to an unusable width. */
export const SIDEBAR_MIN_WIDTH = 208;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 256;

const clampSidebarWidth = (w: number) =>
  Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w)));

type TUIState = {
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  settingsPage: TSettingsPage;
  openSettings: (page?: Exclude<TSettingsPage, null>) => void;
  closeSettings: () => void;
};

type TPersistedUIState = {
  sidebarVisible: boolean;
  sidebarWidth: number;
};

export const useUIStore = create<TUIState>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarWidth(width) }),
      settingsPage: null,
      openSettings: (page = "profile") => set({ settingsPage: page }),
      closeSettings: () => set({ settingsPage: null }),
    }),
    {
      name: "app-ui",
      partialize: (s): TPersistedUIState => ({
        sidebarVisible: s.sidebarVisible,
        sidebarWidth: s.sidebarWidth,
      }),
    },
  ),
);
