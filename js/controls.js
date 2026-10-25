// Controllers and touch screens. Both drive the game the same way a keyboard does: buttons become
// synthetic key events (so every key handler in the game just works), the left stick / touch stick sets
// `game.stick` (analog movement) and the right stick / a drag on the right of the screen calls `game.look`.
// In menus a controller moves focus between buttons (D-pad / left stick), A clicks, B goes back.
//
// The input mode follows whatever was used last: 'mouse' (keyboard + mouse), 'pad' or 'touch'.
// Body classes `input-mouse|pad|touch` and `ingame` let the CSS and the hints follow it.

const DEAD = 0.18;
const $ = (id) => document.getElementById(id);

// What to call each key in the current mode (prompts, HUD hints, How to play).
const LABELS = {
  mouse: { Beat: 'Space', Next: 'Space', Vote: 'Press a number to vote' },
  pad: {
    E: 'A', F: 'X', G: 'Y', C: 'B', Shift: 'LT', Space: 'RT', Q: 'LB', R: 'RB', V: '▲', Tab: 'View', Esc: 'Start',
    Beat: 'A', Next: 'A', 1: '▲', 2: '▶', 3: '▼', 4: '◀', 0: 'B', Vote: 'Vote with the D-pad',
  },
  touch: {
    E: 'Use', F: 'Light', G: 'Ability', C: 'Crouch', Shift: 'Run', Space: 'Tap', Q: 'Jam', R: 'Sabotage', V: 'Accuse',
    Tab: 'Jobs', Esc: 'II', Beat: 'Beat', Next: 'Next', Vote: 'Tap a name to vote',
  },
};

export const controls = {
  mode: matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? 'touch' : 'mouse',
  getGame: () => null,  // set by main.js
  onPause: () => {},    // set by main.js: Start / the touch pause button
  inGame: false,        // a run is on screen with no menu over it
};

export function keyLabel(k) {
  return LABELS[controls.mode][k] ?? k;
}

function setMode(mode) {
  if (controls.mode === mode) return;
  controls.mode = mode;
  releaseAll();
  refreshLabels();
}

// Static hints in the page: <kbd data-k="Space"> and elements with data-mouse / data-pad / data-touch text.
export function refreshLabels() {
  const b = document.body.classList;
  for (const m of ['mouse', 'pad', 'touch']) b.toggle(`input-${m}`, controls.mode === m);
  for (const el of document.querySelectorAll('kbd[data-k]')) el.textContent = keyLabel(el.dataset.k);
  for (const el of document.querySelectorAll(`[data-${controls.mode}]`)) el.textContent = el.dataset[controls.mode];
  const vh = $('voteHint');
  if (vh) vh.textContent = keyLabel('Vote');
}

// ---------- synthetic keys ----------
const held = new Set();
function press(code) {
  if (held.has(code)) return;
  held.add(code);
  dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
}
function release(code) {
  if (!held.delete(code)) return;
  dispatchEvent(new KeyboardEvent('keyup', { code }));
}
function tap(code) { press(code); release(code); }
function releaseAll() {
  for (const c of [...held]) release(c);
  const g = controls.getGame();
  if (g) g.stick = null;
  stick.id = look.id = null;
  stickEl.base.hidden = true;
}

// Real keyboard / mouse use switches back to mouse mode.
addEventListener('keydown', (e) => { if (e.isTrusted) setMode('mouse'); }, true);
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) setMode('mouse'); }, true);
addEventListener('pointerdown', (e) => setMode(e.pointerType === 'touch' ? 'touch' : e.pointerType === 'mouse' ? 'mouse' : controls.mode), true);

// ---------- rumble ----------
let lastPad = null;
export function rumble(strength = 1, ms = 200) {
  if (controls.mode === 'pad') {
    lastPad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.2) })?.catch?.(() => {});
  } else if (controls.mode === 'touch') {
    navigator.vibrate?.(ms);
  }
}

// ---------- the frame loop ----------
const screenOpen = () => !!document.querySelector('.screen:not([hidden])');
const playable = (g) => g && (g.state === 'playing' || g.state === 'spectate') && !g.paused;
let last = performance.now();

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const g = controls.getGame();
  const wasIn = controls.inGame;
  controls.inGame = playable(g) && !screenOpen();
  if (wasIn && !controls.inGame) releaseAll();
  document.body.classList.toggle('ingame', controls.inGame);
  pollPad(dt, g);
  updateTouch(g);
  requestAnimationFrame(loop);
}

