const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, shell } = require("electron");
const path = require("node:path");
const { readConfig, writeConfig } = require("./config");
const { fetchLyrics } = require("./lyrics");
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

let mainWindow;
let tray;
let config;
let timer;
let boundsAnimation;
let lastTrackKey = "";
let lastPlaybackRefreshAt = 0;
let rateLimitUntil = 0;
let rateLimitKind = "";
let currentLyrics = { synced: [], plain: "", source: "none" };
const lyricsCache = new Map();
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
  const cacheKey = lyricsCacheKey(playback);
  if (cacheKey && lyricsCache.has(cacheKey)) {
    const cachedLyrics = lyricsCache.get(cacheKey);
    lyricsCache.delete(cacheKey);
    lyricsCache.set(cacheKey, cachedLyrics);
    return cachedLyrics;
  }

  let lyrics;
  try {
    lyrics = await fetchLyrics(playback);
  } catch {
    lyrics = { synced: [], plain: "", source: "none" };
  }

  if (cacheKey) {
    lyricsCache.set(cacheKey, lyrics);
    if (lyricsCache.size > lyricsCacheLimit) {
      lyricsCache.delete(lyricsCache.keys().next().value);
    }
  }

  return lyrics;
}

function publicConfig() {
  return {
    spotifyClientId: config.spotifyClientId,
    lyricOffsetMs: config.lyricOffsetMs,
    pollIntervalMs: config.pollIntervalMs,
    startAtLogin: config.startAtLogin,
    position: config.position,
    demoMode: config.demoMode,
    opacity: config.opacity ?? 100
  };
}

