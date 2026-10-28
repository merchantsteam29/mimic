// How each of you walks, so the mimic can walk like you. The host watches every living player four times a second:
// how often they crouch, how often they run, how often they stop dead. After a minute or so of watching, the mimic,
// when it isn't chasing, moves the way the player it's copying does (mimic.js `gaitStep`): their pace, their stops,
// their footsteps (a person's steps, on the floor they're on, not its own heavy ones). Crouchers get one that
// creeps in silence. Alone it copies you; online, whoever's voice it used last.
const RATE = 0.25, READY = 60; // seconds between looks, seconds of moving before it can copy someone

export class Gait {
  constructor(g) {
    this.g = g;
    this.t = 0;
    this.seen = new Map(); // id -> { x, z, moving, move, crouch, run, stops }
    this.copy = null;      // whose walk it's copying
  }

  update(dt) {
    const g = this.g;
    if (!g.isHost || g.room || (this.t -= dt) > 0) return;
    this.t = RATE;
    for (const P of g.targets()) {
      if (P.hidden) continue;
      let s = this.seen.get(P.id);
      if (!s) { this.seen.set(P.id, s = { x: P.x, z: P.z, moving: false, move: 0, crouch: 0, run: 0, stops: 0 }); continue; }
      const v = Math.hypot(P.x - s.x, P.z - s.z) / RATE;
      s.x = P.x; s.z = P.z;
      const moving = v > 0.4;
      if (s.moving && !moving) s.stops++;
      s.moving = moving;
      if (!moving) continue;
      s.move += RATE;
      const crouched = P.id === g.me ? g.p.crouch : g.remotes.get(P.id)?.crouch;
      if (crouched) s.crouch += RATE;
      else if (v > 4.2) s.run += RATE;
    }
  }

  // Copy this player from now on (their voice was just used).
  follow(id) { if (id) this.copy = id; }

  // The walk it's copying: { crouch, run, stop } as shares (stop: chance of pausing at each choice), or null.
  profile() {
    const g = this.g, id = this.copy && this.seen.has(this.copy) ? this.copy : g.mp ? null : g.me;
    const s = id && this.seen.get(id);
    if (!s || s.move < READY) return null;
    const mins = s.move / 60;
    return { crouch: s.crouch / s.move, run: s.run / s.move, stop: Math.min(0.35, (s.stops / mins) / 30) };
  }
}
