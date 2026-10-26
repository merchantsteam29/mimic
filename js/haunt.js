// Haunting (online): the dead, watching a living player, can reach back in about every 30 s:
// F flickers the light nearest them, G knocks somewhere close, C whispers right behind them.
// (Controller: the flashlight, ability and crouch buttons; touch: three buttons while watching.)
// To the living it's just one more thing in the dark: they can't tell a friend from the mimic.
// V leaves a mark: a red handprint on the floor where the one you watch is looking (it fades after ~25 s).
// The dead also see where the mimic is: a red marker over it, through walls.
// Escaped players watch, but can't haunt.
import * as THREE from 'three';
import { keyLabel } from './controls.js';

// A handprint, drawn once.
let handTex = null;
function handprint() {
  if (handTex) return handTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(200,16,24,.95)';
  g.beginPath(); g.ellipse(64, 80, 26, 30, 0, 0, Math.PI * 2); g.fill();                       // palm
  [[-22, -28, -0.5], [-10, -42, -0.15], [4, -46, 0], [18, -40, 0.15], [34, -8, 0.9]].forEach(([dx, dy, a]) => {
    g.save(); g.translate(64 + dx, 64 + dy); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 7, 18, 0, 0, Math.PI * 2); g.fill(); g.restore();
  });
  handTex = new THREE.CanvasTexture(c);
  handTex.colorSpace = THREE.SRGBColorSpace;
  return handTex;
}
// Where it is, for the dead: a red ring that shows through walls.
function itMarker() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,40,40,.9)'); grd.addColorStop(0.5, 'rgba(200,0,0,.45)'); grd.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, fog: false, transparent: true }));
  sp.scale.set(0.9, 0.9, 1);
  sp.renderOrder = 999;
  sp.visible = false;
  return sp;
}

const CD = 30;
const KINDS = { KeyF: 'flicker', KeyG: 'knock', KeyC: 'whisper', KeyV: 'mark' };
const MARK_LIFE = 25;

export class Haunt {
  constructor(g) {
    this.g = g;
    this.cdT = 8; // a moment to take in that you're dead first
    this.hostCd = new Map();
    this.em = g.sfx.emitter();
    this.marks = [];
    this.marker = itMarker();
    g.scene.add(this.marker);
  }

  can() {
    const g = this.g;
    return !!g.mp && g.state === 'spectate' && g.status.get(g.me) === 'dead';
  }

  // Keys while watching. True if used.
  onKey(code) {
    const kind = KINDS[code], g = this.g;
    if (!kind || !this.can()) return false;
    if (this.cdT > 0) return true;
    const to = g.specId;
    if (!to) return true;
    this.cdT = CD;
    const msg = { t: 'haunt', kind, to };
    if (kind === 'mark') Object.assign(msg, this.aim(to));
    g.send(msg);
    this.note = { text: { flicker: 'You made a light flicker', knock: 'You knocked', whisper: 'You whispered', mark: 'You left a mark' }[kind] + ` near ${g.nameOf(to)}`, until: g.t + 4 };
    return true;
  }

  // Where the one I'm watching is looking: the floor a few metres ahead, short of any wall.
  aim(id) {
    const g = this.g, r = g.remotes.get(id);
    if (!r) return {};
    const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
    const reach = r.pitch < -0.05 ? Math.min(6, r.eye / Math.tan(-r.pitch)) : 3;
    let x = r.x, z = r.z;
    for (let d = 0.5; d <= reach; d += 0.25) {
      const nx = r.x + fx * d, nz = r.z + fz * d;
      if (!g.level.los(r.x, r.z, nx, nz)) break;
      x = nx; z = nz;
    }
    return { x: +x.toFixed(2), z: +z.toFixed(2) };
  }

