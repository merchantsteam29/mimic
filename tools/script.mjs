// The voice-recording script, from the game's own tapes (story.js, lore.js). Writes voices/SCRIPT.md.
// One recording per line: voices/<book>/<chapter>-<tape>-<line>.m4a (e.g. voices/operator/1-1-2.m4a).
// Run after changing the story or the victims' tapes:  node tools/script.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STORIES } from '../js/story.js';
import { LORE } from '../js/lore.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Who records what. A line's speaker (or, for one-voice tapes, the tape's label) decides the part.
export const PARTS = [
  ['Ellie', 'Early 20s, films haunted places for her channel. Chatty at first, then whispering and scared, and very calm at the end.', [/^Ellie\b/]],
  ['Dr. Okafor', 'The scientist who built the thing. Careful and clinical; by the end, tired and guilty. Also plays the copies of his own voice.', [/Okafor/]],
  ['Dana', 'A 911 dispatcher. Calm and professional, quietly scared. Also reads the dispatcher lines, and the copies of her own voice.', [/^Dana\b/, /^Dispatcher/, /^Recording, unlabelled/]],
  ['Callers', 'Frightened adults on the phone: whispering, out of breath.', [/^Caller/, /^Guest/]],
  ['Child', 'A child. An adult doing a small, soft voice is fine.', [/^Child/, /daughter/]],
  ['Staff and strangers', 'Ordinary adults who were there before: nurses, guards, porters, a caretaker, a rescue team. Natural, tired, frightened.', [/./]],
];
const partOf = (name) => PARTS.find(([, , res]) => res.some((re) => re.test(name)))[0];

// A line -> { n, part, by, how, say, own }: how = the direction in brackets (act it, don't say it), say = the words.
function line(l, n, tapeWho) {
  if (typeof l === 'object' && l.playerClip) return { n, own: true };
  const raw = typeof l === 'string' ? l : l.text, by = typeof l === 'object' ? l.by || null : null;
  const m = /^\s*\(([^)]*)\)\s*(.*)$/.exec(raw);
  const how = m ? m[1].replace(/[.:]$/, '') : '', say = (m ? m[2] : raw).replace(/^"|"$/g, '');
  return { n, by, part: partOf(by || tapeWho), how, say, own: false };
}

// Every tape: { id, book, chapter, who, lines }
export function allTapes() {
  const out = [];
  for (const b of STORIES) b.chapters.forEach((c, ci) => c.tapes.forEach((t, ti) => out.push({
    id: `${b.id}/${ci + 1}-${ti + 1}`, book: b.title, chapter: `Chapter ${ci + 1}: ${c.title}`, who: t.who,
    lines: t.lines.map((l, k) => line(l, k + 1, t.who)),
  })));
  LORE.forEach((t, i) => out.push({ id: `lore/${i + 1}`, book: 'Victims\' tapes', chapter: 'Found in any normal run', who: t.who, lines: t.lines.map((l, k) => line(l, k + 1, t.who)) }));
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const tapes = allTapes(), all = tapes.flatMap((t) => t.lines.filter((l) => !l.own).map((l) => ({ ...l, tape: t })));
  const md = [
    '# Mimic: voice recording script',
    '',
    '**One line = one recording.** Say the words in **bold**. The bit in *italics* is how to say it: don\'t read it out.',
    'Save each recording with the name shown, in `voices/<folder>/` (e.g. `voices/ellie/1-2-3.m4a`), then run `node tools/stamp.mjs`.',
    'A phone voice memo in a quiet room is perfect: the game adds the tape crackle. Lines nobody has recorded yet stay silent.',
    '',
    '## Parts',
    '',
    ...PARTS.map(([p, d]) => `- **${p}** (${all.filter((l) => l.part === p).length} lines): ${d}`),
    '',
  ];
  for (const [p] of PARTS) {
    md.push(`## ${p}`, '');
    let tape = null;
    for (const l of all.filter((x) => x.part === p)) {
      if (l.tape !== tape) { if (tape) md.push(''); tape = l.tape; md.push(`### ${tape.who} (${tape.book}${tape.chapter ? `, ${tape.chapter}` : ''})`, ''); }
      md.push(`- \`${l.tape.id}-${l.n}\`${l.how ? ` *(${l.how})*` : ''} **${l.say}**`);
    }
    md.push('');
  }
  mkdirSync(join(root, 'voices'), { recursive: true });
  writeFileSync(join(root, 'voices', 'SCRIPT.md'), md.join('\n'));
  console.log(`voices/SCRIPT.md: ${tapes.length} tapes, ${all.length} lines to record`);
}
