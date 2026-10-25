// Syntax-check every game module AS a module. (Plain `node --check file.js` silently skips ES-module
// files, so it misses things like a const declared twice.)  Usage: node tools/check.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
for (const f of readdirSync(join(root, 'js')).filter((n) => n.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(join(root, 'js', f)) });
  if (r.status !== 0) { bad++; console.log(`✗ js/${f}\n${String(r.stderr).split('\n').slice(0, 5).join('\n')}`); }
}
console.log(bad ? `${bad} file(s) with errors` : 'all modules OK');
process.exit(bad ? 1 : 0);
