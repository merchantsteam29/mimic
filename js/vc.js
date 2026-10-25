// Voice chat: a WebRTC call between every pair of players in the room (at most 4, so at most 3
// calls each), on the same PeerJS peer as the room. Every incoming voice goes through Web Audio, so
// the game can place it in the world (proximity chat through a positional emitter) or cut it.
//
// Routing is decided by the listener each frame (route()): in the lobby everyone is 2D; in a game
// the living only hear the living, positionally; the dead hear everyone.

export class VoiceChat {
  constructor(net, sfx, micStream) {
    this.net = net;
    this.sfx = sfx;
    const ctx = sfx.ctx;
    // Players without a mic still join calls, with a silent stream.
    this.stream = micStream || ctx.createMediaStreamDestination().stream;
    this.calls = new Map(); // peer id -> entry
    this.closed = false;
    net.peer.on('call', (call) => this.answer(call));
  }

  // Call everyone in the roster we aren't connected to. Only one side of each pair calls.
  sync(roster) {
    if (this.closed) return;
    const mine = this.net.peer.id;
    const peers = new Set(roster.map((r) => r.peer));
    for (const [peerId, e] of this.calls) if (!peers.has(peerId)) { this.drop(e); this.calls.delete(peerId); }
    for (const r of roster) {
      if (r.peer === mine || this.calls.has(r.peer) || !(mine < r.peer)) continue;
      const call = this.net.peer.call(r.peer, this.stream);
      if (call) this.setup(call);
    }
  }

  answer(call) {
    if (this.closed || !this.net.roster.some((r) => r.peer === call.peer)) { call.close(); return; }
    const old = this.calls.get(call.peer);
    if (old) this.drop(old);
    call.answer(this.stream);
    this.setup(call);
  }

  setup(call) {
    const ctx = this.sfx.ctx;
    const e = { call, peer: call.peer, gain: ctx.createGain(), flat: ctx.createGain(), pos: ctx.createGain(), emitter: this.sfx.emitter(), level: () => 0 };
    e.gain.gain.value = 0;
    e.gain.connect(e.flat).connect(this.sfx.master);
    e.gain.connect(e.pos).connect(e.emitter.input);
    this.calls.set(call.peer, e);
    call.on('stream', (remote) => {
      if (e.src) return;
      // Chrome only feeds a remote WebRTC stream into Web Audio while a media element plays it.
      e.audio = new Audio();
      e.audio.srcObject = remote;
      e.audio.muted = true;
      e.audio.play().catch(() => {});
      e.src = ctx.createMediaStreamSource(remote);
      e.src.connect(e.gain);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      e.src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      e.level = () => {
        an.getByteTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
        return Math.sqrt(s / buf.length);
      };
    });
    const gone = () => {
      if (this.calls.get(call.peer) !== e) return;
      this.drop(e);
      this.calls.delete(call.peer);
      setTimeout(() => this.sync(this.net.roster), 2500); // a blip: call again if they're still here
    };
    call.on('close', gone);
    call.on('error', gone);
  }

  drop(e) {
    try { e.call.close(); } catch { /* already closed */ }
    try { e.src?.disconnect(); e.gain.disconnect(); e.flat.disconnect(); e.pos.disconnect(); } catch { /* ignore */ }
    e.emitter.dispose();
    if (e.audio) { e.audio.pause(); e.audio.srcObject = null; }
  }

  entryFor(playerId) {
    const peer = this.net.roster.find((r) => r.id === playerId)?.peer;
    return peer ? this.calls.get(peer) : null;
  }

  // How a player's voice reaches me. opts: { on, pos: {x,y,z} | null (2D), volume, occluded }
  route(playerId, { on, pos = null, volume = 1, occluded = false }) {
    const e = this.entryFor(playerId);
    if (!e) return;
    const now = this.sfx.now;
    // Cutting a voice is instant (no fade), so a scream never gets through.
    if (!on) { e.gain.gain.cancelScheduledValues(now); e.gain.gain.setValueAtTime(0, now); return; }
    e.gain.gain.setTargetAtTime(volume, now, 0.05);
    e.flat.gain.value = pos ? 0 : 1;
    e.pos.gain.value = pos ? 1 : 0;
    if (pos) { e.emitter.setPos(pos.x, pos.y, pos.z); e.emitter.setOcclusion(occluded); }
  }

  talking(playerId) { return (this.entryFor(playerId)?.level() || 0) > 0.03; }

  dispose() {
    this.closed = true;
    for (const e of this.calls.values()) this.drop(e);
    this.calls.clear();
  }
}
