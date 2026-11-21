const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell, globalShortcut, dialog, systemPreferences } = require("electron");
const { compactSize, contain, remember, restore, snap, snapProgress } = require("./placement");
const { prepareLights } = require("./edgeLight");
const { loadFile, storeOverride, readOverride, removeOverride } = require("./localLyrics");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { readConfig, writeConfig } = require("./config");
const { fetchLyrics } = require("./lyrics");
const { getWindowsPlayback, requestWindowsMedia, closeWindowsMedia } = require("./windowsMedia");
const { readLyricsCache, writeLyricsCache } = require("./lyricsCache");
const {
  startSpotifyLogin,
  refreshAccessToken,
  getCurrentPlayback,
  controlPlayback,
  seekPlayback
} = require("./spotify");

const hasAppLock = app.requestSingleInstanceLock();
if (!hasAppLock) {
  app.quit();
}

const rendererPath = path.resolve(__dirname, "../renderer/index.html");
const trustedRendererUrl = pathToFileURL(rendererPath).href;

let mainWindow;
let tray;
let config;
let timer;
let windowExpanded = false;
let preferenceSaveTimer;
let snapTimer;
let dragSession;
let edgeLights;
let edgeLightTimer;
let registeredShortcut = "";
let editingOverride = false;
const shortcuts = ["", "Ctrl+Alt+L", "Ctrl+Shift+F9", "Alt+Shift+I"];
const localFolder = () => path.join(app.getPath("userData"), "local-lyrics");
let lastTrackKey = "";
let playbackRequest = 0;
let latestAppliedRequest = 0;
let lastPlaybackRefreshAt = 0;
let lastLyricsLookupAt = 0;
let lyricsRetryDelayMs = 30_000;
let lyricsCachePath = "";
let rateLimitUntil = 0;
let rateLimitKind = "";
let currentLyrics = { synced: [], plain: "", source: "none" };
let lyricsCache = new Map();
const lyricsCacheLimit = 50;
let state = {
  status: "Starting",
  connected: false,
  demoMode: true,
  playback: null,
  lyrics: currentLyrics,
  activeLyricIndex: -1,
  config: {}
};

const demoPlayback = {
  empty: false,
  isPlaying: true,
  progressMs: 0,
  durationMs: 214000,
  track: "Midnight City",
  artist: "M83",
  album: "Hurry Up, We're Dreaming",
  artworkUrl: "",
  uri: "demo:midnight-city"
};

const demoLyrics = {
  source: "Demo",
  plain: "",
  synced: [
    { timeMs: 0, text: "Waiting for Spotify..." },
    { timeMs: 6000, text: "Floating above your Windows desktop" },
    { timeMs: 12000, text: "Lyrics drift into view right on time" },
    { timeMs: 18000, text: "A small island, but it has range" },
    { timeMs: 24000, text: "Connect Spotify when you're ready" }
  ]
};

const restartPreviousThresholdMs = 3000;
const lyricLeadGuardMs = 250;
const expandedMinSize = { width: 500, height: 246 };
let expandedSize = { width: 604, height: 282 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lyricsCacheKey(playback) {
  if (!playback || playback.empty) return "";
  return [
    playback.uri,
    playback.track,
    playback.artist,
    playback.album,
    playback.durationMs
  ].filter(Boolean).join("|");
}

async function lyricsForPlayback(playback) {
  const override = await readOverride(localFolder(), playback.uri);
  if (override) return override;
  const cacheKey = lyricsCacheKey(playback);
  if (cacheKey && lyricsCache.get(cacheKey)?.lyrics.synced?.length) {
    const cachedEntry = lyricsCache.get(cacheKey);
    lyricsCache.delete(cacheKey);
    lyricsCache.set(cacheKey, cachedEntry);
    return cachedEntry.lyrics;
  }

  let lyrics;
  try {
    lyrics = await fetchLyrics(playback);
  } catch {
    lyrics = { synced: [], plain: "", source: "none" };
  }

  if (cacheKey && lyrics.synced?.length) {
    lyricsCache.set(cacheKey, { lyrics, cachedAt: Date.now() });
    if (lyricsCache.size > lyricsCacheLimit) {
      lyricsCache.delete(lyricsCache.keys().next().value);
    }
    if (lyricsCachePath) writeLyricsCache(lyricsCachePath, lyricsCache);
  }

  return lyrics;
}

function songOffset(uri) {
  const value = config.songOffsets?.[uri];
  return Number.isFinite(value) ? value : 0;
}

function publicConfig(playback) {
  return {
    spotifyClientId: config.spotifyClientId,
    lyricOffsetMs: config.lyricOffsetMs,
    songOffsetMs: songOffset(playback?.uri),
    pollIntervalMs: config.pollIntervalMs,
    startAtLogin: config.startAtLogin,
    toggleShortcut: registeredShortcut,
    shortcutUnavailable: Boolean(config.toggleShortcut && !registeredShortcut),
    snapEdges: config.snapEdges,
    position: config.position,
    demoMode: config.demoMode,
    windowsMedia: config.windowsMedia,
    opacity: config.opacity ?? 100
  };
}

function clearPlaybackState() {
  latestAppliedRequest = ++playbackRequest;
  lastTrackKey = "";
  lastPlaybackRefreshAt = 0;
  lastLyricsLookupAt = 0;
  lyricsRetryDelayMs = 30_000;
  currentLyrics = { synced: [], plain: "", source: "none" };
  return {
    playback: null,
    lyrics: currentLyrics,
    activeLyricIndex: -1
  };
}

function createIcon() {
  const iconPath = path.join(__dirname, "../../assets/lyrics-island.png");
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) return icon;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="#101113"/>
      <path d="M20 39V18h24v21c0 5-4 9-9 9s-9-4-9-9h6c0 2 1 3 3 3s3-1 3-3V24H26v15h-6z" fill="#f5f7fb"/>
      <circle cx="43" cy="42" r="4" fill="#4ee3b1"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function assertTrustedRenderer(event) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame?.url !== trustedRendererUrl
  ) {
    throw new Error("Blocked IPC request from an untrusted renderer.");
  }
}

