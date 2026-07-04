import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 208;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_DEFAULT_WIDTH = 224;

type TUIStore = {
  sidebarVisible: boolean;
  sidebarWidth: number;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
};

export const useUIStore = create<TUIStore>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)),
        }),
    }),
    {
      name: "murmur-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sidebarVisible: s.sidebarVisible, sidebarWidth: s.sidebarWidth }),
    },
  ),
);
