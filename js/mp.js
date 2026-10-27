// A multiplayer session: the room (net.js), voice chat (vc.js), and everyone's voice clips.
//
// Clips: whenever a player's mic produces a clip (voice.js), it's squeezed to 16 kHz 8-bit mu-law and
// sent to the host, which passes it on to everyone. So every browser holds every player's clips,
// and the host's mimic only has to say "play clip X" for everyone to hear it from the mimic.
// Clips go in small parts, one every PACE ms, so they never hold up the game's own messages (it's
// all one ordered channel: a whole clip in one message stalled everyone's movement for a second).
// Newcomers get the clips already shared (the newest few of each player's).
//
// Game messages: clients send intents to the host (HOST_TYPES); the host runs the world and
// broadcasts what happened. The Game handles both sides (hostHandle / onNet).
import { Net } from './net.js';
import { VoiceChat } from './vc.js';
import { CLASSES } from './classes.js';
import { cleanLook } from './look.js';

const HOST_TYPES = new Set(['st', 'noise', 'take', 'insert', 'escaped', 'work', 'bang', 'smash', 'unlock', 'lever', 'flare', 'rescue', 'sniffRes', 'door', 'trapped', 'fakeDone', 'jam', 'sab', 'accuse', 'ballot', 'mst', 'bite', 'msay', 'mlight', 'chat', 'haunt', 'radio', 'recDrop', 'sig', 'revive', 'throw', 'camFlash', 'keypad', 'callLift', 'answer', 'lanternTake', 'spkPut', 'spkPlay', 'cross', 'mark', 'wedge']);
const CLIP_RATE = 16000;
const PART = 8000;        // bytes per part (half a second)
const PACE = 45;          // ms between parts
const KEEP = 30;          // clips kept per player (the oldest go)
const CATCH_UP = 12;      // clips per player sent to a newcomer

// mu-law: 8 bits a sample, and quiet sounds keep their detail.
const MU = 255, LOG_MU = Math.log1p(MU);
const UNMU = new Float32Array(256);
for (let b = 0; b < 256; b++) { const x = (Math.pow(1 + MU, (b & 0x7f) / 127) - 1) / MU; UNMU[b] = b & 0x80 ? -x : x; }