function validateConfigUpdate(nextConfig) {
  if (!nextConfig || typeof nextConfig !== "object" || Array.isArray(nextConfig)) {
    throw new TypeError("Settings must be an object.");
  }

  const allowedKeys = new Set([
    "toggleShortcut", "snapEdges",
    "spotifyClientId",
    "demoMode",
    "windowsMedia",
    "startAtLogin",
    "lyricOffsetMs",
    "opacity"
  ]);
  if (Object.keys(nextConfig).some((key) => !allowedKeys.has(key))) {
    throw new TypeError("Settings contain an unsupported field.");
  }

  const update = {};
  if (Object.hasOwn(nextConfig, "snapEdges")) {
    if (typeof nextConfig.snapEdges !== "boolean") throw new TypeError("Invalid snapping preference");
    update.snapEdges = nextConfig.snapEdges;
  }
  if (Object.hasOwn(nextConfig, "toggleShortcut")) {
    if (!shortcuts.includes(nextConfig.toggleShortcut)) throw new TypeError("Unsupported shortcut");
    update.toggleShortcut = nextConfig.toggleShortcut;
  }
  if (Object.hasOwn(nextConfig, "windowsMedia")) {
    if (typeof nextConfig.windowsMedia !== "boolean") throw new TypeError("Invalid playback source");
    update.windowsMedia = nextConfig.windowsMedia;
  }
  if (Object.hasOwn(nextConfig, "spotifyClientId")) {
    if (typeof nextConfig.spotifyClientId !== "string" || nextConfig.spotifyClientId.length > 256) {
      throw new TypeError("Spotify Client ID must be a string of at most 256 characters.");
    }
    update.spotifyClientId = nextConfig.spotifyClientId.trim();
  }
  if (Object.hasOwn(nextConfig, "demoMode")) {
    if (typeof nextConfig.demoMode !== "boolean") throw new TypeError("Demo mode must be a boolean.");
    update.demoMode = nextConfig.demoMode;
  }
  if (Object.hasOwn(nextConfig, "startAtLogin")) {
    if (typeof nextConfig.startAtLogin !== "boolean") throw new TypeError("Start at login must be a boolean.");
    update.startAtLogin = nextConfig.startAtLogin;
  }
  if (Object.hasOwn(nextConfig, "lyricOffsetMs")) {
    if (typeof nextConfig.lyricOffsetMs !== "number" || !Number.isFinite(nextConfig.lyricOffsetMs)) {
      throw new TypeError("Lyric offset must be a finite number.");
    }
    update.lyricOffsetMs = Math.round(clamp(nextConfig.lyricOffsetMs, -60000, 60000));
  }
  if (Object.hasOwn(nextConfig, "opacity")) {
    if (typeof nextConfig.opacity !== "number" || !Number.isFinite(nextConfig.opacity)) {
      throw new TypeError("Opacity must be a finite number.");
    }
    update.opacity = Math.round(clamp(nextConfig.opacity, 10, 100));
  }

  return update;
}

