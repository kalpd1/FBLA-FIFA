// =============================================================
//  museum.js — the three rooms of Full Time and the router.
//    Room 1  #globe            spin the globe, pick a stadium
//    Room 2  #stadium-<city>   the stadium hall and its match wall
//    Room 3  #match-<number>   one match as an exhibit
// =============================================================
import * as E from './engine.js';
import { fitModel, matchOdds } from './model.js';
import { loadData, VENUES, COUNTRY, code, colour, onColour, cityName, slug } from './data.js';
import { recap, scoreWorm, ordinal } from './story.js';
import { createGlobe } from './globe.js';
import { stadiumArt } from './art.js';
import { loadElo, eloOdds } from './elo.js';
import { createReplay } from './replay.js';
import { mountCorridor } from './corridor.js';
import { loadPhotos, stadiumPhoto, stadiumSet, matchSet, reel, credit } from './photos.js';
import { EVENTS, NUMBERS, L, eventItem, hubHTML, hasExtras, runScenario, shootout, compareHTML, realSummary, mins } from './whatif.js';
import { openRace, raceReport, resumeRace } from './race.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (d, o = { month: 'long', day: 'numeric' }) => new Date(d + 'T12:00:00').toLocaleDateString('en', o);
const pct = x => Math.round(x * 100) + '%';
const stageName = m => m.stage === 'G' ? `Group ${m.group}` : E.STAGE_NAMES[m.stage].replace(/s$/, '').replace('Quarter-final', 'Quarter-final');
const STAGE_RANK = { G: 0, R32: 1, R16: 2, QF: 3, SF: 4, '3P': 4, F: 5 };

const S = { data: null, real: null, byGround: {}, globe: null, art: null, filter: 'all', entered: false, observer: null };

// ---------------- helpers ----------------
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }
const venueOrder = () => Object.keys(VENUES).sort((a, b) => ({ MEX: 0, CAN: 1, USA: 2 }[VENUES[a].country] - { MEX: 0, CAN: 1, USA: 2 }[VENUES[b].country]) || cityName(a).localeCompare(cityName(b)));
const groundBySlug = s => Object.keys(VENUES).find(g => slug(g) === s);
const goalsIn = m => { const s = E.finalScore(m); return s[0] + s[1]; };
const resultNote = m => m.p ? `${Math.max(...m.p)}–${Math.min(...m.p)} on penalties` : m.et ? 'after extra time' : '';

function poster(m, big = false) {
  const s = E.finalScore(m);
  const kit = t => `--k:${colour(t)};--o:${onColour(t)}`;
  return `<div class="poster${big ? ' big' : ''}"${big ? ` style="view-transition-name:poster-${m.num}"` : ''}>
    <div class="half h1" style="${kit(m.t1)}"><b>${code(m.t1)}</b>${big ? `<span>${esc(m.t1)}</span>` : ''}</div>
    <div class="half h2" style="${kit(m.t2)}"><b>${code(m.t2)}</b>${big ? `<span>${esc(m.t2)}</span>` : ''}</div>
    <div class="pscore"><span>${s[0]}</span><i>–</i><span>${s[1]}</span></div>
    ${resultNote(m) ? `<span class="pnote">${big ? esc(resultNote(m)) : m.p ? 'Pens' : 'AET'}</span>` : ''}
  </div>`;
}

// ---------------- Photos: scrapbook prints + lightbox ----------------
const TILT = [-2.6, 1.8, -1.2, 2.8, -1.9, 1.1];
S.sets = {};
function scrapbook(key, photos, title, blurb) {
  if (!photos?.length) return '';
  S.sets[key] = photos;
  return `<section class="stands" aria-labelledby="h-${key}">
    <div class="stands-head"><h2 id="h-${key}">${esc(title)}</h2>${blurb ? `<p>${esc(blurb)}</p>` : ''}</div>
    <div class="prints">${photos.map((p, i) => `
      <button class="print" data-set="${key}" data-photo="${i}" style="--r:${TILT[i % TILT.length]}deg" aria-label="Open photo: ${esc(p.caption)}">
        <img src="${p.src}" alt="${esc(p.caption)}" loading="lazy" width="${p.w}" height="${p.h}">
        <span class="hand">${esc(p.caption)}</span>
      </button>`).join('')}</div>
  </section>`;
}
let lb = { key: null, i: 0 };
function openLightbox(key, i) {
  const set = S.sets[key]; if (!set) return;
  lb = { key, i: (i + set.length) % set.length };
  const p = set[lb.i], d = $('#lightbox');
  $('#lb-img').src = p.src; $('#lb-img').alt = p.caption;
  $('#lb-cap').textContent = p.caption;
  $('#lb-credit').textContent = credit(p); $('#lb-credit').href = p.page || '#';
  $('#lb-count').textContent = `${lb.i + 1} of ${set.length}`;
  d.querySelectorAll('.lb-nav').forEach(b => b.hidden = set.length < 2);
  if (!d.open) d.showModal();
}


// ---------------- Room 1: globe ----------------
function directoryHTML() {
  const groups = {};
  for (const g of venueOrder()) (groups[VENUES[g].country] ||= []).push(g);
  return Object.entries(groups).map(([c, gs]) => `<h2>${COUNTRY[c]}</h2><ul>${gs.map(g => `
    <li><button data-go="${slug(g)}" data-ground="${esc(g)}"><span class="d-thumb" data-thumb="${esc(g)}" aria-hidden="true"></span><span class="d-city">${esc(cityName(g))}</span><span class="d-st">${esc(VENUES[g].stadium)}</span><span class="d-n">${S.byGround[g].length}</span></button></li>`).join('')}</ul>`).join('')
    + `<a class="dataroom" href="classic.html">Open the data room: bracket, simulator and stats</a>`;
}

