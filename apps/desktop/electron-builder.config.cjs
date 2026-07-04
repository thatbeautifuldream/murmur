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
  mac: {
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    category: "public.app-category.developer-tools",
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
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    category: "Development",
  },
};
