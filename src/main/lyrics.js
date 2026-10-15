const cache = new Map();
const requestHeaders = { "User-Agent": "LyricsIslandWindows/0.1.0" };

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

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\b(?:feat(?:uring)?|ft)\.?[^)]*\)/gi, " ")
    .replace(/\b(?:feat(?:uring)?|ft)\.?\s+.*$/i, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\by\b/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenSimilarity(left, right) {
  const leftTokens = new Set(normalizeName(left).split(/\s+/).filter(Boolean));
  const rightTokens = new Set(normalizeName(right).split(/\s+/).filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * shared) / (leftTokens.size + rightTokens.size);
}

function candidateScore(candidate, playback) {
  const titleScore = tokenSimilarity(candidate.trackName, playback.track);
  const artistScore = tokenSimilarity(candidate.artistName, playback.artist);
  const albumScore = tokenSimilarity(candidate.albumName, playback.album);
  const candidateDurationMs = Number(candidate.duration) * 1000;
  const durationDeltaMs = Number.isFinite(candidateDurationMs) && candidateDurationMs > 0
    ? Math.abs(candidateDurationMs - (Number(playback.durationMs) || 0))
    : Infinity;
  const durationScore = Number.isFinite(durationDeltaMs)
    ? Math.max(0, 30 - (durationDeltaMs / 1000) * 3)
    : 0;

  // Reject title collisions unless another strong metadata signal confirms the match.
  const supportedByMetadata = artistScore >= 0.25 || albumScore >= 0.35;
  if (titleScore < 0.6 || !supportedByMetadata) return -1;

  return titleScore * 40 + artistScore * 36 + albumScore * 16 + durationScore + (candidate.syncedLyrics ? 15 : 0);
}

async function requestJson(url) {
  try {
    const response = await fetch(url, {
      headers: requestHeaders,
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function findBestSearchMatch(playback) {
  const structuredParams = new URLSearchParams({
    track_name: playback.track,
    artist_name: playback.artist
  });
  const structuredResults = await requestJson(`https://lrclib.net/api/search?${structuredParams}`);
  const candidates = Array.isArray(structuredResults) ? [...structuredResults] : [];
  const structuredMatch = rankCandidates(candidates, playback);
  if (structuredMatch?.syncedLyrics) return structuredMatch;

  // Spotify's title often includes a featuring credit that LRCLIB stores in
  // the artist field (or vice versa). A broad query can find those records.
  // Keep Spotify's original title in the query too: normalization can remove
  // featured-artist text that LRCLIB uses to index alternate track versions.
  const queries = [
    `${playback.track || ""} ${playback.artist || ""}`.trim(),
    `${normalizeName(playback.track)} ${playback.artist || ""}`.trim(),
    playback.track || ""
  ].filter((query, index, all) => query && all.indexOf(query) === index);
  for (const query of queries) {
    const broadParams = new URLSearchParams({ q: query });
    const broadResults = await requestJson(`https://lrclib.net/api/search?${broadParams}`);
    if (Array.isArray(broadResults)) candidates.push(...broadResults);
    const bestMatch = rankCandidates(candidates, playback);
    if (bestMatch?.syncedLyrics) return bestMatch;
  }

  return rankCandidates(candidates, playback);
}

function rankCandidates(candidates, playback) {
  const seen = new Set();
  return candidates
    .filter((candidate) => {
      const identity = candidate.id ?? [candidate.trackName, candidate.artistName, candidate.albumName, candidate.duration].join("|");
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map((candidate) => ({ candidate, score: candidateScore(candidate, playback) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.candidate || null;
}

async function fetchLyrics(playback) {
  const { track, artist, album, durationMs } = playback;
  const key = normalizeKey(track, artist, album, durationMs);
  if (cache.has(key)) return cache.get(key);

  const exactParams = new URLSearchParams({
    track_name: track,
    artist_name: artist,
    album_name: album || "",
    duration: String(Math.round((durationMs || 0) / 1000))
  });
  let payload = await requestJson(`https://lrclib.net/api/get?${exactParams}`);

  if (!payload?.syncedLyrics) {
    const searchMatch = await findBestSearchMatch(playback);
    // Keep a synced match over an exact plain-text-only result.
    if (searchMatch?.syncedLyrics || !payload?.plainLyrics) payload = searchMatch || payload;
  }

  const result = {
    synced: parseSyncedLyrics(payload?.syncedLyrics),
    plain: payload?.plainLyrics || "",
    source: payload ? "LRCLIB" : "none"
  };

  if (result.synced.length || result.plain) cache.set(key, result);
  return result;
}

module.exports = {
  fetchLyrics,
  parseSyncedLyrics,
  candidateScore,
  normalizeName,
  tokenSimilarity
};
