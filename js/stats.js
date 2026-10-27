// Your stats: how you've done, saved on this device only (localStorage 'mimic.stats'). Nothing to unlock.
import { storyProgress, STORIES } from './story.js';
import { MOODS, TWISTS } from './runs.js';
import { bestNight } from './nightshift.js';

const KEY = 'mimic.stats';
const fresh = () => ({ fastest: {}, moods: {}, twists: {}, runs: 0, solo: 0, online: 0, escapes: 0, taken: 0, best: 0, longest: 0, time: 0, voices: 0, asMimic: 0, mimicWins: 0, places: {} });

export function loadStats() {
  try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return fresh(); }
}

// r: { won, time, mp, place (theme id), lures, hunter (I was the mimic), mood, twist }
// Returns { record: true, prev } when it's your fastest way out of that kind of building.
export function recordRun(r) {
  const s = loadStats();
  let out = { record: false, prev: 0 };
  if (r.mood) s.moods[r.mood] = (s.moods[r.mood] || 0) + 1;
  if (r.twist) s.twists[r.twist] = (s.twists[r.twist] || 0) + 1;
  if (r.won && !r.hunter && r.place && r.time > 0) {
    const prev = s.fastest[r.place] || 0;
    if (!prev || r.time < prev) { s.fastest[r.place] = r.time; out = { record: true, prev }; }
  }
  s.runs++;
  s[r.mp ? 'online' : 'solo']++;
  s.time += r.time || 0;
  s.voices += r.lures || 0;
  if (r.hunter) { s.asMimic++; if (r.won) s.mimicWins++; }
  else if (r.won) { s.escapes++; if (!s.best || r.time < s.best) s.best = r.time; }
  else { s.taken++; s.longest = Math.max(s.longest, r.time || 0); }
  if (r.place) s.places[r.place] = (s.places[r.place] || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
  return out;
}
export const placeName = (id) => PLACE[id] || id;
export const fmtClock = (t) => clock(t);

export function resetStats() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

const PLACE = { facility: 'Research facility', house: 'Old house', hospital: 'Hospital', mall: 'Mall', school: 'School', hotel: 'Hotel', church: 'Church', asylum: 'Asylum', forest: 'Woods' };
const clock = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

// Rows for the stats screen: [label, value].
export function statRows() {
  const s = loadStats();
  const rows = [
    ['Games played', `${s.runs}${s.runs ? ` (${s.solo} alone, ${s.online} with friends)` : ''}`],
    ['Got out', s.escapes],
    ['Taken', s.taken],
    ['Fastest escape', s.best ? clock(s.best) : '-'],
    ['Longest before it got you', s.longest ? clock(s.longest) : '-'],
    ['Time spent in the dark', clock(s.time)],
    ['Times it used a voice on you', s.voices],
    ...STORIES.map((b) => [`Story: ${b.title}`, `${storyProgress(b)} of ${b.chapters.length} chapters`]),
  ];
  for (const [id, t] of Object.entries(s.fastest || {})) rows.push([`Fastest out of the ${(PLACE[id] || id).toLowerCase()}`, clock(t)]);
  const met = Object.keys(s.moods || {});
  rows.push(['What it has been', met.length ? `${met.map((m) => MOODS[m]?.name || m).join(', ')} (${met.length} of ${Object.keys(MOODS).length})` : '-']);
  rows.push(['Twists you\'ve had', `${Object.keys(s.twists || {}).length} of ${Object.keys(TWISTS).length}`]);
  if (bestNight()) rows.push(['Night Shift', `${bestNight()} night${bestNight() > 1 ? 's' : ''} in a row`]);
  if (s.asMimic) rows.push(['Games as the mimic', `${s.asMimic} (won ${s.mimicWins})`]);
  const fav = Object.entries(s.places).sort((a, b) => b[1] - a[1])[0];
  if (fav) rows.push(['Most visited', `${PLACE[fav[0]] || fav[0]} (${fav[1]})`]);
  return rows;
}
