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
const playbackSource = document.getElementById("playbackSource");
const startAtLogin = document.getElementById("startAtLogin");
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
const backToLive = document.getElementById("backToLive");
const songTiming = document.getElementById("songTiming");
const timingButtons = settings.querySelectorAll("[data-timing]");
const shortcut = document.getElementById("shortcut");
const snapEdges = document.getElementById("snapEdges");
const importLrc = document.getElementById("importLrc");
const removeLrc = document.getElementById("removeLrc");
const settingsMessage = document.getElementById("settingsMessage");

let expanded = false;
let currentState = null;
let requestedArtwork;
let artworkVersion = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const dockGlow = document.getElementById("dockGlow");
window.lyricsIsland.onDocked(({ horizontal, vertical }) => {
  if (reducedMotion.matches) return;
  dockGlow.style.setProperty("--dock-x", horizontal === "left" ? "0%" : horizontal === "right" ? "100%" : "50%");
  dockGlow.style.setProperty("--dock-y", vertical === "top" ? "0%" : vertical === "bottom" ? "100%" : "50%");
  for (const animation of dockGlow.getAnimations()) animation.cancel();
  dockGlow.animate([{opacity: 0}, {opacity: 1, offset: .16}, {opacity: 0}], {
    duration: 900, easing: "ease-out"
  });
});
let transitionVersion = 0;
let lastLyricsKey = "";
let playbackSampledAt = 0;
let resizeSession = null;
let manualLyricsTransform = null;
let lyricsScrollTimer = null;
const lyricLeadGuardMs = 250;
const lyricsScrollReturnDelayMs = 2000;

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

function fadeIn(node) {
  if (!reducedMotion.matches) node.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 150 });
}

async function updateArtwork(url) {
  if (requestedArtwork === url) return;
  requestedArtwork = url;
  const version = ++artworkVersion;
  art.style.backgroundImage = expandedArt.style.backgroundImage = "";
  island.style.setProperty("--artwork-url", "none");
  if (!url) return;
  const image = new Image();
  image.src = url;
  try { await image.decode(); } catch { return; }
  if (version !== artworkVersion) return;
  const cover = `url("${url}")`;
  art.style.backgroundImage = expandedArt.style.backgroundImage = cover;
  island.style.setProperty("--artwork-url", cover);
  fadeIn(art);
  fadeIn(expandedArt);
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

function effectiveOffset() {
  const config = currentState?.config;
  return (Number(config?.lyricOffsetMs) || 0) + (Number(config?.songOffsetMs) || 0);
}

function lyricIndexForProgress(progressMs) {
  const lines = currentState?.lyrics?.synced || [];
  const adjustedProgress =
    progressMs + effectiveOffset() - lyricLeadGuardMs;
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
  if (!playback?.durationMs || playback.canSeek === false) return;

  const rect = progressTrack.getBoundingClientRect();
  const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const positionMs = Math.round(playback.durationMs * percent);

  playback.progressMs = positionMs;
  playbackSampledAt = Date.now();
  currentState.activeLyricIndex = lyricIndexForProgress(positionMs);
  renderProgress(playback);
  leaveManualScroll();
  renderLyrics(currentState, true);
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

  return window.lyricsIsland.playback(action);
}

function handlePlaybackClick(event, action) {
  event.preventDefault();
  event.stopPropagation();
  if ((action === "previous" || action === "next") && !reducedMotion.matches) {
    event.currentTarget.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 180 });
    if (currentState?.playback?.track) {
      for (const node of [lyric, lyricsWindow]) node.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 200 });
    }
  }
  sendPlayback(action).catch(() => { statusNode.textContent = "Playback control unavailable"; });
}

function idleLocal(state) {
  return state.config?.windowsMedia && !state.config.demoMode && !state.playback?.track &&
    (state.playback?.empty || state.status === "Ready");
}

function currentLyric(state) {
  const lines = state.lyrics?.synced || [];
  const index = state.activeLyricIndex;

  if (index >= 0 && lines[index]) return lines[index].text;
  if (lines.length) return "Lyrics start soon";
  if (state.lyrics?.plain) return "Lyrics available without timing";
  if (idleLocal(state)) return "Play a song in Spotify";
  if (state.lyrics?.source === "loading") return "Finding lyrics…";
  // Keep transport/auth status out of the compact lyric preview. Those
  // messages belong in the expanded status row and should not replace the
  // track context while Spotify is recovering from a temporary 429.
  if (state.status?.startsWith("Spotify API quota exceeded")) return "Spotify API limit reached";
  if (state.status === "Spotify Premium required") return "Spotify Premium required";
  if (state.status === "Spotify cooling down") return "Spotify API cooldown";
  if (state.playback?.track) return "Waiting for lyrics...";
  return state.demoMode ? "Demo mode" : "Waiting for Spotify playback";
}

