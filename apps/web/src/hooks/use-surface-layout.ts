import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useFilePanelStore } from "@/stores/file-panel-store";

// Single source of truth for layout sizing constraints. The sidebar's docked
// width is user-resizable and lives in the UI store, so it isn't listed here.
const LAYOUT = {
  chat: { minWidth: 480, minWidthWithPanel: 320 },
  panel: { min: 320, maxRatio: 0.6, gutter: 16 },
  breakpoints: { compact: 768 },
} as const;

function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${LAYOUT.breakpoints.compact - 1}px)`);
    const onBreakpoint = () => setW(window.innerWidth);
    mql.addEventListener("change", onBreakpoint);

    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(window.innerWidth));
    };
    window.addEventListener("resize", onResize);

    return () => {
      mql.removeEventListener("change", onBreakpoint);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);
  return w;
}

/**
 * Centralizes the overlay/dock decision for the sidebar and file panel so
 * their coupling is resolved in one place. Returns all constraints the
 * FilePanel needs as props — no direct constant imports required.
 */
export function useSurfaceLayout() {
  const windowWidth = useWindowWidth();
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const filePanelVisible = useFilePanelStore((s) => s.file !== null);

  const isCompact = windowWidth < LAYOUT.breakpoints.compact;

  const chatMin = filePanelVisible ? LAYOUT.chat.minWidthWithPanel : LAYOUT.chat.minWidth;

  const bothCanDock =
    windowWidth >= sidebarWidth + chatMin + LAYOUT.panel.min + LAYOUT.panel.gutter;
  const filePanelCanDock = windowWidth >= chatMin + LAYOUT.panel.min + LAYOUT.panel.gutter;

  const sidebarAsOverlay = isCompact || (sidebarVisible && filePanelVisible && !bothCanDock);
  const filePanelAsOverlay = isCompact || !filePanelCanDock;

  const sidebarDocked = sidebarVisible && !sidebarAsOverlay;
  const available =
    windowWidth -
    (sidebarDocked ? sidebarWidth : 0) -
    LAYOUT.chat.minWidthWithPanel -
    LAYOUT.panel.gutter;
  const filePanelMaxWidth = Math.max(
    LAYOUT.panel.min,
    Math.min(Math.floor(windowWidth * LAYOUT.panel.maxRatio), available),
  );

  return {
    isCompact,
    sidebarAsOverlay,
    filePanelAsOverlay,
    filePanelMaxWidth,
    filePanelMinWidth: LAYOUT.panel.min,
    filePanelGutter: LAYOUT.panel.gutter,
  };
}
