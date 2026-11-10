// =============================================================
//  app.js — UI: router, global state, and every page.
//  Vanilla ES modules, no framework, no build step.
// =============================================================
import * as E from './engine.js';
import { fitModel, matchOdds } from './model.js';
import { loadData, VENUES, code, colour, onColour, cityName } from './data.js';
import { MAP, project } from './geo.js';
import { t, setLang, getLang, LANGS, fmtDate } from './i18n.js';

// ---------------- global state ----------------
const S = {
  data: null,         // { groups, matches, source }
  days: [],           // every date of the tournament
  date: null,         // where the timeline handle is
  edits: {},          // what-if group scores  { matchNum: [a, b] }
  picks: {},          // what-if knockout winners { matchNum: team }
  myTeam: store('ft-team') || '',
  city: 'New York/New Jersey (East Rutherford)',
  group: 'A',
  sim: null,
  route: 'bracket', param: null
};
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

// ---------------- derived data (memoised) ----------------
let memo = {};
const key = () => JSON.stringify([S.date, S.edits, S.picks, S.data?.matches.length, memo.v]);
function effective() {
  // the match list with any what-if edits applied
  return S.data.matches.map(m => S.edits[m.num]
    ? { ...m, ft: S.edits[m.num], ht: null, et: null, p: null, goals1: [], goals2: [], edited: true }
    : m);
}
function tour() {
  const k = key();
  if (memo.k !== k) {
    memo.k = k;
    memo.eff = effective();
    memo.t = E.buildTournament(S.data.groups, memo.eff, { upTo: S.date, picks: S.picks });
  }
  return memo.t;
}
function realTour() { // reality, as of the timeline date (no edits)
  if (memo.rk !== S.date + memo.v) { memo.rk = S.date + memo.v; memo.rt = E.buildTournament(S.data.groups, S.data.matches, { upTo: S.date }); }
  return memo.rt;
}
function realFinal() { // reality at the end of the tournament
  if (!memo.rf) memo.rf = E.buildTournament(S.data.groups, S.data.matches);
  return memo.rf;
}
const played = m => m.ft && m.date <= S.date;
const whatIfActive = () => Object.keys(S.edits).length + Object.keys(S.picks).length > 0;

// ---------------- small render helpers ----------------
function chip(team, { link = true, full = true } = {}) {
  if (!team) return '<span class="tbd">TBD</span>';
  const inner = `<i style="background:${colour(team)}"></i><b>${code(team)}</b>${full ? `<span>${esc(team)}</span>` : ''}`;
  return link ? `<a class="chip" href="#team-${code(team)}">${inner}</a>` : `<span class="chip">${inner}</span>`;
}
function scoreText(m) {
  const s = E.finalScore(m);
  return `${s[0]}–${s[1]}`;
}
function board(m) {
  const done = played(m);
  const w = done ? (m.stage === 'G' ? (m.ft[0] > m.ft[1] ? m.t1 : m.ft[1] > m.ft[0] ? m.t2 : null) : E.winnerOf(m)) : null;
  const cls = tm => !w ? '' : w === tm ? 'win' : 'lose';
  const note = done ? (m.p ? `${t('pens')} ${m.p[0]}–${m.p[1]}` : m.et ? t('afterEt') : t('fullTime')) : m.time;
  const stage = m.stage === 'G' ? `Group ${m.group}` : E.STAGE_NAMES[m.stage];
  const mine = S.myTeam && (m.t1 === S.myTeam || m.t2 === S.myTeam) ? ' mine' : '';
  return `<div class="board${mine}" role="button" tabindex="0" data-match="${m.num}" aria-label="${esc(m.t1)} versus ${esc(m.t2)}, open match centre">
    <div class="side ${cls(m.t1)}">${chip(m.t1, { link: false })}</div>
    <div class="score">${done ? scoreText(m) : 'vs'}</div>
    <div class="side right ${cls(m.t2)}">${chip(m.t2, { link: false })}</div>
    <div class="meta"><span>${stage}${m.edited ? ' <span class="tag flare">edited</span>' : ''}</span><span>${esc(cityName(m.ground))}, ${esc(note)}</span></div>
  </div>`;
}
function groupTableHTML(g, rows, { compare = null } = {}) {
  const T = tour();
  const thirdIn = T.groupsDone && T.bestThirds.includes(g);
  return `<div class="gtable"><h3><span>Group<span class="gl">${g}</span></span><span class="small muted">${rows[0].p ? '' : 'not started'}</span></h3>
  <table><thead><tr><th>${t('team')}</th><th title="Played">P</th><th title="Goal difference">GD</th><th title="Goals for">GF</th><th title="Points">Pts</th></tr></thead><tbody>
  ${rows.map((r, i) => {
    let mv = '';
    if (compare) {
      const before = compare.findIndex(x => x.team === r.team);
      if (before > i) mv = `<span class="move up" title="Up ${before - i} vs reality">▲${before - i}</span>`;
      if (before < i) mv = `<span class="move down" title="Down ${i - before} vs reality">▼${i - before}</span>`;
    }
    const q = i < 2 ? 'q1' : i === 2 && thirdIn ? 'q3' : '';
    return `<tr class="${q}${r.team === S.myTeam ? ' mine' : ''}"><td>${chip(r.team)}${mv}</td><td>${r.p}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td>${r.gf}</td><td class="pts">${r.pts}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
const legend = () => `<div class="legend"><span><i style="background:var(--turf)"></i>Top two qualify</span><span><i style="background:var(--gold)"></i>One of the 8 best third-placed teams</span></div>`;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

// ---------------- timeline ribbon ----------------
function renderRibbon() {
  const el = $('#ribbon');
  const show = ['rewind', 'bracket', 'simulate', 'map'].includes(S.route);
  el.hidden = !show;
  if (!show) return;
  const idx = S.days.indexOf(S.date);
  const byDay = {};
  for (const m of S.data.matches) (byDay[m.date] ||= []).push(m);
  // stage labels positioned where each stage starts
  const starts = [];
  for (const st of ['G', 'R32', 'R16', 'QF', 'SF', 'F']) {
    const first = S.data.matches.filter(m => m.stage === st).map(m => m.date).sort()[0];
    if (first) starts.push([st, S.days.indexOf(first)]);
  }
  const labels = starts.map(([st, i], k) => {
    const end = k + 1 < starts.length ? starts[k + 1][1] : S.days.length;
    return `<span style="width:${(end - i) / S.days.length * 100}%">${st === 'G' ? t('groupStage') : st}</span>`;
  }).join('');
  const label = dayLabel(S.date);
  el.innerHTML = `<div class="ribbon-inner">
    <div class="ribbon-date" aria-live="polite"><b>${fmtDate(S.date, { month: 'short', day: 'numeric' })}</b><span>${esc(label)}</span>
      <div class="ribbon-btns"><button data-jump="0">Kickoff</button><button data-jump="groups">Groups end</button><button data-jump="end">Final</button></div></div>
    <div class="track">
      <div class="days">${S.days.map((d, i) => `<div class="day${i <= idx ? ' past' : ''}${i === idx ? ' today' : ''}">${(byDay[d] || []).map(m => `<span class="dot ${m.stage === 'G' ? 'G' : 'KO'}"></span>`).join('')}</div>`).join('')}</div>
      <div class="phase-labels" aria-hidden="true">${labels}</div>
      <div class="handle" style="left:${(idx + .5) / S.days.length * 100}%"></div>
      <input type="range" min="0" max="${S.days.length - 1}" value="${idx}" aria-label="${t('dragHint')}" aria-valuetext="${fmtDate(S.date, { month: 'long', day: 'numeric' })}, ${esc(label)}">
    </div></div>`;
  const input = $('input', el);
  input.addEventListener('input', () => setDate(S.days[+input.value], true));
  el.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const j = b.dataset.jump;
    setDate(j === 'end' ? S.days.at(-1) : j === 'groups' ? S.data.matches.filter(m => m.stage === 'G').map(m => m.date).sort().at(-1) : S.days[0]);
  });
}
function dayLabel(d) {
  const ms = S.data.matches.filter(m => m.date === d);
  if (!ms.length) return 'Rest day';
  const st = ms[0].stage;
  if (st === 'G') return `${t('groupStage')}, matchday ${[...new Set(S.data.matches.filter(m => m.stage === 'G').map(m => m.date))].sort().indexOf(d) + 1}`;
  return E.STAGE_NAMES[st];
}
let raf = 0;
function setDate(d, fromSlider = false) {
  S.date = d;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (fromSlider) { // update ribbon in place so the slider keeps focus while dragging
      const el = $('#ribbon'), idx = S.days.indexOf(d);
      el.querySelectorAll('.day').forEach((n, i) => { n.classList.toggle('past', i <= idx); n.classList.toggle('today', i === idx); });
      $('.handle', el).style.left = (idx + .5) / S.days.length * 100 + '%';
      $('.ribbon-date b', el).textContent = fmtDate(d, { month: 'short', day: 'numeric' });
      $('.ribbon-date span', el).textContent = dayLabel(d);
    } else renderRibbon();
    renderPage();
  });
}

