import type { MouseEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight02Icon } from "@hugeicons/core-free-icons";
import { getDesktopBridge } from "@/desktopBridge";
import { useSidebarChrome } from "@/hooks/use-sidebar-chrome";
import { Titlebar } from "@/components/layout/titlebar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";

const AUTHOR_URL = "https://milindmishra.com";

declare const __APP_VERSION__: string;

export const Route = createFileRoute("/about")({
  component: AboutRoute,
});

function openAuthorLink(event: MouseEvent<HTMLAnchorElement>) {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  event.preventDefault();
  void bridge.openExternal(AUTHOR_URL);
}

function AboutRoute() {
  const chrome = useSidebarChrome();

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
      <Titlebar
        sidebarDocked={chrome.sidebarDocked}
        showTrafficGutter={chrome.showTrafficGutter}
        onToggleSidebar={chrome.toggleSidebar}
      >
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">About</h1>
      </Titlebar>
      <div className="min-h-0 flex-1 overflow-y-auto p-8 pt-0">
        <ItemGroup>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Murmur</ItemTitle>
              <ItemDescription>A hotkey-driven dictation tool for your Mac.</ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Version</ItemTitle>
              <ItemDescription className="tabular-nums">{__APP_VERSION__}</ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="outline" asChild>
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={openAuthorLink}
            >
              <ItemContent>
                <ItemTitle>Built by Milind Mishra</ItemTitle>
                <ItemDescription>milindmishra.com</ItemDescription>
              </ItemContent>
              <ItemActions>
                <HugeiconsIcon
                  icon={ArrowUpRight02Icon}
                  className="size-4 text-muted-foreground"
                />
              </ItemActions>
            </a>
          </Item>
        </ItemGroup>
      </div>
    </main>
  );
}
