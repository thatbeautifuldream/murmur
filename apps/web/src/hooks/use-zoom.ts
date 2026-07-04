import { useEffect, useState } from "react";
import { getDesktopBridge } from "@/desktopBridge";

/**
 * Tracks the renderer's zoom factor (Cmd +/-). Used to counter-scale the
 * titlebar so it renders at native size and stays aligned with the constant
 * macOS traffic lights at any zoom. Returns 1 in the browser / non-desktop.
 */
export function useZoom(): number {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const bridge = getDesktopBridge();
    // Guard against an older preload that predates the zoom channels.
    if (!bridge || typeof bridge.getZoomFactor !== "function") return;
    let active = true;
    void bridge.getZoomFactor().then((factor) => {
      if (active && factor > 0) setZoom(factor);
    });
    const unsubscribe = bridge.onZoomChanged((factor) => {
      if (factor > 0) setZoom(factor);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return zoom;
}
