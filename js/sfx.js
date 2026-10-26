// All game audio, synthesized with Web Audio (no sound files). Positional sounds go through an
// "emitter" (lowpass for walls in the way -> HRTF panner). playVoice() is the mimic's voice: it
// replays the player's own clips through a slightly wrong-sounding chain.
// Recorded sounds (samples.js) are used where we have them; the synthesized ones are the fallback.

const rand = (a, b) => a + Math.random() * (b - a);

function distortionCurve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

export class Sfx {
  constructor(ctx) {
    this.ctx = ctx;
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -12; out.ratio.value = 4; out.attack.value = 0.003; out.release.value = 0.2;
    // The compressor adds automatic make-up gain, so trim the whole mix back down after it.
    const trim = ctx.createGain();
    trim.gain.value = 0.4;
    out.connect(trim).connect(ctx.destination);
    this.tap = ctx.createMediaStreamDestination(); // the whole mix, for saving the jumpscare (clip.js)
    trim.connect(this.tap);
    this.master = ctx.createGain();
    this.master.connect(out);

    this.reverb = ctx.createConvolver();
    this.wet = ctx.createGain();
    this.send = ctx.createGain();   // anything connected here gets reverb
    this.send.connect(this.reverb).connect(this.wet).connect(this.master);
    this.setReverb(2.4, 0.35);

    const sr = ctx.sampleRate;
    this.white = ctx.createBuffer(1, sr * 2, sr);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, sr * 4, sr);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.ambient = null;
  }

  get now() { return this.ctx.currentTime; }
  // Play a recording if it's loaded. Returns true if it played.
  rec(bank, emitter, opts) { return !!this.samples?.play(bank, emitter ? emitter.input : this.master, opts); }
  setVolume(v) { this.master.gain.setTargetAtTime(v, this.now, 0.05); }

  setReverb(seconds, wet) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    this.reverb.buffer = ir;
    this.wet.gain.value = wet;
  }

  updateListener(camera) {
    const l = this.ctx.listener, p = camera.position, e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // A sound source in the world. Connect sounds to emitter.input.
  emitter({ dry = false } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 16000;
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1.6, rolloffFactor: 1.15, maxDistance: 60,
    });
    const send = ctx.createGain();
    send.gain.value = dry ? 0 : 0.7;
    input.connect(lp).connect(panner).connect(this.master);
    lp.connect(send).connect(this.send);
    let occluded = false;
    return {
      input,
      setPos(x, y, z) {
        if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
        else panner.setPosition(x, y, z);
      },
      setOcclusion: (o) => {
        if (o === occluded) return;
        occluded = o;
        lp.frequency.setTargetAtTime(o ? 650 : 16000, this.now, 0.08);
        if (!dry) send.gain.setTargetAtTime(o ? 1.1 : 0.7, this.now, 0.1);
      },
      dispose() { try { input.disconnect(); lp.disconnect(); panner.disconnect(); send.disconnect(); } catch { /* already gone */ } },
    };
  }

  // ---------- small building blocks ----------
  _noise(dest, { t = this.now, dur = 0.2, type = 'bandpass', freq = 800, q = 1, peak = 0.3, attack = 0.005, buffer = this.white } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    // Longer than the noise buffer: loop it.
    const loop = dur + 0.15 > buffer.duration;
    src.loop = loop;
    src.start(t, loop ? 0 : Math.random() * (buffer.duration - dur - 0.1), dur + 0.05);
    return { f, g, src };
  }

  _tone(dest, { t = this.now, type = 'sine', freq = 440, to = null, dur = 0.3, peak = 0.2, attack = 0.005 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return { o, g };
  }

  // ---------- one-shots ----------
  footstep(emitter = null, { heavy = false, vol = 1, surface = 'hard' } = {}) {
    if (heavy && this.rec('stepHeavy', emitter, { vol: 1.3 * vol, rate: 0.62, lowpass: 700 })) {
      // Something drags: a short scrape after the step.
      if (Math.random() < 0.35) this._noise(emitter ? emitter.input : this.master, { t: this.now + 0.12, dur: 0.3, freq: 2200, q: 2, peak: 0.08 * vol, attack: 0.08 });
      return;
    }
    if (!heavy && this.rec(surface === 'wood' ? 'stepWood' : 'stepConcrete', emitter, { vol: 0.6 * vol })) return;
    const dest = emitter ? emitter.input : this.master;
    if (heavy) {
      this._noise(dest, { dur: 0.25, freq: 140 + Math.random() * 40, q: 0.9, peak: 0.9 * vol });
      this._tone(dest, { freq: 70, to: 40, dur: 0.18, peak: 0.5 * vol });
      // Something drags: a short scrape after the step.
      if (Math.random() < 0.35) this._noise(dest, { t: this.now + 0.12, dur: 0.3, freq: 2200, q: 2, peak: 0.08 * vol, attack: 0.08 });
    } else {
      const wood = surface === 'wood';
      this._noise(dest, { dur: wood ? 0.14 : 0.1, freq: (wood ? 380 : 650) + Math.random() * 250, q: 1.3, peak: 0.22 * vol });
      if (wood && Math.random() < 0.15) this.creak(null, 0.15 * vol);
    }
  }

  click() { if (!this.rec('click', null, { vol: 0.5 })) this._noise(this.master, { dur: 0.04, freq: 3500, q: 3, peak: 0.25 }); }

  pickup() {
    const t = this.now;
    this._tone(this.master, { t, freq: 520, dur: 0.5, peak: 0.08, type: 'triangle' });
    this._tone(this.send, { t: t + 0.09, freq: 780, dur: 0.9, peak: 0.06, type: 'triangle' });
    this._noise(this.master, { t, dur: 0.06, freq: 4000, q: 2, peak: 0.1 });
  }

  clunk() {
    if (this.rec('latch', null, { vol: 0.8 })) { this.rec('metal', null, { vol: 0.5, when: 0.08 }); return; }
    const t = this.now;
    this._noise(this.master, { t, dur: 0.3, freq: 200, q: 0.8, peak: 0.6 });
    this._tone(this.master, { t, type: 'square', freq: 90, to: 50, dur: 0.15, peak: 0.12 });
    this._tone(this.send, { t: t + 0.02, type: 'triangle', freq: 310, dur: 1.4, peak: 0.07 });
  }

  denied() { this._tone(this.master, { type: 'square', freq: 140, dur: 0.18, peak: 0.05 }); }

  // Power restored: alarm siren for ~6 s plus a power-up hum.
  alarm() {
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.value = 0;
    for (let i = 0; i < 6; i++) {
      o.frequency.setValueAtTime(480, t + i);
      o.frequency.linearRampToValueAtTime(820, t + i + 0.5);
      o.frequency.linearRampToValueAtTime(480, t + i + 1);
    }
    g.gain.linearRampToValueAtTime(0.09, t + 0.2);
    g.gain.setValueAtTime(0.09, t + 5.5);
    g.gain.linearRampToValueAtTime(0, t + 6);
    o.connect(lp).connect(g);
    g.connect(this.master); g.connect(this.send);
    o.start(t); o.stop(t + 6.1);
    this._tone(this.master, { t, type: 'sawtooth', freq: 30, to: 120, dur: 1.6, peak: 0.12, attack: 0.8 });
  }

  rumble(seconds = 3) {
    this._noise(this.master, { dur: seconds, type: 'lowpass', freq: 160, q: 0.5, peak: 0.7, attack: 0.3, buffer: this.brown });
    this._tone(this.master, { type: 'sawtooth', freq: 45, to: 38, dur: seconds, peak: 0.05, attack: 0.3 });
  }

  creak(emitter = null, vol = 0.3) {
    if (this.rec('creak', emitter, { vol: vol * 2.2, rate: 0.85 })) return;
    const dest = emitter ? emitter.input : this.master;
    const { f } = this._noise(dest, { dur: 0.7, freq: 300, q: 18, peak: vol * 2.5, attack: 0.15 });
    f.frequency.exponentialRampToValueAtTime(900 + Math.random() * 500, this.now + 0.65);
  }

  clank(emitter = null, vol = 0.4) {
    if (this.rec(Math.random() < 0.4 ? 'bang' : 'metal', emitter, { vol: vol * 1.5, rate: 0.8 })) return;
    const dest = emitter ? emitter.input : this.master, t = this.now;
    this._noise(dest, { t, dur: 0.15, freq: 1800, q: 1, peak: vol });
    [143, 217, 389].forEach((f, i) => this._tone(dest, { t, type: 'triangle', freq: f * rand(0.97, 1.03), dur: 1.4 - i * 0.3, peak: vol * 0.25 }));
  }

  heartbeat(vol) {
    const t = this.now;
    this._tone(this.master, { t, freq: 62, to: 40, dur: 0.16, peak: 0.55 * vol });
    this._tone(this.master, { t: t + 0.24, freq: 55, to: 38, dur: 0.2, peak: 0.4 * vol });
  }

  // Short dissonant hit when the mimic spots you.
  sting(emitter = null) {
    if (emitter) this.rec('snarl', emitter, { vol: 1.4, rate: 0.9 }); // it snarls when it sees you
    const t = this.now;
    [233, 247, 349].forEach((f) => this._tone(this.send, { t, type: 'sawtooth', freq: f, to: f * 0.92, dur: 1.6, peak: 0.05, attack: 0.02 }));
    this._noise(this.master, { t, dur: 0.6, freq: 5000, q: 0.6, peak: 0.12 });
  }

  // Jumpscare scream.
  screech() {
    this.rec('attack', null, { vol: 1.6, rate: 0.9, jitter: 0 });
    const ctx = this.ctx, t = this.now;
    const ws = ctx.createWaveShaper(); ws.curve = distortionCurve(60);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.03);
    g.gain.setValueAtTime(0.5, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    ws.connect(g); g.connect(this.master); g.connect(this.send);
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'square';
      const base = rand(700, 1500);
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * rand(1.3, 1.8), t + 0.4);
      o.frequency.linearRampToValueAtTime(base * rand(0.6, 0.9), t + 1.7);
      const og = ctx.createGain(); og.gain.value = 0.18;
      o.connect(og).connect(ws);
      o.start(t); o.stop(t + 1.85);
    }
    this._noise(ws, { t, dur: 1.6, type: 'highpass', freq: 1500, q: 0.5, peak: 0.5, attack: 0.01 });
  }

  // Fallback "voice" for when there are no clips (no mic): a breathy whisper.
  whisper(emitter = null) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    const dur = rand(0.8, 1.6);
    const { f, g } = this._noise(dest, { t, dur, freq: 1800, q: 4, peak: 0.25, attack: 0.1 });
    for (let s = 0; s < dur; s += 0.12) {
      f.frequency.setValueAtTime(rand(900, 3200), t + s);
      g.gain.setValueAtTime(rand(0.05, 0.3), t + s);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return dur;
  }

  // The mimic speaks with the player's voice. Returns how long it lasts (seconds).
  // style: 'lure' (almost right), 'scream' (fast, distorted, with a demonic octave below), 'echo' (slow, for the end screen),
  //        'whisper' (thin and close, as if breathed into your ear), 'distant' (muffled, from far off: multiplayer lures)
  playVoice(buffer, emitter, style = 'lure') {
    const ctx = this.ctx, t0 = this.now + 0.03;
    const dest = emitter ? emitter.input : this.master;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2800; pk.gain.value = 5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const ws = ctx.createWaveShaper();
    const out = ctx.createGain();
    hp.connect(pk).connect(lp).connect(ws).connect(out).connect(dest);
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    out.connect(wet).connect(this.send);

    let rate, vol;
    if (style === 'scream') { rate = rand(1.12, 1.28); vol = 1.5; ws.curve = distortionCurve(30); }
    else if (style === 'distant') { rate = rand(0.955, 1.0); vol = 0.95; ws.curve = distortionCurve(3); lp.frequency.value = 2300; wet.gain.value = 0.9; }
    else if (style === 'whisper') { rate = rand(0.96, 0.99); vol = 0.6; ws.curve = distortionCurve(1); hp.frequency.value = 380; lp.frequency.value = 4200; wet.gain.value = 0; }
    else if (style === 'radio') { // over a walkie-talkie
      rate = 1; vol = 1.4; ws.curve = this.radioCurve(); hp.frequency.value = 450; lp.frequency.value = 2900; pk.frequency.value = 1700; pk.gain.value = 8; wet.gain.value = 0;
    } else if (style === 'echo') { rate = 0.78; vol = 1.2; ws.curve = distortionCurve(2); lp.frequency.value = 2600; wet.gain.value = 1; }
    else if (style === 'stranger') { // someone else: pitched, over a bad line. Mostly the same someone.
      if (!this.stranger || Math.random() < 0.2) this.stranger = [0.8, 0.86, 1.17, 1.24][Math.floor(Math.random() * 4)];
      rate = this.stranger; vol = 1.3; ws.curve = distortionCurve(5);
      hp.frequency.value = 350; lp.frequency.value = 3200; pk.frequency.value = 1500; pk.gain.value = 7;
    } else if (style === 'ellie') { rate = 1.2; vol = 1.2; ws.curve = distortionCurve(2); lp.frequency.value = 6000; wet.gain.value = 0.4; }
    else { rate = rand(0.955, 1.01); vol = 1.15; ws.curve = distortionCurve(3); }
    out.gain.value = vol;

    const sources = [];
    const play = (when, offset, dur, r, gain = 1, node = hp) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer; s.playbackRate.value = r;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(g).connect(node);
      if (dur === undefined) s.start(when, offset); else s.start(when, offset, dur);
      sources.push(s);
    };

    let at = t0;
    // The tell: sometimes it stutters on the first syllable, like a skipping recording.
    if (style !== 'echo' && style !== 'whisper' && Math.random() < 0.35 && buffer.duration > 0.6) {
      const seg = Math.min(buffer.duration * 0.3, rand(0.12, 0.22));
      const reps = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < reps; i++) { play(at, 0, seg, rate); at += seg / rate + 0.02; }
    }
    play(at, 0, undefined, rate);
    if (style === 'scream') play(at, 0, undefined, rate * 0.5, 0.7); // the voice underneath
    const total = at - t0 + buffer.duration / (style === 'scream' ? rate * 0.5 : rate);
    setTimeout(() => { try { out.disconnect(); wet.disconnect(); } catch { /* ignore */ } }, (total + 4) * 1000);
    return total;
  }

  // Ragged breathing loop on an emitter. Returns { stop() }.
  breath(emitter) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23; // in, out, in, out...
    const depth = ctx.createGain(); depth.gain.value = 0.32;
    const rattle = ctx.createOscillator(); rattle.frequency.value = 7;
    const rDepth = ctx.createGain(); rDepth.gain.value = 260;
    lfo.connect(depth).connect(g.gain);
    rattle.connect(rDepth).connect(bp.frequency);
    src.connect(bp).connect(g).connect(emitter.input);
    src.start(); lfo.start(); rattle.start();
    return { stop() { try { src.stop(); lfo.stop(); rattle.stop(); g.disconnect(); } catch { /* ignore */ } } };
  }

  // Your own breathing when you're scared or out of breath. v: 0..1
  playerBreath(v) {
    const t = this.now;
    this._noise(this.master, { t, dur: 0.55, freq: 1300, q: 0.9, peak: 0.03 + 0.09 * v, attack: 0.25 });
    this._noise(this.master, { t: t + 0.65, dur: 0.6, freq: 750, q: 0.9, peak: 0.04 + 0.1 * v, attack: 0.08 });
  }

  // A low, fast thump during chases.
  pulse() {
    this._tone(this.master, { freq: 58, to: 34, dur: 0.22, peak: 0.45 });
    this._noise(this.master, { dur: 0.12, type: 'lowpass', freq: 140, q: 0.6, peak: 0.25 });
  }

  // Lights dying.
  powerDown() {
    const t = this.now;
    this._tone(this.master, { t, type: 'sawtooth', freq: 190, to: 22, dur: 1.4, peak: 0.07 });
    this._noise(this.master, { t, dur: 0.08, freq: 3000, q: 1, peak: 0.25 });
    this._noise(this.send, { t: t + 0.05, dur: 0.5, type: 'lowpass', freq: 300, q: 0.5, peak: 0.3 });
  }

  // Three slow knocks on whatever the emitter is at.
  knock(emitter) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    for (let i = 0; i < 3; i++) {
      this._noise(dest, { t: t + i * 0.42, dur: 0.14, type: 'lowpass', freq: 220, q: 0.7, peak: 1.1 });
      this._tone(dest, { t: t + i * 0.42, freq: 95, to: 60, dur: 0.12, peak: 0.4 });
    }
  }

  // A road flare: strike, then a hissing burn for `seconds`.
  flare(emitter = null, seconds = 7) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    this._noise(dest, { t, dur: 0.25, freq: 2500, q: 0.6, peak: 0.6 });
    const { g } = this._noise(dest, { t: t + 0.1, dur: seconds, type: 'highpass', freq: 1800, q: 0.4, peak: 0.25, attack: 0.15 });
    g.gain.setValueAtTime(0.25, t + seconds - 1);
  }

  // Motion tracker ping (pitch rises when something is close).
  beep(close = 0) {
    this._tone(this.master, { type: 'sine', freq: 1200 + close * 900, dur: 0.09, peak: 0.07 });
  }

  // A generator backfiring (failed skill check).
  bang(emitter = null) {
    if (this.rec('bang', emitter, { vol: 2, rate: 0.75 })) { this._tone(emitter ? emitter.input : this.master, { type: 'square', freq: 70, to: 30, dur: 0.4, peak: 0.3 }); return; }
    const dest = emitter ? emitter.input : this.master, t = this.now;
    this._noise(dest, { t, dur: 0.6, type: 'lowpass', freq: 900, q: 0.5, peak: 1.4, attack: 0.002 });
    this._tone(dest, { t, type: 'square', freq: 70, to: 30, dur: 0.4, peak: 0.3 });
    this.clank(emitter, 0.6);
  }

  skillTick() { this._tone(this.master, { type: 'triangle', freq: 880, dur: 0.06, peak: 0.06 }); }
  skillGood() { this._tone(this.master, { type: 'triangle', freq: 1320, dur: 0.12, peak: 0.07 }); }

  // Generator coughing into life.
  engine(emitter = null) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    for (let i = 0; i < 6; i++) this._noise(dest, { t: t + i * 0.12, dur: 0.1, type: 'lowpass', freq: 300, q: 0.7, peak: 0.6 - i * 0.05 });
    this._tone(dest, { t: t + 0.7, type: 'sawtooth', freq: 48, to: 60, dur: 2.5, peak: 0.12, attack: 0.3 });
  }

  // Smashing a tape recorder.
  smash(emitter = null) {
    if (this.rec('glass', emitter, { vol: 1.4 })) { this.rec('metal', emitter, { vol: 0.6, when: 0.05 }); return; }
    const dest = emitter ? emitter.input : this.master, t = this.now;
    this._noise(dest, { t, dur: 0.35, freq: 3000, q: 0.5, peak: 0.9 });
    this._noise(dest, { t, dur: 0.2, type: 'lowpass', freq: 400, q: 0.5, peak: 0.8 });
    for (let i = 0; i < 4; i++) this._noise(dest, { t: t + 0.08 + Math.random() * 0.3, dur: 0.05, freq: 5000 + Math.random() * 3000, q: 4, peak: 0.25 });
  }

  unlock() {
    const t = this.now;
    this._tone(this.master, { t, type: 'square', freq: 660, dur: 0.08, peak: 0.05 });
    this._tone(this.master, { t: t + 0.1, type: 'square', freq: 990, dur: 0.12, peak: 0.05 });
    this._noise(this.master, { t: t + 0.25, dur: 0.3, type: 'lowpass', freq: 250, q: 0.6, peak: 0.6 });
  }

  // It sniffing right outside your hiding spot.
  sniff(emitter = null) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    for (let i = 0; i < 3; i++) this._noise(dest, { t: t + i * 0.16, dur: 0.12, freq: 1800 + Math.random() * 600, q: 2, peak: 0.35, attack: 0.03 });
  }

  // Every voice it has, at once: slowed, overlapping, laughing. Returns seconds.
  chorus(buffers, emitter) {
    const ctx = this.ctx, t = this.now + 0.03;
    const dest = emitter ? emitter.input : this.master;
    const ws = ctx.createWaveShaper(); ws.curve = distortionCurve(6);
    const out = ctx.createGain(); out.gain.value = 0.9;
    const wet = ctx.createGain(); wet.gain.value = 0.8;
    ws.connect(out).connect(dest);
    out.connect(wet).connect(this.send);
    let end = 0;
    buffers.forEach((b, i) => {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.playbackRate.value = [0.62, 0.78, 0.93, 0.7][i % 4];
      const g = ctx.createGain(); g.gain.value = 0.55;
      s.connect(g).connect(ws);
      s.start(t + i * 0.18);
      end = Math.max(end, i * 0.18 + b.duration / s.playbackRate.value);
    });
    setTimeout(() => { try { out.disconnect(); wet.disconnect(); } catch { /* ignore */ } }, (end + 4) * 1000);
    return end;
  }

  // A door handle turning, slowly (or yanked, when it's chasing).
  handle(emitter, fast = false) {
    if (this.rec('latch', emitter, { vol: fast ? 1.2 : 0.8, rate: fast ? 1.1 : 0.7 })) { if (!fast) this.creak(emitter, 0.35); return; }
    const dest = emitter ? emitter.input : this.master, t = this.now;
    const n = fast ? 1 : 3;
    for (let i = 0; i < n; i++) this._noise(dest, { t: t + i * 0.35, dur: 0.18, freq: 2600, q: 6, peak: 0.25, attack: 0.04 });
    if (!fast) this.creak(emitter, 0.35);
  }

  door(emitter, open, fast = false) {
    if (this.samples?.has('doorOpen')) {
      if (open) { this.rec('doorOpen', emitter, { vol: 1.2, rate: fast ? 1.3 : 0.85 }); if (fast) this.rec('slam', emitter, { vol: 1.5 }); }
      else this.rec('doorClose', emitter, { vol: 1.2 });
      return;
    }
    const dest = emitter ? emitter.input : this.master, t = this.now;
    if (open) {
      if (fast) this._noise(dest, { t, dur: 0.3, type: 'lowpass', freq: 400, q: 0.6, peak: 1.2 }); // slammed open
      this.creak(emitter, fast ? 0.2 : 0.45);
    } else {
      this._noise(dest, { t, dur: 0.25, type: 'lowpass', freq: 300, q: 0.6, peak: 0.9 });
      this._tone(dest, { t, freq: 90, to: 60, dur: 0.15, peak: 0.3 });
    }
  }

  // An old tape: hiss, and a voice too damaged to make out (the words come as subtitles).
  tapeVoice(seconds) {
    const t = this.now;
    this._noise(this.master, { t, dur: seconds, type: 'highpass', freq: 3000, q: 0.4, peak: 0.05, attack: 0.1 });
    const { f, g } = this._noise(this.master, { t, dur: seconds, freq: 900, q: 6, peak: 0.12, attack: 0.05 });
    for (let s = 0; s < seconds; s += 0.11) {
      const syl = Math.random() < 0.75;
      f.frequency.setValueAtTime(400 + Math.random() * 1400, t + s);
      g.gain.setValueAtTime(syl ? 0.04 + Math.random() * 0.12 : 0.005, t + s);
    }
    g.gain.setValueAtTime(0.0001, t + seconds);
  }

  // Something with teeth.
  bite() {
    const t = this.now;
    this._noise(this.master, { t, dur: 0.15, freq: 2200, q: 1, peak: 0.8 });
    this._noise(this.master, { t: t + 0.05, dur: 0.4, type: 'lowpass', freq: 500, q: 0.7, peak: 0.6 });
    this._tone(this.master, { t, type: 'sawtooth', freq: 900, to: 300, dur: 0.5, peak: 0.12 });
  }

  // Being dragged away along the floor.
  drag(seconds = 2) {
    const t = this.now;
    for (let s = 0; s < seconds; s += 0.45) this._noise(this.master, { t: t + s, dur: 0.4, type: 'lowpass', freq: 350, q: 0.5, peak: 0.5, attack: 0.1 });
  }

  // Somewhere far off, something moans.
  moan(emitter) { return this.rec('moan', emitter, { vol: 1.1, rate: 0.75, jitter: 0.1, lowpass: 2500 }); }
  snarl(emitter, vol = 1.2) { return this.rec('snarl', emitter, { vol, rate: 0.85 }); }
  cloth() { this.rec('cloth', null, { vol: 0.7 }); }

  // The camcorder losing its signal.
  static(seconds = 1.2) {
    this._noise(this.master, { dur: seconds, type: 'highpass', freq: 800, q: 0.3, peak: 0.35, attack: 0.005 });
    this._tone(this.master, { type: 'sine', freq: 1000, dur: seconds, peak: 0.04, attack: 0.01 });
  }

  // Tension: 0 = nothing near, 1 = it's right there / chasing you.
  setDread(v) {
    const a = this.ambient;
    if (!a) return;
    const n = this.now;
    a.dread.gain.setTargetAtTime(v * 0.07, n, 0.5);
    a.dreadLp.frequency.setTargetAtTime(140 + v * 1400, n, 0.5);
    a.high.gain.setTargetAtTime(v > 0.55 ? (v - 0.55) * 0.02 : 0, n, 0.6);
  }

  // Duck the background. Total silence when it's close is scarier than any noise.
  setAmbient(v) { if (this.ambient) this.ambient.bus.gain.setTargetAtTime(v, this.now, 0.7); }

  // A sentence nobody said: the first half of one recording, then the second half of another.
  playStitch(a, b, emitter, style = 'stranger') {
    const sr = a.sampleRate, fade = Math.floor(sr * 0.02);
    const ha = Math.floor(a.length / 2), hb = Math.floor(b.length / 2);
    const out = this.ctx.createBuffer(1, ha + (b.length - hb), sr);
    const o = out.getChannelData(0), da = a.getChannelData(0), db = b.getChannelData(0);
    for (let i = 0; i < ha; i++) o[i] = da[i] * (i > ha - fade ? (ha - i) / fade : 1);
    for (let i = hb; i < b.length; i++) o[ha + i - hb] = db[i] * (i < hb + fade ? (i - hb) / fade : 1);
    return this.playVoice(out, emitter, style);
  }

  // ---------- ambience ----------
  startAmbient(theme) {
    this.stopAmbient();
    const ctx = this.ctx, t = this.now;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(1, t + 3);
    bus.connect(this.master);
    const nodes = [bus];

    const room = ctx.createBufferSource();
    room.buffer = this.brown; room.loop = true;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = theme === 'house' ? 500 : 260;
    const rg = ctx.createGain(); rg.gain.value = theme === 'house' ? 0.09 : 0.14;
    room.connect(rlp).connect(rg).connect(bus);
    room.start();
    nodes.push(room);

    // Slow swell, so the silence breathes.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = theme === 'house' ? 0.05 : 0.04;
    lfo.connect(lfoG).connect(rg.gain); lfo.start();
    nodes.push(lfo);

    if (theme === 'hospital') {
      // Fluorescent ballast buzz, and a heart monitor somewhere, still beeping for nobody.
      [120, 240].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        const g = ctx.createGain(); g.gain.value = [0.006, 0.003][i];
        o.connect(lp).connect(g).connect(bus); o.start(); nodes.push(o);
      });
      const sr = ctx.sampleRate, beep = ctx.createBuffer(1, Math.floor(sr * 1.1), sr), d = beep.getChannelData(0);
      for (let i = 0; i < sr * 0.09; i++) d[i] = Math.sin((2 * Math.PI * 960 * i) / sr) * Math.min(1, i / 200, (sr * 0.09 - i) / 400);
      const mon = ctx.createBufferSource(); mon.buffer = beep; mon.loop = true;
      const mg = ctx.createGain(); mg.gain.value = 0.012;
      const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 1800; // through a wall or two
      mon.connect(mlp).connect(mg).connect(bus); mon.start(); nodes.push(mon);
    } else if (theme === 'mall') {
      // Somewhere, the music never got switched off: a slow tune on a worn tape, through a few walls.
      const sr = ctx.sampleRate, NOTES = [64, 67, 71, 69, 67, 64, 62, 64, 67, 66, 62, 59, 60, 64, 62, 0];
      const len = 0.62, buf = ctx.createBuffer(1, Math.floor(sr * len * NOTES.length), sr), d = buf.getChannelData(0);
      NOTES.forEach((n, k) => {
        if (!n) return;
        const f = 440 * 2 ** ((n - 69) / 12), off = Math.floor(k * len * sr);
        for (let i = 0; i < len * sr * 1.6 && off + i < d.length; i++) {
          const tt = i / sr, env = Math.min(1, tt / 0.03) * Math.exp(-tt * 2.6);
          d[off + i] += env * (Math.sin(2 * Math.PI * f * tt) * 0.6 + Math.sin(4 * Math.PI * f * tt) * 0.15) * 0.5;
        }
      });
      const mus = ctx.createBufferSource(); mus.buffer = buf; mus.loop = true; mus.playbackRate.value = 0.96;
      const wow = ctx.createOscillator(); wow.frequency.value = 0.4;
      const wowG = ctx.createGain(); wowG.gain.value = 0.012;
      wow.connect(wowG).connect(mus.playbackRate);
      const mlp = ctx.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 1100;
      const mg = ctx.createGain(); mg.gain.value = 0.05;
      mus.connect(mlp).connect(mg).connect(bus);
      mg.connect(this.send);
      mus.start(); wow.start(); nodes.push(mus, wow);
      // An escalator that's still running.
      const o = ctx.createOscillator(); o.frequency.value = 43;
      const g = ctx.createGain(); g.gain.value = 0.012;
      o.connect(g).connect(bus); o.start(); nodes.push(o);
    } else if (theme === 'facility') {
      // Mains hum from dead machinery.
      [50, 100, 150.5].forEach((f, i) => {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = [0.018, 0.01, 0.004][i];
        o.connect(g).connect(bus); o.start(); nodes.push(o);
      });
    } else {
      // Low detuned drone.
      [55, 55.7].forEach((f) => {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.015;
        o.connect(g).connect(bus); o.start(); nodes.push(o);
      });
    }
    // Dread drone: dissonant low cluster plus a thin, wavering high tone. Silent until setDread().
    const dread = ctx.createGain(); dread.gain.value = 0;
    const dreadLp = ctx.createBiquadFilter(); dreadLp.type = 'lowpass'; dreadLp.frequency.value = 140;
    dreadLp.connect(dread).connect(this.master);
    [55, 58.27, 77.78, 82.41].forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.25;
      o.connect(g).connect(dreadLp); o.start(); nodes.push(o);
    });
    const tone = ctx.createOscillator(); tone.frequency.value = 1864;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.3;
    const vibD = ctx.createGain(); vibD.gain.value = 14;
    vib.connect(vibD).connect(tone.frequency);
    const high = ctx.createGain(); high.gain.value = 0;
    tone.connect(high).connect(this.master);
    tone.start(); vib.start();
    nodes.push(tone, vib, dread, high);
    this.ambient = { nodes, bus, theme, dread, dreadLp, high };
  }

  // ---------- walkie-talkies ----------
  radioCurve() { return (this._radioCurve ||= distortionCurve(14)); }

  // The click and hiss of a radio key going down (or up: end).
  squelch(end = false) {
    const t = this.now;
    this._noise(this.master, { t, dur: end ? 0.18 : 0.09, type: 'bandpass', freq: 2600, q: 0.7, peak: end ? 0.14 : 0.1 });
    this._tone(this.master, { t, type: 'square', freq: end ? 1400 : 1900, dur: 0.04, peak: 0.03 });
  }

  // ---------- the listener, and random events ----------
  // The listener's clicks: a quick run of dry tongue clicks.
  clicks(emitter, n = 3, vol = 1) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    let at = t;
    for (let i = 0; i < n; i++) {
      this._noise(dest, { t: at, dur: 0.03, freq: 2200 + Math.random() * 1200, q: 5, peak: 0.9 * vol, attack: 0.001 });
      at += 0.06 + Math.random() * 0.05;
    }
  }

  // Thunder: far (0..1) delays and softens it.
  thunder(far = 0.5) {
    const t = this.now;
    if (far < 0.35) this._noise(this.master, { t, dur: 0.4, type: 'highpass', freq: 1200, q: 0.5, peak: 0.3 }); // the crack
    this._noise(this.master, { t: t + far * 1.2, dur: 3.5 + far * 2, type: 'lowpass', freq: 200 - far * 70, q: 0.4, peak: 1 - far * 0.45, attack: 0.2, buffer: this.brown });
    this._noise(this.send, { t: t + far * 1.2, dur: 3, type: 'lowpass', freq: 400, q: 0.4, peak: 0.25, attack: 0.3, buffer: this.brown });
  }

  // Rain on the roof and the windows, fading in and out.
  rain(on) {
    const ctx = this.ctx, t = this.now;
    if (on && !this.rainNode) {
      const src = ctx.createBufferSource(); src.buffer = this.white; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 5);
      src.connect(bp).connect(lp).connect(g).connect(this.master);
      src.start();
      this.rainNode = { src, g };
    } else if (!on && this.rainNode) {
      const { src, g } = this.rainNode;
      g.gain.setTargetAtTime(0, t, 1.5);
      src.stop(t + 6);
      this.rainNode = null;
    }
  }

  // A security alarm going off somewhere, for a while.
  siren(emitter, seconds = 14) {
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator(); o.type = 'square';
    for (let i = 0; i < seconds / 0.5; i++) o.frequency.setValueAtTime(i % 2 ? 640 : 860, t + i * 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g.gain.setValueAtTime(0.35, t + seconds - 0.1); g.gain.linearRampToValueAtTime(0, t + seconds);
    o.connect(lp).connect(g).connect(emitter ? emitter.input : this.master);
    o.start(t); o.stop(t + seconds + 0.1);
  }

  // A security shutter rolling down and slamming.
  shutter(emitter) {
    const dest = emitter ? emitter.input : this.master, t = this.now;
    for (let i = 0; i < 26; i++) this._noise(dest, { t: t + i * 0.045, dur: 0.04, freq: 900 + Math.random() * 600, q: 2, peak: 0.35 });
    this._noise(dest, { t: t + 1.2, dur: 0.5, type: 'lowpass', freq: 500, q: 0.6, peak: 1.2 });
    this._tone(dest, { t: t + 1.2, freq: 90, to: 45, dur: 0.3, peak: 0.4 });
  }

  stopAmbient() {
    this.rain(false);
    if (!this.ambient) return;
    const { nodes, bus, dread, high } = this.ambient;
    bus.gain.setTargetAtTime(0, this.now, 0.3);
    dread.gain.setTargetAtTime(0, this.now, 0.3);
    high.gain.setTargetAtTime(0, this.now, 0.3);
    setTimeout(() => nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch { /* ignore */ } }), 1500);
    this.ambient = null;
  }
}
