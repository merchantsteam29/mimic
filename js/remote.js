// Other players in the world: a simple low-poly figure with a working flashlight, footsteps,
// and smoothing between the host's snapshots.
import * as THREE from 'three';
import { poseSign } from './signals.js';
import { COATS, LIGHTS, cleanLook } from './look.js';

export class RemotePlayer {
  // look: their chosen coat, hat and flashlight colour (look.js); index: their place in the room (the default coat).
  constructor(scene, sfx, index, look = null) {
    this.sfx = sfx;
    this.index = index;
    const coat = this.coat = new THREE.MeshStandardMaterial({ color: COATS[index % 4], roughness: 0.85 });
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
    // Hats: one of these shows (setLook).
    const knit = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 1 });
    this.knit = knit;
    const beanie = mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), knit, 0, 0.02, 0);
    const cap = new THREE.Group();
    cap.add(mesh(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), knit, 0, 0.03, 0), mesh(new THREE.BoxGeometry(0.2, 0.015, 0.12), knit, 0, 0.04, -0.15));
    const hood = mesh(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), coat, 0, -0.01, 0.02);
    this.hats = { beanie, cap, hood };
    this.head.add(beanie, cap, hood);
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
    this.setLook(look);

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

  setLook(look) {
    const l = cleanLook(look);
    this.coat.color.setHex(l.coat >= 0 ? COATS[l.coat] : COATS[this.index % 4]);
    for (const [k, h] of Object.entries(this.hats)) h.visible = k === l.hat;
    this.knit.color.setHex(l.coat >= 0 ? new THREE.Color(COATS[l.coat]).multiplyScalar(0.45).getHex() : 0x1c1a18);
    this.torch.color.setHex(LIGHTS[l.light]);
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

// A friend's name, floating over their head (Settings > Name tags). The game sets its opacity every frame.
export function nameTag(name, parent) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 40px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6;
  g.fillStyle = '#e8ecdf';
  g.fillText(String(name).slice(0, 16), 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
  sprite.scale.set(1.3, 0.325, 1);
  sprite.position.y = 2.15;
  sprite.visible = false;
  parent.add(sprite);
  return sprite;
}
