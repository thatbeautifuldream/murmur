import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_ACTIVATION_SHORTCUT,
  DEFAULT_MODES_CONFIG,
  type ActivationShortcut,
  type ModesConfig,
} from "@app/contracts";

interface Settings {
  activationShortcut: ActivationShortcut;
  modes: ModesConfig;
}

const DEFAULTS: Settings = {
  activationShortcut: DEFAULT_ACTIVATION_SHORTCUT,
  modes: DEFAULT_MODES_CONFIG,
};

let cache: Settings | undefined;

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function load(): Settings {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    cache = { ...DEFAULTS, ...parsed };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(settings: Settings): void {
  cache = settings;
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

export function getActivationShortcut(): ActivationShortcut {
  return load().activationShortcut;
}

export function setActivationShortcut(shortcut: ActivationShortcut): void {
  save({ ...load(), activationShortcut: shortcut });
}

export function getModes(): ModesConfig {
  return load().modes;
}

export function setModes(modes: ModesConfig): void {
  save({ ...load(), modes });
}

/** Resolves the mode to use for a dictation given the frontmost app's bundle
 *  id: a manual override wins; otherwise the first mode listing that bundle id;
 *  otherwise the default mode. */
export function resolveMode(bundleId: string | null): ModesConfig["modes"][number] {
  const { modes, defaultModeId, overrideModeId } = getModes();
  const byId = (id: string | null) => modes.find((mode) => mode.id === id);
  const fallback = byId(defaultModeId) ?? modes[0] ?? DEFAULT_MODES_CONFIG.modes[0]!;
  if (overrideModeId) return byId(overrideModeId) ?? fallback;
  if (bundleId) {
    const matched = modes.find((mode) => mode.appBundleIds.includes(bundleId));
    if (matched) return matched;
  }
  return fallback;
}
