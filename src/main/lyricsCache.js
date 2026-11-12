const fs = require("node:fs");
const path = require("node:path");

const cacheVersion = 1;
const cacheLimit = 50;
const cacheTtlMs = 90 * 24 * 60 * 60 * 1000;

function isValidLyrics(lyrics) {
  if (!lyrics || typeof lyrics !== "object") return false;
  if (!Array.isArray(lyrics.synced) || typeof lyrics.plain !== "string") return false;
  if (lyrics.synced.length > 10_000 || lyrics.plain.length > 1_000_000) return false;

  return lyrics.synced.every((line) =>
    line && Number.isFinite(line.timeMs) && line.timeMs >= 0 &&
    typeof line.text === "string" && line.text.length <= 2000
  ) && (lyrics.synced.length > 0 || lyrics.plain.length > 0);
}

function readLyricsCache(filePath, now = Date.now()) {
  try {
    const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (document.version !== cacheVersion || !Array.isArray(document.entries)) return new Map();

    const validEntries = document.entries
      .filter((entry) =>
        entry && typeof entry.key === "string" && entry.key.length <= 2048 &&
        Number.isFinite(entry.cachedAt) && entry.cachedAt <= now &&
        now - entry.cachedAt <= cacheTtlMs && isValidLyrics(entry.lyrics)
      )
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .slice(0, cacheLimit);

    return new Map(validEntries.map((entry) => [entry.key, {
      lyrics: { ...entry.lyrics, source: "LRCLIB (cached)" },
      cachedAt: entry.cachedAt
    }]));
  } catch {
    return new Map();
  }
}

function writeLyricsCache(filePath, cache) {
  const entries = [...cache.entries()]
    .map(([key, entry]) => ({ key, cachedAt: entry.cachedAt, lyrics: entry.lyrics }))
    .filter((entry) => typeof entry.key === "string" && isValidLyrics(entry.lyrics))
    .sort((a, b) => b.cachedAt - a.cachedAt)
    .slice(0, cacheLimit);
  const temporaryPath = `${filePath}.tmp`;

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: cacheVersion, entries }), "utf8");
    fs.renameSync(temporaryPath, filePath);
    return true;
  } catch {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Keep cache write failures non-fatal to playback and lyric display.
    }
    return false;
  }
}

module.exports = { readLyricsCache, writeLyricsCache };
