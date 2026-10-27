// Different jobs and different ways out, so runs don't all play the same (picked from the seed: the same for everyone).
//   code - the exit has a keypad. The code is scrawled on a sheet of paper somewhere in the building, and only
//          whoever reads it sees it: they have to say it out loud (it hears that too). Type the four digits at
//          the keypad (keyboard: the number keys; if you read it yourself, E types it for you). Beeping is loud.
//          intent 'keypad' {code} -> broadcast 'coded' {by}, or 'codeBad' back to that player.
//   lift - the way out is a lift. With the power back, call it at the exit, then hold on for 40 s while it comes
//          down (and it comes for you). intent 'callLift' -> broadcast 'liftCalled', then 'liftHere'.
import * as THREE from 'three';
import { mulberry32, CELL, FLOOR, WALL_H } from './level.js';
import { keyLabel } from './controls.js';

const LIFT_WAIT = 40;

export class Escape {
  // plain: an ordinary run (not a story chapter, the tutorial, the waiting room, the night shift or hide and seek).
  constructor(g, plain) {
    this.g = g;
    const lv = g.level, r = mulberry32(lv.seed ^ 0xc0de);
    this.code = plain && r() < 0.4 ? String(1000 + Math.floor(r() * 9000)) : null;
    this.lift = plain && r() < 0.35;
    this.known = false;     // I've read the note
    this.coded = !this.code;
    this.entry = null;      // digits typed so far, while at the keypad
    this.called = false; this.waitT = 0; this.here = false;
    this.em = g.sfx.emitter();
    if (this.code) {
      // The note: on the floor of a room far from the start.
      const sp = lv.spawnPos, cells = [];
      for (let z = 1; z < lv.N - 1; z++) for (let x = 1; x < lv.N - 1; x++) {
        const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
        if (lv.get(x, z) === FLOOR && lv.roomId[z * lv.N + x] >= 0 && Math.hypot(cx - sp.x, cz - sp.z) > 14) cells.push([cx, cz]);
      }
      const [x, z] = cells.length ? cells[Math.floor(r() * cells.length)] : [sp.x + 3, sp.z];
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0xd8d4c4, emissive: 0x2a2820, roughness: 1 }));
      mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = r() * 6.28;
      mesh.position.set(x + (r() - 0.5) * 0.6, 0.012, z + (r() - 0.5) * 0.6);
      g.world.group.add(mesh);
      g.items.push({ type: 'note', x: mesh.position.x, y: 0.05, z: mesh.position.z, mesh, range: 2.0, active: true });
      // The keypad: on the wall beside the exit, a red light until it's open.
      const ex = lv.exit, px = -ex.dz, pz = ex.dx;
      const fx = (ex.wx + 0.5) * CELL - ex.dx * (CELL / 2 + 0.02) + px * 0.9, fz = (ex.wz + 0.5) * CELL - ex.dz * (CELL / 2 + 0.02) + pz * 0.9;
      const pad = new THREE.Group();
      pad.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.5, metalness: 0.5 })));
      this.led = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 2 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), this.led);
      led.position.set(0, 0.1, 0.03);
      pad.add(led);
      pad.position.set(fx, 1.3, fz);
      pad.rotation.y = Math.atan2(-ex.dx, -ex.dz);
      g.world.group.add(pad);
      this.pad = { x: fx - ex.dx * 0.3, z: fz - ex.dz * 0.3 };
      g.items.push({ type: 'keypad', x: fx - ex.dx * 0.1, y: 1.3, z: fz - ex.dz * 0.1, range: 2.0, active: true });
    }
    this.liftItem = this.lift ? g.items.find((i) => i?.type === 'exit') : null;
  }

  lines() {
    const out = [];
    if (this.code && !this.coded) out.push(this.known ? `The exit code is ${this.code.split('').join(' ')}: type it at the keypad` : 'The exit has a keypad. Someone wrote the code down somewhere');
    return out;
  }

  // After power-on: the lift instead of the door.
  powerLine() {
    if (!this.lift) return null;
    if (this.here) return 'THE LIFT IS HERE. GET IN.';
    if (this.called) return `The lift is coming: ${Math.ceil(LIFT_WAIT - this.waitT)} s. Hold on.`;
    return 'Call the lift at the exit';
  }

  missing() { return this.code && !this.coded ? 'The exit\'s keypad is still locked' : null; }

  prompt(it) {
    if (it.type === 'note') return 'Read the note';
    if (it.type === 'keypad') return this.coded ? null : this.known ? 'Type the code' : 'Use the keypad';
    if (it.type === 'exit' && this.lift && this.g.power && !this.called) return 'Call the lift';
    return undefined;
  }

  interact(it) {
    const g = this.g;
    if (it.type === 'note') {
      this.known = true;
      g.sfx.rec('cloth', null, { vol: 0.5 });
      g.toast(`Scrawled on it in marker: ${this.code.split('').join(' ')}. Only you saw it.`);
      g.updateObjective();
      return true;
    }
    if (it.type === 'keypad') {
      if (this.coded) return true;
      if (this.known) { this.enter(this.code); return true; }
      this.entry = '';
      g.toast(`Keypad: type the 4 numbers (${keyLabel('E')} again to stop)`);
      return true;
    }
    if (it.type === 'exit' && this.lift && g.power && !this.called) { g.send({ t: 'callLift' }); return true; }
    return false;
  }

  // Typing at the keypad (keyboard number keys). True if the key was used.
  onKey(code) {
    if (this.entry === null) return false;
    const g = this.g, f = g.focus;
    if (!f || f.type !== 'keypad' || code === 'KeyE') { this.entry = null; return code === 'KeyE'; }
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (!m) return false;
    this.entry += m[1];
    g.sfx.beep(0.3);
    g.toast(`Keypad: ${this.entry.padEnd(4, '_').split('').join(' ')}`);
    if (this.entry.length >= 4) { const c = this.entry; this.entry = null; this.enter(c); }
    return true;
  }

  enter(code) {
    const g = this.g;
    for (let i = 0; i < 4; i++) setTimeout(() => g.sfx.beep(0.3), i * 140);
    g.send({ t: 'keypad', code: String(code).slice(0, 8) });
  }

  // Host: intents.
  hostHandle(m, from) {
    const g = this.g;
    if (m.t === 'keypad') {
      if (!this.code || this.coded || !g.alive(from)) return true;
      g.mimic.hear(this.pad.x, this.pad.z, 16, 'step');
      if (String(m.code) === this.code) g.broadcast({ t: 'coded', by: from });
      else g.sendTo(from, { t: 'codeBad' });
      return true;
    }
    if (m.t === 'callLift') {
      if (!this.lift || !g.power || this.called || !g.alive(from)) return true;
      g.broadcast({ t: 'liftCalled', by: from });
      return true;
    }
    return false;
  }

  onNet(m) {
    const g = this.g;
    switch (m.t) {
      case 'coded':
        this.coded = true;
        this.led?.emissive.setHex(0x20ff40);
        if (g.state === 'playing') g.toast(m.by === g.me ? 'The keypad clicks. The exit\'s lock is open.' : `${g.nameOf(m.by)} got the keypad open.`);
        g.updateObjective();
        return true;
      case 'codeBad':
        g.sfx.denied();
        g.toast('Wrong code.');
        return true;
      case 'liftCalled': {
        this.called = true; this.waitT = 0;
        if (this.liftItem) this.liftItem.active = false;
        const ex = g.level.exit;
        this.em.setPos((ex.wx + 0.5) * CELL, WALL_H, (ex.wz + 0.5) * CELL);
        g.sfx.rumble(4); g.sfx.clank(this.em, 0.8);
        if (g.state === 'playing') g.toast('Somewhere above, the lift starts to move. Slowly.');
        if (g.isHost) g.mimic.hear((ex.fx + 0.5) * CELL, (ex.fz + 0.5) * CELL, 60, 'step'); // it heard that too
        g.updateObjective();
        return true;
      }
      case 'liftHere':
        this.here = true;
        g.doorT = 0; // the doors slide open
        g.sfx.chime?.();
        g.updateObjective();
        return true;
    }
    return false;
  }

  update(dt) {
    const g = this.g;
    if (!this.called || this.here) return;
    const before = Math.ceil(LIFT_WAIT - this.waitT);
    this.waitT += dt;
    if (Math.ceil(LIFT_WAIT - this.waitT) !== before) g.updateObjective();
    if (g.isHost && this.waitT >= LIFT_WAIT) { this.waitT = LIFT_WAIT; g.broadcast({ t: 'liftHere' }); this.here = true; }
  }

  dispose() { this.em.dispose(); }
}
