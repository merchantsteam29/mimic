// Landmark rooms: one or two rooms per building that aren't like the rest (picked from the seed: the same for
// everyone), each with a moment the first time you walk in. Purely local: what you see and hear there is yours.
//   flood    - ankle-deep black water: you wade slowly, every step splashes (and it hears that further). The
//              first time, something moves through the water on the far side.
//   collapse - the ceiling has come down: rubble, a hole, dust drifting in a shaft of dark. The first time, a
//              chunk drops right in front of you.
//   shrine   - a ring of candles on the floor around a chalk circle. The first time, they go out one by one,
//              and something whispers behind you.
import * as THREE from 'three';
import { mulberry32, CELL, FLOOR, WALL_H } from './level.js';

const KINDS = ['flood', 'collapse', 'shrine'];

export class Landmarks {
  constructor(g, on) {
    this.g = g;
    this.list = [];
    if (!on) return;
    const lv = g.level, r = mulberry32((lv.seed ^ 0x1a4d) >>> 0);
    const exitRoom = lv.roomId[lv.exit.fz * lv.N + lv.exit.fx];
    const rooms = lv.rooms.filter((rm) => rm.id !== 0 && rm.id !== exitRoom && rm.w >= 3 && rm.h >= 3);
    const kinds = KINDS.slice();
    const n = Math.min(rooms.length, r() < 0.5 ? 1 : 2);
    for (let i = 0; i < n; i++) {
      const rm = rooms.splice(Math.floor(r() * rooms.length), 1)[0];
      const kind = kinds.splice(Math.floor(r() * kinds.length), 1)[0];
      const L = { kind, room: rm, seen: false, x0: rm.x * CELL, z0: rm.z * CELL, x1: (rm.x + rm.w) * CELL, z1: (rm.z + rm.h) * CELL };
      // The free floor cell nearest the middle (for things that stand on the floor).
      let best = null;
      for (let z = rm.z; z < rm.z + rm.h; z++) for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (lv.get(x, z) !== FLOOR) continue;
        const d = Math.hypot(x - (rm.x + rm.w / 2 - 0.5), z - (rm.z + rm.h / 2 - 0.5));
        if (!best || d < best.d) best = { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL, d };
      }
      L.mid = best || { x: (L.x0 + L.x1) / 2, z: (L.z0 + L.z1) / 2 };
      this[kind](L, r);
      this.list.push(L);
    }
    this.em = g.sfx.emitter();
  }

  // ---------- building them ----------
  flood(L) {
    const w = L.x1 - L.x0, d = L.z1 - L.z0;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x050807, roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(L.x0 + w / 2, 0.09, L.z0 + d / 2);
    this.g.world.group.add(water);
    L.mesh = water;
    L.rings = [];
  }

  collapse(L, r) {
    const grp = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const s = 0.15 + r() * 0.4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s * (0.7 + r() * 0.6)), mat);
      const a = r() * 6.28, rad = r() * 1.1;
      b.position.set(L.mid.x + Math.cos(a) * rad, s * 0.25, L.mid.z + Math.sin(a) * rad);
      b.rotation.set(r() * 0.6, r() * 6.28, r() * 0.6);
      grp.add(b);
    }
    // The hole above, and dust coming down through it.
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = Math.PI / 2;
    hole.position.set(L.mid.x, WALL_H - 0.01, L.mid.z);
    grp.add(hole);
    const n = 70, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = L.mid.x + (r() - 0.5) * 1.4; pos[i * 3 + 1] = r() * WALL_H; pos[i * 3 + 2] = L.mid.z + (r() - 0.5) * 1.2; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    L.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a968a, size: 0.025, transparent: true, opacity: 0.6, depthWrite: false }));
    grp.add(L.dust);
    this.g.world.group.add(grp);
    L.mesh = grp;
  }

  shrine(L) {
    const grp = new THREE.Group();
    const chalk = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.9, 40), new THREE.MeshBasicMaterial({ color: 0x8a8678, transparent: true, opacity: 0.7 }));
    chalk.rotation.x = -Math.PI / 2;
    chalk.position.set(L.mid.x, 0.011, L.mid.z);
    grp.add(chalk);
    const wax = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6 });
    L.flames = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, x = L.mid.x + Math.cos(a) * 1.05, z = L.mid.z + Math.sin(a) * 1.05, h = 0.1 + (i % 3) * 0.06;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, h, 8), wax);
      c.position.set(x, h / 2, z);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
      f.position.set(x, h + 0.025, z);
      grp.add(c, f);
      L.flames.push(f);
    }
    // In the middle: photographs, face down.
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14), new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.9 }));
      p.rotation.x = -Math.PI / 2; p.rotation.z = i * 1.3;
      p.position.set(L.mid.x + (i - 1.5) * 0.12, 0.013, L.mid.z + ((i % 2) - 0.5) * 0.1);
      grp.add(p);
    }
    this.g.world.group.add(grp);
    L.mesh = grp;
  }

  // ---------- while you play ----------
  at(x, z) { return this.list.find((L) => x > L.x0 && x < L.x1 && z > L.z0 && z < L.z1); }

  // Wading slows you down.
  slow(x, z) { return this.at(x, z)?.kind === 'flood' ? 0.68 : 1; }

  // A footstep here: true if it splashed (louder).
  splash(x, z) {
    const L = this.at(x, z);
    if (L?.kind !== 'flood') return false;
    this.g.sfx.splash?.(null, 0.7);
    this.ring(L, x, z);
    return true;
  }

  ring(L, x, z) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0x8a948e, transparent: true, opacity: 0.5, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.1, z);
    this.g.world.group.add(m);
    L.rings.push({ m, t: 0 });
  }

  update(dt) {
    const g = this.g;
    if (!this.list.length) return;
    const p = g.p;
    for (const L of this.list) {
      if (L.rings) for (let i = L.rings.length - 1; i >= 0; i--) {
        const q = L.rings[i];
        q.t += dt;
        q.m.scale.setScalar(1 + q.t * 9);
        q.m.material.opacity = Math.max(0, 0.5 - q.t * 0.4);
        if (q.t > 1.3) { q.m.removeFromParent(); q.m.geometry.dispose(); q.m.material.dispose(); L.rings.splice(i, 1); }
      }
      if (L.dust) { // dust drifting down through the hole
        const a = L.dust.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 0.12; if (y < 0) y = WALL_H; a.setY(i, y); }
        a.needsUpdate = true;
      }
      if (!L.seen && g.state === 'playing' && this.at(p.x, p.z) === L) { L.seen = true; this.moment(L); }
    }
  }

  // The first time you walk in.
  moment(L) {
    const g = this.g, p = g.p, em = this.em;
    if (L.kind === 'flood') { // something wading away from you on the far side, out of the light
      const fx = L.x0 + L.x1 - p.x, fz = L.z0 + L.z1 - p.z;
      for (let i = 0; i < 5; i++) setTimeout(() => {
        if (g.state !== 'playing') return;
        const x = fx + (fx - p.x) * 0.08 * i, z = fz + (fz - p.z) * 0.08 * i;
        if (!this.at(x, z)) return;
        em.setPos(x, 0.3, z);
        g.sfx.splash?.(em, 0.9);
        this.ring(L, x, z);
      }, 900 + i * 650);
    } else if (L.kind === 'collapse') { // a chunk of ceiling, right in front of you
      const x = p.x - Math.sin(p.yaw) * 2.2, z = p.z - Math.cos(p.yaw) * 2.2;
      const at = g.level.collide({ x, z }, 0.3);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.45), new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1 }));
      b.position.set(at.x, WALL_H, at.z);
      g.world.group.add(b);
      L.falling = b;
      const t0 = g.t;
      const fall = () => {
        if (!b.parent) return;
        const t = g.t - t0;
        b.position.y = Math.max(0.15, WALL_H - 4.9 * t * t);
        b.rotation.x = t * 3;
        if (b.position.y > 0.15) { requestAnimationFrame(fall); return; }
        em.setPos(at.x, 0.3, at.z);
        g.sfx.rec('bang', em, { vol: 1.1 });
        g.sfx.rumble(1.5);
        g.distort = Math.max(g.distort, 0.5);
        g.fear = Math.max(g.fear, 0.5);
      };
      requestAnimationFrame(fall);
    } else if (L.kind === 'shrine') { // the candles go out, one after another, and something is behind you
      L.flames.forEach((f, i) => setTimeout(() => { f.visible = false; }, 1200 + i * 260));
      setTimeout(() => {
        if (g.state !== 'playing') return;
        em.setPos(p.x + Math.sin(p.yaw) * 0.6, p.eye, p.z + Math.cos(p.yaw) * 0.6);
        g.sfx.whisper(em);
      }, 1200 + 9 * 260 + 600);
    }
  }

  dispose() { this.em?.dispose(); }
}
