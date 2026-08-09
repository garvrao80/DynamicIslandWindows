const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const defaultConfig = {
  spotifyClientId: "",
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: 0,
  lyricOffsetMs: 0,
  pollIntervalMs: 5000,
  startAtLogin: false,
  position: "top-center",
  demoMode: true
};

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    const config = { ...defaultConfig, ...JSON.parse(raw) };
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
