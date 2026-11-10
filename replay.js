// =============================================================
//  replay.js — the highlight theatre on every match page.
//  Each goal is re-created as a short animation on a broadcast-
//  style pitch: the build-up, the finish, the net bulging, the
//  scoreboard ticking over.
//
//  Honest label: the minute, scorer, team, penalty and own-goal
//  details are real. The movement of players is an animated
//  re-creation, generated from a seed, not tracking data.
// =============================================================
import { rng } from './art.js';

const W = 1280, H = 640;
const P = { x0: 70, x1: W - 70, y0: 70, y1: H - 50 };          // pitch rectangle on the canvas
const px = x => P.x0 + x * (P.x1 - P.x0);                         // x, y in 0..1 pitch units
const py = y => P.y0 + y * (P.y1 - P.y0);
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const lerp = (a, b, t) => a + (b - a) * t;


// ---------- the scene ----------
export function createReplay(canvas, match, moments, { colour, onColour, code, reduced }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  let raf = 0, queue = [], playing = null, score = [0, 0], clock = '0\'', banner = null, flash = 0, shake = 0, net = 0;
  let stopped = false;
  const k1 = colour(match.t1), k2 = colour(match.t2);

  // formation in pitch units, attacking to the right
  const ATT = [[.50, .50], [.62, .28], [.62, .72], [.74, .42], [.78, .62], [.70, .15], [.70, .85]];
  const DEF = [[.80, .30], [.80, .50], [.80, .70], [.70, .52], [.88, .40], [.88, .60]];
  let players = [];

  function build(g) {
    const r = rng(`${match.num}-${g.minute}-${g.name}`);
    const right = g.side === 0;                   // team 1 attacks to the right
    const mir = x => right ? x : 1 - x;
    const kA = g.owngoal ? (g.side === 0 ? k2 : k1) : (g.side === 0 ? k1 : k2); // colour of the player who touches it last
    const attackers = ATT.map(([x, y]) => ({ x: mir(x - .08 + r() * .05), y: y + (r() - .5) * .08, c: g.side === 0 ? k1 : k2 }));
    const defenders = DEF.map(([x, y]) => ({ x: mir(x + (r() - .5) * .04), y: y + (r() - .5) * .08, c: g.side === 0 ? k2 : k1 }));
    const keeper = { x: mir(.975), y: .5, c: '#E9E4D6', gk: true };
    players = [...attackers, ...defenders, keeper];

    const goalX = mir(1.0), corner = .5 + (r() < .5 ? -1 : 1) * (.03 + r() * .04);
    let path;
    if (g.penalty) {
      const spot = { x: mir(.895), y: .5 };
      attackers[0].x = mir(.84); attackers[0].y = .5;
      path = [{ ...spot, hold: 1.1, kicker: 0 }, { x: goalX, y: corner, speed: 2.4 }];
      keeper.dive = corner < .5 ? .06 : -.06;     // keeper goes the wrong way
    } else if (g.owngoal) {
      const wide = { x: mir(.80), y: r() < .5 ? .1 : .9 };
      path = [{ x: mir(.55), y: .5 }, { ...wide }, { x: mir(.93), y: .5 + (r() - .5) * .08, deflect: true }, { x: goalX, y: corner, speed: 2 }];
    } else {
      const n = 2 + Math.floor(r() * 3), pts = [{ x: mir(.48), y: .5 }];
      for (let i = 0; i < n; i++) pts.push({ x: mir(.58 + i * (.24 / n) + r() * .05), y: .2 + r() * .6 });
      pts.push({ x: mir(.82 + r() * .06), y: .35 + r() * .3 });
      pts.push({ x: goalX, y: corner, speed: 2.6 });
      path = pts;
    }
    // assign the nearest attacker to receive each pass
    path.forEach((p, i) => { if (i < path.length - 1 && !p.deflect) { let best = 0, bd = 9; attackers.forEach((a, j) => { const dd = Math.hypot(a.x - p.x, a.y - p.y); if (dd < bd) { bd = dd; best = j; } }); p.who = best; } });
    return { g, path, attackers, defenders, keeper, kA, right };
  }

  function drawPitch() {
    // stands
    const st = ctx.createLinearGradient(0, 0, 0, P.y0);
    st.addColorStop(0, '#0C1310'); st.addColorStop(1, '#1A2420');
    ctx.fillStyle = st; ctx.fillRect(0, 0, W, H);
    // crowd dots in both kit colours along the top stand
    const r = rng('crowd' + match.num);
    for (let i = 0; i < 900; i++) { const x = r() * W, y = r() * (P.y0 - 14) + 4; ctx.fillStyle = r() < .45 ? k1 : r() < .8 ? k2 : '#C9C3B4'; ctx.globalAlpha = .55 + r() * .4; ctx.fillRect(x, y, 3, 4); }
    ctx.globalAlpha = 1;
    // grass with mowing stripes
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#1E6A43' : '#237750'; ctx.fillRect(P.x0 - 40 + i * ((P.x1 - P.x0 + 80) / 16), P.y0 - 10, (P.x1 - P.x0 + 80) / 16 + 1, P.y1 - P.y0 + 60); }
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
    ctx.beginPath(); ctx.moveTo(W / 2, P.y0); ctx.lineTo(W / 2, P.y1); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, py(.5), 62, 0, 7); ctx.stroke();
    for (const s of [0, 1]) {
      const x = s ? P.x1 : P.x0, d = s ? -1 : 1;
      ctx.strokeRect(Math.min(x, x + d * 170), py(.2), 170, py(.8) - py(.2));
      ctx.strokeRect(Math.min(x, x + d * 58), py(.37), 58, py(.63) - py(.37));
      ctx.beginPath(); ctx.arc(x + d * 120, py(.5), 2.5, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      // goal and net
      const gx = x - d * 0, gw = 22;
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(Math.min(gx, gx - d * gw), py(.44), gw, py(.56) - py(.44));
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(Math.min(gx, gx - d * gw), py(.44), gw, py(.56) - py(.44)); ctx.lineWidth = 2;
    }
    // floodlight glow
    const fl = ctx.createRadialGradient(W / 2, -100, 50, W / 2, H / 2, W * .8);
    fl.addColorStop(0, 'rgba(255,248,226,.18)'); fl.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = fl; ctx.fillRect(0, 0, W, H);
  }

  function drawPlayer(p, hl) {
    const x = px(p.x), y = py(p.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 9, 10, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(x, y, hl ? 12 : 10, 0, 7); ctx.fill();
    ctx.strokeStyle = p.gk ? '#222' : 'rgba(255,255,255,.85)'; ctx.lineWidth = hl ? 3 : 1.5; ctx.stroke();
  }

  function drawHUD() {
    // scoreboard bug, top left, like a TV broadcast
    const x = 22, y = 18;
    ctx.fillStyle = 'rgba(8,12,10,.88)'; ctx.fillRect(x, y, 300, 40);
    ctx.fillStyle = k1; ctx.fillRect(x, y, 8, 40); ctx.fillStyle = k2; ctx.fillRect(x + 196, y, 8, 40);
    ctx.font = '800 22px "Big Shoulders Display", "Arial Narrow", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#EDE8DC'; ctx.fillText(code(match.t1), x + 18, y + 21); ctx.fillText(code(match.t2), x + 214, y + 21);
    ctx.fillStyle = '#EBD29A'; ctx.textAlign = 'center'; ctx.fillText(`${score[0]} – ${score[1]}`, x + 130, y + 21); ctx.textAlign = 'left';
    ctx.fillStyle = '#C9A35B'; ctx.fillRect(x + 300, y, 66, 40);
    ctx.fillStyle = '#1A140A'; ctx.textAlign = 'center'; ctx.fillText(clock, x + 333, y + 21); ctx.textAlign = 'left';
  }

  function drawBanner(t) {
    if (!banner) return;
    const a = Math.min(1, t * 3);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,12,10,.78)'; ctx.fillRect(0, H / 2 - 92, W, 184);
    ctx.fillStyle = banner.colour; ctx.fillRect(0, H / 2 - 92, W, 6); ctx.fillRect(0, H / 2 + 86, W, 6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${96 + Math.sin(t * 8) * 2}px "Big Shoulders Display", "Arial Narrow", sans-serif`; ctx.fillStyle = '#EBD29A';
    ctx.fillText(banner.big, W / 2, H / 2 - 22);
    ctx.font = '700 34px "Bricolage Grotesque", "Trebuchet MS", sans-serif'; ctx.fillStyle = '#EDE8DC';
    ctx.fillText(banner.small, W / 2, H / 2 + 50);
    ctx.restore(); ctx.textAlign = 'left';
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    if (shake > 0) { ctx.translate((Math.random() - .5) * shake * 10, (Math.random() - .5) * shake * 10); shake = Math.max(0, shake - dt * 2); }
    drawPitch();
    let ballX = .5, ballY = .5, hl = null;
    if (playing) {
      const s = playing; if (!s.frozen) s.t += dt;
      // walk along the path
      const legs = s.scene.path;
      let acc = 0, i = 0, tt = 0;
      for (i = 0; i < legs.length - 1; i++) {
        const d = legs[i].hold || (Math.hypot(legs[i + 1].x - legs[i].x, (legs[i + 1].y - legs[i].y) * .5) / .55) / (legs[i + 1].speed || 1) + .25;
        if (s.t < acc + d) { tt = (s.t - acc) / d; break; }
        acc += d;
      }
      const done = i >= legs.length - 1;
      if (s.decide && !s.asked && i >= legs.length - 2 && onAsk) {
        // the crucial moment: hold the frame on the strike and let the viewer choose
        s.asked = true; s.frozen = true;
        const shotUp = legs.at(-1).y < .5;
        onAsk({ goal: s.g, shotUp }).then(choice => decide(s, choice, shotUp));
      }
      const a = legs[Math.min(i, legs.length - 1)], b = legs[Math.min(i + 1, legs.length - 1)];
      const e = a.hold ? 0 : ease(Math.min(1, tt));
      ballX = done ? b.x : lerp(a.x, b.x, e); ballY = done ? b.y : lerp(a.y, b.y, e) - (b.speed ? 0 : Math.sin(e * Math.PI) * .03);
      // players drift toward the ball, receiver runs onto it
      for (const p of s.scene.attackers) { p.x += (ballX - p.x) * dt * .25; p.y += (ballY - p.y) * dt * .15; }
      for (const p of s.scene.defenders) { p.x += (ballX - p.x) * dt * .35; p.y += (ballY - p.y) * dt * .3; }
      if (!done && a.who != null) { const rcv = s.scene.attackers[legs[i + 1]?.who ?? a.who]; if (rcv) { rcv.x += (b.x - rcv.x) * dt * 3; rcv.y += (b.y - rcv.y) * dt * 3; hl = rcv; } }
      if (a.kicker === 0) { const k = s.scene.attackers[0]; k.x = lerp(k.x, a.x - (s.scene.right ? .02 : -.02), Math.min(1, tt * 1.2)); hl = k; }
      const kp = s.scene.keeper;
      kp.y += ((kp.dive && b.speed && tt > .1 ? .5 + kp.dive * 3 : ballY) - kp.y) * dt * (kp.dive ? 6 : 2.2);
      if (done && !s.scored && s.scene.saved) {
        s.scored = true; s.tScore = s.t;
        flash = .6; shake = .5;
        banner = s.scene.savedBanner || { big: 'SAVED!', small: `You kept out ${s.g.name}. The match changes from here.`, colour: '#E9E4D6' };
        
      } else if (done && !s.scored) {
        s.scored = true; s.tScore = s.t;
        score = sub(s.g.after); net = 1; flash = 1; shake = 1;
        banner = { big: 'GOAL!', small: `${s.g.name}${s.g.owngoal ? ' (own goal)' : s.g.penalty ? ' (penalty)' : ''}, ${s.g.minute}'`, colour: colour(s.g.team) };
      }
      if (s.scored && s.t - s.tScore > 3.4) { playing = null; banner = null; setTimeout(next, 500); }
    }
    // net bulge
    if (net > 0) {
      const gx = (playing?.scene.right ?? true) ? P.x1 : P.x0;
      ctx.strokeStyle = `rgba(255,255,255,${net})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(gx + ((playing?.scene.right ?? true) ? 14 : -14), py(.5), 14 * net + 4, 40, 0, 0, 7); ctx.stroke();
      net = Math.max(0, net - dt * .8);
    }
    if (playing) { for (const p of playing.scene.defenders) drawPlayer(p); drawPlayer(playing.scene.keeper); for (const p of playing.scene.attackers) drawPlayer(p, p === hl); }
    // ball
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(px(ballX) + 3, py(ballY) + 6, 6, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px(ballX), py(ballY), 6.5, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,248,226,${flash * .5})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2.5); }
    drawHUD();
    drawBanner(playing?.scored ? playing.t - playing.tScore : 0);
    if (!playing && banner) drawBanner(1);
    if (!stopped) raf = requestAnimationFrame(frame);
  }

  function next() {
    const job = queue.shift();
    if (!job) { onEnd?.({ adj: adj.slice() }); return; }
    if (job.type === 'card') {
      banner = job.banner; clock = job.clock ?? clock; if (job.score) score = job.score.slice();
      setTimeout(() => { banner = null; next(); }, job.ms || 1800); return;
    }
    clock = `${job.g.minute}'`; score = sub(job.g.before);
    onGoal?.(job.g);
    playing = { g: job.g, t: 0, scene: build(job.g), decide: job.decide };
    if (job.outcome === 'save' || job.outcome === 'miss') {
      // a chance that doesn't go in: caught by the keeper, or off target
      const sc = playing.scene, last = sc.path.at(-1);
      sc.saved = true;
      sc.path[sc.path.length - 1] = job.outcome === 'save' ? { ...last, x: sc.right ? .965 : .035 } : { ...last, y: last.y < .5 ? .36 : .64 };
      sc.savedBanner = { big: job.big || (job.outcome === 'save' ? 'SAVED!' : 'MISSED!'), small: job.small || '', colour: '#E9E4D6' };
      sc.savedCall = job.outcome === 'save' ? 'Saved!' : 'Oh, it\'s off target!';
    }
  }
  // goals the viewer prevented come off every score shown after them
  let adj = [0, 0];
  const sub = sc => [sc[0] - adj[0], sc[1] - adj[1]];
  function decide(s, choice, shotUp) {
    const kp = s.scene.keeper, last = s.scene.path.at(-1);
    // right way: saved. Stayed central: sometimes. Wrong way: a rare fingertip save
    const right = choice === (shotUp ? 'up' : 'down') ? true : choice === 'middle' ? Math.random() < .3 : Math.random() < .12;
    // the keeper goes where the viewer sent them
    // (a dive of d puts the keeper at y = .5 + d * 3; a tiny dive keeps them central)
    kp.dive = choice === 'middle' ? .0001 : ((choice === 'up' ? -1 : 1) * Math.max(.04, Math.abs(last.y - .5))) / 3;
    if (right) {
      kp.dive = (last.y - .5) / 3;                    // whichever way they went, the gloves get there
      // the ball ends in the keeper's gloves, a little in front of the line
      s.scene.saved = true;
      s.scene.path[s.scene.path.length - 1] = { ...last, x: s.scene.right ? .965 : .035 };
      adj[s.g.side]++;
    }
    s.choice = choice; s.frozen = false;
    onDecided?.({ goal: s.g, choice, saved: right, adj: adj.slice() });
  }

  let onEnd = null, onGoal = null, onAsk = null, onDecided = null;
  function play(list, { intro = true, crucial = null } = {}) {
    queue = []; playing = null; banner = null; adj = [0, 0];
    if (intro) queue.push({ type: 'card', clock: "0'", banner: { big: `${code(match.t1)} v ${code(match.t2)}`, small: 'Kickoff', colour: '#C9A35B' }, ms: 1800 });
    for (const g of list) queue.push({ g, decide: Array.isArray(crucial) ? crucial.includes(g) : g === crucial });
    if (intro) {
      const f = match.et || match.ft;
      queue.push({ type: 'card', clock: match.et ? '120\'' : '90\'', get banner() { const g = sub(f); return { big: `${g[0]} – ${g[1]}`, small: adj[0] + adj[1] ? 'Full time, in your version' : match.p ? `Full time. Penalties: ${Math.max(...match.p)}–${Math.min(...match.p)}` : 'Full time', colour: '#C9A35B' }; }, ms: 2600 });
      if (!list.length) queue.splice(1, 0, { type: 'card', banner: { big: '0 – 0', small: 'No goals to replay in this one', colour: '#7C877F' }, ms: 2200 });
    }
    score = [0, 0]; next();
  }
  // draw a still frame straight away so the page is complete at rest
  score = [...(match.et || match.ft)]; clock = match.et ? "120'" : "FT";
  raf = requestAnimationFrame(frame);
  return {
    playAll: () => play(moments),
    // play the match, stopping at the crucial goal so the viewer can change it
    // jump straight to the goal that decided it and let the viewer try to save it
    playWhatIf: gs => { gs = [].concat(gs); play(gs, { crucial: gs }); },
    playOne: g => play([g], { intro: false }),
    // a scripted version of the match: goals, chances and caption cards
    playScript(items, { title = 'Your version', end }) {
      queue = []; playing = null; banner = null; adj = [0, 0];
      queue.push({ type: 'card', clock: "0'", score: [0, 0], banner: { big: `${code(match.t1)} v ${code(match.t2)}`, small: title, colour: '#C9A35B' }, ms: 1700 });
      for (const it of items) queue.push(it.type === 'card' ? { ms: 2200, ...it } : it);
      if (end) queue.push({ type: 'card', clock: end.clock, score: end.score, banner: { big: `${end.score[0]} – ${end.score[1]}`, small: end.text, colour: '#C9A35B' }, ms: 3200 });
      score = [0, 0]; next();
    },
    on(evt, fn) { if (evt === 'end') onEnd = fn; if (evt === 'goal') onGoal = fn; if (evt === 'ask') onAsk = fn; if (evt === 'decided') onDecided = fn; },
    stop() { stopped = true; cancelAnimationFrame(raf); }
  };
}
