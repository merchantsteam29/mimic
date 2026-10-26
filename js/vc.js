// Voice chat: a WebRTC call between every pair of players in the room (at most 4, so at most 3
// calls each), on the same PeerJS peer as the room.
//
// Two ways to play a friend's voice (Settings > Friends' voices):
//   clear (default) - the browser plays the call itself, like a video call: the best quality, and echo
//                     cancellation works. Distance only changes the volume.
//   3d              - through Web Audio, placed in the world (left / right, muffled through walls).
// The walkie-talkie always goes through Web Audio (it's meant to sound broken up).
// Routing is decided by the listener each frame (route()).

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Ask for better Opus: a higher bitrate and forward error correction, so lost packets don't turn robotic.
function betterAudio(sdp) {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  const line = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  const extra = 'maxaveragebitrate=64000;useinbandfec=1;usedtx=0;stereo=0';
  return line.test(sdp) ? sdp.replace(line, (m, p) => `a=fmtp:${pt} ${p.split(';').filter((k) => !/^(maxaveragebitrate|useinbandfec|usedtx|stereo)=/.test(k)).concat(extra).join(';')}`)
    : sdp.replace(new RegExp(`(a=rtpmap:${pt} opus/48000[^\\r\\n]*)`), `$1\r\na=fmtp:${pt} ${extra}`);
}

export class VoiceChat {
  constructor(net, sfx, micStream) {
    this.net = net;
    this.sfx = sfx;
    this.mode = 'clear';  // set from settings (main.js)
    this.volume = 1;      // friends' voices, 0..1.5
    const ctx = sfx.ctx;
    // Players without a mic still join calls, with a silent stream.
    this.stream = micStream || ctx.createMediaStreamDestination().stream;
    this.calls = new Map(); // peer id -> entry
    this.closed = false;
    net.peer.on('call', (call) => this.answer(call));
    // Phones won't start a voice playing without a tap: retry on the next one.
    this.unlock = () => { for (const e of this.calls.values()) e.audio?.play().catch(() => {}); };
    addEventListener('pointerdown', this.unlock);
    addEventListener('keydown', this.unlock);
  }

  // Call everyone in the roster we aren't connected to. Only one side of each pair calls.
  sync(roster) {
    if (this.closed) return;
    const mine = this.net.peer.id;
    const peers = new Set(roster.map((r) => r.peer));
    for (const [peerId, e] of this.calls) if (!peers.has(peerId)) { this.drop(e); this.calls.delete(peerId); }
    for (const r of roster) {
      if (r.peer === mine || this.calls.has(r.peer) || !(mine < r.peer)) continue;
      const call = this.net.peer.call(r.peer, this.stream, { sdpTransform: betterAudio });
      if (call) this.setup(call);
    }
  }

  answer(call) {
    if (this.closed || !this.net.roster.some((r) => r.peer === call.peer)) { call.close(); return; }
    const old = this.calls.get(call.peer);
    if (old) this.drop(old);
    call.answer(this.stream, { sdpTransform: betterAudio });
    this.setup(call);
  }

  setup(call) {
    const ctx = this.sfx.ctx;
    const e = { call, peer: call.peer, level: () => 0 };
    // 3D: gain -> muffle (walls) -> panner (direction only; distance is in the gain) -> the voice bus.
    e.gain = ctx.createGain(); e.gain.gain.value = 0;
    e.muffle = ctx.createBiquadFilter(); e.muffle.type = 'lowpass'; e.muffle.frequency.value = 16000;
    e.pan = new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'linear', refDistance: 1, maxDistance: 10000, rolloffFactor: 0 });
    e.gain.connect(e.muffle).connect(e.pan).connect(this.sfx.voiceBus);
    // The walkie-talkie: thin, boxy and a little broken up.
    e.radio = ctx.createGain(); e.radio.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 8;
    const ws = ctx.createWaveShaper(); ws.curve = this.sfx.radioCurve();
    e.radio.connect(hp).connect(pk).connect(lp).connect(ws).connect(this.sfx.voiceBus);
    e.nodes = [e.gain, e.muffle, e.pan, e.radio, hp, lp, pk, ws];
    this.calls.set(call.peer, e);
    call.on('stream', (remote) => {
      if (e.src) return;
      // The call plays through an <audio> element (clear mode), which Chrome also needs in order to feed
      // the stream into Web Audio at all (3D mode and the radio).
      e.audio = new Audio();
      e.audio.srcObject = remote;
      e.audio.volume = 0;
      e.audio.play().catch(() => {});
      e.src = ctx.createMediaStreamSource(remote);
      e.src.connect(e.gain);
      e.src.connect(e.radio);
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
    try { e.src?.disconnect(); for (const n of e.nodes) n.disconnect(); } catch { /* ignore */ }
    if (e.audio) { e.audio.pause(); e.audio.srcObject = null; }
  }

  entryFor(playerId) {
    const peer = this.net.roster.find((r) => r.id === playerId)?.peer;
    return peer ? this.calls.get(peer) : null;
  }

  // How a player's voice reaches me. opts: { on, pos: {x,y,z} | null (2D), volume, occluded, radio (over the walkie-talkie) }
  route(playerId, { on, pos = null, volume = 1, occluded = false, radio = false }) {
    const e = this.entryFor(playerId);
    if (!e) return;
    const now = this.sfx.now, v = on ? clamp(volume, 0, 1) * this.volume : 0;
    const web = radio || (this.mode === '3d' && on);
    // Clear: the <audio> element plays it. Cutting a voice is instant (no fade), so a scream never gets through.
    if (e.audio) {
      e.audio.muted = web || !on;
      if (!web) e.audio.volume = clamp(v * (occluded ? 0.75 : 1), 0, 1);
    }
    if (!on || !web || radio) { e.gain.gain.cancelScheduledValues(now); e.gain.gain.setValueAtTime(0, now); }
    if (!on) { e.radio.gain.cancelScheduledValues(now); e.radio.gain.setValueAtTime(0, now); return; }
    e.radio.gain.setTargetAtTime(radio ? 1.6 * this.volume : 0, now, 0.03);
    if (!web || radio) return;
    // 3D.
    e.gain.gain.setTargetAtTime(v * 1.6, now, 0.05);
    e.muffle.frequency.setTargetAtTime(occluded ? 2200 : 16000, now, 0.08);
    const p = pos || this.sfx.listenerPos();
    e.pan.positionX.value = p.x; e.pan.positionY.value = p.y; e.pan.positionZ.value = p.z;
  }

  talking(playerId) { return (this.entryFor(playerId)?.level() || 0) > 0.03; }

  dispose() {
    this.closed = true;
    removeEventListener('pointerdown', this.unlock);
    removeEventListener('keydown', this.unlock);
    for (const e of this.calls.values()) this.drop(e);
    this.calls.clear();
  }
}
