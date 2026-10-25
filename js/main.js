// Menus, settings, the voice check, and starting / ending runs.
import * as THREE from 'three';
import { Game } from './game.js';
import { Sfx } from './sfx.js';
import { Voice } from './voice.js';
import { THEMES } from './level.js';
import { grainDataUrl } from './textures.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- settings ----------
const DEFAULTS = { mouse: 1, volume: 0.8, mic: 0.5, fov: 75 };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mimic.settings') || '{}')); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem('mimic.settings', JSON.stringify(settings)); } catch { /* ignore */ } };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); game?.resize(); });

$('grain').style.backgroundImage = `url(${grainDataUrl()})`;

const hud = {
  root: $('hud'), objective: $('objective'), prompt: $('prompt'), toast: $('toast'),
  mic: $('mic'), micBar: document.querySelector('#mic .bar i'), micLine: document.querySelector('#mic .bar b'), micText: $('micText'),
  stamina: $('stamina'), staminaBar: document.querySelector('#stamina i'),
  battery: $('battery'), batteryBar: document.querySelector('#battery .bar i'),
  fear: $('fear'), flash: $('flash'), locker: $('locker'), grain: $('grain'),
};

// ---------- audio ----------
let ctx = null, sfx = null;
const voice = new Voice();
voice.setSensitivity(settings.mic);

function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    sfx = new Sfx(ctx);
    sfx.setVolume(settings.volume);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// ---------- screens ----------
let game = null;
let screenBeforeSettings = 'title';

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
}
const current = () => document.querySelector('.screen:not([hidden])')?.id;

$('btnHow').onclick = () => show('how');
$('btnSettings').onclick = () => { screenBeforeSettings = 'title'; openSettings(); };
$('btnPauseSettings').onclick = () => { screenBeforeSettings = 'pause'; openSettings(); };
document.querySelectorAll('.back').forEach((b) => { b.onclick = () => show(b.closest('#settings') ? screenBeforeSettings : 'title'); });

// Settings sliders.
const sliders = [
  ['setMouse', 'mouse', (v) => v.toFixed(2)],
  ['setVolume', 'volume', (v) => `${Math.round(v * 100)}%`],
  ['setFov', 'fov', (v) => `${v}°`],
  ['setMic', 'mic', (v) => `${Math.round(v * 100)}%`],
];
for (const [id, key, fmt] of sliders) {
  const input = $(id), out = input.nextElementSibling;
  input.value = settings[key];
  out.textContent = fmt(settings[key]);
  input.oninput = () => {
    settings[key] = Number(input.value);
    out.textContent = fmt(settings[key]);
    if (key === 'volume') sfx?.setVolume(settings.volume);
    if (key === 'mic') voice.setSensitivity(settings.mic);
    if (key === 'fov') game?.resize();
    saveSettings();
  };
}

async function openSettings() {
  show('settings');
  // Start the mic here too, so the sensitivity meter is live.
  ensureAudio();
  if (!voice.started && !voice.denied) await voice.start(ctx);
}

// Live mic meters on menu screens.
(function meters() {
  for (const m of document.querySelectorAll('.meter')) {
    if (m.closest('[hidden]')) continue;
    m.querySelector('i').style.width = `${voice.meter * 100}%`;
    m.querySelector('b').style.left = `${voice.thresholdPos * 100}%`;
    m.querySelector('i').style.background = voice.talking ? '#c41a32' : '';
  }
  requestAnimationFrame(meters);
})();

// ---------- voice check ----------
let lineIndex = 0;
const lines = [...document.querySelectorAll('#micLines li')];

function markLines() {
  lines.forEach((li, i) => {
    li.classList.toggle('done', i < lineIndex);
    li.classList.toggle('now', i === lineIndex);
  });
}

