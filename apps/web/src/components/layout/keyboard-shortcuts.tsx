import { createContext, useContext, useState, type ReactNode } from "react";
import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys";
import { KeyboardShortcutsDialog } from "@/components/ui/keyboard-shortcuts-dialog";

type TKeyboardShortcutsContext = {
  openShortcuts: () => void;
};

const KeyboardShortcutsContext = createContext<TKeyboardShortcutsContext | null>(null);

export function useKeyboardShortcutsModal(): TKeyboardShortcutsContext {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error(
      "useKeyboardShortcutsModal must be used within KeyboardShortcutsProvider",
    );
  }
  return ctx;
}

function KeyboardShortcutsRuntime({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useHotkey("Mod+/", () => setOpen((v) => !v), {
    ignoreInputs: false,
    meta: { name: "Keyboard shortcuts", description: "Show keyboard shortcuts" },
  });

  return (
    <KeyboardShortcutsContext.Provider value={{ openShortcuts: () => setOpen(true) }}>
      {children}
      <KeyboardShortcutsDialog open={open} onOpenChange={setOpen} />
    </KeyboardShortcutsContext.Provider>
  );
}

export function KeyboardShortcutsProvider({ children }: { children: ReactNode }) {
  return (
    <HotkeysProvider>
      <KeyboardShortcutsRuntime>{children}</KeyboardShortcutsRuntime>
    </HotkeysProvider>
  );
}
