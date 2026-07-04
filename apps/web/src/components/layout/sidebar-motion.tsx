import React, { useCallback, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { SIDEBAR_DEFAULT_WIDTH, useUIStore } from "@/stores/ui-store";

/** Distance from the window edge to a docked card's left edge (matches the
 *  docked shell's `px-2` inset) — added back when translating a drag's clientX
 *  into a sidebar width so the card's right edge tracks the cursor. */
export const SIDEBAR_INSET = 8;

/** Width the header reserves for the native traffic lights when no docked
 *  sidebar card is hosting them (overlay/closed). */
export const TRAFFIC_LIGHT_GUTTER = 72;

/**
 * The colored resize indicator on the docked sidebar's draggable edge. A
 * hairline that sits *on* the card's border and lights it up — a vertical
 * gradient that's solid `primary` through the middle and fades to
 * transparent at the top and bottom so it dissolves into the card's rounded
 * corners. Hidden until the enclosing `group/resize` is hovered; callers
 * force it on (`opacity-100`) while a drag is in progress.
 */
export const RESIZE_EDGE_CLASS =
  "pointer-events-none absolute w-px bg-linear-to-b from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-150 group-hover/resize:opacity-100";

/** The floating sidebar surface — rounded, faintly ringed card that sidebar
 *  content sits inside. */
export function SidebarCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-xl squircle bg-sidebar ring-1 ring-neutral-950/8 dark:ring-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Directional drawer easing, kept deliberately short. The panel shell animates
// `width` (a push sidebar), which is layout-bound and reflows the content pane
// every frame — so the win is a tight window, not decoration. Opening, the
// panel is *arriving*: easeOutQuint enters fast then settles. Closing, it's
// *leaving*: easeInQuad accelerates it away and runs faster so the reflow is
// over before it can stutter.
export const SIDEBAR_OPEN_TRANSITION = { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const };
export const SIDEBAR_CLOSE_TRANSITION = {
  duration: 0.18,
  ease: [0.55, 0.085, 0.68, 0.53] as const,
};

/** Open + close transitions as a pair, both collapsed to an instant cut under
 *  reduced motion. */
export function useSidebarTransitions() {
  const reduced = useReducedMotion();
  if (reduced) return { open: { duration: 0 }, close: { duration: 0 } };
  return { open: SIDEBAR_OPEN_TRANSITION, close: SIDEBAR_CLOSE_TRANSITION };
}

/** Picks the open or close transition for the current toggle direction. */
export function useSidebarTransition(isOpen: boolean) {
  const { open, close } = useSidebarTransitions();
  return isOpen ? open : close;
}

/** How far the content drifts in from while revealing — small enough to read
 *  as a settle, not a slide. Paired with an opacity fade; both run purely on
 *  the compositor (transform + opacity), so the reveal adds no layout or
 *  paint cost. */
const SIDEBAR_CONTENT_OFFSET = -8;

/**
 * Reveal wrapper for sidebar content: it fades up and settles a few px into
 * place as the panel opens, and drifts back out as it closes.
 *
 * Docked panels toggle in place — pass `docked` and the reveal animates on
 * the prop. Overlay panels mount/unmount inside <AnimatePresence> — omit
 * `docked` so the reveal rides the enter/exit instead.
 */
export function SidebarContentReveal({
  docked,
  width = SIDEBAR_DEFAULT_WIDTH,
  children,
}: {
  docked?: boolean;
  /** Fixed inner width so content doesn't reflow while the shell animates its
   *  width. Docked panels pass the (resizable) sidebar width; overlay panels
   *  keep the default. */
  width?: number;
  children: React.ReactNode;
}): React.ReactElement {
  const { open, close } = useSidebarTransitions();

  if (docked === undefined) {
    return (
      <motion.div
        className="h-full"
        style={{ width }}
        initial={{ opacity: 0, x: SIDEBAR_CONTENT_OFFSET }}
        animate={{ opacity: 1, x: 0, transition: open }}
        exit={{ opacity: 0, x: SIDEBAR_CONTENT_OFFSET, transition: close }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className="h-full"
      style={{ width }}
      initial={false}
      animate={docked ? { opacity: 1, x: 0 } : { opacity: 0, x: SIDEBAR_CONTENT_OFFSET }}
      transition={docked ? open : close}
    >
      {children}
    </motion.div>
  );
}

/**
 * Drag-to-resize logic for the docked sidebar card. Returns the pointer-down
 * handler and a `resizing` flag (used to suppress the width animation mid-drag).
 * Width updates are coalesced to one per animation frame so a high-frequency
 * pointer device doesn't thrash the store + layout recompute.
 */
function useSidebarResize() {
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const [resizing, setResizing] = useState(false);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setResizing(true);
      document.body.style.cursor = "col-resize";

      let raf = 0;
      let latestX = 0;
      const flush = () => {
        raf = 0;
        setSidebarWidth(latestX + SIDEBAR_INSET);
      };
      const onMove = (ev: PointerEvent) => {
        latestX = ev.clientX;
        if (!raf) raf = requestAnimationFrame(flush);
      };
      const onUp = () => {
        setResizing(false);
        document.body.style.cursor = "";
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setSidebarWidth],
  );

  return { startResize, resizing };
}

/**
 * The docked sidebar shell: a floating card that animates width 0 ↔
 * sidebarWidth in-flow next to the content pane, with a native top inset
 * that aligns the card with the window's traffic lights and a draggable
 * edge to resize (double-click to reset).
 */
export function DockedSidebarShell({
  docked,
  children,
}: {
  docked: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const { startResize, resizing } = useSidebarResize();
  const toggleTransition = useSidebarTransition(docked);

  return (
    // initial={false} avoids a one-frame width flash when mounted collapsed:
    // Motion would otherwise paint at the inner child's size first.
    <motion.aside
      initial={false}
      animate={{ width: docked ? sidebarWidth : 0 }}
      transition={resizing ? { duration: 0 } : toggleTransition}
      className="relative h-full shrink-0 overflow-hidden"
    >
      <SidebarContentReveal docked={docked} width={sidebarWidth}>
        <div className="h-full px-2 pt-2 pb-2">
          <SidebarCard className="shadow-sm">{children}</SidebarCard>
        </div>
      </SidebarContentReveal>

      {/* Resize handle — lives in the gap at the card's right edge. */}
      {docked && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={startResize}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          className="group/resize absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize"
        >
          {/* Hairline sits on the card's right border (the gutter's inner
              edge = handle's left edge). `inset-y-2` matches the card's
              vertical inset so the gradient fades into its rounded corners. */}
          <span
            className={cn(RESIZE_EDGE_CLASS, "inset-y-2 left-0", resizing && "opacity-100")}
            aria-hidden="true"
          />
        </div>
      )}
    </motion.aside>
  );
}
