import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function commandPath(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

const pathParts = [process.env.PATH ?? ""];
let shimDir;

if (!commandPath("python")) {
  const python3 = commandPath("python3");
  if (!python3) {
    throw new Error("electron-builder needs python for DMG cleanup; install python3 first.");
  }

  shimDir = mkdtempSync(join(tmpdir(), "murmur-package-"));
  symlinkSync(python3, join(shimDir, "python"));
  pathParts.unshift(shimDir);
}

try {
  const result = spawnSync(
    "bun",
    ["x", "electron-builder", "--mac", "--config", "electron-builder.config.cjs"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: "false",
        PATH: pathParts.join(":"),
      },
    },
  );

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} finally {
  if (shimDir && existsSync(shimDir)) {
    rmSync(shimDir, { recursive: true, force: true });
  }
}