function targetBounds(expanded = false, anchorBounds = null, destination = null) {
  const legacy = config.windowPosition;
  const display = destination || (anchorBounds ? screen.getDisplayMatching(anchorBounds) :
    screen.getAllDisplays().find(d => d.id === config.lastDisplayId) ||
    (config.lastDisplayId == null && Number.isFinite(legacy?.x) && Number.isFinite(legacy?.y)
      ? screen.getDisplayMatching({ ...compactSize, x: legacy.x, y: legacy.y }) : screen.getPrimaryDisplay()));
  const { width, height } = display.workArea;
  const size = expanded
    ? {
        width: clamp(expandedSize.width, expandedMinSize.width, width),
        height: clamp(expandedSize.height, expandedMinSize.height, height)
      }
    : compactSize;
  const saved = config.monitorPositions?.[display.id] ??
    (!destination && config.lastDisplayId == null && legacy ? remember({ ...legacy, ...compactSize }, display.workArea) : null);
  return restore(size, display.workArea, anchorBounds ? remember(anchorBounds, display.workArea) : saved);
}

let lastContact = "";
function syncContact(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const area = bounds && config.snapEdges && screen.getDisplayMatching(bounds).workArea;
  const edges = area ? [
    Math.abs(bounds.x - area.x) <= 1 && "left",
    Math.abs(bounds.y - area.y) <= 1 && "top",
    Math.abs(bounds.x + bounds.width - area.x - area.width) <= 1 && "right",
    Math.abs(bounds.y + bounds.height - area.y - area.height) <= 1 && "bottom"
  ].filter(Boolean) : [];
  const key = edges.join(" ");
  if (key === lastContact) return;
  lastContact = key;
  mainWindow.webContents.send("island:contact", edges);
}

function cancelSnap() {
  clearTimeout(snapTimer);
  snapTimer = undefined;
  clearTimeout(edgeLightTimer);
  edgeLights?.close();
  edgeLights = null;
}

function dockAfterDrag(win) {
  cancelSnap();
  const observed = win.getBounds();
  const display = screen.getDisplayMatching(observed);
  const area = display.workArea;
  // setPosition round-trips the native width through integer DIPs each frame.
  // At fractional scaling that accumulates. Move a fixed logical rectangle instead.
  const intended = windowExpanded ? expandedSize : compactSize;
  const from = { ...observed, width: Math.min(intended.width, area.width), height: Math.min(intended.height, area.height) };
  const to = snap(from, area);
  const horizontal = to.x === area.x ? "left" : to.x + to.width === area.x + area.width ? "right" : "";
  const vertical = to.y === area.y ? "top" : to.y + to.height === area.y + area.height ? "bottom" : "";
  if (!horizontal && !vertical) { syncContact(null); return; }
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (systemPreferences.getAnimationSettings().prefersReducedMotion) {
    if (distance) win.setBounds(to, false);
    syncContact(to);
    return;
  }
  const duration = Math.min(420, 200 + distance * 4);
  edgeLights = prepareLights([horizontal, vertical], to, display.bounds);
  const start = performance.now();
  let lastX = from.x, lastY = from.y;
  function tick() {
    if (win.isDestroyed()) return;
    const time = distance ? (performance.now() - start) / duration : 1;
    const progress = snapProgress(time);
    const x = Math.round(from.x + progress * dx), y = Math.round(from.y + progress * dy);
    if (x !== lastX || y !== lastY) {
      win.setBounds({ ...from, x, y }, false);
      lastX = x; lastY = y;
    }
    if (time < 1) snapTimer = setTimeout(tick, 16);
    else {
      snapTimer = undefined;
      syncContact(to);
      win.webContents.send("island:docked", { horizontal, vertical });
      edgeLights?.reveal();
      edgeLightTimer = setTimeout(() => { edgeLights?.close(); edgeLights = null; }, 1100);
      schedulePreferenceSave();
    }
  }
  tick();
}

