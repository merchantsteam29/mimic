// The trailer camera (hidden: only with ?trailer in the address). In a run, ` (backquote) takes the camera off you and
// lets it fly, smoothly, for recording a trailer. Nothing here is for players; it changes nothing unless it's on.
//   WASD fly, mouse look, Q / Z down / up, Shift faster, Alt slower
//   H   hide everything on screen (camcorder text, HUD, captions)
//   V   sharper picture (1080 lines instead of 360; the camcorder look stays)
//   G   it ignores you (you can't be caught while filming)
//   [ ] slow motion: 1x, 0.5x, 0.25x
//   K   add a keyframe here; P play the keyframes as one smooth move (P again stops); C clear them
//   F   freeze / unfreeze the mimic where it is
import * as THREE from 'three';

const SCALES = [1, 0.5, 0.25];
const help = `TRAILER CAMERA
\` on/off · WASD fly · Q/Z down/up · Shift fast · Alt slow
H hide screen · V sharp · G it ignores you · F freeze it
[ ] slow-mo · K keyframe · P play path · C clear`;

export class Trailer {
  constructor(g) {
    this.g = g;
    this.enabled = new URLSearchParams(location.search).has('trailer');
    this.on = false;
    this.keys = new Set();
    this.pos = new THREE.Vector3(); this.want = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.wyaw = 0; this.wpitch = 0;
    this.scaleI = 0; this.frames = []; this.path = null;
    if (!this.enabled) return;
    this.el = Object.assign(document.createElement('pre'), { textContent: help });
    Object.assign(this.el.style, { position: 'fixed', left: '16px', bottom: '90px', margin: 0, padding: '10px 12px', font: '12px monospace', color: '#e8f0e8', background: 'rgba(0,0,0,.6)', zIndex: 50, pointerEvents: 'none', display: 'none' });
    document.body.append(this.el);
    this.onKey = (e) => this.key(e, true);
    this.onKeyUp = (e) => this.key(e, false);
    this.onMouse = (e) => { if (!this.on || this.path) return; e.stopImmediatePropagation(); this.wyaw -= e.movementX * 0.0022; this.wpitch = Math.max(-1.45, Math.min(1.45, this.wpitch - e.movementY * 0.0022)); };
    addEventListener('keydown', this.onKey, true);
    addEventListener('keyup', this.onKeyUp, true);
    addEventListener('mousemove', this.onMouse, true);
  }

  get scale() { return this.on ? SCALES[this.scaleI] : 1; }

  key(e, down) {
    if (e.code === 'Backquote') { if (down && !e.repeat) this.toggle(); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (!this.on) return;
    if (e.code === 'Escape') return; // (the pause menu still works)
    e.stopImmediatePropagation(); e.preventDefault();
    if (!down) { this.keys.delete(e.code); return; }
    this.keys.add(e.code);
    if (e.repeat) return;
    const g = this.g;
    switch (e.code) {
      case 'KeyH': document.body.classList.toggle('trailer-clean'); this.el.style.display = document.body.classList.contains('trailer-clean') ? 'none' : 'block'; break;
      case 'KeyV': if (g.vhs) { g.vhs.lines = g.vhs.lines > 400 ? 360 : 1080; g.vhs.resize(); } break;
      case 'KeyG': this.ghost = !this.ghost; g.mimic.graceT = this.ghost ? 1e9 : 0; g.toast(this.ghost ? 'It ignores you' : 'It hunts you again'); break;
      case 'KeyF': g.mimic.frozen = !g.mimic.frozen; break;
      case 'BracketLeft': this.scaleI = Math.min(SCALES.length - 1, this.scaleI + 1); g.toast(`${SCALES[this.scaleI]}x`); break;
      case 'BracketRight': this.scaleI = Math.max(0, this.scaleI - 1); g.toast(`${SCALES[this.scaleI]}x`); break;
      case 'KeyK': this.frames.push({ p: this.want.clone(), yaw: this.wyaw, pitch: this.wpitch }); g.toast(`Keyframe ${this.frames.length}`); break;
      case 'KeyC': this.frames = []; this.path = null; g.toast('Keyframes cleared'); break;
      case 'KeyP':
        if (this.path) { this.path = null; break; }
        if (this.frames.length < 2) { g.toast('Add 2 keyframes or more (K)'); break; }
        this.path = { curve: new THREE.CatmullRomCurve3(this.frames.map((f) => f.p)), t: 0 };
        // Its length sets the time: about 1.6 m a second, never shorter than 3 s.
        this.path.T = Math.max(3, this.path.curve.getLength() / 1.6);
        break;
      default:
    }
  }

  toggle() {
    const g = this.g;
    this.on = !this.on;
    this.keys.clear();
    this.path = null;
    this.el.style.display = this.on && !document.body.classList.contains('trailer-clean') ? 'block' : 'none';
    if (!this.on) { document.body.classList.remove('trailer-clean'); return; }
    const c = g.camera;
    this.pos.copy(c.position); this.want.copy(c.position);
    const e = new THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ');
    this.yaw = this.wyaw = e.y; this.pitch = this.wpitch = e.x;
  }

  // After the game's camera: fly.
  render(dt) {
    if (!this.on) return;
    const g = this.g, c = g.camera, k = this.keys;
    if (this.path) {
      const P = this.path;
      P.t = Math.min(1, P.t + dt / P.T);
      const u = P.t * P.t * (3 - 2 * P.t); // ease in and out
      this.want.copy(P.curve.getPointAt(u));
      const n = this.frames.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f)), a = this.frames[i], b = this.frames[i + 1], w = f - i;
      this.wyaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * w;
      this.wpitch = a.pitch + (b.pitch - a.pitch) * w;
      if (P.t >= 1) this.path = null;
    } else {
      const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 6 : k.has('AltLeft') ? 0.6 : 2.2) * dt;
      const fx = -Math.sin(this.wyaw), fz = -Math.cos(this.wyaw);
      const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      this.want.x += (fx * f - fz * s) * sp;
      this.want.z += (fz * f + fx * s) * sp;
      this.want.y = Math.max(0.2, Math.min(12, this.want.y + ((k.has('KeyZ') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0)) * sp));
    }
    // Glide toward where it's going (it never jerks).
    const e = 1 - Math.exp(-dt * 4);
    this.pos.lerp(this.want, e);
    this.yaw += Math.atan2(Math.sin(this.wyaw - this.yaw), Math.cos(this.wyaw - this.yaw)) * e;
    this.pitch += (this.wpitch - this.pitch) * e;
    c.position.copy(this.pos);
    c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (document.body.classList.contains('trailer-clean')) g.distort = 0;
  }

  dispose() {
    if (!this.enabled) return;
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('keyup', this.onKeyUp, true);
    removeEventListener('mousemove', this.onMouse, true);
    this.el.remove();
    document.body.classList.remove('trailer-clean');
  }
}
