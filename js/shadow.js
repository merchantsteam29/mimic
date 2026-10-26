// The shadow (online, Normal mode, a lobby toggle). A shape of darkness with two pinprick eyes. It lives where
// the lights are dead, and it can't go where they work. It comes for whoever is standing in the dark, and a
// flashlight held on it burns it away (for a while). Power cuts are its time; a dead flashlight is an invitation.
// After the power comes back it's gone for good.
// The host runs it and sends it in 'snap' (sd); everyone draws it.
import * as THREE from 'three';

const STATES = ['gone', 'here', 'burn'];
const SPEED = 3.4, R = 0.3, BURN = 1.8;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function makeModel() {
  const dark = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.92, depthWrite: false });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // Layers of soft dark, thickest in the middle, ragged at the edges: no hard outline to it.
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.12, 8, 6), dark);
    m.position.set((Math.random() - 0.5) * 0.25, 0.5 + i * 0.27, (Math.random() - 0.5) * 0.15);
    m.scale.set(1, 1.6, 0.7);
    body.add(m);
  }
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 1.4, 6), dark);
    a.geometry.translate(0, -0.7, 0);
    a.position.set(s * 0.28, 1.9, 0);
    a.rotation.z = s * 0.25;
    body.add(a);
    return a;
  });
  const head = new THREE.Group();
  head.position.y = 2.25;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), dark));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf4f0e4, fog: false });
  const eyes = [-1, 1].map((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), eyeMat); e.position.set(s * 0.06, 0.02, 0.18); head.add(e); return e; });
  body.add(head);
  root.visible = false;
  root.traverse((o) => { o.renderOrder = 2; });
  return { root, body, head, arms, eyes, dark, eyeMat };
}

export class Shadow {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.cd = 60 + Math.random() * 30;
    this.burnT = 0; this.path = []; this.pathT = 0;
    if (!this.on) return;
    this.model = makeModel();
    g.scene.add(this.model.root);
    this.emitter = g.sfx.emitter();
  }

  lit(x, z) { return this.g.mimic.hooks.isLit(x, z) && !this.g.inc.dark(); }

  // Is someone's flashlight on it? (In their beam, close enough, in sight.)
  inBeam(P) {
    if (!P.flashOn || P.hidden) return false;
    const dx = this.x - P.x, dz = this.z - P.z, d = Math.hypot(dx, dz) || 1;
    return d < 14 && (dx * P.lookX + dz * P.lookZ) / d > 0.93 && this.g.level.los(P.x, P.z, this.x, this.z);
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    if (g.power) { this.state = 'gone'; return; } // the lights are back: it's done
    if (this.state === 'gone') {
      if ((this.cd -= dt) > 0) return;
      this.cd = 5;
      const spot = lv.randomFloor((q) => !this.lit(q.x, q.z) && T.every((P) => dist(P, q) > 16 && !lv.los(P.x, P.z, q.x, q.z)));
      if (!spot) return;
      this.x = spot.x; this.z = spot.z; this.burnT = 0;
      this.state = 'here';
      return;
    }
    // Burning in a beam: it pulls back, and if it's held there long enough it's gone.
    const beamed = T.some((P) => this.inBeam(P));
    this.burnT = beamed ? this.burnT + dt : Math.max(0, this.burnT - dt * 0.5);
    this.state = beamed ? 'burn' : 'here';
    if (this.burnT > BURN) { this.state = 'gone'; this.cd = 40 + Math.random() * 30; g.broadcast({ t: 'shadowBurnt' }); return; }
    // Whoever is standing in the dark, nearest first. Hiding doesn't help: it's dark in there too.
    const prey = T.filter((P) => !this.lit(P.x, P.z)).sort((a, b) => dist(a, this) - dist(b, this))[0];
    if (!prey) return;
    if (dist(prey, this) < 0.9) { g.hostCatch(prey.id, 'sd'); this.state = 'gone'; this.cd = 50 + Math.random() * 40; return; }
    const speed = beamed ? -1.2 : SPEED; // shoved back by the light
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, prey.x, prey.z); this.path.push({ x: prey.x, z: prey.z }); this.pathT = 0.7; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, Math.abs(speed) * dt) * Math.sign(speed);
    const next = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    if (this.lit(next.x, next.z)) return; // it won't step into the light
    this.x = next.x; this.z = next.z;
    this.yaw = Math.atan2(prey.x - this.x, prey.z - this.z);
  }

  // [stateIndex, x, z, yaw]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2)]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const appeared = this.state === 'gone' && st !== 'gone';
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  onNet(m) {
    if (m.t !== 'shadowBurnt' || !this.on) return false;
    const c = this.g.camera.position;
    this.emitter.setPos(this.x, 1.5, this.z);
    if (Math.hypot(this.x - c.x, this.z - c.z) < 20) this.g.sfx.hiss(this.emitter);
    return true;
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost) { if (!g.ended) this.think(dt); } else {
      const k = 1 - Math.exp(-dt * 10);
      this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
      this.yaw += angleDiff(this.tyaw, this.yaw) * k;
    }
    if (this.posed) return;
    const m = this.model, here = this.state !== 'gone';
    m.root.visible = here;
    if (!here) return;
    const t = g.t, burn = this.state === 'burn';
    m.root.position.set(this.x, 0, this.z);
    m.root.rotation.y = this.yaw;
    // It never quite holds still; in a beam it shudders and thins out.
    m.body.children.forEach((c, i) => { c.position.x = Math.sin(t * (2 + i * 0.3) + i) * (burn ? 0.12 : 0.05); });
    m.dark.opacity = burn ? 0.55 + Math.random() * 0.25 : 0.92;
    m.arms.forEach((a, i) => { a.rotation.x = -0.5 + Math.sin(t * 1.5 + i) * 0.2; });
    m.head.rotation.z = Math.sin(t * 0.8) * 0.2;
    this.emitter.setPos(this.x, 1.8, this.z);
    const c = g.camera.position;
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, this.x, this.z));
    // A whisper now and then, when it's close.
    const d = Math.hypot(this.x - c.x, this.z - c.z);
    this.whT = (this.whT ?? 3) - dt;
    if (this.whT <= 0 && d < 12) { g.sfx.whisper(this.emitter); this.whT = 3 + Math.random() * 4; }
  }

  nearness(x, z) {
    if (!this.on || this.state === 'gone') return 0;
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 10);
  }

  // The jumpscare: darkness right in front of you, and the eyes.
  poseAt(x, z, yaw, t) {
    if (!this.on) return null;
    const m = this.model;
    this.posed = true;
    m.root.visible = true;
    m.root.position.set(x, -0.5, z);
    m.root.rotation.y = yaw;
    m.dark.opacity = 0.97;
    m.arms.forEach((a) => { a.rotation.x = -1.4; });
    m.eyes.forEach((e) => e.scale.setScalar(2 + Math.sin(t * 30) * 0.3));
    return m;
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    this.emitter.dispose();
  }
}