async function setupGlobe() {
  $('#directory').innerHTML = directoryHTML();
  const pins = Object.entries(VENUES).map(([g, v], i) => ({ ground: g, lon: v.lon, lat: v.lat, label: cityName(g), weight: S.byGround[g].length, phase: i }));
  const tip = $('#globe-tip');
  S.globe = await createGlobe($('#globe'), {
    pins, reduced,
    onHover(p, x, y) {
      if (!p) { tip.hidden = true; return; }
      const v = VENUES[p.ground];
      const h = stadiumSet(p.ground)?.hero;
      tip.innerHTML = `${h ? `<img src="${h.thumb}" alt="">` : ''}<b>${esc(v.stadium)}</b><span>${esc(cityName(p.ground))}, ${S.byGround[p.ground].length} matches</span>`;
      tip.style.transform = `translate(${x + 16}px, ${y - 12}px)`; tip.hidden = false;
    },
    onPick: p => enterStadium(p.ground)
  });
  S.pins = pins;
  document.querySelectorAll('[data-thumb]').forEach(el => { const h = stadiumSet(el.dataset.thumb)?.hero; if (h) { el.style.backgroundImage = `url("${h.thumb}")`; el.classList.add('on'); } });
  $('#directory').addEventListener('mouseover', e => { const b = e.target.closest('[data-ground]'); S.globe.setFocus(b ? pins.find(p => p.ground === b.dataset.ground) : null); });
  $('#directory').addEventListener('focusin', e => { const b = e.target.closest('[data-ground]'); if (b) S.globe.setFocus(pins.find(p => p.ground === b.dataset.ground)); });
  $('#directory').addEventListener('click', e => { const b = e.target.closest('[data-ground]'); if (b) enterStadium(b.dataset.ground); });
}
async function enterStadium(ground) {
  const v = VENUES[ground];
  $('#scene-globe').classList.add('diving');
  await S.globe.flyTo(v.lon, v.lat, 5.5, 900);
  location.hash = 'stadium-' + slug(ground);
}

// ---------------- Room 2: stadium hall ----------------
function stadiumHTML(ground) {
  const v = VENUES[ground], ms = S.byGround[ground];
  const goals = ms.reduce((s, m) => s + goalsIn(m), 0);
  const nations = new Set(ms.flatMap(m => [m.t1, m.t2]));
  const top = ms.slice().sort((a, b) => STAGE_RANK[b.stage] - STAGE_RANK[a.stage])[0];
  const wild = ms.slice().sort((a, b) => goalsIn(b) - goalsIn(a))[0];
  const order = venueOrder(), i = order.indexOf(ground);
  const prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
  const list = ms.filter(m => S.filter === 'all' || (S.filter === 'g' ? m.stage === 'G' : m.stage !== 'G'));
  const ko = ms.filter(m => m.stage !== 'G').length;
  return `<section class="stadium" aria-labelledby="st-name">
    <div class="st-hero">
      <canvas class="st-art" id="st-art" role="img" aria-label="Illustration of ${esc(v.stadium)} at night"></canvas>
      <div class="st-title">
        <p class="st-city">${esc(cityName(ground))}, ${COUNTRY[v.country]}</p>
        <h1 id="st-name">${esc(v.stadium)}</h1>
        <p class="st-fifa">Called ${esc(v.fifa)} during the tournament</p>
        <a class="walk-in" href="#walk">Walk into the hall <span aria-hidden="true">↓</span></a>
      </div>
    </div>
    <section class="walk" id="walk" aria-label="The ${esc(v.stadium)} gallery. Scroll to walk through it."></section>
    <div class="st-body">
      <dl class="placards">
        <div><dt>World Cup capacity</dt><dd>${v.cap.toLocaleString('en')}</dd></div>
        <div><dt>Opened</dt><dd>${v.opened}</dd></div>
        <div><dt>Matches here</dt><dd>${ms.length}</dd></div>
        <div><dt>Goals here</dt><dd>${goals}</dd></div>
        <div><dt>Nations who played here</dt><dd>${nations.size}</dd></div>
      </dl>
      <div class="st-notes">
        <p>Home of ${esc(v.home)}.${v.note ? ' ' + esc(v.note) : ''}</p>
        <p>Its biggest night was ${top.stage === 'G' ? 'in the group stage' : `the ${E.STAGE_NAMES[top.stage].replace(/s$/, '').toLowerCase()}`}: <a href="#match-${top.num}">${esc(top.t1)} v ${esc(top.t2)}</a>. The most goals came in <a href="#match-${wild.num}">${esc(wild.t1)} ${E.finalScore(wild).join('–')} ${esc(wild.t2)}</a>.</p>
      </div>

      ${scrapbook('st', stadiumSet(ground)?.gallery, 'From the stands', 'Every photo from the hall, up close. Click one to look closer.')}

      <div class="room-head">
        <h2>Every match at ${esc(v.stadium)}</h2>
        <div class="filters" role="group" aria-label="Show matches">
          ${[['all', `All ${ms.length}`], ['g', `Group stage ${ms.length - ko}`], ['k', `Knockouts ${ko}`]].filter(([k]) => k === 'all' || (k === 'k' ? ko : ms.length - ko)).map(([k, l]) => `<button data-filter="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="wall">${list.map(m => `
        <a class="frame${matchSet(m.num).length ? ' has-photo' : ''}" href="#match-${m.num}">
          ${poster(m)}${matchSet(m.num).length ? `<img class="tucked" src="${matchSet(m.num)[0].thumb}" alt="" loading="lazy">` : ''}
          <span class="plaque"><span class="pn">No. ${m.num}</span><b>${esc(m.t1)} v ${esc(m.t2)}</b><span>${esc(stageName(m))}, ${fmt(m.date)}</span></span>
        </a>`).join('')}</div>

      <nav class="room-nav" aria-label="Other stadiums">
        <a href="#stadium-${slug(prev)}"><small>Previous stadium</small>${esc(VENUES[prev].stadium)}</a>
        <a href="#globe" class="center">Back to the globe</a>
        <a href="#stadium-${slug(next)}" class="r"><small>Next stadium</small>${esc(VENUES[next].stadium)}</a>
      </nav>
    </div>
  </section>`;
}

