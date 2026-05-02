import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const lockPath = path.join(scriptDir, "..", "apps", "web", ".next", "dev", "lock");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLockPids() {
  try {
    const output = execFileSync("lsof", ["-t", lockPath], { encoding: "utf8" });
    return [
      ...new Set(
        output
          .split(/\s+/)
          .map((part) => Number(part.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      ),
    ];
  } catch {
    return [];
  }
}

if (!existsSync(lockPath)) {
  process.exit(0);
}

const pids = getLockPids();

if (pids.length === 0) {
  try {
    unlinkSync(lockPath);
    console.log(`[dev:web] Removed stale Next lock at ${lockPath}`);
  } catch {
    // Ignore races.
  }
  process.exit(0);
}

for (const pid of pids) {
  if (!isAlive(pid)) {
    continue;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`[dev:web] Stopping existing Next dev process (pid ${pid})`);
  } catch {
    // Ignore permission/process races.
  }
}

for (const pid of pids) {
  for (let attempts = 0; attempts < 20 && isAlive(pid); attempts += 1) {
    await wait(100);
  }

  if (isAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`[dev:web] Force killed Next dev process (pid ${pid})`);
    } catch {
      // Ignore permission/process races.
    }
  }
}

if (existsSync(lockPath)) {
  try {
    unlinkSync(lockPath);
  } catch {
    // Ignore races.
  }
}
