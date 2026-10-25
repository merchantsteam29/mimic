// Recorded sounds (all CC0, see sounds/CREDITS.txt). Each bank has a few variants; play() picks one
// at random and nudges the pitch, so repeats don't sound identical. Until they've loaded (or if a
// file fails), sfx.js falls back to its synthesized versions.

const n5 = (p) => [0, 1, 2, 3, 4].map((i) => `${p}_00${i}.ogg`);
const BANKS = {
  stepWood: n5('footstep_wood'),
  stepConcrete: n5('footstep_concrete'),
  stepHeavy: n5('impactSoft_heavy'),
  creak: ['creak1.ogg', 'creak2.ogg', 'creak3.ogg'],
  doorOpen: ['doorOpen_1.ogg', 'doorOpen_2.ogg'],
  doorClose: ['doorClose_1.ogg', 'doorClose_2.ogg', 'doorClose_3.ogg', 'doorClose_4.ogg'],
  latch: ['metalLatch.ogg'],
  click: ['metalClick.ogg'],
  cloth: ['cloth1.ogg', 'cloth2.ogg', 'cloth3.ogg'],
  page: ['bookFlip1.ogg'],
  bang: ['impactMetal_heavy_000.ogg', 'impactMetal_heavy_001.ogg'],
  metal: ['impactMetal_medium_000.ogg'],
  glass: ['impactGlass_medium_000.ogg', 'impactGlass_medium_001.ogg'],
  slam: ['impactPlank_medium_000.ogg', 'impactWood_heavy_000.ogg'],
  snarl: ['snarl1.ogg', 'snarl2.ogg', 'snarl3.ogg', 'snarl5.ogg'],
  attack: ['snarlAttack.ogg'],
  moan: ['moan1.mp3', 'moan2.mp3', 'moan3.mp3', 'moan4.mp3', 'moan5.mp3'],
};

export class Samples {
  constructor(ctx) {
    this.ctx = ctx;
    this.banks = {};
  }

  async load(base = 'sounds/') {
    const jobs = [];
    for (const [bank, files] of Object.entries(BANKS)) {
      this.banks[bank] = [];
      for (const f of files) {
        jobs.push(fetch(base + f)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(f))))
          .then((ab) => this.ctx.decodeAudioData(ab))
          .then((buf) => this.banks[bank].push(buf))
          .catch(() => { /* this one stays synthesized */ }));
      }
    }
    await Promise.all(jobs);
  }

  has(bank) { return !!this.banks[bank]?.length; }

  // Play a random variant into `dest`. Returns its duration (0 if the bank isn't loaded).
  play(bank, dest, { vol = 1, rate = 1, jitter = 0.06, when = 0, lowpass = 0 } = {}) {
    const list = this.banks[bank];
    if (!list?.length) return 0;
    const ctx = this.ctx, buf = list[Math.floor(Math.random() * list.length)];
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * jitter);
    const g = ctx.createGain();
    g.gain.value = vol;
    let node = src;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass;
      node = node.connect(f);
    }
    node.connect(g).connect(dest);
    src.start(ctx.currentTime + when);
    return buf.duration / src.playbackRate.value;
  }
}