function corridorFor(ground) {
  const v = VENUES[ground], ms = S.byGround[ground];
  const goals = ms.reduce((s, m) => s + goalsIn(m), 0);
  const left = ms.map(m => `<a class="frame${matchSet(m.num).length ? ' has-photo' : ''}" href="#match-${m.num}" aria-label="${esc(m.t1)} v ${esc(m.t2)}, open the exhibit">
      ${poster(m)}${matchSet(m.num).length ? `<img class="tucked" src="${matchSet(m.num)[0].thumb}" alt="" loading="lazy">` : ''}
      <span class="plaque"><span class="pn">No. ${m.num}</span><b>${esc(m.t1)} v ${esc(m.t2)}</b><span>${esc(stageName(m))}, ${fmt(m.date)}</span></span></a>`);
  const photos = (stadiumSet(ground)?.gallery || []).map((p, i) => `<button class="print" data-set="st" data-photo="${i}" style="--r:${TILT[i % TILT.length]}deg"><img src="${p.src}" alt="${esc(p.caption)}"><span class="hand">${esc(p.caption)}</span></button>`);
  const plaques = [
    `<div class="wall-plaque"><span>World Cup capacity</span><b>${v.cap.toLocaleString('en')}</b><em>Opened in ${v.opened}</em></div>`,
    `<div class="wall-plaque"><span>Home of</span><b class="txt">${esc(v.home)}</b></div>`,
    `<div class="wall-plaque"><span>${ms.length} matches, ${goals} goals</span><b>${(goals / ms.length).toFixed(2)}</b><em>goals per game</em></div>`,
    v.note ? `<div class="wall-plaque"><span>Did you know</span><b class="txt">${esc(v.note)}</b></div>` : ''
  ].filter(Boolean);
  const right = [];
  while (photos.length || plaques.length) { if (plaques.length) right.push(plaques.shift()); if (photos.length) right.push(photos.shift()); }
  const order = venueOrder(), next = order[(order.indexOf(ground) + 1) % order.length];
  const exit = `<div class="exit-door"><p>End of the hall</p><a href="#stadium-${slug(next)}">Next: ${esc(VENUES[next].stadium)}</a><a href="#globe" class="ghost">Back to the globe</a></div>`;
  return { left, right, exit };
}

