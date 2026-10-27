// A multiplayer session: the room (net.js), voice chat (vc.js), and everyone's voice clips.
//
// Clips: whenever a player's mic produces a clip (voice.js), it's squeezed to 16 kHz 16-bit and
// sent to the host, which passes it on to everyone. So every browser holds every player's clips,
// and the host's mimic only has to say "play clip X" for everyone to hear it from the mimic.
//
// Game messages: clients send intents to the host (HOST_TYPES); the host runs the world and
// broadcasts what happened. The Game handles both sides (hostHandle / onNet).
import { Net } from './net.js';
import { VoiceChat } from './vc.js';
import { CLASSES } from './classes.js';
import { cleanLook } from './look.js';

const HOST_TYPES = new Set(['st', 'noise', 'take', 'insert', 'escaped', 'work', 'bang', 'smash', 'unlock', 'lever', 'flare', 'rescue', 'sniffRes', 'door', 'trapped', 'fakeDone', 'jam', 'sab', 'accuse', 'ballot', 'mst', 'bite', 'msay', 'mlight', 'chat', 'haunt', 'radio', 'recDrop', 'sig', 'revive', 'throw', 'camFlash']);
const CLIP_RATE = 16000;

function encodeClip(buffer) {
  const src = buffer.getChannelData(0), ratio = buffer.sampleRate / CLIP_RATE;
  const n = Math.floor(src.length / ratio), out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = src[Math.floor(i * ratio)];
    out[i] = Math.max(-1, Math.min(1, s)) * 32767;
  }
  return out.buffer;
}

// The host's game settings, checked (they arrive over the network).
const CHOICES = { voices: ['nearby', 'everywhere'], dark: ['light', 'normal', 'dark'], jobs: ['short', 'normal', 'long'], battery: ['plenty', 'normal', 'scarce'], speed: ['slow', 'normal', 'fast'] };
export function cleanCustom(c = {}) {
  const out = { events: c?.events !== false };
  for (const [k, v] of Object.entries(CHOICES)) out[k] = v.includes(c?.[k]) ? c[k] : v.includes('normal') ? 'normal' : v[0];
  return out;
}

export class Session {
  constructor({ sfx, voice }) {
    this.sfx = sfx;
    this.voice = voice;
    this.net = new Net();
    this.vc = null;
    this.clips = new Map(); // key -> { buffer, owner, plays }
    this.myClips = 0;
    this.lastKey = null;
    this.game = null;
    this.mode = 'normal';   // or 'story' (The Signal: maybe a traitor), or 'hunt' (one of you is the mimic)
    this.skinwalker = false; // Normal mode only: something that wears a living friend
    this.listener = false;   // Normal mode only: the blind thing that hunts by sound
    this.difficulty = 'normal';
    this.stalker = false;    // Normal mode only: the thing that only moves when nobody's looking
    this.shadow = false;     // Normal mode only: the thing that lives in the dark
    this.double = false;     // Normal mode only: the thing that walks where you walked
    this.night = 1;          // Night Shift: the night you're on (the host moves it on when anyone lasts one)
    this.custom = { voices: 'nearby', dark: 'normal', jobs: 'normal', events: true, battery: 'normal', speed: 'normal' }; // the host's game settings
    this.traitorId = null;  // host only
    this.onRoster = () => {};
    this.onStart = () => {};   // ({ seed, theme, order })
    this.onLobby = () => {};   // host sent everyone back to the lobby
    this.onClose = () => {};   // (reason)
    this.wire();
  }

  wire() {
    this.net.onRoster = (r) => {
      this.vc?.sync(r);
      if (this.isHost) this.sendMode(); // newcomers learn the mode
      this.onRoster(r);
    };
    this.net.onClose = (why) => this.dropped(why);
    this.net.onMessage = (m, from) => this.handle(m, from);
    // Host: someone came back mid-game. Give them the game again, everything that happened since, and where they were.
    this.net.onRejoin = (id) => {
      if (!this.lastStart) return;
      this.net.sendTo(id, this.lastStart);
      for (const m of this.game?.log || []) this.net.sendTo(id, m);
      this.net.sendTo(id, { t: 'resume', ...this.game?.resumeFor(id) });
    };
  }

  // Lost the host. During a game, try to get back in for a while before giving up.
  async dropped(why) {
    if (this.isHost || !this.game || this.game.room || !this.net.secret || this.closing) { this.dispose(); this.onClose(why); return; }
    const old = this.net, code = old.code, name = old.roster.find((r) => r.id === old.id)?.name || 'Player', rejoin = { id: old.id, secret: old.secret };
    this.onRejoining?.(true);
    this.vc?.dispose(); this.vc = null;
    for (let tries = 0; tries < 8 && !this.closing; tries++) {
      await new Promise((r) => setTimeout(r, tries ? 4000 : 1000));
      const net = new Net();
      try {
        await net.join(code, name, rejoin);
        this.net = net;
        this.wire();
        this.ready(true);
        this.onRejoining?.(false);
        return;
      } catch { net.destroy(); }
    }
    this.onRejoining?.(false);
    this.dispose();
    this.onClose(why);
  }

