# notch-geometry

One-shot CLI that reports the built-in display's notch geometry (or its absence) as a single line of JSON on stdout, then exits. Used by the Electron app (`apps/desktop/src/notch-geometry-manager.ts`) to dock the dictation pill flush against the physical notch — Electron's `screen` module has no notch/safe-area API, so this reads `NSScreen.safeAreaInsets`/`auxiliaryTopLeftArea`/`auxiliaryTopRightArea` directly.

## Output

```json
{"hasNotch":true,"screenWidth":1512,"screenHeight":982,"notchX":646,"notchWidth":220,"notchHeight":32}
```

`notchX`/`notchWidth`/`notchHeight` are in the same point coordinate space as `screenWidth`/`screenHeight` (top-left origin within the frame, i.e. `notchX` is measured from the screen's left edge). On a Mac with no notch, `hasNotch` is `false` and the notch fields are `0`.

## Run standalone

```sh
swift build
.build/debug/murmur-notch-geometry
```
