import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { DictationStatus } from "@app/contracts";
import { getDesktopBridge, isDesktop } from "@/desktopBridge";
import { MicrophoneWaveform } from "@/components/ui/waveform";
import { AgentMarkdown } from "@/components/ui/agent-markdown";
import { useAgent } from "@/hooks/use-agent";
import { Button } from "@/components/ui/button";
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

interface NotchMode {
  hasNotch: boolean;
  width: number;
  height: number;
}

const NO_NOTCH: NotchMode = { hasNotch: false, width: 0, height: 0 };

/** Whether the pill is docked flush against a physical notch, and its exact
 *  pixel size — the main process already sizes the native window around this
 *  (see main.ts); the pill needs the real numbers (not just the boolean) so
 *  its idle shape can animate to an exact pixel target that fills the window
 *  edge-to-edge with square top/rounded bottom corners, or fall back to the
 *  original small floating flatline/pill on non-notched hardware. */
function useNotchMode(): NotchMode {
  const [mode, setMode] = useState<NotchMode>(NO_NOTCH);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    let cancelled = false;
    void bridge.getNotchMode().then((m) => {
      if (!cancelled) setMode(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}

/** Murmur's whole app: on notched hardware, a shape flush against the
 *  physical camera notch that's invisible-until-tapped (it fills the exact
 *  notch footprint main.ts sizes the window to, so it reads as part of the
 *  notch's own black bezel); on other Macs, a small floating flatline in the
 *  same spot. Tapping Option expands either into a pill with a live
 *  waveform hanging below it, and collapses back the moment you tap Option
 *  again to stop (which also pastes the transcript into whatever app is
 *  frontmost). No buttons, no chrome — the hotkey is the only control
 *  surface.
 *
 *  The resize tweens real `width`/`height` via Motion's `animate` (tuned
 *  asymmetric: expand reads as an immediate reaction to the hotkey, collapse
 *  is quieter so it doesn't feel like it's slamming shut) so it's the
 *  primary feedback that the hotkey landed. This deliberately isn't Motion's
 *  `layout` prop — `layout` animates size changes via a transform-scale
 *  FLIP, which visibly stretches/squashes the waveform content mid-resize
 *  given how extreme the aspect-ratio swing is (4px tall -> 44px tall).
 *  Animating `width`/`height` directly causes genuine reflow each frame
 *  instead, so the child never gets scaled. The idle and expanded surfaces
 *  (background + drop shadow) are two stacked layers crossfaded on `opacity`
 *  rather than a CSS `box-shadow` transition — animating a shadow repaints
 *  its bitmap every frame, which was the main source of the pill jank on the
 *  transparent overlay window. */
function DictationRoute() {
  const { status, partialText } = useDictation();
  const agent = useAgent();
  const { hasNotch: notchMode, width: notchWidth, height: notchHeight } = useNotchMode();
  const listening = status === "listening";
  const processing = status === "processing" || status === "inserting";
  const agentActive = agent.status !== "idle" && agent.status !== "error";
  const agentListening = agent.status === "listening";
  const expanded = listening || processing || agentActive;
  const captionText = agentActive ? agent.text : partialText;
  // Only the agent writes markdown; a dictation partial is raw speech and is
  // left centered as plain text.
  const captionIsMarkdown = agentActive && agent.text.length > 0;
  // Esc is a global shortcut armed only while the agent is busy (see
  // setAgentCancelShortcutEnabled in the main process), so it's undiscoverable
  // without saying so — and what it does depends on the step it interrupts.
  const cancelHint = agent.pendingApproval
    ? "to deny"
    : agent.status === "listening"
      ? "to cancel"
      : agent.status === "speaking"
        ? "to stop speaking"
        : agent.status === "thinking"
          ? "to stop"
          : null;
  const reduceMotion = useReducedMotion();
  const captionRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const caption = captionRef.current;
    if (!caption) return;
    caption.scrollTop = caption.scrollHeight;
  }, [captionText]);

  // While idle the window ignores the mouse so clicks fall through to whatever's
  // underneath; `forward: true` still delivers move events, so hit-test them
  // here and capture the mouse only while the cursor is over the pill (padded,
  // since the idle flatline/notch-flush shape is a tiny target). Element
  // mouseenter/leave doesn't fire reliably at this window edge, so a
  // document-level move listener is used instead.
  useEffect(() => {
    if (expanded) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const HIT_PADDING = 12;
    let interactive = false;
    const onMove = (event: MouseEvent) => {
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

  const toggle = () => {
    if (processing || agentActive) return;
    const bridge = getDesktopBridge();
    if (!bridge) return;
    if (listening) {
      void bridge.stopDictation();
    } else {
      void bridge.startDictation(LOCALE);
    }
  };

  // Sequence the collapse: the waveform fades out first, then the shape
  // shrinks a beat later, so the box never crushes the still-visible content
  // (which read as haphazard). Expand stays the immediate hotkey reaction —
  // shape grows first, content fades in after it. Collapse also gets a gentle
  // ease-in-out so it settles rather than slamming shut.
  const shapeTransition = reduceMotion
    ? { duration: 0 }
    : {
        duration: expanded ? 0.25 : 0.2,
        delay: expanded ? 0 : 0.09,
        ease: (expanded ? [0.22, 1, 0.36, 1] : [0.4, 0, 0.2, 1]) as [
          number,
          number,
          number,
          number,
        ],
      };
  const contentTransition = reduceMotion
    ? { duration: 0 }
    : { duration: expanded ? 0.15 : 0.11, delay: expanded ? 0.1 : 0, ease: "easeOut" as const };

  // The window can't actually render flush against the real notch (macOS
  // reserves the menu-bar strip — see main.ts), so a flat top edge just read
  // as a cut-off corner rather than a seam with the notch. Fully rounded in
  // both states instead, same as the non-notch fallback — it's a normal
  // floating pill, just docked at the top of the screen. `squircle` (see
  // index.css) gives it macOS's continuous corner curvature instead of a
  // plain circular arc, matching the real notch/app-icon corner style.
  const idleRadiusClass = notchMode ? "squircle rounded-full" : "rounded-full";
  const expandedRadiusClass = notchMode ? "squircle rounded-full" : "rounded-full";
  const currentRadiusClass = expanded ? expandedRadiusClass : idleRadiusClass;

  // Idle size: notch mode animates to the notch's exact pixel dimensions
  // (from the native helper via getNotchMode, not a "100%" CSS size — the
  // native window's own shrink is deliberately deferred past the collapse
  // animation, see COLLAPSE_ANIMATION_MS in main.ts, so a percentage target
  // would resolve against the still-large window and visibly stretch instead
  // of shrinking). Non-notch mode keeps the original small flatline.
  const idleWidth = notchMode ? notchWidth : 56;
  const idleHeight = notchMode ? notchHeight : 4;

  return (
    // Pill first, caption after: the window is top-anchored (pinned flush
    // against the notch, growing downward — see main.ts), so extra content
    // has to stack *below* the pill, not above it, or it would render off
    // the top of the window / into the notch itself.
    <div className="flex flex-col items-center gap-2">
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
        ref={pillRef}
        // Deliberately animate real `width`/`height` (not Motion's `layout`
        // prop): `layout` drives size changes with a transform-scale FLIP,
        // which skews the waveform mid-resize and slides it from its old
        // centre as the pill grows, given how extreme the aspect swing is
        // (4px tall -> 44px tall). Animating the box directly reflows instead,
        // so the child is never scaled or repositioned — it just fades.
        initial={false}
        animate={{ width: expanded ? 240 : idleWidth, height: expanded ? 44 : idleHeight }}
        transition={shapeTransition}
        className={cn(
          "relative",
          currentRadiusClass,
          processing ? "cursor-default" : "cursor-pointer",
        )}
      >
        {/* Crossfade the two surfaces (idle flatline/notch-flush shape vs.
            expanded pill, with its drop shadow) with `opacity` instead of
            transitioning `background`/`box-shadow` — an animated `box-shadow`
            repaints the shadow bitmap every frame, whereas opacity stays on
            the compositor. These carry the shadow, so the pill itself must
            NOT clip (an ancestor `overflow-hidden` would swallow the
            shadow); the waveform is clipped by its own wrapper below
            instead. */}
        <motion.div
          className={cn("absolute inset-0", idleRadiusClass)}
          initial={false}
          animate={{ opacity: expanded ? 0 : 1 }}
          transition={shapeTransition}
          style={{
            // In notch mode this paints nothing at all: macOS reserves the
            // menu-bar strip at the window-server level, so this window can't
            // actually render flush against the real notch (see main.ts) —
            // it ends up a few points below it. A solid idle fill there would
            // show as a visibly detached black bar hanging under the notch
            // instead of reading as part of it. Leaving it transparent means
            // there's nothing to see while idle; the hover/click hit-test
            // area is still exactly there, it just has no visible shape until
            // dictation starts and the (visible) expanded layer takes over.
            background: notchMode
              ? "transparent"
              : "color-mix(in srgb, var(--foreground) 20%, transparent)",
          }}
        />
        <motion.div
          className={cn("absolute inset-0", expandedRadiusClass)}
          initial={false}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={shapeTransition}
          style={
            {
              background: notchMode ? "var(--pill-bg-notch)" : "var(--pill-bg-expanded)",
              boxShadow: notchMode ? "var(--pill-shadow-notch)" : "var(--pill-shadow-expanded)",
            } as React.CSSProperties
          }
        />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden",
            currentRadiusClass,
          )}
        >
          <motion.div
            className="w-full px-4"
            animate={{ opacity: expanded ? 1 : 0 }}
            transition={contentTransition}
            style={
              {
                WebkitAppRegion: "no-drag",
                // The notch's pure-black background doesn't track the app's
                // light/dark theme (it always matches the hardware bezel), so
                // the waveform's inherited `currentColor` — which it reads via
                // getComputedStyle — needs to be forced light here too,
                // regardless of theme.
                color: notchMode ? "white" : undefined,
              } as React.CSSProperties
            }
          >
            <MicrophoneWaveform
              active={listening || agentListening}
              processing={processing || agent.status === "thinking" || agent.status === "speaking"}
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
        </div>
      </motion.div>
      <AnimatePresence>
        {captionText && (
          <motion.div
            key="caption"
            ref={captionRef}
            initial={reduceMotion ? false : { opacity: 0, filter: "blur(2px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeInOut" }}
            className={cn(
              "max-h-56 max-w-72 overflow-y-auto break-words rounded-2xl squircle px-3 py-2 text-xs",
              captionIsMarkdown ? "text-left" : "whitespace-pre-wrap text-center",
              agentActive && "ring-1 ring-inset ring-blue-400/60",
            )}
            style={{
              WebkitAppRegion: "no-drag",
              background: notchMode ? "var(--pill-bg-notch)" : "var(--pill-bg-expanded)",
              boxShadow: notchMode ? "var(--pill-shadow-notch)" : "var(--pill-shadow-expanded)",
              color: notchMode ? "white" : undefined,
            } as React.CSSProperties}
          >
            {captionIsMarkdown ? (
              <AgentMarkdown
                animating={agent.status === "thinking" || agent.status === "speaking"}
                dark={notchMode}
              >
                {captionText}
              </AgentMarkdown>
            ) : (
              captionText
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {agent.pendingApproval && (
          <motion.div
            key="approval"
            initial={reduceMotion ? false : { opacity: 0, y: -8, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(2px)" }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            className="w-72 rounded-2xl squircle p-3"
            style={
              {
                WebkitAppRegion: "no-drag",
                background: notchMode ? "var(--pill-bg-notch)" : "var(--pill-bg-expanded)",
                boxShadow: notchMode ? "var(--pill-shadow-notch)" : "var(--pill-shadow-expanded)",
                color: notchMode ? "white" : undefined,
              } as React.CSSProperties
            }
          >
            <div className="flex items-baseline justify-between gap-2 px-1">
              <span className="text-[10px] uppercase tracking-wide opacity-60">Tool approval</span>
              <code className="truncate font-mono text-xs font-medium">
                {agent.pendingApproval.toolName}
              </code>
            </div>
            <pre
              className={cn(
                "mt-2 max-h-40 overflow-auto rounded-md p-2 text-left font-mono text-[10px] leading-snug",
                notchMode ? "bg-white/10" : "bg-black/10 dark:bg-white/10",
              )}
            >
              {JSON.stringify(agent.pendingApproval.input, null, 2)}
            </pre>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => agent.respond(false)}>
                Deny
              </Button>
              <Button size="sm" onClick={() => agent.respond(true)}>
                Approve
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {cancelHint && (
          <motion.div
            key="cancel-hint"
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-1.5 rounded-full squircle py-1 pr-2 pl-1 text-[0.6875rem]"
            style={
              {
                WebkitAppRegion: "no-drag",
                background: notchMode ? "var(--pill-bg-notch)" : "var(--pill-bg-expanded)",
                boxShadow: notchMode ? "var(--pill-shadow-notch)" : "var(--pill-shadow-expanded)",
                color: notchMode ? "white" : undefined,
              } as React.CSSProperties
            }
          >
            <kbd
              className={cn(
                "rounded-sm px-1 font-sans",
                notchMode ? "bg-white/15" : "bg-black/10 dark:bg-white/15",
              )}
            >
              esc
            </kbd>
            <span className="opacity-70">{cancelHint}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
