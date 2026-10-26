// Writes voices/SCRIPT.md: every tape that can be voiced, its file name, who's speaking, and the lines.
// Run after changing the story or the victims' tapes:  node tools/script.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORIES } from '../js/story.js';
import { LORE } from '../js/lore.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Who is speaking on a tape, from its label: the role, and how to play it.
export const ROLES = [
  [/^Ellie\b/, 'Ellie', 'Early 20s, films haunted places for her channel. Chatty and jokey on the first tapes, then whispering, scared, and finally very calm.'],
  [/Okafor/, 'Dr. Okafor', 'Scientist who built the thing. Careful and clinical at first; by the end, tired and guilty.'],
  [/^Dana\b/, 'Dana', 'The 911 dispatcher (the player in The Operator). Calm, professional, quietly scared.'],
  [/^911 call|^Archive reel|Recording 0001|Recording, unlabelled/, 'Dispatch line', 'A 911 dispatcher answering, and whoever is calling. Dana can read the dispatcher parts; the callers are whispery and frightened.'],
  [/Recording 0002/, 'Child', 'A child counting, played by an adult doing a small, soft voice.'],
  [/nurse|Nurse|porter|Porter|Coroner|Night guard|guard|Security|Caretaker|Supervisor|Front desk|Guest|PA log|Field team|tape|log|Unlabelled/i, 'Staff and strangers', 'Ordinary adults who were there before you: nurses, guards, porters, a caretaker. Natural, tired, frightened.'],
];
export const roleOf = (who) => ROLES.find(([re]) => re.test(who)) || [null, 'Staff and strangers', ''];

// Every tape: { id, book, chapter, title, who, role, lines (spoken), own (ends with the player's own voice) }
export function allTapes() {
  const out = [];
  for (const b of STORIES) b.chapters.forEach((c, ci) => c.tapes.forEach((t, ti) => out.push({
    id: `${b.id}/${ci + 1}-${ti + 1}`, book: b.title, chapter: `Chapter ${ci + 1}: ${c.title}`, who: t.who, role: roleOf(t.who)[1],
    lines: t.lines.filter((l) => typeof l === 'string'), own: t.lines.some((l) => typeof l === 'object' && l.playerClip),
  })));
  LORE.forEach((t, i) => out.push({ id: `lore/${i + 1}`, book: 'Victims\' tapes (any normal run)', chapter: '', who: t.who, role: roleOf(t.who)[1], lines: t.lines, own: false }));
  return out;
}

const tapes = allTapes();
const md = [
  '# Mimic: voice recording script',
  '',
  'Every tape the player can find, with the file name to save it as. Record each tape as **one file**, all its lines in order,',
  'with a short pause between lines. Put the files in `voices/<folder>/` (folder = the part before the slash) and run',
  '`node tools/stamp.mjs`: any tape with a recording plays it, and the rest keep the old murmur.',
  '',
  '- A phone is fine. The game adds the tape hiss, so record somewhere quiet and don\'t add effects.',
  '- Lines in brackets, like *(Breathing.)*, are directions: act them, don\'t read them.',
  '- mp3, m4a, ogg, opus, webm or wav all work. Name the file exactly as shown (e.g. `1-2.m4a` in `voices/ellie/`).',
  '- Some tapes end with *the player\'s own voice*: stop recording before that line. The game plays the player\'s voice there.',
  '',
  '## Cast',
  '',
  ...[...new Map(tapes.map((t) => [t.role, ROLES.find((r) => r[1] === t.role)?.[2] || ''])).entries()].map(([r, d]) => `- **${r}** (${tapes.filter((t) => t.role === r).length} tape${tapes.filter((t) => t.role === r).length === 1 ? '' : 's'}): ${d}`),
  '',
];
let book = null;
for (const t of tapes) {
  if (t.book !== book) { book = t.book; md.push(`## ${book}`, ''); }
  md.push(`### \`voices/${t.id}\`  ${t.chapter ? `(${t.chapter})` : ''}`, `**${t.who}** · ${t.role}`, '');
  t.lines.forEach((l) => md.push(`> ${l}`, '>'));
  if (md[md.length - 1] === '>') md.pop();
  if (t.own) md.push('', '*(Stop here: the player\'s own voice plays next.)*');
  md.push('');
}
mkdirSync(join(root, 'voices'), { recursive: true });
writeFileSync(join(root, 'voices', 'SCRIPT.md'), md.join('\n'));
console.log(`voices/SCRIPT.md: ${tapes.length} tapes, ${tapes.reduce((a, t) => a + t.lines.length, 0)} lines`);
