const cache = new Map();

function parseSyncedLyrics(raw) {
  if (!raw) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
      if (!match) return null;

      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = Number((match[3] || "0").padEnd(3, "0"));

      return {
        timeMs: minutes * 60_000 + seconds * 1000 + fraction,
        text: match[4].trim()
      };
    })
    .filter((line) => line && line.text)
    .sort((a, b) => a.timeMs - b.timeMs);
}

function normalizeKey(track, artist, album, durationMs) {
  return [track, artist, album, durationMs].map((item) => String(item || "").toLowerCase()).join("|");
}

async function fetchLyrics({ track, artist, album, durationMs }) {
  const key = normalizeKey(track, artist, album, durationMs);
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    track_name: track,
    artist_name: artist,
    album_name: album || "",
    duration: String(Math.round((durationMs || 0) / 1000))
  });

  let payload = null;

  try {
    const exact = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { "User-Agent": "LyricsIslandWindows/0.1.0" }
    });

    if (exact.ok) {
      payload = await exact.json();
    }
  } catch {
    payload = null;
  }

  if (!payload) {
    const searchParams = new URLSearchParams({
      track_name: track,
      artist_name: artist
    });

    const response = await fetch(`https://lrclib.net/api/search?${searchParams}`, {
      headers: { "User-Agent": "LyricsIslandWindows/0.1.0" }
    });
    const results = response.ok ? await response.json() : [];
    payload = Array.isArray(results) ? results[0] : null;
  }

  const result = {
    synced: parseSyncedLyrics(payload?.syncedLyrics),
    plain: payload?.plainLyrics || "",
    source: payload ? "LRCLIB" : "none"
  };

  cache.set(key, result);
  return result;
}

module.exports = {
  fetchLyrics,
  parseSyncedLyrics
};
