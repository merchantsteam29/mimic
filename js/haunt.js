// Haunting (online): the dead, watching a living player, can reach back in about every 30 s:
// F flickers the light nearest them, G knocks somewhere close, C whispers right behind them.
// (Controller: the flashlight, ability and crouch buttons; touch: three buttons while watching.)
// To the living it's just one more thing in the dark: they can't tell a friend from the mimic.
// Escaped players watch, but can't haunt.
import { keyLabel } from './controls.js';

const CD = 30;
const KINDS = { KeyF: 'flicker', KeyG: 'knock', KeyC: 'whisper' };

export class Haunt {
  constructor(g) {
    this.g = g;
    this.cdT = 8; // a moment to take in that you're dead first
    this.hostCd = new Map();
    this.em = g.sfx.emitter();
  }

  can() {
    const g = this.g;
    return !!g.mp && g.state === 'spectate' && g.status.get(g.me) === 'dead';
  }

  // Keys while watching. True if used.
  onKey(code) {
    const kind = KINDS[code], g = this.g;
    if (!kind || !this.can()) return false;
    if (this.cdT > 0) return true;
    const to = g.specId;
    if (!to) return true;
    this.cdT = CD;
    g.send({ t: 'haunt', kind, to });
    this.note = { text: { flicker: 'You made a light flicker', knock: 'You knocked', whisper: 'You whispered' }[kind] + ` near ${g.nameOf(to)}`, until: g.t + 4 };
    return true;
  }

  // The spectator line's hint.
  hint() {
    if (!this.can()) return '';
    if (this.note && this.g.t < this.note.until) return `  ·  ${this.note.text}`;
    return this.cdT > 0 ? `  ·  You can reach them in ${Math.ceil(this.cdT)}s`
      : `  ·  ${keyLabel('F')} flicker  ${keyLabel('G')} knock  ${keyLabel('C')} whisper`;
  }

  update(dt) { this.cdT = Math.max(0, this.cdT - dt); }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'haunt') return false;
    const g = this.g;
    if (g.status.get(from) !== 'dead' || !g.alive(m.to) || !['flicker', 'knock', 'whisper'].includes(m.kind)) return true;
    if (g.t - (this.hostCd.get(from) ?? -99) < CD - 2) return true;
    this.hostCd.set(from, g.t);
    const P = g.infoOf(m.to), lv = g.level;
    if (m.kind === 'flicker') {
      const L = g.world.fixtures.map((f, i) => ({ f, i, d: Math.hypot(f.x - P.x, f.z - P.z) }))
        .filter((q) => !q.f.dead && q.d < 12).sort((a, b) => a.d - b.d)[0];
      if (L) g.broadcast({ t: 'haunted', k: 'flicker', i: L.i });
    } else if (m.kind === 'knock') {
      const q = lv.randomFloor((s) => { const d = Math.hypot(s.x - P.x, s.z - P.z); return d > 2.5 && d < 6; });
      if (q) g.broadcast({ t: 'haunted', k: 'knock', x: +q.x.toFixed(1), z: +q.z.toFixed(1) });
    } else {
      const q = lv.collide({ x: P.x - P.lookX * 1.1, z: P.z - P.lookZ * 1.1 }, 0.2);
      g.broadcast({ t: 'haunted', k: 'whisper', x: +q.x.toFixed(1), z: +q.z.toFixed(1) });
    }
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    if (m.t !== 'haunted') return false;
    const g = this.g;
    if (m.k === 'flicker') {
      const L = g.world.fixtures[m.i | 0];
      if (L) L.burst = 1.6 + Math.random() * 0.8;
      return true;
    }
    const x = Number(m.x) || 0, z = Number(m.z) || 0, c = g.camera.position;
    this.em.setPos(x, m.k === 'knock' ? 1.4 : 1.6, z);
    this.em.setOcclusion(!g.level.los(c.x, c.z, x, z));
    if (m.k === 'knock') g.sfx.knock(this.em);
    else g.sfx.whisper(this.em);
    return true;
  }

  dispose() { this.em.dispose(); }
}
