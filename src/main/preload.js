const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyricsIsland", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  connectSpotify: () => ipcRenderer.invoke("spotify:connect"),
  openSpotifyDashboard: () => ipcRenderer.invoke("spotify:dashboard"),
  playback: (action) => ipcRenderer.invoke("spotify:control", action),
  seek: (positionMs) => ipcRenderer.invoke("spotify:seek", positionMs),
  setExpanded: (expanded) => ipcRenderer.invoke("island:expanded", expanded),
  resizeExpanded: (size) => ipcRenderer.invoke("island:resize-expanded", size),
  onState: (callback) => ipcRenderer.on("state:update", (_event, state) => callback(state))
});
