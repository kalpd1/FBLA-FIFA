// =============================================================
//  corridor.js — walk through the stadium's gallery.
//  A CSS 3D corridor: floor, ceiling lights and two walls, with
//  framed match posters hung on the left and photos and plaques
//  on the right. Scrolling moves the camera forward through the
//  hall (scroll position -> translateZ of the whole world).
// =============================================================

export function mountCorridor(root, { left, right, exit, reduced }) {
  const narrow = innerWidth < 700;
  const GAP = narrow ? 560 : 560;            // distance between exhibits along the hall
  const X = narrow ? 190 : 470;              // how far the walls are from the centre line
  const n = Math.max(left.length, right.length);
  const depth = (n + 1.4) * GAP;

  root.style.setProperty('--len', `${depth * (narrow ? .9 : 1) + innerHeight}px`);
  root.style.setProperty('--X', `${X}px`); root.style.setProperty('--gap', `${GAP}px`);
  root.innerHTML = `
    <div class="walk-stage">
      <div class="walk-world" id="walk-world">
        <div class="walk-floor" style="height:${depth + 3000}px"></div>
        <div class="walk-ceiling" style="height:${depth + 3000}px"></div>
        <div class="walk-wall l" style="width:${depth + 3000}px"></div>
        <div class="walk-wall r" style="width:${depth + 3000}px"></div>
        ${left.map((html, i) => `<div class="exhibit-l" style="--z:${(i + 1) * GAP}px;--x:${-X}px">${html}</div>`).join('')}
        ${right.map((html, i) => `<div class="exhibit-r" style="--z:${(i + 1) * GAP + GAP / 2}px;--x:${X}px">${html}</div>`).join('')}
        <div class="walk-exit" style="--z:${depth + 200}px">${exit}</div>
      </div>
      <div class="walk-fog" aria-hidden="true"></div>
      <p class="walk-hint" id="walk-hint" aria-hidden="true">Scroll to walk through the hall</p>
      <div class="walk-progress" aria-hidden="true"><i id="walk-bar"></i></div>
    </div>`;
  const world = root.querySelector('#walk-world');
  const items = [...root.querySelectorAll('.exhibit-l, .exhibit-r, .walk-exit')].map(el => ({ el, z: parseFloat(el.style.getPropertyValue('--z')) }));
  const bar = root.querySelector('#walk-bar'), hint = root.querySelector('#walk-hint');
  let raf = 0, cur = 0, target = 0;

  function measure() {
    const r = root.getBoundingClientRect();
    const total = root.offsetHeight - innerHeight;
    target = Math.max(0, Math.min(1, -r.top / total)) * depth;
  }
  function tick() {
    cur += (target - cur) * (reduced ? 1 : .12);              // ease the camera, like walking
    world.style.transform = `translate3d(0, 0, ${cur}px)`;
    bar.style.transform = `scaleX(${cur / depth})`;
    hint.style.opacity = cur > 120 ? 0 : 1;
    for (const it of items) {
      const d = it.z - cur;                                   // distance in front of the camera
      const o = d < -260 ? 0 : d < 0 ? 1 + d / 260 : Math.max(0, 1 - (d - 900) / 1600);
      it.el.style.opacity = o.toFixed(3);
      it.el.style.pointerEvents = o > .4 ? 'auto' : 'none';
    }
    raf = requestAnimationFrame(tick);
  }
  const onScroll = () => measure();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  measure(); raf = requestAnimationFrame(tick);
  return { destroy() { cancelAnimationFrame(raf); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); } };
}
