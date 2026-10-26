// Menus, settings, the voice check, rooms and lobbies, and starting / ending runs.
import * as THREE from 'three';
import { Game, ROOM } from './game.js';
import { Sfx } from './sfx.js';
import { Samples } from './samples.js';
import { VHS } from './vhs.js';
import { Voice } from './voice.js';
import { THEMES } from './level.js';
import { grainDataUrl, preloadPhotos } from './textures.js';
import { Session } from './mp.js';
import { newCode, cleanCode, cleanName } from './net.js';
import { CLASSES, CLASS_ORDER } from './classes.js';
import { VERSION } from './version.js';
import { CHAPTERS, SIGNAL, storyProgress, finishChapter } from './story.js';
import { controls, initControls, bindsChanged, editTouchLayout } from './controls.js';
import { ACTIONS, binds, resetBinds, keyName, padName } from './binds.js';
import { initTitle } from './title.js';
import { Captions } from './captions.js';
import { TUTORIAL } from './tutorial.js';
import { drawRecap, PLAYER_COLORS } from './recap.js';
import { recordRun, statRows, resetStats } from './stats.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// An old cached page running new scripts (GitHub Pages serves the newest file whatever the ?v=):
// buttons would be missing their screens. Reload once with a fresh page.
if (window.MIMIC_VERSION !== VERSION) { // (pages from before this check have no MIMIC_VERSION at all)
  let tried = null;
  try { tried = sessionStorage.getItem('mimic.reloaded'); sessionStorage.setItem('mimic.reloaded', VERSION); } catch { /* private mode */ }
  if (tried !== VERSION) {
    params.set('fresh', VERSION);
    location.replace(`${location.pathname}?${params}${location.hash}`);
    throw new Error('Page out of date: reloading');
  }
}
const randomTheme = () => { const ids = Object.keys(THEMES); return ids[Math.floor(Math.random() * ids.length)]; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- settings ----------
// Graphics start on Auto: phones and tablets begin at medium, and it steps down by itself when the game runs slowly
// (`tier` is where Auto has settled on this device).
const COARSE = matchMedia('(pointer: coarse)').matches;
const DEFAULTS = { mouse: 1, volume: 0.8, mic: 0.5, fov: 75, bright: 1, quality: 'auto', tier: COARSE ? 'medium' : 'high', captions: false, calm: false };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mimic.settings') || '{}')); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem('mimic.settings', JSON.stringify(settings)); } catch { /* ignore */ } };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); // the camcorder pass renders the scene at VHS resolution anyway
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const applyBright = () => { renderer.toneMappingExposure = 1.3 * settings.bright; };
applyBright();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const vhs = new VHS(renderer);
document.body.classList.add('vhs');
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); vhs.resize(); game?.resize(); });

// Graphics quality: tape and screen resolution change now; game.js also uses fewer lights and softer
// shadows from the next game.
// 'lowest' is only reached by Auto, on a struggling phone.
const QUALITY = { lowest: { lines: 200, ratio: 0.5 }, low: { lines: 240, ratio: 0.6 }, medium: { lines: 300, ratio: 0.8 }, high: { lines: 360, ratio: 1 } };
const TIERS = ['lowest', 'low', 'medium', 'high'];
if (settings.quality !== 'auto' && !QUALITY[settings.quality]) settings.quality = DEFAULTS.quality;
if (!QUALITY[settings.tier]) settings.tier = DEFAULTS.tier;
const tierNow = () => (settings.quality === 'auto' ? settings.tier : settings.quality);
function applyQuality() {
  const q = QUALITY[tierNow()];
  renderer.setPixelRatio(q.ratio);
  renderer.setSize(innerWidth, innerHeight);
  vhs.lines = q.lines;
  vhs.resize();
  document.querySelectorAll('#setQuality button').forEach((b) => b.classList.toggle('on', b.dataset.q === settings.quality));
  $('qualityNow').textContent = settings.quality === 'auto' ? `Auto is on ${tierNow()} for this device.` : '';
}

