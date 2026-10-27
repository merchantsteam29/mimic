// Class abilities (G): the Brute's flares, the Medic's rescue, the Tracker's motion tracker, the Runner's legs,
// the Sound guy's speaker, the Priest's crucifix, the Scout's marks and the Mechanic's wedges. Online, everything
// that touches the world goes through the host (it moves the mimic); the tracker is local.
//   speaker:  'spkPut' -> 'spkSet' {by, x, z}; 'spkPlay' -> 'spkPlayed' {by} (the mimic goes to look, even off a chase)
//   crucifix: 'cross' -> 'crossed' {id, x, z, hit} (hit: within 8 m and in sight, it flees and keeps away)
//   mark:     'mark' {x, y, z} -> 'marked' {by, x, y, z} (a glow through walls, 20 s; one every 18 s)
//   wedge:    'wedge' {i} -> 'wedged' {i, s} (the door shuts and nobody opens it; the mimic hammers on it and gives up)
import * as THREE from 'three';
import { classOf } from './classes.js';
import { keyLabel } from './controls.js';

const TRACK_RANGE = 25;
const MARK_T = 20, MARK_CD = 18, WEDGE_T = 25;
// Which class each request belongs to.
const KIT = { flare: 'brute', rescue: 'medic', spkPut: 'soundguy', spkPlay: 'soundguy', cross: 'priest', mark: 'scout', wedge: 'mechanic' };

// A glow through walls (the Scout's marks).
function glowMark(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 2; x.beginPath(); x.arc(32, 32, 20, 0, 7); x.stroke();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, fog: false }));
  s.scale.set(0.8, 0.8, 1);
  s.renderOrder = 10;
  return s;
}

