const island = document.getElementById("island");
const art = document.getElementById("art");
const track = document.getElementById("track");
const lyric = document.getElementById("lyric");
const expandedTrack = document.getElementById("expandedTrack");
const expandedArtist = document.getElementById("expandedArtist");
const lyricsList = document.getElementById("lyricsList");
const statusNode = document.getElementById("status");
const clientId = document.getElementById("clientId");
const demoMode = document.getElementById("demoMode");
const offset = document.getElementById("offset");
const settings = document.getElementById("settings");
const connect = document.getElementById("connect");
const dashboard = document.getElementById("dashboard");
const play = document.getElementById("play");

let expanded = false;
let currentState = null;
let expandTimer = null;

function currentLyric(state) {
  const lines = state.lyrics?.synced || [];
  const index = state.activeLyricIndex;

  if (index >= 0 && lines[index]) return lines[index].text;
  if (state.lyrics?.plain) return state.lyrics.plain.split(/\r?\n/)[0];
  return state.status || "Ready";
}

function renderLyrics(state) {
  const lines = state.lyrics?.synced || [];
  const index = Math.max(0, state.activeLyricIndex);
  const start = Math.max(0, index - 2);
  const visible = lines.slice(start, start + 5);

  lyricsList.innerHTML = "";

  if (!visible.length) {
    const row = document.createElement("div");
    row.className = "lyric-line active";
    row.textContent = state.lyrics?.plain || "No synced lyrics yet";
    lyricsList.appendChild(row);
    return;
  }

  visible.forEach((line, visibleIndex) => {
    const absoluteIndex = start + visibleIndex;
    const row = document.createElement("div");
    row.className = absoluteIndex === state.activeLyricIndex ? "lyric-line active" : "lyric-line";
    row.textContent = line.text;
    lyricsList.appendChild(row);
  });
}

function render(state) {
  currentState = state;
  const playback = state.playback || {};
  const title = playback.track || "Lyrics Island";
  const artist = playback.artist || "Windows floating lyrics";

  track.textContent = title;
  lyric.textContent = currentLyric(state);
  expandedTrack.textContent = title;
  expandedArtist.textContent = artist;
  statusNode.textContent = `${state.status || "Ready"} - ${state.lyrics?.source || "none"}`;
  play.textContent = playback.isPlaying ? "||" : ">";

  if (playback.artworkUrl) {
    art.style.backgroundImage = `url("${playback.artworkUrl}")`;
  } else {
    art.style.backgroundImage = "";
  }

  clientId.value = state.config?.spotifyClientId || "";
  demoMode.checked = Boolean(state.config?.demoMode);
  offset.value = String(state.config?.lyricOffsetMs || 0);
  renderLyrics(state);
}

function setExpanded(nextExpanded) {
  clearTimeout(expandTimer);
  if (expanded === nextExpanded) return;

  expanded = nextExpanded;

  if (expanded) {
    window.lyricsIsland.setExpanded(true);
    expandTimer = setTimeout(() => {
      island.classList.add("expanded-mode");
    }, 70);
    return;
  }

  island.classList.remove("expanded-mode");
  window.lyricsIsland.setExpanded(false);
}

island.addEventListener("dblclick", () => setExpanded(!expanded));
island.addEventListener("mouseenter", () => {
  if (!expanded) setExpanded(true);
});

document.getElementById("collapse").addEventListener("click", () => setExpanded(false));
document.getElementById("previous").addEventListener("click", () => window.lyricsIsland.playback("previous"));
play.addEventListener("click", () => window.lyricsIsland.playback(currentState?.playback?.isPlaying ? "pause" : "play"));
document.getElementById("next").addEventListener("click", () => window.lyricsIsland.playback("next"));
dashboard.addEventListener("click", () => window.lyricsIsland.openSpotifyDashboard());

settings.addEventListener("submit", async (event) => {
  event.preventDefault();
  await window.lyricsIsland.saveConfig({
    spotifyClientId: clientId.value.trim(),
    demoMode: demoMode.checked,
    lyricOffsetMs: Number(offset.value || 0)
  });
});

connect.addEventListener("click", async () => {
  statusNode.textContent = "Opening Spotify sign in...";

  if (!clientId.value.trim()) {
    statusNode.textContent = "Paste your Spotify Client ID first.";
    return;
  }

  await window.lyricsIsland.saveConfig({
    spotifyClientId: clientId.value.trim(),
    demoMode: false,
    lyricOffsetMs: Number(offset.value || 0)
  });

  try {
    await window.lyricsIsland.connectSpotify();
  } catch (error) {
    statusNode.textContent = error.message || "Spotify connection failed.";
  }
});

window.lyricsIsland.onState(render);
window.lyricsIsland.getState().then(render);
