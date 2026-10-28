// The fairground's moving parts (fair theme only, alone and online):
// - the Ferris wheel, past the edge of the map, too big to miss: only its bulbs show through the fog, turning
//   slowly, a few of them dead. It creaks.
// - the ghost train: a loop of track round one room (level.fair.ghost). Every minute or so the host broadcasts
//   'ride' and the car goes round once with nobody in it (a skeleton sits in the back), rattling, and a cackle
//   from the speaker on the front. The host makes noise where it is, so it draws the mimic: use it.
// - the music: every minute and a half or so the host broadcasts 'calliope' {d}: a wheezing organ waltz from the
//   speaker poles for d seconds. While it plays your steps carry half as far (stepScale).
import * as THREE from 'three';
import { CELL } from './level.js';

const RIDE = 2.4; // m/s

function wheel() {
  const root = new THREE.Group(), spin = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.5 });
  const R = 11;
  for (const z of [-0.8, 0.8]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 48), iron);
    rim.position.z = z;
    spin.add(rim);
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, R, 0.08), iron);
      const a = (i / 16) * Math.PI * 2;
      sp.position.set(Math.sin(a) * R / 2, Math.cos(a) * R / 2, z);
      sp.rotation.z = -a;
      spin.add(sp);
    }
  }
  // Bulbs round the rim: they ignore the fog, so you see the wheel from anywhere. Some are dead.
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false }), 48);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < 48; i++) {
    if (Math.random() < 0.22) continue;
    const a = (i / 48) * Math.PI * 2;
    bulbs.setMatrixAt(n++, m4.makeTranslation(Math.sin(a) * R, Math.cos(a) * R, 0.9));
  }
  bulbs.count = n;
  spin.add(bulbs);
  // The cars, hanging level as it turns.
  const cars = [];
  const paint = new THREE.MeshStandardMaterial({ color: 0x5a2a20, roughness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.3), paint);
    c.userData.a = (i / 12) * Math.PI * 2;
    spin.add(c);
    cars.push(c);
  }
  root.add(spin);
  for (const s of [-1, 1]) { // the A-frame legs
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, R + 3, 0.3), iron);
    leg.position.set(s * 3.2, -(R + 3) / 2 + 0.6, 1.4);
    leg.rotation.z = s * 0.28;
    root.add(leg);
  }
  return { root, spin, cars, R };
}

// The ghost train's car: a little black cart with a bat-winged front, a speaker grille, and a passenger.
function car() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x141012, roughness: 0.6, metalness: 0.2 });
  const red = new THREE.MeshStandardMaterial({ color: 0x6a1010, roughness: 0.5 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc8bea4, roughness: 0.7 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.9, 0.5, 1.4), black, 0, 0.35, 0);
  add(new THREE.BoxGeometry(0.92, 0.08, 1.42), red, 0, 0.62, 0);
  const wing = add(new THREE.ConeGeometry(0.5, 0.6, 3), black, 0, 0.8, 0.65);
  wing.rotation.x = Math.PI / 2; wing.scale.set(1.6, 1, 0.3);
  for (const x of [-0.3, 0.3]) for (const z of [-0.5, 0.5]) { const w = add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), black, x * 1.6, 0.12, z); w.rotation.z = Math.PI / 2; }
  // The passenger: a skeleton in the back seat, slumped, one hand up.
  add(new THREE.SphereGeometry(0.13, 10, 8), bone, 0, 1.15, -0.35);
  add(new THREE.CylinderGeometry(0.1, 0.13, 0.45, 8), bone, 0, 0.82, -0.38);
  const arm = add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), bone, 0.2, 1.1, -0.3);
  arm.rotation.z = -0.5;
  return g;
}

