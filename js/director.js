// Scare director: paces scripted scares and fake-outs between the mimic's real hunting. Quiet
// stretches let tension build, then something happens. Never runs during a chase or after power-on.
//
// Events: behind (your voice whispered in your ear), peek (it stares from the end of a corridor),
// blackout (lights die, a step in the dark), rush (footsteps sprint at you, then stop dead),
// distant (your voice screaming far away), knock (on your hiding spot).

const rand = (a, b) => a + Math.random() * (b - a);

export class Director {
  constructor(game) {
    this.g = game;
    this.next = rand(35, 50);       // first scare
    this.last = null;
    this.far = game.sfx.emitter();               // fake sounds out in the level
    this.near = game.sfx.emitter({ dry: true }); // right next to your head
    this.fx = 0; this.fz = 0;
    this.runner = null;
    this.blackStep = -1;
  }

  dispose() { this.far.dispose(); this.near.dispose(); }

  update(dt) {
    const g = this.g, m = g.mimic, p = g.p, c = g.camera.position;
    this.far.setOcclusion(!g.level.los(c.x, c.z, this.fx, this.fz));
    if (this.runner) this.updateRush(dt);
    this.updateBlackout(dt);

    if (g.power || g.blackout > 0 || ['chase', 'hunt', 'peek', 'flee'].includes(m.state)) return;
    this.next -= dt;
    if (this.next > 0) return;

    const md = Math.hypot(m.x - p.x, m.z - p.z);
    const options = p.hidden
      ? [['knock', 1]]
      : [['behind', md > 10 ? 3 : 0], ['peek', md > 14 ? 4 : 0], ['blackout', 2], ['rush', 2], ['distant', md > 12 ? 1 : 0]];
    const pool = options.filter(([n, w]) => w > 0 && (n !== this.last || options.length === 1));
    let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
    const [name] = pool.find(([, w]) => (r -= w) <= 0) || pool[0];
    if (this[name]()) { this.last = name; this.next = rand(28, 60); }
    else this.next = 4; // couldn't set it up here; try again soon
  }

  // ---------- events (return false if they couldn't happen) ----------
  behind() {
    const p = this.g.p;
    this.near.setPos(p.x + Math.sin(p.yaw) * 0.55, p.eye, p.z + Math.cos(p.yaw) * 0.55);
    this.g.mimicSpeaks('whisper', this.near);
    return true;
  }

  peek() {
    const spot = this.peekSpot();
    if (!spot) return false;
    this.g.mimic.peek(spot, this.g.playerInfo());
    return true;
  }

  blackout() {
    const g = this.g;
    g.blackoutTotal = g.blackout = rand(4.5, 6.5);
    this.blackStep = 2.2;
    g.sfx.powerDown();
    return true;
  }

  rush() {
    const g = this.g, p = g.p, lv = g.level;
    const start = lv.randomFloor((q) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      return d > 11 && d < 17 && !lv.los(q.x, q.z, p.x, p.z);
    });
    if (!start) return false;
    const path = lv.findPath(start.x, start.z, p.x, p.z);
    if (path.length < 3) return false;
    this.runner = { x: start.x, z: start.z, path, t: 0, step: 0 };
    return true;
  }

  distant() {
    const g = this.g, p = g.p, lv = g.level;
    const q = lv.randomFloor((s) => Math.hypot(s.x - p.x, s.z - p.z) > 14 && !lv.los(s.x, s.z, p.x, p.z));
    if (!q) return false;
    this.fx = q.x; this.fz = q.z;
    this.far.setPos(q.x, 1.7, q.z);
    g.mimicSpeaks('scream', this.far);
    return true;
  }

  knock() {
    const g = this.g, prop = g.p.hidden;
    if (!prop) return false;
    this.fx = prop.front.x; this.fz = prop.front.z;
    this.far.setPos(prop.front.x, 1.4, prop.front.z);
    g.sfx.knock(this.far);
    setTimeout(() => { if (g.state === 'playing' && g.p.hidden === prop) g.mimicSpeaks('whisper', this.far); }, 1900);
    return true;
  }

  // ---------- helpers ----------
  // Somewhere 8-13 m ahead of the player, in plain view down a corridor or across a room.
  peekSpot() {
    const g = this.g, p = g.p, lv = g.level;
    let best = null;
    for (let i = 0; i < 60; i++) {
      const a = p.yaw + rand(-0.3, 0.3), d = rand(8, 13);
      const x = p.x - Math.sin(a) * d, z = p.z - Math.cos(a) * d;
      if (!lv.passable(lv.cellOf(x), lv.cellOf(z)) || !lv.los(p.x, p.z, x, z)) continue;
      if (!best || d > best.d) best = { x, z, d };
    }
    return best;
  }

  updateRush(dt) {
    const r = this.runner, g = this.g, p = g.p;
    r.t += dt;
    const wp = r.path[0];
    if (wp) {
      const dx = wp.x - r.x, dz = wp.z - r.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, 6.5 * dt);
      if (d < 0.2) r.path.shift();
      else { r.x += (dx / d) * step; r.z += (dz / d) * step; }
    }
    this.fx = r.x; this.fz = r.z;
    this.far.setPos(r.x, 1.2, r.z);
    r.step -= dt;
    if (r.step <= 0) { g.sfx.footstep(this.far, { heavy: true, vol: 1.2 }); r.step = 0.27; }
    // ...and it stops dead, just around the corner.
    if (r.t > 2.4 || Math.hypot(r.x - p.x, r.z - p.z) < 4.5 || !r.path.length) this.runner = null;
  }

  updateBlackout(dt) {
    const g = this.g;
    if (!(g.blackout > 0)) return;
    g.blackout -= dt;
    if (this.blackStep > 0) {
      this.blackStep -= dt;
      if (this.blackStep <= 0) { // one heavy step, close, somewhere in the dark
        const p = g.p, a = p.yaw + Math.PI + rand(-1.2, 1.2);
        this.fx = p.x - Math.sin(a) * 2.5; this.fz = p.z - Math.cos(a) * 2.5;
        this.far.setPos(this.fx, 0.3, this.fz);
        g.sfx.footstep(this.far, { heavy: true, vol: 1.3 });
      }
    }
    // When the lights come back, sometimes it's standing down the hall.
    if (g.blackout <= 0) {
      const m = g.mimic, md = Math.hypot(m.x - g.p.x, m.z - g.p.z);
      if (Math.random() < 0.6 && md > 12 && !['chase', 'hunt'].includes(m.state)) this.peek();
    }
  }
}
