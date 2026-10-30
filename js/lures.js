// Smart lures (host): the mimic uses your voices when it matters, not at random.
//
// - Where: it calls from out of sight and out of the light, near the thing you still need, so the voice
//   comes from where you were going anyway.
// - Whose: a friend it just took ("help"), or, when you've wandered off alone, the friend you split from
//   ("come here"), so it sounds like them catching up.
// - Answering: when someone calls out (a clip that's a shout, "help" or "come here"), it slips somewhere
//   out of sight toward the friend they're calling and answers in that friend's voice. Then it waits there.
//   Alone, it answers you too, from the direction of what you're looking for.

export const NEEDED = ['fuse', 'gen', 'tape', 'keycard', 'note', 'keypad', 'lore'];

const TAKEN_FOR = 60;    // seconds a taken friend's voice stays the one to use
const ALONE = 12;        // m: no living friend this close = you're on your own
const BAIT = 25;         // m: things you need this close pull its lure spot
const rand = (a, b) => a + Math.random() * (b - a);

// What the player still needs: items (jobs not done) and, when the jobs are done, the power panel.
export function needed(g) {
  const want = g.items.filter((it) => it?.active && !it.fake && NEEDED.includes(it.type) && !(it.type === 'gen' && g.obj.gen[it.i] >= 1)
    && !(it.type === 'lore' && (it.heard || !g.story))); // victims' tapes only count in a story
  if (g.obj.allDone() && !g.power) want.push(g.items.find((it) => it?.type === 'fusebox'));
  return want.filter(Boolean);
}

export class LureMind {
  constructor(game) {
    this.g = game;
    this.answerCd = 20;     // first answer after a little while
    this.taken = new Map(); // id -> game time they were taken
    this.dead = new Set();
    this.seen = game.mp?.added || 0;   // clips counted so far (online); older ones don't count
    this.last = game.voice.clips.at(-1); // (alone)
    this.answers = 0;
  }

  get on() { const g = this.g; return g.isHost && !g.room && !g.tut?.on && !g.hunt?.on && !g.hs?.on; }

  update(dt) {
    const g = this.g;
    if (!this.on) return;
    this.answerCd -= dt;
    for (const [id, s] of g.status) {
      if (s === 'dead' && !this.dead.has(id)) { this.dead.add(id); this.taken.set(id, g.t); }
    }
    // A new clip from someone alive: did they just call out?
    if (g.mp) {
      if (g.mp.added !== this.seen) {
        this.seen = g.mp.added;
        const c = g.mp.clips.get(g.mp.lastAdded);
        if (c) this.heard(c.owner, c.kind);
      }
    } else {
      const v = g.voice;
      if (v.clips.length && v.clips.at(-1) !== this.last) {
        this.last = v.clips.at(-1);
        this.heard(g.me, this.last.kind);
      }
    }
  }

  // The nearest thing P still needs, within reach.
  bait(P) {
    let best = null, bd = BAIT;
    for (const it of needed(this.g)) {
      const d = Math.hypot(it.x - P.x, it.z - P.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // Friends of P who are alive, with how far they are.
  friends(P) {
    const g = this.g, out = [];
    for (const id of g.order) {
      if (id === P.id || !g.alive(id)) continue;
      const q = id === g.me ? g.p : g.remotes.get(id);
      if (q) out.push({ id, x: q.x, z: q.z, d: Math.hypot(q.x - P.x, q.z - P.z) });
    }
    return out;
  }

  // How to lure P right now: { bait (a point to call from near), want (the kind of clip), prefer (whose voice) }.
  plan(P) {
    const g = this.g;
    if (!this.on) return null;
    const out = { bait: this.bait(P), want: null, prefer: null };
    if (g.mp) {
      // Someone it just took: their voice, asking for help.
      const fresh = [...this.taken].filter(([, t]) => g.t - t < TAKEN_FOR).sort((a, b) => b[1] - a[1])[0];
      const fr = this.friends(P);
      if (fresh && Math.random() < 0.7) { out.prefer = fresh[0]; out.want = 'help'; }
      else if (fr.length && fr.every((f) => f.d > ALONE)) {
        // On your own: the friend you split from (the nearest one), telling you to come.
        out.prefer = fr.sort((a, b) => a.d - b.d)[0].id;
        out.want = 'come';
      }
    }
    if (!out.want && out.bait) out.want = 'come';
    return out;
  }

  // Someone said something. If it was calling out, it may answer.
  heard(id, kind) {
    const g = this.g, m = g.mimic;
    if (!['call', 'help', 'come'].includes(kind) || this.answerCd > 0 || !g.alive(id)) return;
    if (!['wander', 'investigate', 'stalk'].includes(m.state) || m.graceT > 0 || m.frozen) return;
    const P = g.targets().find((q) => q.id === id);
    if (!P || P.hidden || Math.hypot(m.x - P.x, m.z - P.z) > 40) return;
    const lv = g.level, ts = g.targets();
    // It only slips away if nobody can see it go.
    if (ts.some((q) => Math.hypot(q.x - m.x, q.z - m.z) < 25 && lv.los(q.x, q.z, m.x, m.z))) return;
    // Who they're calling: the friend furthest off and out of their sight. Answer from between them.
    const fr = this.friends(P).filter((f) => !lv.los(P.x, P.z, f.x, f.z)).sort((a, b) => b.d - a.d)[0];
    const toward = fr || this.bait(P);
    let best = null;
    for (let i = 0; i < 70; i++) {
      const s = lv.randomFloor();
      if (!s) continue;
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      if (d < 8 || d > 15 || ts.some((q) => lv.los(q.x, q.z, s.x, s.z) || Math.hypot(q.x - s.x, q.z - s.z) < 6)) continue;
      let score = Math.abs(d - 11);
      if (toward) {
        const tx = toward.x - P.x, tz = toward.z - P.z, tl = Math.hypot(tx, tz) || 1;
        score -= (((s.x - P.x) * tx + (s.z - P.z) * tz) / (d * tl)) * 6; // the friend's way
      }
      if (m.hooks.isLit?.(s.x, s.z)) score += 3;
      if (!best || score < best.score) best = { ...s, score };
    }
    if (!best) return;
    this.answerCd = rand(35, 55) * (m.mood?.stalk ?? 1);
    this.answers++;
    g.scares?.holdTalkBack?.(); // one reply is enough
    setTimeout(() => this.answer(P.id, best, fr?.id ?? null), rand(700, 1300)); // a beat, like someone who heard you
  }

  answer(id, spot, as) {
    const g = this.g, m = g.mimic;
    if (g.state === 'ended' || !g.alive(id) || !['wander', 'investigate', 'stalk'].includes(m.state)) return;
    const P = g.targets().find((q) => q.id === id);
    if (!P) return;
    m.answerAt(spot, P, as);
    m.speak(m.lureStyle, 'answer', as);
    m.wait = (m.speaking || 1.5) + rand(4, 7);
  }
}