export class Fair {
  constructor(g) {
    this.g = g;
    const lv = g.level;
    this.on = !!lv.theme.fair;
    this.musicUntil = 0;
    if (!this.on) return;
    const S = lv.N * CELL;
    this.wheel = wheel();
    this.wheel.root.position.set(S / 2, this.wheel.R + 2, -9);
    g.scene.add(this.wheel.root);
    this.wheelEm = g.sfx.emitter();
    this.wheelEm.setPos(S / 2, 3, 0);
    this.creakT = 4;
    // The ghost train: a loop just inside the walls of its room.
    const r = lv.rooms[lv.fair?.ghost];
    this.cdRide = 40 + Math.random() * 30; // host
    this.cdMusic = 30 + Math.random() * 25;
    if (r) {
      const x0 = r.x * CELL + 0.9, x1 = (r.x + r.w) * CELL - 0.9, z0 = r.z * CELL + 0.9, z1 = (r.z + r.h) * CELL - 0.9;
      this.loop = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      this.loopLen = 2 * (x1 - x0 + z1 - z0);
      const rail = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.4, metalness: 0.8 });
      this.loop.forEach(([ax, az], i) => {
        const [bx, bz] = this.loop[(i + 1) % 4], len = Math.hypot(bx - ax, bz - az);
        for (const off of [-0.32, 0.32]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(len + 0.64, 0.05, 0.06), rail);
          const h = ax === bx;
          m.position.set((ax + bx) / 2 + (h ? off : 0), 0.03, (az + bz) / 2 + (h ? 0 : off));
          m.rotation.y = h ? Math.PI / 2 : 0;
          g.scene.add(m);
          (this.rails ||= []).push(m);
        }
      });
      this.car = car();
      this.place(0);
      g.scene.add(this.car);
      this.carEm = g.sfx.emitter();
    }
    this.speakers = lv.lights.slice(0, 3).map(() => g.sfx.emitter());
    this.ride = null; // { s } metres along the loop while it's going
  }

  // While the music plays, footsteps carry half as far.
  get stepScale() { return this.g.t < this.musicUntil ? 0.5 : 1; }

  place(s) {
    const L = this.loop;
    s = ((s % this.loopLen) + this.loopLen) % this.loopLen;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = L[i], [bx, bz] = L[(i + 1) % 4], len = Math.hypot(bx - ax, bz - az);
      if (s <= len) {
        const k = s / len;
        this.car.position.set(ax + (bx - ax) * k, 0, az + (bz - az) * k);
        this.car.rotation.y = Math.atan2(bx - ax, bz - az);
        return;
      }
      s -= len;
    }
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g;
    if (this.car && !this.ride && (this.cdRide -= dt) <= 0) { this.cdRide = 55 + Math.random() * 35; g.broadcast({ t: 'ride' }); }
    if (this.ride && (this.noiseT = (this.noiseT ?? 0) - dt) <= 0) { this.noiseT = 1; g.mimic.hear(this.car.position.x, this.car.position.z, 16, 'step'); g.ls.hear(this.car.position.x, this.car.position.z, 16, 'step'); }
    if (g.t >= this.musicUntil && (this.cdMusic -= dt) <= 0) { this.cdMusic = 80 + Math.random() * 40; g.broadcast({ t: 'calliope', d: 40 }); }
  }

  onNet(m) {
    if (!this.on) return false;
    const g = this.g;
    if (m.t === 'ride') {
      if (!this.car) return true;
      this.ride = { s: 0 };
      this.carEm.setPos(this.car.position.x, 0.8, this.car.position.z);
      g.sfx.cackle(this.carEm);
      return true;
    }
    if (m.t === 'calliope') {
      const d = Math.max(5, Math.min(60, Number(m.d) || 40));
      this.musicUntil = g.t + d;
      const lights = g.world.fixtures;
      const c = g.camera.position;
      // From the speaker poles nearest you.
      lights.slice().sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, this.speakers.length)
        .forEach((L, i) => { this.speakers[i].setPos(L.x, 3, L.z); g.sfx.calliope(this.speakers[i], d, i); });
      if (!this.toldMusic && g.state === 'playing') { this.toldMusic = true; g.toast('The music came on. It covers your footsteps.'); }
      return true;
    }
    return false;
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && !g.ended) this.think(dt);
    const w = this.wheel;
    w.spin.rotation.z += dt * 0.05;
    for (const c of w.cars) { const a = c.userData.a; c.position.set(Math.sin(a) * w.R, Math.cos(a) * w.R - 0.9, 0); c.rotation.z = -w.spin.rotation.z; }
    if ((this.creakT -= dt) <= 0) { this.creakT = 6 + Math.random() * 8; g.sfx.creak(this.wheelEm, 0.35); }
    if (this.ride) {
      this.ride.s += RIDE * dt;
      this.place(this.ride.s);
      const p = this.car.position;
      this.carEm.setPos(p.x, 0.8, p.z);
      this.carEm.setOcclusion(!g.level.los(g.camera.position.x, g.camera.position.z, p.x, p.z));
      if ((this.rattleT = (this.rattleT ?? 0) - dt) <= 0) { this.rattleT = 0.22; g.sfx.rec('metal', this.carEm, { vol: 0.35, rate: 1.4 }) || g.sfx.clink?.(this.carEm); }
      if (this.ride.s >= this.loopLen) { this.ride = null; this.place(0); }
    }
    for (const sp of this.speakers) sp.setOcclusion?.(false);
  }

  dispose() {
    if (!this.on) return;
    this.wheel.root.removeFromParent();
    this.wheelEm.dispose();
    this.car?.removeFromParent();
    this.carEm?.dispose();
    for (const r of this.rails || []) r.removeFromParent();
    for (const s of this.speakers) s.dispose();
  }
}
