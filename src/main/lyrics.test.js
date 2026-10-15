const test = require("node:test");
const assert = require("node:assert/strict");
const { candidateScore, normalizeName, parseSyncedLyrics } = require("./lyrics");

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
