// The skinwalker (online, Normal mode, a lobby toggle). It wears a friend who is still ALIVE: their
// body, their flashlight, their voice (their own clips). It finds someone far from the real friend and
// waits for them at the edge of the light, calling. The tells, if you look:
//   - when nobody is looking at it, it moves on all fours (you might catch it at the edge of your view)
//   - its eyes shine in your flashlight; a person's don't
//   - up close, its head sits wrong
//   - the real friend's voice comes from somewhere else
// Walk up to it, or stare at it with your light, and it drops the act: it stretches, its head turns
// all the way around, and it runs you down on all fours.
// The host runs it and sends it in 'snap' (sw); everyone draws it.
import * as THREE from 'three';
import { RemotePlayer } from './remote.js';

const STATES = ['gone', 'roam', 'lure', 'reveal', 'chase', 'leave'];
const WALK = 2.2, CRAWL = 3.8, RUN = 4.6;
const R = 0.3;
const PALE = new THREE.Color(0xc8c4b4);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Skinwalker {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.wearId = null; this.victimId = null;
    this.crawl = false;
    this.cd = 75 + Math.random() * 45;   // host: seconds until it first shows up
    this.stateT = 0; this.speakT = 2; this.lookT = 0; this.lostT = 0; this.pathT = 0;
    this.path = [];
    this.avatars = new Map();            // wearId -> a copy of that friend's body
    this.emitter = g.sfx.emitter();
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); // shines in a flashlight beam
    this.v = new THREE.Vector3();
  }

  // A copy of that player's body, with eyes that catch the light.
  avatar(id) {
    let a = this.avatars.get(id);
    if (!a) {
      a = new RemotePlayer(this.g.scene, this.g.sfx, Math.max(0, this.g.order.indexOf(id)), this.g.lookOf(id)); // even their clothes
      a.eyes = [-1, 1].map((s) => {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), this.eyeMat);
        e.position.set(s * 0.045, 0.015, -0.12);
        a.head.add(e);
        return e;
      });
      // A thin mouth that splits open when it stops pretending.
      a.mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.03), new THREE.MeshBasicMaterial({ color: 0x050000 }));
      a.mouth.position.set(0, -0.06, -0.11);
      a.head.add(a.mouth);
      a.skin = a.head.children[0].material;
      a.skinColor = a.skin.color.clone();
      a.seen = true;
      this.avatars.set(id, a);
    }
    return a;
  }

  set(state) { this.state = state; this.stateT = 0; this.path = []; this.pathT = 0; }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level;
    const T = g.targets();
    const byId = (id) => T.find((p) => p.id === id);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const sees = (P, max = 25) => dist(P, this) < max && lv.los(P.x, P.z, this.x, this.z);
    // Someone has it in front of them (roughly in view), not just in line of sight.
    const looking = () => T.some((P) => {
      if (P.hidden || !sees(P)) return false;
      const d = dist(P, this) || 1;
      return (P.lookX * (this.x - P.x) + P.lookZ * (this.z - P.z)) / d > 0.55;
    });
    this.stateT += dt;
    const V = byId(this.victimId), W = byId(this.wearId);

    switch (this.state) {
      case 'gone': {
        if (g.power) return; // after the power comes back, it's the mimic's night
        this.cd -= dt;
        if (this.cd > 0) return;
        this.cd = 6; // try again soon if there's no way to set it up
        const free = T.filter((P) => !P.hidden);
        if (free.length < 1 || T.length < 2) return;
        const v = free[Math.floor(Math.random() * free.length)];
        const w = T.filter((P) => P.id !== v.id).sort((a, b) => dist(b, v) - dist(a, v))[0];
        if (!w || dist(w, v) < 14) return;
        const spot = lv.randomFloor((q) => {
          const d = dist(q, v);
          return d > 11 && d < 22 && T.every((P) => dist(P, q) > 28 || !lv.los(P.x, P.z, q.x, q.z));
        });
        if (!spot) return;
        this.x = spot.x; this.z = spot.z;
        this.victimId = v.id; this.wearId = w.id;
        this.set('roam');
        return;
      }
      case 'roam': {
        if (!V || V.hidden || this.stateT > 70) { this.set('leave'); return; }
        if (W && dist(W, V) < 9) { this.set('leave'); return; } // the real one is right there
        if (dist(V, this) < 9 && sees(V)) { this.set('lure'); this.speakT = 0.6; return; }
        this.crawl = !looking();
        this.walk(V.x, V.z, this.crawl ? CRAWL : WALK, dt);
        return;
      }
      case 'lure': {
        if (!V || V.hidden || this.stateT > 40) { this.set('leave'); return; }
        // It never lets you see it next to the one it's wearing.
        if (W && (sees(W, 20) || dist(W, V) < 8)) { this.set('leave'); return; }
        this.crawl = false;
        const d = dist(V, this);
        this.yaw = Math.atan2(-(V.x - this.x), -(V.z - this.z));
        if (d < 3.2) { this.reveal(); return; }
        // Stared at, with a light, from close enough to see its eyes.
        const lit = V.flashOn && (V.lookX * (this.x - V.x) + V.lookZ * (this.z - V.z)) / (d || 1) > 0.95;
        this.lookT = lit && d < 12 ? this.lookT + dt : Math.max(0, this.lookT - dt * 0.5);
        if (this.lookT > 2.6) { this.reveal(); return; }
        this.lostT = sees(V) ? 0 : this.lostT + dt;
        if (this.lostT > 4) { this.set('roam'); return; }
        // Backs away into the dark as you come, slowly, so you follow.
        if (d < 6) this.walk(this.x - (V.x - this.x), this.z - (V.z - this.z), 0.7, dt, false);
        this.speakT -= dt;
        if (this.speakT <= 0) { this.speakT = 4.5 + Math.random() * 4; this.say(); }
        return;
      }
      case 'reveal':
        if (this.stateT > 1.1) { this.set('chase'); this.lostT = 0; }
        return;
      case 'chase': {
        const prey = V && !V.hidden ? V : T.filter((P) => !P.hidden && sees(P)).sort((a, b) => dist(a, this) - dist(b, this))[0];
        if (!prey || this.stateT > 12) { this.set('leave'); return; }
        this.victimId = prey.id;
        this.crawl = true;
        if (dist(prey, this) < 1.0) { g.hostCatch(prey.id, 'sw'); this.set('leave'); return; }
        this.lostT = sees(prey) ? 0 : this.lostT + dt;
        if (this.lostT > 3) { this.set('leave'); return; }
        this.walk(prey.x, prey.z, RUN, dt);
        return;
      }
      case 'leave': {
        this.crawl = !looking();
        if (!this.goal) this.goal = lv.randomFloor((q) => T.every((P) => dist(P, q) > 16));
        if (this.goal) this.walk(this.goal.x, this.goal.z, CRAWL, dt);
        if ((this.stateT > 2 && !T.some((P) => sees(P, 30))) || this.stateT > 15) {
          this.goal = null; this.wearId = null; this.victimId = null; this.lookT = 0;
          this.cd = 45 + Math.random() * 45;
          this.set('gone');
        }
        return;
      }
    }
  }

  reveal() {
    this.set('reveal');
    this.lookT = 0;
    this.g.broadcast({ t: 'swReveal' });
  }

  // Its friend's own words. Nobody else's: a quiet friend is just as wrong.
  say() {
    const mp = this.g.mp, w = this.wearId;
    if (!mp) return;
    const has = [...mp.clips.values()].some((c) => c.owner === w);
    if (!has) return;
    const key = mp.pickKey(() => false, w, 'lure');
    if (mp.clips.get(key)?.owner === w) this.g.broadcast({ t: 'swSay', key });
  }

  // Head for (x, z) along a path, opening doors on the way like a person would.
  walk(x, z, speed, dt, turn = true) {
    const lv = this.g.level;
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, x, z); this.pathT = 1.2; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.35) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const cx = lv.cellOf(wp.x), cz = lv.cellOf(wp.z);
    const door = lv.idoors.find((d) => !d.open && lv.cellOf(d.x) === cx && lv.cellOf(d.z) === cz);
    if (door) { this.g.broadcast({ t: 'doorSet', i: door.i, open: true, by: 'm' }); }
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    const p = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = p.x; this.z = p.z;
    if (turn) this.yaw += angleDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 8);
  }

  // [stateIndex, x, z, yaw, wearIndex (-1 = none), crawl]
  snap() {
    return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), this.g.order.indexOf(this.wearId), this.crawl ? 1 : 0];
  }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const wear = this.g.order[s[4] | 0];
    const appeared = this.state === 'gone' && st !== 'gone';
    if (st !== this.state) this.stateT = 0;
    this.state = st;
    this.wearId = s[4] >= 0 && wear ? wear : null;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
    this.crawl = !!s[5];
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
    const shown = this.state !== 'gone' && this.wearId;
    for (const [id, a] of this.avatars) if (!shown || id !== this.wearId) { a.status = 'gone'; a.update(dt, g.level.theme.surface); }
    if (!shown) return;
    const a = this.avatar(this.wearId), wild = this.state === 'reveal' || this.state === 'chase';
    a.status = 'alive'; a.hidden = -1; a.seen = true; a.pitch = 0;
    a.flash = !this.crawl && !wild;
    a.crouch = this.crawl; // (quiet steps on all fours)
    a.tx = this.x; a.tz = this.z; a.tyaw = this.yaw;
    a.update(dt, g.level.theme.surface);
    this.emitter.setPos(a.x, 1.5, a.z);
    const c = g.camera.position;
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, a.x, a.z));
    this.pose(a, wild, dt);
    // Eyes: they shine when your flashlight finds them (and burn once it drops the act).
    let shine = wild ? 1 : 0;
    if (!wild && g.p.flashOn && g.p.battery > 0 && !g.p.hidden) {
      a.head.getWorldPosition(this.v);
      const dx = this.v.x - c.x, dy = this.v.y - c.y, dz = this.v.z - c.z, d = Math.hypot(dx, dy, dz);
      const fd = g.flashDir;
      if (d < 16 && (dx * fd.x + dy * fd.y + dz * fd.z) / d > 0.93 && g.level.los(c.x, c.z, a.x, a.z)) shine = 1 - d / 20;
    }
    this.eyeMat.color.setRGB(shine * (wild ? 1 : 0.8), shine * (wild ? 0.15 : 0.95), shine * (wild ? 0.1 : 0.75));
  }

  // On all fours, stretched, head turned the wrong way. Applied on top of the normal walk cycle.
  pose(a, wild, dt) {
    const near = Math.hypot(a.x - this.g.camera.position.x, a.z - this.g.camera.position.z) < 3.5;
    const t = this.g.t;
    // Its limbs are too long once it stops pretending.
    for (const l of [...a.arms, ...a.legs]) l.scale.y = wild ? 1.6 : 1;
    a.mouth.scale.y = wild ? 7 + Math.sin(t * 23) * 2 : 1;
    for (const e of a.eyes) e.scale.setScalar(wild ? 1.8 : 1);
    a.skin.color.copy(a.skinColor).lerp(PALE, wild ? 1 : 0);
    if (this.crawl || wild) {
      // Low and spread out, back high, face up and forward.
      a.body.rotation.x = -1.2;
      a.body.position.y = wild ? 0.55 : 0.3;
      a.head.rotation.x = 1.2;
      const sw = Math.sin(a.phase * 1.4) * Math.min(1, a.speed / 2);
      a.arms[0].rotation.x = 2.0 + sw; a.arms[1].rotation.x = 2.0 - sw;
      a.arms[0].rotation.z = -0.5; a.arms[1].rotation.z = 0.5;
      a.legs[0].rotation.x = 0.9 - sw * 0.5; a.legs[1].rotation.x = 0.9 + sw * 0.5;
    } else {
      a.body.rotation.x = 0;
      a.arms[0].rotation.z = a.arms[1].rotation.z = 0;
    }
    a.head.rotation.y = 0;
    // Upside down when it hunts; up close while pretending, it just sits wrong.
    a.head.rotation.z = wild ? Math.PI + Math.sin(t * 31) * 0.25 : near ? 0.55 + Math.sin(t * 25) * 0.12 : 0;
  }

  // The jumpscare: it's in your face, wearing your friend.
  poseAt(x, z, yaw, t) {
    const a = this.wearId && this.avatar(this.wearId);
    if (!a) return null;
    this.posed = true;
    a.status = 'alive'; a.hidden = -1; a.flash = false;
    a.tx = a.x = x; a.tz = a.z = z; a.tyaw = a.yaw = yaw;
    a.update(0.016, this.g.level.theme.surface);
    this.crawl = false;
    this.pose(a, true, 0);
    // Standing over you, bent down into your face, reaching. The head hangs upside down.
    a.body.rotation.x = -0.5;
    a.body.position.y = 0;
    a.head.rotation.x = 0.55;
    a.head.rotation.z = Math.PI + Math.sin(t * 40) * 0.1;
    a.arms[0].rotation.x = a.arms[1].rotation.x = 1.5;
    a.arms[0].rotation.z = -0.35; a.arms[1].rotation.z = 0.35;
    this.eyeMat.color.setRGB(1, 0.15, 0.1);
    return a;
  }

  onNet(m) {
    const g = this.g;
    switch (m.t) {
      case 'swSay': {
        const c = g.mp?.clips.get(m.key);
        if (!c) return true;
        const d = g.sfx.playVoice(c.buffer, this.emitter, 'lure');
        g.voice.suppress(d + 0.3);
        return true;
      }
      case 'swReveal':
        g.sfx.rec('snarl', this.emitter, { vol: 1.2 });
        if (Math.hypot(this.x - g.p.x, this.z - g.p.z) < 14 && g.alive(g.me)) g.sfx.sting(this.emitter);
        return true;
    }
    return false;
  }

  dispose() {
    for (const a of this.avatars.values()) a.dispose();
    this.emitter.dispose();
  }
}