function activeLyricsTransform() {
  if (!currentState) return;
  const lines = currentState.lyrics?.synced || [];
  const activeLyricIndex = currentState.activeLyricIndex;
  const activeNode = lyricsList.children[Math.max(0, activeLyricIndex)];

  if (lines.length && activeNode) {
    const nodeCenter = activeNode.offsetTop + (activeNode.offsetHeight / 2);
    return (lyricsWindow.clientHeight / 2) - nodeCenter;
  }

  return 90;
}

function clampLyricsTransform(transform) {
  const viewportHeight = lyricsWindow.clientHeight;
  const listHeight = lyricsList.scrollHeight;
  const minTransform = Math.min(0, viewportHeight - listHeight - 24);
  const maxTransform = Math.max(0, Math.min(120, viewportHeight / 2 - 24));
  return Math.min(maxTransform, Math.max(minTransform, transform));
}

function positionLyrics() {
  if (!currentState) return;
  const transform = manualLyricsTransform === null
    ? activeLyricsTransform()
    : manualLyricsTransform;
  lyricsList.style.transform = `translateY(${clampLyricsTransform(transform)}px)`;
}

function leaveManualScroll() {
  clearTimeout(lyricsScrollTimer);
  lyricsScrollTimer = null;
  manualLyricsTransform = null;
  backToLive.hidden = true;
  island.classList.remove("lyrics-manual-scroll");
}

function returnToActiveLyrics() {
  leaveManualScroll();
  positionLyrics();
}

function scheduleLyricsReturn() {
  clearTimeout(lyricsScrollTimer);
  if (!currentState?.playback?.isPlaying) return;
  lyricsScrollTimer = setTimeout(() => {
    if (currentState?.playback?.isPlaying) returnToActiveLyrics();
  }, lyricsScrollReturnDelayMs);
}

function handleLyricsWheel(event) {
  if (!currentState?.lyrics?.synced?.length) return;
  event.preventDefault();

  const startingTransform = manualLyricsTransform === null
    ? activeLyricsTransform()
    : manualLyricsTransform;
  manualLyricsTransform = clampLyricsTransform(startingTransform - event.deltaY);
  island.classList.add("lyrics-manual-scroll");
  backToLive.hidden = false;
  positionLyrics();
  scheduleLyricsReturn();
}

function seekToLyric(event) {
  const row = event.target.closest(".lyric-line");
  if (!row || !currentState?.playback?.durationMs || currentState.playback.canSeek === false || !row.dataset.timeMs) return;

  const timeMs = Number(row.dataset.timeMs);
  if (!Number.isFinite(timeMs)) return;

  event.preventDefault();
  event.stopPropagation();
  const lyricOffsetMs = effectiveOffset();
  const positionMs = Math.min(
    currentState.playback.durationMs,
    Math.max(0, Math.round(timeMs - lyricOffsetMs + lyricLeadGuardMs))
  );

  leaveManualScroll();
  currentState.playback.progressMs = positionMs;
  currentState.activeLyricIndex = Number(row.dataset.index);
  playbackSampledAt = Date.now();
  renderProgress(currentState.playback);
  renderLyrics(currentState, true);
  window.lyricsIsland.seek(positionMs);
}

function renderLyrics(state, snap = false) {
  const lines = state.lyrics?.synced || [];
  const index = Math.max(0, state.activeLyricIndex);
  const trackKey = state.playback?.uri || `${state.playback?.track || "unknown"}|${state.playback?.artist || ""}`;
  const placeholder = idleLocal(state) ? "Play a song in Spotify" :
    state.lyrics?.source === "loading" ? "Finding lyrics…" : "No synced lyrics yet";
  const lyricsKey = `${trackKey}::${lines.map((line) => `${line.timeMs}:${line.text}`).join("|") || state.lyrics?.plain || placeholder}`;

  if (lyricsKey !== lastLyricsKey) {
    lastLyricsKey = lyricsKey;
    snap = true;
    leaveManualScroll();
    lyricsList.innerHTML = "";

    if (!lines.length) {
      const row = document.createElement("div");
      row.className = "lyric-line active";
      row.textContent = state.lyrics?.plain || placeholder;
      lyricsList.appendChild(row);
    } else {
      lines.forEach((line, lineIndex) => {
        const row = document.createElement("div");
        row.className = "lyric-line";
        row.dataset.index = String(lineIndex);
        row.dataset.timeMs = String(line.timeMs);
        row.textContent = line.text;
        lyricsList.appendChild(row);
      });
    }
  }

  const gap = lines[index + 1] ? lines[index + 1].timeMs - lines[index].timeMs : 1200;
  const duration = snap ? 0 : Math.min(380, Math.max(0, gap * 0.32));
  lyricsList.style.setProperty("--follow-duration", duration + "ms");
  Array.from(lyricsList.children).forEach((row, rowIndex) => {
    row.classList.toggle("active", lines.length ? rowIndex === state.activeLyricIndex : true);
    row.classList.toggle("near", lines.length && Math.abs(rowIndex - state.activeLyricIndex) === 1);
  });

  positionLyrics();
}

