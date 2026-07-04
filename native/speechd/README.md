# speechd

Murmur's speech-to-text daemon. Wraps `SFSpeechRecognizer` (Apple Speech framework) and `AVAudioEngine` mic capture behind a loopback-only HTTP/JSON API. Spawned as a child process by the Electron app (`apps/desktop/src/speechd-manager.ts`) — you don't run this by hand except when developing it directly.

## API

Listens on `127.0.0.1:8722` only (rejects non-loopback connections).

- `GET /health` → `{ "status": "ok" }`
- `POST /start` → begins mic capture + live recognition, `{ "status": "listening" }`
- `POST /stop` → stops capture, returns the final transcript, `{ "text": "..." }`

## Run standalone (for developing speechd itself)

```sh
swift build
.build/debug/murmur-speechd
```

Normally you don't do this — `bun run dev` / `bun run speechd:build` from the repo root builds it, and Electron spawns it automatically on launch. First run will prompt for Microphone and Speech Recognition permissions (System Settings → Privacy & Security).

## Roadmap

- Swap in `SpeechAnalyzer`/`SpeechTranscriber` (macOS 26+) for on-device/ANE-accelerated recognition.
- Streaming partial-result push (WebSocket or SSE) instead of push-to-talk start/stop.
- Real code-signing for the bundled binary instead of the current unsigned dev build (see `mac.binaries` in `apps/desktop/electron-builder.config.cjs`).