function clearPlaybackState() {
  lastTrackKey = "";
  lastPlaybackRefreshAt = 0;
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

function targetBounds(expanded = false, anchorBounds = null) {
  const display = anchorBounds ? screen.getDisplayMatching(anchorBounds) : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const size = expanded
    ? {
        width: clamp(expandedSize.width, expandedMinSize.width, width),
        height: clamp(expandedSize.height, expandedMinSize.height, height)
      }
    : { width: 308, height: 63 };
  const centerX = anchorBounds ? anchorBounds.x + anchorBounds.width / 2 : x + width / 2;
  const top = anchorBounds ? anchorBounds.y : y + 18;
  const left = Math.round(clamp(centerX - size.width / 2, x, x + width - size.width));
  const clampedTop = Math.round(clamp(top, y, y + height - size.height));

  return { x: left, y: clampedTop, ...size };
}

function setWindowBounds(expanded = false, preservePosition = true) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = targetBounds(expanded, preservePosition ? mainWindow.getBounds() : null);
  mainWindow.setBounds(target, false);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 308,
    height: 63,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, "../../assets/lyrics-island.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setBackgroundColor("#00000000");
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  setWindowBounds(false, false);
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

function createTray() {
  tray = new Tray(createIcon());
  tray.setToolTip("Lyrics Island");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show island", click: () => mainWindow?.show() },
      { label: "Hide island", click: () => mainWindow?.hide() },
      {
        label: "Demo mode",
        type: "checkbox",
        checked: config.demoMode,
        click: (item) => {
          config = writeConfig({ ...config, demoMode: item.checked });
          publishState({ status: item.checked ? "Demo mode" : "Spotify mode" });
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
    (playback.progressMs || 0) + (config.lyricOffsetMs || 0) - lyricLeadGuardMs;
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
    config: publicConfig()
  };

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("state:update", state);
  }
}

async function refreshPlayback(options = {}) {
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

    if (!config.accessToken) {
      publishState({
        status: "Connect Spotify to begin",
        ...clearPlaybackState()
      });
      return;
    }

    if (Date.now() < rateLimitUntil) {
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

    if (Date.now() > config.tokenExpiresAt - 60_000) {
      config = writeConfig(await refreshAccessToken(config));
    }

    const playback = await getCurrentPlayback(config);
    lastPlaybackRefreshAt = Date.now();
    rateLimitUntil = 0;
    rateLimitKind = "";
    const trackKey = playback.empty ? "" : playback.uri;

    if (options.waitForTrackChangeFrom && trackKey === options.waitForTrackChangeFrom) {
      return playback;
    }

    if (trackKey && trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      currentLyrics = { synced: [], plain: "", source: "loading" };
      publishState({
        status: "Loading lyrics",
        playback,
        lyrics: currentLyrics,
        activeLyricIndex: -1
      });

      currentLyrics = await lyricsForPlayback(playback);
    } else if (playback.empty) {
      lastTrackKey = "";
      currentLyrics = { synced: [], plain: "", source: "none" };
    }

    publishState({
      status: playback.empty ? "Nothing playing" : "Spotify connected",
      playback,
      lyrics: currentLyrics,
      activeLyricIndex: activeLyricIndex(playback, currentLyrics)
    });
  } catch (error) {
    if (error.message === "spotify-token-expired") {
      try {
        config = writeConfig(await refreshAccessToken(config));
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


    publishState({ status: error.message || "Playback refresh failed" });
  }
}

function startLoop() {
  clearInterval(timer);
  timer = setInterval(refreshPlayback, config.pollIntervalMs);
  refreshPlayback();
}

async function refreshAfterTrackSkip(previousTrackKey) {
  const retryDelays = [80, 140, 220, 340, 520, 760];

  publishState({ status: "Skipping track" });

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
  app.setLoginItemSettings({ openAtLogin: Boolean(config.startAtLogin) });

  createWindow();
  createTray();
  publishState({ status: "Ready" });
  startLoop();
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  clearInterval(timer);
});

ipcMain.handle("state:get", () => state);

ipcMain.handle("config:save", (_event, nextConfig) => {
  const leavingDemo = config.demoMode && nextConfig.demoMode === false;
  const enteringDemo = !config.demoMode && nextConfig.demoMode === true;
  config = writeConfig({ ...config, ...nextConfig });
  if (leavingDemo || enteringDemo) {
    rateLimitUntil = 0;
    rateLimitKind = "";
    publishState({
      status: enteringDemo ? "Demo mode" : "Connecting to Spotify",
      ...(leavingDemo ? clearPlaybackState() : {})
    });
  }
  app.setLoginItemSettings({ openAtLogin: Boolean(config.startAtLogin) });
  startLoop();
  publishState({ status: "Settings saved" });
  return state;
});

ipcMain.handle("spotify:connect", async () => {
  rateLimitUntil = 0;
  rateLimitKind = "";
  clearPlaybackState();
  const token = await startSpotifyLogin(config.spotifyClientId);
  config = writeConfig({ ...config, ...token, demoMode: false });
  publishState({ status: "Spotify connected" });
  await refreshPlayback();
  return state;
});

ipcMain.handle("spotify:control", async (_event, action) => {
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
  if (action === "previous" && playback?.progressMs > restartPreviousThresholdMs) {
    const restartedPlayback = { ...playback, progressMs: 0 };
    publishState({
      status: "Restarted track",
      playback: restartedPlayback,
      lyrics: currentLyrics,
      activeLyricIndex: activeLyricIndex(restartedPlayback, currentLyrics)
    });

    try {
      await seekPlayback(config, 0);
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
    await controlPlayback(config, action);
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

ipcMain.handle("spotify:seek", async (_event, positionMs) => {
  const safePosition = Math.max(0, Math.round(Number(positionMs) || 0));

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

  await seekPlayback(config, safePosition);
  await refreshPlayback();
  return state;
});

ipcMain.handle("spotify:dashboard", () => {
  shell.openExternal("https://developer.spotify.com/dashboard");
  return true;
});

ipcMain.handle("island:expanded", (_event, expanded) => {
  setWindowBounds(Boolean(expanded));
  return true;
});

ipcMain.handle("island:resize-expanded", (_event, requestedSize) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;

  const current = mainWindow.getBounds();
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
  mainWindow.setBounds({ x: current.x, y: current.y, width, height }, false);
  return { width, height };
});
