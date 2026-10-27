// Escort (online lobby Mode 'escort'). Nobody's flashlight works tonight. One of you carries the lantern, and the
// rest have to see by it. Hiding shutters it. If the carrier is taken (or gets out, or leaves), the lantern goes out
// and falls where they were: anyone can pick it up, and it sputters back to life after a few seconds.
// It's slower in the lantern's light, as under a working light, so stay close to it.
// `start` carries `lantern` (the first carrier). Host: 'lanternDrop' {i, x, z}; intent 'lanternTake' {i} -> 'lanternHeld' {i, by}.
import * as THREE from 'three';

const RELIGHT = 2.6;

function makeLantern() {
  const g = new THREE.Group(), iron = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.6, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xffa040, emissiveIntensity: 1, transparent: true, opacity: 0.85 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.03, 10), iron);
  const pane = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.13, 10), glass);
  pane.position.y = 0.08;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.06, 10), iron);
  cap.position.y = 0.175;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 12), iron);
  ring.position.y = 0.23;
  g.add(base, pane, cap, ring);
  g.userData.glass = glass;
  return g;
}

export class Escort {
  constructor(g, carrier) {
    this.g = g;
    this.on = !!carrier && !!g.mp;
    if (!this.on) return;
    this.by = carrier;       // who has it (null: it's on the floor)
    this.item = null;        // its item index while it's on the floor
    this.level = 1;          // 0..1, how lit it is
    this.relight = 0;        // seconds of sputtering left after someone picks it up
    this.pos = new THREE.Vector3();
    this.light = new THREE.PointLight(0xffb468, 0, 13, 1.5);
    this.mesh = makeLantern();
    g.scene.add(this.light, this.mesh);
    this.em = g.sfx.emitter();
    g.p.flashOn = false;
  }

  // It's slower in the lantern's light (mimic hooks.isLit).
  near(x, z) { return this.on && this.level > 0.5 && Math.hypot(this.pos.x - x, this.pos.z - z) < 4.5; }

  // Flashlight key: there's no flashlight tonight.
  noFlash() {
    if (!this.on) return false;
    this.g.toast(this.by === this.g.me ? 'No flashlight tonight. You have the lantern: they need you close.' : 'No flashlight tonight. Stay in the lantern\'s light.');
    return true;
  }

  // ---------- host ----------
  drop() {
    const g = this.g, at = this.by === g.me ? g.p : g.remotes.get(this.by);
    this.by = null;
    const pos = g.level.collide(at ? { x: at.x, z: at.z } : { x: g.level.spawnPos.x, z: g.level.spawnPos.z }, 0.2);
    g.broadcast({ t: 'lanternDrop', i: g.nextItem++, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) });
  }

  hostHandle(m, from) {
    if (m.t !== 'lanternTake') return false;
    const g = this.g, it = g.items[m.i | 0], at = from === g.me ? g.p : g.remotes.get(from);
    if (!this.on || !it || it.type !== 'lantern' || !it.active || this.by || !g.alive(from) || !at || Math.hypot(at.x - it.x, at.z - it.z) > 3) return true;
    it.active = false;
    g.broadcast({ t: 'lanternHeld', i: m.i | 0, by: from });
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    if (!this.on) return false;
    const g = this.g;
    switch (m.t) {
      case 'lanternDrop': {
        const x = Number(m.x) || 0, z = Number(m.z) || 0, i = m.i | 0;
        this.by = null; this.item = i; this.relight = 0;
        this.pos.set(x, 0, z);
        g.items[i] = { type: 'lantern', i, x, y: 0.15, z, mesh: this.mesh, range: 2.2, active: true };
        this.em.setPos(x, 0.2, z);
        g.sfx.rec('glass', this.em, { vol: 0.5 });
        g.toast('The lantern went out.');
        return true;
      }
      case 'lanternHeld': {
        const it = g.items[m.i | 0];
        if (it) it.active = false;
        this.by = m.by; this.item = null; this.relight = RELIGHT;
        if (m.by === g.me) { g.sfx.pickup(); g.toast('You have the lantern. It\'s catching… they need you close.'); }
        else g.toast(`${g.nameOf(m.by)} has the lantern.`);
        return true;
      }
    }
    return false;
  }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && this.by && !g.alive(this.by) && !g.ended) this.drop(); // taken, out or gone: it falls
    let shown = true, shut = false;
    if (this.by === g.me) {
      // In your left hand, a little below the view.
      g.camera.localToWorld(this.pos.set(-0.34, -0.46, -0.72));
      shut = !!g.p.hidden;
      shown = !g.p.hidden && g.state === 'playing';
      this.mesh.rotation.y = g.p.yaw;
    } else if (this.by) {
      const r = g.remotes.get(this.by);
      if (r?.seen) {
        const yaw = r.yaw || 0;
        this.pos.set(r.x - Math.cos(yaw) * 0.32, 0.82, r.z + Math.sin(yaw) * 0.32); // their left hand
        shut = r.hidden >= 0;
        shown = !shut;
      } else shown = false;
    } else if (this.item !== null) {
      this.pos.y = 0;
      this.mesh.rotation.z = 1.4; // on its side
    }
    if (this.by) this.mesh.rotation.z = 0;
    this.mesh.visible = shown;
    this.mesh.position.copy(this.pos);
    // How lit: out on the floor or shuttered in a hiding spot, sputtering back after a pick-up.
    let want = this.by && !shut ? 1 : 0;
    if (this.relight > 0) {
      this.relight -= dt;
      want = Math.random() < 1 - this.relight / RELIGHT ? 1 : 0.1;
    }
    this.level += (want - this.level) * (1 - Math.exp(-dt * (want > this.level ? 10 : 6)));
    const I = this.level * 9 * (0.9 + Math.sin(g.t * 11) * 0.05 + Math.sin(g.t * 4.3) * 0.05);
    this.light.intensity = I;
    if (this.by === g.me) g.camera.localToWorld(this.light.position.set(-0.2, 0.1, -0.5)); // so it doesn't glare off your own hand
    else this.light.position.set(this.pos.x, Math.max(0.3, this.pos.y + 0.15), this.pos.z);
    this.mesh.userData.glass.emissiveIntensity = 0.05 + this.level * 0.55;
  }

  prompt(it) { return it.type === 'lantern' ? 'Pick up the lantern' : undefined; }

  interact(it) {
    if (it.type !== 'lantern') return false;
    this.g.send({ t: 'lanternTake', i: it.i });
    return true;
  }

  dispose() {
    if (!this.on) return;
    this.light.removeFromParent();
    this.mesh.removeFromParent();
    this.em.dispose();
  }
}
