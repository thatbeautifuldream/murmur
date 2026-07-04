import { Outlet } from "@tanstack/react-router";
import { useFullScreen } from "@/hooks/use-full-screen";
import { useZoom } from "@/hooks/use-zoom";

/** Murmur's shell — a single-view floating utility window. No sidebar, no
 *  nav: just a draggable titlebar gutter for the traffic lights and the
 *  routed content below. */
export function AppShell() {
  const isFullScreen = useFullScreen();
  const appZoom = useZoom();

  return (
    <div className="isolate flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Counter-scale by the zoom factor so the titlebar renders at native
          size and the traffic-light gutter stays the right width at any zoom. */}
      <header
        className="sticky top-0 z-10 flex h-10 shrink-0 items-center bg-transparent"
        style={
          { zoom: 1 / appZoom, WebkitAppRegion: "drag" } as React.CSSProperties
        }
      >
        <div className={isFullScreen ? "w-3" : "w-20"} aria-hidden="true" />
        <span className="text-sm font-medium text-foreground/80">Murmur</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
