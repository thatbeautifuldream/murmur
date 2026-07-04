import { isDesktop } from "@/desktopBridge";
import { useFullScreen } from "./use-full-screen";

/**
 * Resolves the macOS traffic-light state for the shell:
 * - `hasTrafficLights` — the native controls exist (running inside Electron
 *   and not full screen), so sidebar cards reserve their left gutter for
 *   them. A plain browser tab (the web fallback, no `window.desktopBridge`)
 *   has no native window chrome at all — same as full screen, no gutter.
 * - `showTrafficGutter` — the main header reserves the gutter, which it only
 *   does when no docked sidebar card is hosting the lights.
 */
export function useTrafficLights(sidebarDocked: boolean) {
  const isFullScreen = useFullScreen();
  const hasTrafficLights = isDesktop && !isFullScreen;
  return { hasTrafficLights, showTrafficGutter: hasTrafficLights && !sidebarDocked };
}