function setWindowBounds(expanded = false, preservePosition = true) {
  dragSession = null;
  cancelSnap();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = targetBounds(expanded, preservePosition ? mainWindow.getBounds() : null);
  mainWindow.setBounds(target, false);
  syncContact(target);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 308,
    height: 63,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, "../../assets/lyrics-island.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });

  mainWindow.setBackgroundColor("#00000000");
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.on("move", schedulePreferenceSave);
  let dragging = false;
  mainWindow.on("will-move", (event, proposed) => {
    cancelSnap(); dragging = true; syncContact(null);
    // Native/system-menu moves don't use our captured pointer path.
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const bounded = contain(proposed, area);
    if (bounded.x !== proposed.x || bounded.y !== proposed.y) event.preventDefault();
  });
  mainWindow.on("hide", () => { dragSession = null; cancelSnap(); });
  mainWindow.on("closed", cancelSnap);
  mainWindow.on("moved", () => {
    if (!dragging) return;
    dragging = false;
    if (!config.snapEdges) return;
    dockAfterDrag(mainWindow);
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (navigationUrl !== trustedRendererUrl) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event, navigationUrl) => {
    if (navigationUrl !== trustedRendererUrl) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.loadFile(rendererPath);
  setWindowBounds(false, false);
  mainWindow.webContents.on("did-finish-load", () => {
    lastContact = "";
    syncContact(mainWindow.getBounds());
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

function schedulePreferenceSave() {
  clearTimeout(preferenceSaveTimer);
  preferenceSaveTimer = setTimeout(savePlacement, 500);
}

function savePlacement() {
  if (!mainWindow || mainWindow.isDestroyed() || !config) return;
  const bounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  config = writeConfig({
    ...config,
    lastDisplayId: display.id,
    monitorPositions: { ...config.monitorPositions, [display.id]: remember(bounds, display.workArea) },
    windowPosition: { x: bounds.x, y: bounds.y },
    expandedSize
  });
}

function bindShortcut(next) {
  if (registeredShortcut === next) return true;
  if (next && !globalShortcut.register(next, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.showInactive();
    }
  })) return false;
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  registeredShortcut = next;
  return true;
}

function createTray() {
  tray = new Tray(createIcon());
  tray.setToolTip("Lyrics Island");
  updateTray();
}

function updateTray() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show island", click: () => mainWindow?.show() },
      { label: "Hide island", click: () => mainWindow?.hide() },
      { label: "Move to monitor", submenu: screen.getAllDisplays().map((display, i) => ({
        label: display.label || "Monitor " + (i + 1),
        click: () => {
          cancelSnap();
          savePlacement();
          const target = targetBounds(windowExpanded, null, display);
          mainWindow.setBounds(target, false);
          syncContact(target);
          schedulePreferenceSave();
          mainWindow.showInactive();
        }
      })) },
      {
        label: "Demo mode",
        type: "checkbox",
        checked: config.demoMode,
        click: (item) => {
          config = writeConfig({ ...config, demoMode: item.checked });
          closeWindowsMedia();
          publishState({ ...clearPlaybackState(), status: item.checked ? "Demo mode" : "Spotify mode" });
          startLoop();
        }
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

function activeLyricIndex(playback, lyrics) {
  if (!playback || !lyrics.synced.length) return -1;
  const progress =
    (playback.progressMs || 0) + (config.lyricOffsetMs || 0) + songOffset(playback.uri) - lyricLeadGuardMs;
  let index = -1;

  for (let i = 0; i < lyrics.synced.length; i += 1) {
    if (lyrics.synced[i].timeMs <= progress) index = i;
    else break;
  }

  return index;
}

function estimatedPlayback(playback = state.playback) {
  if (!playback || playback.empty) return playback;

  const progressMs = playback.progressMs || 0;
  const durationMs = playback.durationMs || 0;

  if (!playback.isPlaying || !durationMs || !lastPlaybackRefreshAt) {
    return playback;
  }

  const elapsedMs = Date.now() - lastPlaybackRefreshAt;
  return {
    ...playback,
    progressMs: Math.min(durationMs, progressMs + elapsedMs)
  };
}

function publishState(patch = {}) {
  state = {
    ...state,
    ...patch,
    connected: Boolean(config.accessToken),
    demoMode: config.demoMode,
    config: publicConfig(Object.hasOwn(patch, "playback") ? patch.playback : state.playback)
  };

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("state:update", state);
  }
}

async function refreshSavedToken() {
  const { accessToken, refreshToken, tokenExpiresAt } = await refreshAccessToken(config);
  config = writeConfig({ ...config, accessToken, refreshToken, tokenExpiresAt });
}

async function completeLyricsLookup(playback, pending) {
  const lyrics = await lyricsForPlayback(playback);
  if (currentLyrics !== pending || state.playback?.uri !== playback.uri) return;
  currentLyrics = lyrics;
  lastLyricsLookupAt = Date.now();
  lyricsRetryDelayMs = Math.max(30_000, lyrics.retryAfterMs || 0);
  const latest = estimatedPlayback();
  lastPlaybackRefreshAt = Date.now();
  publishState({ playback: latest, lyrics, activeLyricIndex: activeLyricIndex(latest, lyrics) });
}

async function refreshPlayback(options = {}) {
  const request = ++playbackRequest;
  try {
    if (config.demoMode) {
      demoPlayback.progressMs = (demoPlayback.progressMs + config.pollIntervalMs) % 30000;
      currentLyrics = demoLyrics;
      publishState({
        status: "Demo mode",
        playback: { ...demoPlayback },
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(demoPlayback, currentLyrics)
      });
      return;
    }

    const local = config.windowsMedia;
    if (!local && !config.accessToken) {
      publishState({
        status: "Connect Spotify to begin",
        ...clearPlaybackState()
      });
      return;
    }

    if (!local && Date.now() < rateLimitUntil) {
      const playback = state.playback?.uri?.startsWith("demo:") ? null : estimatedPlayback();
      const status = rateLimitKind === "quota" ? "Spotify API quota exceeded" : "Spotify cooling down";
      publishState({
        status,
        playback,
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(playback, currentLyrics)
      });
      return;
    }

    if (!local && Date.now() > config.tokenExpiresAt - 60_000) {
      await refreshSavedToken();
    }

    const playback = local ? await getWindowsPlayback() : await getCurrentPlayback(config);
    if (request < latestAppliedRequest || config.demoMode || config.windowsMedia !== local) return;
    latestAppliedRequest = request;
    rateLimitUntil = 0;
    rateLimitKind = "";
    const trackKey = playback.empty ? "" : playback.uri;

    if (options.waitForTrackChangeFrom && trackKey === options.waitForTrackChangeFrom) {
      return playback;
    }

    lastPlaybackRefreshAt = Date.now();
    let needsLookup = false;
    if (trackKey && trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      currentLyrics = { synced: [], plain: "", source: "loading" };
      lastLyricsLookupAt = 0;
      lyricsRetryDelayMs = 30_000;
      needsLookup = true;
    } else if (
      trackKey &&
      !currentLyrics.synced.length &&
      currentLyrics.source !== "loading" &&
      Date.now() - lastLyricsLookupAt >= lyricsRetryDelayMs
    ) {
      currentLyrics = { ...currentLyrics, source: "loading" };
      needsLookup = true;
    } else if (playback.empty) {
      lastTrackKey = "";
      currentLyrics = { synced: [], plain: "", source: "none" };
    }

    publishState({
      status: local
        ? (playback.empty ? "Play Spotify on this PC" : playback.durationMs ? "Spotify on this PC" : "Windows timing unavailable")
        : (playback.empty ? "Nothing playing" : "Spotify connected"),
      playback,
      lyrics: currentLyrics,
      activeLyricIndex: activeLyricIndex(playback, currentLyrics)
    });
    if (needsLookup) void completeLyricsLookup(playback, currentLyrics);
    return playback;
  } catch (error) {
    if (request < latestAppliedRequest) return;
    if (error.message === "spotify-token-expired") {
      try {
        await refreshSavedToken();
      } catch (refreshError) {
        publishState({ status: `Reconnect Spotify (${refreshError.message})` });
        return;
      }
      return refreshPlayback();
    }

    // 404 on the player endpoint means no active device, not a real failure.
    if (error.message === "Spotify request failed: 404") {
      publishState({ status: "Open Spotify on a device" });
      return;
    }

    if (error.code === "SPOTIFY_FORBIDDEN") {
      publishState({
        status: "Spotify Premium required",
        ...clearPlaybackState()
      });
      return;
    }

    if (error.code === "SPOTIFY_QUOTA_EXCEEDED") {
      const waitMs = Math.max(error.retryAfterMs || 30000, config.pollIntervalMs);
      rateLimitUntil = Date.now() + waitMs + 1000;
      rateLimitKind = "quota";
      const playback = state.playback?.uri?.startsWith("demo:") ? null : estimatedPlayback();
      publishState({
        status: "Spotify API quota exceeded",
        playback,
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(playback, currentLyrics)
      });
      return;
    }

    if (error.code === "SPOTIFY_RATE_LIMITED") {
      const waitMs = Math.max(error.retryAfterMs || 30000, config.pollIntervalMs);
      rateLimitUntil = Date.now() + waitMs + 1000;
      rateLimitKind = "rate";
      const playback = estimatedPlayback();
      publishState({
        status: playback ? "Spotify connected" : "Spotify cooling down",
        playback,
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(playback, currentLyrics)
      });
      return;
    }


    publishState({
      status: error.message || "Playback refresh failed",
      ...(config.windowsMedia && !config.demoMode ? clearPlaybackState() : {})
    });
  }
}

function startLoop() {
  clearInterval(timer);
  timer = setInterval(refreshPlayback, config.pollIntervalMs);
  refreshPlayback();
}

async function refreshAfterTrackSkip(previousTrackKey) {
  const retryDelays = [80, 140, 220, 340, 520, 760];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const playback = await refreshPlayback({ waitForTrackChangeFrom: previousTrackKey });
    const trackKey = playback?.empty ? "" : playback?.uri;

    if (!previousTrackKey || (trackKey && trackKey !== previousTrackKey)) {
      return playback;
    }

    if (attempt < retryDelays.length) {
      await sleep(retryDelays[attempt]);
    }
  }

  return refreshPlayback();
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!hasAppLock) return;
  config = readConfig();
  lyricsCachePath = path.join(app.getPath("userData"), "lyrics-cache.json");
  lyricsCache = readLyricsCache(lyricsCachePath);
  const savedExpandedSize = config.expandedSize || {};
  expandedSize = {
    width: Number.isFinite(Number(savedExpandedSize.width))
      ? Number(savedExpandedSize.width)
      : expandedSize.width,
    height: Number.isFinite(Number(savedExpandedSize.height))
      ? Number(savedExpandedSize.height)
      : expandedSize.height
  };
  app.setLoginItemSettings({ openAtLogin: Boolean(config.startAtLogin) });

  createWindow();
  createTray();
  screen.on("display-added", updateTray);
  screen.on("display-metrics-changed", (_event, display, metrics) => {
    if (!metrics.some(key => ["workArea", "bounds", "scaleFactor"].includes(key))) return;
    if (screen.getDisplayMatching(mainWindow.getBounds()).id === display.id) setWindowBounds(windowExpanded);
  });
  screen.on("display-removed", () => {
    cancelSnap();
    const target = targetBounds(windowExpanded);
    mainWindow.setBounds(target, false);
    syncContact(target);
    updateTray();
  });
  if (shortcuts.includes(config.toggleShortcut)) bindShortcut(config.toggleShortcut);
  publishState({ status: "Ready" });
  startLoop();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  cancelSnap();
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
  closeWindowsMedia();
  clearInterval(timer);
  clearTimeout(preferenceSaveTimer);
  savePlacement();
});

