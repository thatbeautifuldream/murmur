import { useUIStore } from "@/stores/ui-store";
import { useSurfaceLayout } from "./use-surface-layout";
import { useTrafficLights } from "./use-traffic-lights";

/** Sidebar docked/overlay state and traffic-light gutters. Pure derived state
 *  (no side effects), so every page can call this freely — the Mod+B hotkey
 *  itself is registered once via `useSidebarHotkey` in the app shell. */
export function useSidebarChrome() {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const setSidebarVisible = useUIStore((s) => s.setSidebarVisible);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { sidebarAsOverlay } = useSurfaceLayout();
  const sidebarDocked = sidebarVisible && !sidebarAsOverlay;
  const { hasTrafficLights, showTrafficGutter } = useTrafficLights(sidebarDocked);

  return {
    sidebarVisible,
    setSidebarVisible,
    toggleSidebar,
    sidebarAsOverlay,
    sidebarDocked,
    hasTrafficLights,
    showTrafficGutter,
  };
}

export type TSidebarChrome = ReturnType<typeof useSidebarChrome>;
