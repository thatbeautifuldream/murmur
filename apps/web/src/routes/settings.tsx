import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { useSidebarChrome } from "@/hooks/use-sidebar-chrome";
import { Titlebar } from "@/components/layout/titlebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const chrome = useSidebarChrome();

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
      <Titlebar
        sidebarDocked={chrome.sidebarDocked}
        showTrafficGutter={chrome.showTrafficGutter}
        onToggleSidebar={chrome.toggleSidebar}
      >
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">Settings</h1>
      </Titlebar>
      <div className="min-h-0 flex-1 overflow-y-auto p-8 pt-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Settings02Icon} />
            </EmptyMedia>
            <EmptyTitle>Coming soon</EmptyTitle>
            <EmptyDescription>
              Dictation preferences and shortcuts will live here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </main>
  );
}