// Auto graphics: watch the frame rate while playing. Slow for a few seconds: one step down (the picture now; lights and
// shadows too, with a short hitch). Smooth for a long time: one step back up.
const perf = { last: 0, n: 0, sum: 0, slow: 0, fast: 0 };
function watchPerf(now) {
  const dt = now - perf.last;
  perf.last = now;
  if (settings.quality !== 'auto' || !game || game.state !== 'playing' || game.paused || document.hidden || dt > 250) { perf.n = perf.sum = 0; return; }
  perf.n++; perf.sum += dt;
  if (perf.sum < 2000) return;
  const fps = (perf.n * 1000) / perf.sum;
  perf.n = perf.sum = 0;
  perf.slow = fps < 27 ? perf.slow + 1 : 0;
  perf.fast = fps > 57 ? perf.fast + 1 : 0;
  const i = TIERS.indexOf(settings.tier);
  let to = null;
  if (perf.slow >= 2 && i > 0) to = TIERS[i - 1];
  else if (perf.fast >= 15 && i < TIERS.length - 1) to = TIERS[i + 1];
  if (!to) return;
  perf.slow = perf.fast = 0;
  settings.tier = to;
  saveSettings();
  applyQuality();
  game.setQuality(to);
}
document.querySelectorAll('#setQuality button').forEach((b) => {
  b.onclick = () => { settings.quality = b.dataset.q; saveSettings(); applyQuality(); };
});
applyQuality();

// Sound captions.
const syncCaptions = () => document.querySelectorAll('#setCaptions button').forEach((b) => b.classList.toggle('on', (b.dataset.c === 'on') === !!settings.captions));
document.querySelectorAll('#setCaptions button').forEach((b) => { b.onclick = () => { settings.captions = b.dataset.c === 'on'; saveSettings(); syncCaptions(); }; });
syncCaptions();
// Fewer flashes: no lightning, no strobing lights, gentler tearing and hit flashes.
const syncCalm = () => {
  document.querySelectorAll('#setCalm button').forEach((b) => b.classList.toggle('on', (b.dataset.c === 'on') === !!settings.calm));
  document.body.classList.toggle('calm', !!settings.calm);
};
document.querySelectorAll('#setCalm button').forEach((b) => { b.onclick = () => { settings.calm = b.dataset.c === 'on'; saveSettings(); syncCalm(); }; });
syncCalm();

// Your stats (this device only).
$('btnStats').onclick = () => {
  $('statList').innerHTML = statRows().map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  show('stats');
};
$('btnStatsReset').onclick = () => { if (confirm('Clear your stats on this device?')) { resetStats(); $('btnStats').click(); } };

$('grain').style.backgroundImage = `url(${grainDataUrl()})`;
preloadPhotos();

const hud = {
  root: $('hud'), objective: $('objective'), prompt: $('prompt'), toast: $('toast'),
  mic: $('mic'), micBar: document.querySelector('#mic .bar i'), micLine: document.querySelector('#mic .bar b'), micText: $('micText'),
  stamina: $('stamina'), staminaBar: document.querySelector('#stamina i'),
  battery: $('battery'), batteryBar: document.querySelector('#battery .bar i'),
  fear: $('fear'), flash: $('flash'), locker: $('locker'), grain: $('grain'), spec: $('spec'),
  cam: $('cam'), camStamp: $('camStamp'), camCounter: $('camCounter'), camBat: document.querySelector('#cam .bat i'), camBatBox: document.querySelector('#cam .bat'),
  signal: $('signal'),
};

// ---------- audio ----------
let ctx = null, sfx = null;
const captions = new Captions($('captions'), () => game, () => settings.captions);
const voice = new Voice();
voice.setSensitivity(settings.mic);

function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    sfx = new Sfx(ctx);
    sfx.setVolume(settings.volume);
    sfx.samples = new Samples(ctx);
    sfx.samples.load(); // recorded sounds (CC0); synthesized ones stand in until they arrive
    captions.attach(sfx);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

// ---------- screens ----------
let game = null;
let session = null; // multiplayer room, while in one
let screenBeforeSettings = 'title';

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
}
const current = () => document.querySelector('.screen:not([hidden])')?.id;

initTitle({
  voiceCount: () => voice.clips.length,
  // Left on the title long enough, it tries out your voice. Only once it has one, and only if sound is on.
  whisper: () => {
    if (!sfx || ctx.state !== 'running' || !voice.started || !voice.clips.length || game) return false;
    const c = voice.pick();
    if (c) sfx.playVoice(c.buffer, null, 'echo');
    return !!c;
  },
});

// Install as an app (Chrome / Edge / Android). iPhone: Share > Add to Home Screen.
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('btnInstall').hidden = false; });
addEventListener('appinstalled', () => { installEvt = null; $('btnInstall').hidden = true; });
$('btnInstall').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null;
  $('btnInstall').hidden = true;
};
if ('serviceWorker' in navigator && !params.has('autostart')) navigator.serviceWorker.register('sw.js').catch(() => {});