// ---------- gamepad ----------
const prev = [];
let navDir = null, navT = 0;

function pollPad(dt, g) {
  const pads = navigator.getGamepads?.() || [];
  const pad = [...pads].find((p) => p && p.connected);
  if (!pad) return;
  const btn = (i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
  const now = pad.buttons.map((_, i) => btn(i));
  const down = (i) => now[i] && !prev[i];
  const up = (i) => !now[i] && prev[i];
  const ax = (i) => { const v = pad.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
  if (now.some(Boolean) || pad.axes.some((v) => Math.abs(v) > 0.5)) { setMode('pad'); lastPad = pad; }
  if (controls.mode !== 'pad') { prev.length = 0; prev.push(...now); return; }

  if (controls.inGame) {
    gamePad(dt, g, { now, down, up, ax });
  } else {
    for (const c of [...held]) release(c);
    menuPad(dt, { down, ax, now });
  }
  prev.length = 0;
  prev.push(...now);
}

function gamePad(dt, g, { now, down, up, ax }) {
  // Move (left stick) and look (right stick, with a curve for fine aiming).
  let x = ax(0), y = ax(1);
  const mag = Math.min(1, Math.hypot(x, y));
  g.stick = mag > 0 ? { x, y } : null;
  const lx = ax(2), ly = ax(3), s = g.settings.mouse;
  if (lx || ly) g.look(Math.sign(lx) * lx * lx * 3.4 * s * dt, Math.sign(ly) * ly * ly * 2.4 * s * dt);

  if (down(9)) { controls.onPause(); return; }
  const voting = g.traitor?.voting;
  // Hiding with it at the door: A is the heartbeat too (pressing "use" would walk you out).
  const aCode = g.hb?.on ? 'Space' : 'KeyE';
  const map = [[0, aCode], [2, 'KeyF'], [3, 'KeyG'], [4, 'KeyQ'], [5, 'KeyR'], [7, 'Space'], [8, 'Tab'], [6, 'ShiftLeft']];
  for (const [i, code] of map) {
    if (down(i)) press(code);
    else if (up(i)) { release(code); if (i === 0) release('Space'), release('KeyE'); }
  }
  if (voting) {
    [[12, 'Digit1'], [15, 'Digit2'], [13, 'Digit3'], [14, 'Digit4'], [1, 'Digit0']].forEach(([i, c]) => { if (down(i)) tap(c); });
    return;
  }
  if (down(12)) tap('KeyV');
  // B toggles crouch; clicking the left stick sprints until you stop.
  if (down(1)) { if (held.has('KeyC')) release('KeyC'); else press('KeyC'); }
  if (down(10)) { release('KeyC'); press('ShiftRight'); }
  if (!mag) release('ShiftRight');
}

// Menus: move focus with the D-pad / left stick, A clicks, B backs out, sliders take left / right.
function menuPad(dt, { down, ax, now }) {
  const screen = document.querySelector('.screen:not([hidden])');
  if (!screen) return;
  const items = [...screen.querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent !== null && el.type !== 'hidden');
  let cur = document.activeElement;
  if (!items.includes(cur)) {
    cur = items.find((el) => el.classList.contains('primary')) || items[0];
    cur?.focus({ preventScroll: true });
  }
  if (!cur) return;
  if (down(0)) { cur.click(); return; }
  if (down(1) || down(9)) {
    const back = screen.querySelector('.back, #btnResume');
    if (back && back.offsetParent !== null) back.click();
    return;
  }
  const dx = (now[15] ? 1 : 0) - (now[14] ? 1 : 0) || Math.round(ax(0));
  const dy = (now[13] ? 1 : 0) - (now[12] ? 1 : 0) || Math.round(ax(1));
  const dir = dx || dy ? `${dx},${dy}` : null;
  if (!dir) { navDir = null; return; }
  if (dir === navDir && (navT -= dt) > 0) return;
  navT = dir === navDir ? 0.11 : 0.38;
  navDir = dir;
  if (cur.type === 'range' && dx && !dy) {
    const step = Number(cur.step) || 1, span = Number(cur.max) - Number(cur.min);
    cur.value = Number(cur.value) + dx * Math.max(step, span / 40);
    cur.dispatchEvent(new Event('input'));
    return;
  }
  // The nearest item in that direction (favouring ones straight ahead).
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy;
    const along = ex * dx + ey * dy, across = Math.abs(ex * dy - ey * dx);
    if (along <= 1) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView?.({ block: 'nearest' }); }
}

// ---------- touch ----------
const stick = { id: null, ox: 0, oy: 0 };
const look = { id: null, x: 0, y: 0 };
const STICK_R = 56;
let stickEl = { base: { hidden: true } };

function initTouch() {
  const root = $('touch');
  if (!root) return;
  stickEl = { base: $('stickBase'), knob: $('stickKnob') };

  root.addEventListener('pointerdown', (e) => {
    const g = controls.getGame();
    if (!g || !controls.inGame) return;
    e.preventDefault();
    // Voting: tap a name (the vote list is under this layer).
    const li = g.traitor?.voting && document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.matches('#voteList li'));
    if (li) {
      const all = [...li.parentElement.children], i = all.indexOf(li);
      tap(i === all.length - 1 ? 'Digit0' : `Digit${i + 1}`);
      return;
    }
    const b = e.target.closest('[data-k], [data-act]');
    if (b) {
      root.setPointerCapture?.(e.pointerId);
      b.dataset.pid = e.pointerId;
      if (b.dataset.act === 'pause') { controls.onPause(); return; }
      const code = b.dataset.k;
      if (b.hasAttribute('data-toggle')) {
        if (held.has(code)) release(code);
        else { if (code === 'KeyC') release('ShiftLeft'); if (code === 'ShiftLeft') release('KeyC'); press(code); }
      } else press(code);
      return;
    }
    if (e.clientX < innerWidth * 0.42 && stick.id === null && g.state === 'playing') {
      Object.assign(stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY });
      stickEl.base.hidden = false;
      stickEl.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      stickEl.knob.style.transform = '';
    } else if (look.id === null) {
      Object.assign(look, { id: e.pointerId, x: e.clientX, y: e.clientY });
    }
  });

  root.addEventListener('pointermove', (e) => {
    const g = controls.getGame();
    if (!g) return;
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      stickEl.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, d / STICK_R);
      g.stick = m > 0.15 ? { x: dx / STICK_R, y: dy / STICK_R } : null;
    } else if (e.pointerId === look.id) {
      const s = 0.0055 * g.settings.mouse;
      g.look((e.clientX - look.x) * s, (e.clientY - look.y) * s);
      look.x = e.clientX; look.y = e.clientY;
    }
  });

  const end = (e) => {
    if (e.pointerId === stick.id) {
      stick.id = null;
      stickEl.base.hidden = true;
      const g = controls.getGame();
      if (g) g.stick = null;
      release('ShiftLeft'); // Run lasts until you let go of the stick
    }
    if (e.pointerId === look.id) look.id = null;
    for (const b of root.querySelectorAll('[data-pid]')) {
      if (Number(b.dataset.pid) !== e.pointerId) continue;
      delete b.dataset.pid;
      if (b.dataset.k && !b.hasAttribute('data-toggle')) release(b.dataset.k);
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

}

// Which touch buttons make sense right now.
function updateTouch(g) {
  const root = $('touch');
  if (!root) return;
  root.hidden = !(controls.mode === 'touch' && controls.inGame);
  if (root.hidden) return;
  const spec = g.state === 'spectate', tr = g.traitor;
  const show = (k, on) => { const b = root.querySelector(`[data-k="${k}"]`); if (b) b.hidden = !on; };
  show('Space', spec || !!g.hb?.on || !!g.obj?.skill);
  root.querySelector('[data-k="Space"]').textContent = spec ? 'Next' : g.hb?.on ? 'Beat' : 'Tap';
  for (const k of ['KeyE', 'KeyF', 'KeyC', 'ShiftLeft', 'Tab']) show(k, !spec);
  show('KeyG', !spec && g.ab?.id !== 'runner');
  show('KeyQ', !spec && !!(tr?.on && tr.me));
  show('KeyR', !spec && !!(tr?.on && tr.me));
  show('KeyV', !spec && !!(tr?.on && !tr.voteUsed && g.focus?.type === 'fusebox'));
  for (const b of root.querySelectorAll('[data-toggle]')) b.classList.toggle('on', held.has(b.dataset.k));
}

export function initControls() {
  initTouch();
  refreshLabels();
  addEventListener('gamepadconnected', (e) => { lastPad = e.gamepad; });
  requestAnimationFrame(loop);
}
