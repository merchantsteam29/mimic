// Controllers and touch screens. Both drive the game the same way a keyboard does: buttons become
// synthetic key events (so every key handler in the game just works), the left stick / touch stick sets
// `game.stick` (analog movement) and the right stick / a drag on the right of the screen calls `game.look`.
// In menus a controller moves focus between buttons (D-pad / left stick), A clicks, B goes back.
// Rebound keys (binds.js) are translated here too, into the codes the game listens for.
//
// The input mode follows whatever was used last: 'mouse' (keyboard + mouse), 'pad' or 'touch'.
// Body classes `input-mouse|pad|touch` and `ingame` let the CSS and the hints follow it.
import { binds, saveBinds, keyMap, keyName, padName, HINT_ACTION, GAME_CODE } from './binds.js';

const DEAD = 0.18;
const $ = (id) => document.getElementById(id);

// What to call each key in the current mode (prompts, HUD hints, How to play). Mouse and pad names
// follow the bindings; these are the fixed ones.
const LABELS = {
  mouse: { Vote: 'Press a number to vote', Esc: 'Esc' },
  pad: { H: 'RT', Esc: 'Start', 1: '▲', 2: '▶', 3: '▼', 4: '◀', 0: 'B', Vote: 'Vote with the D-pad' },
  touch: {
    E: 'Use', F: 'Light', G: 'Ability', C: 'Crouch', Shift: 'Run', Space: 'Tap', Q: 'Jam', R: 'Sabotage', V: 'Accuse',
    Tab: 'Jobs', T: 'Say', B: 'Radio', X: 'Tape', Z: 'Signal', H: 'Throw', Esc: 'II', Beat: 'Beat', Next: 'Next', Vote: 'Tap a name to vote',
  },
};

export const controls = {
  mode: matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? 'touch' : 'mouse',
  getGame: () => null,  // set by main.js
  onPause: () => {},    // set by main.js: Start / the touch pause button
  inGame: false,        // a run is on screen with no menu over it
  capture: null,        // settings: waiting for a key or button to bind ({ kind: 'key'|'pad', done(code|index) })
  pads: true,           // Settings > Controllers: off ignores every gamepad
};

