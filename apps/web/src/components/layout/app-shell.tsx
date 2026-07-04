import { Outlet, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/app-sidebar";

/** Murmur runs two kinds of windows off the same renderer bundle: the
 *  frameless, transparent, bottom-anchored dictation pill (see
 *  apps/desktop/src/main.ts) at the root route, and a regular windowed app
 *  — sidebar + Settings/History/About — everywhere else (see
 *  apps/desktop/src/app-window.ts). */
export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === "/") {
    return (
      <div className="isolate flex h-dvh flex-col items-center justify-end bg-transparent p-6">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="isolate flex h-dvh bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
