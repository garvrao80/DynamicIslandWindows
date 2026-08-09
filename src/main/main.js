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
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="#101113"/>
      <path d="M20 39V18h24v21c0 5-4 9-9 9s-9-4-9-9h6c0 2 1 3 3 3s3-1 3-3V24H26v15h-6z" fill="#f5f7fb"/>
      <circle cx="43" cy="42" r="4" fill="#4ee3b1"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function targetBounds(expanded = false) {
  const display = screen.getPrimaryDisplay();
  const { x, y, width } = display.workArea;
  const size = expanded ? { width: 700, height: 326 } : { width: 340, height: 68 };
  const top = y + 18;
  const left = x + Math.round((width - size.width) / 2);

  return { x: left, y: top, ...size };
}

function setWindowBounds(expanded = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const target = targetBounds(expanded);
  mainWindow.setBounds(target, false);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 68,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  setWindowBounds(false);
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
  const progress = (playback.progressMs || 0) + (config.lyricOffsetMs || 0);
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

async function refreshPlayback() {
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

    if (trackKey && trackKey !== lastTrackKey) {
      lastTrackKey = trackKey;
      currentLyrics = await fetchLyrics(playback);
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

  if ((action === "play" || action === "pause") && state.playback) {
    publishState({
      status: action === "play" ? "Playing" : "Paused",
      playback: { ...state.playback, isPlaying: action === "play" }
    });
  }

  await controlPlayback(config, action);
  await refreshPlayback();
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
