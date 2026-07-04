import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mic, Square } from "lucide-react";
import type { DictationStatus } from "@app/contracts";
import { getDesktopBridge, isDesktop } from "@/desktopBridge";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/ui/live-waveform";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  component: DictationRoute,
});

const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
];

const STATUS_COPY: Record<DictationStatus, string> = {
  idle: "Idle",
  listening: "Listening",
  inserting: "Inserting",
  error: "murmur-speechd unreachable",
};

function useDictation() {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    const offStatus = bridge.onDictationStatusChanged(setStatus);
    const offTranscript = bridge.onDictationTranscript(setTranscript);
    return () => {
      offStatus();
      offTranscript();
    };
  }, []);

  return { status, transcript };
}

/** Murmur's whole app: one mic button, a live waveform, and the last
 *  transcript. Option+Space toggles the same state from anywhere — this
 *  view is just a visible surface for it, not the only way to drive it. */
function DictationRoute() {
  const { status, transcript } = useDictation();
  const [locale, setLocale] = useState("en-US");

  const listening = status === "listening";
  const inserting = status === "inserting";
  const hasError = status === "error";

  const toggle = () => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    if (listening) {
      void bridge.stopDictation();
    } else {
      void bridge.startDictation(locale);
    }
  };

  if (!isDesktop) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Murmur's dictation only runs inside the desktop app.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-8">
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant={hasError ? "error" : listening ? "destructive" : "secondary"}
          className="gap-1.5 pr-2 pl-1.5"
        >
          <span
            className={cn(
              "size-1.5 rounded-full bg-current",
              listening && "animate-[pulse-dot_1.4s_ease-in-out_infinite]",
            )}
            aria-hidden="true"
          />
          {STATUS_COPY[status]}
        </Badge>

        <Select value={locale} onValueChange={setLocale} disabled={listening}>
          <SelectTrigger size="sm" className="w-36" aria-label="Dictation language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col items-center gap-5 pt-4">
        <Button
          type="button"
          variant={listening ? "destructive" : "default"}
          onClick={toggle}
          aria-pressed={listening}
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          className="relative size-20 rounded-full"
        >
          {listening ? <Square className="fill-current" /> : <Mic />}
        </Button>

        <LiveWaveform
          active={listening}
          processing={inserting}
          mode="static"
          height={48}
          className="max-w-64"
        />

        <p className="text-xs text-muted-foreground">
          <kbd className="font-mono">⌥ Space</kbd> to toggle from anywhere
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-muted p-4">
        {transcript ? (
          <p className="text-pretty text-sm text-foreground">{transcript}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your last transcript will show up here.
          </p>
        )}
      </div>
    </div>
  );
}
