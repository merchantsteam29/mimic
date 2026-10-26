// Recorded voices for the tapes: the story tapes (Ellie, The Operator) and the victims' tapes in normal runs.
// The recordings live in voices/: one file per line (ellie/3-2-1.m4a = chapter 3, tape 2, line 1), or one per tape:
//   ellie/3-2.mp3     Ellie, chapter 3, the 2nd tape
//   operator/1-1.m4a  The Operator, chapter 1, the 1st tape
//   lore/4.webm       the 4th victims' tape (LORE in lore.js)
// voices/index.json (written by tools/stamp.mjs from whatever is in the folder) says which exist. A tape without
// a recording keeps the old murmur. The game adds the tape hiss; a phone recording is perfect.
// voices/SCRIPT.md (tools/script.mjs) lists every line to record.
import { VERSION } from './version.js';
import { LORE } from './lore.js';

let index = null;
const loading = new Map(); // id -> Promise<AudioBuffer | null>
const ready = new Map();   // id -> AudioBuffer, once decoded

function loadIndex() {
  index ||= fetch(`voices/index.json?v=${VERSION}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return index;
}

// The id of a tape: a story chapter's tape i, or a victims' tape number n.
export function tapeId(story, i, n) {
  return story ? `${story.book || 'ellie'}/${story.index + 1}-${i + 1}` : `lore/${(n % LORE.length) + 1}`;
}

// Start loading a tape's recording (if there is one), so it's ready when someone presses play.
export function preload(id, ctx) {
  if (loading.has(id)) return loading.get(id);
  const p = loadIndex().then((idx) => {
    if (!idx[id]) return null;
    return fetch(`voices/${idx[id]}?v=${VERSION}`).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? ctx.decodeAudioData(b) : null));
  }).then((buf) => { if (buf) ready.set(id, buf); return buf; }).catch(() => null);
  loading.set(id, p);
  return p;
}

// The recording, if it has loaded. (Never waits: a tape plays at once, with or without it.)
export const recording = (id) => ready.get(id) || null;
