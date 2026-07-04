import type { ReactNode } from "react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

type TPageLayoutProps = {
  children: ReactNode;
};

/** Shared page layout for template routes. The page title lives in the header
 *  (see app-shell); this renders the content top-left below the titlebar. Both
 *  pages render through this so they stay identical. */
export function PageLayout({ children }: TPageLayoutProps) {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  return (
    <div className={cn("max-w-2xl pt-4 pb-12", sidebarVisible ? "px-4" : "px-6")}>
      <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {children}
      </pre>
    </div>
  );
}
