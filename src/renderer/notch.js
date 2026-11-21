// Morph the glass silhouette, not the native window or the content layout.
(() => {
  const shell = document.getElementById("island");
  const outline = document.querySelector("#notchOutline path");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const sides = ["top", "right", "bottom", "left"];
  const directions = [[1,0], [0,1], [-1,0], [0,-1]];
  let weights = [0,0,0,0], frame;

  function draw() {
    const shaped = weights.some(Boolean);
    shell.classList.toggle("shaped", shaped);
    if (!shaped) return;
    const w = shell.offsetWidth, h = shell.offsetHeight;
    // Flare along the screen edge, then sweep farther down the free side.
    // Size from the live shell so the shoulder also scales during expansion.
    const scale = Math.max(0, Math.min(1, (h - 63) / (246 - 63)));
    const flare = 7 + 9*scale, depth = 15 + 15*scale;
    const [t,e,b,l] = weights;
    // Reserve a small shoulder only on free sides. The tips and the shared
    // corner stay flush to the screen, all inside the original footprint.
    const x0 = flare*Math.max(t,b)*(1-l), x1 = w-flare*Math.max(t,b)*(1-e);
    const y0 = flare*Math.max(l,e)*(1-t), y1 = h-flare*Math.max(l,e)*(1-b);
    const r = Math.min((y1-y0)/2, 31);
    // The glass retreats on free sides. Anchor its corner controls to those
    // same animated edges instead of the (unchanged) native window rectangle.
    shell.style.setProperty("--notch-top", y0 + "px");
    shell.style.setProperty("--notch-left", x0 + "px");
    shell.style.setProperty("--notch-right", (w-x1) + "px");
    shell.style.setProperty("--notch-bottom", (h-y1) + "px");
    const vertices = [[x0,y0], [x1,y0], [x1,y1], [x0,y1]];
    const parts = vertices.map(([x,y], i) => {
      const prev = (i+3)%4, a = weights[prev], z = weights[i];
      const free = r*(1-a)*(1-z);
      // Two free sides: a convex corner. One contact: reverse its tangent
      // on the attached side. Two contacts: both tangents meet at the vertex.
      const inLen = free + depth*z*(1-a) - flare*a*(1-z);
      const outLen = free + depth*a*(1-z) - flare*z*(1-a);
      const start = [x-directions[prev][0]*inLen, y-directions[prev][1]*inLen];
      const end = [x+directions[i][0]*outLen, y+directions[i][1]*outLen];
      return (i ? "L" : "M") + start.join(" ") + "Q" + x + " " + y + " " + end.join(" ");
    });
    const d = parts.join("") + "Z";
    shell.style.setProperty("--notch-path", 'path("' + d + '")');
    outline.setAttribute("d", d);
  }

  window.lyricsIsland.onContact(edges => {
    cancelAnimationFrame(frame);
    const from = weights.slice(), to = sides.map(s => Number(edges.includes(s)));
    const start = performance.now();
    function tick(now) {
      const u = reduced.matches ? 1 : Math.min(1, (now-start)/220);
      const mix = u*u*(3-2*u);
      weights = to.map((v,i) => from[i]+(v-from[i])*mix);
      draw();
      if (u < 1) frame = requestAnimationFrame(tick);
    }
    tick(start);
  });
  new ResizeObserver(draw).observe(shell);
})();
