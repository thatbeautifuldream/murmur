import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SidebarToggleButton } from "@/components/layout/app-sidebar";
import { TRAFFIC_LIGHT_GUTTER, useSidebarTransition } from "@/components/layout/sidebar-motion";

type TTitlebarProps = {
  /** Sidebar is docked next to the content pane (vs. overlay/closed). */
  sidebarDocked: boolean;
  /** Reserve the traffic-light gutter in the header (only when no docked
   *  sidebar card is hosting the lights). */
  showTrafficGutter: boolean;
  onToggleSidebar: () => void;
  /** Trailing header content (e.g. the page title + actions). */
  children?: React.ReactNode;
};

/**
 * The window titlebar row shared by every page: a draggable
 * `-webkit-app-region` strip. The lights' gutter and the sidebar toggle glide
 * in lockstep with the sidebar (same curve), then any view-specific content
 * follows.
 */
export function Titlebar({
  sidebarDocked,
  showTrafficGutter,
  onToggleSidebar,
  children,
}: TTitlebarProps): React.ReactElement {
  const transition = useSidebarTransition(sidebarDocked);

  return (
    // h-12 + pt-2 vertically centers the row on the native traffic lights so
    // the lights, toggle, and title share one line.
    <header
      className="flex h-12 shrink-0 items-center gap-1 px-2 pt-2"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Traffic-lights gutter + toggle slot — both collapse to width 0 when
          the sidebar is docked (the sidebar card owns the lights + toggle in
          that state). Width animates in lockstep with the sidebar so
          trailing content glides into place instead of snapping. */}
      <motion.div
        initial={false}
        animate={{ width: showTrafficGutter ? TRAFFIC_LIGHT_GUTTER : 0 }}
        transition={transition}
        className="shrink-0"
        aria-hidden="true"
      />
      <motion.div
        initial={false}
        animate={{ width: sidebarDocked ? 0 : 28, opacity: sidebarDocked ? 0 : 1 }}
        transition={transition}
        // pointer-events-none in the collapsed state so the (clipped,
        // invisible) toggle button can't intercept clicks meant for the
        // content beside it.
        className={cn("shrink-0 overflow-hidden", sidebarDocked && "pointer-events-none")}
        aria-hidden={sidebarDocked || undefined}
      >
        <SidebarToggleButton onToggle={onToggleSidebar} />
      </motion.div>
      {children}
    </header>
  );
}