$('btnHow').onclick = () => show('how');
$('btnSettings').onclick = () => { screenBeforeSettings = 'title'; openSettings(); };
$('btnPauseSettings').onclick = () => { screenBeforeSettings = 'pause'; openSettings(); };
document.querySelectorAll('.back').forEach((b) => {
  b.onclick = () => (b.dataset.to === 'settings' ? openSettings() : show(b.closest('#settings') ? screenBeforeSettings : 'title'));
});

// ---------- controls: rebinding ----------
function renderBinds() {
  $('bindList').innerHTML = ACTIONS.map(([id, label, , padDefault]) => `<div class="bind-row"><span>${esc(label)}</span>`
    + `<button data-kind="key" data-id="${id}">${esc(keyName(binds.key[id]))}</button>`
    + `<button data-kind="pad" data-id="${id}" ${padDefault === null ? 'disabled' : ''}>${padDefault === null ? 'Left stick' : esc(padName(binds.pad[id]))}</button></div>`).join('');
  $('bindList').querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const { kind, id } = b.dataset;
      b.textContent = kind === 'key' ? 'Press a key…' : 'Press a button…';
      b.classList.add('wait');
      controls.capture = {
        kind,
        done: (v) => {
          if (v !== null && v !== undefined && !(kind === 'key' && v === 'Escape')) {
            const table = binds[kind];
            // Taking a key from another action swaps them.
            const other = Object.keys(table).find((k) => k !== id && table[k] === v);
            if (other) table[other] = table[id];
            table[id] = v;
            bindsChanged();
          }
          renderBinds();
        },
      };
    };
  });
}
$('btnControls').onclick = () => { renderBinds(); show('binds'); };
$('btnBindsReset').onclick = () => { resetBinds(); bindsChanged(); renderBinds(); };
$('btnTouchLayout').onclick = () => { controls.capture = null; show(null); editTouchLayout(() => show('binds')); };

// Settings sliders.
const sliders = [
  ['setMouse', 'mouse', (v) => v.toFixed(2)],
  ['setVolume', 'volume', (v) => `${Math.round(v * 100)}%`],
  ['setFov', 'fov', (v) => `${v}°`],
  ['setMic', 'mic', (v) => `${Math.round(v * 100)}%`],
  ['setBright', 'bright', (v) => `${Math.round(v * 100)}%`],
  ['readyBright', 'bright', (v) => `${Math.round(v * 100)}%`],
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
    if (key === 'bright') { applyBright(); syncBright(); }
    saveSettings();
  };
}

async function openSettings() {
  show('settings');
  // Start the mic here too, so the sensitivity meter is live.
  ensureAudio();
  if (!voice.started && !voice.denied) await voice.start(ctx);
}

// Live mic meters on menu screens, and who's talking in the lobby.
(function meters() {
  for (const m of document.querySelectorAll('.meter')) {
    if (m.closest('[hidden]')) continue;
    m.querySelector('i').style.width = `${voice.meter * 100}%`;
    m.querySelector('b').style.left = `${voice.thresholdPos * 100}%`;
    m.querySelector('i').style.background = voice.talking ? '#c41a32' : '';
  }
  if (session && current() === 'lobby') {
    for (const li of document.querySelectorAll('#lobbyList li')) {
      const id = li.dataset.id;
      li.classList.toggle('talking', id === session.id ? voice.talking : !!session.vc?.talking(id));
    }
  }
  watchPerf(performance.now());
  captions.update();
  requestAnimationFrame(meters);
})();

// ---------- classes ----------
let myClass = (() => { try { return localStorage.getItem('mimic.class'); } catch { return null; } })();
if (!CLASSES[myClass]) myClass = 'runner';

function renderClassPick() {
  for (const box of document.querySelectorAll('.class-pick')) {
    box.innerHTML = CLASS_ORDER.map((id) =>
      `<button data-cls="${id}" class="${id === myClass ? 'on' : ''}"><b>${CLASSES[id].name}</b><span>${esc(CLASSES[id].blurb)}</span></button>`).join('');
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        myClass = b.dataset.cls;
        try { localStorage.setItem('mimic.class', myClass); } catch { /* ignore */ }
        session?.setClass(myClass);
        renderClassPick();
      };
    });
  }
}
renderClassPick();
$('btnClassGo').onclick = () => startRun(storyIdx);

// ---------- voice check (before your first game, alone or online) ----------
let lineIndex = 0;
let afterMic = null;
const lines = [...document.querySelectorAll('#micLines li')];

