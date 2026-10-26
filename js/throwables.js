// Things to throw. A few lie around every building (the same spots for everyone): bottles and cans, and
// a disposable camera. Carry one at a time. Throw (H, left click; controller RT; touch Throw):
//   bottle / can - lands where you aim (up to ~14 m) and smashes or clatters: it goes to see what it was
//   camera       - three flashes: anything in front of you within 8 m is blinded for a moment
//   intent 'throw' {x, z} -> broadcast 'thrown' {k, from, x, z};  intent 'camFlash' -> broadcast 'camFlashed' {id, x, z}
import * as THREE from 'three';
import { mulberry32, CELL, FLOOR } from './level.js';
import { keyLabel } from './controls.js';

const KINDS = ['bottle', 'can', 'bottle', 'camera'];
const RANGE = 14;
const NAMES = { bottle: 'a bottle', can: 'a can', camera: 'a disposable camera' };

function makeMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'bottle') {
    const glass = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), glass); b.position.y = 0.1;
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.08, 8), glass); n.position.y = 0.24;
    g.add(b, n);
  } else if (kind === 'can') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x8a2020, roughness: 0.3, metalness: 0.7 }));
    c.position.y = 0.06; g.add(c);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.04), new THREE.MeshStandardMaterial({ color: 0xd8c040, roughness: 0.5 }));
    body.position.y = 0.035;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0.02, 0.035, 0.025);
    g.add(body, lens);
  }
  return g;
}

export class Throwables {
  constructor(g) {
    this.g = g;
    this.held = null;     // { kind, shots }
    this.flying = [];
    this.em = g.sfx.emitter();
    const lv = g.level, rand = mulberry32(lv.seed ^ 0x7b01), cells = [];
    for (let z = 1; z < lv.N - 1; z++) for (let x = 1; x < lv.N - 1; x++) {
      if (lv.get(x, z) === FLOOR && lv.roomId[z * lv.N + x] >= 0) cells.push([x, z]);
    }
    for (const kind of KINDS) {
      if (!cells.length) break;
      const [cx, cz] = cells.splice(Math.floor(rand() * cells.length), 1)[0];
      const x = (cx + 0.5) * CELL + (rand() - 0.5) * 0.7, z = (cz + 0.5) * CELL + (rand() - 0.5) * 0.7;
      const mesh = makeMesh(kind);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rand() * 6.28;
      g.world.group.add(mesh);
      g.items.push({ type: 'throwable', kind, x, y: 0.1, z, mesh, range: 2.1, active: true });
    }
  }

  // Picked one up (from 'took').
  took(it, by) {
    it.mesh.removeFromParent();
    if (by !== this.g.me) return;
    this.held = { kind: it.kind, shots: it.kind === 'camera' ? 3 : 1 };
    this.g.toast(`You have ${NAMES[it.kind]}. ${keyLabel('H')} to ${it.kind === 'camera' ? 'flash it' : 'throw it'}.`);
    this.g.updateObjective();
  }

  // Keys: true if used.
  onKey(code) {
    if (code !== 'KeyH' || !this.held || this.g.p.hidden) return false;
    this.use();
    return true;
  }

  use() {
    const g = this.g, h = this.held, c = g.camera.position;
    if (!h) return;
    const fwd = g.camera.getWorldDirection(new THREE.Vector3());
    if (h.kind === 'camera') {
      g.send({ t: 'camFlash', lx: +fwd.x.toFixed(3), lz: +fwd.z.toFixed(3) });
      if (--h.shots <= 0) { this.held = null; g.toast('That was the last picture.'); }
    } else {
      // Along your aim until something's in the way, and a little short of it.
      const flat = Math.hypot(fwd.x, fwd.z) || 1, reach = Math.min(RANGE, 5 + Math.max(0, fwd.y + 0.2) * 14);
      let x = c.x, z = c.z;
      for (let d = 0.5; d <= reach; d += 0.5) {
        const nx = c.x + (fwd.x / flat) * d, nz = c.z + (fwd.z / flat) * d;
        if (!g.level.los(c.x, c.z, nx, nz)) break;
        x = nx; z = nz;
      }
      g.send({ t: 'throw', k: h.kind, x: +x.toFixed(2), z: +z.toFixed(2) });
      this.held = null;
    }
    g.updateObjective();
  }

