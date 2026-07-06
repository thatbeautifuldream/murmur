import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ACTIVATION_SHORTCUT, type ActivationShortcut } from "@app/contracts";

interface Settings {
  activationShortcut: ActivationShortcut;
}

const DEFAULTS: Settings = {
  activationShortcut: DEFAULT_ACTIVATION_SHORTCUT,
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
