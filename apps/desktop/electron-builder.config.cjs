/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.murmur.app",
  productName: "Murmur",
  directories: {
    output: "release",
    buildResources: "build",
  },
  files: [
    "dist-electron/**/*",
    "package.json",
    {
      from: "../web/dist",
      to: "renderer",
      filter: ["**/*"],
    },
  ],
  asar: true,
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
    // Unsigned releases: no code signing, no notarization.
    identity: null,
    // Bundles the release build of native/speechd so the packaged app is
    // self-contained — build it first with "bun run speechd:build:release".
    extraResources: [
      {
        from: "../../native/speechd/.build/release/murmur-speechd",
        to: "murmur-speechd/murmur-speechd",
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
