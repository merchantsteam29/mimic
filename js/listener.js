// The blind listener (online, Normal mode, a lobby toggle). It has no eyes. It hears: footsteps
// (walking a little, running a lot), doors, generators, and above all voices, both what you say on voice
// chat and the mimic's lures. Stand still and crouch and it can pass right by you. It clicks as it
// goes, faster when it has heard something, so you can hear it coming.
//   roam   - wanders slowly, clicking
//   listen - froze at a sound, head tilted, then goes to look
//   rush   - running at where the sound came from
//   search - feeling around that spot for a few seconds
// Anyone it walks into is taken. The host runs it and sends it in 'snap' (ls); everyone draws it.
import * as THREE from 'three';
import { skinNormal } from './textures.js';

const STATES = ['gone', 'roam', 'listen', 'rush', 'search'];
const ROAM = 1.2, STALK = 2.4, RUSH = 4.7;
const R = 0.35;
const EARS = 1.35; // it hears this much further than the mimic does
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Tall, thin, eyeless, arms to the knees. Its long smooth head is two halves: when it's after something they
// part down the middle like a mouth, wet and red inside, lined with teeth.
function makeModel() {
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a7e76, roughness: 0.5, normalMap: skinNormal(), normalScale: new THREE.Vector2(0.9, 0.9) });
  const dark = new THREE.MeshStandardMaterial({ color: 0x140808, roughness: 0.9 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x5a1012, emissive: 0x1a0204, roughness: 0.3 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.4 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const limb = (w, h, mat) => { const g = new THREE.CylinderGeometry(w * 0.6, w, h, 6); g.translate(0, -h / 2, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const torso = mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.85, 7), skin, 0, 1.72, 0);
  body.add(torso);
  for (let i = 0; i < 5; i++) body.add(mesh(new THREE.BoxGeometry(0.31 - i * 0.02, 0.025, 0.2), skin, 0, 1.95 - i * 0.09, 0.03)); // ribs
  const head = new THREE.Group();
  head.position.set(0, 2.22, -0.08);
  head.scale.set(0.9, 1.55, 1.05);
  const inner = mesh(new THREE.SphereGeometry(0.125, 12, 10), flesh);
  head.add(inner);
  // Two halves hinged at the back of the head. Left: phi -90..90 deg (front -z round to the back), right: the rest.
  const halves = [-1, 1].map((s) => {
    const hinge = new THREE.Group();
    hinge.position.z = 0.15;
    const shell = mesh(new THREE.SphereGeometry(0.15, 14, 10, s < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), skin, 0, 0, -0.15);
    hinge.add(shell);
    // Teeth along the edge, pointing in.
    for (let i = 0; i < 9; i++) {
      const y = -0.11 + i * 0.027, w = Math.sqrt(Math.max(0, 0.0225 - y * y));
      const tooth = mesh(new THREE.ConeGeometry(0.007, 0.03, 4), bone, s * 0.006, y, -0.15 - w * 0.9);
      tooth.rotation.z = s * Math.PI / 2;
      hinge.add(tooth);
    }
    const ear = mesh(new THREE.SphereGeometry(0.07, 8, 6), skin, s * 0.13, 0.02, -0.15);
    ear.scale.set(0.4, 1.0, 0.8);
    hinge.add(ear);
    head.add(hinge);
    return hinge;
  });
  body.add(head);
  // Bumps of spine down its back, and claws.
  for (let i = 0; i < 7; i++) body.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), skin, 0, 2.08 - i * 0.12, 0.13));
  const legs = [-1, 1].map((s) => { const l = limb(0.07, 1.3, skin); l.position.set(s * 0.1, 1.32, 0); body.add(l); return l; });
  const arms = [-1, 1].map((s) => {
    const a = limb(0.055, 1.35, skin); a.position.set(s * 0.21, 2.06, 0); a.rotation.z = s * 0.12; body.add(a);
    for (let f = -1; f <= 1; f++) { const c = mesh(new THREE.ConeGeometry(0.012, 0.22, 4), bone, f * 0.025, -1.45, 0); c.rotation.x = Math.PI; a.add(c); }
    return a;
  });
  root.visible = false;
  return { root, body, head, halves, legs, arms };
}