// ---------------- pages ----------------
const PAGES = {};

// ===== Rewind =====
PAGES.rewind = () => {
  const T = tour();
  const eff = memo.eff;
  const today = eff.filter(m => m.date === S.date);
  const sofar = eff.filter(played);
  const goals = sofar.reduce((s, m) => s + E.finalScore(m)[0] + E.finalScore(m)[1], 0);
  const top = E.scorers(sofar)[0];
  const groupsOver = T.groupsDone;
  const alive = new Set();
  if (groupsOver) {
    // "still in it" = could still lift the trophy
    for (let n = 73; n <= 88; n++) { const k = T.ko[n]; if (k.t1) alive.add(k.t1); if (k.t2) alive.add(k.t2); }
    for (let n = 73; n <= 104; n++) { if (n !== 103 && T.ko[n].loser) alive.delete(T.ko[n].loser); }
  }
  let mine = '';
  if (S.myTeam) {
    const last = sofar.filter(m => m.t1 === S.myTeam || m.t2 === S.myTeam).at(-1);
    const next = eff.find(m => m.date > S.date && (m.t1 === S.myTeam || m.t2 === S.myTeam));
    const g = Object.entries(T.tables).find(([, rows]) => rows.some(r => r.team === S.myTeam));
    const pos = g && g[1].findIndex(r => r.team === S.myTeam) + 1;
    mine = `<div class="panel mine"><h3>${t('myTeam')}: ${esc(S.myTeam)}</h3>
      <p class="small">${g ? `${['1st', '2nd', '3rd', '4th'][pos - 1]} in Group ${g[0]}` : ''}${groupsOver ? (alive.has(S.myTeam) ? ', still alive' : ', out of the tournament') : ''}</p>
      ${last ? `<p class="small muted">Last match</p>${board(last)}` : ''}
      ${next ? `<p class="small muted" style="margin-top:10px">Next: ${fmtDate(next.date)} vs ${esc(next.t1 === S.myTeam ? next.t2 : next.t1)}</p>` : ''}</div>`;
  }
  return `
  ${hero(today, sofar, goals, top)}
  ${whatIfActive() ? '<p style="margin:-8px 0 20px"><a class="btn" href="#bracket"><span class="tag flare">What-if active</span> View your bracket</a></p>' : ''}
  <div class="grid-2">
    <div>
      <h2>${t('onThisDay')}</h2>
      <div class="boards">${today.length ? today.map(board).join('') : `<div class="empty">${t('noMatches')}</div>`}</div>
      ${mine ? `<div style="margin-top:16px">${mine}</div>` : ''}
    </div>
    <div>
      ${groupsOver ? (alive.size === 1
        ? `<a class="champion-card" href="#team-${code([...alive][0])}" style="--kit:${colour([...alive][0])}"><span class="cup" aria-hidden="true">★</span><span><small>World champions</small><b>${esc([...alive][0])}</b></span></a>`
        : `<h2>Still in it (${alive.size})</h2><div class="panel" style="display:flex;flex-wrap:wrap;gap:10px 18px;margin-bottom:28px">${[...alive].map(x => chip(x)).join('')}</div>`) : ''}
      <h2>${groupsOver ? 'Final group tables' : 'Group tables'}</h2>
      ${legend()}
      <div class="groups">${Object.entries(T.tables).map(([g, rows]) => groupTableHTML(g, rows)).join('')}</div>
    </div>
  </div>`;
};

// The poster at the top of Rewind: the day's headline match on two kit-coloured slabs
const STAGE_WEIGHT = { F: 6, '3P': 4, SF: 5, QF: 3, R16: 2, R32: 1, G: 0 };
function hero(today, sofar, goals, top) {
  const m = today.slice().sort((a, b) => STAGE_WEIGHT[b.stage] - STAGE_WEIGHT[a.stage] || (E.finalScore(b)[0] + E.finalScore(b)[1]) - (E.finalScore(a)[0] + E.finalScore(a)[1]))[0];
  const fresh = S.heroDate !== S.date; S.heroDate = S.date;
  const cities = new Set(today.map(x => x.ground)).size;
  const sub = today.length ? `${today.length} match${today.length > 1 ? 'es' : ''} in ${cities} cit${cities > 1 ? 'ies' : 'y'}. Click the score for the full match.` : 'No football today. Drag the timeline to the next matchday.';
  const slab = tm => `<div class="slab" style="--kit:${colour(tm)};--on:${onColour(tm)}"><b>${code(tm)}</b><span>${esc(tm)}</span></div>`;
  let marquee = '';
  if (m) {
    const sc = E.finalScore(m), note = m.p ? `${t('pens')} ${m.p[0]}–${m.p[1]}` : m.et ? t('afterEt') : t('fullTime');
    marquee = `<div class="marquee${fresh ? ' fresh' : ''}" role="button" tabindex="0" data-match="${m.num}" aria-label="${esc(m.t1)} ${sc[0]}, ${esc(m.t2)} ${sc[1]}. Open match centre">
      ${slab(m.t1)}<div class="mscore"><div><b>${sc[0]}</b><i>–</i><b>${sc[1]}</b></div><small>${esc(note)}</small><small class="where">${esc(VENUES[m.ground]?.stadium || '')}</small></div>${slab(m.t2)}</div>`;
  }
  return `<section class="hero" aria-label="${esc(dayLabel(S.date))}">
    <svg class="chalk" viewBox="0 0 1050 680" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="20" y="20" width="1010" height="640" rx="2"/><line x1="525" y1="20" x2="525" y2="660"/><circle cx="525" cy="340" r="92"/><circle cx="525" cy="340" r="4" class="spot"/>
      <rect x="20" y="138" width="165" height="404"/><rect x="20" y="248" width="55" height="184"/><rect x="865" y="138" width="165" height="404"/><rect x="975" y="248" width="55" height="184"/>
      <path d="M185 288 A92 92 0 0 1 185 392"/><path d="M865 288 A92 92 0 0 0 865 392"/>
    </svg>
    <div class="hero-copy">
      <p class="kicker">${fmtDate(S.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <h1>${esc(dayLabel(S.date))}</h1>
      <p class="hero-sub">${sub}</p>
    </div>
    ${marquee}
    <dl class="hero-stats">
      <div><dt>${t('played')}</dt><dd>${sofar.length}<small>/104</small></dd></div>
      <div><dt>${t('goals')}</dt><dd>${goals}</dd></div>
      <div><dt>${t('perGame')}</dt><dd>${sofar.length ? (goals / sofar.length).toFixed(2) : '0.00'}</dd></div>
      <div><dt>${t('leader')}</dt><dd>${top ? top.goals : 0}<small>${top ? esc(top.name) : 'No goals yet'}</small></dd></div>
    </dl>
  </section>`;
}