function markLines() {
  lines.forEach((li, i) => {
    li.classList.toggle('done', i < lineIndex);
    li.classList.toggle('now', i === lineIndex);
  });
}

async function voiceCheck(next) {
  ensureAudio();
  afterMic = next;
  if (voice.clips.some((c) => c.tag === 'seed') || voice.denied) { finishVoiceCheck(); return; }
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
}

function finishVoiceCheck() {
  voice.tag = null;
  voice.onClip = null;
  const next = afterMic;
  afterMic = null;
  next?.();
}

// The first time you play alone, it offers the tutorial (once; How to play has it too).
const tutorialSeen = () => { try { return !!localStorage.getItem('mimic.tutorial'); } catch { return true; } };
const markTutorial = () => { try { localStorage.setItem('mimic.tutorial', '1'); } catch { /* ignore */ } };
const pickClass = () => { storyIdx = null; renderClassPick(); show('classes'); };
$('btnPlay').onclick = () => voiceCheck(() => (tutorialSeen() ? pickClass() : show('first')));
$('btnFirstTut').onclick = () => { markTutorial(); startTutorial(); };
$('btnFirstSkip').onclick = () => { markTutorial(); pickClass(); };
$('btnTutorial').onclick = () => voiceCheck(() => { markTutorial(); startTutorial(); });

function startTutorial() {
  game?.dispose();
  storyIdx = null;
  game = new Game({
    renderer, vhs, sfx, voice, settings, hud, themeId: TUTORIAL.theme, seed: TUTORIAL.seed, tutorial: true, classes: { h: 'runner' },
    noLock: params.has('autostart'),
    onEnd: (r) => endRun(r),
  });
  showIntro(TUTORIAL.theme, null, TUTORIAL.intro);
  $('introKicker').textContent = 'Tutorial';
}
$('btnStory').onclick = () => voiceCheck(() => openStory());

// ---------- story: chapter select ----------
let storyIdx = null; // the chapter being played (null = a normal run)
function openStory() {
  const done = storyProgress();
  $('chapters').innerHTML = CHAPTERS.map((c, i) => {
    const open = i <= done;
    return `<button data-ch="${i}" ${open ? '' : 'disabled'}><b>Chapter ${i + 1}</b><span>${open ? esc(c.title) : '???'}</span>${i < done ? '<i>finished</i>' : ''}</button>`;
  }).join('');
  $('chapters').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { storyIdx = Number(b.dataset.ch); renderClassPick(); show('classes'); };
  });
  show('story');
}
$('btnFriends').onclick = () => voiceCheck(() => openMp());
$('btnBegin').onclick = () => finishVoiceCheck();
$('btnSkipMic').onclick = () => finishVoiceCheck();

// ---------- solo runs ----------
function startRun(si = null) {
  game?.dispose();
  storyIdx = si;
  const story = si === null ? null : { ...CHAPTERS[si], index: si };
  const themeId = story ? story.theme : params.get('theme') in THEMES ? params.get('theme') : randomTheme();
  const seed = story ? story.seed : params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 2 ** 31);
  game = new Game({
    renderer, vhs, sfx, voice, settings, hud, themeId, seed, story, classes: { h: params.get('class') in CLASSES ? params.get('class') : myClass },
    noLock: params.has('autostart'),
    onEnd: (r) => endRun(r),
  });
  showIntro(themeId, story);
}

const lineText = (l) => (typeof l === 'string' ? l : l.text);

// The "before you go in" screen comes first, once per session.
let readyShown = false;
function syncBright() {
  for (const id of ['setBright', 'readyBright']) { const el = $(id); el.value = settings.bright; el.nextElementSibling.textContent = `${Math.round(settings.bright * 100)}%`; }
  // The calibration shapes get the same boost the game's picture does.
  document.querySelector('.calib-shapes').style.filter = `brightness(${settings.bright * 1.3})`;
}
syncBright();
$('btnReady').onclick = () => { readyShown = true; show('intro'); };

function showIntro(themeId, story = null, introLines = null) {
  $('introKicker').textContent = story ? `Chapter ${story.index + 1}` : THEMES[themeId].kicker;
  $('introName').textContent = story ? story.title : game.level.name;
  const lines = introLines || (story ? story.intro : ['The power is out. Get it back on, and get out.']);
  $('introText').innerHTML = lines.map((l) => `<p>${esc(lineText(l))}</p>`).join('');
  $('introWhisper').hidden = !!story;
  show(readyShown || params.has('autostart') ? 'intro' : 'ready');
}

