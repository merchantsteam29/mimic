// Stamp every game module URL in index.html with a new version, so browsers never mix a new page
// with old cached scripts (GitHub Pages lets browsers cache files for 10 minutes).
// Run before every push:  node tools/stamp.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'index.html');
const d = new Date();
const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
const modules = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js') && f !== 'recorder-worklet.js').sort();

let html = readFileSync(file, 'utf8');

// Import map: bare "three" plus every module mapped to its stamped URL (so `import './game.js'` gets the new one).
const imports = { three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js' };
for (const m of modules) imports[`./js/${m}`] = `./js/${m}?v=${stamp}`;
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>`);

// Preloads and the entry script.
html = html.replace(/(href|src)="js\/([\w-]+)\.js(\?v=\d+)?"/g, (_, attr, name) => `${attr}="js/${name}.js?v=${stamp}"`);

// Every module must be preloaded (after the import map), or it's fetched late.
for (const m of modules) {
  if (!html.includes(`href="js/${m}?v=`)) console.warn(`warning: no <link rel="modulepreload"> for js/${m}`);
}
writeFileSync(file, html);
console.log(`index.html stamped v=${stamp} (${modules.length} modules)`);
