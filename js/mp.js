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

const HOST_TYPES = new Set(['st', 'noise', 'take', 'insert', 'escaped', 'work', 'bang', 'smash', 'unlock', 'lever', 'flare', 'rescue', 'sniffRes', 'door', 'trapped', 'fakeDone', 'jam', 'sab', 'accuse', 'ballot']);
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
    this.mode = 'normal';   // or 'story' (The Signal: maybe a traitor)
    this.traitorId = null;  // host only
    this.onRoster = () => {};
    this.onStart = () => {};   // ({ seed, theme, order })
    this.onLobby = () => {};   // host sent everyone back to the lobby
    this.onClose = () => {};   // (reason)
    this.net.onRoster = (r) => {
      this.vc?.sync(r);
      if (this.isHost) this.net.broadcast({ t: 'mode', mode: this.mode }, { self: false }); // newcomers learn the mode
      this.onRoster(r);
    };
    this.net.onClose = (why) => { this.dispose(); this.onClose(why); };
    this.net.onMessage = (m, from) => this.handle(m, from);
  }

  get isHost() { return this.net.isHost; }
  get id() { return this.net.id; }
  get roster() { return this.net.roster; }
  get code() { return this.net.code; }

  async host(code, name) { await this.net.host(code, name); this.ready(); }
  async join(code, name) { await this.net.join(code, name); this.ready(); }

  ready() {
    this.vc = new VoiceChat(this.net, this.sfx, this.voice.stream);
    this.vc.sync(this.net.roster);
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
    if (m.t === 'start') { this.net.locked = true; this.onStart(m); return; }
    if (m.t === 'mode') { if (from === 'h') { this.mode = m.mode === 'story' ? 'story' : 'normal'; this.onRoster(this.roster); } return; }
    if (m.t === 'role') { if (from === 'h') this.game?.traitor.onNet(m); return; }
    if (m.t === 'class') { // a player picked a class (host keeps it in the roster)
      const r = this.isHost && this.roster.find((x) => x.id === from);
      if (r && CLASSES[m.c]) { r.cls = m.c; this.net.sendRoster(); }
      return;
    }
    if (m.t === 'lobby') { this.net.locked = false; this.onLobby(); return; }
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
    this.net.broadcast({ t: 'start', theme, seed, order: ids, classes, mode: this.mode });
    if (this.traitorId && this.traitorId !== 'h') this.net.sendTo(this.traitorId, { t: 'role', traitor: true });
  }

  setMode(mode) {
    if (!this.isHost) return;
    this.mode = mode === 'story' ? 'story' : 'normal';
    this.net.broadcast({ t: 'mode', mode: this.mode }, { self: false });
    this.onRoster(this.roster);
  }

  setClass(c) {
    if (!CLASSES[c]) return;
    if (this.isHost) { const r = this.roster.find((x) => x.id === this.id); if (r) { r.cls = c; this.net.sendRoster(); } }
    else this.net.send({ t: 'class', c });
  }
  backToLobby() { this.net.broadcast({ t: 'lobby' }); }

  dispose() {
    clearInterval(this.lobbyT);
    if (this.voice.onClip) this.voice.onClip = null;
    this.vc?.dispose();
    this.net.destroy();
  }
}