export function keyLabel(k) {
  const m = controls.mode, fixed = LABELS[m][k];
  if (k === 'K') return m === 'pad' ? padName(binds.pad.jobs) : m === 'touch' ? 'Watch replay' : 'K'; // a friend's kill-cam (spectating)
  if (fixed !== undefined) return fixed;
  if (m === 'mouse') {
    if (k === 'Next') return keyName(binds.key.skill);
    return HINT_ACTION[k] ? keyName(binds.key[HINT_ACTION[k]]) : k;
  }
  if (m === 'pad') {
    if (k === 'Beat' || k === 'Next') return padName(binds.pad.use); // "use" is the heartbeat too, on a controller
    return HINT_ACTION[k] ? padName(binds.pad[HINT_ACTION[k]]) : k;
  }
  return k;
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

// ---------- the keyboard: binding capture and rebound keys ----------
let kmap = keyMap();
export function bindsChanged() { kmap = keyMap(); saveBinds(); refreshLabels(); }
const defaults = new Set(Object.values(GAME_CODE));
function translate(e) {
  if (!e.isTrusted) return;
  if (controls.capture?.kind === 'key' && e.type === 'keydown') {
    e.preventDefault(); e.stopImmediatePropagation();
    const c = controls.capture; controls.capture = null;
    c.done(e.code === 'Escape' ? null : e.code);
    return;
  }
  if (!controls.inGame || e.target?.matches?.('input, textarea')) return;
  const to = kmap.get(e.code);
  if (to === e.code) return;
  if (to || defaults.has(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); } // a key moved elsewhere does nothing
  if (to) dispatchEvent(new KeyboardEvent(e.type, { code: to, repeat: e.repeat, cancelable: true }));
}

// Real keyboard / mouse use switches back to mouse mode.
addEventListener('keydown', (e) => { if (e.isTrusted) setMode('mouse'); }, true);
addEventListener('keydown', translate, true);
addEventListener('keyup', translate, true);
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
const playable = (g) => g && (g.state === 'playing' || g.state === 'spectate' || (g.state === 'caught' && g.kc?.active)) && !g.paused;
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
const centred = new Map(); // pad index -> which axes have been seen at rest
const prevAxes = new Map(); // pad index -> its axes last poll
let navDir = null, navT = 0;

function pollPad(dt, g) {
  const pads = navigator.getGamepads?.() || [];
  // Only real game controllers: Xbox / PlayStation / Switch pads report the browser's standard layout. Wheels, flight sticks,
  // pedals and tablets don't, and their resting axes used to spin the camera and scroll the menus.
  const pad = controls.pads ? [...pads].find((p) => p && p.connected && p.mapping === 'standard') : null;
  if (!pad) return;
  const btn = (i) => { const b = pad.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
  const now = pad.buttons.map((_, i) => btn(i));
  const down = (i) => i !== null && i !== undefined && now[i] && !prev[i];
  const up = (i) => i !== null && i !== undefined && !now[i] && prev[i];
  // An axis only counts once it has been seen at rest: wheels, flight sticks and some "gaming" keyboards and mice show up
  // as gamepads with an axis stuck at full tilt, which used to spin the camera nonstop (and kept forcing controller mode).
  const rest = centred.get(pad.index) || centred.set(pad.index, []).get(pad.index);
  pad.axes.forEach((v, i) => { if (Math.abs(v) < DEAD) rest[i] = true; });
  const ax = (i) => { const v = pad.axes[i] || 0; return !rest[i] || Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
  // Only a change switches to the controller: a new press, or a stick being pushed (not one that's simply stuck out), so a
  // stuck axis can't keep stealing the camera back from the mouse.
  const was = prevAxes.get(pad.index) || [];
  const pushed = pad.axes.some((v, i) => rest[i] && Math.abs(v) > 0.5 && !(Math.abs(was[i] ?? 0) > 0.5));
  prevAxes.set(pad.index, [...pad.axes]);
  if (now.some((v, i) => v && !prev[i]) || pushed) { setMode('pad'); lastPad = pad; }
  if (controls.mode !== 'pad') { prev.length = 0; prev.push(...now); return; }

  if (controls.capture?.kind === 'pad') { // settings: the next button pressed gets the binding
    const i = now.findIndex((v, j) => v && !prev[j]);
    if (i === 9) { controls.capture.done(null); controls.capture = null; } // Start cancels
    else if (i >= 0) { const c = controls.capture; controls.capture = null; c.done(i); }
  } else if (controls.inGame) {
    gamePad(dt, g, { now, down, up, ax });
  } else {
    for (const c of [...held]) release(c);
    menuPad(dt, { down, ax, now });
  }
  prev.length = 0;
  prev.push(...now);
}

function gamePad(dt, g, { now, down, up, ax }) {
  const pb = binds.pad;
  // Move (left stick) and look (right stick, with a curve for fine aiming).
  let x = ax(0), y = ax(1);
  const mag = Math.min(1, Math.hypot(x, y));
  g.stick = mag > 0 ? { x, y } : null;
  const lx = ax(2), ly = ax(3), s = g.settings.mouse;
  if (g.kc?.active) { if (down(pb.use) || down(pb.skill)) tap('Space'); return; } // a kill-cam: A skips it
  if (lx || ly) g.look(Math.sign(lx) * lx * lx * 3.4 * s * dt, Math.sign(ly) * ly * ly * 2.4 * s * dt);

  if (down(9)) { controls.onPause(); return; }
  // Quick chat open: up / down to pick, "use" to say it, B or the chat button to close.
  if (g.chat?.open) {
    if (down(12)) g.chat.move(-1);
    if (down(13)) g.chat.move(1);
    if (down(pb.use)) g.chat.sendSelected();
    if (down(1) || down(pb.chat)) g.chat.close();
    return;
  }
  // Hand signals open: a D-pad direction gives one; B or the signal button closes.
  if (g.sig?.open) {
    [[12, 'Digit1'], [15, 'Digit2'], [13, 'Digit3'], [14, 'Digit4']].forEach(([i, c]) => { if (down(i)) tap(c); });
    if (down(1) || down(pb.signal)) g.sig.close();
    return;
  }
  if (down(pb.signal) && g.sig?.can()) { tap('KeyZ'); return; }
  if (down(pb.chat)) { tap('KeyT'); return; }
  const voting = g.traitor?.voting || g.sw?.voting;
  const spectating = g.state === 'spectate';
  if (spectating && g.kc?.offer && g.t < g.kc.offer.until && down(pb.jobs)) { tap('KeyK'); return; } // watch how a friend was taken
  // Hiding with it at the door: "use" is the heartbeat too (pressing "use" would walk you out).
  const useCode = g.hb?.on ? 'Space' : 'KeyE';
  // Holding something to throw: RT throws it (unless a skill check or the heartbeat needs RT).
  const rtCode = g.thr?.held && !g.obj?.skill && !g.hb?.on ? 'KeyH' : 'Space';
  const map = [[pb.use, useCode], [pb.light, 'KeyF'], [pb.ability, 'KeyG'], [pb.jam, 'KeyQ'], [pb.sabotage, 'KeyR'], [pb.skill, rtCode], [pb.jobs, 'Tab'], [pb.sprint, 'ShiftLeft'], [pb.radio, 'KeyB'], [pb.recorder, 'KeyX']];
  for (const [i, code] of map) {
    if (down(i)) press(code);
    else if (up(i)) { release(code); if (i === pb.use) release('Space'), release('KeyE'); }
  }
  // Playing the mimic: the D-pad picks whose voice to use.
  if (g.hunt?.me) {
    [[12, 'Digit1'], [15, 'Digit2'], [13, 'Digit3'], [14, 'Digit4']].forEach(([i, c]) => { if (down(i)) tap(c); });
    return;
  }
  if (voting) {
    [[12, 'Digit1'], [15, 'Digit2'], [13, 'Digit3'], [14, 'Digit4'], [1, 'Digit0']].forEach(([i, c]) => { if (down(i)) tap(c); });
    return;
  }
  if (down(pb.accuse)) tap('KeyV');
  // Crouch toggles (when dead, it's just a press: the haunting whisper); clicking the left stick sprints until you stop.
  if (down(pb.crouch)) { if (spectating) tap('KeyC'); else if (held.has('KeyC')) release('KeyC'); else press('KeyC'); }
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
let editing = null; // layout editor: { onDone }
let drag = null;

const touchKey = (b) => b.dataset.k || b.dataset.act;

// Buttons the player dragged somewhere else sit where they left them.
function applyTouchLayout() {
  for (const b of document.querySelectorAll('#touch .t-btn')) {
    const p = binds.touch[touchKey(b)];
    if (!p) { b.style.position = b.style.left = b.style.top = b.style.right = b.style.bottom = ''; continue; }
    const w = b.offsetWidth || 64, h = b.offsetHeight || 64;
    Object.assign(b.style, { position: 'fixed', right: 'auto', bottom: 'auto', left: `${p.x * innerWidth - w / 2}px`, top: `${p.y * innerHeight - h / 2}px` });
  }
}
addEventListener('resize', () => applyTouchLayout());

// Settings: drag the touch buttons around.
export function editTouchLayout(onDone) {
  editing = { onDone };
  document.body.classList.add('touch-edit');
  const root = $('touch');
  root.hidden = false;
  for (const b of root.querySelectorAll('.t-btn')) b.hidden = false;
  applyTouchLayout();
}
function endEdit() {
  const done = editing?.onDone;
  editing = null;
  document.body.classList.remove('touch-edit');
  $('touch').hidden = true;
  saveBinds();
  done?.();
}

function initTouch() {
  const root = $('touch');
  if (!root) return;
  stickEl = { base: $('stickBase'), knob: $('stickKnob') };

  root.addEventListener('pointerdown', (e) => {
    if (editing) {
      e.preventDefault();
      const act = e.target.closest('[data-edit]')?.dataset.edit;
      if (act === 'done') { endEdit(); return; }
      if (act === 'reset') { binds.touch = {}; applyTouchLayout(); return; }
      const b = e.target.closest('.t-btn');
      if (!b) return;
      const r = b.getBoundingClientRect();
      drag = { b, id: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
      root.setPointerCapture?.(e.pointerId);
      return;
    }
    const g = controls.getGame();
    if (!g || !controls.inGame) return;
    e.preventDefault();
    // Voting, picking whose voice to use (as the mimic), or a quick-chat line: tap it (the lists are under this layer).
    const li = (g.traitor?.voting || g.hunt?.me || g.chat?.open || g.sig?.open) && document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.matches('#voteList li, #hunter li, #chat li, #signals li'));
    if (li) {
      const all = [...li.parentElement.children], i = all.indexOf(li);
      tap(li.matches('#voteList li') && i === all.length - 1 ? 'Digit0' : `Digit${i + 1}`);
      return;
    }
    const b = e.target.closest('[data-k], [data-act]');
    if (b) {
      root.setPointerCapture?.(e.pointerId);
      b.dataset.pid = e.pointerId;
      if (b.dataset.act === 'pause') { controls.onPause(); return; }
      const code = b.dataset.k, toggle = b.hasAttribute('data-toggle') && g.state === 'playing';
      b.dataset.mom = toggle ? '' : '1'; // a plain press lets go with your finger
      if (toggle) {
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
    if (drag && e.pointerId === drag.id) {
      const x = Math.min(0.97, Math.max(0.03, (e.clientX - drag.dx) / innerWidth));
      const y = Math.min(0.97, Math.max(0.03, (e.clientY - drag.dy) / innerHeight));
      binds.touch[touchKey(drag.b)] = { x: +x.toFixed(3), y: +y.toFixed(3) };
      applyTouchLayout();
      return;
    }
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
    if (drag && e.pointerId === drag.id) { drag = null; return; }
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
      if (b.dataset.k && b.dataset.mom) release(b.dataset.k);
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  applyTouchLayout();
}

// Which touch buttons make sense right now.
function updateTouch(g) {
  const root = $('touch');
  if (!root || editing) return;
  const wasHidden = root.hidden;
  root.hidden = !(controls.mode === 'touch' && controls.inGame);
  if (root.hidden) return;
  if (wasHidden) applyTouchLayout();
  const spec = g.state === 'spectate', tr = g.traitor;
  const show = (k, on) => { const b = root.querySelector(`[data-k="${k}"]`); if (b) b.hidden = !on; };
  const name = (k, t) => { const b = root.querySelector(`[data-k="${k}"]`); if (b && b.textContent !== t) b.textContent = t; };
  const hunter = !!g.hunt?.me, haunt = spec && !!g.haunt?.can();
  if (g.kc?.active) { // a kill-cam: just Skip
    for (const b of root.querySelectorAll('[data-k]')) b.hidden = b.dataset.k !== 'Space';
    name('Space', 'Skip');
    return;
  }
  show('KeyK', spec && !!g.kc?.offer && g.t < g.kc.offer.until);
  name('KeyE', hunter ? 'Bite' : 'Use');
  name('KeyQ', hunter ? 'Kill light' : 'Jam');
  name('KeyR', hunter ? 'Voice' : spec ? (g.freeCam ? 'Watch' : 'Drift') : 'Sabotage');
  name('KeyF', haunt ? 'Flicker' : 'Light');
  name('KeyG', haunt ? 'Knock' : 'Ability');
  name('KeyC', haunt ? 'Whisper' : 'Crouch');
  name('KeyV', haunt ? 'Mark' : 'Accuse');
  show('KeyT', !!g.chat?.can());
  show('KeyB', !!g.radio?.can());
  show('KeyX', !spec && !!g.rec && g.rec.phase !== 'none');
  show('KeyZ', !!g.sig?.can());
  show('KeyH', !spec && !!g.thr?.held);
  if (hunter) {
    for (const k of ['Space', 'KeyF', 'KeyC', 'KeyG', 'KeyV', 'Tab']) show(k, false);
    for (const k of ['KeyE', 'KeyQ', 'KeyR', 'ShiftLeft']) show(k, true);
    return;
  }
  show('Space', spec || !!g.hb?.on || !!g.obj?.skill);
  root.querySelector('[data-k="Space"]').textContent = spec ? 'Next' : g.hb?.on ? 'Beat' : 'Tap';
  for (const k of ['KeyE', 'ShiftLeft', 'Tab']) show(k, !spec);
  for (const k of ['KeyF', 'KeyC']) show(k, !spec || haunt);
  show('KeyG', haunt || (!spec && g.ab?.id !== 'runner'));
  show('KeyQ', !spec && !!(tr?.on && tr.me));
  show('KeyR', spec || !!(tr?.on && tr.me));
  show('KeyV', haunt || (!spec && !!(tr?.on && !tr.voteUsed && g.focus?.type === 'fusebox')) || (!spec && !!g.sw?.canAccuse?.()));
  for (const b of root.querySelectorAll('[data-toggle]')) b.classList.toggle('on', !spec && held.has(b.dataset.k));
}

export function initControls() {
  initTouch();
  refreshLabels();
  addEventListener('gamepadconnected', (e) => { lastPad = e.gamepad; });
  requestAnimationFrame(loop);
}
