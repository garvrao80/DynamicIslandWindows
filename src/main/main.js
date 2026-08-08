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

let mainWindow;
let tray;
let config;
let timer;
let boundsAnimation;
let lastTrackKey = "";
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
    demoMode: config.demoMode
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

function setWindowBounds(expanded = false, animated = true) {
  if (!mainWindow) return;

  const target = targetBounds(expanded);

  if (!animated) {
    mainWindow.setBounds(target, false);
    return;
  }

  clearInterval(boundsAnimation);

  const start = mainWindow.getBounds();
  const startedAt = Date.now();
  const duration = 150;

  boundsAnimation = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const progress = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const next = {};

    for (const key of ["x", "y", "width", "height"]) {
      next[key] = Math.round(start[key] + (target[key] - start[key]) * eased);
    }

    mainWindow.setBounds(next, false);

    if (progress >= 1) {
      clearInterval(boundsAnimation);
      boundsAnimation = null;
      mainWindow.setBounds(target, false);
    }
  }, 16);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 340,
    height: 68,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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
  const progress = (playback.progressMs || 0) + (config.lyricOffsetMs || 0);
  let index = -1;

  for (let i = 0; i < lyrics.synced.length; i += 1) {
    if (lyrics.synced[i].timeMs <= progress) index = i;
    else break;
  }

  return index;
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
    if (config.demoMode || !config.accessToken) {
      demoPlayback.progressMs = (demoPlayback.progressMs + config.pollIntervalMs) % 30000;
      currentLyrics = demoLyrics;
      publishState({
        status: config.demoMode ? "Demo mode" : "Add Spotify Client ID to connect",
        playback: { ...demoPlayback },
        lyrics: currentLyrics,
        activeLyricIndex: activeLyricIndex(demoPlayback, currentLyrics)
      });
      return;
    }

    if (Date.now() > config.tokenExpiresAt - 60_000) {
      config = writeConfig(await refreshAccessToken(config));
    }

    const playback = await getCurrentPlayback(config);
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
      config = writeConfig(await refreshAccessToken(config));
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

app.whenReady().then(() => {
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
  config = writeConfig({ ...config, ...nextConfig });
  app.setLoginItemSettings({ openAtLogin: Boolean(config.startAtLogin) });
  startLoop();
  publishState({ status: "Settings saved" });
  return state;
});

ipcMain.handle("spotify:connect", async () => {
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
  setWindowBounds(Boolean(expanded), true);
  return true;
});