// ---------------- Room 3: the match exhibit ----------------
function matchHTML(m) {
  const v = VENUES[m.ground], r = recap(m, v), s = E.finalScore(m);
  const here = S.byGround[m.ground], i = here.indexOf(m);
  const prev = here[i - 1], next = here[i + 1];
  const len = m.et ? 120 : 90;

  // timeline of moments, with kickoff, half time and full time markers,
  // plus the big non-goal moments (cards, saves, VAR) where we have them
  const T = [[0, `<li class="marker" data-sound="kickoff"><span class="mm">0'</span><p>Kickoff at ${esc(v.stadium)}, ${esc(m.time.split(' ')[0])} local time.</p></li>`]];
  if (m.ht) T.push([45.5, `<li class="marker"><span class="mm">HT</span><p>Half time, ${esc(code(m.t1))} ${m.ht[0]}–${m.ht[1]} ${esc(code(m.t2))}.</p></li>`]);
  if (m.et) T.push([90.5, `<li class="marker" data-et><span class="mm">90'</span><p>Level after 90 minutes. Extra time.</p></li>`]);
  for (const e of EVENTS[m.num] || []) T.push([mins(e.min) + .001, eventItem(e, colour, onColour)]);
  for (const g of r.moments) {
    T.push([mins(g.minute), `<li class="goal${g.decisive ? ' decisive' : ''}" data-sound="${g.decisive ? 'big' : 'goal'}" style="--k:${colour(g.team)};--o:${onColour(g.team)}">
      <span class="mm">${esc(g.minute)}'</span>
      <div class="gcard">
        <span class="gkind">${esc(g.kind)}${g.penalty ? ', penalty' : ''}${g.owngoal ? ', own goal' : ''}</span>
        <b class="gname">${esc(g.name)}</b>
        <span class="gteam">${g.owngoal ? `Counts for ${esc(g.team)}` : esc(g.team)}</span>
        <span class="grun"><span class="${g.side === 0 ? 'hot' : ''}">${g.after[0]}</span>–<span class="${g.side === 1 ? 'hot' : ''}">${g.after[1]}</span></span>
      </div></li>`]);
  }
  const items = T.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  items.push(`<li class="marker" data-sound="ft"><span class="mm">${m.et ? 'AET' : 'FT'}</span><p>Full time${m.et ? ' after extra time' : ''}: ${esc(m.t1)} ${s[0]}, ${esc(m.t2)} ${s[1]}.</p></li>`);
  if (m.p) items.push(`<li class="marker pens" data-sound="big"><span class="mm">Pens</span><p><b>${esc(r.winner)}</b> win the shootout ${Math.max(...m.p)}–${Math.min(...m.p)}.</p></li>`);

  return `<div class="ex-backdrop" id="ex-backdrop" aria-hidden="true"></div><article class="exhibit" aria-labelledby="ex-title">
    <header class="ex-hero">
      ${poster(m, true)}
      <div class="ex-head">
        <p class="ex-place"><span class="pn">No. ${m.num}</span> ${esc(stageName(m))}, ${fmt(m.date, { weekday: 'long', month: 'long', day: 'numeric' })}. <a href="#stadium-${slug(m.ground)}">${esc(v.stadium)}</a>, ${esc(cityName(m.ground))}.</p>
        <h1 id="ex-title">${esc(r.headline)}</h1>
        <p class="ex-stand">${esc(r.standfirst)}</p>
        <a class="watch" href="#h-hl" data-scroll-hl><span class="play" aria-hidden="true"></span>Watch the highlights</a>
        <a class="watch-yt" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.t1} vs ${m.t2} highlights 2026 World Cup`)}">Real footage on YouTube</a>
      </div>
    </header>

    <section class="theatre" aria-labelledby="h-hl">
      <div class="theatre-head">
        <h2 id="h-hl">Highlights</h2>
        <div class="hl-controls">
          <button class="btn-brass" id="hl-play">${r.moments.length ? 'Play all highlights' : 'Play the match'}</button>
          ${r.moments.map((g, i) => `<button class="hl-chip" data-goal="${i}" style="--k:${colour(g.team)}">${esc(g.minute)}' ${esc(g.name.split(' ').slice(-1)[0])}</button>`).join('')}
          ${hasExtras(m.num) ? '<a class="hl-whatif" href="#whatifs" data-to-wi>Change a moment</a>' : crucialGoals(m, r).length ? `<button class="hl-whatif" id="hl-whatif">${saveLabel(m, r)}</button>` : ''}${'' ? '<button class="hl-whatif" id="hl-whatif">Try to save the winner</button>' : ''}
        </div>
      </div>
      <div class="hl-stage">
        <canvas id="hl-canvas" class="hl-canvas" role="img" aria-label="Animated re-creation of the goals in ${esc(m.t1)} v ${esc(m.t2)}"></canvas>
        <div class="hl-ask" id="hl-ask" role="dialog" aria-labelledby="hl-ask-q" hidden></div>
      </div>
      <div class="whatif-out" id="whatif-out" aria-live="polite"></div>
    </section>

    ${hubHTML(m)}

    ${scrapbook('m', matchSet(m.num), 'From the stands', `Photos from ${fmt(m.date)}, taken by people who were there.`)}

    <div class="ex-grid">
      <section class="ex-story" aria-labelledby="h-story">
        <h2 id="h-story">The story</h2>
        ${r.paras.map(p => `<p>${esc(p)}</p>`).join('')}
        ${worm(m, len)}
      </section>
      <aside class="ex-side">
        ${oddsHTML(m)}
        ${meaningHTML(m, r)}
      </aside>
    </div>

    <section class="ex-moments" aria-labelledby="h-moments">
      <h2 id="h-moments">Key moments</h2>${NUMBERS[m.num] ? `<p class="ex-numbers">${esc(NUMBERS[m.num])}</p>` : ''}
      <ol class="timeline">${items.join('')}</ol>
    </section>

    <nav class="room-nav" aria-label="More matches at this stadium">
      ${prev ? `<a href="#match-${prev.num}"><small>Earlier at ${esc(v.stadium)}</small>${esc(prev.t1)} v ${esc(prev.t2)}</a>` : '<span></span>'}
      <a href="#stadium-${slug(m.ground)}" class="center">Back to ${esc(v.stadium)}</a>
      ${next ? `<a href="#match-${next.num}" class="r"><small>Later at ${esc(v.stadium)}</small>${esc(next.t1)} v ${esc(next.t2)}</a>` : '<span></span>'}
    </nav>
  </article>`;
}

// ---------------- What if: change the crucial moment ----------------
// The crucial moment is the goal that decided the match; in a draw, the
// last goal, the one that made it level.
function crucialGoal(r) { return r.moments.find(g => g.decisive) || r.moments.at(-1) || null; }
// The goals you have to stop to change the result: in a draw, the last goal;
// in a win, the winner's last few goals, as many as the winning margin.
function crucialGoals(m, r) {
  const s = E.finalScore(m);
  if (s[0] === s[1]) return r.moments.length ? [r.moments.at(-1)] : [];
  const w = s[0] > s[1] ? 0 : 1, margin = Math.abs(s[0] - s[1]);
  return r.moments.filter(g => g.side === w).slice(-margin);
}
const saveLabel = (m, r) => { const gs = crucialGoals(m, r); if (!gs.length) return ''; const s = E.finalScore(m); return s[0] === s[1] ? 'Try to save the last goal' : gs.length === 1 ? 'Try to save the winner' : `Try to save ${esc(gs[0].team)}’s last ${gs.length} goals`; };
const concededBy = (m, g) => g.side === 0 ? m.t2 : m.t1;

function startWhatIf(gs) {
  gs = [].concat(gs); S.whatIf = { goals: gs, results: [] }; $('#whatif-out').innerHTML = ''; $('#hl-ask').hidden = true;
  $('#h-hl').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  S.replay.playWhatIf(gs);
}

// Freeze on the strike and ask the viewer, as the keeper, which way to dive
function askDive(m, g, n = 1, i = 0) {
  const box = $('#hl-ask'); if (!box) return new Promise(() => {});
  const keeperFor = concededBy(m, g);
  const shot = g.owngoal ? `The ball is about to go in off ${esc(g.name)}.` : `${esc(g.name)} shoots${g.penalty ? ' from the penalty spot' : ''} for ${esc(g.team)}.`;
  box.innerHTML = `<p class="hl-ask-k">${esc(g.minute)}'. ${n > 1 ? `Shot ${i + 1} of ${n}: stop them all and the result changes.` : g.decisive ? `This is the goal that won it for ${esc(g.team)}.` : `This is the goal that made it ${g.after[0]}–${g.after[1]}.`}</p>
    <h3 id="hl-ask-q">${shot} You're in goal for ${esc(keeperFor)}. Where do you dive?</h3>
    <div class="hl-ask-btns">
      <button data-dive="up"><span aria-hidden="true">↑</span> Dive up</button>
      <button data-dive="middle">Stay in the middle</button>
      <button data-dive="down"><span aria-hidden="true">↓</span> Dive down</button>
    </div>
    <p class="hl-ask-n">Up and down are as you see the pitch.</p>`;
  box.hidden = false;
  box.querySelector('button').focus({ preventScroll: true });
  return new Promise(res => box.querySelectorAll('[data-dive]').forEach(b => b.onclick = () => { box.hidden = true; res(b.dataset.dive); }));
}

const hexState = obj => [...new TextEncoder().encode(JSON.stringify(obj))].map(b => b.toString(16).padStart(2, '0')).join('');
function showWhatIf(m, r, W) {
  const out = $('#whatif-out'); if (!out || !W.results.length) return;
  const all = W.goals, savedGoals = W.results.filter(x => x.saved).map(x => x.goal), d = { ...W.results.at(-1), saved: savedGoals.length > 0 };
  const g = savedGoals.at(-1) || all.at(-1);
  if (!d.saved) {
    out.innerHTML = `<section class="whatif"><p class="wi-k">It still went in</p>
      <h3>${all.length > 1 ? `None of your dives worked. The real result stands.` : `${esc(g.name)} beat you${d.choice === 'middle' ? ' while you stayed in the middle' : ''}. The real result stands.`}</h3>
      <div class="so-ctl left"><button id="wi-again">Try again</button></div></section>`;
    $('#wi-again').onclick = () => startWhatIf(all);
    raceReport({ match: m.num, scenario: 'save', saved: false, changed: false });
    return;
  }
  raceReport({ match: m.num, scenario: 'save', saved: true, changed: true });
  const real = E.finalScore(m), s2 = [real[0] - d.adj[0], real[1] - d.adj[1]];
  const w2 = s2[0] > s2[1] ? m.t1 : s2[1] > s2[0] ? m.t2 : null;
  let head, body = '', extra = '';
  if (m.stage === 'G') {
    head = w2 ? `${w2} win ${Math.max(...s2)}–${Math.min(...s2)}.` : `${m.t1} and ${m.t2} draw ${s2[0]}–${s2[1]}.`;
    const changed = S.data.matches.map(x => x.num === m.num ? { ...x, ft: s2 } : x);
    const T2 = E.buildTournament(S.data.groups, changed), T1 = S.real;
    const rows = T2.tables[m.group], before = T1.tables[m.group];
    const fate = (T, t) => { const i = T.tables[m.group].findIndex(x => x.team === t); return i < 2 || (i === 2 && T.bestThirds.includes(m.group)); };
    const line = t => {
      const i2 = rows.findIndex(x => x.team === t), i1 = before.findIndex(x => x.team === t), f2 = fate(T2, t), f1 = fate(T1, t);
      return `${esc(t)} finish ${ordinal(i2 + 1)} and ${f2 ? 'go through' : 'go out'}${i2 !== i1 || f2 !== f1 ? ` (really ${ordinal(i1 + 1)}, ${f1 ? 'through' : 'out'})` : ', same as really happened'}.`;
    };
    body = `<p>${line(m.t1)} ${line(m.t2)}</p>`;
    extra = `<table class="mini"><tbody>${rows.map((x, i) => `<tr class="${x.team === m.t1 || x.team === m.t2 ? 'here' : ''}"><td>${i + 1}</td><td><i style="background:${colour(x.team)}"></i>${esc(x.team)}</td><td>${x.pts} pts</td><td class="${fate(T2, x.team) ? 'through' : 'out'}">${fate(T2, x.team) ? 'Through' : 'Out'}</td></tr>`).join('')}</tbody></table>
      <a class="wi-link" href="classic.html#w-${hexState({ e: { [m.num]: s2 }, p: {} })}">See what it does to the whole bracket</a>`;
  } else if (!w2) {
    const inExtra = g.extra || (m.et && parseInt(g.minute) > 90);
    head = `Level at ${s2[0]}–${s2[1]}.`;
    body = `<p>${inExtra ? `After 120 minutes nobody is ahead, so in your version it goes to a penalty shootout instead of ${esc(r.winner)} winning in extra time.` : `After 90 minutes it's level, so in your version it goes to extra time instead of ${esc(r.winner)} winning it in normal time.`}</p>`;
  } else {
    head = `${w2} win ${Math.max(...s2)}–${Math.min(...s2)}.`;
    if (m.stage === 'F') body = `<p>In your version ${esc(w2)} are world champions, not ${esc(r.winner)}.</p>`;
    else {
      const slot = E.KO.find(x => x.a === 'W' + m.num || x.b === 'W' + m.num), nm = slot && S.data.matches.find(x => x.num === slot.num);
      const opp = nm && (nm.t1 === r.winner ? nm.t2 : nm.t1);
      body = `<p>${esc(w2)} go through without needing penalties, and ${esc(r.winner)} go home.${nm ? ` ${esc(w2)} would have played ${esc(opp)} in the ${E.STAGE_NAMES[nm.stage].replace(/s$/, '').toLowerCase()}.` : ''}</p>`;
    }
  }
  // really vs your version, side by side
  const realS = realSummary(m, r.moments, r.winner, E);
  const gLine = L(g.minute, g.name + (g.owngoal ? ' (own goal)' : ''), g.penalty ? 'pen' : 'goal');
  const lineOf = x => L(x.minute, x.name + (x.owngoal ? ' (own goal)' : ''), x.penalty ? 'pen' : 'goal');
  const mineLines = realS.lines.filter(l => l !== 'No goals').map(l => { const x = savedGoals.find(sg => lineOf(sg) === l); return x ? L(x.minute, x.name, 'you') : l; });
  void gLine;
  const cmp = (win, note, lines = mineLines, sc = s2) => compareHTML({ m, real: realS, mine: { score: sc, note, lines, winner: win }, code, colour });
  const level = m.stage !== 'G' && !w2;
  const toPens = !!(g.extra || (m.et && parseInt(g.minute) > 90));
  out.innerHTML = `<section class="whatif"><p class="wi-k">${all.length > 1 ? `You saved ${savedGoals.length} of ${all.length} shots` : `You saved ${esc(g.name)}’s shot`}</p><h3>${esc(head)}</h3>${body}${extra}
    ${cmp(w2, level ? (toPens ? 'Level after 120 minutes. Penalties.' : 'Level after 90 minutes. Extra time.') : m.stage !== 'G' && (g.extra || m.et) ? 'After extra time' : 'Full time')}
    <div class="so-ctl left">${level ? `<button class="primary" id="wi-next">${toPens ? 'Go to penalties' : 'Play extra time'}</button>` : ''}<button id="wi-again">Try again</button></div></section>`;
  $('#wi-again').onclick = () => startWhatIf(all);
  const done = (win, note, lines, sc) => {
    out.innerHTML = `<section class="whatif"><p class="wi-k">Your version</p><h3>${esc(win)} ${m.stage === 'F' ? 'win the World Cup.' : 'go through.'}</h3>
      <p>${win !== r.winner ? `In real life it was ${esc(r.winner)}.` : `Same team as in real life, ${esc(r.winner)}, but it took longer.`}</p>
      ${cmp(win, note, lines, sc)}
      <div class="so-ctl left"><button id="wi-again">Try again</button>${hasExtras(m.num) ? '<a class="wi-back" href="#whatifs">Pick another moment</a>' : ''}</div></section>`;
    $('#wi-again').onclick = () => startWhatIf(all);
  };
  const pens = async (lines, sc) => {
    const so = await shootout(out, m.t1, m.t2, { colour, code });
    done(so.winner, `${so.winner} win ${Math.max(...so.p)}–${Math.min(...so.p)} on penalties`, [...lines, `<b>Pens</b> ${so.p[0]}–${so.p[1]}`], sc);
  };
  if (level) $('#wi-next').onclick = async () => {
    if (toPens) return pens(mineLines, s2);
    // thirty more minutes: each side's chance of scoring from their Elo rating
    const o = eloOdds(m.num), sc = s2.slice(), lines = [...mineLines], items = [];
    const rate = side => .011 * (o ? (side ? o.l + o.d / 2 : o.w + o.d / 2) * 2 : 1);
    for (let t = 91; t <= 120; t++) for (const side of [0, 1]) if (Math.random() < rate(side)) {
      const team = side ? m.t2 : m.t1, pool = teamScorers(team), name = pool[Math.floor(Math.random() * pool.length)] || team;
      const before = sc.slice(); sc[side]++;
      items.push({ g: { side, team, name, minute: String(t), before, after: sc.slice(), kind: 'Goal' } }); lines.push(`<b>${t}'</b> ⚽ ${esc(name)}`);
    }
    S.replay.playScript([{ type: 'card', clock: "90'", score: s2, banner: { big: `${s2[0]} – ${s2[1]}`, small: 'Level after 90. Extra time in your version.', colour: '#C9A35B' } }, ...items],
      { title: 'Extra time, your version', end: { clock: "120'", score: sc, text: sc[0] === sc[1] ? 'Still level. Penalties.' : `${sc[0] > sc[1] ? m.t1 : m.t2} win it in extra time.` } });
    $('#h-hl').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (sc[0] === sc[1]) {
      out.innerHTML = `<section class="whatif"><p class="wi-k">Extra time</p><h3>Still ${sc[0]}–${sc[1]} after 120 minutes.</h3><div class="so-ctl left"><button class="primary" id="wi-sp">Go to penalties</button></div></section>`;
      $('#wi-sp').onclick = () => pens(lines, sc);
    } else done(sc[0] > sc[1] ? m.t1 : m.t2, 'After extra time', lines, sc);
  };
}
// everyone who scored for a team at this World Cup, for simulated goals
function teamScorers(team) {
  const out = [];
  for (const x of S.data.matches) { if (x.t1 === team) out.push(...x.goals1.filter(g => !g.owngoal).map(g => g.name)); if (x.t2 === team) out.push(...x.goals2.filter(g => !g.owngoal).map(g => g.name)); }
  return out;
}

