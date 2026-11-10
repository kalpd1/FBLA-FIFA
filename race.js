// =============================================================
//  race.js — the Museum Race. Like a wiki race: you get a clue
//  about one moment of the tournament, the clock starts, and you
//  have to find it in the museum (globe → stadium → match) and
//  change it with the What if feature.
// =============================================================
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const ss = {
  get() { try { return JSON.parse(sessionStorage.getItem('ft-race')); } catch { return null; } },
  set(v) { try { v ? sessionStorage.setItem('ft-race', JSON.stringify(v)) : sessionStorage.removeItem('ft-race'); } catch {} }
};

export const CHALLENGES = [
  { id: 'enzo', match: 104, scenario: 'nored', needChange: true,
    clue: 'Find where Enzo Fernández got a red card, and change the outcome of the game.',
    hints: ['It happened in the last match of the whole tournament.', 'The final was played at MetLife Stadium, New York/New Jersey. Spain v Argentina. Look in the key moments.'] },
  { id: 'yamal', match: 104, scenario: 'yamal', needChange: true,
    clue: 'Find the stoppage-time free kick Emiliano Martínez kept out, and make it go in.',
    hints: ['Martínez plays for Argentina. This was their biggest game.', 'It was the final at MetLife Stadium. Check the 90+9 minute.'] },
  { id: 'torres', match: 104, scenario: 'save', needSave: true,
    clue: 'Find the goal that won the 2026 World Cup, and save it.',
    hints: ['It was scored in extra time.', 'MetLife Stadium, New York/New Jersey. Spain v Argentina.'] },
  { id: 'lautaro', match: 102, scenario: 'save', needSave: true,
    clue: 'Enzo Fernández scored late in a semi-final against England. Find the winner that came right after, and save it.',
    hints: ['The semi-final was played in Atlanta.', 'Mercedes-Benz Stadium, Atlanta. England v Argentina. Lautaro Martínez scored in the 92nd minute.'] },
  { id: 'var', match: 104, scenario: 'var', needChange: true,
    clue: 'Find the goal VAR took away from Nico Williams, and let it stand.',
    hints: ['It happened in extra time of the biggest game of the summer.', 'The final at MetLife Stadium. Look at the 96th minute.'] },
  { id: 'keeper', match: 104, scenario: 'injury', needChange: true,
    clue: 'Find the keeper who made 11 saves in one match, take him off injured, and see if his team can survive without him.',
    hints: ['He plays for Argentina.', 'Emiliano Martínez, in the final at MetLife Stadium.'] },
  { id: 'simeone', match: 104, scenario: 'simeone', needChange: true,
    clue: 'Find the last real chance of the 2026 World Cup, and put it in the net.',
    hints: ['It came in the 122nd minute of the final.', 'MetLife Stadium. Giuliano Simeone put it over the bar.'] }
];

let R = null, tick = 0, hudEl = null;
const time = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const elapsed = () => R ? (Date.now() - R.t0) / 1000 + R.penalty : 0;

function hud() {
  if (!R) { hudEl?.remove(); hudEl = null; clearInterval(tick); return; }
  if (!hudEl) {
    hudEl = document.createElement('aside'); hudEl.className = 'race-hud'; hudEl.setAttribute('aria-label', 'Museum Race');
    document.body.append(hudEl);
  }
  const c = CHALLENGES.find(x => x.id === R.id);
  hudEl.classList.toggle('min', !!R.min);
  hudEl.innerHTML = `<div class="rh-top"><button class="rh-k" data-race="min" aria-expanded="${!R.min}">${R.min ? 'Show clue' : 'Hide clue'}</button><b class="rh-time" id="rh-time">${time(elapsed())}</b>
      <button class="rh-btn" data-race="hint" ${R.hints >= c.hints.length ? 'disabled' : ''}>Hint (+15s)</button>
      <button class="rh-btn" data-race="quit">Give up</button></div>
    <p class="rh-clue">${esc(c.clue)}</p>
    ${c.hints.slice(0, R.hints).map((h, i) => `<p class="rh-hint">Hint ${i + 1}: ${esc(h)}</p>`).join('')}`;
  hudEl.querySelector('[data-race=hint]').onclick = () => { R.hints++; R.penalty += 15; ss.set(R); hud(); };
  hudEl.querySelector('[data-race=min]').onclick = () => { R.min = !R.min; ss.set(R); hud(); };
  hudEl.querySelector('[data-race=quit]').onclick = () => { R = null; ss.set(null); hud(); };
  clearInterval(tick);
  tick = setInterval(() => { const t = document.getElementById('rh-time'); if (t) t.textContent = time(elapsed()); }, 250);
}

