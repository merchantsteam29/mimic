// The double (online, Normal mode, a lobby toggle). Something that walks the routes one of you walked a minute
// or two ago: their coat, their flashlight, their footsteps, now and then their voice. It's a recording of them,
// and it doesn't react to anything: it walks through doors that have since been shut, it never looks at you.
// Until someone gets too close, holds a light on it, or the one it copied sees it: then its head turns all the
// way round, and it runs at them. If it doesn't get them in a few seconds, it's gone.
// The host records everyone's trail and runs it, and sends it in 'snap' (db); everyone draws it.
import * as THREE from 'three';
import { RemotePlayer } from './remote.js';

const STATES = ['gone', 'walk', 'turn', 'chase'];
const RATE = 4;                 // trail samples a second
const KEEP = 150 * RATE;        // the last 150 s of everyone's trail
const RUN = 5.2, R = 0.3;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Double {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0; this.flash = false;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.src = null;            // whose route it is walking (and whose body it wears)
    this.cd = 100 + Math.random() * 40; // it needs a trail to copy first
    this.trails = new Map();    // host: id -> [{x, z, yaw, f}]
    this.recT = 0; this.i = 0; this.track = []; this.stateT = 0; this.prey = null; this.beamT = 0; this.sayT = 8;
    this.path = []; this.pathT = 0;
    this.avatars = new Map();
    if (!this.on) return;
    this.emitter = g.sfx.emitter();
  }

  avatar(id) {
    let a = this.avatars.get(id);
    if (!a) {
      a = new RemotePlayer(this.g.scene, this.g.sfx, Math.max(0, this.g.order.indexOf(id)), this.g.lookOf(id));
      a.seen = true;
      this.avatars.set(id, a);
    }
    return a;
  }

  // ---------- host ----------
  record(dt) {
    if ((this.recT -= dt) > 0) return;
    this.recT = 1 / RATE;
    for (const P of this.g.targets()) {
      let tr = this.trails.get(P.id);
      if (!tr) this.trails.set(P.id, tr = []);
      tr.push({ x: P.x, z: P.z, yaw: P.yaw, f: P.flashOn && !P.hidden });
      if (tr.length > KEEP) tr.shift();
    }
  }

  // Can that player see (x, z)? In their view, in sight, within range.
  sees(P, x, z, range = 14) {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1;
    return d < range && !P.hidden && (dx * P.lookX + dz * P.lookZ) / d > 0.6 && this.g.level.los(P.x, P.z, x, z);
  }

  // Start a replay: someone's route from a minute or two ago, from a spot nobody can see right now.
  begin(T) {
    const g = this.g;
    const ids = [...this.trails.keys()].filter((id) => g.alive(id) && this.trails.get(id).length > 40 * RATE);
    if (!ids.length) return false;
    const id = ids[Math.floor(Math.random() * ids.length)], tr = this.trails.get(id);
    for (let k = 0; k < 8; k++) {
      const start = Math.floor(Math.random() * Math.max(1, tr.length - 30 * RATE));
      const s = tr[start];
      if (T.some((P) => Math.hypot(P.x - s.x, P.z - s.z) < 10 || this.sees(P, s.x, s.z, 24))) continue;
      this.track = tr.slice(start, start + 50 * RATE).map((q) => ({ ...q }));
      this.src = id; this.i = 0; this.beamT = 0; this.sayT = 6 + Math.random() * 6;
      this.x = s.x; this.z = s.z; this.yaw = s.yaw;
      this.state = 'walk'; this.stateT = 0;
      return true;
    }
    return false;
  }

  think(dt) {
    const g = this.g, T = g.targets();
    this.record(dt);
    if (g.power) { this.state = 'gone'; return; } // everyone's leaving: no more replays
    this.stateT += dt;
    if (this.state === 'gone') {
      if ((this.cd -= dt) > 0) return;
      this.cd = 5;
      if (!this.begin(T)) return;
      return;
    }
    if (!g.alive(this.src) && this.state === 'walk') { this.leave(); return; } // the one it copied is gone
    const dist = (P) => Math.hypot(P.x - this.x, P.z - this.z);
    if (this.state === 'walk') {
      // Playing back their route, exactly. Doors don't matter: they were open when they walked it.
      this.i += dt * RATE;
      const a = this.track[Math.floor(this.i)], b = this.track[Math.floor(this.i) + 1];
      if (!a || !b) { this.leave(); return; }
      const k = this.i % 1;
      this.x = a.x + (b.x - a.x) * k; this.z = a.z + (b.z - a.z) * k;
      this.yaw = a.yaw + angleDiff(b.yaw, a.yaw) * k; this.flash = a.f;
      if ((this.sayT -= dt) <= 0) { this.sayT = 12 + Math.random() * 10; this.say(); }
      // What wakes it: someone right next to it, a light held on it, or the one it copied seeing it.
      const beamed = T.find((P) => P.flashOn && dist(P) < 10 && this.sees(P, this.x, this.z, 10) && (this.x - P.x) * P.lookX + (this.z - P.z) * P.lookZ > dist(P) * 0.93);
      this.beamT = beamed ? this.beamT + dt : Math.max(0, this.beamT - dt);
      const near = T.find((P) => dist(P) < 2.5);
      const self = T.find((P) => P.id === this.src && this.sees(P, this.x, this.z));
      const prey = near || (this.beamT > 1.2 && beamed) || self;
      if (prey) {
        this.prey = prey.id; this.state = 'turn'; this.stateT = 0; this.flash = false;
        g.broadcast({ t: 'dbTurn' });
      }
      return;
    }
    const P = T.find((q) => q.id === this.prey);
    if (!P) { this.leave(); return; }
    if (this.state === 'turn') { if (this.stateT > 1.3) { this.state = 'chase'; this.stateT = 0; } return; }
    // Chasing: a few seconds, then it's gone like it was never there.
    if (this.stateT > 7) { this.leave(); return; }
    this.yaw = Math.atan2(-(P.x - this.x), -(P.z - this.z));
    if (dist(P) < 0.9) { g.hostCatch(P.id, 'db'); this.leave(); return; }
    const lv = g.level;
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, P.x, P.z); this.path.push({ x: P.x, z: P.z }); this.pathT = 0.5; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, RUN * dt);
    const next = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = next.x; this.z = next.z;
  }

  leave() { this.state = 'gone'; this.cd = 60 + Math.random() * 50; this.prey = null; this.path = []; }

  // Their own words, from where it is.
  say() {
    const mp = this.g.mp, w = this.src;
    if (!mp || ![...mp.clips.values()].some((c) => c.owner === w)) return;
    const key = mp.pickKey(() => false, w, 'lure');
    if (mp.clips.get(key)?.owner === w) this.g.broadcast({ t: 'dbSay', key });
  }

  // [stateIndex, x, z, yaw, whose (index in order), flashlight]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), this.g.order.indexOf(this.src), this.flash ? 1 : 0]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const appeared = this.state === 'gone' && st !== 'gone';
    if (st !== this.state) this.stateT = 0;
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    this.src = this.g.order[s[4] | 0] ?? null;
    this.flash = !!s[5];
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  onNet(m) {
    const g = this.g;
    if (!this.on) return false;
    switch (m.t) {
      case 'dbSay': {
        const c = g.mp?.clips.get(m.key);
        if (!c) return true;
        const d = g.sfx.playVoice(c.buffer, this.emitter, 'lure');
        g.voice.suppress(d + 0.3);
        return true;
      }
      case 'dbTurn': // a crack, like a neck turning too far
        g.sfx.rec('snarl', this.emitter, { vol: 0.9 });
        if (Math.hypot(this.x - g.p.x, this.z - g.p.z) < 14 && g.alive(g.me)) g.sfx.sting(this.emitter);
        return true;
    }
    return false;
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost) { if (!g.ended) this.think(dt); } else {
      this.stateT += dt;
      const k = 1 - Math.exp(-dt * 12);
      this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
      this.yaw += angleDiff(this.tyaw, this.yaw) * k;
    }
    if (this.posed) return; // the jumpscare has it
    const shown = this.state !== 'gone' && this.src;
    for (const [id, a] of this.avatars) if (!shown || id !== this.src) { a.status = 'gone'; a.update(dt, g.level.theme.surface); }
    if (!shown) return;
    const a = this.avatar(this.src), wild = this.state !== 'walk';
    a.status = 'alive'; a.hidden = -1; a.seen = true; a.pitch = 0; a.crouch = false;
    a.flash = this.flash && !wild;
    // Walking, it faces the way they faced. Woken, its body stays put and only the head comes round to you.
    a.tx = this.x; a.tz = this.z; a.tyaw = this.yaw;
    a.update(dt, g.level.theme.surface);
    a.body.rotation.x = 0; a.head.rotation.x = 0; // (after a jumpscare)
    if (this.state === 'turn') a.head.rotation.y = Math.min(Math.PI, this.stateT * 2.6) + Math.sin(g.t * 50) * 0.04;
    else a.head.rotation.y = 0;
    if (this.state === 'chase') {
      a.head.rotation.z = Math.PI; // upside down
      a.arms[0].rotation.x = a.arms[1].rotation.x = 1.5;
    } else a.head.rotation.z = 0;
    this.emitter.setPos(a.x, 1.5, a.z);
    const c = g.camera.position;
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, a.x, a.z));
  }

  nearness(x, z) {
    if (!this.on || this.state === 'gone' || this.state === 'walk') return 0; // walking, it's just a friend (isn't it?)
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 10);
  }

  // The jumpscare: your friend's body bent over you, head upside down, arms out.
  poseAt(x, z, yaw, t) {
    const id = this.src;
    if (!this.on || !id) return null;
    const a = this.avatar(id);
    this.posed = true;
    a.status = 'alive'; a.hidden = -1; a.flash = false;
    a.tx = a.x = x; a.tz = a.z = z; a.tyaw = a.yaw = yaw;
    a.update(0.016, this.g.level.theme.surface);
    a.body.rotation.x = -0.5;
    a.head.rotation.x = 0.55;
    a.head.rotation.y = 0;
    a.head.rotation.z = Math.PI + Math.sin(t * 40) * 0.1;
    a.arms[0].rotation.x = a.arms[1].rotation.x = 1.5;
    a.arms[0].rotation.z = -0.35; a.arms[1].rotation.z = 0.35;
    return a;
  }

  dispose() {
    if (!this.on) return;
    for (const a of this.avatars.values()) a.dispose();
    this.emitter.dispose();
  }
}
