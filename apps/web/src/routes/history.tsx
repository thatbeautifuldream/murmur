import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, isToday, isYesterday } from "date-fns";
import { AppWindow, Clock, Copy, History as HistoryIcon, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TranscriptHistoryEntry } from "@app/contracts";
import { getHistoryBridge } from "@/desktopBridge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/history")({
  component: HistoryRoute,
});

function formatDay(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs == null) return null;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function useTranscriptHistory() {
  const [entries, setEntries] = useState<TranscriptHistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unreachable, setUnreachable] = useState(false);

  const refresh = useCallback(() => {
    void getHistoryBridge()
      .listTranscriptHistory()
      .then((list) => {
        setEntries(list);
        setUnreachable(false);
      })
      .catch(() => {
        setEntries([]);
        setUnreachable(true);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    return getHistoryBridge().onTranscriptHistoryChanged(refresh);
  }, [refresh]);

  return { entries, loaded, unreachable };
}

function HistoryRoute() {
  const { entries, loaded, unreachable } = useTranscriptHistory();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  }, []);

  const handlePlay = useCallback(
    async (entry: TranscriptHistoryEntry) => {
      if (playingId === entry.id) {
        audioRef.current?.pause();
        setPlayingId(null);
        return;
      }

      const dataUrl = await getHistoryBridge().readTranscriptAudio(entry.id);
      if (!dataUrl) {
        toast.error("Audio for this transcript is no longer available");
        return;
      }

      audioRef.current?.pause();
      const audio = new Audio(dataUrl);
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(entry.id);
      void audio.play();
    },
    [playingId],
  );

  const handleDelete = useCallback((id: string) => {
    void getHistoryBridge().deleteTranscriptHistoryEntry(id);
  }, []);

  const handleClearAll = useCallback(() => {
    void getHistoryBridge().clearTranscriptHistory();
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 p-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-lg font-semibold tracking-tight">History</h1>
          {loaded && entries.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">{entries.length}</span>
          )}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear all history"
              disabled={entries.length === 0}
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all history?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes every saved transcript and its recorded audio. This
                can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleClearAll}>
                Clear history
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {loaded && entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>{unreachable ? "Can't reach Murmur" : "No history yet"}</EmptyTitle>
            <EmptyDescription>
              {unreachable
                ? "Make sure the Murmur desktop app is running on this Mac, then refresh."
                : "Tap Option anywhere to dictate — your transcripts will show up here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup>
          {entries.map((entry) => {
            const createdAt = new Date(entry.createdAt);
            const duration = formatDuration(entry.durationMs);
            const isPlaying = playingId === entry.id;

            return (
              <Item
                key={entry.id}
                variant="outline"
                className="flex-col items-stretch gap-3 px-4 py-3.5"
              >
                <ItemContent>
                  <ItemTitle className="line-clamp-none text-sm leading-relaxed font-normal text-pretty">
                    {entry.text}
                  </ItemTitle>
                </ItemContent>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <AppWindow className="size-4 shrink-0" />
                    <span className="truncate">{entry.sourceAppName ?? "Unknown app"}</span>
                    <span aria-hidden="true">&middot;</span>
                    <Clock className="size-4 shrink-0" />
                    <span>{formatDay(createdAt)}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span className="tabular-nums">{format(createdAt, "h:mm a")}</span>
                    {duration && (
                      <>
                        <span aria-hidden="true">&middot;</span>
                        <span className="tabular-nums">{duration}</span>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Copy transcript"
                      onClick={() => handleCopy(entry.text)}
                    >
                      <Copy />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isPlaying ? "Pause audio" : "Play audio"}
                      disabled={!entry.audioPath}
                      onClick={() => void handlePlay(entry)}
                    >
                      {isPlaying ? <Pause /> : <Play />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete transcript"
                      className="hover:bg-destructive/10 hover:text-destructive-foreground"
                      onClick={() => handleDelete(entry.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}