  get isHost() { return this.net.isHost; }
  get id() { return this.net.id; }
  get roster() { return this.net.roster; }
  get code() { return this.net.code; }

  async host(code, name) { await this.net.host(code, name); this.ready(); }
  async join(code, name) { await this.net.join(code, name); this.ready(); }

  ready(again = false) {
    this.vc = new VoiceChat(this.net, this.sfx, this.voice.stream);
    this.onVoiceChat?.(this.vc);
    this.vc.sync(this.net.roster);
    if (again) return; // back after a drop: everything else is still set up
    // Share every clip I already have (the voice check), then new ones as they come.
    for (const c of this.voice.clips) this.shareClip(c);
    this.voice.onClip = (c) => this.shareClip(c);
    // Lobby voice: everyone hears everyone, flat. During a game the Game routes voices instead.
    this.lobbyT = setInterval(() => {
      if (this.game) return;
      for (const r of this.roster) if (r.id !== this.id) this.vc.route(r.id, { on: true });
    }, 200);
  }

  shareClip(clip) {
    const key = `${this.id}:${this.myClips++}`;
    clip.key = key; // (the tape recorder sends it by this name)
    this.clips.set(key, { buffer: clip.buffer, owner: this.id, plays: 0 });
    const m = { t: 'clip', key, owner: this.id, pcm: encodeClip(clip.buffer) };
    if (this.isHost) this.net.broadcast(m, { self: false });
    else this.net.send(m);
  }

  receiveClip(m) {
    if (this.clips.has(m.key) || !(m.pcm instanceof ArrayBuffer)) return;
    const pcm = new Int16Array(m.pcm);
    if (!pcm.length || pcm.length > CLIP_RATE * 10) return;
    const buffer = this.sfx.ctx.createBuffer(1, pcm.length, CLIP_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    this.clips.set(m.key, { buffer, owner: String(m.owner), plays: 0 });
  }

  // The mimic's choice of voice: mostly the dead (if anyone is), rarely-played clips first.
  // prefer: a player whose voice it wants (the one it's wearing).
  pickKey(isDead, prefer = null) {
    const keys = [...this.clips.keys()];
    if (!keys.length) return null;
    const anyDead = keys.some((k) => isDead(this.clips.get(k).owner));
    const w = keys.map((k) => {
      const c = this.clips.get(k);
      let v = 1 / (1 + c.plays * 1.5);
      if (anyDead) v *= isDead(c.owner) ? 6 : 0.5;
      if (prefer && c.owner === prefer) v *= 20;
      if (k === this.lastKey && keys.length > 1) v = 0;
      return v;
    });
    let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < keys.length - 1 && (r -= w[i]) > 0) i++;
    this.lastKey = keys[i];
    this.clips.get(keys[i]).plays++;
    return keys[i];
  }

