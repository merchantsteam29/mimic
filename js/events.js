// Hand-placed scares: unlike the director's dice rolls, these wait for the right moment.
//   hello         ~9 s in, your own "Hello? Is anyone there?" is whispered from somewhere in your room
//   the crossing  look down a long empty hallway: it sprints across the far end
//   the slam      an open door ahead of you slams shut
//   first steps   the first time you make progress on a job: the lights stutter, something screams far off
//   lights out    in a corridor, the lights behind you go out one by one, toward you; then a step right behind
//   first hide    the first time you hide, something knocks on the door
// All local to one player (doors go through the host so everyone's stay in sync).
import * as THREE from 'three';
import { buildModel } from './mimic.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class Events {
  constructor(game) {
    this.g = game;
    this.em = game.sfx.emitter();
    this.helloDone = false;
    this.crossCd = rand(45, 70);
    this.slamCd = rand(30, 50);
    this.lightsCd = rand(60, 90);
    this.seen = new Set(); // first-progress reactions already done
    this.hidOnce = false;
    this.cross = null;
    this.chain = null;
  }

  dispose() { this.em.dispose(); this.cross?.root.removeFromParent(); }

  at(x, y, z) {
    const c = this.g.camera.position;
    this.em.setPos(x, y, z);
    this.em.setOcclusion(!this.g.level.los(c.x, c.z, x, z));
  }

  busy() { return ['chase', 'hunt', 'sniff', 'transform'].includes(this.g.mimic.state); }

  update(dt) {
    const g = this.g;
    if (g.state !== 'playing') return;
    this.crossCd -= dt; this.slamCd -= dt; this.lightsCd -= dt;
    this.hello();
    this.updateCross(dt);
    this.updateChain(dt);
    if (this.busy() || g.p.hidden) return;
    if (this.crossCd <= 0) this.tryCross();
    if (this.slamCd <= 0) this.trySlam();
    if (this.lightsCd <= 0) this.tryLightsOut();
  }

  // ~9 s in: your own first words, whispered back from your own room.
  hello() {
    const g = this.g;
    if (this.helloDone || g.time < 9) return;
    this.helloDone = true;
    const own = g.voice.clips.filter((c) => c.tag === 'seed');
    const clip = own[0] || g.voice.clips[0];
    if (!clip) return;
    const p = g.p, a = p.yaw + Math.PI + rand(-0.8, 0.8); // behind you, somewhere
    const x = p.x - Math.sin(a) * 3, z = p.z - Math.cos(a) * 3;
    const q = g.level.collide({ x, z }, 0.3);
    this.at(q.x, 1.5, q.z);
    const d = g.sfx.playVoice(clip.buffer, this.em, 'whisper');
    g.voice.suppress(d + 0.3);
  }

  // Look down a long, empty hallway: it runs across the far end.
  tryCross() {
    const g = this.g, c = g.camera.position, lv = g.level, m = g.mimic;
    if (Math.hypot(m.x - g.p.x, m.z - g.p.z) < 14) return;
    const fwd = g.camera.getWorldDirection(new THREE.Vector3());
    const f = Math.hypot(fwd.x, fwd.z);
    if (f < 0.6) return;
    const dx = fwd.x / f, dz = fwd.z / f;
    let len = 0;
    while (len < 18 && lv.passable(lv.cellOf(c.x + dx * (len + 0.5)), lv.cellOf(c.z + dz * (len + 0.5)))) len += 0.5;
    if (len < 11) return;
    const fx = c.x + dx * len * 0.85, fz = c.z + dz * len * 0.85;
    const px = -dz, pz = dx; // across the hallway
    const model = buildModel();
    model.root.position.set(fx - px * 1.2, 0, fz - pz * 1.2);
    model.root.rotation.y = Math.atan2(px, pz);
    model.torso.rotation.x = 1.0;
    g.scene.add(model.root);
    this.cross = { root: model.root, model, x: fx - px * 1.2, z: fz - pz * 1.2, px, pz, t: 0, step: 0 };
    this.crossCd = rand(110, 170);
  }

  updateCross(dt) {
    const c = this.cross;
    if (!c) return;
    c.t += dt;
    c.x += c.px * 7 * dt; c.z += c.pz * 7 * dt;
    c.root.position.set(c.x, 0, c.z);
    const s = Math.sin(c.t * 20);
    c.model.legs.forEach((l, i) => { l.hip.rotation.x = (i ? s : -s) * 0.9; });
    c.model.arms.forEach((a, i) => { a.shoulder.rotation.x = (i ? -s : s) * 0.7; });
    c.step -= dt;
    if (c.step <= 0) { this.at(c.x, 0.3, c.z); this.g.sfx.footstep(this.em, { heavy: true, vol: 1.2 }); c.step = 0.16; }
    if (c.t > 0.5 || !this.g.level.passable(this.g.level.cellOf(c.x), this.g.level.cellOf(c.z))) { c.root.removeFromParent(); this.cross = null; }
  }

  // An open door just ahead of you slams shut.
  trySlam() {
    const g = this.g, c = g.camera.position, fwd = g.camera.getWorldDirection(new THREE.Vector3());
    const d = g.level.idoors.find((door) => {
      if (!door.open) return false;
      const dx = door.x - c.x, dz = door.z - c.z, dist = Math.hypot(dx, dz);
      return dist > 3 && dist < 7 && (fwd.x * dx + fwd.z * dz) / dist > 0.8 && g.level.los(c.x, c.z, door.x - door.dx * 0.3, door.z - door.dz * 0.3);
    });
    if (!d) return;
    this.slamCd = rand(90, 150);
    g.send({ t: 'door', i: d.i }); // shut (through the host, so everyone's door shuts)
    this.at(d.x, 1.2, d.z);
    g.sfx.rec('slam', this.em, { vol: 1.8 });
  }

  // Called by the game the first time you make progress on each job.
  progress(kind) {
    if (this.seen.has(kind)) return;
    this.seen.add(kind);
    const g = this.g, p = g.p;
    for (const L of g.world.fixtures) if (Math.hypot(L.x - p.x, L.z - p.z) < 16) L.burst = 1.2 + Math.random();
    const q = g.level.randomFloor((s) => Math.hypot(s.x - p.x, s.z - p.z) > 14 && !g.level.los(s.x, s.z, p.x, p.z));
    if (q) setTimeout(() => { if (g.state === 'playing') { this.at(q.x, 1.7, q.z); g.localSpeak('scream', this.em); } }, 900);
  }

  // In a corridor: the lights behind you go out one by one, toward you. Then a step, right behind.
  tryLightsOut() {
    const g = this.g, p = g.p, lv = g.level;
    if (lv.roomId[lv.cellOf(p.z) * lv.N + lv.cellOf(p.x)] >= 0 || p.speed < 0.5) return; // walking down a corridor
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const behind = g.world.fixtures.filter((L) => {
      const dx = L.x - p.x, dz = L.z - p.z, d = Math.hypot(dx, dz);
      return d < 14 && d > 1 && (dx * fx + dz * fz) / d < -0.3 && L.level > 0.5 && !L.broken;
    }).sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    if (behind.length < 2) return;
    this.lightsCd = rand(140, 200);
    this.chain = { lights: behind, i: 0, t: 0 };
  }

  updateChain(dt) {
    const ch = this.chain, g = this.g;
    if (!ch) return;
    ch.t -= dt;
    if (ch.t > 0) return;
    if (ch.i < ch.lights.length) {
      const L = ch.lights[ch.i++];
      L.offUntil = g.t + 7;
      this.at(L.x, 2.8, L.z);
      g.sfx.click();
      ch.t = 0.5;
      return;
    }
    // ...and something is right behind you.
    const p = g.p;
    this.at(p.x + Math.sin(p.yaw) * 2, 0.3, p.z + Math.cos(p.yaw) * 2);
    g.sfx.footstep(this.em, { heavy: true, vol: 1.5 });
    g.sfx.sniff(this.em);
    this.chain = null;
  }

  // The first time you hide (and it isn't after you), something knocks.
  onHide() {
    if (this.hidOnce || this.busy()) return;
    this.hidOnce = true;
    setTimeout(() => { if (this.g.p.hidden && this.g.state === 'playing') this.g.director.knock(); }, 3000);
  }
}
