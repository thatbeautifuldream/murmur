import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getDesktopBridge } from "@/desktopBridge";
import { useSidebarHotkey } from "@/hooks/use-sidebar-hotkey";
import { useUIStore } from "@/stores/ui-store";

/** Murmur runs two kinds of windows off the same renderer bundle: the
 *  frameless, transparent, notch-anchored dictation pill (see
 *  apps/desktop/src/main.ts) at the root route, and a regular windowed app
 *  — sidebar + Settings/History/About — everywhere else (see
 *  apps/desktop/src/app-window.ts). No padding here: on notched hardware the
 *  main process sizes this window to the notch's exact pixel dimensions when
 *  idle, so the pill must be able to fill it edge-to-edge with zero gap.
 *  Shadow bleed room while expanded instead comes from the window itself
 *  being sized well beyond the visible pill (see PILL_WIDTH/PILL_AREA_HEIGHT
 *  in main.ts), not from container padding. */
export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  // Registered once here rather than per-page, since useSidebarChrome() (used
  // by every page for its own Titlebar) is called many times over.
  useSidebarHotkey();

  useEffect(() => {
    return getDesktopBridge()?.onMenuToggleSidebar(toggleSidebar);
  }, [toggleSidebar]);

  if (pathname === "/") {
    return (
      <div className="isolate flex h-dvh flex-col items-center justify-start bg-transparent">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="@container/shell isolate flex h-dvh bg-background text-foreground">
      <AppSidebar />
      <Outlet />
    </div>
  );
}