  // ---------- messages ----------
  handle(m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'clip') {
      if (this.isHost && from !== 'h') { m.owner = from; this.net.broadcast(m, { except: from, self: false }); }
      this.receiveClip(m);
      return;
    }
    if (m.t === 'start') { this.net.locked = true; this.lastStart = m; this.onStart(m); return; }
    if (m.t === 'mode') { if (from === 'h') { this.mode = ['story', 'hunt', 'versus', 'nights'].includes(m.mode) ? m.mode : 'normal'; this.night = Math.max(1, Math.min(99, m.night | 0)); this.skinwalker = !!m.sw; this.listener = !!m.ls; this.stalker = !!m.sk; this.shadow = !!m.sd; this.double = !!m.db; this.custom = cleanCustom(m.cs); this.difficulty = ['easy', 'nightmare'].includes(m.diff) ? m.diff : 'normal'; this.onRoster(this.roster); } return; }
    if (m.t === 'role') { if (from === 'h') this.game?.traitor.onNet(m); return; }
    if (m.t === 'look') { // a player changed their look (host keeps it in the roster)
      const r = this.isHost && this.roster.find((x) => x.id === from);
      if (r) { r.look = cleanLook(m.look); this.net.sendRoster(); }
      return;
    }
    if (m.t === 'class') { // a player picked a class (host keeps it in the roster)
      const r = this.isHost && this.roster.find((x) => x.id === from);
      if (r && CLASSES[m.c]) { r.cls = m.c; this.net.sendRoster(); }
      return;
    }
    if (m.t === 'lobby') { this.net.locked = false; this.lastStart = null; this.onLobby(); return; }
    if (this.isHost && HOST_TYPES.has(m.t)) this.game?.hostHandle(m, from);
    else if (this.isHost && m.t === 'quit') { if (from === 'h') this.game?.hostHandle(m, from); }
    else if (!HOST_TYPES.has(m.t)) this.game?.onNet(m);
  }

  send(m) { this.net.send(m); }
  broadcast(m) { this.net.broadcast(m); }

  start(theme, seed) {
    const classes = Object.fromEntries(this.roster.map((r) => [r.id, CLASSES[r.cls] ? r.cls : 'runner']));
    // Story mode: half the time, one of you is secretly working for it. Only they are told.
    const ids = this.roster.map((r) => r.id);
    this.traitorId = this.mode === 'story' && ids.length > 1 && Math.random() < 0.5 ? ids[Math.floor(Math.random() * ids.length)] : null;
    // Hunt: one of you is the mimic (it needs someone to hunt).
    const hunter = this.mode === 'hunt' && ids.length > 1 ? ids[Math.floor(Math.random() * ids.length)] : null;
    // Versus: shuffle everyone into two teams.
    let teams = null;
    if (this.mode === 'versus' && ids.length > 1) {
      const sh = ids.slice();
      for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      teams = Object.fromEntries(sh.map((id, i) => [id, i % 2]));
    }
    this.net.broadcast({ t: 'start', theme, seed, order: ids, classes, mode: hunter ? 'hunt' : teams ? 'versus' : ['hunt', 'versus'].includes(this.mode) ? 'normal' : this.mode, teams, sw: this.mode === 'normal' && this.skinwalker, ls: this.mode === 'normal' && this.listener, sk: this.mode === 'normal' && this.stalker, sd: this.mode === 'normal' && this.shadow, db: this.mode === 'normal' && this.double, hunter, diff: this.difficulty, cs: this.custom, night: this.mode === 'nights' ? this.night : 0 });
    if (this.traitorId && this.traitorId !== 'h') this.net.sendTo(this.traitorId, { t: 'role', traitor: true });
  }

  // Night Shift: after a night, the next one (someone lasted) or back to the first.
  setNight(n) {
    if (!this.isHost) return;
    this.night = Math.max(1, Math.min(99, n | 0));
    this.sendMode();
    this.onRoster(this.roster);
  }

  setMode(mode) {
    if (!this.isHost) return;
    this.mode = ['story', 'hunt', 'versus', 'nights'].includes(mode) ? mode : 'normal';
    this.sendMode();
    this.onRoster(this.roster);
  }

  setSkinwalker(on) {
    if (!this.isHost) return;
    this.skinwalker = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

  setLook(look) {
    const l = cleanLook(look);
    if (this.isHost) { const r = this.roster.find((x) => x.id === this.id); if (r) { r.look = l; this.net.sendRoster(); } }
    else this.net.send({ t: 'look', look: l });
  }

  setClass(c) {
    if (!CLASSES[c]) return;
    if (this.isHost) { const r = this.roster.find((x) => x.id === this.id); if (r) { r.cls = c; this.net.sendRoster(); } }
    else this.net.send({ t: 'class', c });
  }
  setListener(on) {
    if (!this.isHost) return;
    this.listener = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

  setDifficulty(d) {
    if (!this.isHost) return;
    this.difficulty = ['easy', 'nightmare'].includes(d) ? d : 'normal';
    this.sendMode();
    this.onRoster(this.roster);
  }

  // The lobby's settings, to everyone else.
  sendMode() { this.net.broadcast({ t: 'mode', mode: this.mode, night: this.night, sw: this.skinwalker, ls: this.listener, sk: this.stalker, sd: this.shadow, db: this.double, diff: this.difficulty, cs: this.custom }, { self: false }); }

  setDouble(on) {
    if (!this.isHost) return;
    this.double = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

  setShadow(on) {
    if (!this.isHost) return;
    this.shadow = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

  setCustom(key, value) {
    if (!this.isHost) return;
    this.custom = cleanCustom({ ...this.custom, [key]: value });
    this.sendMode();
    this.onRoster(this.roster);
  }

  setStalker(on) {
    if (!this.isHost) return;
    this.stalker = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

  backToLobby() { this.lastStart = null; this.net.broadcast({ t: 'lobby' }); }

  dispose() {
    this.closing = true;
    clearInterval(this.lobbyT);
    if (this.voice.onClip) this.voice.onClip = null;
    this.vc?.dispose();
    this.net.destroy();
  }
}