// the card that hands you a challenge before the clock starts
export function openRace({ onStart } = {}) {
  let i = Math.floor(Math.random() * CHALLENGES.length);
  if (!store.get('ft-race-played')) i = 0;     // the first race is always the red card
  const ov = document.createElement('div'); ov.className = 'race-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'race-h');
  const paint = () => {
    const c = CHALLENGES[i], best = store.get('ft-race-best') || {};
    ov.innerHTML = `<div class="race-card">
      <p class="race-k">Museum Race · challenge ${i + 1} of ${CHALLENGES.length}</p>
      <h2 id="race-h">${esc(c.clue)}</h2>
      <p class="race-rules">Find it by walking through the museum, from the globe to the stadium to the match, then change it on the match page. The clock runs until you do.${best[c.id] ? ` Your best on this challenge is ${time(best[c.id])}.` : ''}</p>
      <div class="race-btns"><button class="btn-brass" data-rgo>Start</button><button class="btn-ghost" data-rnext>Next challenge</button><button class="btn-ghost quiet" data-rx>Close</button></div>
    </div>`;
    ov.querySelector('[data-rgo]').onclick = () => {
      ov.remove(); store.set('ft-race-played', true);
      R = { id: c.id, t0: Date.now(), penalty: 0, hints: 0 }; ss.set(R);
      onStart?.(); hud();
    };
    ov.querySelector('[data-rnext]').onclick = () => { i = (i + 1) % CHALLENGES.length; paint(); };
    ov.querySelector('[data-rx]').onclick = () => ov.remove();
    ov.querySelector('[data-rgo]').focus();
  };
  document.body.append(ov); paint();
}

// a what-if finished somewhere in the museum: did it complete the race?
export function raceReport(res) {
  if (!R) return;
  const c = CHALLENGES.find(x => x.id === R.id);
  if (res.match !== c.match || res.scenario !== c.scenario) return;
  if (c.needSave && !res.saved) return;
  if (c.needChange && !res.changed) { toastHud('The result didn’t change. Run it again.'); return; }
  const t = elapsed(), best = store.get('ft-race-best') || {}, pb = !best[c.id] || t < best[c.id];
  if (pb) { best[c.id] = t; store.set('ft-race-best', best); }
  const R0 = R; R = null; ss.set(null); hud();
  const ov = document.createElement('div'); ov.className = 'race-ov done';
  ov.innerHTML = `<div class="race-card"><p class="race-k">Museum Race · finished</p><h2>${time(t)}</h2>
    <p>${pb ? 'That’s your best time on this challenge.' : `Your best on this challenge is ${time(best[c.id])}.`}${R0.hints ? ` Includes ${R0.hints * 15}s for hints.` : ''}</p>
    <div class="race-btns"><button class="btn-brass" data-again>New race</button><button class="btn-ghost" data-rx>Keep looking around</button></div></div>`;
  setTimeout(() => document.body.append(ov), 1800);
  ov.querySelector('[data-rx]').onclick = () => ov.remove();
  ov.querySelector('[data-again]').onclick = () => { ov.remove(); location.hash = 'globe'; openRace(); };
}
function toastHud(msg) { if (!hudEl) return; let p = hudEl.querySelector('.rh-say'); if (!p) { p = document.createElement('p'); p.className = 'rh-say'; hudEl.append(p); } p.textContent = msg; }

export function resumeRace() { R = ss.get(); if (R && !CHALLENGES.some(c => c.id === R.id)) R = null; hud(); }
