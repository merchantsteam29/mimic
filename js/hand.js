// Your left hand, holding the flashlight at the bottom of the frame. It bobs as you walk, lags a
// little behind your turns, and shakes when it's close. Drawn on top of everything (no clipping into walls).
import * as THREE from 'three';

export class Hand {
  constructor(camera) {
    const top = (m, order) => { m.renderOrder = 1000 + order; m.material.depthTest = false; m.material.depthWrite = false; m.castShadow = false; m.frustumCulled = false; return m; };
    const skin = new THREE.MeshStandardMaterial({ color: 0x1f1b18, roughness: 0.55 }); // a worn leather glove
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.95 });
    const body = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.45, metalness: 0.6 });
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0 });
    const cap = (r, len, mat) => { const g = new THREE.CapsuleGeometry(r, len, 4, 10); return new THREE.Mesh(g, mat); };

    this.root = new THREE.Group();
    this.hold = new THREE.Group();     // sways and shakes
    this.root.add(this.hold);
    // Sleeve and forearm, coming in from the bottom left.
    const arm = top(cap(0.05, 0.32, sleeve.clone()), 0);
    arm.rotation.x = Math.PI / 2 - 0.35;
    arm.position.set(-0.03, -0.09, 0.2);
    // The flashlight, pointing forward.
    const torch = top(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.2, 14), body.clone()), 2);
    torch.rotation.x = Math.PI / 2;
    const head = top(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.06, 14), body.clone()), 2);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.12;
    const lens = top(new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), this.lensMat), 3);
    lens.position.z = -0.151;
    lens.rotation.y = Math.PI; // facing forward (away from you)
    // The hand gripping it: palm and fingers wrapped round.
    const palm = top(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.09), skin.clone()), 1);
    palm.position.set(-0.035, -0.012, 0.02);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const f = top(cap(0.011, 0.045, skin.clone()), 4);
      f.rotation.z = Math.PI / 2;
      f.position.set(0.0, 0.022, -0.02 + i * 0.022);
      fingers.push(f);
    }
    const thumb = top(cap(0.012, 0.04, skin.clone()), 4);
    thumb.rotation.set(0.4, 0, 0.3);
    thumb.position.set(0.02, -0.01, 0.045);
    this.hold.add(arm, torch, head, lens, palm, ...fingers, thumb);
    this.root.position.set(-0.2, -0.22, -0.42);
    camera.add(this.root);
    this.swayX = 0; this.swayY = 0; this.lastYaw = 0; this.lastPitch = 0;
  }

  // The world position the flashlight beam should come from.
  lensWorld(out) { return this.hold.localToWorld(out.set(0, 0, -0.16)); }

  update(dt, { yaw, pitch, bob, speed, fear, on, visible }) {
    this.root.visible = visible;
    if (!visible) return;
    // Lag behind turns.
    const dy = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)), dp = pitch - this.lastPitch;
    this.lastYaw = yaw; this.lastPitch = pitch;
    const k = 1 - Math.exp(-dt * 10);
    this.swayX += (Math.max(-0.08, Math.min(0.08, dy * 0.6)) - this.swayX) * k;
    this.swayY += (Math.max(-0.06, Math.min(0.06, -dp * 0.6)) - this.swayY) * k;
    const walk = Math.min(1, speed / 3);
    const shake = fear * 0.012;
    this.hold.position.set(
      this.swayX + Math.cos(bob) * 0.012 * walk + (Math.random() - 0.5) * shake,
      this.swayY + Math.abs(Math.sin(bob)) * 0.016 * walk + (Math.random() - 0.5) * shake,
      0,
    );
    this.hold.rotation.set(this.swayY * 0.8 + (Math.random() - 0.5) * shake * 2, this.swayX * 0.8, 0);
    this.lensMat.color.setHex(on ? 0xfff2d0 : 0x222222);
  }
}
