# murmur

System-wide dictation for macOS. A small Swift speech service (`murmur-speechd`, Apple Speech / SFSpeechRecognizer) exposed over a local loopback API, driven by an Electron + React desktop app. Speak, and the transcript lands wherever your cursor is.

Electron shell built on an Electron + React + Vite template: renderer and main process talk through a strongly typed `window.desktopBridge` defined once in `packages/contracts`.

## Layout

```
apps/
  desktop/   Electron main + preload (tsdown -> dist-electron/*.cjs)
  web/       Vite + React renderer (also runnable as a standalone web app)
packages/
  contracts/ Shared DesktopBridge interface + IPC channel constants
```

## Develop

```sh
bun install
bun run dev
```

This starts Vite on `http://localhost:5173` and Electron, which loads the dev server. Edit web code and HMR works; edit desktop code and the launcher restarts Electron.

Run [murmur-speechd](../murmur-speechd) alongside it (`swift build && .build/debug/murmur-speechd`) — the app talks to it on `127.0.0.1:8722`. Press **Option+Space** anywhere to start/stop dictation; the transcript is pasted into whatever app is frontmost (requires the Accessibility permission for the paste keystroke).

## Build

```sh
bun run build   # builds web -> apps/web/dist and desktop -> apps/desktop/dist-electron
bun run start   # runs the built Electron app against the built renderer
```

## Package (installer)

```sh
bun run --cwd apps/desktop package         # current platform
bun run --cwd apps/desktop package:mac     # DMG (arm64 + x64)
bun run --cwd apps/desktop package:win     # NSIS installer
bun run --cwd apps/desktop package:linux   # AppImage
```

Output lands in `apps/desktop/release/`. Config: `apps/desktop/electron-builder.config.cjs`.

## Stack

- **Renderer**: Vite 5, React 19, TanStack Router (file-based routing in `apps/web/src/routes/`), Tailwind v4 (`@tailwindcss/vite`).
- **Main**: Electron 33, bundled with tsdown to CJS in `dist-electron/`.
- **Contract**: shared `DesktopBridge` interface in `packages/contracts`.
- **Packaging**: electron-builder.
- **Speech backend**: `murmur-speechd` (separate Swift package), Apple Speech framework over a loopback HTTP API.

## Adding an IPC method

1. Add the method to `DesktopBridge` and add a channel constant in `packages/contracts/src/index.ts`.
2. Expose it in `apps/desktop/src/preload.ts` (one line forwarding to `ipcRenderer.invoke`).
3. Handle it in `apps/desktop/src/ipc/handlers.ts` with `ipcMain.handle(CHANNEL, ...)`.
4. Call it from the renderer via `window.desktopBridge.yourMethod(...)`.

The interface is the contract — TypeScript will tell you if any of the four sides drifts.
