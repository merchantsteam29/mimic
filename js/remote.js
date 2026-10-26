// Other players in the world: a simple low-poly figure with a working flashlight, footsteps,
// and smoothing between the host's snapshots.
import * as THREE from 'three';
import { poseSign } from './signals.js';

const COLORS = [0x6b3a2a, 0x2a4a6b, 0x4a5a2a, 0x5a2a5a];

export class RemotePlayer {
  constructor(scene, sfx, index) {
    this.sfx = sfx;
    const coat = new THREE.MeshStandardMaterial({ color: COLORS[index % COLORS.length], roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x9a7a62, roughness: 0.7 });
    const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
    const limb = (w, h, mat) => { const g = new THREE.BoxGeometry(w, h, w); g.translate(0, -h / 2, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), coat, 0, 1.18, 0));
    this.head = new THREE.Group();
    this.head.position.y = 1.62;
    this.head.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), skin, 0, 0, 0));
    this.head.add(mesh(new THREE.BoxGeometry(0.27, 0.08, 0.27), dark, 0, 0.09, 0)); // hat
    this.body.add(this.head);
    this.legs = [-1, 1].map((s) => { const l = limb(0.14, 0.85, dark); l.position.set(s * 0.1, 0.87, 0); this.body.add(l); return l; });
    this.arms = [-1, 1].map((s) => { const a = limb(0.11, 0.62, coat); a.position.set(s * 0.27, 1.45, 0); this.body.add(a); return a; });
    // The right hand holds a flashlight that really lights things up.
    this.torch = new THREE.SpotLight(0xfff1d8, 0, 20, 0.42, 0.55, 1.5);
    this.torch.position.set(0.27, 1.25, -0.25);
    this.torch.target.position.set(0.27, 1.1, -5);
    this.root.add(this.torch, this.torch.target);
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);

    this.emitter = sfx.emitter();
    this.x = 0; this.z = 0; this.tx = 0; this.tz = 0;
    this.yaw = 0; this.tyaw = 0; this.pitch = 0;
    this.crouch = false; this.flash = false; this.hidden = -1;
    this.status = 'alive';
    this.phase = 0; this.stepDist = 0; this.speed = 0;
    this.seen = false;
  }

  // From a snapshot: [x, z, yaw, pitch, crouch, flash, hiddenProp]
  setState(s) {
    [this.tx, this.tz, this.tyaw, this.pitch] = s;
    this.crouch = !!s[4]; this.flash = !!s[5]; this.hidden = s[6];
    if (!this.seen) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; this.seen = true; }
  }

  get eye() { return this.crouch ? 1.0 : 1.62; }
  get visible() { return this.seen && this.status === 'alive' && this.hidden < 0; }

  update(dt, surface, hideMesh = false) {
    const k = 1 - Math.exp(-dt * 12);
    const ox = this.x, oz = this.z;
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    this.yaw += Math.atan2(Math.sin(this.tyaw - this.yaw), Math.cos(this.tyaw - this.yaw)) * k;
    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.speed = moved / dt;
    this.phase += moved * 2.6;
    this.stepDist += moved;
    if (this.visible && this.stepDist > (this.speed > 4 ? 1.4 : 0.9)) {
      this.stepDist = 0;
      if (!this.crouch) this.sfx.footstep(this.emitter, { vol: this.speed > 4 ? 1 : 0.6, surface });
    }
    this.root.visible = this.visible && !hideMesh;
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.yaw;
    const sw = Math.sin(this.phase) * Math.min(1, this.speed / 2.5) * 0.6;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = -sw * 0.7; this.arms[1].rotation.x = 0.9; // torch arm held up
    this.body.position.y = this.crouch ? -0.5 : 0;
    this.body.scale.y = 1;
    this.head.rotation.x = this.pitch;
    poseSign(this, dt); // a hand signal, if they're making one
    this.torch.intensity = this.visible && this.flash ? 26 : 0;
    this.torch.target.position.set(0.27, 1.25 + Math.tan(this.pitch) * 5, -5);
    this.emitter.setPos(this.x, 0.2, this.z);
  }

  dispose() {
    this.emitter.dispose();
    this.root.removeFromParent();
  }
}
