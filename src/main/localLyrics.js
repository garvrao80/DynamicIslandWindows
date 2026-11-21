const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { parseSyncedLyrics } = require("./lyrics");

function overridePath(folder, uri) {
  return path.join(folder, createHash("sha256").update(uri).digest("hex") + ".lrc");
}

async function loadFile(file) {
  if (path.extname(file).toLowerCase() !== ".lrc") throw new Error("Choose a .lrc file.");
  const handle = await fs.open(file, "r");
  let raw;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 256 * 1024) throw new Error("Choose a .lrc file smaller than 256 KB.");
    raw = await handle.readFile("utf8");
  } finally { await handle.close(); }
  const synced = parseSyncedLyrics(raw);
  if (!synced.length || synced.length > 3000) throw new Error("Choose a UTF-8 LRC with 1–3000 timestamped lines.");
  return { raw, lyrics: { synced, plain: "", source: "Local LRC" } };
}

async function storeOverride(folder, uri, raw) {
  await fs.mkdir(folder, { recursive: true });
  const file = overridePath(folder, uri);
  const tmp = file + "." + randomUUID();
  try {
    await fs.writeFile(tmp, raw, "utf8");
    await fs.rename(tmp, file);
  } finally { await fs.rm(tmp, { force: true }); }
}

async function readOverride(folder, uri) {
  try { return (await loadFile(overridePath(folder, uri))).lyrics; }
  catch { return null; } // Missing or damaged copy: fall back to the provider.
}

const removeOverride = (folder, uri) => fs.rm(overridePath(folder, uri), { force: true });
module.exports = { loadFile, storeOverride, readOverride, removeOverride };
