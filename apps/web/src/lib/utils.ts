import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Compact relative time for the sidebar chat list — "now", "7m", "3h", "2d". */
export function formatRelativeTimeShort(epochMs: number): string {
  const diffMs = Math.max(0, Date.now() - epochMs)
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "now"
  if (diffMin < 60) return `${diffMin}m`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`

  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return `${diffDays}d`

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 4) return `${diffWeeks}w`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}mo`

  return `${Math.floor(diffDays / 365)}y`
}
