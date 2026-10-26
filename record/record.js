// The recording page: one take per line, kept in this browser (IndexedDB), downloaded as a zip laid out the way
// the game wants it (voices/<book>/<chapter>-<tape>-<line>.wav). Every take is cleaned up before it's kept:
// silence trimmed off both ends, levelled, mono 24 kHz WAV (plays in every browser).
import { PARTS, allTapes } from './lines.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const slug = (r) => r.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
const RATE = 24000;

// ---------- takes, kept in this browser ----------
const db = new Promise((resolve) => {
  const req = indexedDB.open('mimic-voices', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('takes');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => resolve(null);
});
const store = async (mode, fn) => {
  const d = await db;
  if (!d) return null;
  return new Promise((resolve) => { const r = fn(d.transaction('takes', mode).objectStore('takes')); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); });
};
const takes = new Map(); // file id -> { blob, seconds }
const loadTakes = async () => {
  const d = await db;
  if (!d) return;
  await new Promise((resolve) => {
    const req = d.transaction('takes').objectStore('takes').openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) { resolve(); return; } takes.set(c.key, c.value); c.continue(); };
    req.onerror = () => resolve();
  });
};

// ---------- the lines ----------
const tapes = allTapes();
const mine = (l) => part === 'all' || slug(l.part) === part;
let part = (() => { try { return localStorage.getItem('mimic-rec-part') || slug(PARTS[0][0]); } catch { return slug(PARTS[0][0]); } })();
let active = null; // file id of the highlighted line

function render() {
  $('chips').innerHTML = PARTS.map(([p]) => {
    const n = tapes.reduce((a, t) => a + t.lines.filter((l) => !l.own && l.part === p).length, 0);
    return `<button class="chip" type="button" data-part="${slug(p)}" aria-pressed="${slug(p) === part}">${esc(p)}<span>${n}</span></button>`;
  }).join('');
  $('chips').querySelectorAll('.chip').forEach((c) => { c.onclick = () => { part = c.dataset.part; try { localStorage.setItem('mimic-rec-part', part); } catch { /* fine */ } active = null; render(); }; });
  $('partinfo').textContent = PARTS.find(([p]) => slug(p) === part)?.[1] || '';
  const shown = tapes.filter((t) => t.lines.some((l) => !l.own && mine(l)));
  $('tapes').innerHTML = shown.map((t) => `<article class="tape">
    <h3><span>${esc(t.book)} · ${esc(t.chapter)}</span>${esc(t.who)}</h3>
    <ol class="rows">${t.lines.filter((l) => !l.own).map((l) => {
      const id = `${t.id}-${l.n}`, yours = mine(l);
      return `<li class="row ${yours ? '' : 'other'}" data-id="${esc(id)}">
        ${l.by ? `<span class="who">${esc(l.by)}</span>` : ''}
        ${l.how ? `<p class="how"><span>How</span>${esc(l.how)}</p>` : ''}
        <p class="say">${esc(l.say)}</p>
        ${yours ? `<div class="controls">
          <button type="button" class="rec" data-act="rec">● Record</button>
          <button type="button" data-act="play" hidden>▶ Play</button>
          <span class="state"></span>
          <span class="file">${esc(id.split('/')[1])}.wav</span>
        </div>` : ''}
      </li>`;
    }).join('')}</ol>
  </article>`).join('') || '<p class="partinfo">Nothing for this part.</p>';
  $('tapes').querySelectorAll('.row:not(.other)').forEach((row) => {
    row.querySelector('[data-act=rec]').onclick = () => { active = row.dataset.id; toggle(row.dataset.id); };
    row.querySelector('[data-act=play]').onclick = () => play(row.dataset.id);
    row.addEventListener('focusin', () => { if (!recorder) { active = row.dataset.id; mark(); } });
  });
  if (!active) active = firstTodo();
  mark();
}

const myIds = () => [...document.querySelectorAll('.row:not(.other)')].map((r) => r.dataset.id);
const firstTodo = (after = null) => {
  const ids = myIds(), from = after ? ids.indexOf(after) + 1 : 0;
  return ids.slice(from).find((id) => !takes.has(id)) || ids.find((id) => !takes.has(id)) || ids[0] || null;
};