// score difference across the match, drawn as a stepped line
function worm(m, len) {
  const pts = scoreWorm(m), W = 640, H = 150, P = 26;
  const maxD = Math.max(1, ...pts.map(p => Math.abs(p[1])));
  const X = t => P + t / (m.et ? 120 : 95) * (W - P * 2), Y = d => H / 2 - d / maxD * (H / 2 - P);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const ticks = (m.et ? [0, 45, 90, 105, 120] : [0, 45, 90]).map(t => `<text x="${X(t)}" y="${H - 4}" text-anchor="middle">${t}'</text><line x1="${X(t)}" x2="${X(t)}" y1="${P - 6}" y2="${H - P + 4}" class="tick"/>`).join('');
  return `<figure class="worm"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Who led over the 90 minutes">
    <rect x="${P}" y="${P - 6}" width="${W - P * 2}" height="${H / 2 - P + 6}" class="zone1" style="fill:${colour(m.t1)}"/>
    <rect x="${P}" y="${H / 2}" width="${W - P * 2}" height="${H / 2 - P + 4}" class="zone2" style="fill:${colour(m.t2)}"/>
    ${ticks}<line x1="${P}" x2="${W - P}" y1="${H / 2}" y2="${H / 2}" class="mid"/>
    <path d="${line}" class="wline"/>
    <text x="${P + 6}" y="${P + 10}" class="zl">${esc(code(m.t1))} ahead</text><text x="${P + 6}" y="${H - P - 2}" class="zl">${esc(code(m.t2))} ahead</text>
  </svg><figcaption>Who was winning, minute by minute.</figcaption></figure>`;
}

