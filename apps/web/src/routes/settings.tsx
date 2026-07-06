import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { formatForDisplay, useHotkeyRecorder } from "@tanstack/react-hotkeys";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { ActivationShortcut } from "@app/contracts";
import { getDesktopBridge } from "@/desktopBridge";
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
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

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
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Activation shortcut</ItemTitle>
              <ItemDescription>
                The keys that start or stop dictation from any app.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ActivationShortcutControl />
            </ItemActions>
          </Item>
        </ItemGroup>
      </div>
    </main>
  );
}

function shortcutLabel(shortcut: ActivationShortcut): string {
  if (shortcut.kind === "option-tap") return "⌥ Option (tap)";
  return formatForDisplay(shortcut.hotkey);
}

function ActivationShortcutControl() {
  const bridge = getDesktopBridge();
  const [shortcut, setShortcut] = useState<ActivationShortcut | null>(null);

  useEffect(() => {
    void bridge?.getActivationShortcut().then(setShortcut);
  }, [bridge]);

  async function save(next: ActivationShortcut) {
    const result = await bridge?.setActivationShortcut(next);
    if (result?.ok) setShortcut(next);
    else toast.error(result?.error ?? "Couldn't set that shortcut.");
  }

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (hotkey) void save({ kind: "combo", hotkey });
    },
  });

  if (!bridge || !shortcut) {
    return <span className="text-sm text-muted-foreground">Open Murmur to change this.</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Kbd className="h-6 px-1.5">
        {recorder.isRecording ? "Press keys…" : shortcutLabel(shortcut)}
      </Kbd>
      <Button
        size="sm"
        variant={recorder.isRecording ? "secondary" : "outline"}
        onClick={() => (recorder.isRecording ? recorder.cancelRecording() : recorder.startRecording())}
      >
        {recorder.isRecording ? "Cancel" : "Change"}
      </Button>
      {shortcut.kind === "combo" && !recorder.isRecording && (
        <Button size="sm" variant="ghost" onClick={() => void save({ kind: "option-tap" })}>
          Reset
        </Button>
      )}
    </div>
  );
}
