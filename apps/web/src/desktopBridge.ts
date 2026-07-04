import type { DesktopBridge } from "@app/contracts";

export const isDesktop = typeof window !== "undefined" && !!window.desktopBridge;

export function getDesktopBridge(): DesktopBridge | null {
  return window.desktopBridge ?? null;
}

declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}