  // The spectator line's hint.
  hint() {
    if (!this.can()) return '';
    if (this.note && this.g.t < this.note.until) return `  ·  ${this.note.text}`;
    return this.cdT > 0 ? `  ·  You can reach them in ${Math.ceil(this.cdT)}s`
      : `  ·  ${keyLabel('F')} flicker  ${keyLabel('G')} knock  ${keyLabel('C')} whisper  ${keyLabel('V')} mark  ·  the red light is it`;
  }

  update(dt) {
    const g = this.g;
    this.cdT = Math.max(0, this.cdT - dt);
    // The dead see where it is.
    const m = g.mimic;
    this.marker.visible = this.can() && !g.hunt.me;
    if (this.marker.visible) this.marker.position.set(m.x, (m.ceiling ? 2.6 : 2.3) + Math.sin(g.t * 3) * 0.05, m.z);
    // Marks fade.
    for (const k of this.marks) {
      k.t -= dt;
      k.mesh.material.opacity = Math.min(0.95, k.t / 4) * (0.8 + Math.sin(g.t * 2 + k.t) * 0.2);
      if (k.t <= 0) { k.mesh.removeFromParent(); k.mesh.material.dispose(); k.mesh.geometry.dispose(); }
    }
    this.marks = this.marks.filter((k) => k.t > 0);
  }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'haunt') return false;
    const g = this.g;
    if (g.status.get(from) !== 'dead' || !g.alive(m.to) || !['flicker', 'knock', 'whisper', 'mark'].includes(m.kind)) return true;
    if (g.t - (this.hostCd.get(from) ?? -99) < CD - 2) return true;
    this.hostCd.set(from, g.t);
    const P = g.infoOf(m.to), lv = g.level;
    if (m.kind === 'flicker') {
      const L = g.world.fixtures.map((f, i) => ({ f, i, d: Math.hypot(f.x - P.x, f.z - P.z) }))
        .filter((q) => !q.f.dead && q.d < 12).sort((a, b) => a.d - b.d)[0];
      if (L) g.broadcast({ t: 'haunted', k: 'flicker', i: L.i });
    } else if (m.kind === 'knock') {
      const q = lv.randomFloor((s) => { const d = Math.hypot(s.x - P.x, s.z - P.z); return d > 2.5 && d < 6; });
      if (q) g.broadcast({ t: 'haunted', k: 'knock', x: +q.x.toFixed(1), z: +q.z.toFixed(1) });
    } else if (m.kind === 'mark') {
      const x = Number(m.x), z = Number(m.z);
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - P.x, z - P.z) > 9) return true;
      g.broadcast({ t: 'haunted', k: 'mark', x: +x.toFixed(2), z: +z.toFixed(2) });
    } else {
      const q = lv.collide({ x: P.x - P.lookX * 1.1, z: P.z - P.lookZ * 1.1 }, 0.2);
      g.broadcast({ t: 'haunted', k: 'whisper', x: +q.x.toFixed(1), z: +q.z.toFixed(1) });
    }
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    if (m.t !== 'haunted') return false;
    const g = this.g;
    if (m.k === 'flicker') {
      const L = g.world.fixtures[m.i | 0];
      if (L) L.burst = 1.6 + Math.random() * 0.8;
      return true;
    }
    const x = Number(m.x) || 0, z = Number(m.z) || 0, c = g.camera.position;
    if (m.k === 'mark') {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: handprint(), transparent: true, depthWrite: false, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
      mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      mesh.position.set(x, 0.015, z);
      g.scene.add(mesh);
      this.marks.push({ mesh, t: MARK_LIFE });
      return true;
    }
    this.em.setPos(x, m.k === 'knock' ? 1.4 : 1.6, z);
    this.em.setOcclusion(!g.level.los(c.x, c.z, x, z));
    if (m.k === 'knock') g.sfx.knock(this.em);
    else g.sfx.whisper(this.em);
    return true;
  }

  dispose() {
    this.em.dispose();
    for (const k of this.marks) k.mesh.removeFromParent();
    this.marker.removeFromParent();
  }
}
