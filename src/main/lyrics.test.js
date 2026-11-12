const test = require("node:test");
const assert = require("node:assert/strict");
const { candidateScore, normalizeName, parseRetryAfterMs, parseSyncedLyrics } = require("./lyrics");
const { fetchLyrics } = require("./lyrics");

test("Get Up chooses timed lyrics over an exact-album plain result and reuses them", async (t) => {
  const playback = { track: "Get Up", artist: "Lithe", album: "Get Up", durationMs: 118762 };
  const plain = { id: 1, trackName: "Get Up", artistName: "Lithe", albumName: "Get Up", duration: 119, plainLyrics: "Plain text", syncedLyrics: null };
  const timed = { ...plain, id: 2, albumName: "Euphoria", duration: 118.762, syncedLyrics: "[00:01.00]First\n[00:05.00]Second" };
  const invalid = { ...plain, id: 3, duration: 1, syncedLyrics: "[00:00.00]Entire song" };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls += 1;
    return { ok: true, status: 200, json: async () => String(url).includes("/api/get?") ? plain : [plain, invalid, timed] };
  });
  const lyrics = await fetchLyrics(playback);
  assert.deepEqual(lyrics.synced.map((line) => line.timeMs), [1000, 5000]);
  assert.equal(calls, 2);
  assert.deepEqual(await fetchLyrics(playback), lyrics);
  assert.equal(calls, 2);
});

test("plain-text misses are retried so newly available timed lyrics can be found", async (t) => {
  const playback = { track: "Retry fixture", artist: "Test Artist", album: "Fixture", durationMs: 60000 };
  const plain = { trackName: playback.track, artistName: playback.artist, albumName: playback.album, duration: 60, plainLyrics: "Plain", syncedLyrics: null };
  let syncedAvailable = false;
  t.mock.method(globalThis, "fetch", async (url) => ({
    ok: true, status: 200,
    json: async () => String(url).includes("/api/get?")
      ? { ...plain, syncedLyrics: syncedAvailable ? "[00:01.00]First\n[00:10.00]Next" : null }
      : []
  }));
  assert.equal((await fetchLyrics(playback)).synced.length, 0);
  syncedAvailable = true;
  assert.equal((await fetchLyrics(playback)).synced.length, 2);
});

test("normalizes featured artists and punctuation for metadata comparison", () => {
  assert.equal(normalizeName("Solar Eclipse (feat. Don Toliver)"), "solar eclipse");
  assert.equal(normalizeName("Drake y Don Toliver"), "drake and don toliver");
});

test("parses LRC timestamps into sorted millisecond lines", () => {
  assert.deepEqual(parseSyncedLyrics("[00:02.5]Second\nnot timed\n[00:01.25]First"), [
    { timeMs: 1250, text: "First" },
    { timeMs: 2500, text: "Second" }
  ]);
});

test("uses a bounded cooldown when LRCLIB rate-limits requests", () => {
  assert.equal(parseRetryAfterMs("90"), 90_000);
  assert.equal(parseRetryAfterMs(null), 60_000);
  assert.equal(parseRetryAfterMs("5"), 30_000);
  assert.equal(parseRetryAfterMs("900"), 300_000);
});

test("accepts a close Solar Eclipse metadata match and rejects a title collision", () => {
  const playback = {
    track: "Solar Eclipse (feat. Don Toliver)",
    artist: "Drake, Don Toliver",
    album: "HABIBTI (FOMO)",
    durationMs: 218388
  };
  const correct = {
    trackName: "Solar Eclipse",
    artistName: "Drake y Don Toliver",
    albumName: "HABIBTI (FOMO)",
    duration: 218,
    syncedLyrics: "[00:01.00]timed"
  };
  const collision = {
    trackName: "Solar Eclipse",
    artistName: "A Different Artist",
    albumName: "A Different Album",
    duration: 218,
    syncedLyrics: "[00:01.00]timed"
  };

  assert.ok(candidateScore(correct, playback) > 0);
  assert.equal(candidateScore(collision, playback), -1);
});

test("matches LRCLIB's normalized Solar Eclipse title and artist variant", () => {
  const playback = {
    track: "Solar Eclipse (feat. Don Toliver)",
    artist: "Drake, Don Toliver",
    album: "HABIBTI (FOMO)",
    durationMs: 218388
  };
  const candidate = {
    trackName: "Solar Eclipse",
    artistName: "Drake y Don Toliver",
    albumName: "HABIBTI (FOMO)",
    duration: 218,
    syncedLyrics: "[00:01.00]timed"
  };

  assert.ok(candidateScore(candidate, playback) > 100);
});
