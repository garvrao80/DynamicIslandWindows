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
const opacityInput = document.getElementById("opacity");
const settings = document.getElementById("settings");
const settingsToggle = document.getElementById("settingsToggle");
const resizeHandle = document.getElementById("resizeHandle");
const connect = document.getElementById("connect");
const dashboard = document.getElementById("dashboard");
const play = document.getElementById("play");
const expandedPlay = document.getElementById("expandedPlay");
const compact = document.querySelector(".compact");
const progressElapsed = document.getElementById("progressElapsed");
const progressDuration = document.getElementById("progressDuration");
const progressFill = document.getElementById("progressFill");
const progressTrack = document.querySelector(".progress-track");
const lyricsWindow = document.querySelector(".lyrics-window");

let expanded = false;
let currentState = null;
let expandTimer = null;
let lastLyricsKey = "";
let playbackSampledAt = 0;
let collapseFallbackTimer = null;
let resizeSession = null;
const lyricLeadGuardMs = 250;

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
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1A1.7 1.7 0 0 0 21 10h0a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>'
  ,
  resize:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7 17 17M7 7h5M7 7v5M17 17h-5M17 17v-5"></path></svg>'
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

function applyArtworkGlow(artworkUrl) {
  island.style.setProperty("--artwork-url", artworkUrl ? `url("${artworkUrl}")` : "none");
}

function formatTime(ms = 0) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderProgress(playback = {}) {
  const progressMs = Math.max(0, playback.progressMs || 0);
  const durationMs = Math.max(0, playback.durationMs || 0);
  const percent = durationMs > 0 ? Math.min(100, (progressMs / durationMs) * 100) : 0;

  progressElapsed.textContent = formatTime(progressMs);
  progressDuration.textContent = formatTime(durationMs);
  progressFill.style.width = `${percent}%`;
}

function lyricIndexForProgress(progressMs) {
  const lines = currentState?.lyrics?.synced || [];
  const adjustedProgress =
    progressMs + (Number(currentState?.config?.lyricOffsetMs) || 0) - lyricLeadGuardMs;
  let index = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].timeMs <= adjustedProgress) index = i;
    else break;
  }

  return index;
}

function renderCompactLyric(state) {
  const lyricText = currentLyric(state);
  lyric.textContent = lyricText;
  lyric.title = lyricText;
  lyric.classList.remove("lyric-scroll", "lyric-truncate");
  if (lyricText.length > 28) lyric.classList.add("lyric-scroll");
  else lyric.classList.add("lyric-truncate");
}

function updatePlaybackEstimate() {
  const playback = currentState?.playback;
  if (!playback || playback.empty || !playback.isPlaying || !playback.durationMs || !playbackSampledAt) return;

  const progressMs = Math.min(
    playback.durationMs,
    (playback.progressMs || 0) + (Date.now() - playbackSampledAt)
  );
  const activeLyricIndex = lyricIndexForProgress(progressMs);

  if (activeLyricIndex !== currentState.activeLyricIndex) {
    currentState.activeLyricIndex = activeLyricIndex;
    renderCompactLyric(currentState);
    renderLyrics(currentState);
  }

  renderProgress({ ...playback, progressMs });
}

function seekFromPointer(event) {
  const playback = currentState?.playback;
  if (!playback?.durationMs) return;

  const rect = progressTrack.getBoundingClientRect();
  const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const positionMs = Math.round(playback.durationMs * percent);

  playback.progressMs = positionMs;
  playbackSampledAt = Date.now();
  currentState.activeLyricIndex = lyricIndexForProgress(positionMs);
  renderProgress(playback);
  renderLyrics(currentState);
  window.lyricsIsland.seek(positionMs);
}

function updatePlayIcons(isPlaying) {
  setIcon(play, isPlaying ? "pause" : "play");
  setIcon(expandedPlay, isPlaying ? "pause" : "play");
}

