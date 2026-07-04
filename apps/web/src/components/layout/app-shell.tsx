import { Outlet } from "@tanstack/react-router";

/** Murmur's shell — the window is a frameless, transparent, bottom-anchored
 *  strip (see apps/desktop/src/main.ts); this just bottom-aligns the pill
 *  inside it and lets it drive its own size. */
export function AppShell() {
  return (
    <div className="isolate flex h-dvh flex-col items-center justify-end bg-transparent p-6">
      <Outlet />
    </div>
  );
}
