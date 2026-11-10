// =============================================================
//  globe.js — the interactive globe (Room 1).
//  Orthographic projection from d3-geo drawn on a <canvas>:
//  drag to rotate, wheel/pinch to zoom, hover and click stadium pins.
//  Hidden-side pins are culled with great-circle distance.
// =============================================================
const d3 = window.d3, topojson = window.topojson;
const HOSTS = new Set(['840', '124', '484']); // USA, Canada, Mexico (ISO numeric)

export async function createGlobe(canvas, { pins, onPick, onHover, reduced }) {
  const world = await (await fetch('data/countries-110m.json')).json();
  const land = topojson.feature(world, world.objects.countries).features;
  const hosts = land.filter(f => HOSTS.has(f.id));
  const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);
  const graticule = d3.geoGraticule10();

  const ctx = canvas.getContext('2d');
  const proj = d3.geoOrthographic().clipAngle(90).precision(.35);
  const path = d3.geoPath(proj, ctx);
  let W = 0, H = 0, R = 0, dpr = 1;
  let rot = [40, -18, 0], zoom = 1, spin = !reduced, hover = null, focus = null, t0 = performance.now();
  let raf = 0, alive = true, dragging = false;

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    R = W < 900 ? Math.min(W, H) * .44 : Math.min(W - 340, H) * .4;
  }
  const cx = () => W < 900 ? W / 2 : (W - 340) / 2 + 20;
  const cy = () => W < 900 ? H * .5 : H * .52;

  function visible(p) { return d3.geoDistance([p.lon, p.lat], [-rot[0], -rot[1]]) < Math.PI / 2 - .02; }

  function draw(now) {
    const t = (now - t0) / 1000;
    if (spin && !dragging) rot[0] += .045;
    proj.translate([cx(), cy()]).scale(R * zoom).rotate(rot);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const r = R * zoom, x = cx(), y = cy();

    // atmosphere: a soft brass halo, like a spotlight on an exhibit
    const halo = ctx.createRadialGradient(x, y, r * .9, x, y, r * 1.35);
    halo.addColorStop(0, 'rgba(201,163,91,.20)'); halo.addColorStop(1, 'rgba(201,163,91,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 7); ctx.fill();

    // ocean
    const sea = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    sea.addColorStop(0, '#1C3A33'); sea.addColorStop(1, '#09140F');
    ctx.fillStyle = sea; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();

    ctx.strokeStyle = 'rgba(237,232,220,.06)'; ctx.lineWidth = 1; ctx.beginPath(); path(graticule); ctx.stroke();

    // land
    ctx.fillStyle = '#2B3A33'; ctx.beginPath(); land.forEach(f => path(f)); ctx.fill();
    ctx.strokeStyle = 'rgba(9,20,15,.9)'; ctx.lineWidth = .6; ctx.beginPath(); path(borders); ctx.stroke();

    // host nations glow brass
    ctx.fillStyle = '#4C4532'; ctx.beginPath(); hosts.forEach(f => path(f)); ctx.fill();
    ctx.strokeStyle = 'rgba(232,205,142,.55)'; ctx.lineWidth = 1; ctx.beginPath(); hosts.forEach(f => path(f)); ctx.stroke();

    // lighting: brighter top-left, darker limb
    const shade = ctx.createRadialGradient(x - r * .4, y - r * .45, r * .05, x, y, r * 1.02);
    shade.addColorStop(0, 'rgba(255,240,210,.10)'); shade.addColorStop(.6, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = shade; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();

    // pins
    for (const p of pins) {
      if (!visible(p)) { p.sx = null; continue; }
      const [px, py] = proj([p.lon, p.lat]); p.sx = px; p.sy = py;
      const on = p === hover || p === focus;
      const base = 3.2 + Math.sqrt(p.weight) * 1.1 * Math.min(zoom, 2.2) * .7;
      const pulse = reduced ? 0 : (Math.sin(t * 2.2 + p.phase) + 1) / 2;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, base * (on ? 5 : 3.4));
      glow.addColorStop(0, `rgba(232,205,142,${on ? .75 : .35 + pulse * .2})`); glow.addColorStop(1, 'rgba(232,205,142,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(px, py, base * (on ? 5 : 3.4), 0, 7); ctx.fill();
      ctx.fillStyle = on ? '#FFF6DE' : '#E8CD8E'; ctx.beginPath(); ctx.arc(px, py, base * (on ? 1.35 : 1), 0, 7); ctx.fill();
      if (on || zoom > 2.3) {
        ctx.font = `${on ? 600 : 500} ${on ? 15 : 12}px Barlow, system-ui, sans-serif`;
        ctx.fillStyle = on ? '#FFF6DE' : 'rgba(237,232,220,.75)';
        ctx.strokeStyle = 'rgba(9,20,15,.85)'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
        const label = p.label;
        ctx.strokeText(label, px + base * 2 + 4, py + 4); ctx.fillText(label, px + base * 2 + 4, py + 4);
      }
    }
    if (alive) raf = requestAnimationFrame(draw);
  }

  // ---------- interaction ----------
  const pick = (mx, my) => {
    let best = null, bd = 22;
    for (const p of pins) if (p.sx != null) { const d = Math.hypot(p.sx - mx, p.sy - my); if (d < bd) { bd = d; best = p; } }
    return best;
  };
  let last = null, moved = 0;
  const pointers = new Map(); let pinch0 = 0, zoom0 = 1;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; }
    last = [e.clientX, e.clientY]; moved = 0; dragging = true; spin = false;
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; setZoom(zoom0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0); return; }
    if (dragging && last) {
      const k = 75 / (R * zoom) * 1.6;
      const dx = e.clientX - last[0], dy = e.clientY - last[1]; moved += Math.abs(dx) + Math.abs(dy);
      rot[0] += dx * k * 1.4; rot[1] = Math.max(-75, Math.min(75, rot[1] - dy * k * 1.4));
      last = [e.clientX, e.clientY];
    }
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (h !== hover) { hover = h; canvas.style.cursor = h ? 'pointer' : 'grab'; onHover?.(h, e.clientX - r.left, e.clientY - r.top); }
    else if (h) onHover?.(h, e.clientX - r.left, e.clientY - r.top);
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (!dragging) return; dragging = false;
    const r = canvas.getBoundingClientRect();
    if (moved < 6) { const h = pick(e.clientX - r.left, e.clientY - r.top); if (h) onPick?.(h); }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; onHover?.(null); } });
  canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoom * Math.exp(-e.deltaY * .0015)); }, { passive: false });
  const setZoom = z => { zoom = Math.max(.7, Math.min(6, z)); };

  const ro = new ResizeObserver(size); ro.observe(canvas); size();
  raf = requestAnimationFrame(draw);

  // Fly the camera: rotate to a point and zoom, with eased interpolation
  function flyTo(lon, lat, z = 2.6, ms = 1600) {
    spin = false;
    if (reduced) { rot = [-lon, -lat, 0]; zoom = z; return Promise.resolve(); }
    const r0 = rot.slice(), r1 = [-lon, -lat, 0];
    // take the short way round
    while (r1[0] - r0[0] > 180) r1[0] -= 360; while (r0[0] - r1[0] > 180) r1[0] += 360;
    const ir = d3.interpolate(r0, r1), z0 = zoom, start = performance.now();
    return new Promise(res => {
      const step = now => {
        const k = Math.min(1, (now - start) / ms), e = d3.easeCubicInOut(k);
        rot = ir(e); zoom = z0 + (z - z0) * e;
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  return {
    flyTo,
    setFocus(p) { focus = p; },
    pause() { alive = false; cancelAnimationFrame(raf); },
    resume() { if (!alive) { alive = true; size(); raf = requestAnimationFrame(draw); } },
    spin(on) { spin = on && !reduced; }
  };
}