function sendPlayback(action) {
  if (action === "play" || action === "pause") {
    const isPlaying = action === "play";
    if (currentState?.playback) currentState.playback.isPlaying = isPlaying;
    playbackSampledAt = Date.now();
    updatePlayIcons(isPlaying);
  }

  window.lyricsIsland.playback(action);
}

function handlePlaybackClick(event, action) {
  event.preventDefault();
  event.stopPropagation();
  sendPlayback(action);
}

function currentLyric(state) {
  const lines = state.lyrics?.synced || [];
  const index = state.activeLyricIndex;

  if (index >= 0 && lines[index]) return lines[index].text;
  if (state.lyrics?.plain) return state.lyrics.plain.split(/\r?\n/)[0];
  // Keep transport/auth status out of the compact lyric preview. Those
  // messages belong in the expanded status row and should not replace the
  // track context while Spotify is recovering from a temporary 429.
  if (state.status?.startsWith("Spotify API quota exceeded")) return "Spotify API limit reached";
  if (state.status === "Spotify Premium required") return "Spotify Premium required";
  if (state.status === "Spotify cooling down") return "Spotify API cooldown";
  if (state.playback?.track) return "Waiting for lyrics...";
  return state.demoMode ? "Demo mode" : "Waiting for Spotify playback";
}

function positionLyrics() {
  if (!currentState) return;
  const lines = currentState.lyrics?.synced || [];
  const activeLyricIndex = currentState.activeLyricIndex;
  const activeNode = lyricsList.children[Math.max(0, activeLyricIndex)];

  if (lines.length && activeNode) {
    const nodeCenter = activeNode.offsetTop + (activeNode.offsetHeight / 2);
    lyricsList.style.transform = `translateY(${(lyricsWindow.clientHeight / 2) - nodeCenter}px)`;
  } else {
    lyricsList.style.transform = "translateY(90px)";
  }
}

function renderLyrics(state) {
  const lines = state.lyrics?.synced || [];
  const index = Math.max(0, state.activeLyricIndex);
  const trackKey = state.playback?.uri || `${state.playback?.track || "unknown"}|${state.playback?.artist || ""}`;
  const lyricsKey = `${trackKey}::${lines.map((line) => `${line.timeMs}:${line.text}`).join("|") || state.lyrics?.plain || "empty"}`;

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

  positionLyrics();
}

function render(state) {
  currentState = state;
  playbackSampledAt = Date.now();
  const playback = state.playback || {};
  const title = playback.track || "Lyrics Island";
  const artist = playback.artist || "Windows floating lyrics";

  track.textContent = title;
  renderCompactLyric(state);
  expandedTrack.textContent = title;
  expandedArtist.textContent = artist;
  statusNode.textContent = `${state.status || "Ready"} - ${state.lyrics?.source || "none"}`;
  updatePlayIcons(playback.isPlaying);

  applyArtwork(art, playback.artworkUrl);
  applyArtwork(expandedArt, playback.artworkUrl);
  applyArtworkGlow(playback.artworkUrl);

  if (document.activeElement !== clientId) clientId.value = state.config?.spotifyClientId || "";
  if (document.activeElement !== demoMode) demoMode.checked = Boolean(state.config?.demoMode);
  if (document.activeElement !== offset) offset.value = String(state.config?.lyricOffsetMs || 0);
  if (document.activeElement !== opacityInput) {
    const opacityVal = state.config?.opacity !== undefined ? state.config.opacity : 100;
    opacityInput.value = String(opacityVal);
    island.style.opacity = opacityVal / 100;
  }
  renderProgress(playback);
  renderLyrics(state);
}

