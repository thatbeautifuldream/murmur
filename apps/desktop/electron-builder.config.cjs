/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.murmur.app",
  productName: "Murmur",
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: ["dist-electron/**/*", "package.json"],
  afterPack: "./scripts/adhoc-sign.cjs",
  asar: true,
  // uiohook-napi ships a prebuilt .node; a native binary can't be dlopen'd
  // from inside the asar archive, so it must live on disk as a real file.
  asarUnpack: ["**/*.node"],
  // Auto-update feed. electron-builder writes app-update.yml from this and the
  // release script uploads artifacts here with `--publish`.
  publish: {
    provider: "github",
    owner: "thatbeautifuldream",
    repo: "murmur",
  },
  mac: {
    // zip is what electron-updater consumes on macOS; dmg is the download for
    // new users. Both must ship for auto-update to work.
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ],
    category: "public.app-category.developer-tools",
    darkModeSupport: true,
    // macOS force-kills any process that touches the microphone without a
    // usage-description string in its Info.plist (a TCC abort). The app calls
    // systemPreferences.askForMediaAccess("microphone") at startup, so without
    // these keys the packaged build crashes on launch. Input Monitoring is for
    // the global Option-key hook (uiohook-napi).
    extendInfo: {
      NSMicrophoneUsageDescription:
        "Murmur uses the microphone to transcribe your dictation.",
      NSInputMonitoringUsageDescription:
        "Murmur listens for the Option key to start and stop dictation.",
    },
    // No Developer ID / notarization. electron-builder's own signing is skipped
    // for unsigned releases, so ad-hoc signing is done in the afterPack hook
    // below — on Apple Silicon the kernel SIGKILLs any Mach-O (the app bundle,
    // the .node addon, the bundled Swift helper) lacking a valid signature.
    identity: null,
    // Bundles the release build of native/speechd so the packaged app is
    // self-contained — build it first with "bun run speechd:build:release".
    extraResources: [
      {
        from: "../../native/speechd/.build/release/murmur-speechd",
        to: "murmur-speechd/murmur-speechd",
      },
      // The renderer is read from process.resourcesPath/renderer (see
      // app-window.ts), i.e. Contents/Resources/renderer — so it must ship as
      // an extra resource, not inside the asar.
      {
        from: "../web/dist",
        to: "renderer",
        filter: ["**/*"],
      },
    ],
    binaries: ["Contents/Resources/murmur-speechd/murmur-speechd"],
  },
  dmg: {
    contents: [
      { x: 150, y: 200, type: "file" },
      { x: 390, y: 200, type: "link", path: "/Applications" },
    ],
  },
};