  // ---------- host ----------
  hostHandle(m, from) {
    const g = this.g;
    if (m.t === 'throw') {
      if (!g.alive(from)) return true;
      const P = g.infoOf(from), x = Number(m.x) || P.x, z = Number(m.z) || P.z;
      if (Math.hypot(x - P.x, z - P.z) > RANGE + 2) return true;
      g.broadcast({ t: 'thrown', k: m.k === 'can' ? 'can' : 'bottle', from: [+P.x.toFixed(2), +P.z.toFixed(2)], x, z });
      // It lands loudly: they go to look.
      g.mimic.hear(x, z, 22, 'step');
      g.ls.hear(x, z, 22, 'step');
      g.hunt.heard(x, z, 22);
      return true;
    }
    if (m.t === 'camFlash') {
      if (!g.alive(from)) return true;
      const P = g.infoOf(from), lx = Number(m.lx) || P.lookX, lz = Number(m.lz) || P.lookZ, l = Math.hypot(lx, lz) || 1;
      // Anything right in front of you, close, and in sight, is blinded.
      const hit = (x, z) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1; return d < 8 && (dx * lx + dz * lz) / (d * l) > 0.75 && g.level.los(P.x, P.z, x, z); };
      const mm = g.mimic;
      if (hit(mm.x, mm.z)) { if (g.hunt.on) g.hunt.stun(2.5); else mm.stun(2.5); }
      g.broadcast({ t: 'camFlashed', id: from, x: +P.x.toFixed(2), z: +P.z.toFixed(2) });
      return true;
    }
    return false;
  }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    if (m.t === 'thrown') {
      const mesh = makeMesh(m.k);
      g.world.group.add(mesh);
      const [fx, fz] = Array.isArray(m.from) ? m.from : [m.x, m.z];
      this.flying.push({ mesh, k: m.k, fx, fz, x: Number(m.x) || 0, z: Number(m.z) || 0, t: 0, T: Math.max(0.35, Math.hypot(m.x - fx, m.z - fz) / 16) });
      return true;
    }
    if (m.t === 'camFlashed') {
      const c = g.camera.position, d = Math.hypot(m.x - c.x, m.z - c.z);
      this.em.setPos(m.x, 1.5, m.z);
      g.sfx.camFlash(m.id === g.me ? null : this.em);
      // A white pop: yours fills the screen; someone else's you see if it's near and in sight.
      if (m.id === g.me || (d < 14 && g.level.los(c.x, c.z, m.x, m.z) && g.state === 'playing')) {
        const f = g.hud.flash;
        f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop');
        g.hemi.intensity = g.settings.calm ? g.hemiBase : 3;
        setTimeout(() => { g.hemi.intensity = g.hemiBase; }, 90);
      }
      return true;
    }
    return false;
  }

  update(dt) {
    for (const f of this.flying) {
      f.t += dt;
      const k = Math.min(1, f.t / f.T);
      f.mesh.position.set(f.fx + (f.x - f.fx) * k, 1.4 * (1 - k) + Math.sin(Math.PI * k) * 0.8, f.fz + (f.z - f.fz) * k);
      f.mesh.rotation.x += dt * 14;
      if (k >= 1 && !f.done) {
        f.done = true;
        const c = this.g.camera.position;
        this.em.setPos(f.x, 0.2, f.z);
        this.em.setOcclusion(!this.g.level.los(c.x, c.z, f.x, f.z));
        if (f.k === 'can') this.g.sfx.clatter(this.em); else this.g.sfx.smash(this.em);
        if (f.k === 'bottle') f.mesh.removeFromParent(); // in pieces
        else f.mesh.rotation.set(Math.PI / 2, f.mesh.rotation.y, 0);
      }
    }
    this.flying = this.flying.filter((f) => !f.done);
  }

  line() { return this.held ? `Holding ${NAMES[this.held.kind]}${this.held.kind === 'camera' ? ` (${this.held.shots} left)` : ''}: ${keyLabel('H')}` : null; }

  dispose() { this.em.dispose(); }
}