function encodeClip(buffer) {
  const src = buffer.getChannelData(0), ratio = buffer.sampleRate / CLIP_RATE;
  const n = Math.min(Math.floor(src.length / ratio), CLIP_RATE * 10), out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = src[Math.floor(i * ratio)];
    out[i] = (v < 0 ? 0x80 : 0) | Math.round((Math.log1p(MU * Math.min(1, Math.abs(v))) / LOG_MU) * 127);
  }
  return out;
}
const bytesOf = (v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null);

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
    this.clips = new Map(); // key -> { buffer, owner, plays, data (encoded, to pass on to newcomers) }
    this.clipQ = [];        // parts waiting to go: { m, to (an id, or null = everyone), except }
    this.partial = new Map(); // key -> { owner, of, got, parts } while a clip arrives
    this.known = new Set();   // host: who has been sent the clips so far
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
    this.mother = false;     // Normal mode only: the huge thing that sings in your voices
    this.caller = false;     // Normal mode only: phones that ring with the voices of the taken
    this.map = 'random';     // the host's pick of building (a theme id), or a new random one each game
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
      if (this.isHost) { this.sendMode(); this.catchUp(r); } // newcomers learn the mode, and get the clips so far
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
    for (const c of this.voice.clips.slice(-20)) this.shareClip(c);
    this.voice.onClip = (c) => this.shareClip(c);
    this.clipT = setInterval(() => this.pumpClips(), PACE);
    // Lobby voice: everyone hears everyone, flat. During a game the Game routes voices instead.
    this.lobbyT = setInterval(() => {
      if (this.game) return;
      for (const r of this.roster) if (r.id !== this.id) this.vc.route(r.id, { on: true });
    }, 200);
  }

  shareClip(clip) {
    const key = `${this.id}:${this.myClips++}`;
    clip.key = key; // (the tape recorder sends it by this name)
    const data = encodeClip(clip.buffer);
    this.addClip(key, { buffer: clip.buffer, owner: this.id, plays: 0, data });
    this.queueClip(key, this.id, data, null, null);
  }

  // Cut a clip into parts and queue them (to: one player, or null for everyone; except: not to them).
  queueClip(key, owner, data, to, except) {
    const of = Math.max(1, Math.ceil(data.length / PART));
    for (let n = 0; n < of; n++) this.clipQ.push({ m: { t: 'clip', key, owner, n, of, pcm: data.slice(n * PART, (n + 1) * PART) }, to, except });
    if (this.clipQ.length > 600) this.clipQ.splice(0, this.clipQ.length - 600); // hopelessly behind: drop the oldest
  }

  pumpClips() {
    const q = this.clipQ.shift();
    if (!q) return;
    if (!this.isHost) this.net.send(q.m);
    else if (q.to) this.net.sendTo(q.to, q.m);
    else this.net.broadcast(q.m, { except: q.except, self: false });
  }

  // Host: anyone new (or back) gets the clips they don't have yet.
  catchUp(roster) {
    for (const id of this.known) if (!roster.some((r) => r.id === id)) this.known.delete(id);
    for (const r of roster) {
      if (r.id === this.id || this.known.has(r.id)) continue;
      this.known.add(r.id);
      const byOwner = new Map();
      for (const [key, c] of this.clips) if (c.owner !== r.id && c.data) (byOwner.get(c.owner) || byOwner.set(c.owner, []).get(c.owner)).push([key, c]);
      for (const list of byOwner.values()) for (const [key, c] of list.slice(-CATCH_UP)) this.queueClip(key, c.owner, c.data, r.id, null);
    }
  }

  addClip(key, c) {
    this.clips.set(key, c);
    const mine = [...this.clips.keys()].filter((k) => this.clips.get(k).owner === c.owner);
    for (const k of mine.slice(0, Math.max(0, mine.length - KEEP))) this.clips.delete(k);
  }

  // A part of someone's clip arrived. When it's all here, it becomes a clip.
  receiveClip(m) {
    const bytes = bytesOf(m.pcm), of = m.of | 0, n = m.n | 0, key = String(m.key);
    if (this.clips.has(key) || !bytes || of < 1 || of > 30 || n < 0 || n >= of) return;
    let a = this.partial.get(key);
    if (!a) {
      if (this.partial.size > 40) this.partial.delete(this.partial.keys().next().value);
      this.partial.set(key, a = { owner: String(m.owner), of, got: 0, parts: [] });
    }
    if (a.parts[n]) return;
    a.parts[n] = bytes.slice();
    if (++a.got < a.of) return;
    this.partial.delete(key);
    const len = a.parts.reduce((t, b) => t + (b?.length || 0), 0);
    if (!len || len > CLIP_RATE * 10) return;
    const data = new Uint8Array(len);
    let at = 0;
    for (const b of a.parts) { data.set(b, at); at += b.length; }
    const buffer = this.sfx.ctx.createBuffer(1, len, CLIP_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = UNMU[data[i]];
    this.addClip(key, { buffer, owner: a.owner, plays: 0, data });
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
      if (this.isHost && from !== 'h') { // pass it on (paced, like our own)
        m.owner = from;
        const bytes = bytesOf(m.pcm);
        if (bytes && String(m.key).startsWith(`${from}:`)) this.clipQ.push({ m: { ...m, pcm: bytes.slice() }, to: null, except: from });
      }
      if (!this.isHost || String(m.key).startsWith(`${from}:`)) this.receiveClip(m);
      return;
    }
    if (m.t === 'start') { this.net.locked = true; this.lastStart = m; this.onStart(m); return; }
    if (m.t === 'mode') { if (from === 'h') { this.mode = ['story', 'hunt', 'versus', 'nights', 'hide', 'escort'].includes(m.mode) ? m.mode : 'normal'; this.night = Math.max(1, Math.min(99, m.night | 0)); this.skinwalker = !!m.sw; this.listener = !!m.ls; this.stalker = !!m.sk; this.shadow = !!m.sd; this.double = !!m.db; this.caller = !!m.cl; this.mother = !!m.mo; this.map = typeof m.map === 'string' ? m.map : 'random'; this.custom = cleanCustom(m.cs); this.difficulty = ['easy', 'nightmare'].includes(m.diff) ? m.diff : 'normal'; this.onRoster(this.roster); } return; }
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
    // Escort: who carries the lantern first.
    const lantern = this.mode === 'escort' ? ids[Math.floor(Math.random() * ids.length)] : null;
    // Versus: shuffle everyone into two teams.
    let teams = null;
    if (this.mode === 'versus' && ids.length > 1) {
      const sh = ids.slice();
      for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
      teams = Object.fromEntries(sh.map((id, i) => [id, i % 2]));
    }
    this.net.broadcast({ t: 'start', theme, seed, order: ids, classes, mode: hunter ? 'hunt' : teams ? 'versus' : ['hunt', 'versus'].includes(this.mode) ? 'normal' : this.mode, teams, sw: this.mode === 'normal' && this.skinwalker, ls: this.mode === 'normal' && this.listener, sk: this.mode === 'normal' && this.stalker, sd: this.mode === 'normal' && this.shadow, db: this.mode === 'normal' && this.double, cl: this.mode === 'normal' && this.caller, mo: this.mode === 'normal' && this.mother, hunter, lantern, diff: this.difficulty, cs: this.custom, night: this.mode === 'nights' ? this.night : 0 });
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
    this.mode = ['story', 'hunt', 'versus', 'nights', 'hide', 'escort'].includes(mode) ? mode : 'normal';
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
  sendMode() { this.net.broadcast({ t: 'mode', mode: this.mode, night: this.night, sw: this.skinwalker, ls: this.listener, sk: this.stalker, sd: this.shadow, db: this.double, cl: this.caller, mo: this.mother, map: this.map, diff: this.difficulty, cs: this.custom }, { self: false }); }

  setMap(id) {
    if (!this.isHost) return;
    this.map = typeof id === 'string' ? id : 'random';
    this.sendMode();
    this.onRoster(this.roster);
  }

  setCaller(on) {
    if (!this.isHost) return;
    this.caller = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

  setMother(on) {
    if (!this.isHost) return;
    this.mother = !!on;
    this.sendMode();
    this.onRoster(this.roster);
  }

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
    clearInterval(this.clipT);
    if (this.voice.onClip) this.voice.onClip = null;
    this.vc?.dispose();
    this.net.destroy();
  }
}
