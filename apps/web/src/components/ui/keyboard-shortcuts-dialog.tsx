import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Kbd, KbdGroup } from "./kbd";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Speed up your workflow with these shortcuts.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {KEYBOARD_SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.description}
              className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5"
            >
              <span className="text-sm text-foreground">{shortcut.description}</span>
              <KbdGroup>
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </KbdGroup>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