export class Listener {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.cd = 50 + Math.random() * 30; // host: seconds until it first comes
    this.stateT = 0; this.pathT = 0; this.path = [];
    this.goal = null;      // where the sound was
    this.heardBy = null;   // who made it, and when (to find someone hiding who talked)
    this.clickT = 1; this.phase = 0; this.stepD = 0; this.speed = 0;
    if (!this.on) return;
    this.model = makeModel();
    g.scene.add(this.model.root);
    this.emitter = g.sfx.emitter();
  }

  set(state) { this.state = state; this.stateT = 0; this.path = []; this.pathT = 0; }

  // Host: a sound at (x, z) that the mimic could hear from radius r. Louder sounds reach it from further.
  hear(x, z, r, kind = 'step', from = null) {
    if (!this.on || !this.g.isHost || this.state === 'gone') return;
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > r * EARS) return;
    if (from) this.heardBy = { id: from, kind, t: this.g.t };
    this.goal = { x, z };
    if (this.state === 'rush' || this.state === 'search') { this.path = []; if (d < 9) this.set('rush'); return; }
    // Close or loud: it runs. Otherwise it stops to listen first.
    this.slow = false;
    this.set(d < 7 || (kind === 'voice' && r > 12) ? 'rush' : 'listen');
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    this.stateT += dt;
    // Whoever it walks into. Hidden players only if it came for a sound they made in there.
    if (this.state !== 'gone') for (const P of T) {
      const hid = P.hidden;
      if (!hid && dist(P, this) < 0.95) { g.hostCatch(P.id, 'ls'); this.set('search'); return; }
      if (hid && this.heardBy?.id === P.id && g.t - this.heardBy.t < 3 && dist(hid.front, this) < 1.3) { g.hostCatch(P.id, 'ls'); this.set('search'); return; }
    }
    switch (this.state) {
      case 'gone': {
        this.cd -= dt;
        if (this.cd > 0) return;
        this.cd = 5;
        const spot = lv.randomFloor((q) => T.every((P) => dist(P, q) > 24 && !lv.los(P.x, P.z, q.x, q.z)));
        if (!spot) return;
        this.x = spot.x; this.z = spot.z;
        this.set('roam');
        return;
      }
      case 'roam':
        if (!this.wander || dist(this.wander, this) < 1 || this.stateT > 25) {
          this.wander = lv.randomFloor((q) => dist(q, this) > 6 && dist(q, this) < 20);
          this.stateT = 0;
        }
        if (this.wander) this.walk(this.wander.x, this.wander.z, ROAM, dt);
        return;
      case 'listen':
        if (this.stateT > 1.3) { this.set('rush'); this.slow = true; }
        return;
      case 'rush': {
        if (!this.goal) { this.set('roam'); return; }
        this.walk(this.goal.x, this.goal.z, this.slow ? STALK : RUSH, dt);
        if (dist(this.goal, this) < 0.8 || this.stateT > 14) { this.slow = false; this.set('search'); }
        return;
      }
      case 'search': {
        // Feels around the spot, slowly.
        if (!this.feel || dist(this.feel, this) < 0.4) {
          const c = this.goal || this;
          this.feel = lv.collide({ x: c.x + (Math.random() - 0.5) * 4, z: c.z + (Math.random() - 0.5) * 4 }, R);
        }
        this.walk(this.feel.x, this.feel.z, 0.9, dt);
        if (this.stateT > 6) { this.goal = null; this.feel = null; this.set('roam'); }
        return;
      }
    }
  }

  walk(x, z, speed, dt) {
    const lv = this.g.level;
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, x, z); this.path.push({ x, z }); this.pathT = 1; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const cx = lv.cellOf(wp.x), cz = lv.cellOf(wp.z);
    const door = lv.idoors.find((d) => !d.open && lv.cellOf(d.x) === cx && lv.cellOf(d.z) === cz && !(d.jamUntil > this.g.t));
    if (door) this.g.broadcast({ t: 'doorSet', i: door.i, open: true, by: 'm' });
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    const p = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = p.x; this.z = p.z;
    this.yaw += angleDiff(Math.atan2(-dx, -dz), this.yaw) * Math.min(1, dt * 6);
  }

  // [stateIndex, x, z, yaw]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2)]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const appeared = this.state === 'gone' && st !== 'gone';
    if (st !== this.state) this.stateT = 0;
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g, ox = this.x, oz = this.z;
    if (g.isHost) { if (!g.ended) this.think(dt); } else {
      this.stateT += dt;
      const k = 1 - Math.exp(-dt * 12);
      this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
      this.yaw += angleDiff(this.tyaw, this.yaw) * k;
    }
    if (this.posed) return; // the jumpscare has it
    const m = this.model, here = this.state !== 'gone';
    m.root.visible = here;
    if (!here) return;
    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.speed += ((moved / Math.max(dt, 1e-3)) - this.speed) * Math.min(1, dt * 8);
    this.phase += moved * 2.2;
    m.root.position.set(this.x, 0, this.z);
    m.root.rotation.y = this.yaw;
    const sw = Math.sin(this.phase) * Math.min(1, this.speed / 1.5);
    m.legs[0].rotation.x = sw * 0.5; m.legs[1].rotation.x = -sw * 0.5;
    m.arms[0].rotation.x = -sw * 0.35; m.arms[1].rotation.x = sw * 0.35;
    const t = g.t, still = this.state === 'listen' || this.state === 'search';
    m.body.rotation.x = this.state === 'rush' ? -0.45 : -0.2;  // hunched forward (it faces -z), lower when running
    // Listening: head cocked, twitching toward the sound.
    m.head.rotation.z = still ? 0.6 + Math.sin(t * 17) * 0.12 : Math.sin(t * 1.3) * 0.15;
    m.head.rotation.x = still ? 0.25 : -0.1; // face tipped up while it listens
    // The head parts when it's after something; it twitches open a crack while it listens.
    this.open = this.state === 'rush' ? 0.45 + Math.sin(t * 19) * 0.12 : still ? Math.max(0, Math.sin(t * 7)) * 0.12 : 0;
    m.halves[0].rotation.y = this.open; m.halves[1].rotation.y = -this.open;
    this.emitter.setPos(this.x, 2.1, this.z);
    const c = g.camera.position;
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, this.x, this.z));
    // It clicks to find its way, faster when it's after something.
    this.clickT -= dt;
    if (this.clickT <= 0) {
      const busy = this.state === 'rush' || this.state === 'search';
      g.sfx.clicks(this.emitter, busy ? 5 : 3, busy ? 1 : 0.6);
      this.clickT = busy ? 0.8 + Math.random() * 0.5 : 1.8 + Math.random() * 1.6;
    }
    this.stepD += moved;
    if (this.stepD > (this.speed > 3 ? 1.7 : 1.2)) { this.stepD = 0; g.sfx.footstep(this.emitter, { vol: this.speed > 3 ? 0.9 : 0.35 }); }
  }

  // How close it is, 0..1, for the fear and the dread drone.
  nearness(x, z) {
    if (!this.on || this.state === 'gone') return 0;
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 12);
  }

  // The jumpscare: it bends right down into your face, mouth open.
  poseAt(x, z, yaw, t) {
    if (!this.on) return null;
    const m = this.model;
    this.posed = true;
    m.root.visible = true;
    m.root.position.set(x, 0, z);
    m.root.rotation.y = yaw + Math.PI; // (the game passes the mimic's facing; this model faces -z)
    m.body.rotation.x = -0.28; // towering over you, bent down into your face
    m.head.rotation.set(-0.65, 0, Math.sin(t * 40) * 0.1);
    const o = 0.95 + Math.sin(t * 30) * 0.06; // split wide open
    m.halves[0].rotation.y = o; m.halves[1].rotation.y = -o;
    m.arms[0].rotation.x = m.arms[1].rotation.x = 1.2; // reaching for you
    return m;
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    this.emitter.dispose();
  }
}
