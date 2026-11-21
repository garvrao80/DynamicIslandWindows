const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { createHash } = require("node:crypto");

// Only the bundled program is executed. Requests travel separately as JSON on stdin.
const program = readFileSync(path.join(__dirname, "windowsMedia.ps1"), "utf8");
let worker;
let queue = Promise.resolve();

function startWorker() {
  const exe = path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const child = spawn(exe, ["-NoProfile", "-NonInteractive", "-Command", program], {
    windowsHide: true, stdio: ["pipe", "pipe", "ignore"]
  });
  const instance = { child, pending: null };
  const fail = () => {
    if (worker === instance) worker = null;
    instance.pending?.reject(new Error("Windows media session unavailable"));
  };
  child.on("error", fail);
  child.on("exit", fail);
  child.stdin.on("error", fail);
  readline.createInterface({ input: child.stdout }).on("line", line => {
    try {
      const data = JSON.parse(line);
      if (data.error) throw new Error(data.error);
      instance.pending?.resolve(data);
    } catch (error) {
      instance.pending?.reject(error);
    }
  });
  return instance;
}

function requestWindowsMedia(action, positionMs) {
  const result = queue.then(async () => {
    const instance = worker ||= startWorker();
    let timeout;
    try {
      return await new Promise((resolve, reject) => {
        instance.pending = { resolve, reject };
        timeout = setTimeout(() => {
          instance.child.kill();
          if (worker === instance) worker = null;
          reject(new Error("Windows media session timed out"));
        }, 10000);
        instance.child.stdin.write(JSON.stringify({ action, positionMs }) + "\n");
      });
    } finally {
      clearTimeout(timeout);
      instance.pending = null;
    }
  });
  queue = result.catch(() => {});
  return result;
}

async function getWindowsPlayback() {
  const sample = await requestWindowsMedia("read");
  if (sample.empty) return sample;
  const identity = JSON.stringify([sample.track, sample.artist, sample.album]);
  return { ...sample, uri: "windows:" + createHash("sha256").update(identity).digest("hex") };
}

function closeWindowsMedia() {
  worker?.child.kill();
  worker = null;
}

module.exports = { getWindowsPlayback, requestWindowsMedia, closeWindowsMedia };
