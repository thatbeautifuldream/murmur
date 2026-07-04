import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { DictationStatus } from "@app/contracts";
import { getDesktopBridge, isDesktop } from "@/desktopBridge";
import { MicrophoneWaveform } from "@/components/ui/waveform";

export const Route = createFileRoute("/")({
  // The root route is the dictation pill, which only makes sense inside the
  // Electron shell (it drives native mic capture over `window.desktopBridge`).
  // A plain browser tab has no bridge, so send it straight to History instead
  // of rendering a blank pill.
  beforeLoad: () => {
    if (!isDesktop) {
      throw redirect({ to: "/history" });
    }
  },
  component: DictationRoute,
});

const LOCALE = "en-US";

function useDictation() {
  const [status, setStatus] = useState<DictationStatus>("idle");

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onDictationStatusChanged(setStatus);
  }, []);

  return status;
}

/** Murmur's whole app: a flatline that's invisible until you tap Option —
 *  then it expands into a small pill with a live waveform, and collapses
 *  back to a line the moment you tap Option again to stop (which also
 *  pastes the transcript into whatever app is frontmost). No buttons, no
 *  chrome — the hotkey is the only control surface.
 *
 *  The resize tweens real `width`/`height` via Motion's `animate` (tuned
 *  asymmetric: expand reads as an immediate reaction to the hotkey, collapse
 *  is quieter so it doesn't feel like it's slamming shut) so it's the
 *  primary feedback that the hotkey landed. This deliberately isn't Motion's
 *  `layout` prop — `layout` animates size changes via a transform-scale
 *  FLIP, which visibly stretches/squashes the waveform content mid-resize
 *  given how extreme the aspect-ratio swing is (4px tall -> 44px tall).
 *  Animating `width`/`height` directly causes genuine reflow each frame
 *  instead, so the child never gets scaled. Background/box-shadow stay a
 *  plain CSS transition even though everything else moved to Motion —
 *  they're multi-stop `color-mix()`/`var()`-based gradients, which the
 *  browser's own CSS interpolator crossfades correctly but Motion's
 *  animate() can't parse. */
function DictationRoute() {
  const status = useDictation();
  const listening = status === "listening";
  const expanded = listening || status === "inserting";
  const reduceMotion = useReducedMotion();

  const toggle = () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    if (listening) {
      void bridge.stopDictation();
    } else {
      void bridge.startDictation(LOCALE);
    }
  };

  const durationMs = expanded ? 250 : 150;
  const shapeTransition = reduceMotion
    ? { duration: 0 }
    : { duration: durationMs / 1000, ease: [0.22, 1, 0.36, 1] as const };
  // A plain inline `transition` string instead of a Tailwind class — Tailwind's
  // `transition-[…]` arbitrary-value parser doesn't accept a comma-separated
  // property list like `background,box-shadow`, so that class silently never
  // generated any CSS, leaving these two properties untransitioned (they were
  // popping instantly instead of crossfading, which read as the exit
  // animation being broken).
  const surfaceTransition = reduceMotion
    ? "none"
    : `background ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={listening ? "Stop dictation" : "Start dictation"}
      aria-pressed={listening}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
      initial={false}
      animate={{
        width: expanded ? 240 : 56,
        height: expanded ? 44 : 4,
      }}
      transition={shapeTransition}
      className="flex cursor-pointer items-center justify-center overflow-hidden rounded-full"
      style={
        {
          WebkitAppRegion: "drag",
          transition: surfaceTransition,
          background: expanded
            ? "var(--pill-bg-expanded)"
            : "color-mix(in srgb, var(--foreground) 20%, transparent)",
          boxShadow: expanded ? "var(--pill-shadow-expanded)" : "none",
        } as React.CSSProperties
      }
    >
      <motion.div
        className="w-full px-4"
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.15, delay: expanded ? 0.1 : 0 }}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <MicrophoneWaveform
          active={listening}
          height={22}
          barWidth={2.5}
          barGap={2}
          barHeight={3}
          fadeEdges
          fadeWidth={20}
          sensitivity={1.5}
          onError={(error) => console.error("murmur: mic access failed", error)}
        />
      </motion.div>
    </motion.div>
  );
}
