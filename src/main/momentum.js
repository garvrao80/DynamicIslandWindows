// Logical screen units (DIPs) and monotonic milliseconds. Sample actual window
// positions so pushing against a screen edge doesn't build up launch speed.
const sampleWindow = 85;
function sample(history, bounds, at) {
  while (history.length && at - history[0].at > sampleWindow) history.shift();
  history.push({ x: bounds.x, y: bounds.y, at });
}

function releaseGlide(history) {
  const end = history.at(-1);
  if (!end) return null;
  let first = end, direction;
  for (let i = history.length - 2; i >= 0; i--) {
    const p = history[i], dx = first.x - p.x, dy = first.y - p.y;
    if (dx || dy) {
      // A pause or reversal ends the older gesture; don't fling the wrong way.
      if ((!direction && end.at - first.at > 45) ||
          (direction && dx * direction.x + dy * direction.y < 0)) break;
      direction ??= {x:dx, y:dy};
    }
    first = p;
  }
  const ms = end.at - first.at, dx = end.x-first.x, dy = end.y-first.y;
  const length = Math.hypot(dx, dy);
  if (ms < 10 || length < 12) return null;
  const speed = length / ms;
  if (speed <= 0.65) return null;
  const distance = Math.min(90, (speed - 0.65) * 68);
  if (distance < 2) return null;
  return { speed, dx: dx / length * distance, dy: dy / length * distance,
    duration: Math.max(150, Math.min(210, 3 * distance / speed)) };
}

// Project the release direction onto this monitor's usable perimeter. Unlike
// ordinary snapping this does not widen the capture zone behind or beside you.
function throwTarget(from, area, glide) {
  if (!glide || glide.speed < 1.25) return null;
  const magnitude = Math.hypot(glide.dx, glide.dy);
  if (!magnitude) return null;
  const ux = glide.dx / magnitude, uy = glide.dy / magnitude;
  const reach = Math.min(420, glide.speed * 180);
  const edgeX = ux < 0 ? area.x : area.x + area.width - from.width;
  const edgeY = uy < 0 ? area.y : area.y + area.height - from.height;
  const tx = ux ? (edgeX - from.x) / ux : Infinity;
  const ty = uy ? (edgeY - from.y) / uy : Infinity;
  const travel = Math.min(tx, ty);
  if (travel < 0 || travel > reach) return null;
  const hitX = tx <= ty;
  if (Math.abs(hitX ? ux : uy) < 0.32) return null; // grazing, not aiming at this side
  let x = hitX ? edgeX : Math.round(from.x + ux * travel);
  let y = hitX ? Math.round(from.y + uy * travel) : edgeY;
  // Allow a little angular error on a diagonal throw, not on a parallel one.
  if (Math.abs(ux) >= 0.32 && Math.abs(uy) >= 0.32 &&
      Math.hypot(edgeX-from.x, edgeY-from.y) <= reach &&
      Math.hypot(edgeX-x, edgeY-y) <= 48) {
    x = edgeX; y = edgeY;
  }
  return { ...from, x, y };
}
module.exports = { sample, releaseGlide, throwTarget };