function setExpanded(nextExpanded) {
  clearTimeout(expandTimer);
  clearTimeout(collapseFallbackTimer);
  if (expanded === nextExpanded) return;
  expanded = nextExpanded;

  if (expanded) {
    // 1. Expand transparent native window instantly
    window.lyricsIsland.setExpanded(true);
    // 2. Add class so CSS can smoothly animate .island size inside the large window
    expandTimer = setTimeout(() => {
      island.classList.add("expanded-mode");
    }, 20);
  } else {
    const shrinkNativeWindow = () => {
      clearTimeout(collapseFallbackTimer);
      island.removeEventListener("transitionend", onCollapseTransitionEnd);
      window.lyricsIsland.setExpanded(false);
    };
    const onCollapseTransitionEnd = (event) => {
      if (event.target === island && event.propertyName === "width") shrinkNativeWindow();
    };

    island.addEventListener("transitionend", onCollapseTransitionEnd);
    island.classList.remove("expanded-mode");
    island.classList.remove("settings-open");
    collapseFallbackTimer = setTimeout(shrinkNativeWindow, 440);
  }
}

compact.addEventListener("dblclick", (event) => {
  if (event.target.closest("button")) return;
  setExpanded(true);
});

document.getElementById("collapse").addEventListener("click", () => setExpanded(false));
resizeHandle.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  resizeSession = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: island.getBoundingClientRect().width,
    startHeight: island.getBoundingClientRect().height
  };
  resizeHandle.setPointerCapture(event.pointerId);
  resizeHandle.classList.add("resizing");
  island.classList.add("is-resizing");
});

resizeHandle.addEventListener("pointermove", (event) => {
  if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
  event.preventDefault();
  window.lyricsIsland.resizeExpanded({
    width: resizeSession.startWidth + event.clientX - resizeSession.startX,
    height: resizeSession.startHeight + event.clientY - resizeSession.startY
  });
});

function finishResize(event) {
  if (!resizeSession || event.pointerId !== resizeSession.pointerId) return;
  resizeSession = null;
  resizeHandle.classList.remove("resizing");
  island.classList.remove("is-resizing");
}

resizeHandle.addEventListener("pointerup", finishResize);
resizeHandle.addEventListener("pointercancel", finishResize);
document.getElementById("previous").addEventListener("click", (event) => handlePlaybackClick(event, "previous"));
document.getElementById("expandedPrevious").addEventListener("click", (event) => handlePlaybackClick(event, "previous"));
play.addEventListener("click", (event) => handlePlaybackClick(event, playbackAction()));
expandedPlay.addEventListener("click", (event) => handlePlaybackClick(event, playbackAction()));
document.getElementById("next").addEventListener("click", (event) => handlePlaybackClick(event, "next"));
document.getElementById("expandedNext").addEventListener("click", (event) => handlePlaybackClick(event, "next"));
progressTrack.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  seekFromPointer(event);
});
settingsToggle.addEventListener("click", () => island.classList.toggle("settings-open"));
dashboard.addEventListener("click", () => window.lyricsIsland.openSpotifyDashboard());

opacityInput.addEventListener("input", (event) => {
  island.style.opacity = Number(event.target.value) / 100;
});

settings.addEventListener("submit", async (event) => {
  event.preventDefault();
  await window.lyricsIsland.saveConfig({
    spotifyClientId: clientId.value.trim(),
    demoMode: demoMode.checked,
    lyricOffsetMs: Number(offset.value || 0),
    opacity: Number(opacityInput.value || 100)
  });
  island.classList.remove("settings-open");
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
    lyricOffsetMs: Number(offset.value || 0),
    opacity: Number(opacityInput.value || 100)
  });

  try {
    await window.lyricsIsland.connectSpotify();
  } catch (error) {
    statusNode.textContent = error.message || "Spotify connection failed.";
  }
});

window.lyricsIsland.onState(render);
window.lyricsIsland.getState().then(render);
new ResizeObserver(positionLyrics).observe(lyricsWindow);
setInterval(updatePlaybackEstimate, 100);

setIcon(document.getElementById("previous"), "previous");
setIcon(document.getElementById("expandedPrevious"), "previous");
setIcon(document.getElementById("next"), "next");
setIcon(document.getElementById("expandedNext"), "next");
setIcon(document.getElementById("collapse"), "close");
setIcon(settingsToggle, "settings");
setIcon(resizeHandle, "resize");
setIcon(play, "pause");
setIcon(expandedPlay, "pause");