function prevDay(d) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); }
function oddsHTML(m) {
  const o = eloOdds(m.num);
  if (!o) return '';
  const s = E.finalScore(m), res = m.stage === 'G' ? (s[0] > s[1] ? 'w' : s[0] < s[1] ? 'l' : 'd') : (E.winnerOf(m) === m.t1 ? 'w' : 'l');
  const p = m.stage === 'G' ? o[res] : (res === 'w' ? o.w + o.d / 2 : o.l + o.d / 2);
  const fav = o.e1 + (o.home === 1 ? 100 : 0) - o.e2 - (o.home === 2 ? 100 : 0);
  const host = o.home ? (o.home === 1 ? m.t1 : m.t2) : null;
  return `<section class="card"><h3>Before kickoff</h3>
    <div class="elo">
      <div><span>${esc(code(m.t1))}</span><b>${o.e1}</b></div><em>Elo rating</em><div><b>${o.e2}</b><span>${esc(code(m.t2))}</span></div>
    </div>
    <div class="odds">
      <div style="flex:${o.w};background:${colour(m.t1)};color:${onColour(m.t1)}">${pct(o.w)}</div><div class="draw" style="flex:${o.d}">${pct(o.d)}</div><div style="flex:${o.l};background:${colour(m.t2)};color:${onColour(m.t2)}">${pct(o.l)}</div>
    </div>
    <p class="muted small">${esc(code(m.t1))} win, draw, ${esc(code(m.t2))} win in 90 minutes, from each team's World Football Elo rating going into the match${host ? `, plus home advantage for ${esc(host)}` : ''}.${m.stage !== 'G' ? ` Chance to go through: ${esc(code(m.t1))} ${pct(o.w + o.d / 2)}, ${esc(code(m.t2))} ${pct(o.l + o.d / 2)}.` : ''}</p>
    <p>${o.e1 === o.e2 ? 'The two teams were rated exactly level.' : `${esc(o.e1 > o.e2 ? m.t1 : m.t2)} were the stronger team, rated ${Math.abs(o.e1 - o.e2)} points higher${host && host !== (o.e1 > o.e2 ? m.t1 : m.t2) ? `, but ${esc(host)} had a home crowd behind them` : ''}.`}
      ${Math.abs(fav) < 25 ? 'On the day that made it close to a coin flip.' : `${esc(fav > 0 ? m.t1 : m.t2)} went in as favourites.`}
      ${p < .3 ? `<span class="upset">Upset</span> The result had only a ${pct(p)} chance.` : `The result had a ${pct(p)} chance.`}</p>
  </section>`;
}

