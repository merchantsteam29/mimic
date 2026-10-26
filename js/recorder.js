// Your own tape recorder: turn its trick back on it. Two lie somewhere in every building (the same spots
// for everyone). Pick one up, press X and say something; press X again to put it down. A few seconds later
// it starts playing what you said, three times, loudly, and the mimic (and the listener) go to see who's
// there. Then anyone can pick it up again.
//   intent 'recDrop' {i, x, z, key} -> broadcast 'recSet' {i, x, z, key, by}; plays are timed on every browser.
import * as THREE from 'three';
import { mulberry32, CELL, FLOOR } from './level.js';
import { keyLabel } from './controls.js';

const PLAYS = [4, 11, 18]; // seconds after it's put down
const LISTEN = 8;          // seconds to say something after pressing X

function makeMesh() {
  const g = new THREE.Group(), black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const reel = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.5 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.13), black); b.position.y = 0.03; g.add(b);
  for (const x of [-0.05, 0.05]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 12), reel); r.position.set(x, 0.065, 0); g.add(r); }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0x401010 }));
  led.position.set(0.09, 0.062, 0.05); g.add(led);
  g.userData.led = led.material;
  return g;
}

export class Recorder {
  constructor(g) {
    this.g = g;
    this.phase = 'none'; // none | empty (holding it) | recording | ready
    this.held = null;    // my item
    this.holders = new Map(); // host: item index -> who has it
    this.em = g.sfx.emitter();
    // Two spots from the seed, away from the start room.
    const lv = g.level, rand = mulberry32(lv.seed ^ 0x7ec0), cells = [];
    for (let z = 1; z < lv.N - 1; z++) for (let x = 1; x < lv.N - 1; x++) {
      if (lv.get(x, z) === FLOOR && lv.roomId[z * lv.N + x] >= 0 && lv.roomId[z * lv.N + x] !== lv.spawnRoom) cells.push([x, z]);
    }
    this.items = [];
    for (let k = 0; k < 2 && cells.length; k++) {
      const [cx, cz] = cells.splice(Math.floor(rand() * cells.length), 1)[0];
      const x = (cx + 0.5) * CELL + (rand() - 0.5) * 0.6, z = (cz + 0.5) * CELL + (rand() - 0.5) * 0.6;
      const mesh = makeMesh();
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rand() * Math.PI * 2;
      g.world.group.add(mesh);
      const it = { type: 'recorder', x, y: 0.1, z, mesh, range: 2.1, active: true };
      g.items.push(it);
      this.items.push(it);
    }
  }

  // Keys: X records, then puts it down. True if used.
  onKey(code) {
    if (code !== 'KeyX' || this.phase === 'none') return false;
    const g = this.g;
    if (this.phase === 'empty') {
      this.phase = 'recording';
      this.listenT = LISTEN;
      this.clips0 = g.voice.clips.length;
      this.held.mesh.userData.led.color.setHex(0xff2020);
      g.toast(g.voice.started ? 'Recording. Say something.' : 'No microphone: it will play the last thing it heard you say.');
      if (!g.voice.started) this.finish();
    } else if (this.phase === 'ready') this.drop();
    return true;
  }

  // The recording: your newest clip, or failing that the last one you made.
  finish() {
    const g = this.g, own = g.voice.clips;
    this.clip = own.length > this.clips0 ? own[own.length - 1] : own[own.length - 1] || null;
    this.phase = 'ready';
    g.toast(this.clip ? `Got it. ${keyLabel('X')} to put it down somewhere.` : `It's blank, but it hisses. ${keyLabel('X')} to put it down.`);
  }

  drop() {
    const g = this.g, p = g.p, i = g.items.indexOf(this.held);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const at = g.level.collide({ x: p.x + fx * 0.6, z: p.z + fz * 0.6 }, 0.15);
    g.send({ t: 'recDrop', i, x: +at.x.toFixed(2), z: +at.z.toFixed(2), key: this.clip?.key || null });
    this.myClip = this.clip; // (alone there's no key: the buffer is played from here)
    this.phase = 'none';
    this.held = null;
  }

  // Picked one up (from 'took').
  took(it, by) {
    it.mesh.visible = false;
    if (this.g.isHost) this.holders.set(this.g.items.indexOf(it), by);
    if (by !== this.g.me) return;
    this.held = it;
    this.phase = 'empty';
    it.mesh.userData.led.color.setHex(0x401010);
    this.g.toast(`Tape recorder. ${keyLabel('X')} to record your voice on it.`);
  }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'recDrop') return false;
    const g = this.g, it = g.items[m.i | 0];
    if (!it || it.type !== 'recorder' || this.holders.get(m.i | 0) !== from) return true;
    this.holders.delete(m.i | 0);
    const at = g.level.collide({ x: Number(m.x) || it.x, z: Number(m.z) || it.z }, 0.15);
    g.broadcast({ t: 'recSet', i: m.i | 0, x: +at.x.toFixed(2), z: +at.z.toFixed(2), key: typeof m.key === 'string' ? m.key : null, by: from });
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    if (m.t !== 'recSet') return false;
    const g = this.g, it = g.items[m.i | 0];
    if (!it) return true;
    it.x = m.x; it.z = m.z; it.active = false;
    it.mesh.position.set(m.x, 0, m.z);
    it.mesh.visible = true;
    it.mesh.userData.led.color.setHex(0xff2020);
    const buffer = m.by === g.me ? this.myClip?.buffer : g.mp?.clips.get(m.key)?.buffer;
    const t0 = g.t;
    (this.playing ||= []).push({ it, buffer, at: PLAYS.map((s) => t0 + s), x: m.x, z: m.z });
    return true;
  }

  update(dt) {
    const g = this.g;
    if (this.phase === 'recording') {
      this.listenT -= dt;
      if (g.voice.clips.length > this.clips0 || this.listenT <= 0) this.finish();
    }
    for (const pl of this.playing || []) {
      if (pl.at.length && g.t >= pl.at[0]) {
        pl.at.shift();
        const c = g.camera.position;
        this.em.setPos(pl.x, 0.3, pl.z);
        this.em.setOcclusion(!g.level.los(c.x, c.z, pl.x, pl.z));
        const d = pl.buffer ? g.sfx.playVoice(pl.buffer, this.em, 'recorder') : g.sfx.whisper(this.em);
        g.voice.suppress(d + 0.3);
        if (g.isHost) { // it's loud: they come to see who's talking
          g.mimic.hear(pl.x, pl.z, 24, 'voice');
          g.ls.hear(pl.x, pl.z, 24, 'voice');
          g.hunt.heard(pl.x, pl.z, 24);
        }
        if (!pl.at.length) pl.doneT = g.t + d + 1;
      }
      if (!pl.at.length && g.t >= pl.doneT) { pl.it.active = true; pl.it.mesh.userData.led.color.setHex(0x401010); pl.done = true; }
    }
    if (this.playing?.some((pl) => pl.done)) this.playing = this.playing.filter((pl) => !pl.done);
  }

  // A line for the HUD.
  line() {
    return { empty: `Tape recorder: ${keyLabel('X')} to record`, recording: 'Tape recorder: recording…', ready: `Tape recorder: ${keyLabel('X')} to put it down` }[this.phase] || null;
  }

  dispose() { this.em.dispose(); }
}