ipcMain.handle("state:get", (event) => {
  assertTrustedRenderer(event);
  return state;
});

ipcMain.handle("config:save", (event, nextConfig) => {
  assertTrustedRenderer(event);
  const update = validateConfigUpdate(nextConfig);
  if (update.toggleShortcut !== undefined && !bindShortcut(update.toggleShortcut))
    throw new Error("That shortcut is in use. Choose another.");
  const leavingDemo = config.demoMode && update.demoMode === false;
  const enteringDemo = !config.demoMode && update.demoMode === true;
  const switchingSource = update.windowsMedia !== undefined && update.windowsMedia !== config.windowsMedia;
  config = writeConfig({ ...config, ...update });
  if (!config.snapEdges) { cancelSnap(); syncContact(null); }
  if (leavingDemo || enteringDemo || switchingSource) {
    closeWindowsMedia();
    rateLimitUntil = 0;
    rateLimitKind = "";
    publishState({
      status: enteringDemo ? "Demo mode" : "Connecting to Spotify",
      ...clearPlaybackState()
    });
  }
  app.setLoginItemSettings({ openAtLogin: Boolean(config.startAtLogin) });
  startLoop();
  publishState({ status: "Settings saved" });
  return state;
});

ipcMain.handle("lyrics:local", async (event, uri, action) => {
  assertTrustedRenderer(event);
  const sameSong = () => typeof uri === "string" && uri && uri === state.playback?.uri && !config.demoMode;
  if (!sameSong()) throw new Error("Play the song before changing its lyrics.");
  if (editingOverride || !["import", "remove"].includes(action)) throw new Error("Cannot change lyrics right now.");
  editingOverride = true;
  try {
    let lyrics;
    if (action === "import") {
      const choice = await dialog.showOpenDialog(mainWindow, {
        title: "Choose synced lyrics for " + state.playback.track, properties: ["openFile"],
        filters: [{ name: "Synced lyrics", extensions: ["lrc"] }]
      });
      if (choice.canceled) return "";
      const file = await loadFile(choice.filePaths[0]);
      if (!sameSong()) throw new Error("Song changed. Open the file again for the new song.");
      await storeOverride(localFolder(), uri, file.raw);
      lyrics = file.lyrics;
    } else {
      await removeOverride(localFolder(), uri);
      lyrics = { source: "loading", synced: [], plain: "" };
    }
    if (sameSong()) {
      const playback = estimatedPlayback();
      currentLyrics = lyrics; // Invalidate any outstanding automatic lookup for this track.
      lastPlaybackRefreshAt = Date.now();
      publishState({ playback, lyrics, activeLyricIndex: activeLyricIndex(playback, lyrics) });
      if (action === "remove") void completeLyricsLookup(playback, lyrics);
    }
    return action === "import" ? "Local lyrics saved for this song." : "Automatic lyrics restored.";
  } finally { editingOverride = false; }
});

