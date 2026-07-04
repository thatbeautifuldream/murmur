import { Outlet, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useSurfaceLayout } from "@/hooks/use-surface-layout";
import { useFullScreen } from "@/hooks/use-full-screen";
import { useZoom } from "@/hooks/use-zoom";
import {
  AppSidebarDocked,
  AppSidebarOverlay,
  NAV_ITEMS,
} from "@/components/sidebar/app-sidebar";
import { SidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
import { useSidebarTransition } from "@/components/sidebar/sidebar-motion";

/** The full app shell — navigation sidebar (docked/overlay) + main pane.
 *  Routed content renders into <main> via <Outlet>. */
export function AppShell() {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const setSidebarVisible = useUIStore((s) => s.setSidebarVisible);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const { sidebarAsOverlay } = useSurfaceLayout();
  const isFullScreen = useFullScreen();
  const appZoom = useZoom();
  const sidebarDocked = sidebarVisible && !sidebarAsOverlay;
  const sidebarTransition = useSidebarTransition(sidebarDocked);

  // The traffic-light gutter in the main header is needed only when the lights
  // sit over the canvas — i.e. no docked card to host them and not full screen.
  const showTrafficGutter = !sidebarDocked && !isFullScreen;

  // Title for the current route — mirrors the sidebar nav, shown in the header.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pageTitle =
    NAV_ITEMS.find((item) =>
      item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
    )?.label ?? "";

  useHotkey("Mod+B", () => toggleSidebar(), {
    ignoreInputs: false,
    meta: { name: "Toggle sidebar", description: "Show or hide the navigation sidebar" },
  });

  const closeOnNavigate = () => {
    if (sidebarAsOverlay) setSidebarVisible(false);
  };

  const content = {
    onToggleSidebar: toggleSidebar,
    onNavigate: closeOnNavigate,
    isFullScreen,
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {sidebarAsOverlay ? (
        <AppSidebarOverlay
          visible={sidebarVisible}
          onClose={() => setSidebarVisible(false)}
          {...content}
        />
      ) : (
        <AppSidebarDocked docked={sidebarDocked} {...content} />
      )}

      <main className="@container relative flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        {/* Counter-scale by the zoom factor so the titlebar renders at native
            size and its line always meets the constant traffic lights. The
            8px top padding centers the row on the lights (which sit 8px below
            the window top, matching the floating card's inset). */}
        <header
          className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 bg-transparent px-2 pt-2"
          style={
            { zoom: 1 / appZoom, WebkitAppRegion: "drag" } as React.CSSProperties
          }
        >
          {/* Traffic-lights gutter + toggle slot. The gutter collapses when the
              docked card hosts the lights, or in full screen where there are
              none; the toggle slot collapses whenever the sidebar is docked. */}
          <motion.div
            initial={false}
            animate={{ width: showTrafficGutter ? 72 : 0 }}
            transition={sidebarTransition}
            className="shrink-0"
            aria-hidden="true"
          />
          <motion.div
            initial={false}
            animate={{ width: sidebarDocked ? 0 : 28, opacity: sidebarDocked ? 0 : 1 }}
            transition={sidebarTransition}
            className={cn("shrink-0 overflow-hidden", sidebarDocked && "pointer-events-none")}
            aria-hidden={sidebarDocked || undefined}
          >
            <SidebarToggleButton onToggle={toggleSidebar} />
          </motion.div>
          <span className="truncate text-sm font-medium text-foreground">
            {pageTitle}
          </span>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
