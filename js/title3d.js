// Behind the title menu: a slow camcorder shot down a dark hospital corridor, through the same tape look as the
// game. Now and then the lights stutter, and every so often something crosses the far end of the corridor.
// Runs only while there's no game (the game takes over the renderer's loop, and gives it back on dispose).
import * as THREE from 'three';
import { generateLevel, buildLevelScene, CELL } from './level.js';
import { buildModel } from './mimic.js';

const SEED = 4407, THEME = 'hospital';

export class TitleScene {
  constructor(renderer, vhs) {
    Object.assign(this, { renderer, vhs });
    this.running = false;
  }

  // Built the first time it's shown (so the page loads as fast as before).
  build() {
    const lv = this.level = generateLevel(SEED, THEME);
    const th = lv.theme;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.FogExp2(th.fog, 0.075);
    this.world = buildLevelScene(lv);
    scene.add(this.world.group, new THREE.HemisphereLight(0x56687a, 0x0a0806, 0.1));
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 60);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
    // The camcorder's own light.
    this.torch = new THREE.SpotLight(0xfff1d8, 26, 22, 0.42, 0.6, 1.5);
    scene.add(this.torch, this.torch.target);
    this.lamps = [0, 1, 2].map(() => { const l = new THREE.PointLight(th.light, 0, 9, 1.6); scene.add(l); return l; });
    this.it = buildModel();
    this.it.root.visible = false;
    scene.add(this.it.root);
    // The longest straight, open run of floor: the corridor to film.
    let best = null;
    for (let z = 1; z < lv.N - 1; z++) for (let x = 1; x < lv.N - 1; x++) {
      if (!lv.passable(x, z)) continue;
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        let n = 0;
        while (lv.passable(x + dx * (n + 1), z + dz * (n + 1))) n++;
        if (n >= 6 && (!best || n > best.n)) best = { x, z, dx, dz, n };
      }
    }
    best ||= { x: lv.spawn.cx, z: lv.spawn.cz, dx: 1, dz: 0, n: 4 };
    this.shot = best;
    this.t = 0;
    this.crossT = 9;
  }

  start() {
    if (this.running) return;
    if (!this.scene) this.build();
    this.running = true;
    this.last = undefined;
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  stop() { this.running = false; }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - (this.last ?? now)) / 1000);
    this.last = now;
    this.t += dt;
    const s = this.shot, c = this.camera, t = this.t;
    const len = Math.max(2, (s.n - 3) * CELL), loop = 40;
    // Creep down the corridor, handheld, then cut back to the start.
    const k = (t % loop) / loop, along = k * len;
    const sx = (s.x + 0.5) * CELL, sz = (s.z + 0.5) * CELL;
    c.position.set(sx + s.dx * along + Math.sin(t * 0.7) * 0.05, 1.55 + Math.sin(t * 1.9) * 0.02, sz + s.dz * along + Math.cos(t * 0.6) * 0.05);
    c.rotation.set(-0.04 + Math.sin(t * 0.5) * 0.02, Math.atan2(-s.dx, -s.dz) + Math.sin(t * 0.33) * 0.06, Math.sin(t * 0.8) * 0.01);
    c.aspect = innerWidth / innerHeight;
    c.updateProjectionMatrix();
    // The torch: from just below the lens, along the view.
    const fwd = c.getWorldDirection(new THREE.Vector3());
    this.torch.position.copy(c.position).add(new THREE.Vector3(0.1, -0.12, 0));
    this.torch.target.position.copy(this.torch.position).addScaledVector(fwd, 5);
    this.torch.intensity = Math.random() < 0.015 ? 3 : 24; // a bad contact
    // The three ceiling lights nearest the camera, stuttering.
    const near = this.world.fixtures.filter((L) => !L.broken).map((L) => ({ L, d: Math.hypot(L.x - c.position.x, L.z - c.position.z) }))
      .sort((a, b) => a.d - b.d).slice(0, 3);
    this.lamps.forEach((l, i) => {
      const L = near[i]?.L;
      if (!L) { l.intensity = 0; return; }
      l.position.set(L.x, L.y, L.z);
      const flick = Math.sin(t * 61 + i * 7) > 0.85 || Math.random() < 0.02;
      l.intensity = flick ? 0.6 : 6;
      L.mat.emissiveIntensity = flick ? 0.2 : 1.5;
    });
    // Every so often, something crosses the end of the corridor.
    this.crossT -= dt;
    const m = this.it;
    if (this.crossT <= 0 && !this.cross && along < len * 0.6) {
      const ahead = along + 9 + Math.random() * 3;
      this.cross = { t: 0, ax: sx + s.dx * ahead, az: sz + s.dz * ahead, side: Math.random() < 0.5 ? -1 : 1 };
    }
    if (this.cross) {
      const cr = this.cross;
      cr.t += dt;
      const p = cr.t / 1.6, px = s.dz, pz = s.dx; // across the corridor
      m.root.visible = p < 1;
      m.root.position.set(cr.ax + px * cr.side * (p * 2.4 - 1.2), 0, cr.az + pz * cr.side * (p * 2.4 - 1.2));
      m.root.rotation.y = Math.atan2(px * cr.side, pz * cr.side);
      m.body.rotation.x = 0.5; // hunched, quick
      if (p >= 1) { this.cross = null; this.crossT = 18 + Math.random() * 14; }
    }
    if (this.vhs) this.vhs.render(this.scene, c, t, 0.05 + (this.cross ? 0.15 : 0));
    else this.renderer.render(this.scene, c);
  }
}
