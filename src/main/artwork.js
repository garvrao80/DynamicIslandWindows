// Windows media sessions sometimes publish a title with no thumbnail at all.
// Resolve the same recording/edition; do not substitute artwork from a deluxe
// edition or an unrelated song with the same title.
const norm = s => String(s || "").normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu," ").trim();

function matchCover(song, results) {
  const artist = norm(song.artist), primary = norm(song.artist?.split(/[,;]/)[0]);
  if (!artist || !norm(song.track) || !Array.isArray(results)) return "";
  for (const r of results) {
    if (![artist, primary].includes(norm(r?.artistName)) || norm(r?.trackName) !== norm(song.track)) continue;
    if (song.album && norm(r.collectionName) !== norm(song.album)) continue;
    try {
      const url = new URL(r.artworkUrl100);
      if (url.protocol !== "https:" || !url.hostname.endsWith(".mzstatic.com") || url.username || url.password || url.port) continue;
      url.pathname = url.pathname.replace(/\/100x100bb\./, "/600x600bb.");
      return url.href;
    } catch { /* ignore missing or invalid artwork */ }
  }
  return "";
}

function createCoverLookup(request = fetch) {
  const cache = new Map(), pending = new Map();
  let cooldown = 0;
  async function lookup(song) {
    let cover = "";
    try {
      const query = new URLSearchParams({ term: [song.artist, song.track, song.album].filter(Boolean).join(" "),
        entity: "song", limit: "12" });
      const res = await request("https://itunes.apple.com/search?" + query, {signal: AbortSignal.timeout(5000)});
      if (res.status === 429) cooldown = Date.now()+Math.min(3600,Math.max(60,Number(res.headers.get("retry-after"))||60))*1000;
      if (res.ok) cover = matchCover(song,(await res.json()).results);
    } catch { /* Keep playback working offline. Retry misses later. */ }
    cache.set(song.uri, {cover, expires: Date.now() + (cover ? 86400000 : 60000)});
    if (cache.size > 128) cache.delete(cache.keys().next().value);
    return cover;
  }
  return function find(song) {
    const saved = cache.get(song.uri);
    if (saved && saved.expires > Date.now()) return Promise.resolve(saved.cover);
    if (Date.now() < cooldown) return Promise.resolve("");
    if (!pending.has(song.uri)) pending.set(song.uri,lookup(song).finally(()=>pending.delete(song.uri)));
    return pending.get(song.uri);
  };
}
module.exports = { matchCover, createCoverLookup };
