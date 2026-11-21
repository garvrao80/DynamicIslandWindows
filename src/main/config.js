const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const defaultConfig = {
  spotifyClientId: "",
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: 0,
  lyricOffsetMs: 0,
  songOffsets: {},
  pollIntervalMs: 5000,
  startAtLogin: false,
  position: "top-center",
  toggleShortcut: "",
  snapEdges: false,
  monitorPositions: {},
  lastDisplayId: null,
  windowPosition: null,
  expandedSize: { width: 604, height: 282 },
  windowsMedia: true,
  demoMode: false
};

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const saved = JSON.parse(raw);
    const config = { ...defaultConfig, ...saved };
    if (typeof saved.windowsMedia !== "boolean") {
      config.windowsMedia = !saved.spotifyClientId && !saved.accessToken;
    }
    // Migrate older installs that still poll every 1.5 seconds. That cadence
    // can trigger Spotify's rate limiter even when only one island is open.
    if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 5000) {
      config.pollIntervalMs = defaultConfig.pollIntervalMs;
    }
    return config;
  } catch {
    return { ...defaultConfig };
  }
}

function writeConfig(nextConfig) {
  const merged = { ...defaultConfig, ...nextConfig };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = {
  defaultConfig,
  readConfig,
  writeConfig
};