// The Sound guy's speaker: a small battered box with a red light.
function makeSpeaker() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6 }));
  box.position.y = 0.18;
  const cone = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
  cone.position.set(0, 0.16, 0.101);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 2 }));
  led.position.set(0.1, 0.32, 0.101);
  g.add(box, cone, led);
  g.userData.led = led;
  return g;
}

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
    this.speakers = new Map();   // player id -> { x, z, mesh, em }
    this.marks = [];             // { sprite, t }
    this.markT = 0;              // my mark's cooldown
    this.markAt = new Map();     // host: when each scout may mark again
    this.crossT = 0;             // the crucifix's glow
    this.hud = { ability: document.getElementById('ability'), tracker: document.getElementById('tracker') };
    this.ctx2d = this.hud.tracker.getContext('2d');
    this.draw();
  }

  dispose() {
    this.emitter.dispose();
    for (const sp of this.speakers.values()) { sp.mesh.removeFromParent(); sp.em.dispose(); }
    for (const m of this.marks) m.sprite.removeFromParent();
    this.hud.tracker.hidden = true;
    this.hud.ability.textContent = '';
  }

  // Movement numbers (the Runner's are better; a rescue gives a burst of speed).
  get sprint() { return (this.c.sprint || 5.0) * (this.boostT > 0 ? 1.25 : 1); }
  get staminaTime() { return this.c.stamina || 8; }
  get recover() { return this.c.recover || 3.5; }
  get sprintNoise() { return this.id === 'runner' ? 11 : 9; }
  get walk() { return this.c.walk || 1; }          // the Priest walks a little slower
  get stepMul() { return this.c.steps || 1; }      // the Scout is quiet, the Mechanic's tools clank
  get flashMul() { return this.c.flash || 1; }     // the Scout's small battery
  get repairMul() { return this.c.repair || 1; }   // the Mechanic fixes generators fast
  get shaky() { return this.c.shaky || 0; }        // the Priest's hands

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
      case 'soundguy':
        if (!this.speakers.has(g.me)) { g.send({ t: 'spkPut' }); g.sfx.click(); g.toast(`Speaker down. ${keyLabel('G')} again plays it, from anywhere.`); break; }
        if (this.charges <= 0) { g.sfx.denied(); g.toast('The speaker\'s dead'); return; }
        this.charges--;
        g.send({ t: 'spkPlay' });
        g.sfx.click();
        break;
      case 'priest': {
        if (this.charges <= 0) { g.sfx.denied(); g.toast('You have nothing left to hold up'); return; }
        const m = g.mimic;
        if (Math.hypot(m.x - p.x, m.z - p.z) > 8 && !g.hunt.on) { g.sfx.denied(); g.toast('Nothing close enough to hold it up to'); return; }
        this.charges--;
        g.send({ t: 'cross' });
        break;
      }
      case 'scout': {
        if (this.markT > 0) { g.sfx.denied(); g.toast(`You can mark again in ${Math.ceil(this.markT)} s`); return; }
        const a = this.aim();
        this.markT = MARK_CD;
        g.send({ t: 'mark', x: +a.x.toFixed(2), y: +a.y.toFixed(2), z: +a.z.toFixed(2) });
        break;
      }
      case 'mechanic':
        if (this.charges <= 0) { g.sfx.denied(); g.toast('No wedges left'); return; }
        if (g.focus?.type !== 'idoor') { g.sfx.denied(); g.toast('Look at a door to wedge it'); return; }
        this.charges--;
        g.send({ t: 'wedge', i: g.focus.i });
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
    const kit = KIT[m.t];
    if (!kit) return false;
    if (!g.alive(from) || (g.classes[from] || 'runner') !== kit) return true;
    const cls = classOf(kit), P = g.infoOf(from);
    if (m.t === 'spkPut') { g.broadcast({ t: 'spkSet', by: from, x: +P.x.toFixed(2), z: +P.z.toFixed(2) }); return true; }
    if (m.t === 'mark') {
      if (g.time < (this.markAt.get(from) || 0)) return true;
      this.markAt.set(from, g.time + MARK_CD - 1);
      const num = (v) => Math.max(-500, Math.min(500, Number(v) || 0));
      g.broadcast({ t: 'marked', by: from, x: num(m.x), y: Math.max(0, Math.min(3, Number(m.y) || 0)), z: num(m.z) });
      return true;
    }
    const n = this.used.get(from) || 0;
    if (n >= cls.charges) return true;
    if (m.t === 'spkPlay') {
      const sp = this.speakers.get(from);
      if (!sp) return true;
      this.used.set(from, n + 1);
      g.broadcast({ t: 'spkPlayed', by: from });
      // It goes to see what that was. Even if it was after someone: for a few seconds it won't chase anyone further off.
      const mm = g.mimic;
      if (!['stunned', 'transform', 'sniff'].includes(mm.state)) { mm.investigate(sp.x, sp.z, 4); mm.shyT = Math.max(mm.shyT, 5); }
      g.ls.hear?.(sp.x, sp.z, 30, 'voice', null);
      g.hunt.heard(sp.x, sp.z, 30);
      return true;
    }
    if (m.t === 'cross') {
      const mm = g.mimic, d = Math.hypot(mm.x - P.x, mm.z - P.z);
      const hit = d < 8 && g.level.los(P.x, P.z, mm.x, mm.z) && mm.state !== 'transform';
      if (hit) {
        this.used.set(from, n + 1);
        if (g.hunt.on) g.hunt.stun(2);
        else { mm.flee(P); mm.speak('scream'); }
      }
      g.broadcast({ t: 'crossed', id: from, x: +P.x.toFixed(2), z: +P.z.toFixed(2), hit: hit ? 1 : 0 });
      return true;
    }
    if (m.t === 'wedge') {
      const d = g.level.idoors[m.i | 0];
      if (!d || Math.hypot(d.x - P.x, d.z - P.z) > 4) return true;
      this.used.set(from, n + 1);
      if (d.open) g.broadcast({ t: 'doorSet', i: d.i, open: false, by: from });
      g.broadcast({ t: 'wedged', i: d.i, s: WEDGE_T, by: from });
      return true;
    }
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
      case 'spkSet': {
        let sp = this.speakers.get(m.by);
        if (!sp) { sp = { mesh: makeSpeaker(), em: g.sfx.emitter() }; g.world.group.add(sp.mesh); this.speakers.set(m.by, sp); }
        sp.x = Number(m.x) || 0; sp.z = Number(m.z) || 0;
        sp.mesh.position.set(sp.x, 0, sp.z);
        sp.em.setPos(sp.x, 0.3, sp.z);
        if (m.by === g.me) this.draw();
        return true;
      }
      case 'spkPlayed': {
        const sp = this.speakers.get(m.by);
        if (!sp) return true;
        const c = g.camera.position;
        sp.em.setOcclusion(!g.level.los(c.x, c.z, sp.x, sp.z));
        sp.blink = 3;
        g.sfx.speaker(sp.em);
        if (m.by === g.me) this.draw();
        return true;
      }
      case 'crossed': {
        if (m.id === g.me && !m.hit) { this.charges++; this.draw(); g.toast('It isn\'t close enough to see it'); return true; }
        // A warm light, a held note, and if it worked, it shrieks and backs away.
        this.light.color.setHex(0xffe0a0);
        this.light.position.set(Number(m.x) || 0, 1.5, Number(m.z) || 0);
        this.crossT = 1.4;
        const c = g.camera.position;
        this.emitter.setPos(Number(m.x) || 0, 1.5, Number(m.z) || 0);
        this.emitter.setOcclusion(!g.level.los(c.x, c.z, Number(m.x) || 0, Number(m.z) || 0));
        g.sfx.holy(this.emitter);
        if (m.id === g.me) { this.draw(); if (m.hit) g.toast('It backs away from you.'); }
        return true;
      }
      case 'marked': {
        const sprite = glowMark('rgba(120,220,255,.6)');
        sprite.position.set(Number(m.x) || 0, Number(m.y) || 0.5, Number(m.z) || 0);
        g.scene.add(sprite);
        this.marks.push({ sprite, t: MARK_T });
        g.sfx.ping();
        if (m.by !== g.me) g.toast(`${g.nameOf(m.by)} marked something`);
        return true;
      }
      case 'wedged': {
        const d = g.level.idoors[m.i | 0];
        if (!d) return true;
        d.jamUntil = d.wedgeUntil = g.t + (Number(m.s) || WEDGE_T);
        g.doorEm?.setPos(d.x, 1, d.z);
        g.sfx.clank(g.doorEm, 0.6);
        if (m.by === g.me) { this.draw(); g.toast('Wedged. Nothing gets through that door for a while.'); }
        return true;
      }
      case 'doorBang': { // the mimic, hammering on a wedged door
        const d = g.level.idoors[m.i | 0];
        if (!d) return true;
        const c = g.camera.position;
        g.doorEm.setPos(d.x, 1.4, d.z);
        g.doorEm.setOcclusion(!g.level.los(c.x, c.z, d.x, d.z));
        g.sfx.knock(g.doorEm);
        return true;
      }
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
    if (this.crossT > 0) {
      this.crossT -= dt;
      this.light.intensity = Math.max(0, this.crossT) * 14;
      if (this.crossT <= 0) this.light.color.setHex(0xff3a20); // (the flare's red again)
    }
    if (this.markT > 0) { const was = Math.ceil(this.markT); this.markT -= dt; if (Math.ceil(this.markT) !== was) this.draw(); }
    for (const mk of this.marks) {
      mk.t -= dt;
      mk.sprite.material.opacity = Math.min(1, mk.t / 3) * (0.7 + Math.sin(g.t * 5) * 0.3);
      if (mk.t <= 0) mk.sprite.removeFromParent();
    }
    this.marks = this.marks.filter((mk) => mk.t > 0);
    for (const sp of this.speakers.values()) if (sp.blink > 0) { sp.blink -= dt; sp.mesh.userData.led.material.emissiveIntensity = sp.blink > 0 && Math.sin(g.t * 30) > 0 ? 6 : 2; }
  }

  // The Scout's mark: the thing in front of you if there is one, else where your view meets a wall or the floor.
  aim() {
    const g = this.g, c = g.camera.position, f = g.camera.getWorldDirection(new THREE.Vector3()), lv = g.level;
    if (g.focus?.active) return { x: g.focus.x, y: (g.focus.y || 0.1) + 0.35, z: g.focus.z };
    let x = c.x, y = c.y, z = c.z;
    for (let i = 0; i < 120; i++) {
      const nx = x + f.x * 0.2, ny = y + f.y * 0.2, nz = z + f.z * 0.2;
      if (ny <= 0.05 || ny >= 2.95 || lv.blocksMove(lv.cellOf(nx), lv.cellOf(nz))) break;
      x = nx; y = ny; z = nz;
    }
    return { x, y: Math.max(0.3, y), z };
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
      case 'soundguy': t = !this.speakers.has(this.g.me) ? `${k}Put the speaker down` : this.charges ? `${k}Play the speaker ×${this.charges}` : 'Speaker dead'; break;
      case 'priest': t = this.charges ? `${k}Crucifix ×${this.charges}` : 'Nothing left to hold up'; break;
      case 'scout': t = this.markT > 0 ? `Mark in ${Math.ceil(this.markT)}s` : `${k}Mark`; break;
      case 'mechanic': t = this.charges ? `${k}Wedge a door ×${this.charges}` : 'No wedges left'; break;
      default: t = 'faster, longer sprints'; // (the runner has nothing to press)
    }
    this.hud.ability.innerHTML = `${this.c.name} · ${t}`;
  }
}
