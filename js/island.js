// The lighthouse island (island theme only, alone and online; the same beam on every screen, from the game clock):
// - the lighthouse stands just off the north shore. Its beam sweeps round once every SWEEP seconds. Wherever it
//   passes is lit: you can see the island for a moment, and it can see you from 35 m (mimic.hooks.beamOn -> lit()). Hiding, or
//   being in the cottage or the caves (under a roof), keeps you out of it.
// - the foghorn: now and then, low, long, from out at sea. It covers everything for a few seconds (stepScale).
// The sea caves are Landmarks floods with a roof (level.js / landmarks.js).
import * as THREE from 'three';
import { CELL } from './level.js';

const SWEEP = 14, HALF = 0.11; // seconds a turn; half the beam's width (radians)

export class Island {
  constructor(g) {
    this.g = g;
    this.on = !!g.level.theme.island;
    this.hornUntil = 0;
    if (!this.on) return;
    const lv = g.level, S = lv.N * CELL;
    this.x = S * 0.5; this.z = -7; // just off the north shore
    this.y = 16;
    const root = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.8 }), red = new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.8 });
    for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2 - i * 0.3, 2.5 - i * 0.3, 3.6, 16), i % 2 ? red : white); seg.position.y = 1.8 + i * 3.6; root.add(seg); }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.6, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false }));
    lamp.position.y = this.y; root.add(lamp);
    root.position.set(this.x, 0, this.z);
    g.scene.add(root);
    this.root = root;
    // The beam: a long pale cone you can see through the mist, and the light that goes with it.
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(9, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    this.beam.geometry.translate(0, -35, 0);
    this.beam.geometry.rotateX(-Math.PI / 2 - 0.22); // pointing out and a little down
    this.beam.position.set(this.x, this.y, this.z);
    g.scene.add(this.beam);
    this.light = new THREE.SpotLight(0xfff0d0, 900, 100, HALF * 1.6, 0.4, 1.2);
    this.light.position.set(this.x, this.y, this.z);
    g.scene.add(this.light, this.light.target);
    this.hornEm = g.sfx.emitter();
    this.hornEm.setPos(this.x, 3, this.z - 20);
    this.hornT = 40 + Math.random() * 30;
  }

  get angle() { return (this.g.t / SWEEP) * Math.PI * 2; }

  // Is (x, z) in the beam right now? Not under a roof (the cottage, the caves).
  lit(x, z) {
    if (!this.on || this.g.level.roofed(x, z)) return false;
    const a = Math.atan2(x - this.x, z - this.z), d = Math.atan2(Math.sin(a - this.angle), Math.cos(a - this.angle));
    return Math.abs(d) < HALF;
  }

  // The foghorn drowns your steps.
  get stepScale() { return this.on && this.g.t < this.hornUntil ? 0.3 : 1; }

  update(dt) {
    if (!this.on) return;
    const g = this.g, a = this.angle;
    this.beam.rotation.y = a;
    this.light.target.position.set(this.x + Math.sin(a) * 40, 0, this.z + Math.cos(a) * 40);
    this.light.target.updateMatrixWorld();
    // The beam sweeping over you: a moment of light, and a warning the first time.
    const me = g.state === 'playing' && !g.p.hidden && this.lit(g.p.x, g.p.z);
    if (me && !this.wasLit && !this.told) { this.told = true; g.toast('The lighthouse beam. While it\'s on you, it can see you.'); }
    this.wasLit = me;
    if ((this.hornT -= dt) <= 0) {
      this.hornT = 60 + Math.random() * 40;
      this.hornUntil = g.t + 4;
      g.sfx.foghorn?.(this.hornEm);
    }
  }

  dispose() {
    if (!this.on) return;
    this.root.removeFromParent(); this.beam.removeFromParent(); this.light.removeFromParent(); this.light.target.removeFromParent();
    this.hornEm.dispose();
  }
}

