const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const defaultConfig = {
  spotifyClientId: "",
  accessToken: "",
  refreshToken: "",
  tokenExpiresAt: 0,
  lyricOffsetMs: 0,
  pollIntervalMs: 1500,
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
    return { ...defaultConfig, ...JSON.parse(raw) };
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
