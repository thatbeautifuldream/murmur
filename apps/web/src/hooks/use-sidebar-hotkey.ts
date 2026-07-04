import { useHotkey } from "@tanstack/react-hotkeys";
import { useUIStore } from "@/stores/ui-store";

/** Registers the Mod+B sidebar toggle. Call exactly once (in the app shell) —
 *  `useSidebarChrome` is called per-page, so the hotkey side effect is kept
 *  separate to avoid double-registering (and double-toggling) it. */
export function useSidebarHotkey(): void {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  useHotkey("Mod+B", () => toggleSidebar(), {
    ignoreInputs: false,
    meta: { name: "Toggle sidebar", description: "Show or hide the sidebar" },
  });
}