// ===== Bracket + what-if =====
const R32_ORDER = [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87];
const COLS = [['R32', R32_ORDER], ['R16', [89, 90, 93, 94, 91, 92, 95, 96]], ['QF', [97, 98, 99, 100]], ['SF', [101, 102]], ['F', [104]]];
function slotName(c) {
  if (c.startsWith('3:')) return `3rd ${c.slice(2).split('').join('/')}`;
  if (c[0] === 'W') return `Winner M${c.slice(1)}`;
  if (c[0] === 'L') return `Loser M${c.slice(1)}`;
  return `${c[0] === '1' ? 'Winner' : 'Runner-up'} ${c[1]}`;
}
PAGES.bracket = () => {
  const T = tour(), R = realTour(), RF = realFinal();
  const nChanges = Object.keys(S.edits).length + Object.keys(S.picks).length;
  const cell = (num, stage) => {
    const k = T.ko[num], r = R.ko[num];
    const changed = whatIfActive() && (k.t1 !== r.t1 || k.t2 !== r.t2 || k.winner !== r.winner);
    const real = S.data.matches.find(m => m.num === num);
    const canPick = k.t1 && k.t2 && !k.result;
    const row = (team, slot, side) => {
      const sc = k.result ? E.finalScore(k.result)[side] + (k.result.p ? `<small> (${k.result.p[side]})</small>` : '') : '';
      const cls = k.winner ? (k.winner === team ? 'w' : 'l') : '';
      const label = team ? `${chip(team, { link: false })}` : `<span class="tbd">${slotName(slot)}</span>`;
      if (canPick) return `<button class="row ${cls}" data-pick="${num}" data-team="${esc(team)}" aria-pressed="${k.winner === team}" title="${t('pickWinner')}">${label}<span class="sc">${k.winner === team ? '✓' : ''}</span></button>`;
      return `<div class="row ${cls}">${label}<span class="sc">${sc}</span></div>`;
    };
    return `<div class="mcell${changed ? ' changed' : ''}">${row(k.t1, k.slotA, 0)}${row(k.t2, k.slotB, 1)}
      <button class="info" ${k.result ? `data-match="${num}"` : 'tabindex="-1"'}>M${num}, ${fmtDate(real.date, { month: 'short', day: 'numeric' })}, ${esc(cityName(real.ground))}${k.result ? ', details' : ''}</button></div>`;
  };
  const span = { R32: 1, R16: 2, QF: 4, SF: 8, F: 16 };
  const grid = COLS.map(([st, nums], c) => {
    const s = span[st];
    const head = `<div class="colhead" style="grid-column:${c + 1};grid-row:1">${E.STAGE_NAMES[st]}</div>`;
    return head + nums.map((n, i) => `<div class="slot ${st.toLowerCase()}${st === 'F' ? ' final' : ''}" style="grid-column:${c + 1};grid-row:${2 + i * s} / span ${s}">${cell(n, st)}</div>`).join('');
  }).join('');
  const third = T.ko[103];

  // group editor
  const g = S.group, teams = S.data.groups[g];
  const gm = S.data.matches.filter(m => m.group === g);
  const edRows = gm.map(m => {
    const v = S.edits[m.num] || m.ft;
    const ch = S.edits[m.num] ? ' changed' : '';
    return `<div class="edit-row">${chip(m.t1, { link: false })}
      <input type="number" min="0" max="15" inputmode="numeric" value="${v[0]}" class="${ch}" data-edit="${m.num}" data-side="0" aria-label="${esc(m.t1)} goals vs ${esc(m.t2)}">
      <span class="muted">–</span>
      <input type="number" min="0" max="15" inputmode="numeric" value="${v[1]}" class="${ch}" data-edit="${m.num}" data-side="1" aria-label="${esc(m.t2)} goals vs ${esc(m.t1)}">
      ${chip(m.t2, { link: false })}</div>`;
  }).join('');
  const realTable = E.groupTable(teams, S.data.matches.filter(m => m.group === g));
  const fullEdited = E.buildTournament(S.data.groups, effective(), { picks: S.picks });
  const thirds = fullEdited.thirds;
  const solver = fullEdited.thirdMap;

  return `
  <div class="page-head"><div><h1>${t('bracket')}</h1>
    <p>Change any group score or click a team to send them through. Standings, the third-place ranking and the whole knockout path recalculate instantly with FIFA's tiebreak rules. Move the timeline to see the bracket as it stood on any day.</p></div></div>
  <div class="whatif-bar${nChanges ? ' changed' : ''}">
    <div class="champ"><span class="big">${T.champion ? chip(T.champion, { link: false }) : '—'}</span><div><small>${t('yourChamp')}${S.date < S.days.at(-1) && !T.champion ? ' (move the timeline to the end or pick winners)' : ''}</small></div></div>
    <div class="champ"><span class="big" style="font-size:1.4rem">${chip(RF.champion, { link: false })}</span><div><small>${t('realChamp')}</small></div></div>
    <span class="muted small" style="flex:1">${nChanges ? `${nChanges} change${nChanges > 1 ? 's' : ''} from reality.` : 'Showing what really happened.'}</span>
    <button class="btn" id="share">${t('share')}</button>
    <button class="btn danger" id="reset" ${nChanges ? '' : 'disabled'}>${t('reset')}</button>
  </div>
  <div class="grid-even" style="margin-bottom:24px">
    <div class="panel group-editor"><h3>${t('editGroups')}</h3>
      <div class="tabs" role="tablist">${Object.keys(S.data.groups).map(x => {
        const ed = S.data.matches.some(m => m.group === x && S.edits[m.num]);
        return `<button role="tab" aria-selected="${x === g}" class="${ed ? 'edited' : ''}" data-group="${x}">${x}</button>`;
      }).join('')}</div>
      ${edRows}
      <div style="margin-top:12px">${groupTableHTML(g, fullEdited.tables[g], { compare: realTable })}</div>
    </div>
    <div class="panel"><h3>Third-place race</h3>
      <p class="small muted">The 8 best of the 12 third-placed teams advance. Each Round of 32 slot only accepts thirds from certain groups, so placing them is a matching problem. ${solver.official ? 'This combination happened for real, so FIFA’s official slotting is used.' : `Our constraint solver found a valid placement in ${solver.steps} steps.`}</p>
      <table class="rank"><thead><tr><th>#</th><th>${t('team')}</th><th>Grp</th><th>Pts</th><th>GD</th><th>GF</th><th>Slot</th></tr></thead><tbody>
      ${thirds.map((r, i) => {
        const slot = Object.entries(solver.map).find(([, gg]) => gg === r.group);
        return `<tr class="${i < 8 ? 'q3' : ''}"><td>${i + 1}</td><td>${chip(r.team)}</td><td>${r.group}</td><td>${r.pts}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td>${r.gf}</td><td>${slot ? 'M' + slot[0] : i < 8 ? '' : 'out'}</td></tr>`;
      }).join('')}</tbody></table>
    </div>
  </div>
  <div class="bracket-wrap" role="region" aria-label="Knockout bracket" tabindex="0"><div class="bracket">${grid}</div></div>
  <div style="max-width:260px;margin-top:16px"><div class="colhead small muted">${E.STAGE_NAMES['3P']}</div>${cell(103, '3P')}</div>`;
};

