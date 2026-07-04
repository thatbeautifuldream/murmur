import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { useSidebarChrome } from "@/hooks/use-sidebar-chrome";
import { useTheme } from "@/hooks/use-theme";
import { Titlebar } from "@/components/layout/titlebar";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun01Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
] as const;

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute() {
  const chrome = useSidebarChrome();
  const { theme, setTheme } = useTheme();

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
        <ItemGroup>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Theme</ItemTitle>
              <ItemDescription>Match your system, or pick light or dark.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={theme}
                onValueChange={(value) => value && setTheme(value as typeof theme)}
              >
                {THEME_OPTIONS.map(({ value, label, icon }) => (
                  <ToggleGroupItem key={value} value={value} aria-label={label}>
                    <HugeiconsIcon icon={icon} className="size-4" />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ItemActions>
          </Item>
        </ItemGroup>
      </div>
    </main>
  );
}