// Update every row's buttons and the totals.
function mark() {
  document.querySelectorAll('.row:not(.other)').forEach((row) => {
    const id = row.dataset.id, t = takes.get(id), live = recorder && recId === id;
    row.classList.toggle('active', id === active);
    const rec = row.querySelector('[data-act=rec]');
    rec.textContent = live ? '■ Stop' : t ? '↺ Redo' : '● Record';
    rec.classList.toggle('live', !!live);
    rec.disabled = !stream || (!!recorder && !live);
    row.querySelector('[data-act=play]').hidden = !t || live;
    const st = row.querySelector('.state');
    st.textContent = live ? 'Recording…' : t ? `Recorded · ${t.seconds.toFixed(1)} s` : '';
    st.classList.toggle('done', !!t && !live);
  });
  const ids = myIds(), done = ids.filter((id) => takes.has(id)).length;
  $('progress').textContent = `${done} of ${ids.length} of your lines recorded`;
  $('dockText').textContent = takes.size ? `${takes.size} line${takes.size === 1 ? '' : 's'} recorded in this browser.` : 'Nothing recorded yet.';
  $('zipBtn').disabled = !takes.size;
}

// ---------- the microphone ----------
let stream = null, ctx = null, analyser = null;
$('micBtn').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) {
    $('micText').textContent = e.name === 'NotAllowedError' ? 'The browser blocked the microphone. Allow it in the address bar, then reload.' : 'No microphone found.';
    return;
  }
  ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  (function meter() {
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    $('meter').style.width = `${Math.min(100, peak * 140)}%`;
    requestAnimationFrame(meter);
  })();
  $('mic').classList.add('on');
  $('micBtn').hidden = true;
  $('micText').textContent = 'Microphone on. Say something: the bar should jump.';
  mark();
};

// ---------- recording ----------
let recorder = null, recId = null, chunks = [];
function toggle(id) {
  if (!stream) return;
  if (recorder) { if (recId === id) recorder.stop(); return; }
  chunks = [];
  recId = id;
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = async () => {
    const raw = new Blob(chunks, { type: recorder.mimeType }), at = recId;
    recorder = null; recId = null;
    mark();
    try {
      const take = await clean(raw);
      takes.set(at, take);
      await store('readwrite', (s) => s.put(take, at));
      active = firstTodo(at); // on to your next line
    } catch {
      document.querySelector(`.row[data-id="${CSS.escape(at)}"] .state`).textContent = 'That take was empty. Try again, a little louder.';
    }
    mark();
    document.querySelector('.row.active')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  recorder.start();
  mark();
}

// Trim the quiet off both ends, level it, and make it a mono WAV.
async function clean(blob) {
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * RATE), RATE);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  let peak = 0;
  for (const v of mono) peak = Math.max(peak, Math.abs(v));
  if (peak < 0.01) throw new Error('silent');
  const gate = peak * 0.06, pad = Math.floor(RATE * 0.12);
  let a = 0, b = mono.length - 1;
  while (a < b && Math.abs(mono[a]) < gate) a++;
  while (b > a && Math.abs(mono[b]) < gate) b--;
  a = Math.max(0, a - pad); b = Math.min(mono.length - 1, b + pad * 2);
  const out = mono.slice(a, b + 1), gain = 0.89 / peak, fade = Math.floor(RATE * 0.01);
  for (let i = 0; i < out.length; i++) out[i] *= gain * Math.min(1, i / fade, (out.length - 1 - i) / fade);
  return { blob: wav(out), seconds: out.length / RATE };
}

function wav(samples) {
  const b = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); b.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true); b.setUint32(24, RATE, true);
  b.setUint32(28, RATE * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); str(36, 'data'); b.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}

let playing = null;
function play(id) {
  const t = takes.get(id);
  if (!t) return;
  playing?.pause();
  playing = new Audio(URL.createObjectURL(t.blob));
  playing.play().catch(() => {});
}

// Space: record / stop the highlighted line.
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || !stream || !active || e.target.closest?.('input, textarea')) return;
  e.preventDefault();
  toggle(recorder ? recId : active);
});

// ---------- the zip ----------
$('zipBtn').onclick = async () => {
  if (!window.JSZip) { $('dockText').textContent = 'The zip maker didn\'t load. Check your connection and reload.'; return; }
  const zip = new JSZip();
  for (const [id, t] of takes) zip.file(`voices/${id}.wav`, t.blob);
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `mimic-voices-${part === 'all' ? 'all' : part}.zip` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  $('dockText').textContent = 'Downloaded. Send the zip over. Your takes stay here in case you want to redo any.';
};

await loadTakes();
render();
