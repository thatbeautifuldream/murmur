import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useUIStore, SIDEBAR_DEFAULT_WIDTH } from "@/stores/ui-store";
import { useZoom } from "@/hooks/use-zoom";
import {
  SidebarContentReveal,
  useSidebarTransition,
  useSidebarTransitions,
} from "./sidebar-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarToggleButton } from "./sidebar-toggle-button";

// Active selection per uidotsh nav rules: no primary-color background and no
// font-weight shift between states — only a soft muted background. HIG: keep
// the active selection persistently highlighted so it maps back to the detail
// pane.
const sidebarItemClass =
  "group/item relative flex flex-row items-center gap-2 rounded-md px-2 py-1.5 text-start text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground/80 hover:transition-none data-[active=true]:bg-accent data-[active=true]:text-foreground data-[active=true]:hover:transition-colors";

/** Template navigation. Each item maps to a route. */
export type TNavItem = {
  to: string;
  label: string;
};

/** A labelled group of nav items. HIG: organize a sidebar into named sections. */
export type TNavSection = {
  label?: string;
  items: TNavItem[];
};

export const NAV_SECTIONS: TNavSection[] = [
  {
    items: [
      { to: "/", label: "Overview" },
      { to: "/getting-started", label: "Getting started" },
    ],
  },
];

/** Flattened items — used by the shell to resolve the current page title. */
export const NAV_ITEMS: TNavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

type TSidebarContentProps = {
  onToggleSidebar: () => void;
  onNavigate?: () => void;
  /** Overlay variants hide the in-sidebar toggle; the backdrop dismisses. */
  showToggle?: boolean;
  /** In full screen macOS removes the traffic lights — collapse their gutter. */
  isFullScreen?: boolean;
};

type TSidebarProps = TSidebarContentProps & {
  visible: boolean;
  onClose: () => void;
};

function isItemActive(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

/** The floating sidebar surface — a rounded, elevated card on the canvas.
 *  Shared by the docked and overlay presentations so they read identically. */
function SidebarCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-sidebar ring-1 ring-neutral-950/8 dark:ring-white/10",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarContent({
  onToggleSidebar,
  onNavigate,
  showToggle = true,
  isFullScreen = false,
}: TSidebarContentProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appZoom = useZoom();

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Top row: traffic-lights gutter on the left, sidebar toggle on the right.
          The gutter collapses in full screen, where the lights are gone.
          Counter-scaled so the row stays native-sized and aligned with the
          constant traffic lights regardless of zoom. */}
      <div
        className="flex h-10 shrink-0 items-center gap-2 px-2"
        style={
          { zoom: 1 / appZoom, WebkitAppRegion: "drag" } as React.CSSProperties
        }
      >
        <div
          className={cn("shrink-0 transition-[width]", isFullScreen ? "w-0" : "w-16")}
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          Desktop
        </p>
        {showToggle && <SidebarToggleButton onToggle={onToggleSidebar} />}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-4 px-2 pb-3">
          {NAV_SECTIONS.map((section, i) => (
            <nav key={section.label ?? i} className="flex min-w-0 flex-col gap-0.5">
              {section.label && (
                <p className="truncate px-2 pb-1 text-[0.6875rem] font-medium tracking-wide text-muted-foreground/70 uppercase">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const isActive = isItemActive(item.to, pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    data-active={isActive}
                    onClick={onNavigate}
                    className={cn(sidebarItemClass, "w-full text-[0.8125rem]")}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Overlay sidebar — a floating card over the canvas for narrow viewports,
 *  dismissed by tapping the backdrop. */
export function AppSidebarOverlay({ visible, onClose, ...content }: TSidebarProps) {
  const { open, close } = useSidebarTransitions();
  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: open }}
            exit={{ opacity: 0, transition: close }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55"
            aria-hidden="true"
          />
          {/* -110% keeps the easing's tail fully off-screen as it settles. */}
          <motion.aside
            key="aside"
            initial={{ x: "-110%" }}
            animate={{ x: 0, transition: open }}
            exit={{ x: "-110%", transition: close }}
            className="fixed top-2 bottom-2 left-2 z-50 w-64"
          >
            <SidebarContentReveal>
              <SidebarCard className="shadow-2xl">
                <SidebarContent {...content} showToggle={false} />
              </SidebarCard>
            </SidebarContentReveal>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

type TAppSidebarDockedProps = TSidebarContentProps & {
  docked: boolean;
};

// The floating card is inset from the column edges; `SIDEBAR_INSET` is the
// margin (top/left/bottom) and the gap to the canvas on the right.
const SIDEBAR_INSET = 8;

/** Docked sidebar — a floating card in a width-animated column beside <main>,
 *  with a draggable trailing edge to resize (HIG: split-view columns resize). */
export function AppSidebarDocked({ docked, ...content }: TAppSidebarDockedProps) {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const toggleTransition = useSidebarTransition(docked);
  const appZoom = useZoom();

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    document.body.style.cursor = "col-resize";
    // The card's right edge sits one inset in from the column edge; offset the
    // pointer by that inset so the column width stays anchored to the cursor.
    const onMove = (ev: PointerEvent) => setSidebarWidth(ev.clientX + SIDEBAR_INSET);
    const onUp = () => {
      setResizing(false);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: docked ? sidebarWidth : 0 }}
      transition={resizing ? { duration: 0 } : toggleTransition}
      className="relative h-full shrink-0 overflow-hidden"
    >
      <SidebarContentReveal docked={docked} width={sidebarWidth}>
        {/* Float margins around the card. The top inset is kept native (8px at
            any zoom) so the card's header line stays aligned with the constant
            traffic lights; the other insets scale normally. */}
        <div className="h-full px-2 pb-2" style={{ paddingTop: 8 / appZoom }}>
          <SidebarCard className="shadow-sm">
            <SidebarContent {...content} />
          </SidebarCard>
        </div>
      </SidebarContentReveal>

      {/* Resize handle — lives in the gap between card and canvas. Drag to size,
          double-click to reset. Hidden while the sidebar is collapsed. */}
      {docked && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={startResize}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          className="group/resize absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize"
        >
          <span
            className={cn(
              "absolute inset-y-2 right-1 w-px rounded-full bg-transparent transition-colors group-hover/resize:bg-primary/50",
              resizing && "bg-primary/50",
            )}
            aria-hidden="true"
          />
        </div>
      )}
    </motion.aside>
  );
}