function lock() {
  const p = renderer.domElement.requestPointerLock?.({ unadjustedMovement: true });
  // Some browsers refuse unadjustedMovement; fall back to a plain lock.
  p?.catch?.(() => renderer.domElement.requestPointerLock()?.catch?.(() => {}));
}

// The game plays in full screen (it needs the click to ask).
function goFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// Phones play sideways.
function goLandscape() {
  screen.orientation?.lock?.('landscape').catch(() => {});
}

// Controllers and touch screens play without pointer lock (a gamepad press can't ask for it).
const usesLock = () => controls.mode === 'mouse' && !game?.noLock;

$('btnEnter').onclick = () => {
  ensureAudio();
  goFullscreen();
  if (controls.mode === 'touch') goLandscape();
  show(null);
  game.begin();
  if (usesLock()) lock();
};

// Leaving full screen while playing pauses, like Esc.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && game && (game.state === 'playing' || game.state === 'spectate') && document.pointerLockElement) document.exitPointerLock();
});

function openPause() {
  if (!game || game.paused || !(game.state === 'playing' || game.state === 'spectate')) return;
  if (game.room) { game.pause(); show('lobby'); renderLobby(); return; } // the waiting room: back to the lobby menu
  game.pause();
  $('pauseClips').textContent = session
    ? 'The game keeps going while this menu is open.'
    : voice.clips.length ? `It has ${voice.clips.length} recording${voice.clips.length > 1 ? 's' : ''} of your voice.` : '';
  $('btnQuit').textContent = session ? 'Leave game' : 'Quit to menu';
  if (controls.mode === 'mouse') $('pauseClips').textContent += (($('pauseClips').textContent ? ' ' : '') + 'Resume returns to full screen.');
  show('pause');
}

function closePause() {
  if (!game?.paused) return;
  show(null);
  game.resume();
}

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (!document.pointerLockElement) openPause();
  else closePause();
});

// Start on a controller, or the touch pause button.
controls.getGame = () => game;
controls.onPause = () => { if (document.pointerLockElement) document.exitPointerLock(); else openPause(); };
initControls();
// Switching apps on a phone (or tabs without pointer lock) pauses too.
document.addEventListener('visibilitychange', () => { if (document.hidden && !document.pointerLockElement) openPause(); });

$('btnResume').onclick = () => {
  goFullscreen();
  if (usesLock()) { lock(); return; } // resumes once the lock is back
  if (controls.mode === 'touch') goLandscape();
  closePause();
};
// Clicking the game view while paused also resumes (handy after the browser's Esc cooldown).
renderer.domElement.addEventListener('click', () => {
  if (game && (game.state === 'playing' || game.state === 'spectate') && !document.pointerLockElement && !game.noLock) { goFullscreen(); lock(); }
});

