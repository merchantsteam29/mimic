// The patient. Alone it lives in the hospital and the asylum; online it's a lobby toggle (Normal mode) and goes
// anywhere. A thin body in a hospital gown, its head wrapped in bandages, lying on a bed, a gurney, a bench, a pew
// (or the floor) like the dead do. There are a few more like it lying about, and those really are dead (decoys, the
// same on every screen). Walk past it and it sits up and watches you go. Run anywhere near it and it gets up and
// follows, at a walk that's faster than it should be. Stop running and get out of its sight, or hide, and it goes
// back and lies down. It takes anyone it reaches while it's up.
// The host runs it and sends it in 'snap' (pt): [state, x, z, yaw, spot]; everyone draws it.
import * as THREE from 'three';
import { mulberry32 } from './level.js';

const STATES = ['gone', 'lie', 'sit', 'follow', 'back'];
const WALK = 3.1, R = 0.3;
// Where a body can lie, and how high: along the prop's z (beds) or x (benches).
const BEDS = { bed: [0.62, 'z'], gurney: [0.86, 'z'], bunk: [0.56, 'z'], tub: [0.3, 'z'], bench: [0.47, 'x'], pew: [0.47, 'x'], sofa: [0.5, 'x'] };
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function makeBody(decoy = false) {
  const skin = new THREE.MeshStandardMaterial({ color: 0xb8ae9c, roughness: 0.75 });
  const gown = new THREE.MeshStandardMaterial({ color: decoy ? 0x7a8a8c : 0x8a9ea2, roughness: 0.95 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 1 });
  const stain = new THREE.MeshBasicMaterial({ color: 0x3a1410 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const limb = (r, len, mat) => { const g = new THREE.CapsuleGeometry(r, len - 2 * r, 4, 8); g.translate(0, -len / 2, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
  const root = new THREE.Group(), hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);
  const legs = [-1, 1].map((s) => { const l = limb(0.055, 0.92, skin); l.position.set(s * 0.1, 0, 0); hips.add(l); return l; });
  const torso = new THREE.Group();
  hips.add(torso);
  const body = mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.62, 10), gown, 0, 0.3, 0);
  torso.add(body, mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.35, 10), gown, 0, -0.12, 0)); // the gown hangs past the hips
  torso.add(mesh(new THREE.BoxGeometry(0.1, 0.12, 0.01), stain, 0.06, 0.3, 0.17));
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.22, 0.56, 0);
    sh.add(limb(0.045, 0.72, skin));
    torso.add(sh);
    return sh;
  });
  const head = new THREE.Group();
  head.position.y = 0.78;
  const skull = mesh(new THREE.SphereGeometry(0.12, 12, 10), wrap);
  skull.scale.set(0.95, 1.15, 1);
  head.add(skull);
  for (let i = 0; i < 4; i++) { const b = mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 14), wrap, 0, -0.06 + i * 0.05, 0); b.rotation.x = Math.PI / 2 + (i % 2 ? 0.25 : -0.2); head.add(b); }
  head.add(mesh(new THREE.BoxGeometry(0.05, 0.02, 0.01), stain, -0.03, 0.02, 0.12)); // where an eye would be, seeping
  torso.add(head);
  return { root, hips, torso, legs, arms, head };
}

// Pose a body: lying (k = 0) on its back, or sitting up (k = 1), or standing (stand).
function pose(m, { lie = 0, stand = false, walk = 0, look = 0 }) {
  m.hips.rotation.set(0, 0, 0);
  m.torso.rotation.set(0, 0, 0);
  m.head.rotation.set(0, look, 0);
  if (stand) {
    m.hips.position.y = 0.92;
    m.torso.rotation.x = 0.25;          // stooped
    m.head.rotation.x = 0.35; m.head.rotation.z = 0.3;
    const sw = Math.sin(walk) * 0.45;
    m.legs[0].rotation.x = sw; m.legs[1].rotation.x = -sw;
    m.arms.forEach((a) => { a.rotation.x = -0.25; a.rotation.z = 0; }); // hanging forward
    return;
  }
  // On its back: the hips are the pivot; legs out flat along +z, torso back along -z, lifting as it sits up.
  m.hips.position.y = 0.1;
  m.legs.forEach((l) => { l.rotation.x = -Math.PI / 2; });
  m.torso.rotation.x = -Math.PI / 2 * (1 - lie);
  m.head.rotation.x = lie ? 0.15 : 0;
  m.arms.forEach((a, i) => { a.rotation.x = lie ? -0.3 : 0; a.rotation.z = (i ? -1 : 1) * 0.12; });
}

