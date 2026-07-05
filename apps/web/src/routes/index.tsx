import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { DictationStatus } from "@app/contracts";
import { getDesktopBridge, isDesktop } from "@/desktopBridge";
import { MicrophoneWaveform } from "@/components/ui/waveform";
import { cn } from "@/lib/utils";

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

// A stable reference — `MicrophoneWaveform` tears down and re-requests the
// mic stream/AudioContext whenever this callback's identity changes, so an
// inline arrow here would re-init the mic on every re-render (e.g. each
// live-caption update while listening).
function handleMicError(error: Error): void {
  console.error("murmur: mic access failed", error);
}

function useDictation() {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [partialText, setPartialText] = useState("");

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onDictationStatusChanged(setStatus);
  }, []);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    return bridge.onDictationPartialTranscript(setPartialText);
  }, []);

  return { status, partialText };
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
  const { status, partialText } = useDictation();
  const listening = status === "listening";
  const processing = status === "processing" || status === "inserting";
  const expanded = listening || processing;
  const reduceMotion = useReducedMotion();
  const captionRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ lastX: number; lastY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const caption = captionRef.current;
    if (!caption) return;
    caption.scrollTop = caption.scrollHeight;
  }, [partialText]);

  // While idle the window ignores the mouse so clicks fall through to whatever's
  // underneath; `forward: true` still delivers move events, so hit-test them
  // here and capture the mouse only while the cursor is over the pill (padded,
  // since the idle flatline is a tiny target). Element mouseenter/leave is
  // unreliable because the pill is a `-webkit-app-region: drag` region, which
  // swallows DOM mouse events — a document-level move listener is not affected.
  useEffect(() => {
    if (expanded) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const HIT_PADDING = 12;
    let interactive = false;
    const onMove = (event: MouseEvent) => {
      // Never release mid-drag: a fast drag lets the pointer briefly outrun the
      // window (which chases it a frame behind), and dropping capture there
      // would break the drag and flip the cursor back to the arrow.
      if (dragRef.current) return;
      const pill = pillRef.current;
      if (!pill) return;
      const rect = pill.getBoundingClientRect();
      const over =
        event.clientX >= rect.left - HIT_PADDING &&
        event.clientX <= rect.right + HIT_PADDING &&
        event.clientY >= rect.top - HIT_PADDING &&
        event.clientY <= rect.bottom + HIT_PADDING;
      if (over !== interactive) {
        interactive = over;
        bridge.setPillInteractive(over);
      }
    };
    window.addEventListener("mousemove", onMove);
    // No release on cleanup: capture during the expanded state is owned by the
    // main process (it re-asserts ignore-mouse on every status change), so
    // releasing here would race it and leave the expanded pill click-through.
    return () => window.removeEventListener("mousemove", onMove);
  }, [expanded]);

  // Dragging the pill is driven here (not a native `-webkit-app-region`, which
  // would override the cursor and race the click-through capture): stream the
  // screen-pixel delta to main on each move, and swallow the click that ends a
  // real drag so it doesn't also toggle dictation.
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const DRAG_THRESHOLD = 3;
    let startX = 0;
    let startY = 0;
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      bridge.movePillBy(event.screenX - drag.lastX, event.screenY - drag.lastY);
      drag.lastX = event.screenX;
      drag.lastY = event.screenY;
      if (Math.abs(event.screenX - startX) + Math.abs(event.screenY - startY) > DRAG_THRESHOLD) {
        drag.moved = true;
      }
    };
    const onUp = () => {
      if (dragRef.current?.moved) suppressClickRef.current = true;
      dragRef.current = null;
    };
    const onDown = (event: MouseEvent) => {
      startX = event.screenX;
      startY = event.screenY;
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const toggle = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (processing) return;
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
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence>
        {partialText && (
          <motion.div
            key="caption"
            ref={captionRef}
            layout
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="max-h-56 max-w-72 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-center text-xs text-[var(--foreground)]"
            style={{
              WebkitAppRegion: "no-drag",
              background: "color-mix(in srgb, var(--foreground) 10%, transparent)",
            } as React.CSSProperties}
          >
            {partialText.split(" ").map((word, i, words) => (
              <motion.span
                key={i}
                initial={reduceMotion ? false : { opacity: 0, y: 4, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block"
                style={{ willChange: "transform, opacity, filter" }}
              >
                {word}
                {i < words.length - 1 ? " " : ""}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={
          processing ? "Processing dictation" : listening ? "Stop dictation" : "Start dictation"
        }
        aria-pressed={listening}
        aria-busy={processing}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
        onMouseDown={(e) => {
          if (e.button !== 0 || processing) return;
          dragRef.current = { lastX: e.screenX, lastY: e.screenY, moved: false };
        }}
        ref={pillRef}
        initial={false}
        animate={{
          width: expanded ? 240 : 56,
          height: expanded ? 44 : 4,
        }}
        transition={shapeTransition}
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full",
          processing
            ? "cursor-default"
            : expanded
              ? "cursor-pointer"
              : "cursor-grab active:cursor-grabbing",
        )}
        style={
          {
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
            processing={processing}
            height={22}
            barWidth={2.5}
            barGap={2}
            barHeight={3}
            fadeEdges
            fadeWidth={20}
            sensitivity={1.5}
            onError={handleMicError}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
