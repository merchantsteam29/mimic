// What kind of thing you said, so the mimic can use the right clip at the right moment. No speech-to-text:
// it goes by how the clip sounds next to your usual voice (louder, higher, choppier, quieter) and by what
// was happening when you said it (being chased, hiding). The voice-check lines are known exactly.
//
// Kinds: call (a short shout: a name, "hey!"), come ("come here"), help, scream, panic (talking while chased),
// laugh, whisper, talk (anything else).
import { pieces } from './splice.js';

export const KINDS = ['call', 'come', 'help', 'scream', 'panic', 'laugh', 'whisper', 'talk'];
export const SEED_KINDS = ['call', 'come', 'help']; // "Hello? Is anyone there?", "I found something. Come here.", "Help me! Please!"

// How much each way of speaking wants each kind (unlisted kinds count 0.3).
const WANT = {
  lure:     { come: 4, call: 3, help: 2.5, talk: 1.2, panic: 0.6 },
  stranger: { come: 4, call: 3, help: 2.5, talk: 1.2, panic: 0.6 },
  distant:  { help: 4, call: 2.5, scream: 2, panic: 2, come: 1, talk: 0.6 },
  scream:   { scream: 5, panic: 3, help: 2, call: 0.5 },
  whisper:  { whisper: 4, talk: 1.5, come: 1, laugh: 0.6 },
  chorus:   { laugh: 3, talk: 1, whisper: 1 },
  answer:   { come: 4, call: 3, talk: 2, help: 0.5 },                         // "over here!" back at someone calling
  talk:     { talk: 3, come: 1, call: 1, scream: 0.05, panic: 0.2 },             // ordinary words (it practising)
  calm:     { talk: 4, come: 2, whisper: 1, call: 0.5, scream: 0.05, panic: 0.05 }, // "it's gone, come out"
};

export const want = (style, kind) => (style && WANT[style] ? WANT[style][kind] ?? 0.3 : 1);

// Rough pitch (Hz) of the loudest part of a clip: autocorrelation over a few windows, 75-500 Hz.
function pitch(d, sr) {
  const win = Math.floor(sr * 0.04), lo = Math.floor(sr / 500), hi = Math.floor(sr / 75);
  if (d.length < win + hi) return 0;
  const found = [];
  for (const at of [0.25, 0.45, 0.65]) {
    const s = Math.floor((d.length - win - hi) * at);
    let e0 = 0;
    for (let i = 0; i < win; i += 2) e0 += d[s + i] * d[s + i];
    if (e0 < 1e-4) continue;
    let best = 0, lag = 0;
    for (let L = lo; L < hi; L++) {
      let c = 0;
      for (let i = 0; i < win; i += 2) c += d[s + i] * d[s + i + L];
      if (c > best) { best = c; lag = L; }
    }
    if (lag && best / e0 > 0.45) found.push(sr / lag);
  }
  found.sort((a, b) => a - b);
  return found.length ? found[Math.floor(found.length / 2)] : 0;
}

// Keeps a running idea of your normal voice, and labels each new clip against it.
export class Kinds {
  constructor() { this.db = null; this.hz = null; this.n = 0; this.nHz = 0; }

  // buffer: the levelled clip; db: how loud the speech was before levelling; ctx: 'chase' | 'hide' | null.
  classify(buffer, db, ctx) {
    const d = buffer.getChannelData(0), dur = buffer.duration;
    const hz = pitch(d, buffer.sampleRate), parts = pieces(buffer);
    const avgDb = this.db ?? db, avgHz = this.hz ?? hz;
    let kind = 'talk';
    const sure = this.n >= 2; // louder or quieter than usual means nothing until it knows what usual is
    const loud = sure && db > avgDb + 5, quiet = sure && db < avgDb - 7, high = hz && avgHz && this.nHz >= 2 && hz > avgHz * 1.3;
    const short = parts.length ? parts.reduce((t, [a, b]) => t + b - a, 0) / parts.length : 1;
    if ((loud || ctx === 'chase') && (high || (sure && db > avgDb + 9)) && dur < 4) kind = 'scream';
    else if (parts.length >= 4 && short < 0.28 && dur < 4.5) kind = 'laugh';
    else if (ctx === 'chase') kind = 'panic';
    else if (quiet || (ctx === 'hide' && (!sure || db < avgDb - 2))) kind = 'whisper';
    else if (loud && dur < 2.2 && parts.length <= 3) kind = 'call';
    // Only ordinary talk teaches it what your ordinary voice is (an average of the first few, then slowly).
    if (kind === 'talk') {
      this.n++;
      this.db = this.db === null ? db : this.db + (db - this.db) * Math.max(0.2, 1 / this.n);
      if (hz) { this.nHz++; this.hz = this.hz === null ? hz : this.hz + (hz - this.hz) * Math.max(0.2, 1 / this.nHz); }
    }
    return kind;
  }
}
