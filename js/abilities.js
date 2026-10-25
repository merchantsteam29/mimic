// Class abilities (G): the Brute's flares, the Medic's rescue, the Tracker's motion tracker, and the
// Runner's legs. Online, flares and rescues go through the host (it moves the mimic); the tracker is local.
import * as THREE from 'three';
import { classOf } from './classes.js';
import { keyLabel } from './controls.js';

const TRACK_RANGE = 25;

export class Abilities {
  constructor(game, cls) {
    this.g = game;
    this.id = cls;
    this.c = classOf(cls);
    this.charges = this.c.charges;
    this.battery = this.c.battery || 0;
    this.trackerOn = false;
    this.boostT = 0;
    this.used = new Map();       // host: abilities used per player (flares / rescues), to cap them
    this.rescues = new Set();    // host: players who will tear free from their next catch
    // One flare burns at a time: a red light and a glowing stick on the floor.
    this.light = new THREE.PointLight(0xff3a20, 0, 16, 1.3);
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff3010, emissiveIntensity: 3 }));
    this.stick.rotation.z = Math.PI / 2;
    this.stick.visible = false;
    game.scene.add(this.light, this.stick);
    this.flareT = 0;
    this.emitter = game.sfx.emitter();
    this.beepT = 0; this.noiseT = 0; this.sweep = 0;
    this.hud = { ability: document.getElementById('ability'), tracker: document.getElementById('tracker') };
    this.ctx2d = this.hud.tracker.getContext('2d');
    this.draw();
  }

  dispose() {
    this.emitter.dispose();
    this.hud.tracker.hidden = true;
    this.hud.ability.textContent = '';
  }

  // Movement numbers (the Runner's are better; a rescue gives a burst of speed).
  get sprint() { return (this.c.sprint || 5.0) * (this.boostT > 0 ? 1.25 : 1); }
  get staminaTime() { return this.c.stamina || 8; }
  get recover() { return this.c.recover || 3.5; }
  get sprintNoise() { return this.id === 'runner' ? 11 : 9; }

  use() {
    const g = this.g, p = g.p;
    if (g.state !== 'playing' || p.hidden) return;
    switch (this.id) {
      case 'brute':
        if (this.charges <= 0) { g.sfx.denied(); g.toast('No flares left'); return; }
        this.charges--;
        g.send({ t: 'flare' });
        break;
      case 'medic': {
        if (this.charges <= 0) { g.sfx.denied(); g.toast('Your rescue is used up'); return; }
        const to = this.medicTarget();
        this.charges--;
        g.send({ t: 'rescue', to });
        g.sfx.click();
        g.toast(to === g.me ? 'Rescue ready: the next time it catches you, you tear free.' : `Rescue ready on ${g.nameOf(to)}`);
        break;
      }
      case 'tracker':
        if (this.battery <= 0) { g.sfx.denied(); g.toast('The tracker is dead'); return; }
        this.trackerOn = !this.trackerOn;
        g.sfx.click();
        break;
      default:
        g.toast('Runners carry nothing. Just run.');
    }
    this.draw();
  }

  // A teammate right in front of me (within reach), or myself.
  medicTarget() {
    const g = this.g, c = g.camera.position, fwd = g.camera.getWorldDirection(new THREE.Vector3());
    for (const [id, r] of g.remotes) {
      if (!g.alive(id) || !r.visible) continue;
      const dx = r.x - c.x, dz = r.z - c.z, d = Math.hypot(dx, dz);
      if (d < 3 && (dx * fwd.x + dz * fwd.z) / d > 0.75) return id;
    }
    return g.me;
  }

  // Host: returns true if handled.
  hostHandle(m, from) {
    const g = this.g;
    if (m.t !== 'flare' && m.t !== 'rescue') return false;
    if (!g.alive(from)) return true;
    const cls = classOf(g.classes[from]);
    const n = this.used.get(from) || 0;
    if (cls.name !== (m.t === 'flare' ? 'Brute' : 'Medic') || n >= cls.charges) return true;
    this.used.set(from, n + 1);
    if (m.t === 'flare') {
      const P = g.infoOf(from), mm = g.mimic;
      const d = Math.hypot(mm.x - P.x, mm.z - P.z);
      if (d < 8 && g.level.los(P.x, P.z, mm.x, mm.z) && mm.state !== 'stunned') { mm.stun(4); g.hunt.stun(4); }
      g.broadcast({ t: 'flared', id: from, x: +P.x.toFixed(2), z: +P.z.toFixed(2) });
    } else {
      const to = g.alive(m.to) ? m.to : from;
      this.rescues.add(to);
      if (to !== from) g.sendTo(to, { t: 'rescued', by: from });
    }
    return true;
  }

  // Host: the mimic just caught someone. True if a rescue saved them.
  hostSave(id) {
    if (!this.rescues.has(id)) return false;
    this.rescues.delete(id);
    this.g.mimic.stun(3);
    this.g.hunt.stun(3);
    this.g.broadcast({ t: 'saved', id });
    return true;
  }

  // Everyone: returns true if handled.
  onNet(m) {
    const g = this.g;
    switch (m.t) {
      case 'flared': {
        this.flareT = 7;
        this.stick.position.set(m.x, 0.05, m.z);
        this.stick.visible = true;
        this.light.position.set(m.x, 0.8, m.z);
        const c = g.camera.position;
        this.emitter.setPos(m.x, 1, m.z);
        this.emitter.setOcclusion(!g.level.los(c.x, c.z, m.x, m.z));
        g.sfx.flare(this.emitter, 7);
        return true;
      }
      case 'rescued': g.toast(`${g.nameOf(m.by)} gave you a rescue shot`); return true;
      case 'saved':
        if (m.id === g.me) {
          g.hud.flash.classList.remove('hit');
          void g.hud.flash.offsetWidth;
          g.hud.flash.classList.add('hit');
          g.sfx.sting();
          g.toast('You tore free! RUN.');
          g.p.stamina = 1; g.p.tired = false;
          this.boostT = 4;
          if (g.p.hidden) g.exitHide();
          g.hb.stop();
        }
        return true;
    }
    return false;
  }

  update(dt) {
    const g = this.g;
    this.boostT = Math.max(0, this.boostT - dt);
    if (this.flareT > 0) {
      this.flareT -= dt;
      this.light.intensity = this.flareT > 0 ? (18 + Math.random() * 8) * Math.min(1, this.flareT) : 0;
      if (this.flareT <= 0) this.stick.visible = false;
    }
    if (this.id === 'tracker') this.updateTracker(dt);
    if (g.state !== 'playing') this.hud.tracker.hidden = true;
  }

  updateTracker(dt) {
    const g = this.g, p = g.p;
    const on = this.trackerOn && this.battery > 0 && g.state === 'playing' && !p.hidden;
    this.hud.tracker.hidden = !on;
    if (!on) { if (this.battery <= 0 && this.trackerOn) { this.trackerOn = false; this.draw(); } return; }
    this.battery = Math.max(0, this.battery - dt);
    this.sweep = (this.sweep + dt * 2.2) % (Math.PI * 2);
    // Anything moving in front of me, out to TRACK_RANGE metres.
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const blips = [];
    const add = (x, z, big) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > TRACK_RANGE) return;
      const along = dx * fx + dz * fz, side = dx * rx + dz * rz;
      if (along < -3) return; // behind me
      blips.push({ px: 100 + (side / TRACK_RANGE) * 96, py: 116 - (Math.max(0, along) / TRACK_RANGE) * 110, d, big });
    };
    const m = g.mimic;
    if (m.speed > 0.25 || m.state === 'chase') add(m.x, m.z, true);
    for (const [id, r] of g.remotes) if (g.alive(id) && r.visible && r.speed > 0.4) add(r.x, r.z, false);
    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, 200, 120);
    ctx.fillStyle = 'rgba(10,25,15,.75)';
    ctx.beginPath(); ctx.moveTo(100, 118); ctx.arc(100, 118, 112, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(120,255,160,.25)';
    for (const r of [37, 74, 111]) { ctx.beginPath(); ctx.arc(100, 118, r, Math.PI, 0); ctx.stroke(); }
    const sw = Math.PI + (Math.sin(this.sweep) * 0.5 + 0.5) * Math.PI;
    ctx.strokeStyle = 'rgba(120,255,160,.6)';
    ctx.beginPath(); ctx.moveTo(100, 118); ctx.lineTo(100 + Math.cos(sw) * 112, 118 + Math.sin(sw) * 112); ctx.stroke();
    let nearest = Infinity;
    for (const b of blips) {
      ctx.fillStyle = b.big ? '#9dffb8' : 'rgba(157,255,184,.45)';
      ctx.beginPath(); ctx.arc(b.px, b.py, b.big ? 5 : 3, 0, Math.PI * 2); ctx.fill();
      if (b.big) nearest = Math.min(nearest, b.d);
    }
    ctx.fillStyle = 'rgba(157,255,184,.8)';
    ctx.font = '10px monospace';
    ctx.fillText(`${Math.ceil(this.battery)}s`, 4, 116);
    // Beeps get faster as it gets closer. They're loud.
    if (nearest < Infinity) {
      this.beepT -= dt;
      if (this.beepT <= 0) { g.sfx.beep(1 - nearest / TRACK_RANGE); this.beepT = 0.15 + (nearest / TRACK_RANGE) * 1.1; }
      this.noiseT -= dt;
      if (this.noiseT <= 0) { g.noise(6, 'step'); this.noiseT = 1.2; }
    }
    this.drawT = (this.drawT || 0) - dt;
    if (this.drawT <= 0) { this.draw(); this.drawT = 0.5; }
  }

  // The HUD line for my class.
  draw() {
    const k = `<kbd>${keyLabel('G')}</kbd>`;
    let t;
    switch (this.id) {
      case 'brute': t = `${k}Flares ×${this.charges}`; break;
      case 'medic': t = this.charges ? `${k}Rescue ×1` : 'Rescue used'; break;
      case 'tracker': t = this.battery > 0 ? `${k}Tracker ${this.trackerOn ? 'on' : 'off'} · ${Math.ceil(this.battery)}s` : 'Tracker dead'; break;
      default: t = 'Runner';
    }
    this.hud.ability.innerHTML = `${this.c.name} · ${t}`;
  }
}
