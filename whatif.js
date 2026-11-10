// =============================================================
//  whatif.js — "What if…?" for the match exhibits.
//  Every match keeps the original what-if (dive to save the goal
//  that decided it). The final also gets the moments that nearly
//  changed it: the red card, the free kick, the VAR call, the
//  last-minute miss, and a keeper injury. Each one is played out,
//  animated in the highlight theatre, then shown side by side
//  with what really happened.
//
//  Real events in the final come from the ESPN and Sky Sports
//  match reports. Anything that didn't happen is labelled as
//  your version, and simulated chances say how they were worked out.
// =============================================================

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const mins = m => { const [a, b] = String(m).split('+'); return +a + (b ? +b / 100 : 0); };
const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const sur = n => n.split(' ').slice(-1)[0];

// ---------------- what really happened (beyond the goals) ----------------
export const EVENTS = {
  104: [
    { min: '39', kind: 'save', team: 'Spain', text: 'Mikel Oyarzabal shoots straight at Emiliano Martínez.' },
    { min: '44', kind: 'sub', team: 'Argentina', text: 'An early change for Argentina: Nicolás Otamendi on for Lisandro Martínez.' },
    { min: '62', kind: 'sub', team: 'Spain', text: 'Ferran Torres comes off the bench, replacing Mikel Oyarzabal.' },
    { min: '77', kind: 'save', team: 'Spain', text: 'Martínez saves from Pedro Porro, then again from Pau Cubarsí.' },
    { min: '90+3', kind: 'red', team: 'Argentina', who: 'Enzo Fernández', text: 'Enzo Fernández is sent off. A reckless challenge on Pau Cubarsí earns his second yellow card; the first was for dissent. Argentina play on with ten men.', whatif: 'nored' },
    { min: '90+9', kind: 'save', team: 'Spain', who: 'Lamine Yamal', text: 'Lamine Yamal whips a free kick toward the corner. Martínez tips it away.', whatif: 'yamal' },
    { min: '96', kind: 'var', team: 'Spain', who: 'Nico Williams', text: 'Nico Williams scores, but VAR rules it out: Mikel Merino caught Otamendi in the build-up.', whatif: 'var' },
    { min: '114', kind: 'offside', team: 'Spain', text: 'Ferran Torres has the ball in the net again. Flagged offside.' },
    { min: '120+2', kind: 'miss', team: 'Argentina', who: 'Giuliano Simeone', text: 'Argentina’s best chance of the night falls to Giuliano Simeone. He sends it over the bar.', whatif: 'simeone' }
  ]
};
export const NUMBERS = { 104: 'Spain had 65% of the ball and 20 shots, 12 on target. Martínez made 11 saves, the most in a World Cup final for 60 years. Argentina’s first shot came in the 117th minute.' };
const KIND = { save: 'Big save', sub: 'Substitution', red: 'Red card', var: 'VAR', offside: 'Offside', miss: 'Missed chance' };

export function eventItem(e, colour, onColour) {
  return `<li class="event ev-${e.kind}" style="--k:${colour(e.team)};--o:${onColour(e.team)}">
    <span class="mm">${esc(e.min)}'</span>
    <div class="ecard"><span class="ekind">${e.kind === 'red' ? '<i class="redcard" aria-hidden="true"></i>' : ''}${KIND[e.kind]}</span><p>${esc(e.text)}</p>
      ${e.whatif ? `<button class="ev-whatif" data-wi="${e.whatif}">Change this moment</button>` : ''}</div></li>`;
}

// one line of a match summary: minute, who, and a small text tag
const TAG = { goal: 'goal', pen: 'penalty', red: 'red card', yellow: 'yellow only', saved: 'saved', var: 'disallowed', fk: 'free kick', stands: 'goal stands', you: 'saved by you' };
export const L = (min, name, tag) => `<b>${esc(min)}'</b> ${esc(name)} <i class="tag t-${tag}">${TAG[tag]}</i>`;

// ---------------- the final's what-ifs ----------------
const ESP = 'Spain', ARG = 'Argentina';
const ATT = { [ESP]: ['Ferran Torres', 'Lamine Yamal', 'Nico Williams', 'Mikel Merino', 'Pedri'], [ARG]: ['Lautaro Martínez', 'Lionel Messi', 'Julián Álvarez', 'Giuliano Simeone'] };

