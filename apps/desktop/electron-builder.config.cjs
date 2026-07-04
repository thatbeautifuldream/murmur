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
  },
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  linux: {
    target: [{ target: "AppImage", arch: ["x64"] }],
    category: "Development",
  },
};
