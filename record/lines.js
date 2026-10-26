// The lines to record, from the game's own tapes (story.js, lore.js). Used by the recording page (record/) and by
// tools/script.mjs. A tape line is a string, or { by, text } when the tape has more than one voice; a leading
// "(how)" is a direction for the actor. One recording per line: voices/<book>/<chapter>-<tape>-<line>.<ext>.
import { STORIES } from '../js/story.js';
import { LORE } from '../js/lore.js';

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
