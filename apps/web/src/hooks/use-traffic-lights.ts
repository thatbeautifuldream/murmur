import { useFullScreen } from "./use-full-screen";

/**
 * Resolves the macOS traffic-light state for the shell:
 * - `hasTrafficLights` — the native controls exist (not full screen), so
 *   sidebar cards reserve their left gutter for them.
 * - `showTrafficGutter` — the main header reserves the gutter, which it only
 *   does when no docked sidebar card is hosting the lights.
 */
export function useTrafficLights(sidebarDocked: boolean) {
  const isFullScreen = useFullScreen();
  const hasTrafficLights = !isFullScreen;
  return { hasTrafficLights, showTrafficGutter: hasTrafficLights && !sidebarDocked };
}