// ===== Simulator =====
PAGES.simulate = () => {
  const r = S.sim;
  const teams = Object.values(S.data.groups).flat();
  const model = fitModel(teams, memo.eff || effective(), { upTo: S.date });
  S.model = model;
  let res = '';
  if (r && r.date === S.date && r.key === JSON.stringify(S.edits)) {
    const rows = Object.entries(r.reach).map(([tm, v]) => ({ tm, ...v })).sort((a, b) => b.W - a.W || b.F - a.F || b.SF - a.SF);
    const max = rows[0].W / r.n;
    const final = Object.entries(r.finals).sort((a, b) => b[1] - a[1])[0];
    res = `<p class="small muted">${r.n.toLocaleString()} tournaments simulated in ${r.ms.toLocaleString()} ms on a background Web Worker, starting from ${fmtDate(S.date, { month: 'long', day: 'numeric' })}${whatIfActive() ? ', using your what-if results' : ''}.</p>
      <div class="bars" role="list">${rows.slice(0, 12).map(x => `<div class="bar${x.tm === S.myTeam ? ' mine' : ''}" role="listitem">${chip(x.tm)}<div class="track-bg"><div class="fill" style="width:${max ? x.W / r.n / max * 100 : 0}%;background:${colour(x.tm)}"></div></div><span class="pct">${pct(x.W / r.n)}</span></div>`).join('')}</div>
      <h3 style="margin-top:20px">${t('likelyFinal')}: ${esc(final[0])} <span class="tag gold">${pct(final[1] / r.n)}</span></h3>
      <table style="margin-top:12px"><thead><tr><th>${t('team')}</th><th>R16</th><th>QF</th><th>SF</th><th>Final</th><th>Win</th></tr></thead><tbody>
      ${rows.slice(0, 16).map(x => `<tr class="${x.tm === S.myTeam ? 'mine' : ''}"><td>${chip(x.tm)}</td><td>${pct(x.R16 / r.n, 0)}</td><td>${pct(x.QF / r.n, 0)}</td><td>${pct(x.SF / r.n, 0)}</td><td>${pct(x.F / r.n, 0)}</td><td class="pts">${pct(x.W / r.n)}</td></tr>`).join('')}</tbody></table>`;
  }
  const opts = sel => teams.slice().sort().map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
  S.pa ||= 'Spain'; S.pb ||= 'Argentina';
  const o = matchOdds(model, S.pa, S.pb);
  return `
  <div class="page-head"><div><h1>${t('simulate')}</h1>
  <p>A Poisson goals model learns every team's attack and defence strength from the results before the timeline date, then plays out the rest of the World Cup thousands of times, including group tiebreakers, third-place slotting, extra time and penalties.</p></div></div>
  <div class="grid-2">
    <div>
      <div class="panel">
        <div class="controls">
          <label class="field">${t('runs')}<select id="runs">${[1000, 10000, 50000].map(n => `<option value="${n}" ${n === (S.runs || 10000) ? 'selected' : ''}>${n.toLocaleString()}</option>`).join('')}</select></label>
          <button class="btn primary" id="run">${t('run')}</button>
        </div>
        <div class="progress" aria-hidden="true"><div id="prog"></div></div>
        <p class="small muted">${t('modelNote')} ${model.games ? `It has learned from ${model.games} matches so far.` : 'Before kickoff it has no data, so every team starts equal.'}</p>
      </div>
      <div class="panel"><h3>${t('predictor')}</h3>
        <div class="controls"><label class="field">${t('team')} A<select id="pa">${opts(S.pa)}</select></label><label class="field">${t('team')} B<select id="pb">${opts(S.pb)}</select></label></div>
        <div class="odds3" style="--w:${o.w}fr;--d:${o.d}fr;--l:${o.l}fr" role="img" aria-label="${esc(S.pa)} win ${pct(o.w, 0)}, draw ${pct(o.d, 0)}, ${esc(S.pb)} win ${pct(o.l, 0)}">
          <div class="w">${pct(o.w, 0)}</div><div class="d">${pct(o.d, 0)}</div><div class="l">${pct(o.l, 0)}</div></div>
        <p class="small muted" style="margin-top:8px">${esc(S.pa)} win, draw, ${esc(S.pb)} win. Expected goals ${o.la.toFixed(2)} to ${o.lb.toFixed(2)}.</p>
      </div>
      <div class="panel"><h3>Team strength map</h3><p class="small muted">Right = scores more, up = concedes less. Learned only from matches up to the timeline date.</p>${strengthPlot(model)}</div>
    </div>
    <div class="panel" aria-live="polite"><h2>${t('titleOdds')}</h2>${res || '<div class="empty">Press “Run simulations” to play out the rest of the tournament.</div>'}</div>
  </div>`;
};
function strengthPlot(model) {
  const teams = Object.keys(model.att).filter(x => (memo.eff || []).some(m => played(m) && (m.t1 === x || m.t2 === x)));
  if (!teams.length) return '<div class="empty">No matches played yet.</div>';
  const W = 520, H = 360, P = 34;
  const xs = teams.map(x => model.att[x]), ys = teams.map(x => model.def[x]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const X = v => P + (v - x0) / ((x1 - x0) || 1) * (W - 2 * P), Y = v => H - P - (v - y0) / ((y1 - y0) || 1) * (H - 2 * P);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Scatter plot of attack versus defence ratings">
    <line x1="${X(0)}" x2="${X(0)}" y1="${P / 2}" y2="${H - P}" stroke="var(--line)"/><line y1="${Y(0)}" y2="${Y(0)}" x1="${P}" x2="${W - P / 2}" stroke="var(--line)"/>
    <text x="${W - P}" y="${H - 8}" text-anchor="end" fill="var(--ink-3)" font-size="13">Attack →</text>
    <text x="8" y="18" fill="var(--ink-3)" font-size="13">↑ Defence</text>
    ${teams.map(x => `<g><circle cx="${X(model.att[x])}" cy="${Y(model.def[x])}" r="${x === S.myTeam ? 7 : 4.5}" fill="${colour(x)}" stroke="var(--surface)"/><text x="${X(model.att[x]) + 7}" y="${Y(model.def[x]) + 4}" font-size="12" font-weight="700" fill="var(--ink-2)">${code(x)}</text><title>${esc(x)}: attack ${model.att[x].toFixed(2)}, defence ${model.def[x].toFixed(2)}</title></g>`).join('')}
  </svg>`;
}
let worker = null;
function runSim() {
  const n = +$('#runs').value; S.runs = n;
  worker?.terminate();
  try { worker = new Worker('js/worker.js', { type: 'module' }); }
  catch { return runSimInline(n); }
  const prog = $('#prog'), btn = $('#run');
  btn.disabled = true; btn.textContent = 'Simulating…';
  const date = S.date, k = JSON.stringify(S.edits);
  worker.onmessage = e => {
    if (e.data.type === 'progress') { prog.style.width = e.data.done / e.data.n * 100 + '%'; return; }
    S.sim = { ...e.data, date, key: k };
    if (S.route === 'simulate') renderPage();
    worker.terminate(); worker = null;
  };
  worker.onerror = err => { btn.disabled = false; btn.textContent = t('run'); toast('Simulation failed: ' + err.message); };
  worker.postMessage({ groups: S.data.groups, matches: memo.eff || effective(), upTo: date, n, seed: 2026 });
}

async function runSimInline(n) {
  const { simulateMany } = await import('./model.js');
  const teams = Object.values(S.data.groups).flat(), t0 = performance.now();
  const model = fitModel(teams, memo.eff, { upTo: S.date });
  const r = simulateMany(S.data.groups, memo.eff, model, { n, upTo: S.date, seed: 2026 });
  S.sim = { ...r, model, ms: Math.round(performance.now() - t0), date: S.date, key: JSON.stringify(S.edits) };
  renderPage();
}

// ===== Matches list =====
PAGES.matches = () => {
  const f = S.filter ||= { stage: '', team: '', venue: '' };
  const list = S.data.matches.filter(m => (!f.stage || m.stage === f.stage) && (!f.team || m.t1 === f.team || m.t2 === f.team) && (!f.venue || m.ground === f.venue));
  const byDate = {};
  list.forEach(m => (byDate[m.date] ||= []).push(m));
  const teams = Object.values(S.data.groups).flat().sort();
  const saveDate = S.date; S.date = S.days.at(-1); // matches page always shows full results
  const html = `
  <div class="page-head"><div><h1>${t('matches')}</h1><p>All 104 matches. Open any one for the goal timeline and what the model expected beforehand.</p></div></div>
  <div class="controls">
    <label class="field">Stage<select data-f="stage"><option value="">${t('allStages')}</option>${Object.entries(E.STAGE_NAMES).map(([k, v]) => `<option value="${k}" ${f.stage === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="field">${t('team')}<select data-f="team"><option value="">${t('allTeams')}</option>${teams.map(x => `<option ${f.team === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label class="field">${t('venue')}<select data-f="venue"><option value="">${t('allVenues')}</option>${Object.keys(VENUES).sort().map(v => `<option value="${esc(v)}" ${f.venue === v ? 'selected' : ''}>${esc(cityName(v))}</option>`).join('')}</select></label>
    <span class="muted small">${list.length} matches</span>
  </div>
  ${Object.entries(byDate).map(([d, ms]) => `<h3 style="margin:22px 0 10px">${fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h3><div class="grid-even">${ms.map(board).join('')}</div>`).join('') || '<div class="empty">No matches fit those filters.</div>'}`;
  S.date = saveDate;
  return html;
};

// ===== Match centre (dialog) =====
function openMatch(num) {
  const m = S.data.matches.find(x => x.num === num);
  if (!m || !m.ft) return;
  const s = E.finalScore(m);
  const len = m.et ? 120 : 90;
  const minute = g => Math.min(len, parseInt(g.minute) + (g.minute.includes('+') ? parseInt(g.minute.split('+')[1]) * 0.15 : 0));
  const goalMarks = (goals, cls, team) => goals.map(g => `<div class="g ${cls}" style="left:${minute(g) / len * 100}%;color:${colour(team)}" title="${esc(g.name)} ${g.minute}'"><span>${g.minute}'</span></div>`).join('');
  const glist = (goals) => goals.map(g => `${esc(g.name)} ${g.minute}'${g.penalty ? ' (pen)' : ''}${g.owngoal ? ' (og)' : ''}`);
  const a = glist(m.goals1), b = glist(m.goals2);
  const rows = []; for (let i = 0; i < Math.max(a.length, b.length); i++) rows.push(`<div>${a[i] || ''}</div><div>${b[i] || ''}</div>`);
  // pre-match expectation, learned only from matches strictly before this date
  const teams = Object.values(S.data.groups).flat();
  const before = S.data.matches.filter(x => x.ft && x.date < m.date);
  let exp = '<p class="small muted">Too early for a prediction: fewer than 24 matches had been played.</p>';
  if (before.length >= 24) {
    const model = fitModel(teams, S.data.matches, { upTo: prevDay(m.date) });
    const o = matchOdds(model, m.t1, m.t2);
    const w = m.stage === 'G' ? (m.ft[0] > m.ft[1] ? 'w' : m.ft[0] < m.ft[1] ? 'l' : 'd') : (E.winnerOf(m) === m.t1 ? 'w' : 'l');
    const pOutcome = m.stage === 'G' ? o[w] : (w === 'w' ? o.w + o.d / 2 : o.l + o.d / 2);
    exp = `<div class="odds3" style="--w:${o.w}fr;--d:${o.d}fr;--l:${o.l}fr"><div class="w">${pct(o.w, 0)}</div><div class="d">${pct(o.d, 0)}</div><div class="l">${pct(o.l, 0)}</div></div>
      <p class="small muted" style="margin-top:6px">${code(m.t1)} win, draw, ${code(m.t2)} win, from ${before.length} earlier matches. ${pOutcome < .3 ? `<span class="tag flare">${t('upset')}: only ${pct(pOutcome, 0)} likely</span>` : `This outcome had a ${pct(pOutcome, 0)} chance.`}</p>`;
  }
  const v = VENUES[m.ground] || {};
  const dlg = $('#modal');
  dlg.innerHTML = `<div class="mc-head">
      <button class="close-x" aria-label="${t('close')}" data-close>✕</button>
      <div class="stage">${m.stage === 'G' ? `Group ${m.group}` : E.STAGE_NAMES[m.stage]}, match ${m.num}</div>
      <div class="mc-score">
        <div class="team"><a href="#team-${code(m.t1)}" data-close>${esc(m.t1)}</a><small>${code(m.t1)}</small></div>
        <div class="nums" id="modal-title">${s[0]}–${s[1]}</div>
        <div class="team"><a href="#team-${code(m.t2)}" data-close>${esc(m.t2)}</a><small>${code(m.t2)}</small></div>
      </div>
      <div class="mc-sub">${m.ht ? `${t('halfTime')} ${m.ht[0]}–${m.ht[1]}` : ''}${m.et ? `, 90 min ${m.ft[0]}–${m.ft[1]}, ${t('afterEt').toLowerCase()}` : ''}${m.p ? `, ${t('pens').toLowerCase()} ${m.p[0]}–${m.p[1]}` : ''}</div>
    </div>
    <div class="mc-body">
      <h3>Goal timeline</h3>
      <div class="goal-line" aria-hidden="true"><div class="axis"></div><div class="ht" style="left:${45 / len * 100}%"></div>${len > 90 ? `<div class="ht" style="left:${90 / len * 100}%"></div>` : ''}
        ${goalMarks(m.goals1, 't1', m.t1)}${goalMarks(m.goals2, 't2', m.t2)}</div>
      ${rows.length ? `<div class="goal-list">${rows.join('')}</div>` : '<p class="muted">No goals.</p>'}
      <h3 style="margin-top:20px">${t('expected')}</h3>${exp}
      <dl class="kv" style="margin-top:18px"><dt>${t('venue')}</dt><dd>${esc(v.stadium || '')}, ${esc(m.ground)}</dd><dt>${t('kickoff')}</dt><dd>${fmtDate(m.date, { weekday: 'long', month: 'long', day: 'numeric' })}, ${esc(m.time)} local</dd></dl>
    </div>`;
  dlg.showModal();
}
function prevDay(d) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); }

// ===== Host cities map =====
const LABEL = { 'Philadelphia': [-10, 18, 'end'], 'New York/New Jersey (East Rutherford)': [12, 8, 'start'], 'Boston (Foxborough)': [12, -6, 'start'], 'Toronto': [-10, -10, 'end'], 'Houston': [-10, 16, 'end'], 'Dallas (Arlington)': [-12, -8, 'end'], 'Guadalajara (Zapopan)': [-12, 4, 'end'], 'Monterrey (Guadalupe)': [12, 4, 'start'], 'Mexico City': [12, 12, 'start'], 'San Francisco Bay Area (Santa Clara)': [12, 4, 'start'], 'Kansas City': [12, 4, 'start'] };
const SHORT = { 'New York/New Jersey (East Rutherford)': 'New York NJ', 'San Francisco Bay Area (Santa Clara)': 'SF Bay Area' };
PAGES.map = () => {
  const eff = memo.eff || effective();
  const stats = {};
  for (const g of Object.keys(VENUES)) stats[g] = { ms: [], goals: 0, today: false };
  for (const m of eff) {
    if (m.date === S.date) stats[m.ground].today = true;
    if (played(m)) { stats[m.ground].ms.push(m); stats[m.ground].goals += E.finalScore(m)[0] + E.finalScore(m)[1]; }
  }
  const sel = S.city, sv = VENUES[sel], ss = stats[sel];
  const cities = Object.entries(VENUES).map(([g, v]) => {
    const [x, y] = project(v.lon, v.lat);
    const r = 6 + stats[g].ms.length * 1.1;
    const [dx, dy, anchor] = LABEL[g] || [12, 5, 'start'];
    return `<g class="city${stats[g].today ? ' on' : ''}${g === sel ? ' sel' : ''}" data-city="${esc(g)}" tabindex="0" role="button" aria-label="${esc(cityName(g))}, ${stats[g].ms.length} matches played">
      ${stats[g].today ? `<circle class="pulse" cx="${x}" cy="${y}" r="${r}"/>` : ''}
      <circle class="c" cx="${x}" cy="${y}" r="${r}"/><text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${esc(SHORT[g] || cityName(g))}</text></g>`;
  }).join('');
  const ranking = Object.entries(stats).filter(([, s]) => s.ms.length).sort((a, b) => b[1].goals / b[1].ms.length - a[1].goals / a[1].ms.length);
  return `
  <div class="page-head"><div><h1>${t('map')}</h1><p>16 stadiums across three countries. Circle size grows with every match played by the timeline date; gold cities have a match that day.</p></div></div>
  <div class="grid-2" style="grid-template-columns:minmax(0,7fr) minmax(0,5fr)">
    <div class="panel map-wrap">
      <svg class="map-svg" viewBox="0 0 ${MAP.w} ${MAP.h}" role="group" aria-label="Map of host cities">
        ${Object.entries(MAP.paths).map(([c, d]) => `<path class="land ${c}" d="${d}"/>`).join('')}
        ${cities}
      </svg>
    </div>
    <div>
      <div class="panel"><h2>${esc(cityName(sel))}</h2><p class="muted">${esc(sv.stadium)}, ${{ USA: 'United States', CAN: 'Canada', MEX: 'Mexico' }[sv.country]}</p>
        <div class="statline" style="margin:12px 0"><div><b>${ss.ms.length}</b><span>Matches</span></div><div><b>${ss.goals}</b><span>${t('goals')}</span></div><div><b>${ss.ms.length ? (ss.goals / ss.ms.length).toFixed(2) : '0'}</b><span>${t('perGame')}</span></div></div>
        <div class="boards">${ss.ms.length ? ss.ms.slice().reverse().map(board).join('') : '<div class="empty">No matches here yet. Move the timeline forward.</div>'}</div>
      </div>
      <div class="panel"><h3>Highest scoring venues</h3><table class="rank"><tbody>${ranking.slice(0, 8).map(([g, s], i) => `<tr><td>${i + 1}</td><td>${esc(cityName(g))}</td><td>${(s.goals / s.ms.length).toFixed(2)}</td></tr>`).join('') || '<tr><td>No matches yet.</td></tr>'}</tbody></table></div>
    </div>
  </div>`;
};

// ===== Stats =====
PAGES.stats = () => {
  const ms = S.data.matches.filter(m => m.ft);
  const sc = E.scorers(ms);
  const q = S.q || '';
  const shown = q ? sc.map(s => ({ s, k: Math.max(E.fuzzy(q, s.name), E.fuzzy(q, s.team) * .8) })).filter(x => x.k > 0).sort((a, b) => b.k - a.k || b.s.goals - a.s.goals).map(x => x.s) : sc;
  // records
  const goalsIn = m => E.finalScore(m)[0] + E.finalScore(m)[1];
  const margin = m => Math.abs(m.ft[0] - m.ft[1]);
  const biggest = ms.slice().sort((a, b) => margin(b) - margin(a) || goalsIn(b) - goalsIn(a))[0];
  const wildest = ms.slice().sort((a, b) => goalsIn(b) - goalsIn(a))[0];
  const shootouts = ms.filter(m => m.p);
  const comebacks = ms.filter(m => { const w = m.stage === 'G' ? (m.ft[0] > m.ft[1] ? 0 : m.ft[1] > m.ft[0] ? 1 : -1) : (E.winnerOf(m) === m.t1 ? 0 : 1); return w >= 0 && m.ht && m.ht[w] < m.ht[1 - w]; });
  const hats = [];
  for (const m of ms) for (const [gs, tm] of [[m.goals1, m.t1], [m.goals2, m.t2]]) {
    const c = {}; gs.filter(g => !g.owngoal).forEach(g => (c[g.name] = (c[g.name] || 0) + 1));
    Object.entries(c).filter(([, n]) => n >= 3).forEach(([n, k]) => hats.push({ n, k, m, tm }));
  }
  const allGoals = ms.flatMap(m => [...m.goals1, ...m.goals2].map(g => ({ ...g, m })));
  const latest = allGoals.slice().sort((a, b) => (parseInt(b.minute) + (+(b.minute.split('+')[1] || 0)) / 10) - (parseInt(a.minute) + (+(a.minute.split('+')[1] || 0)) / 10))[0];
  const total = ms.reduce((s, m) => s + goalsIn(m), 0);
  const rec = (big, label, m) => `<button class="record" ${m ? `data-match="${m.num}"` : ''}><b>${big}</b><span>${label}</span></button>`;
  const teams = Object.values(S.data.groups).flat().sort();
  S.ca ||= 'Spain'; S.cb ||= 'Argentina';
  return `
  <div class="page-head"><div><h1>${t('stats')}</h1><p>Every number below is computed live from the match database, so the admin panel's edits flow straight through.</p></div></div>
  <div class="statline" style="margin-bottom:24px">
    <div><b>${ms.length}</b><span>Matches</span></div><div><b>${total}</b><span>${t('goals')}</span></div><div><b>${(total / ms.length).toFixed(2)}</b><span>${t('perGame')}</span></div>
    <div><b>${allGoals.filter(g => g.penalty).length}</b><span>Penalty goals</span></div><div><b>${allGoals.filter(g => g.owngoal).length}</b><span>Own goals</span></div><div><b>${shootouts.length}</b><span>Shootouts</span></div>
  </div>
  <div class="grid-2">
    <div class="panel"><h2>${t('goldenBoot')}</h2>
      <label class="field" style="width:100%;margin-bottom:10px"><span class="sr">${t('search')}</span><input type="search" id="q" placeholder="${t('search')} (try “mbape” or “arg”)" value="${esc(q)}" autocomplete="off"></label>
      <table class="rank"><thead><tr><th>#</th><th>Player</th><th>${t('team')}</th><th>Pens</th><th>${t('goals')}</th></tr></thead><tbody id="scorers">
      ${shown.slice(0, 20).map(s => `<tr class="${s.team === S.myTeam ? 'mine' : ''}"><td>${sc.indexOf(s) + 1}</td><td>${esc(s.name)}</td><td>${chip(s.team, { full: false })}</td><td>${s.pens}</td><td class="pts">${s.goals}</td></tr>`).join('') || '<tr><td colspan="5">No players match that search.</td></tr>'}
      </tbody></table></div>
    <div>
      <h2>${t('records')}</h2>
      <div class="records">
        ${rec(`${biggest.ft[0]}–${biggest.ft[1]}`, `Biggest win: ${esc(biggest.t1)} v ${esc(biggest.t2)}`, biggest)}
        ${rec(goalsIn(wildest), `Most goals in a match: ${esc(wildest.t1)} v ${esc(wildest.t2)}`, wildest)}
        ${rec(comebacks.length, `Comebacks from behind at half time${comebacks[0] ? `, e.g. ${esc(comebacks[0].t1)} v ${esc(comebacks[0].t2)}` : ''}`, comebacks[0])}
        ${rec(hats.length, `Hat-tricks${hats[0] ? `, first by ${esc(hats[0].n)}` : ''}`, hats[0]?.m)}
        ${latest ? rec(`${latest.minute}'`, `Latest goal: ${esc(latest.name)}`, latest.m) : ''}
        ${rec(shootouts.length, `Penalty shootouts${shootouts[0] ? `, first ${esc(shootouts[0].t1)} v ${esc(shootouts[0].t2)}` : ''}`, shootouts[0])}
      </div>
      <div class="panel" style="margin-top:16px"><h2>${t('compare')}</h2>
        <div class="controls"><label class="field">${t('team')} A<select id="ca">${teams.map(x => `<option ${x === S.ca ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="field">${t('team')} B<select id="cb">${teams.map(x => `<option ${x === S.cb ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
        ${radar(S.ca, S.cb, ms)}
      </div>
    </div>
  </div>`;
};
function radar(a, b, ms) {
  const all = Object.values(S.data.groups).flat().map(x => E.teamStats(x, ms));
  const order = ['G', 'R32', 'R16', 'QF', 'SF', '3P', 'F'];
  const axes = [
    ['Goals / game', s => s.gf / s.p], ['Defence', s => -s.ga / s.p], ['Win rate', s => s.w / s.p],
    ['Clean sheets', s => s.cs / s.p], ['Late goals', s => s.lateGoals / s.p], ['Went far', s => order.indexOf(s.furthest)]
  ];
  const norm = axes.map(([, f]) => { const v = all.map(f); return [Math.min(...v), Math.max(...v)]; });
  const sa = all.find(s => s.team === a), sb = all.find(s => s.team === b);
  const R = 120, C = 170;
  const pt = (i, v) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / axes.length; return [C + Math.cos(ang) * R * v, C + Math.sin(ang) * R * v]; };
  const val = (s, i) => { const [lo, hi] = norm[i]; return .08 + .92 * (axes[i][1](s) - lo) / ((hi - lo) || 1); };
  const poly = (s, col) => `<polygon points="${axes.map((_, i) => pt(i, val(s, i)).join(',')).join(' ')}" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width="2.5"/>`;
  const cb = colour(b) === colour(a) ? '#2F4B7C' : colour(b);
  return `<svg class="radar" viewBox="0 0 340 340" width="100%" style="max-width:420px" role="img" aria-label="Radar chart comparing ${esc(a)} and ${esc(b)}">
    ${[.25, .5, .75, 1].map(r => `<polygon points="${axes.map((_, i) => pt(i, r).join(',')).join(' ')}" fill="none" stroke="var(--line)"/>`).join('')}
    ${axes.map(([l], i) => { const [x, y] = pt(i, 1.17); return `<text x="${x}" y="${y + 4}" text-anchor="middle">${l}</text>`; }).join('')}
    ${poly(sa, colour(a))}${poly(sb, cb)}
  </svg>
  <table><thead><tr><th></th><th>${code(a)}</th><th>${code(b)}</th></tr></thead><tbody>
  ${[['Played', 'p'], ['Won', 'w'], ['Goals for', 'gf'], ['Goals against', 'ga'], ['Clean sheets', 'cs'], ['Comebacks', 'comeback']].map(([l, k]) => `<tr><td>${l}</td><td>${sa[k]}</td><td>${sb[k]}</td></tr>`).join('')}
  <tr><td>Furthest stage</td><td>${E.STAGE_NAMES[sa.furthest]}</td><td>${E.STAGE_NAMES[sb.furthest]}</td></tr></tbody></table>`;
}

// ===== Team page =====
PAGES.team = () => {
  const tm = S.param;
  if (!tm || !Object.values(S.data.groups).flat().includes(tm)) return `<div class="empty">No team called “${esc(tm)}”. <a href="#stats">Browse stats</a>.</div>`;
  const ms = S.data.matches.filter(m => m.ft && (m.t1 === tm || m.t2 === tm));
  const st = E.teamStats(tm, ms);
  const g = Object.entries(S.data.groups).find(([, ts]) => ts.includes(tm))[0];
  const rows = E.groupTable(S.data.groups[g], S.data.matches.filter(m => m.group === g && m.ft));
  const sc = E.scorers(ms).filter(s => s.team === tm);
  const saveDate = S.date; S.date = S.days.at(-1);
  const html = `
  <div class="team-hero"><div class="stripe" style="background:${colour(tm)}"></div><div><h1>${esc(tm)}</h1>
    <p class="muted">Group ${g}. Went as far as the ${E.STAGE_NAMES[st.furthest].toLowerCase()}${realFinal().champion === tm ? ', and won the World Cup' : ''}.</p></div>
    <button class="btn" id="follow" style="margin-left:auto">${S.myTeam === tm ? '★ Your team' : '☆ Make this my team'}</button></div>
  <div class="statline" style="margin-bottom:24px"><div><b>${st.p}</b><span>Played</span></div><div><b>${st.w}-${st.d}-${st.l}</b><span>W-D-L</span></div><div><b>${st.gf}</b><span>Goals for</span></div><div><b>${st.ga}</b><span>Goals against</span></div><div><b>${st.cs}</b><span>Clean sheets</span></div></div>
  <div class="grid-2"><div><h2>Path through the tournament</h2><div class="boards">${ms.map(board).join('')}</div></div>
  <div>${groupTableHTML(g, rows)}<div class="panel" style="margin-top:16px"><h3>Scorers</h3><ul class="results-list">${sc.map(s => `<li><span>${esc(s.name)}</span><b>${s.goals}</b></li>`).join('') || '<li>No goals.</li>'}</ul></div></div></div>`;
  S.date = saveDate;
  return html;
};

// ===== Admin (talks to the Node REST API) =====
PAGES.admin = () => {
  if (S.data.source !== 'api') return `<div class="page-head"><div><h1>${t('admin')}</h1></div></div>
    <div class="empty">The admin panel needs the local server. Start it with <code>node server.js</code> and open <code>http://localhost:3000</code>.</div>`;
  const st = S.adminStage || 'G';
  const list = S.data.matches.filter(m => m.stage === st);
  return `<div class="page-head"><div><h1>${t('admin')}</h1><p>Correct a result in the match database. The server validates it, saves it to disk, and every page recalculates.</p></div>
    <button class="btn danger" id="dbreset">Restore original data</button></div>
  <div class="controls"><label class="field">Stage<select id="astage">${Object.entries(E.STAGE_NAMES).map(([k, v]) => `<option value="${k}" ${k === st ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
  <div class="panel"><table class="admin"><thead><tr><th>#</th><th>Match</th><th>90 min</th>${st !== 'G' ? '<th>After ET</th><th>Pens</th>' : ''}<th></th></tr></thead><tbody>
  ${list.map(m => {
    const pair = (k, v) => `<input type="number" min="0" max="20" data-a="${m.num}" data-k="${k}" data-s="0" value="${v?.[0] ?? ''}" style="width:46px" aria-label="${k} ${esc(m.t1)}"> – <input type="number" min="0" max="20" data-a="${m.num}" data-k="${k}" data-s="1" value="${v?.[1] ?? ''}" style="width:46px" aria-label="${k} ${esc(m.t2)}">`;
    return `<tr><td>${m.num}</td><td style="text-align:left">${esc(m.t1)} v ${esc(m.t2)}</td><td>${pair('ft', m.ft)}</td>${st !== 'G' ? `<td>${pair('et', m.et)}</td><td>${pair('p', m.p)}</td>` : ''}<td><button class="btn" data-save="${m.num}">${t('save')}</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
};
async function adminSave(num) {
  const get = k => { const v = [...document.querySelectorAll(`[data-a="${num}"][data-k="${k}"]`)].map(i => i.value === '' ? null : +i.value); return v.every(x => x !== null) ? v : null; };
  const score = { ft: get('ft'), et: get('et'), p: get('p') };
  const m = S.data.matches.find(x => x.num === num);
  if (m.ht) score.ht = m.ht;
  const r = await fetch(`/api/matches/${num}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) });
  const body = await r.json();
  if (!r.ok) return toast(body.error);
  await reload(); toast(`${t('saved')}: match ${num}`);
}
async function reload() { S.data = await loadData(); memo = { v: (memo.v || 0) + 1 }; renderPage(); }

// ---------------- router ----------------
const NAV = ['bracket', 'simulate', 'matches', 'map', 'stats', 'admin'];
function parseHash() {
  // Hash routes are plain names so links work everywhere: #bracket, #team-ESP, #w-<hex state>
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  S.param = null;
  if (h.startsWith('w-')) {
    try {
      const hex = h.slice(2), bytes = new Uint8Array(hex.match(/../g).map(x => parseInt(x, 16)));
      const st = JSON.parse(new TextDecoder().decode(bytes)); S.edits = st.e || {}; S.picks = st.p || {};
    } catch { toast('That share link is damaged.'); }
    S.route = 'bracket'; return;
  }
  if (h.startsWith('team-')) { S.route = 'team'; S.param = teamByCode(h.slice(5)) || h.slice(5); return; }
  S.route = PAGES[h] && h !== 'rewind' ? h : 'bracket';
}
function teamByCode(c) { return Object.values(S.data.groups).flat().find(x => code(x) === c); }
function stateHash() {
  const bytes = new TextEncoder().encode(JSON.stringify({ e: S.edits, p: S.picks }));
  return 'w-' + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}
function syncUrl() {
  const h = S.route === 'bracket' && whatIfActive() ? stateHash() : S.route === 'team' ? 'team-' + code(S.param) : S.route;
  history.replaceState(null, '', '#' + h);
}

function renderNav() {
  $('#nav').innerHTML = NAV.map(r => `<a href="#${r}" ${r === S.route || (r === 'stats' && S.route === 'team') ? 'aria-current="page"' : ''}>${t(r)}</a>`).join('');
  document.querySelectorAll('[data-i]').forEach(el => (el.textContent = t(el.dataset.i)));
}
function renderPage() {
  const main = $('#main');
  const scroll = window.scrollY;
  const focusId = document.activeElement?.id;
  tour(); // refresh derived data before any page reads it
  main.innerHTML = PAGES[S.route]();
  window.scrollTo(0, scroll);
  if (focusId && document.getElementById(focusId) && focusId !== 'main') { const el = document.getElementById(focusId); el.focus(); if (el.setSelectionRange && el.type === 'search') el.setSelectionRange(el.value.length, el.value.length); }
  if (S.route === 'simulate' && !S.sim) runSim();
  if (S.route !== 'bracket' || !whatIfActive()) syncUrl();
}
function route() {
  parseHash();
  // the simulator is most interesting from the end of the group stage
  if (S.route === 'simulate' && !S.sim && S.date === S.days.at(-1)) S.date = S.data.matches.filter(m => m.stage === 'G').map(m => m.date).sort().at(-1);
  renderNav(); renderRibbon(); renderPage();
  $('#main').focus({ preventScroll: true });
}

// ---------------- events (delegated) ----------------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-match],[data-pick],[data-group],[data-city],[data-close],[data-save],#share,#reset,#run,#follow,#dbreset');
  if (!el || e.target.closest('a:not([data-close])')) { if (e.target.closest('[data-close]')) $('#modal').close(); return; }
  if (el.dataset.close !== undefined) return $('#modal').close();
  if (el.dataset.match) return openMatch(+el.dataset.match);
  if (el.dataset.pick) {
    const n = +el.dataset.pick, tm = el.dataset.team;
    if (S.picks[n] === tm) delete S.picks[n]; else S.picks[n] = tm;
    syncUrl(); return renderPage();
  }
  if (el.dataset.group) { S.group = el.dataset.group; return renderPage(); }
  if (el.dataset.city) { S.city = el.dataset.city; return renderPage(); }
  if (el.dataset.save) return adminSave(+el.dataset.save);
  if (el.id === 'share') { syncUrl(); /* state lives in the hash */ navigator.clipboard?.writeText(location.href).then(() => toast(t('copied')), () => toast(location.href)); return; }
  if (el.id === 'reset') { S.edits = {}; S.picks = {}; syncUrl(); return renderPage(); }
  if (el.id === 'run') return runSim();
  if (el.id === 'follow') { setMyTeam(S.myTeam === S.param ? '' : S.param); return renderPage(); }
  if (el.id === 'dbreset') { fetch('/api/reset', { method: 'POST' }).then(reload).then(() => toast('Original data restored')); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-match],[role=button][data-city]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.edit) {
    const n = +el.dataset.edit, real = S.data.matches.find(m => m.num === n).ft;
    const v = (S.edits[n] || real).slice();
    v[+el.dataset.side] = Math.max(0, Math.min(15, parseInt(el.value) || 0));
    if (v[0] === real[0] && v[1] === real[1]) delete S.edits[n]; else S.edits[n] = v;
    // drop knockout picks that no longer make sense
    const T = E.buildTournament(S.data.groups, effective(), { picks: S.picks });
    for (const k of Object.keys(S.picks)) if (T.ko[k].t1 !== S.picks[k] && T.ko[k].t2 !== S.picks[k]) delete S.picks[k];
    syncUrl(); renderPage();
    const again = document.querySelector(`[data-edit="${n}"][data-side="${el.dataset.side}"]`); again?.focus(); again?.select();
  }
  if (el.id === 'q') { S.q = el.value; renderPage(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.f) { S.filter[el.dataset.f] = el.value; renderPage(); }
  if (el.id === 'pa' || el.id === 'pb') { S[el.id] = el.value; renderPage(); }
  if (el.id === 'ca' || el.id === 'cb') { S[el.id] = el.value; renderPage(); }
  if (el.id === 'astage') { S.adminStage = el.value; renderPage(); }
  if (el.id === 'runs') S.runs = +el.value;
});

function setMyTeam(tm) { S.myTeam = tm; store('ft-team', tm); $('#myteam').value = tm; }
function setTheme(th) { if (th) document.documentElement.dataset.theme = th; if (th) store('ft-theme', th); }
const isDark = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';

// ---------------- boot ----------------
(async function boot() {
  setTheme(store('ft-theme'));
  setLang(getLang());
  try { S.data = await loadData(); }
  catch { $('#main').innerHTML = '<div class="empty">Could not load match data. Run <code>node server.js</code> and open http://localhost:3000.</div>'; return; }
  const dates = S.data.matches.map(m => m.date).sort();
  for (let d = dates[0]; d <= dates.at(-1); d = nextDay(d)) S.days.push(d);
  S.date = S.days.at(-1);
  $('#source').textContent = S.data.source === 'api' ? 'Connected to local API' : 'Static mode (admin disabled)';

  const teams = Object.values(S.data.groups).flat().sort();
  $('#myteam').innerHTML = `<option value="">${t('myTeam')}: ${t('none')}</option>` + teams.map(x => `<option ${x === S.myTeam ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('#myteam').onchange = e => { setMyTeam(e.target.value); renderPage(); };
  $('#lang').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === getLang() ? 'selected' : ''}>${v}</option>`).join('');
  $('#lang').onchange = e => { setLang(e.target.value); $('#myteam').options[0].text = `${t('myTeam')}: ${t('none')}`; route(); };
  $('#theme').onclick = () => { setTheme(isDark() ? 'light' : 'dark'); if (S.route === 'map' || S.route === 'stats' || S.route === 'simulate') renderPage(); };
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.target.close(); });

  window.addEventListener('hashchange', route);
  route();
})();
function nextDay(d) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }
