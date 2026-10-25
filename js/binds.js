// Button bindings, saved in localStorage 'mimic.binds'. The game itself always listens for its default
// key codes (KeyE = use, and so on); controls.js translates whatever key or controller button you bound
// into that code. Touch button positions (dragged in the layout editor) are saved here too.

// [action, label, default key, default controller button (standard mapping index, or null)]
export const ACTIONS = [
  ['forward', 'Move forward', 'KeyW', null],
  ['back', 'Move back', 'KeyS', null],
  ['left', 'Move left', 'KeyA', null],
  ['right', 'Move right', 'KeyD', null],
  ['sprint', 'Sprint', 'ShiftLeft', 6],
  ['crouch', 'Crouch', 'KeyC', 1],
  ['light', 'Flashlight', 'KeyF', 2],
  ['use', 'Use / hide', 'KeyE', 0],
  ['ability', 'Class ability', 'KeyG', 3],
  ['skill', 'Skill check / heartbeat', 'Space', 7],
  ['jobs', 'Show objectives', 'Tab', 8],
  ['chat', 'Quick chat', 'KeyT', 11],
  ['jam', 'Jam a door (traitor)', 'KeyQ', 4],
  ['sabotage', 'Sabotage (traitor)', 'KeyR', 5],
  ['accuse', 'Call a vote', 'KeyV', 12],
];
const BY = Object.fromEntries(ACTIONS.map((a) => [a[0], a]));
// The code the game listens for, per action.
export const GAME_CODE = Object.fromEntries(ACTIONS.map(([id, , key]) => [id, key]));
// Short names used in hints (keyLabel('E') etc.) -> action.
export const HINT_ACTION = { E: 'use', F: 'light', G: 'ability', C: 'crouch', Shift: 'sprint', Space: 'skill', Q: 'jam', R: 'sabotage', V: 'accuse', Tab: 'jobs', T: 'chat', Beat: 'skill' };

export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Start', 'L3', 'R3', '▲', '▼', '◀', '▶', 'Home'];

let saved = {};
try { saved = JSON.parse(localStorage.getItem('mimic.binds') || '{}'); } catch { /* private mode */ }
export const binds = {
  key: { ...Object.fromEntries(ACTIONS.map(([id, , k]) => [id, k])), ...(saved.key || {}) },
  pad: { ...Object.fromEntries(ACTIONS.filter((a) => a[3] !== null).map(([id, , , b]) => [id, b])), ...(saved.pad || {}) },
  touch: saved.touch || {}, // data-k -> { x, y } (centre, as a fraction of the screen)
};
export function saveBinds() {
  try { localStorage.setItem('mimic.binds', JSON.stringify(binds)); } catch { /* ignore */ }
}
export function resetBinds() {
  for (const [id, , k, b] of ACTIONS) { binds.key[id] = k; if (b !== null) binds.pad[id] = b; }
  saveBinds();
}

// A key code as people know it.
export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const names = {
    ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', AltRight: 'R Alt',
    Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backspace: 'Bksp', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return names[code] || code;
}
export const padName = (i) => (i === null || i === undefined ? '—' : PAD_NAMES[i] || `B${i}`);

// physical key -> the game code it stands for (only for keys that differ from the defaults).
export function keyMap() {
  const m = new Map();
  for (const [id] of ACTIONS) m.set(binds.key[id], GAME_CODE[id]);
  return m;
}
export const actionLabel = (id) => BY[id]?.[1] || id;
