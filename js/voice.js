// Microphone capture + voice activity detection. Every time the player talks, the utterance is cut
// into a clip (an AudioBuffer) that the mimic can replay later. Also reports how loud the player is,
// which the mimic uses to hear them. Kept separate from the game so multiplayer can reuse it: the
// same clips can be sent to peers, and the same stream can feed proximity voice chat.

const CHUNK = 1024;        // samples per worklet message
const PREROLL = 0.4;       // seconds kept before speech starts, so the first syllable isn't cut
const HANGOVER = 0.75;     // seconds of quiet that end a clip (pauses between words don't)
const SOFT = 6;            // dB: once talking, quieter sounds than the threshold still count (soft word endings)
const MAX_CLIP = 7;        // seconds; longer speech is split
const MIN_VOICED = 0.3;    // seconds of actual speech needed to keep a clip
const MAX_CLIPS = 60;

import { Kinds, want } from './kinds.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Voice {
  constructor() {
    this.clips = [];
    this.started = false;
    this.denied = false;
    this.error = '';
    this.sens = 0.5;           // 0..1, from settings
    this.floor = -70;          // tracked noise floor (dBFS)
    this.meter = 0;            // 0..1 for UI meters
    this.thresholdPos = 0.5;   // 0..1 where the "talking" line sits on the meter
    this.hear = 0;             // 0..1 how loudly the player is talking right now (0 = silent)
    this.talking = false;
    this.suppressUntil = 0;    // while the mimic speaks, don't record its own voice from the speakers
    this.tag = null;           // label for new clips (e.g. 'seed' during the voice check)
    this.context = null;       // what's happening while you talk ('chase' | 'hide' | null), set by the game
    this.kinds = new Kinds();  // what kind of thing each clip is (kinds.js)
    this.onClip = null;
    this.pre = [];
    this.rec = null;
    this.lastPicked = null;
  }

  async start(ctx) {
    if (this.started) return true;
    this.ctx = ctx;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.denied = true; this.error = 'This browser can\'t use a microphone here (it needs https or localhost).';
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      this.denied = true;
      this.error = e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'No microphone was found.';
      return false;
    }
    await ctx.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
    this.src = ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(ctx, 'mimic-recorder');
    const sink = ctx.createGain();
    sink.gain.value = 0; // the worklet must reach the destination to keep running, but silently
    this.src.connect(this.node).connect(sink).connect(ctx.destination);
    this.node.port.onmessage = (e) => this.chunk(e.data);
    this.chunkSec = CHUNK / ctx.sampleRate;
    this.started = true;
    return true;
  }

  setSensitivity(v) { this.sens = clamp(v, 0, 1); }

  suppress(seconds) {
    this.suppressUntil = Math.max(this.suppressUntil, performance.now() + seconds * 1000);
    this.rec = null; // drop anything half-recorded: it may contain the mimic itself
  }

  chunk(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const db = 20 * Math.log10(Math.sqrt(sum / data.length) + 1e-9);

    // Noise floor: falls fast, rises slowly, so steady background noise doesn't count as talking.
    this.floor += (db - this.floor) * (db < this.floor ? 0.25 : 0.003);
    this.floor = clamp(this.floor, -95, -35);
    const minDb = -38 - this.sens * 22;            // sensitivity 0 => -38 dB, 1 => -60 dB
    const thr = Math.max(this.floor + 10, minDb);
    const loud = db > thr;
    const suppressed = performance.now() < this.suppressUntil;

    this.meter = clamp((db + 75) / 60, 0, 1);
    this.thresholdPos = clamp((thr + 75) / 60, 0, 1);
    this.talking = loud && !suppressed;
    this.hear = this.talking ? clamp((db - thr) / 28 + 0.15, 0, 1) : this.hear * 0.8;
    if (this.hear < 0.01) this.hear = 0;

    const sec = this.chunkSec;
    if (this.rec) {
      this.rec.chunks.push(data);
      if (loud) { this.rec.silent = 0; this.rec.voiced += sec; } else if (db > thr - SOFT) this.rec.silent = Math.max(0, this.rec.silent - sec * 0.5);
      else this.rec.silent += sec;
      if (this.rec.silent > HANGOVER || this.rec.chunks.length * sec > MAX_CLIP) this.finish();
    } else {
      this.pre.push(data);
      if (this.pre.length > Math.ceil(PREROLL / sec)) this.pre.shift();
      if (loud && !suppressed) {
        this.rec = { chunks: this.pre, voiced: sec, silent: 0 };
        this.pre = [];
      }
    }
  }

  finish() {
    const r = this.rec;
    this.rec = null;
    if (!r || r.voiced < MIN_VOICED) return;
    const sec = this.chunkSec;
    const drop = Math.max(0, Math.floor((r.silent - 0.15) / sec)); // trim the trailing quiet
    const chunks = r.chunks.slice(0, r.chunks.length - drop);
    const len = chunks.length * CHUNK;
    const out = new Float32Array(len);
    chunks.forEach((c, i) => out.set(c, i * CHUNK));
    // Take out rumble and mic handling (a high-pass at ~90 Hz), then level it by how loud the speech is (not by
    // its loudest click), so quiet talkers come out as loud as everyone else.
    const a = Math.exp((-2 * Math.PI * 90) / this.ctx.sampleRate);
    let px = 0, py = 0, peak = 0, sum = 0, n = 0;
    for (let i = 0; i < len; i++) {
      const y = a * (py + out[i] - px);
      px = out[i]; py = y; out[i] = y;
      const v = Math.abs(y);
      peak = Math.max(peak, v);
      if (v > 0.01) { sum += y * y; n++; }
    }
    const rms = Math.sqrt(sum / (n || 1)) || 1e-4;
    const rawDb = 20 * Math.log10(rms); // how loud you said it, before levelling
    const gain = Math.min(10, 0.14 / rms, 0.95 / (peak || 1));
    const fade = Math.floor(this.ctx.sampleRate * 0.008);
    for (let i = 0; i < len; i++) {
      let g = gain;
      if (i < fade) g *= i / fade;
      else if (i > len - fade) g *= (len - i) / fade;
      out[i] *= g;
    }
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    buffer.copyToChannel(out, 0);
    const kind = this.kinds.classify(buffer, rawDb, this.context);
    const clip = { buffer, duration: buffer.duration, plays: 0, at: performance.now(), tag: this.tag, kind };
    this.clips.push(clip);
    if (this.clips.length > MAX_CLIPS) {
      // Forget the most-used clip from the older half, so fresh material keeps coming in.
      const old = this.clips.slice(0, MAX_CLIPS / 2);
      const worst = old.reduce((a, b) => (b.plays > a.plays ? b : a));
      this.clips.splice(this.clips.indexOf(worst), 1);
    }
    this.onClip?.(clip);
  }

  // Choose a clip for the mimic: favours fresh, rarely played clips, the voice-check lines, and the kind of
  // clip that suits how it's speaking (style: lure, scream, whisper...; see kinds.js).
  pick(style = null) {
    if (!this.clips.length) return null;
    const n = this.clips.length;
    const weights = this.clips.map((c, i) => {
      let w = 1 / (1 + c.plays * 1.5);
      w *= 1 + i / n;                    // newer clips are a bit more likely
      if (c.tag === 'seed') w *= 1.4;    // "Help me!" etc. make good lures
      w *= want(style, c.kind);
      if (c === this.lastPicked && n > 1) w = 0;
      return w;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < n - 1 && (r -= weights[i]) > 0) i++;
    const clip = this.clips[i];
    clip.plays++;
    this.lastPicked = clip;
    return clip;
  }

  clear() { this.clips = []; this.lastPicked = null; }
}
