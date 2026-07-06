import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, isToday, isYesterday } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BrowserIcon,
  Clock01Icon,
  Copy01Icon,
  Delete02Icon,
  HistoryIcon,
  PauseIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { TranscriptHistoryEntry } from "@app/contracts";
import { getHistoryBridge } from "@/desktopBridge";
import { useSidebarChrome } from "@/hooks/use-sidebar-chrome";
import { Titlebar } from "@/components/layout/titlebar";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
  const chrome = useSidebarChrome();
  const { entries, loaded, unreachable } = useTranscriptHistory();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastDeletedRef = useRef<TranscriptHistoryEntry[] | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const handleCopy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
  }, []);

  const restoreEntries = useCallback((deleted: TranscriptHistoryEntry[]) => {
    void getHistoryBridge()
      .restoreTranscriptHistoryEntries(deleted)
      .then(() => {
        lastDeletedRef.current = null;
        toast.success(deleted.length === 1 ? "Transcript restored" : "History restored");
      });
  }, []);

  const showUndoToast = useCallback(
    (deleted: TranscriptHistoryEntry[]) => {
      if (deleted.length === 0) return;
      lastDeletedRef.current = deleted;
      toast(deleted.length === 1 ? "Transcript deleted" : "History cleared", {
        action: {
          label: "Undo",
          onClick: () => restoreEntries(deleted),
        },
      });
    },
    [restoreEntries],
  );

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

  const handleDelete = useCallback(
    (id: string) => {
      void getHistoryBridge()
        .deleteTranscriptHistoryEntry(id)
        .then((deleted) => {
          if (!deleted) return;
          if (selectedId === id) setSelectedId(null);
          showUndoToast([deleted]);
        });
    },
    [selectedId, showUndoToast],
  );

  const handleClearAll = useCallback(() => {
    void getHistoryBridge()
      .clearTranscriptHistory()
      .then((deleted) => {
        setSelectedId(null);
        showUndoToast(deleted);
      });
  }, [showUndoToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      const selected = entries.find((entry) => entry.id === selectedId);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        const deleted = lastDeletedRef.current;
        if (!deleted?.length) return;
        event.preventDefault();
        restoreEntries(deleted);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selected) {
        event.preventDefault();
        handleCopy(selected.text);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        handleDelete(selected.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, selectedId, handleCopy, handleDelete, restoreEntries]);

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
      <Titlebar
        sidebarDocked={chrome.sidebarDocked}
        showTrafficGutter={chrome.showTrafficGutter}
        onToggleSidebar={chrome.toggleSidebar}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="min-w-0 truncate text-sm font-medium text-foreground">History</h1>
          {loaded && entries.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">{entries.length}</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear all history"
                disabled={entries.length === 0}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes every saved transcript and its recorded audio from History. You can
                  undo it immediately after clearing.
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
      </Titlebar>

      <div className="min-h-0 flex-1 overflow-y-auto p-8 pt-0">
        {loaded && entries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={HistoryIcon} />
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
              <ContextMenu key={entry.id}>
                <ContextMenuTrigger asChild>
                  <Item
                    variant="outline"
                    tabIndex={0}
                    aria-selected={selectedId === entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    onFocus={() => setSelectedId(entry.id)}
                    className="transcript-card flex-col items-stretch gap-3 rounded-xl squircle px-4 py-3.5 aria-selected:ring-2 aria-selected:ring-ring/40"
                  >
                    <ItemContent>
                      <ItemTitle className="line-clamp-none text-sm leading-relaxed font-normal text-pretty">
                        {entry.text}
                      </ItemTitle>
                    </ItemContent>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <HugeiconsIcon icon={BrowserIcon} className="size-4 shrink-0" />
                        <span className="truncate">{entry.sourceAppName ?? "Unknown app"}</span>
                        <span aria-hidden="true">&middot;</span>
                        <HugeiconsIcon icon={Clock01Icon} className="size-4 shrink-0" />
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
                          <HugeiconsIcon icon={Copy01Icon} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={isPlaying ? "Pause audio" : "Play audio"}
                          disabled={!entry.audioPath}
                          onClick={() => void handlePlay(entry)}
                        >
                          {isPlaying ? <HugeiconsIcon icon={PauseIcon} /> : <HugeiconsIcon icon={PlayIcon} />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete transcript"
                              className="hover:bg-destructive/10 hover:text-destructive-foreground"
                            >
                              <HugeiconsIcon icon={Delete02Icon} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this transcript?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the transcript and its recorded audio from History. You
                                can undo it immediately after deleting.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => handleDelete(entry.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </Item>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => handleCopy(entry.text)}>
                    Copy Transcript
                    <ContextMenuShortcut>⌘C</ContextMenuShortcut>
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={!entry.audioPath}
                    onSelect={() => void handlePlay(entry)}
                  >
                    {isPlaying ? "Pause Audio" : "Play Audio"}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={() => handleDelete(entry.id)}>
                    Delete Transcript
                    <ContextMenuShortcut>⌫</ContextMenuShortcut>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
              );
            })}
          </ItemGroup>
        )}
      </div>
    </main>
  );
}
