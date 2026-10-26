// The voice-recording script, from the game's own tapes (story.js, lore.js). Writes voices/SCRIPT.md.
// One recording per line: voices/<book>/<chapter>-<tape>-<line>.m4a (e.g. voices/operator/1-1-2.m4a).
// Run after changing the story or the victims' tapes:  node tools/script.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARTS, allTapes } from '../record/lines.js';

export { PARTS, allTapes };
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
