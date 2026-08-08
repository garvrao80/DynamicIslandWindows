const island = document.getElementById("island");
const art = document.getElementById("art");
const expandedArt = document.getElementById("expandedArt");
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
const expandedPlay = document.getElementById("expandedPlay");

let expanded = false;
let currentState = null;
let expandTimer = null;
let lastLyricsKey = "";

const icons = {
  previous:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M15 6l-8 6 8 6V6z"></path></svg>',
  next:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M9 6l8 6-8 6V6z"></path></svg>',
  play:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7L8 5z"></path></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"></path></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>'
};

function setIcon(button, name) {
  if (button) button.innerHTML = icons[name] || "";
}

function playbackAction() {
  return currentState?.playback?.isPlaying ? "pause" : "play";
}

function applyArtwork(node, artworkUrl) {
  if (!node) return;
  node.style.backgroundImage = artworkUrl ? `url("${artworkUrl}")` : "";
}

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
  const lyricsKey = lines.map((line) => `${line.timeMs}:${line.text}`).join("|") || state.lyrics?.plain || "empty";

  if (lyricsKey !== lastLyricsKey) {
    lastLyricsKey = lyricsKey;
    lyricsList.innerHTML = "";

    if (!lines.length) {
      const row = document.createElement("div");
      row.className = "lyric-line active";
      row.textContent = state.lyrics?.plain || "No synced lyrics yet";
      lyricsList.appendChild(row);
    } else {
      lines.forEach((line) => {
        const row = document.createElement("div");
        row.className = "lyric-line";
        row.textContent = line.text;
        lyricsList.appendChild(row);
      });
    }
  }

  Array.from(lyricsList.children).forEach((row, rowIndex) => {
    row.classList.toggle("active", lines.length ? rowIndex === state.activeLyricIndex : true);
    row.classList.toggle("near", lines.length && Math.abs(rowIndex - state.activeLyricIndex) === 1);
  });

  const lineHeight = 36;
  const centerOffset = 94;
  lyricsList.style.transform = lines.length ? `translateY(${centerOffset - index * lineHeight}px)` : "translateY(70px)";
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
  setIcon(play, playback.isPlaying ? "pause" : "play");
  setIcon(expandedPlay, playback.isPlaying ? "pause" : "play");

  applyArtwork(art, playback.artworkUrl);
  applyArtwork(expandedArt, playback.artworkUrl);

  if (document.activeElement !== clientId) clientId.value = state.config?.spotifyClientId || "";
  if (document.activeElement !== demoMode) demoMode.checked = Boolean(state.config?.demoMode);
  if (document.activeElement !== offset) offset.value = String(state.config?.lyricOffsetMs || 0);
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
document.getElementById("expandedPrevious").addEventListener("click", () => window.lyricsIsland.playback("previous"));
play.addEventListener("click", () => window.lyricsIsland.playback(playbackAction()));
expandedPlay.addEventListener("click", () => window.lyricsIsland.playback(playbackAction()));
document.getElementById("next").addEventListener("click", () => window.lyricsIsland.playback("next"));
document.getElementById("expandedNext").addEventListener("click", () => window.lyricsIsland.playback("next"));
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

setIcon(document.getElementById("previous"), "previous");
setIcon(document.getElementById("expandedPrevious"), "previous");
setIcon(document.getElementById("next"), "next");
setIcon(document.getElementById("expandedNext"), "next");
setIcon(document.getElementById("collapse"), "close");
setIcon(play, "pause");
setIcon(expandedPlay, "pause");