function meaningHTML(m, r) {
  const T = S.real;
  if (m.stage === 'G') {
    const rows = T.tables[m.group];
    const fate = t => { const i = rows.findIndex(x => x.team === t); return i < 2 || (i === 2 && T.bestThirds.includes(m.group)) ? 'through' : 'out'; };
    return `<section class="card"><h3>What it meant</h3><p class="muted small">Final Group ${m.group} table</p>
      <table class="mini"><tbody>${rows.map((x, i) => `<tr class="${x.team === m.t1 || x.team === m.t2 ? 'here' : ''}"><td>${i + 1}</td><td><i style="background:${colour(x.team)}"></i>${esc(x.team)}</td><td>${x.pts} pts</td><td class="${fate(x.team)}">${fate(x.team) === 'through' ? 'Through' : 'Out'}</td></tr>`).join('')}</tbody></table></section>`;
  }
  if (m.stage === 'F') {
    const road = S.data.matches.filter(x => x.t1 === r.winner || x.t2 === r.winner);
    return `<section class="card champ"><h3>${esc(r.winner)}, world champions</h3><p class="muted small">The road to the title</p>
      <ol class="road">${road.map(x => `<li><a href="#match-${x.num}"><span>${esc(stageName(x))}</span><b>${esc(x.t1 === r.winner ? x.t2 : x.t1)}</b><span>${E.finalScore(x)[x.t1 === r.winner ? 0 : 1]}–${E.finalScore(x)[x.t1 === r.winner ? 1 : 0]}</span></a></li>`).join('')}</ol></section>`;
  }
  if (m.stage === '3P') return `<section class="card"><h3>What it meant</h3><p>${esc(r.winner)} finished third at the 2026 World Cup.</p></section>`;
  const nextSlot = E.KO.find(s => s.a === 'W' + m.num || s.b === 'W' + m.num);
  const nm = nextSlot && S.data.matches.find(x => x.num === nextSlot.num);
  const loserSlot = E.KO.find(s => s.a === 'L' + m.num || s.b === 'L' + m.num);
  const lm = loserSlot && S.data.matches.find(x => x.num === loserSlot.num);
  const opp = nm && (nm.t1 === r.winner ? nm.t2 : nm.t1);
  return `<section class="card"><h3>What it meant</h3>
    ${nm ? `<p>${esc(r.winner)} went on to the ${E.STAGE_NAMES[nm.stage].replace(/s$/, '').toLowerCase()} against ${esc(opp)}. <a href="#match-${nm.num}">See that match</a></p>` : ''}
    <p>${lm ? `${esc(r.loser)} dropped into the third-place match. <a href="#match-${lm.num}">See it</a>` : `${esc(r.loser)}'s World Cup ended here.`}</p></section>`;
}

// Moments light up and the crowd reacts as you scroll through them
function watchMoments() {
  S.observer?.disconnect();
  S.observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting || e.target.classList.contains('lit')) continue;
      e.target.classList.add('lit');
    }
  }, { threshold: .7, rootMargin: '0px 0px -15% 0px' });
  document.querySelectorAll('.timeline li').forEach(li => S.observer.observe(li));
}

// ---------------- router ----------------
function crumbs(parts) {
  $('#crumbs').innerHTML = parts.map(([href, label], i) => i === parts.length - 1 ? `<span aria-current="page">${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a>`).join('<span class="sep" aria-hidden="true">/</span>');
}

function render() {
  const h = decodeURIComponent(location.hash.slice(1));
  S.art?.stop(); S.art = null; S.observer?.disconnect(); S.corr?.destroy(); S.corr = null; S.replay?.stop(); S.replay = null;
  const hall = $('#hall');
  if (h && h !== 'globe' && !$('#intro').hidden) { clearInterval(S.reelTimer); $('#intro').classList.add('gone'); $('#intro').hidden = true; S.entered = true; }
  if (h.startsWith('stadium-') && groundBySlug(h.slice(8))) {
    const g = groundBySlug(h.slice(8));
    document.body.dataset.room = 'stadium';
    S.globe?.pause(); $('#scene-globe').hidden = true; hall.hidden = false;
    hall.innerHTML = stadiumHTML(g);
    const cols = [...new Set(S.byGround[g].flatMap(m => [colour(m.t1), colour(m.t2)]))];
    S.art = stadiumArt($('#st-art'), { seed: g, stadium: VENUES[g].stadium, colours: cols, reduced });
    stadiumPhoto(g).then(ph => {
      const hero = $('.st-hero');
      if (!ph || !hero || location.hash !== '#stadium-' + slug(g)) return;
      hero.style.setProperty('--photo', `url("${new URL(ph.src, location.href).href}")`); hero.classList.add('has-photo'); S.art?.stop();
      const txt = [ph.caption, credit(ph)].filter(Boolean).join('. ');
      hero.insertAdjacentHTML('beforeend', ph.page ? `<a class="credit" href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(txt)}</a>` : `<span class="credit">${esc(txt)}</span>`);
    });
    S.corr = mountCorridor($('#walk'), { ...corridorFor(g), reduced });
    S.sets.st = stadiumSet(g)?.gallery || [];
    crumbs([['#globe', 'Globe'], ['', VENUES[g].stadium]]);
    document.title = `${VENUES[g].stadium} | Full Time`;
  } else if (h.startsWith('match-') && S.data.matches.some(m => m.num === +h.slice(6))) {
    const m = S.data.matches.find(x => x.num === +h.slice(6));
    document.body.dataset.room = 'match';
    S.globe?.pause(); $('#scene-globe').hidden = true; hall.hidden = false;
    hall.innerHTML = matchHTML(m);
    watchMoments();
    const rc = recap(m, VENUES[m.ground]);
    S.replay = createReplay($('#hl-canvas'), m, rc.moments, { colour, onColour, code, reduced });
    const chips = [...document.querySelectorAll('.hl-chip')];
    S.replay.on('goal', g => chips.forEach((c, i) => c.classList.toggle('on', rc.moments[i] === g)));
    S.replay.on('end', () => { chips.forEach(c => c.classList.remove('on')); if (S.whatIf) { showWhatIf(m, rc, S.whatIf); S.whatIf = null; } });
    const cg = crucialGoal(rc);
    if (cg) {
      S.replay.on('ask', ({ goal }) => { const gs = S.whatIf?.goals || [goal]; return askDive(m, goal, gs.length, gs.indexOf(goal)); });
      S.replay.on('decided', d => { S.whatIf?.results.push(d); });
      if ($('#hl-whatif')) $('#hl-whatif').onclick = () => startWhatIf(crucialGoals(m, rc));
    }
    const wctx = { m, rc, replay: S.replay, out: $('#whatif-out'), theatre: $('#h-hl'), colour, code, startSave: () => startWhatIf(crucialGoals(m, rc)),
      realSummary: () => realSummary(m, rc.moments, rc.winner, E), finish: raceReport };
    document.querySelectorAll('[data-wi]').forEach(b => b.onclick = () => { $('#hl-ask').hidden = true; S.whatIf = null; runScenario(b.dataset.wi, wctx); });
    $('[data-to-wi]')?.addEventListener('click', e => { e.preventDefault(); $('#whatifs').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); });
    $('#hl-play').onclick = () => { $('#hl-ask').hidden = true; S.whatIf = null; S.replay.playAll(); };
    chips.forEach((c, i) => c.onclick = () => { $('#hl-ask').hidden = true; S.whatIf = null; S.replay.playOne(rc.moments[i]); });
    if (S.autoHL) setTimeout(() => S.replay?.playAll(), 900);
    const own = matchSet(m.num)[0];
    (own ? Promise.resolve(own) : stadiumPhoto(m.ground)).then(ph => { const b = $('#ex-backdrop'); if (ph && b) { b.style.backgroundImage = `url("${ph.src}")`; b.classList.add('on'); if (own) b.classList.add('strong'); } });
    crumbs([['#globe', 'Globe'], ['#stadium-' + slug(m.ground), VENUES[m.ground].stadium], ['', `${code(m.t1)} v ${code(m.t2)}`]]);
    document.title = `${m.t1} v ${m.t2} | Full Time`;
  } else {
    document.body.dataset.room = 'globe';
    hall.hidden = true; hall.innerHTML = '';
    $('#scene-globe').hidden = false; $('#scene-globe').classList.remove('diving');
    S.globe?.resume();
    if (S.entered) S.globe?.flyTo(-97, 38, innerWidth < 600 ? 2.1 : 2.6, 1400);
    crumbs([['', 'Globe']]);
    document.title = 'Full Time';
  }
  window.scrollTo(0, 0);
  if (document.body.dataset.room !== 'globe') hall.focus({ preventScroll: true });
}
function go() {
  if (document.startViewTransition && !reduced) document.startViewTransition(render);
  else render();
}

