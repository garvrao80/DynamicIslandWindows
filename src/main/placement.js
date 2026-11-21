const compactSize = { width: 308, height: 63 };
const clamp = (v, max) => Math.max(0, Math.min(v, max));

function contain(bounds, area) {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return { width, height, x: area.x + clamp(bounds.x - area.x, area.width - width),
    y: area.y + clamp(bounds.y - area.y, area.height - height) };
}

// Store the horizontal center and top relative to the monitor's usable area.
function remember(bounds, area) {
  return { center: bounds.x - area.x + bounds.width / 2, top: bounds.y - area.y };
}

function restore(size, area, saved) {
  const center = Number.isFinite(saved?.center) ? saved.center : area.width / 2;
  const top = Number.isFinite(saved?.top) ? saved.top : 18;
  return contain({ ...size, x: area.x + Math.round(center - size.width / 2), y: area.y + top }, area);
}

function snap(bounds, area, threshold = 36) {
  const axis = (v, first, last) => {
    const nearest = Math.abs(v - first) <= Math.abs(v - last) ? first : last;
    return Math.abs(v - nearest) <= threshold ? nearest : v;
  };
  return { ...bounds, x: axis(bounds.x, area.x, area.x + area.width - bounds.width),
    y: axis(bounds.y, area.y, area.y + area.height - bounds.height) };
}

// Ease in for most of the pull, then settle at zero velocity without overshoot.
function snapProgress(t) {
  const u = clamp(t, 1);
  return u ** 3 * (4 - 3 * u);
}

module.exports = { compactSize, contain, remember, restore, snap, snapProgress };