export class Patient {
  constructor(g, on) {
    this.g = g;
    this.on = !!on;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0; this.spot = -1;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.cd = 25 + Math.random() * 20;
    this.path = []; this.pathT = 0; this.stateT = 0; this.passed = null; this.lostT = 0;
    this.lie = 0; this.walkPh = 0; this.look = 0;
    if (!this.on) return;
    const lv = g.level;
    // Places to lie: every bed, gurney, bench... in the building; the floor of a room if there are none.
    this.spots = lv.props.filter((p) => BEDS[p.type] && !p.hide).map((p) => {
      const [h, axis] = BEDS[p.type];
      return { x: p.x, z: p.z, h, yaw: p.yaw + (axis === 'x' ? Math.PI / 2 : 0) };
    });
    if (this.spots.length < 4) {
      const r = mulberry32((lv.seed ^ 0x9a71) >>> 0);
      for (const room of lv.rooms.slice(1)) if (r() < 0.6) this.spots.push({ x: (room.cx + 0.5) * 2 + 0.3, z: (room.cz + 0.5) * 2 - 0.4, h: 0, yaw: r() * 6.28 });
    }
    // The dead ones: the same few on every screen (seeded), never where it lies down.
    const r = mulberry32((lv.seed ^ 0x51ee) >>> 0);
    this.decoys = this.spots.filter(() => r() < 0.35).slice(0, 4).map((s) => {
      const m = makeBody(true);
      pose(m, {});
      m.root.position.set(s.x, s.h, s.z);
      m.root.rotation.y = s.yaw;
      m.head.rotation.z = (r() - 0.5) * 1.2;
      g.scene.add(m.root);
      s.taken = true;
      return m;
    });
    this.model = makeBody();
    this.model.root.visible = false;
    g.scene.add(this.model.root);
    this.emitter = g.sfx.emitter();
  }

