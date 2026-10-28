// Spliced sentences: the mimic cuts your recordings at the pauses between words and joins pieces of
// different clips into a sentence nobody said. It's a little off on purpose: the pitch drifts between
// pieces, the gaps are wrong, and now and then it stutters on a word.
// Online the host makes the plan (which clips, which pieces) and sends it, so everyone hears the same thing.

const FRAME = 0.01;    // seconds per energy frame
const PAUSE = 0.07;    // seconds of quiet that count as a gap between words
const MIN = 0.16;      // shortest piece worth keeping
const LONG = 1.3;      // pieces longer than this get cut again at their quietest moment
const PAD = 0.015;     // kept either side of a cut
const MAX = 4.5;       // longest sentence

const cache = new WeakMap(); // buffer -> pieces

// Where the words are: [[start, end], ...] in seconds.
export function pieces(buffer) {
  if (cache.has(buffer)) return cache.get(buffer);
  const d = buffer.getChannelData(0), sr = buffer.sampleRate, n = Math.max(1, Math.floor(FRAME * sr));
  const rms = [];
  for (let i = 0; i + n <= d.length; i += n) {
    let s = 0;
    for (let j = i; j < i + n; j++) s += d[j] * d[j];
    rms.push(Math.sqrt(s / n));
  }
  const peak = Math.max(...rms, 1e-6), thr = Math.max(peak * 0.12, 0.006), gap = Math.ceil(PAUSE / FRAME);
  const out = [];
  let start = -1, quiet = 0;
  rms.forEach((v, f) => {
    if (v > thr) { if (start < 0) start = f; quiet = 0; }
    else if (start >= 0 && ++quiet >= gap) { out.push([start, f - quiet + 1]); start = -1; quiet = 0; }
  });
  if (start >= 0) out.push([start, rms.length - quiet]);
  // Long runs of speech with no pause: cut at the quietest frame in the middle.
  const split = (a, b, depth) => {
    if ((b - a) * FRAME <= LONG || depth > 2) return [[a, b]];
    let q = a + Math.floor((b - a) * 0.3), best = q;
    for (; q < a + Math.floor((b - a) * 0.7); q++) if (rms[q] < rms[best]) best = q;
    return [...split(a, best, depth + 1), ...split(best, b, depth + 1)];
  };
  const len = buffer.duration;
  const res = out.flatMap(([a, b]) => split(a, b, 0))
    .map(([a, b]) => [Math.max(0, a * FRAME - PAD), Math.min(len, b * FRAME + PAD)])
    .filter(([a, b]) => b - a >= MIN);
  cache.set(buffer, res);
  return res;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

// A sentence from 2-4 pieces of the given clips (buffers[i]). It starts like one of them starts and ends
// like one of them ends, so it sounds like a whole thing someone said. Returns null if there's too little.
// Each step: [clip, start, end, rate, gap before, gain, stutter (seconds of the piece said twice, or 0)].
export function plan(buffers, rand = Math.random, skill = 1) {
  const c = 1 - Math.max(0, Math.min(1, skill)); // early on it's worse at it: more drift, worse gaps, more stutters
  const all = buffers.map((b, k) => pieces(b).map((p, i, list) => ({ k, s: p[0], e: p[1], first: i === 0, last: i === list.length - 1 })));
  const flat = all.flat();
  if (flat.length < 2) return null;
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const want = 2 + Math.floor(rand() * 3);
  const firsts = flat.filter((p) => p.first && !p.last), lasts = flat.filter((p) => p.last && !p.first);
  const chosen = [pick(firsts.length ? firsts : flat)];
  let total = chosen[0].e - chosen[0].s;
  for (let i = 1; i < want; i++) {
    const end = i === want - 1;
    // A piece from a different clip than the one before, if there is one; never the very next piece of the same clip.
    const prev = chosen[i - 1];
    let pool = (end && lasts.length ? lasts : flat).filter((p) => !chosen.includes(p) && p.k !== prev.k && total + p.e - p.s <= MAX);
    if (!pool.length) pool = flat.filter((p) => !chosen.includes(p) && !(p.k === prev.k && Math.abs(p.s - prev.e) < 0.05) && total + p.e - p.s <= MAX);
    if (!pool.length) break;
    const p = pick(pool);
    chosen.push(p);
    total += p.e - p.s;
  }
  if (chosen.length < 2) return null;
  const drift = 0.97 + rand() * 0.06;
  return chosen.map((p, i) => [
    p.k, r3(p.s), r3(p.e),
    r3(drift + (rand() - 0.5) * 0.07 * (1 + c * 1.5)),    // each piece a shade higher or lower
    i ? r3(rand() < 0.25 ? 0.01 : 0.04 + rand() * (0.2 + c * 0.25)) : 0, // too short, or a beat too long
    r3(0.8 + rand() * 0.35),
    rand() < 0.18 + c * 0.25 ? r3(Math.min(0.2, (p.e - p.s) * 0.45)) : 0,
  ]);
}

// Build the sentence as one buffer (at the first clip's sample rate).
export function build(ctx, steps, buffers) {
  const sr = buffers[steps[0][0]]?.sampleRate || ctx.sampleRate, fade = Math.floor(sr * 0.012);
  const parts = [];
  let len = 0;
  for (const [k, s, e, rate, gap, gain, stut] of steps) {
    const b = buffers[k];
    if (!b) continue;
    const say = (from, to) => { // resampled: the rate shifts the pitch a little
      const src = b.getChannelData(0), step = (b.sampleRate / sr) * rate;
      const n = Math.max(1, Math.floor(((to - from) * b.sampleRate) / step));
      const o = new Float32Array(n);
      let x = from * b.sampleRate;
      for (let i = 0; i < n; i++, x += step) {
        const j = Math.floor(x), f = x - j, a = src[j] || 0, c = src[j + 1] || 0;
        const env = Math.min(1, i / fade, (n - i) / fade);
        o[i] = (a + (c - a) * f) * gain * env;
      }
      return o;
    };
    len += Math.floor(gap * sr);
    parts.push([len, null]);
    if (stut) { const o = say(s, s + stut); parts.push([len, o]); len += o.length + Math.floor(sr * 0.05); }
    const o = say(s, e);
    parts.push([len, o]);
    len += o.length;
  }
  const out = ctx.createBuffer(1, Math.max(1, len), sr), ch = out.getChannelData(0);
  for (const [at, o] of parts) if (o) ch.set(o.subarray(0, ch.length - at), at);
  return out;
}
