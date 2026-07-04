import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { DictationStatus } from "@app/contracts";
import { getDesktopBridge, isDesktop } from "@/desktopBridge";
import { MicrophoneWaveform } from "@/components/ui/waveform";

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

/** Murmur's whole app: a flatline that's invisible until you tap Option —
 *  then it expands into a small pill with a live waveform, and collapses
 *  back to a line the moment you tap Option again to stop (which also
 *  pastes the transcript into whatever app is frontmost). No buttons, no
 *  chrome — the hotkey is the only control surface. The expand/collapse is
 *  a plain CSS card-resize transition (transitions.dev) so it's the primary
 *  feedback that the hotkey landed. */
function DictationRoute() {
  const status = useDictation();
  const listening = status === "listening";
  const expanded = listening;

  const toggle = () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    if (listening) {
      void bridge.stopDictation();
    } else if (status === "idle" || status === "error") {
      void bridge.startDictation(LOCALE);
    }
  };

  if (!isDesktop) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={listening ? "Stop dictation" : "Start dictation"}
      aria-pressed={listening}
      data-expanded={expanded}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
      className="t-pill flex cursor-pointer items-center justify-center overflow-hidden"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div
        className="t-pill-content w-full px-4"
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
      </div>
    </div>
  );
}
