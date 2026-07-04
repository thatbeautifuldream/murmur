import { useEffect, useState } from "react";

// Below this the window is too narrow to dock the sidebar without squeezing
// the content pane — matches the app window's own minWidth (see
// apps/desktop/src/app-window.ts).
const COMPACT_BREAKPOINT = 640;

function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return width;
}

/** Decides whether the sidebar docks in-flow or floats as an overlay —
 *  centralized so the sidebar shell and its toggle stay in sync. */
export function useSurfaceLayout() {
  const windowWidth = useWindowWidth();
  const isCompact = windowWidth < COMPACT_BREAKPOINT;

  return { isCompact, sidebarAsOverlay: isCompact };
}
