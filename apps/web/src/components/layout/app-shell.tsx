import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getDesktopBridge } from "@/desktopBridge";
import { useSidebarHotkey } from "@/hooks/use-sidebar-hotkey";
import { useUIStore } from "@/stores/ui-store";

/** Murmur runs two kinds of windows off the same renderer bundle: the
 *  frameless, transparent, bottom-anchored dictation pill (see
 *  apps/desktop/src/main.ts) at the root route, and a regular windowed app
 *  — sidebar + Settings/History/About — everywhere else (see
 *  apps/desktop/src/app-window.ts). */
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
      <div className="isolate flex h-dvh flex-col items-center justify-end bg-transparent p-6">
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