$('btnQuit').onclick = () => {
  if (session) leaveSession();
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
  const stats = [['Location', r.place], ['Time', fmtTime(r.time)], ['Fuses found', `${r.fuses}/4`], ['Times it used a voice', r.lures]];
  if (r.mp) {
    const out = r.results.filter((p) => p.status === 'out').length;
    $('endSub').textContent = out === r.results.length ? 'Everyone got out. Are you sure it was everyone?'
      : out ? 'Not everyone made it out.' : 'Nobody made it out. It has all of your voices now.';
    const label = { out: 'Got out', dead: 'Taken', left: 'Left', alive: 'Taken', hunter: 'The mimic' };
    $('endPlayers').innerHTML = r.results.map((p) =>
      `<li class="${p.status}"><span class="dot"></span>${esc(p.name)}${p.id === session?.id ? ' (you)' : ''}<span class="ptag">${label[p.status] || 'Taken'}</span></li>`).join('');
    $('endPlayers').hidden = false;
    $('btnAgain').hidden = true;
    $('btnToLobby').hidden = !session?.isHost;
    $('btnMenu').textContent = 'Leave';
    if (r.mode === 'hunt' && r.hunter) {
      const others = r.results.filter((p) => p.id !== r.hunter), took = others.filter((p) => p.status !== 'out' && p.status !== 'left').length;
      $('endTitle').textContent = r.hunterWins ? 'The mimic wins.' : 'You got away from it.';
      $('endSub').textContent = `${r.hunter === session?.id ? 'You were' : `${r.hunterName} was`} the mimic. It took ${took} of ${others.length}.`;
    }
    if (r.mode === 'story') { // the reveal
      $('endSub').textContent += r.traitor
        ? ` ${r.traitor === session?.id ? 'You were' : `${r.traitorName} was`} working for it. The traitor ${r.traitorWins ? 'wins' : 'loses'}.`
        : ' Nobody was working for it. You did this to yourselves.';
    }
    if (session && !session.isHost) $('endSub').textContent += ' Waiting for the host…';
  } else if (r.story) {
    const ch = r.story, last = ch.index === CHAPTERS.length - 1;
    if (r.won) finishChapter(ch.index);
    $('endTitle').textContent = r.won ? (last ? 'The end.' : `Chapter ${ch.index + 1} complete`) : 'It got you.';
    $('endSub').textContent = r.won ? ch.ending.map(lineText).join(' ') : 'Ellie is still in there somewhere.';
    $('endPlayers').hidden = true;
    $('btnAgain').hidden = false;
    $('btnAgain').textContent = r.won ? (last ? 'Back to chapters' : 'Next chapter') : 'Try again';
    againAction = r.won ? (last ? () => openStory() : () => startRun(ch.index + 1)) : () => startRun(ch.index);
    $('btnToLobby').hidden = true;
    $('btnMenu').textContent = 'Main menu';
    if (r.won && ch.ending.some((l) => l.playerClip)) setTimeout(() => game?.playOwnVoice?.(), 4500);
  } else {
    stats.push(['Recordings of you', r.clips]);
    $('btnAgain').textContent = 'Play again';
    againAction = () => startRun(null);
    $('endSub').textContent = r.won
      ? (r.clips ? 'But it still has your voice.' : 'It never learned your voice.')
      : (r.clips ? 'It sounds just like you now.' : 'It will learn your voice next time.');
    $('endPlayers').hidden = true;
    $('btnAgain').hidden = false;
    $('btnToLobby').hidden = true;
    $('btnMenu').textContent = 'Main menu';
  }
  if (r.tutorial) {
    $('endSub').textContent = r.won ? 'That\'s all there is to it. Every run is a new building, and it learns your voice as you go.'
      : 'It happens. Every run is a new building, and it learns your voice as you go.';
    $('btnAgain').textContent = 'Play for real';
    againAction = () => pickClass();
  }
  $('endStats').innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  showRecap(r);
  if (!r.tutorial) recordRun({ won: r.won, time: r.time, mp: !!r.mp, place: game?.level.theme.id, lures: r.lures, hunter: !!r.hunter && r.hunter === session?.id });
  offerClip(game?.clip);
  const ended = game;
  setTimeout(() => {
    if (game !== ended) return; // already back in the lobby (timers can run late in background tabs)
    hud.signal.hidden = true;
    show('end');
    // One last word from it, in your voice.
    const clip = !r.mp && !r.story && voice.started ? voice.pick() : null;
    if (clip) setTimeout(() => sfx.playVoice(clip.buffer, null, 'echo'), 900);
  }, 300);
}

// The round on a map, plus who it copied most.
let stopRecap = null;
function showRecap(r) {
  stopRecap?.();
  stopRecap = null;
  const rc = r.recap, level = game?.level;
  $('recap').hidden = !rc || !level;
  if ($('recap').hidden) return;
  const order = game.order, name = (id) => (r.mp ? game.nameOf(id) : 'You');
  const fate = (id) => {
    const e = rc.ev.find((q) => q[1] === id);
    if (id === r.hunter) return 'was the mimic';
    if (!e) return r.results?.find((q) => q.id === id)?.status === 'left' ? 'left' : 'still in there';
    return e[0] === 'out' ? `got out at ${fmtTime(e[4])}` : `taken at ${fmtTime(e[4])}${e[5] ? ' (not by the mimic)' : ''}`;
  };
  $('recapKey').innerHTML = order.map((id, i) => `<li><i style="background:${PLAYER_COLORS[i % 4]}"></i>${esc(name(id))}${r.mp && id === session?.id ? ' (you)' : ''}<span>${fate(id)}</span></li>`).join('')
    + '<li><i class="it"></i>It<span>its route</span></li>';
  const most = Object.entries(rc.v || {}).sort((a, b) => b[1] - a[1])[0];
  $('recapNote').textContent = !most ? 'It never used anyone\'s voice.'
    : r.mp ? `It used ${name(most[0])}'s voice the most: ${most[1]} time${most[1] > 1 ? 's' : ''}.`
      : `It used your voice ${most[1]} time${most[1] > 1 ? 's' : ''}.`;
  const run = () => { stopRecap?.(); stopRecap = drawRecap($('recapMap'), level, rc, order); };
  setTimeout(run, 400); // once the end screen is up
  $('btnReplay').onclick = run;
}

