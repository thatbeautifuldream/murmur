const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/** electron-builder afterPack hook. electron-builder skips its own code signing
 *  for these releases, but Apple Silicon SIGKILLs any Mach-O without a valid
 *  signature on launch. Sign the bundled Swift helper, every native .node addon,
 *  then the whole app. Uses MURMUR_SIGN_IDENTITY (an Apple Development cert hash)
 *  when set — a stable, cert-based signature so macOS TCC grants (Accessibility,
 *  mic) survive rebuilds — otherwise falls back to ad-hoc (`-`). macOS only. */
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const identity = process.env.MURMUR_SIGN_IDENTITY || "-";
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  const resources = path.join(appPath, "Contents", "Resources");
  const entitlements = path.join(__dirname, "..", "build", "entitlements.mac.plist");

  const sign = (target, { app } = {}) => {
    const args = ["--force", "--sign", identity, "--timestamp=none"];
    // The app is signed --deep so the nested Electron/Squirrel frameworks are
    // re-sealed consistently with the outer bundle; hardened runtime +
    // entitlements apply to the main executable.
    if (app) {
      args.push("--deep", "--options", "runtime", "--entitlements", entitlements);
    }
    args.push(target);
    execFileSync("codesign", args, { stdio: "inherit" });
  };

  const findNodeAddons = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...findNodeAddons(full));
      else if (entry.name.endsWith(".node")) out.push(full);
    }
    return out;
  };

  // Sign nested loose binaries first, then the bundle last so its seal covers them.
  sign(path.join(resources, "murmur-speechd", "murmur-speechd"));
  const unpacked = path.join(resources, "app.asar.unpacked");
  if (fs.existsSync(unpacked)) {
    for (const addon of findNodeAddons(unpacked)) sign(addon);
  }
  sign(appPath, { app: true });
};
