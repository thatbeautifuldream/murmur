import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { DictationStatus } from "@app/contracts";
import { getDesktopBridge, isDesktop } from "@/desktopBridge";
import { LiveWaveform } from "@/components/ui/live-waveform";

export const Route = createFileRoute("/")({
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

const LINE = {
  width: 56,
  height: 4,
  borderRadius: 9999,
};

const PILL = {
  width: 240,
  height: 44,
  borderRadius: 9999,
};

/** Murmur's whole app: a flatline that's invisible until you tap Option —
 *  then it springs into a small pill with a live waveform, and springs back
 *  to a line the moment you tap Option again to stop (which also pastes the
 *  transcript into whatever app is frontmost). No buttons, no chrome — the
 *  hotkey is the only control surface. */
function DictationRoute() {
  const status = useDictation();
  const listening = status === "listening";
  const expanded = listening || status === "inserting";

  const toggle = () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    if (listening) {
      void bridge.stopDictation();
    } else {
      void bridge.startDictation(LOCALE);
    }
  };

  if (!isDesktop) return null;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={listening ? "Stop dictation" : "Start dictation"}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
      initial={false}
      animate={expanded ? PILL : LINE}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="flex cursor-pointer items-center justify-center overflow-hidden bg-foreground/20 dark:bg-white/20"
      style={
        {
          WebkitAppRegion: "drag",
          ...(expanded && {
            backgroundColor: "var(--popover)",
            boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.35)",
          }),
        } as React.CSSProperties
      }
    >
      {expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full px-4"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <LiveWaveform
            active={listening}
            processing={status === "inserting"}
            mode="scrolling"
            height={22}
            barWidth={2.5}
            barGap={2}
            sensitivity={2.5}
            smoothingTimeConstant={0.5}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
