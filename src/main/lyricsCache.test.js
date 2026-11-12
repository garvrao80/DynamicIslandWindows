const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readLyricsCache, writeLyricsCache } = require("./lyricsCache");

test("persists synced lyrics for reuse after an app restart", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lyrics-cache-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, "lyrics-cache.json");
  const now = Date.now();
  const lyrics = {
    synced: [{ timeMs: 1250, text: "A timed line" }],
    plain: "A timed line",
    source: "LRCLIB"
  };

  assert.equal(writeLyricsCache(cachePath, new Map([["spotify:track:test", { lyrics, cachedAt: now }]])), true);
  const updatedLyrics = {
    synced: [{ timeMs: 2500, text: "An updated timed line" }],
    plain: "An updated timed line",
    source: "LRCLIB"
  };
  assert.equal(writeLyricsCache(cachePath, new Map([["spotify:track:test", {
    lyrics: updatedLyrics,
    cachedAt: now + 1
  }]])), true);
  const loaded = readLyricsCache(cachePath, now + 1);

  assert.deepEqual(loaded.get("spotify:track:test").lyrics, {
    ...updatedLyrics,
    source: "LRCLIB (cached)"
  });
});

test("ignores expired or malformed persisted lyric entries", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lyrics-cache-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cachePath = path.join(directory, "lyrics-cache.json");
  fs.writeFileSync(cachePath, JSON.stringify({
    version: 1,
    entries: [
      { key: "expired", cachedAt: 0, lyrics: { synced: [{ timeMs: 0, text: "old" }], plain: "old" } },
      { key: "invalid", cachedAt: Date.now(), lyrics: { synced: "not-lines", plain: "" } }
    ]
  }));

  assert.equal(readLyricsCache(cachePath).size, 0);
});