export const SCENARIOS = {
  104: [
    { id: 'injury', min: '50', title: 'Martínez goes off injured', real: 'He played all 120 minutes and made 11 saves.' },
    { id: 'nored', min: '90+3', title: 'Enzo Fernández stays on', real: 'Second yellow, sent off.' },
    { id: 'pen', min: '90+3', title: 'The foul on Cubarsí is in the box', real: 'It was outside. Free kick and a red card.' },
    { id: 'yamal', min: '90+9', title: 'Yamal’s free kick goes in', real: 'Martínez tipped it away.' },
    { id: 'var', min: '96', title: 'VAR lets Nico Williams’ goal stand', real: 'Ruled out for Merino’s foul on Otamendi.' },
    { id: 'save', min: '106', title: 'You save Ferran Torres’ shot', real: 'It went in. The only goal of the final.' },
    { id: 'simeone', min: '120+2', title: 'Simeone scores', real: 'He put it over the bar.' }
  ]
};
export const hasExtras = num => !!SCENARIOS[num];

export function hubHTML(m) {
  const list = SCENARIOS[m.num]; if (!list) return '';
  return `<section class="wi-hub" id="whatifs" aria-labelledby="h-wi">
    <h2 id="h-wi">Change a moment</h2>
    <p class="wi-intro">Seven things in the final that could easily have gone the other way. Pick one, then watch it play out.</p>
    <ol class="wi-list">${list.map(s => `<li><button data-wi="${s.id}"><span class="wi-min">${esc(s.min)}'</span><span class="wi-what"><b>${esc(s.title)}</b><small>What happened: ${esc(s.real)}</small></span><span class="wi-go">Play it</span></button></li>`).join('')}</ol>
  </section>`;
}

// a goal object in the shape the replay theatre expects
function goal(side, name, minute, before, extra = {}) {
  const after = before.slice(); after[side]++;
  return { side, team: side ? ARG : ESP, name, minute, before: before.slice(), after, kind: 'Goal', ...extra };
}
const card = (clock, big, small, colour = '#C9A35B', ms = 2400) => ({ type: 'card', clock: clock + "'", banner: { big, small, colour }, ms });

// Poisson-ish minute-by-minute simulation of what's left of the final
function simGoals(from, to, rate, r = Math.random) { const out = []; for (let t = from; t < to; t++) if (r() < rate) out.push(t); return out; }

// ---------------- the shootout mini-game ----------------
// You pick a team. When they shoot, you dive. When you shoot, you pick a corner.
export function shootout(out, t1, t2, { colour, code }) {
  return new Promise(resolve => {
    const ZONES = ['left', 'middle', 'right'];
    const aiPick = () => { const x = Math.random(); return x < .42 ? 'left' : x < .58 ? 'middle' : 'right'; };
    let me = null, round = 0, kicks = [[], []], first = Math.random() < .5 ? 0 : 1, turn = first;
    const teams = [t1, t2];
    const tally = i => kicks[i].filter(Boolean).length;
    const decided = () => {
      const n = Math.max(kicks[0].length, kicks[1].length);
      if (kicks[0].length <= 5 && kicks[1].length <= 5) {
        const left = i => 5 - kicks[i].length;
        if (tally(0) + left(0) < tally(1) || tally(1) + left(1) < tally(0)) return true;
        if (kicks[0].length === 5 && kicks[1].length === 5) return tally(0) !== tally(1);
        return false;
      }
      return kicks[0].length === kicks[1].length && tally(0) !== tally(1) && n > 5;
    };
    const dots = i => { const n = Math.max(5, kicks[0].length, kicks[1].length); return Array.from({ length: n }, (_, k) => `<i class="${kicks[i][k] === true ? 'in' : kicks[i][k] === false ? 'out' : ''}"></i>`).join(''); };
    function board(msg, controls = '') {
      out.innerHTML = `<section class="whatif so">
        <p class="wi-k">Penalties</p><h3>${msg}</h3>
        <div class="so-rows">${[0, 1].map(i => `<div class="so-row"><b style="--k:${colour(teams[i])}">${esc(code(teams[i]))}${me === i ? ' <small>you</small>' : ''}</b><span class="so-dots">${dots(i)}</span><em>${tally(i)}</em></div>`).join('')}</div>
        <div class="so-goal" aria-hidden="true"><div class="so-net"></div><span class="so-keeper"></span><span class="so-ball"></span></div>
        <div class="so-ctl">${controls}</div></section>`;
    }
    function animate(shot, dive, scored) {
      const g = out.querySelector('.so-goal'); if (!g) return;
      const X = { left: '18%', middle: '50%', right: '82%' };
      g.querySelector('.so-keeper').style.left = X[dive];
      const b = g.querySelector('.so-ball'); b.style.left = scored === 'wide' ? (shot === 'left' ? '-6%' : '106%') : X[shot]; b.style.bottom = scored === 'wide' ? '96%' : '46%'; b.style.transform = 'scale(.7)';
    }
    async function kick() {
      if (decided()) {
        const w = tally(0) > tally(1) ? 0 : 1;
        board(`${esc(teams[w])} win the shootout ${Math.max(tally(0), tally(1))}–${Math.min(tally(0), tally(1))}.`, `<button class="btn-brass" data-done>Compare with what happened</button>`);
        out.querySelector('[data-done]').onclick = () => resolve({ p: [tally(0), tally(1)], winner: teams[w] });
        return;
      }
      const shooter = turn, mine = shooter === me, k = kicks[shooter].length + 1;
      board(mine ? `${esc(teams[shooter])}, kick ${k}. You’re taking it.` : `${esc(teams[shooter])}, kick ${k}. You’re in goal.`,
        ZONES.map(z => `<button data-z="${z}">${mine ? (z === 'middle' ? 'Middle' : z === 'left' ? 'Left corner' : 'Right corner') : (z === 'middle' ? 'Stay central' : z === 'left' ? 'Dive left' : 'Dive right')}</button>`).join(''));
      const choice = await new Promise(r => out.querySelectorAll('[data-z]').forEach(b => b.onclick = () => r(b.dataset.z)));
      out.querySelectorAll('[data-z]').forEach(b => b.disabled = true);
      const shot = mine ? choice : aiPick(), dive = mine ? aiPick() : choice;
      let res;
      if (Math.random() < .05) res = 'wide';
      else if (shot === dive) res = Math.random() < (shot === 'middle' ? .85 : mine ? .8 : .75) ? 'saved' : 'goal';
      else res = 'goal';
      animate(shot, dive, res);
      await wait(650);
      kicks[shooter].push(res === 'goal');
      const line = out.querySelector('h3'); if (line) line.textContent = res === 'goal' ? (mine ? 'Scored.' : 'They score.') : res === 'saved' ? (mine ? 'Saved. The keeper went the right way.' : 'You saved it.') : (mine ? 'Wide.' : 'They miss. Wide.');
      out.querySelector('.so-dots') && out.querySelectorAll('.so-row').forEach((row, i) => { row.querySelector('.so-dots').innerHTML = dots(i); row.querySelector('em').textContent = tally(i); });
      await wait(1300);
      if (kicks[0].length === kicks[1].length) round++;
      turn = 1 - turn;
      kick();
    }
    out.innerHTML = `<section class="whatif so"><p class="wi-k">Level, so it goes to penalties</p><h3>Who are you taking them for?</h3>
      <p>You take your team’s kicks and go in goal for the other side’s. ${esc(teams[first])} won the toss and go first.</p>
      <div class="so-ctl">${[0, 1].map(i => `<button data-me="${i}" style="--k:${colour(teams[i])}" class="so-team">${esc(teams[i])}</button>`).join('')}</div></section>`;
    out.querySelectorAll('[data-me]').forEach(b => b.onclick = () => { me = +b.dataset.me; kick(); });
  });
}

// ---------------- really vs your version ----------------
export function compareHTML({ m, real, mine, code, colour }) {
  const score = v => `<span class="cmp-score">${esc(code(m.t1))} <b>${v.score[0]}–${v.score[1]}</b> ${esc(code(m.t2))}</span><small>${esc(v.note || '')}</small>`;
  const won = v => v.winner ? `${esc(v.winner)}${m.stage === 'F' ? '' : m.stage === 'G' ? ' win' : ' go through'}` : 'Draw';
  return `<table class="cmp">
    <thead><tr><th scope="col"><span class="sr">Row</span></th><th scope="col">What happened</th><th scope="col" class="mine">Your version</th></tr></thead>
    <tbody>
      <tr><th scope="row">Score</th><td>${score(real)}</td><td class="mine">${score(mine)}</td></tr>
      <tr><th scope="row">Key moments</th><td><ul>${real.lines.map(l => `<li>${l}</li>`).join('')}</ul></td><td class="mine"><ul>${mine.lines.map(l => `<li>${l}</li>`).join('')}</ul></td></tr>
      <tr><th scope="row">${m.stage === 'F' ? 'World champions' : 'Result'}</th><td>${won(real)}</td><td class="mine${real.winner !== mine.winner ? ' diff' : ''}">${won(mine)}</td></tr>
    </tbody></table>`;
}

// what really happened, as lines
export function realSummary(m, moments, winner, E) {
  const s = E.finalScore(m), lines = [];
  const evs = (EVENTS[m.num] || []).filter(e => e.kind === 'red' || e.kind === 'var');
  const all = [...moments.map(g => ({ t: mins(g.minute), h: L(g.minute, g.name + (g.owngoal ? ' (own goal)' : ''), g.penalty ? 'pen' : 'goal') })), ...evs.map(e => ({ t: mins(e.min), h: L(e.min, e.who, e.kind === 'red' ? 'red' : 'var') }))].sort((a, b) => a.t - b.t);
  all.forEach(x => lines.push(x.h));
  if (!lines.length) lines.push('No goals');
  return { score: s, note: m.p ? `${winner} won ${Math.max(...m.p)}–${Math.min(...m.p)} on penalties` : m.et ? 'After extra time' : 'Full time', lines, winner };
}

// ---------------- running a scenario ----------------
// ctx: { m, rc, replay, out, theatre, colour, code, startSave, finish(result) }
export async function runScenario(id, ctx) {
  const { out, replay } = ctx;
  replay.stopPlay?.();
  ctx.theatre.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (id === 'save') return ctx.startSave();
  const ask = (k, h, body, buttons) => new Promise(r => {
    out.innerHTML = `<section class="whatif wi-ask"><p class="wi-k">${k}</p><h3>${h}</h3>${body ? `<p>${body}</p>` : ''}<div class="so-ctl left">${buttons.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></section>`;
    out.querySelectorAll('[data-v]').forEach(b => b.onclick = () => r(b.dataset.v));
  });
  const F = SCENARIOS[104];
  let items = [], score = [0, 0], et = false, penNote = false, note = '', lines = [], winner = null, end = null, odds = '';
  const add = (g, line) => { items.push({ g }); score = g.after.slice(); lines.push(line || L(g.minute, g.name, g.penalty ? 'pen' : 'goal')); };
  const nilnil = () => items.push(card('90', '0 – 0', 'Goalless after 90 minutes.', '#7C877F', 2000));
  const finishWith = async (s, isEt, n) => {
    score = s; et = isEt; note = [note, n].filter(Boolean).join(' ');
    if (score[0] === score[1]) {
      end = { clock: '120\'', score, text: 'Level after 120 minutes. Penalties.' };
      replay.playScript(items, { title: 'Your version', end });
      const so = await shootout(out, ESP, ARG, ctx);
      winner = so.winner; penNote = true; note = `${winner} win ${Math.max(...so.p)}–${Math.min(...so.p)} on penalties`; lines.push(`<b>Pens</b> ${so.p[0]}–${so.p[1]}`);
      return;
    }
    winner = score[0] > score[1] ? ESP : ARG;
    end = { clock: isEt ? '120\'' : '90\'', score, text: `${winner} win the World Cup.` };
  };

  if (id === 'nored') {
    await ask("90+3'", 'Enzo Fernández, already booked, goes through the back of Pau Cubarsí. You’re the referee.', 'The real referee showed a second yellow, so Argentina played extra time with ten men.',
      [['free', 'Free kick, no card'], ['talk', 'Have a word with him']]);
    // odds: what's left of the match with eleven men each, played 5,000 times
    const N = 5000, R = [0, 0, 0]; for (let i = 0; i < N; i++) { const a = simGoals(94, 121, .016).length, b = simGoals(94, 121, .0085).length; R[a > b ? 0 : a < b ? 1 : 2]++; }
    odds = `Extra time simulated 5,000 times, eleven v eleven: Spain ${Math.round(R[0] / N * 100)}%, Argentina ${Math.round(R[1] / N * 100)}%, penalties ${Math.round(R[2] / N * 100)}%. Spain’s scoring rate is based on their 1.94 xG in the final. Argentina’s is based on how little they made (first shot in the 117th minute), raised a bit for having all eleven players.`;
    lines.push(L('90+3', 'Enzo Fernández', 'yellow'));
    nilnil(); items.push(card('90+3', 'NO RED CARD', 'Enzo Fernández stays on.', '#E5C04A'));
    const a = simGoals(94, 121, .016), b = simGoals(94, 121, .0085), evs = [...a.map(t => [0, t]), ...b.map(t => [1, t])].sort((x, y) => x[1] - y[1]);
    let sc = [0, 0];
    for (const [side, t] of evs) { const g = goal(side, pick(ATT[side ? ARG : ESP]), String(t), sc); add(g); sc = g.after; }
    if (!evs.length) items.push(card('120', '0 – 0', 'No goals in extra time.', '#7C877F'));
    await finishWith(sc, true, '');
  }

  else if (id === 'pen') {
    const taker = await ask("90+3'", 'Enzo Fernández brings down Cubarsí inside the box. Penalty to Spain. Who takes it?', 'Enzo is still sent off.',
      [['Lamine Yamal', 'Lamine Yamal'], ['Ferran Torres', 'Ferran Torres'], ['Mikel Merino', 'Mikel Merino']]);
    const side = await ask("90+3'", `${esc(taker)} puts the ball on the spot. Where does it go?`, 'Martínez saved a penalty in the 2022 final shootout, so he won’t make it easy.',
      [['left', 'Left corner'], ['middle', 'Middle'], ['right', 'Right corner']]);
    const x = Math.random(), dive = x < .42 ? 'left' : x < .58 ? 'middle' : 'right';
    const scored = dive === side ? Math.random() < .25 : Math.random() < .95;
    nilnil(); items.push(card('90+3', 'PENALTY', `Enzo Fernández sent off. ${taker} to take it.`, '#E5544F'));
    lines.push(L('90+3', 'Enzo Fernández', 'red'));
    const g = goal(0, taker, '90+3', [0, 0], { penalty: true });
    if (scored) { add(g); note = `Martínez ${dive === 'middle' ? 'stayed in the middle' : 'dived ' + dive}. ${taker} went ${side === 'middle' ? 'down the middle' : side}.`; await finishWith([1, 0], false, ''); }
    else {
      items.push({ g, outcome: 'save', big: 'SAVED', small: `Martínez went ${dive}.` }); lines.push(L('90+3', taker, 'saved'));
      const t = goal(0, 'Ferran Torres', '106', [0, 0]); add(t);
      note = `Martínez ${dive === 'middle' ? 'stayed in the middle' : 'dived ' + dive}. ${taker} went ${side === 'middle' ? 'down the middle' : side}. Saved.`;
      await finishWith([1, 0], true, 'Torres still scores in extra time.');
    }
  }

  else if (id === 'yamal') {
    const where = await ask("90+9'", 'Free kick to Spain, about 25 yards out. You’re Lamine Yamal. Where do you aim?', 'The real one curled toward the corner and Martínez tipped it away.',
      [['top', 'Over the wall, top corner'], ['near', 'Around the wall, keeper’s side'], ['low', 'Under the wall']]);
    const p = { top: .55, near: .42, low: .38 }[where];
    const scored = Math.random() < p;
    lines.push(L('90+3', 'Enzo Fernández', 'red'));
    nilnil(); items.push(card('90+3', 'RED CARD', 'Enzo Fernández is sent off.', '#E5544F'));
    const g = goal(0, 'Lamine Yamal', '90+9', [0, 0]);
    if (scored) { add(g, L('90+9', 'Lamine Yamal', 'fk')); note = `${({ top: 'Over the wall and into the top corner.', near: 'Around the wall, inside the near post.', low: 'Under the wall as it jumped.' })[where]}`; await finishWith([1, 0], false, ''); }
    else { items.push({ g, outcome: 'save', big: 'SAVED', small: 'Martínez gets to it.' }); lines.push(L('90+9', 'Lamine Yamal', 'saved')); const t = goal(0, 'Ferran Torres', '106', [0, 0]); add(t); note = 'Martínez saved this one too.'; await finishWith([1, 0], true, 'Torres still scores in extra time.'); }
  }

  else if (id === 'var') {
    await ask("96'", 'Nico Williams scores, then VAR checks it. Merino caught Otamendi’s foot in the build-up. You’re the VAR.', '',
      [['stand', 'Not a foul. Goal stands.']]);
    lines.push(L('90+3', 'Enzo Fernández', 'red'));
    nilnil(); items.push(card('90+3', 'RED CARD', 'Enzo Fernández is sent off.', '#E5544F'));
    const g = goal(0, 'Nico Williams', '96', [0, 0]); add(g, L('96', 'Nico Williams', 'stands'));
    const t = goal(0, 'Ferran Torres', '106', g.after); add(t);
    note = 'Argentina would have needed two goals with ten men.';
    await finishWith([2, 0], true, '');
  }

  else if (id === 'injury') {
    await ask("50'", 'Emiliano Martínez pulls up injured and Argentina’s back-up keeper comes on.', 'Martínez made 11 saves in the real final. Here, every Spain shot on target after this point faces a keeper who saves 70% of shots, roughly an average keeper. Where we don’t know the exact minute of a shot, we’ve spaced them out.',
      [['go', 'Play the rest of the match']]);
    items.push(card('50', 'KEEPER OFF', 'Martínez is injured. The back-up comes on.', '#E5544F'));
    const reg = [['55', 'Lamine Yamal'], ['64', 'Pedri'], ['71', 'Nico Williams'], ['77', 'Pedro Porro'], ['77', 'Pau Cubarsí'], ['85', 'Mikel Merino'], ['90+9', 'Lamine Yamal']];
    let sc = [0, 0];
    for (const [t, n] of reg) {
      if (t === '90+9' && !items.some(i => i.type === 'card' && i.banner.big === 'RED CARD')) { items.push(card('90+3', 'RED CARD', 'Enzo Fernández is sent off.', '#E5544F')); lines.push(L('90+3', 'Enzo Fernández', 'red')); }
      const g = goal(0, n, t, sc);
      if (Math.random() < .3) { add(g); sc = g.after; } else items.push({ g, outcome: 'save', big: 'SAVED', small: `${sur(n)} is denied.` });
    }
    if (sc[0] === 0) {
      for (const [t, n] of [['101', 'Nico Williams'], ['106', 'Ferran Torres'], ['111', 'Mikel Merino']]) {
        const g = goal(0, n, t, sc);
        if (n === 'Ferran Torres' || Math.random() < .3) { add(g); sc = g.after; } else items.push({ g, outcome: 'save', big: 'SAVED', small: `${sur(n)} is denied.` });
      }
      await finishWith(sc, true, '');
    } else await finishWith(sc, false, '');
    note = `${sc[0]} of Spain’s shots went in against the back-up.`;
  }

  else if (id === 'simeone') {
    await ask("120+2'", 'Spain lead 1–0. The ball drops to Giuliano Simeone in the box.', 'He put the real one over the bar.',
      [['in', 'Keep it down this time']]);
    lines.push(L('90+3', 'Enzo Fernández', 'red'));
    nilnil(); items.push(card('90+3', 'RED CARD', 'Enzo Fernández is sent off.', '#E5544F'));
    const t = goal(0, 'Ferran Torres', '106', [0, 0]); add(t);
    const s = goal(1, 'Giuliano Simeone', '120+2', t.after); add(s);
    await finishWith([1, 1], true, '');
  }

  if (end && !(score[0] === score[1])) replay.playScript(items, { title: 'Your version', end });
  const real = ctx.realSummary();
  const changed = winner !== ctx.rc.winner || penNote || et !== !!ctx.m.et || score[0] !== real.score[0] || score[1] !== real.score[1];
  const s = F.find(x => x.id === id);
  const hi = Math.max(...score), lo = Math.min(...score);
  const head = !changed ? `No change. Spain still win ${hi}–${lo} after extra time.`
    : winner !== ctx.rc.winner ? `${winner} win the World Cup${penNote ? ' on penalties' : `, ${hi}–${lo}${et ? ' after extra time' : ''}`}.`
    : penNote ? `Spain still win, but on penalties.` : !et ? `Spain win ${hi}–${lo} in normal time. No extra time.` : `Spain win ${hi}–${lo} after extra time.`;
  out.innerHTML = `<section class="whatif"><p class="wi-k">${esc(s.min)}' · ${esc(s.title)}</p>
    <h3>${esc(head)}</h3>
    ${penNote || !note ? '' : `<p>${esc(note)}</p>`}${odds ? `<p class="wi-odds">${esc(odds)}</p>` : ''}
    ${compareHTML({ m: ctx.m, real, mine: { score, note: penNote ? note : et ? 'After extra time' : 'Full time', lines, winner }, code: ctx.code, colour: ctx.colour })}
    <div class="so-ctl left"><button data-replay>Watch it again</button><button data-again>Run it again</button><a class="wi-back" href="#whatifs">Pick another moment</a></div></section>`;
  out.querySelector('[data-replay]').onclick = () => { ctx.theatre.scrollIntoView({ behavior: 'smooth', block: 'start' }); replay.playScript(items, { title: 'Your version', end: { clock: et ? '120\'' : '90\'', score, text: winner ? `${winner} win the World Cup.` : '' } }); };
  out.querySelector('[data-again]').onclick = () => runScenario(id, ctx);
  ctx.finish({ match: ctx.m.num, scenario: id, changed, saved: false, winner });
}
