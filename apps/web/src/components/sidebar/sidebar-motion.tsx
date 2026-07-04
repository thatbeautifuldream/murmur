import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// Shared sidebar open/close choreography. Lives in its own module so the
// conversation sidebar and its variants share one physical feel.

// Directional drawer easing, deliberately short. The docked panel animates
// `width` (layout-bound, reflows <main> each frame) so the win is a tight
// window. Open = arriving (easeOutQuint), close = leaving (easeInQuad, faster).
export const SIDEBAR_OPEN_TRANSITION = {
  duration: 0.22,
  ease: [0.23, 1, 0.32, 1] as const,
};
export const SIDEBAR_CLOSE_TRANSITION = {
  duration: 0.18,
  ease: [0.55, 0.085, 0.68, 0.53] as const,
};

/** Open + close transitions as a pair; both collapse to an instant cut under
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

/** How far content drifts in while revealing — a settle, not a slide. */
const SIDEBAR_CONTENT_OFFSET = -8;

/**
 * Reveal wrapper: content fades up and settles a few px into place as the panel
 * opens, drifts back out as it closes. Pure opacity + transform (GPU-composited).
 * Docked panels toggle in place (pass `docked`); overlay panels mount/unmount
 * inside AnimatePresence (omit `docked` so the reveal rides enter/exit).
 */
export function SidebarContentReveal({
  docked,
  width = 256,
  children,
}: {
  docked?: boolean;
  /** Fixed inner width so content doesn't reflow while the panel animates. */
  width?: number;
  children: ReactNode;
}) {
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
