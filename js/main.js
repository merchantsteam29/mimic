// Menus, settings, the voice check, rooms and lobbies, and starting / ending runs.
import * as THREE from 'three';
import { Game } from './game.js';
import { Sfx } from './sfx.js';
import { Samples } from './samples.js';
import { VHS } from './vhs.js';
import { Voice } from './voice.js';
import { THEMES } from './level.js';
import { grainDataUrl } from './textures.js';
import { Session } from './mp.js';
import { newCode, cleanCode, cleanName } from './net.js';
import { CLASSES, CLASS_ORDER } from './classes.js';
import { VERSION } from './version.js';
import { CHAPTERS, SIGNAL, storyProgress, finishChapter } from './story.js';

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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- settings ----------
const DEFAULTS = { mouse: 1, volume: 0.8, mic: 0.5, fov: 75 };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('mimic.settings') || '{}')); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem('mimic.settings', JSON.stringify(settings)); } catch { /* ignore */ } };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); // the camcorder pass renders the scene at VHS resolution anyway
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const vhs = new VHS(renderer);
document.body.classList.add('vhs');
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); vhs.resize(); game?.resize(); });

$('grain').style.backgroundImage = `url(${grainDataUrl()})`;

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
const voice = new Voice();
voice.setSensitivity(settings.mic);

function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    sfx = new Sfx(ctx);
    sfx.setVolume(settings.volume);
    sfx.samples = new Samples(ctx);
    sfx.samples.load(); // recorded sounds (CC0); synthesized ones stand in until they arrive
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

$('btnPlay').onclick = () => voiceCheck(() => { storyIdx = null; renderClassPick(); show('classes'); });
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
  const themeId = story ? story.theme : params.get('theme') in THEMES ? params.get('theme') : Math.random() < 0.5 ? 'facility' : 'house';
  const seed = story ? story.seed : params.has('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 2 ** 31);
  game = new Game({
    renderer, vhs, sfx, voice, settings, hud, themeId, seed, story, classes: { h: params.get('class') in CLASSES ? params.get('class') : myClass },
    noLock: params.has('autostart'),
    onEnd: (r) => endRun(r),
  });
  showIntro(themeId, story);
}

const lineText = (l) => (typeof l === 'string' ? l : l.text);

function showIntro(themeId, story = null, introLines = null) {
  $('introKicker').textContent = story ? `Chapter ${story.index + 1}` : THEMES[themeId].kicker;
  $('introName').textContent = story ? story.title : game.level.name;
  const lines = introLines || (story ? story.intro : ['The power is out. Get it back on, and get out.']);
  $('introText').innerHTML = lines.map((l) => `<p>${esc(lineText(l))}</p>`).join('');
  $('introWhisper').hidden = !!story;
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
  const live = game.state === 'playing' || game.state === 'spectate';
  if (!document.pointerLockElement && live && !game.paused) {
    game.pause();
    $('pauseClips').textContent = session
      ? 'The game keeps going while this menu is open.'
      : voice.clips.length ? `It has ${voice.clips.length} recording${voice.clips.length > 1 ? 's' : ''} of your voice.` : '';
    $('btnQuit').textContent = session ? 'Leave game' : 'Quit to menu';
    show('pause');
  } else if (document.pointerLockElement && game.paused) {
    show(null);
    game.resume();
  }
});

$('btnResume').onclick = () => lock();
// Clicking the game view while paused also resumes (handy after the browser's Esc cooldown).
renderer.domElement.addEventListener('click', () => {
  if (game && (game.state === 'playing' || game.state === 'spectate') && !document.pointerLockElement && !game.noLock) lock();
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
    const label = { out: 'Got out', dead: 'Taken', left: 'Left', alive: 'Taken' };
    $('endPlayers').innerHTML = r.results.map((p) =>
      `<li class="${p.status}"><span class="dot"></span>${esc(p.name)}${p.id === session?.id ? ' (you)' : ''}<span class="ptag">${label[p.status] || 'Taken'}</span></li>`).join('');
    $('endPlayers').hidden = false;
    $('btnAgain').hidden = true;
    $('btnToLobby').hidden = !session?.isHost;
    $('btnMenu').textContent = 'Leave';
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
  $('endStats').innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
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
}

$('btnInvite').onclick = async () => {
  const link = `${location.origin}${location.pathname}?join=${session?.code}`;
  try { await navigator.clipboard.writeText(link); $('btnInvite').textContent = 'Copied!'; }
  catch { prompt('Copy this invite link:', link); }
  setTimeout(() => { $('btnInvite').textContent = 'Copy invite link'; }, 1500);
};

$('btnStart').onclick = () => {
  if (!session?.isHost) return;
  const theme = params.get('theme') in THEMES ? params.get('theme') : Math.random() < 0.5 ? 'facility' : 'house';
  session.start(theme, Math.floor(Math.random() * 2 ** 31));
};

$('btnLeave').onclick = () => { leaveSession(); show('title'); };

function leaveSession() {
  const s = session;
  session = null;
  s?.dispose();
}

function startMpRun(m) {
  game?.dispose();
  const themeId = m.theme in THEMES ? m.theme : 'facility';
  game = new Game({
    renderer, vhs, sfx, voice, settings, hud, themeId, seed: Number(m.seed) >>> 0, mp: session, order: m.order, classes: m.classes || {},
    mode: m.mode === 'story' ? 'story' : 'normal', traitorId: session.isHost ? session.traitorId : null,
    noLock: params.has('autostart'),
    onEnd: (r) => endRun(r),
  });
  session.game = game;
  if (m.mode === 'story') {
    showIntro(themeId, null, SIGNAL.intro);
    $('introKicker').textContent = 'Story';
    $('introName').textContent = SIGNAL.title;
  } else showIntro(themeId);
}

function backToLobby() {
  game?.dispose();
  game = null;
  if (session) session.game = null;
  document.exitPointerLock?.();
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
    startRun();
    show(null);
    game.begin();
    window.__game = game;
  })();
}
// For automated multiplayer tests.
window.__mimic = { get game() { return game; }, get session() { return session; } };
