const { BrowserWindow } = require("electron");
const path = require("node:path");

// The glow belongs to the physical display border (not the taskbar work area).
// Thin click-through strips extend a little beyond the island's footprint.
function lightBounds(edge, pill, screen) {
  const across = edge === "top" || edge === "bottom";
  const size = across ? "width" : "height";
  const axis = across ? "x" : "y";
  const length = Math.min(screen[size], pill[size] + 160, 900);
  const start = Math.round(Math.max(screen[axis], Math.min(screen[axis] + screen[size] - length,
    pill[axis] + (pill[size] - length) / 2)));
  // Windows can enlarge tiny HWNDs. Give it a normal-sized transparent
  // surface and confine the visible light to the outer 16 DIPs in CSS.
  const depth = 96;
  return across
    ? { x: start, y: edge === "top" ? screen.y : screen.y + screen.height - depth, width: length, height: depth }
    : { x: edge === "left" ? screen.x : screen.x + screen.width - depth, y: start, width: depth, height: length };
}

// Load during the pull; reveal only on landing. Never activate, catch clicks,
// or keep another renderer around while the island is idle.
function prepareLights(edges, pill, display) {
  const strips = edges.filter(Boolean).map(edge => {
    const bounds = lightBounds(edge, pill, display);
    const win = new BrowserWindow({
      ...bounds, title: "Island edge light", show: false, frame: false,
      transparent: true, backgroundColor: "#00000000", hasShadow: false, thickFrame: false,
      paintWhenInitiallyHidden: false,
      focusable: false, movable: false, resizable: false, skipTaskbar: true, maximizable: false,
      enableLargerThanScreen: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    win.setBounds(bounds, false);
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, "screen-saver");
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.loadFile(path.join(__dirname, "../renderer/edge-light.html"), { hash: edge })
      .catch(() => { if (!win.isDestroyed()) win.destroy(); });
    return win;
  });
  return {
    reveal() {
      for (const win of strips) if (!win.isDestroyed()) win.showInactive();
    },
    close() {
      for (const win of strips) if (!win.isDestroyed()) win.destroy();
    }
  };
}

module.exports = { prepareLights, lightBounds };
