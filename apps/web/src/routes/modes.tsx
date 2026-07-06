import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
  DEFAULT_MODE_ID,
  type DictationMode,
  type ModesConfig,
  type ReplacementRule,
} from "@app/contracts";
import { getDesktopBridge } from "@/desktopBridge";
import { useSidebarChrome } from "@/hooks/use-sidebar-chrome";
import { Titlebar } from "@/components/layout/titlebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export const Route = createFileRoute("/modes")({
  component: ModesRoute,
});

const linesToList = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function newMode(): DictationMode {
  return {
    id: crypto.randomUUID(),
    name: "New mode",
    appBundleIds: [],
    vocabulary: [],
    replacements: [],
  };
}

function ModesRoute() {
  const chrome = useSidebarChrome();
  const bridge = getDesktopBridge();
  const [config, setConfig] = useState<ModesConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_MODE_ID);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getModes().then((loaded) => {
      setConfig(loaded);
      setSelectedId(loaded.overrideModeId ?? loaded.defaultModeId);
    });
  }, [bridge]);

  const selected = useMemo(
    () => config?.modes.find((mode) => mode.id === selectedId) ?? null,
    [config, selectedId],
  );

  function persist(next: ModesConfig) {
    setConfig(next);
    if (bridge) void bridge.setModes(next);
  }

  function updateMode(id: string, patch: Partial<DictationMode>) {
    if (!config) return;
    persist({
      ...config,
      modes: config.modes.map((mode) => (mode.id === id ? { ...mode, ...patch } : mode)),
    });
  }

  function addMode() {
    if (!config) return;
    const mode = newMode();
    persist({ ...config, modes: [...config.modes, mode] });
    setSelectedId(mode.id);
  }

  function deleteMode(id: string) {
    if (!config || id === config.defaultModeId) return;
    const modes = config.modes.filter((mode) => mode.id !== id);
    persist({
      ...config,
      modes,
      overrideModeId: config.overrideModeId === id ? null : config.overrideModeId,
    });
    setSelectedId(config.defaultModeId);
    toast.success("Mode deleted");
  }

  if (!bridge) {
    return (
      <main className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
        <Titlebar
          sidebarDocked={chrome.sidebarDocked}
          showTrafficGutter={chrome.showTrafficGutter}
          onToggleSidebar={chrome.toggleSidebar}
        >
          <h1 className="min-w-0 truncate text-sm font-medium text-foreground">Modes</h1>
        </Titlebar>
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Desktop only</EmptyTitle>
              <EmptyDescription>
                Custom modes are managed inside the Murmur desktop app.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col bg-background">
      <Titlebar
        sidebarDocked={chrome.sidebarDocked}
        showTrafficGutter={chrome.showTrafficGutter}
        onToggleSidebar={chrome.toggleSidebar}
      >
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">Modes</h1>
      </Titlebar>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-border p-3 lg:w-56 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0">
          {config?.modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSelectedId(mode.id)}
              data-active={mode.id === selectedId}
              className="flex shrink-0 flex-col items-start rounded-lg px-3 py-2.5 text-left text-base text-foreground/70 transition-colors hover:bg-accent/60 data-[active=true]:bg-accent data-[active=true]:text-accent-foreground sm:py-2 sm:text-sm lg:w-full lg:shrink"
            >
              <span className="truncate font-medium">{mode.name || "Untitled"}</span>
              <span className="text-sm text-muted-foreground sm:text-xs">
                {mode.id === config.defaultModeId
                  ? "Fallback"
                  : mode.appBundleIds.length
                    ? `${mode.appBundleIds.length} app${mode.appBundleIds.length > 1 ? "s" : ""}`
                    : "No apps"}
              </span>
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 justify-start gap-2 lg:mt-1"
            onClick={addMode}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-5 shrink-0 sm:size-4" />
            <span className="max-lg:sr-only">Add mode</span>
          </Button>
        </aside>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
          {selected && config && (
            <ModeEditor
              mode={selected}
              isDefault={selected.id === config.defaultModeId}
              onChange={(patch) => updateMode(selected.id, patch)}
              onDelete={() => deleteMode(selected.id)}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function ModeEditor({
  mode,
  isDefault,
  onChange,
  onDelete,
}: {
  mode: DictationMode;
  isDefault: boolean;
  onChange: (patch: Partial<DictationMode>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="mode-name">Name</Label>
          <Input
            id="mode-name"
            value={mode.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        {!isDefault && (
          <Button variant="outline" size="sm" className="gap-2 text-destructive" onClick={onDelete}>
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Delete
          </Button>
        )}
      </div>

      {!isDefault && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mode-apps">Apps</Label>
          <Textarea
            id="mode-apps"
            rows={3}
            placeholder={"One bundle id per line, e.g.\ncom.tinyspeck.slackmacgap\ncom.apple.mail"}
            value={mode.appBundleIds.join("\n")}
            onChange={(event) => onChange({ appBundleIds: linesToList(event.target.value) })}
          />
          <p className="text-sm text-muted-foreground sm:text-xs">
            When one of these apps is frontmost, this mode is used automatically.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mode-vocab">Vocabulary</Label>
        <Textarea
          id="mode-vocab"
          rows={4}
          placeholder={"Names, jargon, acronyms, one per line, e.g.\nKubernetes\nAnthropic\nSFSpeechRecognizer"}
          value={mode.vocabulary.join("\n")}
          onChange={(event) => onChange({ vocabulary: linesToList(event.target.value) })}
        />
        <p className="text-sm text-muted-foreground sm:text-xs">
          Biases recognition toward these words so they transcribe correctly.
        </p>
      </div>

      <ReplacementsEditor
        rules={mode.replacements}
        onChange={(replacements) => onChange({ replacements })}
      />
    </div>
  );
}

function ReplacementsEditor({
  rules,
  onChange,
}: {
  rules: ReplacementRule[];
  onChange: (rules: ReplacementRule[]) => void;
}) {
  function update(index: number, patch: Partial<ReplacementRule>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }
  function remove(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Replacements</Label>
      <p className="-mt-1 text-sm text-muted-foreground sm:text-xs">
        Rewrites the final transcript, e.g. “my email” becomes your address.
      </p>
      <div className="flex flex-col gap-2">
        {rules.map((rule, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-border p-2 sm:flex-row sm:items-center sm:border-0 sm:p-0"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                placeholder="Find"
                value={rule.from}
                onChange={(event) => update(index, { from: event.target.value })}
              />
              <span className="shrink-0 text-muted-foreground">→</span>
              <Input
                placeholder="Replace with"
                value={rule.to}
                onChange={(event) => update(index, { to: event.target.value })}
              />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-normal">
              <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground sm:text-xs">
                <Switch
                  checked={rule.caseSensitive ?? false}
                  onCheckedChange={(checked) => update(index, { caseSensitive: checked })}
                />
                Match case
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative shrink-0"
                onClick={() => remove(index)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-5 sm:size-4" />
                <span
                  className="absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-fit gap-2"
        onClick={() => onChange([...rules, { from: "", to: "" }])}
      >
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        Add replacement
      </Button>
    </div>
  );
}