ipcMain.handle("lyrics:adjust-timing", (event, uri, action) => {
  assertTrustedRenderer(event);
  if (!uri || uri !== state.playback?.uri || !state.lyrics?.synced?.length) return;
  if (!["early", "late", "reset"].includes(action)) throw new TypeError("Invalid timing action");
  const offsets = { ...config.songOffsets };
  const change = action === "early" ? -250 : 250;
  const next = action === "reset" ? 0 : clamp(songOffset(uri) + change, -60000, 60000);
  if (next) offsets[uri] = next;
  else delete offsets[uri];
  config = writeConfig({ ...config, songOffsets: offsets });
  const playback = estimatedPlayback();
  lastPlaybackRefreshAt = Date.now();
  publishState({ playback, activeLyricIndex: activeLyricIndex(playback, state.lyrics) });
});

ipcMain.handle("spotify:connect", async (event) => {
  assertTrustedRenderer(event);
  rateLimitUntil = 0;
  rateLimitKind = "";
  clearPlaybackState();
  const token = await startSpotifyLogin(config.spotifyClientId);
  config = writeConfig({ ...config, ...token, demoMode: false, windowsMedia: false });
  publishState({ status: "Spotify connected" });
  await refreshPlayback();
  return state;
});

ipcMain.handle("spotify:control", async (event, action) => {
  assertTrustedRenderer(event);
  if (!["play", "pause", "next", "previous"].includes(action)) {
    throw new TypeError("Unsupported playback action.");
  }

  if (config.demoMode) {
    if (action === "previous" && demoPlayback.progressMs > restartPreviousThresholdMs) {
      demoPlayback.progressMs = 0;
      publishState({
        status: "Restarted track",
        playback: { ...demoPlayback },
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(demoPlayback, currentLyrics)
      });
    }

    if (action === "play" || action === "pause") {
      demoPlayback.isPlaying = action === "play";
      publishState({
        status: "Demo mode",
        playback: { ...demoPlayback },
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(demoPlayback, currentLyrics)
      });
    }
    return state;
  }

  const playback = estimatedPlayback();
  if (action === "previous" && playback?.progressMs > restartPreviousThresholdMs && playback.canSeek !== false) {
    const restartedPlayback = { ...playback, progressMs: 0 };
    publishState({
      status: "Restarted track",
      playback: restartedPlayback,
      lyrics: currentLyrics,
      activeLyricIndex: activeLyricIndex(restartedPlayback, currentLyrics)
    });

    try {
      if (config.windowsMedia) await requestWindowsMedia("seek", 0);
      else await seekPlayback(config, 0);
      await refreshPlayback();
    } catch (error) {
      if (error.code === "SPOTIFY_FORBIDDEN") {
        publishState({ status: "Spotify Premium required" });
        return state;
      }
      throw error;
    }
    return state;
  }

  if ((action === "play" || action === "pause") && state.playback) {
    publishState({
      status: action === "play" ? "Playing" : "Paused",
      playback: { ...state.playback, isPlaying: action === "play" }
    });
  }

  try {
    const previousTrackKey = state.playback?.empty ? "" : state.playback?.uri || "";
    if (config.windowsMedia) await requestWindowsMedia(action);
    else await controlPlayback(config, action);
    if (action === "next" || action === "previous") {
      await refreshAfterTrackSkip(previousTrackKey);
    } else {
      await refreshPlayback();
    }
  } catch (error) {
    if (error.code === "SPOTIFY_FORBIDDEN") {
      publishState({ status: "Spotify Premium required" });
      return state;
    }
    throw error;
  }
  return state;
});