function render(state) {
  const previous = currentState?.playback;
  const elapsed = previous?.isPlaying ? Date.now() - playbackSampledAt : 0;
  const jumped = previous?.uri && previous.uri === state.playback?.uri &&
    Math.abs(state.playback.progressMs - previous.progressMs - elapsed) > 1500;
  currentState = state;
  playbackSampledAt = Date.now();
  const playback = state.playback || {};
  island.classList.toggle("local-idle", Boolean(idleLocal(state)));
  if (previous?.uri !== playback.uri || (state.lyrics?.synced?.length && lyric.dataset.loading === "true")) {
    fadeIn(lyric);
    fadeIn(lyricsWindow);
  }
  lyric.dataset.loading = String(state.lyrics?.source === "loading");
  if (jumped) leaveManualScroll();
  if (manualLyricsTransform !== null && !previous?.isPlaying && playback.isPlaying) scheduleLyricsReturn();
  const correction = state.config?.songOffsetMs || 0;
  songTiming.textContent = "Song: " + (correction > 0 ? "+" : "") + correction + " ms";
  for (const button of timingButtons) button.disabled = !playback.uri || !state.lyrics?.synced?.length;
  importLrc.disabled = !playback.uri || state.config?.demoMode;
  removeLrc.hidden = state.lyrics?.source !== "Local LRC";
  const binding = state.config?.toggleShortcut || "";
  if (shortcut.dataset.saved !== binding) {
    shortcut.value = shortcut.dataset.saved = binding;
  }
  const snapping = Boolean(state.config?.snapEdges);
  if (snapEdges.dataset.saved !== String(snapping)) {
    snapEdges.checked = snapping;
    snapEdges.dataset.saved = String(snapping);
  }
  const title = playback.track || "Lyrics Island";
  const artist = playback.artist || "Windows floating lyrics";

  track.textContent = title;
  renderCompactLyric(state);
  expandedTrack.textContent = title;
  expandedArtist.textContent = artist;
  const lyricsSource = state.lyrics?.source === "rate-limited"
    ? "LRCLIB rate limited; will retry"
    : state.lyrics?.plain && !state.lyrics?.synced?.length
      ? "Plain lyrics; sync unavailable"
      : state.lyrics?.source || "none";
  statusNode.textContent = `${state.status || "Ready"} - ${lyricsSource}`;
  updatePlayIcons(playback.isPlaying);

  void updateArtwork(playback.artworkUrl);

  if (document.activeElement !== clientId) clientId.value = state.config?.spotifyClientId || "";
  const source = state.config?.demoMode ? "demo" : state.config?.windowsMedia ? "windows" : "web";
  if (playbackSource.dataset.saved !== source) {
    playbackSource.value = source;
    playbackSource.dataset.saved = source;
    updateWebFields();
  }
  if (document.activeElement !== startAtLogin) startAtLogin.checked = Boolean(state.config?.startAtLogin);
  if (document.activeElement !== offset) offset.value = String(state.config?.lyricOffsetMs || 0);
  if (document.activeElement !== opacityInput) {
    const opacityVal = state.config?.opacity !== undefined ? state.config.opacity : 100;
    opacityInput.value = String(opacityVal);
    island.style.opacity = opacityVal / 100;
  }
  renderProgress(playback);
  renderLyrics(state, jumped);
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

async function setExpanded(nextExpanded) {
  if (expanded === nextExpanded) return;
  expanded = nextExpanded;
  const version = ++transitionVersion;

  if (expanded) {
    await window.lyricsIsland.setExpanded(true);
    // Give Chromium a paint in the larger transparent window with the pill still compact.
    await nextFrame();
    await nextFrame();
    if (version === transitionVersion) island.classList.add("expanded-mode");
  } else {
    leaveManualScroll();
    island.classList.remove("expanded-mode", "settings-open");
    // Collect only the shell and view transitions, not playback or lyric animations.
    const views = [island, compact, island.querySelector(".expanded")];
    const transitions = views.flatMap(view => view.getAnimations());
    await Promise.allSettled(transitions.map(animation => animation.finished));
    await nextFrame();
    if (version === transitionVersion) await window.lyricsIsland.setExpanded(false);
  }
}

let dragPointer = null;
let dragFrame = 0;
let dragOrigin, dragging = false, suppressDragClick = false;
function recognizeDrag(event) {
  // Until committed the window is stationary, so client coordinates are stable.
  if (!dragging && Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y) >= 5) {
    dragging = true;
    island.classList.add("is-dragging");
  }
}
island.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary || dragPointer !== null) return;
  // Only controls that own a press-and-drag gesture need exclusive space.
  if (event.target.closest("form, .progress-track, #resizeHandle")) return;
  dragPointer = event.pointerId;
  dragOrigin = {x:event.clientX, y:event.clientY};
  dragging = false;
  (event.target.closest("button, .lyric-line") || event.target).setPointerCapture(event.pointerId);
  void window.lyricsIsland.drag("start", {x: event.clientX, y: event.clientY});
});
island.addEventListener("pointermove", event => {
  if (event.pointerId !== dragPointer) return;
  recognizeDrag(event);
  if (!dragging || dragFrame) return;
  dragFrame = requestAnimationFrame(() => { dragFrame = 0; void window.lyricsIsland.drag("move"); });
});
function finishDrag(event) {
  if (event.pointerId !== dragPointer) return;
  if (event.type === "pointerup") recognizeDrag(event);
  suppressDragClick = dragging;
  island.classList.remove("is-dragging");
  dragPointer = null;
  cancelAnimationFrame(dragFrame);
  dragFrame = 0;
  void window.lyricsIsland.drag(dragging && event.type === "pointerup" ? "end" : "cancel");
}
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) document.addEventListener(type, finishDrag);
for (const type of ["click", "dblclick"]) island.addEventListener(type, event => {
  // Keyboard activation has detail 0; a completed drag must never swallow it.
  if (!suppressDragClick || !event.detail) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
// Reset even when a dedicated resize or seek handler stops pointerdown bubbling.
island.addEventListener("pointerdown", () => { suppressDragClick = false; }, true);

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
function updateWebFields() {
  const hide = playbackSource.value !== "web";
  for (const control of [clientId, dashboard, connect]) control.hidden = hide;
}
playbackSource.addEventListener("change", updateWebFields);
settingsToggle.addEventListener("click", () => {
  island.classList.toggle("settings-open");
  settingsMessage.textContent = currentState?.config?.shortcutUnavailable ? "Saved shortcut is in use. Choose another." : "";
});
function settingsError(error) {
  settingsMessage.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
for (const [button, action] of [[importLrc, "import"], [removeLrc, "remove"]]) {
  button.addEventListener("click", async () => {
    try { settingsMessage.textContent = await window.lyricsIsland.localLyrics(currentState.playback?.uri, action); }
    catch (error) { settingsError(error); }
  });
}
backToLive.addEventListener("click", returnToActiveLyrics);
for (const button of timingButtons) {
  button.addEventListener("click", () => window.lyricsIsland.adjustTiming(currentState.playback.uri, button.dataset.timing));
}
dashboard.addEventListener("click", () => window.lyricsIsland.openSpotifyDashboard());

opacityInput.addEventListener("input", (event) => {
  island.style.opacity = Number(event.target.value) / 100;
});

settings.addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await window.lyricsIsland.saveConfig({
    toggleShortcut: shortcut.value,
    snapEdges: snapEdges.checked,
    ...(playbackSource.value === "web" ? { spotifyClientId: clientId.value.trim() } : {}),
    demoMode: playbackSource.value === "demo",
    windowsMedia: playbackSource.value === "windows",
    startAtLogin: startAtLogin.checked,
    lyricOffsetMs: Number(offset.value || 0),
    opacity: Number(opacityInput.value || 100)
  }); } catch (error) { settingsError(error); return; }
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
    windowsMedia: false,
    startAtLogin: startAtLogin.checked,
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
lyricsWindow.addEventListener("wheel", handleLyricsWheel, { passive: false });
lyricsList.addEventListener("click", seekToLyric);
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
