import { AnimatePresence, motion } from "motion/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { HistoryIcon, InformationCircleIcon, Settings02Icon, SidebarLeft01Icon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useSidebarChrome } from "@/hooks/use-sidebar-chrome";
import {
  DockedSidebarShell,
  SidebarContentReveal,
  TRAFFIC_LIGHT_GUTTER,
  useSidebarTransitions,
} from "@/components/layout/sidebar-motion";

const NAV_ITEMS = [
  { to: "/settings", label: "Settings", icon: Settings02Icon },
  { to: "/modes", label: "Modes", icon: SlidersHorizontalIcon },
  { to: "/history", label: "History", icon: HistoryIcon },
  { to: "/about", label: "About", icon: InformationCircleIcon },
] as const;

const navItemClass =
  "group/sidebar-item relative flex flex-row items-center gap-2.5 rounded-lg squircle px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground";

/** Floats above both the sidebar card and the main content — shared with the
 *  header (Titlebar) so re-opening a hidden sidebar works from either. */
export function SidebarToggleButton({ onToggle }: { onToggle: () => void }) {
  return (
    <Button
      onClick={onToggle}
      variant="ghost"
      size="icon-xs"
      aria-label="Toggle sidebar"
      className="shrink-0 text-sidebar-foreground/60"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <HugeiconsIcon icon={SidebarLeft01Icon} />
    </Button>
  );
}

function SidebarContent({
  onToggleSidebar,
  showToggle = true,
  hasTrafficLights = false,
}: {
  onToggleSidebar: () => void;
  showToggle?: boolean;
  /** Reserve the left gutter for the native macOS traffic lights — false in
   *  full screen, where the OS hides the controls. */
  hasTrafficLights?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div
      className="flex h-full min-w-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Top row: traffic-lights gutter on the left, toggle on the right.
          Toggle is suppressed in the overlay variant — the backdrop click
          dismisses instead. */}
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <div
          className="shrink-0 transition-[width]"
          style={{ width: hasTrafficLights ? TRAFFIC_LIGHT_GUTTER : 0 }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1" />
        {showToggle && <SidebarToggleButton onToggle={onToggleSidebar} />}
      </div>

      <nav
        role="list"
        className="flex min-w-0 flex-1 flex-col gap-0.5 p-2"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <Link key={to} to={to} data-active={pathname === to} className={navItemClass}>
            <HugeiconsIcon icon={icon} className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Overlay sidebar — for narrow windows where docking would squeeze the content. */
function AppSidebarOverlay({
  visible,
  onClose,
  onToggleSidebar,
  hasTrafficLights,
}: {
  visible: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  hasTrafficLights: boolean;
}) {
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
            className="fixed inset-0 z-60 bg-black/55"
            aria-hidden="true"
          />
          {/* -110% keeps the easing's tail fully off-screen as it settles. */}
          <motion.aside
            key="aside"
            initial={{ x: "-110%" }}
            animate={{ x: 0, transition: open }}
            exit={{ x: "-110%", transition: close }}
            className="fixed top-2 bottom-2 left-2 z-70 w-56 overflow-hidden rounded-xl squircle bg-sidebar shadow-2xl ring-1 ring-neutral-950/8 dark:ring-white/8"
          >
            <SidebarContentReveal>
              <SidebarContent
                onToggleSidebar={onToggleSidebar}
                showToggle={false}
                hasTrafficLights={hasTrafficLights}
              />
            </SidebarContentReveal>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Docked sidebar — the nav content inside the shared floating-card shell. */
function AppSidebarDocked({
  docked,
  onToggleSidebar,
  hasTrafficLights,
}: {
  docked: boolean;
  onToggleSidebar: () => void;
  hasTrafficLights: boolean;
}) {
  return (
    <DockedSidebarShell docked={docked}>
      <SidebarContent onToggleSidebar={onToggleSidebar} hasTrafficLights={hasTrafficLights} />
    </DockedSidebarShell>
  );
}

export function AppSidebar() {
  const chrome = useSidebarChrome();

  return chrome.sidebarAsOverlay ? (
    <AppSidebarOverlay
      visible={chrome.sidebarVisible}
      onClose={() => chrome.setSidebarVisible(false)}
      onToggleSidebar={chrome.toggleSidebar}
      hasTrafficLights={chrome.hasTrafficLights}
    />
  ) : (
    <AppSidebarDocked
      docked={chrome.sidebarDocked}
      onToggleSidebar={chrome.toggleSidebar}
      hasTrafficLights={chrome.hasTrafficLights}
    />
  );
}