  set(st) { this.state = st; this.stateT = 0; this.path = []; this.pathT = 0; }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    this.stateT += dt;
    const runner = () => T.filter((P) => !P.hidden && P.running && dist(P, this) < 11).sort((a, b) => dist(a, this) - dist(b, this))[0];
    switch (this.state) {
      case 'gone': {
        if ((this.cd -= dt) > 0 || !T.length) return;
        this.cd = 4;
        const free = this.spots.map((s, i) => [s, i]).filter(([s]) => !s.taken && T.every((P) => dist(P, s) > 14 && !lv.los(P.x, P.z, s.x, s.z)));
        if (!free.length) return;
        const [s, i] = free[Math.floor(Math.random() * free.length)];
        this.spot = i; this.x = s.x; this.z = s.z; this.yaw = s.yaw;
        this.set('lie');
        return;
      }
      case 'lie':
      case 'sit': {
        const run = runner();
        if (run) { this.prey = run.id; this.getUp(); return; }
        const near = T.filter((P) => !P.hidden).sort((a, b) => dist(a, this) - dist(b, this))[0];
        if (this.state === 'lie') {
          // Someone walks right past: once they're a few steps on, it sits up to watch them go.
          if (near && dist(near, this) < 3.2) this.passed = near.id;
          const p = this.passed && T.find((P) => P.id === this.passed);
          if (p && dist(p, this) > 3.8 && dist(p, this) < 9) { this.set('sit'); g.broadcast({ t: 'ptSit' }); }
        } else {
          if (near) this.yawTo = Math.atan2(near.x - this.x, near.z - this.z);
          if (!near || dist(near, this) > 9) { if (this.stateT > 12) { this.passed = null; this.set('lie'); } } else this.stateT = Math.min(this.stateT, 4);
        }
        return;
      }
      case 'follow': {
        const P = T.find((q) => q.id === this.prey);
        const seen = P && !P.hidden && lv.los(P.x, P.z, this.x, this.z) && dist(P, this) < 20;
        this.lostT = seen ? (P.running ? 0 : this.lostT + dt * 0.5) : this.lostT + dt;
        if (!P || P.hidden || this.lostT > 4 || this.stateT > 30) { this.set('back'); return; }
        if (dist(P, this) < 1.0) { g.hostCatch(P.id, 'pt'); this.set('back'); return; }
        this.walk(P.x, P.z, WALK, dt);
        return;
      }
      case 'back': {
        const s = this.spots[this.spot];
        if (!s) { this.set('gone'); return; }
        const run = runner();
        if (run && this.stateT > 2) { this.prey = run.id; this.set('follow'); return; }
        if (dist(s, this) < 0.5 || this.stateT > 25) { this.x = s.x; this.z = s.z; this.yaw = s.yaw; this.passed = null; this.set('lie'); return; }
        this.walk(s.x, s.z, 1.6, dt);
      }
    }
  }

  getUp() {
    const s = this.spots[this.spot];
    this.set('follow');
    this.lostT = 0;
    if (s) { this.x = s.x + Math.sin(s.yaw + Math.PI / 2) * 0.9; this.z = s.z + Math.cos(s.yaw + Math.PI / 2) * 0.9; } // off the side
    this.g.broadcast({ t: 'ptUp' });
  }

  walk(x, z, speed, dt) {
    const lv = this.g.level;
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, x, z); this.path.push({ x, z }); this.pathT = 0.7; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, speed * dt);
    const p = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = p.x; this.z = p.z;
    this.yaw = Math.atan2(dx, dz);
  }

  // [state, x, z, yaw, spot, yawTo]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), this.spot, +(this.yawTo ?? this.yaw).toFixed(2)]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const jump = this.state === 'gone' || st === 'lie' || (st === 'follow' && this.state !== 'follow');
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    this.spot = s[4] | 0; this.yawTo = Number(s[5]) || 0;
    if (jump) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  onNet(m) {
    if (!this.on) return false;
    const g = this.g;
    if (m.t === 'ptSit') { g.sfx.creak(this.emitter, 0.45); return true; }
    if (m.t === 'ptUp') {
      g.sfx.creak(this.emitter, 0.6);
      g.sfx.rec('moan', this.emitter, { vol: 0.9, rate: 0.8 });
      if (Math.hypot(this.x - g.p.x, this.z - g.p.z) < 12 && g.alive(g.me)) g.sfx.sting(this.emitter);
      return true;
    }
    return false;
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && !g.ended) this.think(dt);
    else if (this.state === 'follow' || this.state === 'back') {
      const k = 1 - Math.exp(-dt * 10);
      this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
      this.yaw += angleDiff(this.tyaw, this.yaw) * k;
    }
    if (this.posed) return;
    const m = this.model, s = this.spots[this.spot];
    m.root.visible = this.state !== 'gone';
    if (!m.root.visible) return;
    const up = this.state === 'follow' || this.state === 'back';
    if (up) {
      const moved = Math.hypot(this.x - (this.lx ?? this.x), this.z - (this.lz ?? this.z));
      this.walkPh += moved * 3;
      if ((this.stepD = (this.stepD ?? 0) + moved) > 0.8) { this.stepD = 0; g.sfx.footstep(this.emitter, { vol: 0.7, surface: g.level.surfaceAt(this.x, this.z) }); }
      m.root.position.set(this.x, 0, this.z);
      m.root.rotation.y = this.yaw;
      pose(m, { stand: true, walk: this.walkPh });
    } else if (s) {
      this.lie += ((this.state === 'sit' ? 1 : 0) - this.lie) * Math.min(1, dt * (this.state === 'sit' ? 2.5 : 1));
      m.root.position.set(s.x, s.h, s.z);
      m.root.rotation.y = s.yaw;
      const want = this.state === 'sit' ? angleDiff((this.g.isHost ? this.yawTo : this.yawTo) ?? s.yaw, s.yaw) : 0;
      this.look += (Math.max(-1.3, Math.min(1.3, want)) - this.look) * Math.min(1, dt * 2);
      pose(m, { lie: this.lie, look: this.look });
    }
    this.lx = this.x; this.lz = this.z;
    this.emitter.setPos(this.x, 1.2, this.z);
    const c = g.camera.position;
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, this.x, this.z));
  }

  nearness(x, z) {
    if (!this.on || (this.state !== 'follow' && this.state !== 'sit')) return 0;
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 10);
  }

  // The jumpscare: standing over you, its wrapped face coming down to yours.
  poseAt(x, z, yaw, t) {
    if (!this.on) return null;
    const m = this.model;
    this.posed = true;
    m.root.visible = true;
    m.root.position.set(x, 0, z);
    m.root.rotation.y = yaw;
    pose(m, { stand: true });
    m.torso.rotation.x = 0.6;
    m.head.rotation.set(-0.2, 0, Math.sin(t * 28) * 0.15);
    m.arms.forEach((a, i) => { a.rotation.x = -1.6; a.rotation.z = (i ? -1 : 1) * 0.3; });
    return m;
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    for (const d of this.decoys) d.root.removeFromParent();
    this.emitter.dispose();
  }
}