// ---------------- events ----------------
document.addEventListener('click', e => {
  const f = e.target.closest('[data-filter]');
  if (f) { S.filter = f.dataset.filter; const g = groundBySlug(location.hash.slice(9)); const tmp = document.createElement('div'); tmp.innerHTML = stadiumHTML(g); $('.wall').replaceWith($('.wall', tmp)); $('.filters').replaceWith($('.filters', tmp)); }
  const pr = e.target.closest('[data-photo]');
  if (pr) { openLightbox(pr.dataset.set, +pr.dataset.photo); return; }
  if (e.target.closest('#lb-prev')) return openLightbox(lb.key, lb.i - 1);
  if (e.target.closest('#lb-next')) return openLightbox(lb.key, lb.i + 1);
  if (e.target.closest('#lb-close') || e.target.id === 'lightbox') return $('#lightbox').close();
  if (e.target.closest('[data-scroll-hl]')) { e.preventDefault(); $('#h-hl').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); S.replay?.playAll(); return; }
  if (e.target.closest('.walk-in')) { e.preventDefault(); scrollTo({ top: $('#walk').offsetTop + 2, behavior: reduced ? 'auto' : 'smooth' }); return; }
  if (e.target.closest('#enter-btn')) { enter(); return; }
  if (e.target.closest('.mark') && document.body.dataset.room === 'globe') { e.preventDefault(); showIntro(); return; }
  if (e.target.closest('[data-race-start]')) { openRace({ onStart: () => { if (!$('#intro').hidden) enter(); if (location.hash && location.hash !== '#globe') location.hash = 'globe'; } }); return; }
  if (e.target.closest('a[href="#whatifs"]') && $('#whatifs')) { e.preventDefault(); $('#whatifs').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); return; }
  const fr = e.target.closest('.frame');
  S.autoHL = !!fr;
});

document.addEventListener('keydown', e => {
  if (!$('#lightbox').open) return;
  if (e.key === 'ArrowLeft') openLightbox(lb.key, lb.i - 1);
  if (e.key === 'ArrowRight') openLightbox(lb.key, lb.i + 1);
});

// The entrance: a slow reel of photos from the tournament behind the title
function startReel() {
  const photos = reel(), box = $('#reel'); if (!box || !photos.length) return;
  box.innerHTML = photos.map((p, i) => `<div class="slide${i ? '' : ' on'}" style="background-image:url('${p.src}')"></div>`).join('');
  const cap = $('#reel-cap'); let i = 0;
  const show = () => { cap.textContent = photos[i].caption; cap.title = credit(photos[i]); };
  show();
  if (reduced) return;
  S.reelTimer = setInterval(() => {
    const slides = box.children; slides[i].classList.remove('on'); i = (i + 1) % photos.length; slides[i].classList.add('on'); show();
  }, 5200);
}

function enter() {
  clearInterval(S.reelTimer);
  S.entered = true;
  $('#intro').classList.add('gone');
  setTimeout(() => { if ($('#intro').classList.contains('gone')) $('#intro').hidden = true; }, 900);
  S.globe?.flyTo(-97, 38, innerWidth < 600 ? 2.1 : 2.6, 2200);
}

// back to the very beginning: the title screen with the photo reel
function showIntro() {
  const intro = $('#intro'); if (!intro) return;
  intro.hidden = false; void intro.offsetWidth; intro.classList.remove('gone');
  clearInterval(S.reelTimer); startReel();
  $('#enter-btn').focus();
}

// ---------------- boot ----------------
(async function boot() {
  try { S.data = await loadData(); }
  catch { document.body.innerHTML = '<p style="padding:40px;color:#EDE8DC">Could not load match data. Open it through a local web server (for example <code>python3 -m http.server</code>) rather than as a file.</p>'; return; }
  S.real = E.buildTournament(S.data.groups, S.data.matches);
  for (const g of Object.keys(VENUES)) S.byGround[g] = [];
  for (const m of S.data.matches) S.byGround[m.ground]?.push(m);
  for (const g in S.byGround) S.byGround[g].sort((a, b) => a.date.localeCompare(b.date) || a.num - b.num);

  await Promise.all([loadPhotos(), loadElo()]);
  await setupGlobe();
  window.addEventListener('hashchange', go);
  const h = location.hash.slice(1);
  if (h && h !== 'globe') { $('#intro').classList.add('gone'); $('#intro').hidden = true; S.entered = true; }
  else {
    startReel();
    $('#enter-btn').focus();
  }
  render();
  resumeRace();
})();
