import { createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { KeyboardShortcutsProvider } from "@/components/layout/keyboard-shortcuts";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Initialize theme (light/dark/system) on mount.
  useTheme();

  return (
    <TooltipProvider delayDuration={0}>
      <KeyboardShortcutsProvider>
        <AppShell />
        <Toaster richColors position="bottom-right" />
      </KeyboardShortcutsProvider>
    </TooltipProvider>
  );
}
