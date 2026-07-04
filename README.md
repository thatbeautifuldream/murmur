# murmur

System-wide dictation for macOS. A small Swift speech daemon (`native/speechd`, Apple Speech / SFSpeechRecognizer) over a local loopback API, spawned and managed by an Electron + React desktop app — one self-contained package, no separate service to run by hand. Speak, and the transcript lands wherever your cursor is.

Electron shell built on an Electron + React + Vite template: renderer and main process talk through a strongly typed `window.desktopBridge` defined once in `packages/contracts`.

## Layout

```
apps/
  desktop/       Electron main + preload (tsdown -> dist-electron/*.cjs)
                 spawns/kills native/speechd on startup/quit (speechd-manager.ts)
  web/           Vite + React renderer (also runnable as a standalone web app)
packages/
  contracts/     Shared DesktopBridge interface + IPC channel constants
native/
  speechd/       Swift package — Apple Speech + AVAudioEngine behind a
                 loopback HTTP API (127.0.0.1:8722)
```

## Develop

```sh
bun install
bun run speechd:build   # builds native/speechd once (debug)
bun run dev
```

This starts Vite on `http://localhost:5173` and Electron, which loads the dev server and spawns `native/speechd`'s debug binary as a child process (see `apps/desktop/src/speechd-manager.ts`). Edit web code and HMR works; edit desktop or Swift code and restart `bun run dev` to pick it up.

Tap **Option** anywhere to start/stop dictation; the transcript is pasted into whatever app is frontmost. Requires Accessibility (global Option-tap listener + paste keystroke), Microphone, and Speech Recognition permissions — macOS prompts for each on first run.

## Build

```sh
bun run build   # builds web -> apps/web/dist and desktop -> apps/desktop/dist-electron
bun run start   # runs the built Electron app against the built renderer
```

## Package (installer)

```sh
bun run package   # builds native/speechd in release mode, then the app + DMG
```

`bun run package` builds `native/speechd` in release first (`speechd:build:release`), then the web/desktop bundles, then hands off to electron-builder — the compiled speechd binary is embedded as an extraResource (`apps/desktop/electron-builder.config.cjs`) so the packaged `.app` is self-contained. Output lands in `apps/desktop/release/`.

## Stack

- **Renderer**: Vite 5, React 19, TanStack Router (file-based routing in `apps/web/src/routes/`), Tailwind v4 (`@tailwindcss/vite`).
- **Main**: Electron 33, bundled with tsdown to CJS in `dist-electron/`.
- **Contract**: shared `DesktopBridge` interface in `packages/contracts`.
- **Packaging**: electron-builder; bundles `native/speechd`'s release binary as an extraResource.
- **Speech backend**: `native/speechd` (Swift package), Apple Speech framework over a loopback HTTP API — spawned as a child process by `apps/desktop/src/speechd-manager.ts`.

## Adding an IPC method

1. Add the method to `DesktopBridge` and add a channel constant in `packages/contracts/src/index.ts`.
2. Expose it in `apps/desktop/src/preload.ts` (one line forwarding to `ipcRenderer.invoke`).
3. Handle it in `apps/desktop/src/ipc/handlers.ts` with `ipcMain.handle(CHANNEL, ...)`.
4. Call it from the renderer via `window.desktopBridge.yourMethod(...)`.

The interface is the contract — TypeScript will tell you if any of the four sides drifts.