ipcMain.handle("spotify:seek", async (event, positionMs) => {
  assertTrustedRenderer(event);
  if (typeof positionMs !== "number" || !Number.isFinite(positionMs) || positionMs < 0) {
    throw new TypeError("Seek position must be a finite, non-negative number.");
  }
  const durationMs = config.demoMode ? demoPlayback.durationMs : state.playback?.durationMs;
  const safePosition = Math.round(clamp(positionMs, 0, durationMs || Number.MAX_SAFE_INTEGER));

  if (config.demoMode) {
    demoPlayback.progressMs = Math.min(safePosition, demoPlayback.durationMs);
    publishState({
      status: "Demo mode",
      playback: { ...demoPlayback },
      lyrics: currentLyrics,
      activeLyricIndex: activeLyricIndex(demoPlayback, currentLyrics)
    });
    return state;
  }

  if (state.playback) {
    const durationMs = state.playback.durationMs || safePosition;
    publishState({
      status: "Seeking",
      playback: {
        ...state.playback,
        progressMs: Math.min(safePosition, durationMs)
      },
      activeLyricIndex: activeLyricIndex({ ...state.playback, progressMs: safePosition }, currentLyrics)
    });
  }

  if (config.windowsMedia) await requestWindowsMedia("seek", safePosition);
  else await seekPlayback(config, safePosition);
  await refreshPlayback();
  return state;
});