$('btnPlay').onclick = async () => {
  ensureAudio();
  if (voice.clips.some((c) => c.tag === 'seed') || voice.denied) { startRun(); return; }
  show('miccheck');
  lineIndex = 0;
  markLines();
  $('btnBegin').disabled = true;
  $('micStatus').textContent = 'Asking for your microphone…';
  const ok = voice.started || await voice.start(ctx);
  if (!ok) {
    $('micStatus').textContent = `${voice.error} The mimic will have no voice to steal, so it will only whisper. You can still play.`;
    $('btnBegin').disabled = false;
    return;
  }
  $('micStatus').textContent = 'Microphone on.';
  voice.tag = 'seed';
  voice.onClip = () => {
    if (current() !== 'miccheck') return;
    lineIndex = Math.min(lines.length, lineIndex + 1);
    markLines();
    $('btnBegin').disabled = false;
    if (lineIndex >= lines.length) $('micStatus').textContent = 'Got it. Thank you.';
  };
};

$('btnBegin').onclick = () => startRun();
$('btnSkipMic').onclick = () => startRun();

// ---------- runs ----------
function startRun() {
  voice.tag = null;
  voice.onClip = null;
  game?.dispose();
  const themeId = params.get('theme') in THEMES ? params.get('theme') : Math.random() < 0.5 ? 'facility' : 'house';
  const seed = params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 2 ** 31);
  game = new Game({
    renderer, sfx, voice, settings, hud, themeId, seed,
    noLock: params.has('autostart'),
    onEnd: (r) => endRun(r),
  });
  const th = THEMES[themeId];
  $('introKicker').textContent = th.kicker;
  $('introName').textContent = game.level.name;
  show('intro');
}

function lock() {
  const p = renderer.domElement.requestPointerLock?.({ unadjustedMovement: true });
  // Some browsers refuse unadjustedMovement; fall back to a plain lock.
  p?.catch?.(() => renderer.domElement.requestPointerLock()?.catch?.(() => {}));
}

$('btnEnter').onclick = () => {
  ensureAudio();
  show(null);
  game.begin();
  lock();
};

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (!document.pointerLockElement && game.state === 'playing') {
    game.pause();
    $('pauseClips').textContent = voice.clips.length
      ? `It has ${voice.clips.length} recording${voice.clips.length > 1 ? 's' : ''} of your voice.`
      : '';
    show('pause');
  } else if (document.pointerLockElement && game.state === 'paused') {
    show(null);
    game.resume();
  }
});

$('btnResume').onclick = () => lock();
// Clicking the game view while paused also resumes (handy after the browser's Esc cooldown).
renderer.domElement.addEventListener('click', () => { if (game?.state === 'playing' && !document.pointerLockElement && !game.noLock) lock(); });

$('btnQuit').onclick = () => {
  game?.dispose();
  game = null;
  ctx?.resume();
  show('title');
};

function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

function endRun(r) {
  document.exitPointerLock?.();
  ctx?.resume();
  $('endTitle').textContent = r.won ? 'You got out.' : 'It got you.';
  $('endSub').textContent = r.won
    ? (r.clips ? 'But it still has your voice.' : 'It never learned your voice.')
    : (r.clips ? 'It sounds just like you now.' : 'It will learn your voice next time.');
  const stats = [
    ['Location', r.place],
    ['Time', fmtTime(r.time)],
    ['Fuses found', `${r.fuses}/4`],
    ['Times it used your voice', r.lures],
    ['Recordings of you', r.clips],
  ];
  $('endStats').innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  setTimeout(() => {
    show('end');
    // One last word from it, in your voice.
    const clip = voice.started ? voice.pick() : null;
    if (clip) setTimeout(() => sfx.playVoice(clip.buffer, null, 'echo'), 900);
  }, r.won ? 200 : 300);
}

$('btnAgain').onclick = () => startRun();
$('btnMenu').onclick = () => { game?.dispose(); game = null; show('title'); };

// ---------- debug: ?autostart skips the menus (used for automated screenshots) ----------
if (params.has('autostart')) {
  (async () => {
    ensureAudio();
    if (!params.has('nomic')) await voice.start(ctx);
    startRun();
    show(null);
    game.begin();
    window.__game = game;
  })();
}
