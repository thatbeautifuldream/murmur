import { useEffect, useState } from "react";
import { getDesktopBridge } from "@/desktopBridge";

/**
 * Tracks the window's macOS full-screen state. In full screen the OS removes
 * the traffic-light controls, so the shell can reclaim the gutter reserved for
 * them. Returns `false` in the browser / non-desktop context.
 */
export function useFullScreen(): boolean {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    // Guard against an older preload that predates the full-screen channels.
    if (!bridge || typeof bridge.isFullScreen !== "function") return;
    let active = true;
    void bridge.isFullScreen().then((value) => {
      if (active) setIsFullScreen(value);
    });
    const unsubscribe = bridge.onFullScreenChanged(setIsFullScreen);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return isFullScreen;
}
