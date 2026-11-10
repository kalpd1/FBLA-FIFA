// =============================================================
//  story.js — turns raw match data into a written recap.
//  Every sentence is derived from the data (goals, minutes,
//  half-time score, extra time, penalties). Nothing is invented.
// =============================================================
import { finalScore, winnerOf, STAGE_NAMES } from './engine.js';

const mins = m => { const [a, b] = String(m).split('+'); return +a + (b ? +b / 100 : 0); };
const minuteText = m => `${m}'`;
const surname = n => n.split(' ').slice(-1)[0];
const list = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr.at(-1);

// Every goal in time order, with the running score and what it did to the game
export function moments(m) {
  const all = [
    ...m.goals1.map(g => ({ ...g, side: 0, team: m.t1 })),
    ...m.goals2.map(g => ({ ...g, side: 1, team: m.t2 }))
  ].sort((a, b) => mins(a.minute) - mins(b.minute));
  const score = [0, 0];
  const out = all.map((g, i) => {
    const before = score.slice();
    score[g.side]++;
    const after = score.slice();
    const me = g.side, them = 1 - g.side;
    let kind;
    if (i === 0) kind = 'Opener';
    else if (before[me] < before[them] && after[me] === after[them]) kind = 'Equaliser';
    else if (before[me] === before[them]) kind = 'Go-ahead goal';
    else if (before[me] < before[them]) kind = 'Pulls one back';
    else kind = 'Extends the lead';
    return { ...g, before, after, kind, n: i + 1, extra: mins(g.minute) > 90.99 && !!m.et };
  });
  // Mark the decisive goal: the one that put the winner ahead for good
  const s = finalScore(m);
  if (s[0] !== s[1]) {
    const w = s[0] > s[1] ? 0 : 1;
    const loserTotal = s[1 - w];
    const decisive = out.find(g => g.side === w && g.after[w] === loserTotal + 1);
    if (decisive) { decisive.decisive = true; decisive.kind = mins(decisive.minute) >= 85 ? 'Late winner' : 'Winner'; }
  }
  return out;
}

