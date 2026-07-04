import { useEffect, useState } from "react";
import { getDesktopBridge } from "@/desktopBridge";

/**
 * Tracks the window's native macOS full-screen state. In full screen the OS
 * removes the traffic-light controls, so the shell can reclaim the gutter
 * reserved for them. Returns `false` if the bridge isn't available.
 */
export function useFullScreen(): boolean {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
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
