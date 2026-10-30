// The round's arc: the mimic is the main event, and it builds.
//
//   listen  It's quiet. No lures yet: it follows sounds and watches, and now and then you hear it practising,
//           a single word of yours, said twice, wrong, somewhere close. (until ~70 s, or someone is taken)
//   copy    It has enough of you. Lures, answers, spliced sentences: the voice game. (until ~4 min, most of
//           the jobs done, the power on, or it's hungry enough)
//   hunt    It stops pretending to be careful. Lights stutter everywhere, every voice it has laughs at once far
//           off, and from then on it lures more, answers more, moves faster, and when it chases you it throws
//           your own panic back at you.
//
// Catches: right after it takes someone (online, others still in), it calls for help in their voice from
// where it took them; and in the "stare" jumpscare it whispers the line that brought you there.
import { pieces, build } from './splice.js';

const LISTEN = 70, COPY = 240;
const rand = (a, b) => a + Math.random() * (b - a);

export class Arc {
  constructor(game) {
    this.g = game;
    this.phase = 'listen';
    this.practiseT = rand(14, 22);
    this.lastLure = null; // (everyone) the last stolen voice meant to bring me in: the stare jumpscare whispers it
  }

  get on() { const g = this.g; return !g.room && !g.tut?.on && !g.hunt?.on && !g.hs?.on; }
  get listening() { return this.phase === 'listen' && this.on; } // no voice tricks yet (director, talk-back)

  // How much of the jobs are done, 0..1.
  progress() {
    const g = this.g, o = g.obj, t = o.tasks, parts = [];
    if (t.fuses) parts.push(Math.min(1, g.fusesIn / 4));
    if (t.gens) parts.push(o.gen.filter((p) => p >= 1).length / (o.gen.length || 1));
    if (t.tapes) parts.push((t.tapes - o.tapesLeft) / t.tapes);
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  }

  // Host, every frame.
  update(dt) {
    const g = this.g, m = g.mimic;
    if (!this.on || !g.isHost) return;
    if (this.phase === 'listen') {
      // Not yet: it holds its lures back (it still chases anyone it sees).
      m.stalkCd = Math.max(m.stalkCd, 4);
      m.speakCd = Math.max(m.speakCd, 4);
      g.lm.answerCd = Math.max(g.lm.answerCd, 4);
      this.practiseT -= dt;
      if (this.practiseT <= 0 && ['wander', 'investigate'].includes(m.state)) { this.practiseT = rand(14, 22); this.practise(); }
      const taken = [...g.status.values()].includes('dead');
      if (g.t > LISTEN * (m.mood?.pace ?? 1) || taken) this.set('copy');
    } else if (this.phase === 'copy') {
      if (g.t > COPY * g.diff.hunger || this.progress() >= 0.6 || g.power || m.hunger >= 2) this.set('hunt');
    }
  }

  set(phase) {
    if (phase === this.phase) return;
    this.g.broadcast({ t: 'arc', ph: phase });
  }

  // Everyone: the phase changed (from the host).
  onNet(m) {
    const g = this.g;
    if (m.t === 'practise') { this.onPractise(m); return true; }
    if (m.t !== 'arc' || !['listen', 'copy', 'hunt'].includes(m.ph)) return false;
    this.phase = m.ph;
    g.mimic.arcPhase = m.ph;
    if (m.ph === 'hunt') this.unleash();
    return true;
  }

  // The turn: everything stutters, every voice at once far off, and it's faster from now on.
  unleash() {
    const g = this.g, m = g.mimic;
    if (g.state === 'playing' && !g.power) {
      g.blackoutTotal = g.blackout = Math.max(g.blackout || 0, 1.6);
      g.sfx.powerDown();
    }
    g.distort = Math.max(g.distort || 0, 0.8);
    g.sfx.rumble(3);
    if (g.isHost) {
      m.aggro *= 1.12;
      m.stalkCd = Math.min(m.stalkCd, 6);
      setTimeout(() => { if (g.state !== 'ended') g.mimicSpeaks('chorus', m.emitter); }, 2200);
    }
  }

  // Listening: one word of someone's, said twice, slightly wrong, from where it is. Everyone near hears it.
  practise() {
    const g = this.g;
    let buf = null, key = null;
    if (g.mp) {
      key = g.mp.pickKey(() => false, null, 'talk');
      buf = key && g.mp.clips.get(key)?.buffer;
    } else buf = g.voice.started && g.voice.clips.length ? g.voice.pick('talk')?.buffer : null;
    const p = buf && pieces(buf);
    if (!p?.length) return;
    const [s, e] = p[Math.floor(Math.random() * p.length)];
    const steps = [[0, s, e, 0.93, 0, 0.8, 0], [0, s, e, 0.9, rand(0.35, 0.6), 0.7, 0]];
    if (g.mp) g.broadcast({ t: 'practise', key, steps }); else this.hear(buf, steps);
  }

  hear(buf, steps) {
    const g = this.g;
    const d = g.sfx.playVoice(build(g.sfx.ctx, steps, [buf]), g.mimic.emitter, 'whisper');
    g.voice.suppress(d + 0.3);
  }

  onPractise(m) {
    const g = this.g;
    const c = m.key && g.mp?.clips.get(m.key);
    const ok = Array.isArray(m.steps) && m.steps.length <= 3 && m.steps.every((s) => Array.isArray(s) && s.length === 7 && s.every(Number.isFinite));
    if (c && ok) this.hear(c.buffer, m.steps.map((s) => [0, ...s.slice(1)]));
  }

  // Host: it just took someone. While the others are still in, it calls for help in their voice from right there.
  taken(id) {
    const g = this.g, m = g.mimic;
    if (!this.on || !g.mp) return;
    setTimeout(() => {
      if (g.state === 'ended' || !g.targets().length || ['chase', 'hunt', 'sniff'].includes(m.state)) return;
      m.speak(m.lureStyle, 'help', id);
    }, rand(3500, 6000));
  }
}