ipcMain.handle("spotify:dashboard", (event) => {
  assertTrustedRenderer(event);
  shell.openExternal("https://developer.spotify.com/dashboard");
  return true;
});

ipcMain.handle("island:expanded", (event, expanded) => {
  assertTrustedRenderer(event);
  if (typeof expanded !== "boolean") throw new TypeError("Expanded state must be a boolean.");
  if (expanded !== windowExpanded) {
    setWindowBounds(expanded);
    windowExpanded = expanded;
  }
  return true;
});

ipcMain.handle("island:drag", (event, phase, grip) => {
  assertTrustedRenderer(event);
  if (phase === "cancel") { dragSession = null; return; }
  const point = screen.getCursorScreenPoint();
  if (phase === "start") {
    const bounds = mainWindow.getBounds();
    if (!grip || !Number.isFinite(grip.x) || !Number.isFinite(grip.y)) return;
    cancelSnap();
    dragSession = { grip: { x: clamp(Math.round(grip.x), 0, bounds.width),
      y: clamp(Math.round(grip.y), 0, bounds.height) }, start: point, moved: false };
    return;
  }
  if (!dragSession || !["move", "end"].includes(phase)) return;
  const drag = dragSession;
  if (phase === "end") dragSession = null;
  if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 3) return;
  drag.moved = true;
  syncContact(null);
  // The cursor chooses the destination so clamping never traps a drag at a monitor seam.
  const area = screen.getDisplayNearestPoint(point).workArea;
  const next = contain({ ...(windowExpanded ? expandedSize : compactSize),
    x: point.x - drag.grip.x, y: point.y - drag.grip.y }, area);
  if (!drag.last || ["x", "y", "width", "height"].some(k => next[k] !== drag.last[k])) {
    mainWindow.setBounds(next, false);
    drag.last = next;
  }
  if (phase === "end" && config.snapEdges) dockAfterDrag(mainWindow);
});

ipcMain.handle("island:resize-expanded", (event, requestedSize) => {
  assertTrustedRenderer(event);
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (
    !requestedSize ||
    typeof requestedSize !== "object" ||
    Array.isArray(requestedSize) ||
    typeof requestedSize.width !== "number" ||
    !Number.isFinite(requestedSize.width) ||
    typeof requestedSize.height !== "number" ||
    !Number.isFinite(requestedSize.height)
  ) {
    throw new TypeError("Resize dimensions must be finite numbers.");
  }

  const current = mainWindow.getBounds();
  if (current.width < expandedMinSize.width || current.height < expandedMinSize.height) {
    throw new Error("The island can only be resized while expanded.");
  }
  const display = screen.getDisplayMatching(current);
  const workArea = display.workArea;
  const requestedWidth = Number(requestedSize?.width);
  const requestedHeight = Number(requestedSize?.height);
  const width = Math.round(clamp(
    Number.isFinite(requestedWidth) ? requestedWidth : current.width,
    expandedMinSize.width,
    workArea.x + workArea.width - current.x
  ));
  const height = Math.round(clamp(
    Number.isFinite(requestedHeight) ? requestedHeight : current.height,
    expandedMinSize.height,
    workArea.y + workArea.height - current.y
  ));

  expandedSize = { width, height };
  cancelSnap();
  mainWindow.setBounds({ x: current.x, y: current.y, width, height }, false);
  syncContact({ x: current.x, y: current.y, width, height });
  schedulePreferenceSave();
  return { width, height };
});
