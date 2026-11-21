const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lyricsIsland", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  connectSpotify: () => ipcRenderer.invoke("spotify:connect"),
  openSpotifyDashboard: () => ipcRenderer.invoke("spotify:dashboard"),
  playback: (action) => ipcRenderer.invoke("spotify:control", action),
  seek: (positionMs) => ipcRenderer.invoke("spotify:seek", positionMs),
  adjustTiming: (uri, action) => ipcRenderer.invoke("lyrics:adjust-timing", uri, action),
  localLyrics: (uri, action) => ipcRenderer.invoke("lyrics:local", uri, action),
  setExpanded: (expanded) => ipcRenderer.invoke("island:expanded", expanded),
  drag: (phase, grip) => ipcRenderer.invoke("island:drag", phase, grip),
  resizeExpanded: (size) => ipcRenderer.invoke("island:resize-expanded", size),
  onDocked: (callback) => { ipcRenderer.on("island:docked", (_event, edges) => callback(edges)); },
  onContact: (callback) => { ipcRenderer.on("island:contact", (_event, edges) => callback(edges)); },
  onState: (callback) => ipcRenderer.on("state:update", (_event, state) => callback(state))
});