// A headline, a standfirst and a few paragraphs
export function recap(m, venue) {
  const s = finalScore(m), ms = moments(m);
  const [A, B] = [m.t1, m.t2];
  const win = m.stage === 'G' ? (s[0] > s[1] ? A : s[1] > s[0] ? B : null) : winnerOf(m);
  const lose = win ? (win === A ? B : A) : null;
  const hi = Math.max(...s), lo = Math.min(...s);
  const stage = m.stage === 'G' ? `Group ${m.group}` : STAGE_NAMES[m.stage];
  const total = s[0] + s[1];
  const comeback = win && m.ht && ((win === A && m.ht[0] < m.ht[1]) || (win === B && m.ht[1] < m.ht[0]));
  const late = ms.find(g => g.decisive && mins(g.minute) >= 85);
  const hat = Object.entries(ms.filter(g => !g.owngoal).reduce((c, g) => (c[g.name] = (c[g.name] || 0) + 1, c), {})).find(([, n]) => n >= 3);

  // ---- headline: pick the most remarkable thing about this match
  let headline;
  if (m.p) headline = `${win} hold their nerve in a shootout against ${lose}`;
  else if (m.stage === 'F') headline = `${win} are champions of the world`;
  else if (m.et && win) headline = `${win} edge ${lose} in extra time`;
  else if (hat) headline = `${hat[0]} hat-trick ${win === ms.find(g => g.name === hat[0]).team ? 'carries' : 'is not enough for'} ${ms.find(g => g.name === hat[0]).team}`;
  else if (comeback) headline = `${win} come from behind to beat ${lose}`;
  else if (late) headline = `Late ${surname(late.name)} winner settles it for ${win}`;
  else if (win && hi - lo >= 4) headline = `${win} run riot against ${lose}`;
  else if (!win && total === 0) headline = `${A} and ${B} cancel each other out`;
  else if (!win) headline = `${A} and ${B} share the points`;
  else if (total >= 5) headline = `${win} win a ${total}-goal thriller against ${lose}`;
  else headline = `${win} beat ${lose} ${hi}–${lo}`;

  // ---- standfirst
  const where = venue ? `${venue.stadium}` : m.ground;
  const standfirst = `${stage} at ${where}, ${new Date(m.date + 'T12:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' })}. ${A} ${s[0]}, ${B} ${s[1]}${m.et ? ' after extra time' : ''}${m.p ? `, ${win} won ${Math.max(...m.p)}–${Math.min(...m.p)} on penalties` : ''}.`;

  // ---- paragraphs
  const paras = [];
  if (!ms.length) {
    paras.push(`Neither side found a way through in ${m.et ? '120' : '90'} minutes.`);
  } else {
    const first = ms[0];
    let p1 = `${first.owngoal ? `An own goal by ${first.name}` : first.name} put ${first.team} ahead in the ${ordinal(parseInt(first.minute))} minute${first.penalty ? ' from the penalty spot' : ''}.`;
    if (first.owngoal) p1 = `${first.name}'s own goal gave ${first.team} the lead in the ${ordinal(parseInt(first.minute))} minute.`;
    if (m.ht) p1 += ` ${m.ht[0] === m.ht[1] ? `It was level at ${m.ht[0]}–${m.ht[1]} at half time.` : `${m.ht[0] > m.ht[1] ? A : B} led ${Math.max(...m.ht)}–${Math.min(...m.ht)} at the break.`}`;
    paras.push(p1);

    const eq = ms.filter(g => g.kind === 'Equaliser');
    const rest = [];
    const dec0 = ms.find(g => g.decisive);
    const told = new Set([first, ...eq, dec0]);
    const others = ms.filter(g => !told.has(g));
    const sc = g => g.side === 0 ? `${g.after[0]}–${g.after[1]}` : `${g.after[1]}–${g.after[0]}`;
    for (const g of others.slice(0, 4)) {
      const who = g.owngoal ? `An own goal by ${g.name}` : g.name;
      if (g.kind === 'Extends the lead') rest.push(`${who} made it ${sc(g)} to ${g.team} in the ${ordinal(parseInt(g.minute))} minute${g.penalty ? ' with a penalty' : ''}.`);
      else if (g.kind === 'Pulls one back') rest.push(`${who} pulled one back for ${g.team} (${minuteText(g.minute)}).`);
      else rest.push(`${who} put ${g.team} in front ${sc(g)} in the ${ordinal(parseInt(g.minute))} minute.`);
    }
    if (others.length > 4) rest.push(`${others.length - 4} more goal${others.length - 4 > 1 ? 's' : ''} followed.`);
    if (eq.length) rest.push(`${list(eq.map(g => `${g.name} (${minuteText(g.minute)})`))} ${eq.length > 1 ? 'each drew a side level' : `brought ${eq[0].team} level`}.`);
    const dec = ms.find(g => g.decisive);
    if (dec && dec !== first) rest.push(`The decisive goal came from ${dec.owngoal ? `an own goal by ${dec.name}` : dec.name} in the ${ordinal(parseInt(dec.minute))} minute${dec.extra ? ', in extra time' : ''}${dec.penalty ? ', a penalty' : ''}.`);
    if (hat) rest.push(`${hat[0]} scored ${hat[1]} times.`);
    if (rest.length) paras.push(rest.join(' '));
  }
  if (m.p) paras.push(`With nothing between them after 120 minutes, it went to penalties. ${win} won the shootout ${Math.max(...m.p)}–${Math.min(...m.p)}.`);

  return { headline, standfirst, paras, moments: ms, winner: win, loser: lose, comeback, total };
}

export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

// Score difference over time, for the momentum chart: [[minute, diff], ...]
export function scoreWorm(m) {
  const pts = [[0, 0]]; let d = 0;
  for (const g of moments(m)) { pts.push([Math.min(mins(g.minute), m.et ? 120 : 95), d]); d += g.side === 0 ? 1 : -1; pts.push([Math.min(mins(g.minute), m.et ? 120 : 95), d]); }
  pts.push([m.et ? 120 : 95, d]);
  return pts;
}