// The jumpscare, to save or share (when it got you, and this browser can record).
function offerClip(clip) {
  const b = $('btnClip');
  b.hidden = true;
  if (!clip) return;
  const ready = (blob) => {
    b.hidden = false;
    b.onclick = async () => {
      const file = new File([blob], `mimic-jumpscare.${clip.ext}`, { type: blob.type });
      if (controls.mode === 'touch' && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Mimic' }); return; } catch { /* cancelled: fall back to saving */ }
      }
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
  };
  if (clip.blob) ready(clip.blob); else clip.onReady = ready;
}

let againAction = () => startRun(null);
$('btnAgain').onclick = () => againAction();
$('btnMenu').onclick = () => {
  if (session) leaveSession();
  game?.dispose();
  game = null;
  show('title');
};

// ---------- playing with friends ----------
function savedName() {
  try { return localStorage.getItem('mimic.name') || ''; } catch { return ''; }
}

function openMp(status = '') {
  show('mp');
  $('mpName').value = savedName() || `Player ${Math.floor(Math.random() * 900 + 100)}`;
  if (params.get('join') && !$('mpCode').value) $('mpCode').value = cleanCode(params.get('join'));
  $('mpStatus').textContent = status;
}

function mpBusy(on, text = '') {
  $('btnHost').disabled = $('btnJoin').disabled = on;
  $('mpStatus').textContent = text;
}

function newSession() {
  const name = cleanName($('mpName').value);
  try { localStorage.setItem('mimic.name', name); } catch { /* ignore */ }
  const s = new Session({ sfx, voice });
  s.onRoster = () => renderLobby();
  s.onStart = (m) => startMpRun(m);
  s.onLobby = () => backToLobby();
  s.onClose = (why) => {
    if (session !== s) return;
    session = null;
    game?.dispose();
    game = null;
    document.exitPointerLock?.();
    openMp(why);
  };
  return { s, name };
}

$('btnHost').onclick = async () => {
  ensureAudio();
  mpBusy(true, 'Creating a room…');
  for (let tries = 0; tries < 3; tries++) {
    const { s, name } = newSession();
    try {
      await s.host(newCode(), name);
      session = s;
      s.setClass(myClass);
      mpBusy(false);
      openRoom();
      show('lobby');
      renderLobby();
      return;
    } catch (e) {
      s.dispose();
      if (tries === 2 || !/taken/.test(e.message)) { mpBusy(false, e.message); return; }
    }
  }
};

$('btnJoin').onclick = async () => {
  ensureAudio();
  const code = cleanCode($('mpCode').value);
  if (code.length !== 4) { $('mpStatus').textContent = 'Room codes have 4 letters.'; return; }
  mpBusy(true, 'Joining…');
  const { s, name } = newSession();
  try {
    await s.join(code, name);
    session = s;
    s.setClass(myClass);
    mpBusy(false);
    openRoom();
    show('lobby');
    renderLobby();
  } catch (e) {
    s.dispose();
    mpBusy(false, e.message);
  }
};
$('mpCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });

function renderLobby() {
  if (!session) return;
  if (game?.room) game.syncRoster(session.roster.map((r) => r.id));
  $('lobbyCode').textContent = session.code;
  $('lobbyList').innerHTML = session.roster.map((r) =>
    `<li data-id="${esc(r.id)}"><span class="dot"></span>${esc(r.name)}${r.id === session.id ? ' (you)' : ''}<span class="ptag">${CLASSES[r.cls]?.name || ''}${r.id === 'h' ? ' · host' : ''}</span></li>`).join('');
  renderClassPick();
  $('btnStart').hidden = !session.isHost;
  $('lobbyStatus').textContent = session.isHost
    ? (session.roster.length < 2 ? 'Send your friends the code or the invite link.' : `${session.roster.length} of 4 players.`)
    : 'Waiting for the host to start…';
  document.querySelectorAll('.mode-pick button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === session.mode);
    b.disabled = !session.isHost;
    b.onclick = () => session.setMode(b.dataset.mode);
  });
  // The skinwalker: a Normal-mode extra the host switches on.
  const sw = $('btnSkinwalker'), swOn = session.skinwalker && session.mode === 'normal';
  sw.classList.toggle('on', swOn);
  sw.querySelector('b').textContent = `Skinwalker: ${swOn ? 'on' : 'off'}`;
  sw.disabled = !session.isHost || session.mode !== 'normal';
  sw.onclick = () => session.setSkinwalker(!session.skinwalker);
  // The blind listener: the same kind of switch.
  const ls = $('btnListener'), lsOn = session.listener && session.mode === 'normal';
  ls.classList.toggle('on', lsOn);
  ls.querySelector('b').textContent = `Listener: ${lsOn ? 'on' : 'off'}`;
  ls.disabled = !session.isHost || session.mode !== 'normal';
  ls.onclick = () => session.setListener(!session.listener);
}

// The waiting room: a small house to walk around in with everyone while you wait.
function openRoom() {
  if (!session) return;
  game?.dispose();
  game = new Game({
    renderer, vhs, sfx, voice, settings, hud, themeId: ROOM.theme, seed: ROOM.seed, mp: session, room: true,
    order: session.roster.map((r) => r.id), classes: {}, noLock: params.has('autostart'), onEnd: () => {},
  });
  session.game = game;
  game.pause(); // the lobby menu is on top until you walk in
}
$('btnRoom').onclick = () => {
  if (!game?.room) openRoom();
  ensureAudio();
  show(null);
  game.resume();
  if (controls.mode === 'touch') goLandscape();
  if (usesLock()) lock();
};

$('btnInvite').onclick = async () => {
  const link = `${location.origin}${location.pathname}?join=${session?.code}`;
  try { await navigator.clipboard.writeText(link); $('btnInvite').textContent = 'Copied!'; }
  catch { prompt('Copy this invite link:', link); }
  setTimeout(() => { $('btnInvite').textContent = 'Copy invite link'; }, 1500);
};

$('btnStart').onclick = () => {
  if (!session?.isHost) return;
  const theme = params.get('theme') in THEMES ? params.get('theme') : randomTheme();
  session.start(theme, Math.floor(Math.random() * 2 ** 31));
};

$('btnLeave').onclick = () => { leaveSession(); show('title'); };

function leaveSession() {
  if (game?.room) { game.dispose(); game = null; }
  const s = session;
  session = null;
  s?.dispose();
}

function startMpRun(m) {
  game?.dispose();
  game = null;
  document.exitPointerLock?.(); // you may have been walking around the waiting room
  const themeId = m.theme in THEMES ? m.theme : 'facility';
  game = new Game({
    renderer, vhs, sfx, voice, settings, hud, themeId, seed: Number(m.seed) >>> 0, mp: session, order: m.order, classes: m.classes || {},
    mode: m.mode === 'story' ? 'story' : 'normal', traitorId: session.isHost ? session.traitorId : null, skinwalker: !!m.sw, listener: !!m.ls,
    hunter: m.mode === 'hunt' && m.order?.includes(m.hunter) ? m.hunter : null,
    noLock: params.has('autostart'),
    onEnd: (r) => endRun(r),
  });
  session.game = game;
  if (m.mode === 'story') {
    showIntro(themeId, null, SIGNAL.intro);
    $('introKicker').textContent = 'Story';
    $('introName').textContent = SIGNAL.title;
  } else if (game.hunt.me) {
    showIntro(themeId, null, ['You are it.', 'They have 20 seconds. Then find them, and use their voices to bring them to you.']);
    $('introKicker').textContent = 'Hunt';
  } else if (game.hunt.on) {
    showIntro(themeId, null, ['One of you is not coming with you. It is already in here, somewhere, and it will use your voices.', 'Get the power back on, and get out.']);
    $('introKicker').textContent = 'Hunt';
  } else showIntro(themeId);
}

function backToLobby() {
  game?.dispose();
  game = null;
  if (session) session.game = null;
  document.exitPointerLock?.();
  openRoom();
  show('lobby');
  renderLobby();
}
$('btnToLobby').onclick = () => session?.backToLobby();

// An invite link (?join=CODE) goes straight to "Play with friends" after the voice check.
if (params.has('join') && !params.has('autostart')) {
  $('btnFriends').textContent = `Join room ${cleanCode(params.get('join'))}`;
}

// ---------- debug: ?autostart skips the menus (used for automated screenshots) ----------
if (params.has('autostart')) {
  (async () => {
    ensureAudio();
    if (!params.has('nomic')) await voice.start(ctx);
    if (params.has('tutorial')) startTutorial(); else startRun();
    show(null);
    game.begin();
    window.__game = game;
  })();
}
// For automated multiplayer tests.
window.__mimic = { get game() { return game; }, get session() { return session; } };
