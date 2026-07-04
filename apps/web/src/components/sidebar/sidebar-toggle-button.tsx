import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type TSidebarToggleButtonProps = {
  onToggle: () => void;
};

export function SidebarToggleButton({ onToggle }: TSidebarToggleButtonProps) {
  return (
    <Button
      onClick={onToggle}
      variant="ghost"
      size="icon-xs"
      aria-label="Toggle sidebar"
      className="shrink-0 text-muted-foreground"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <PanelLeft />
    </Button>
  );
}
