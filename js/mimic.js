// The mimic: a tall, thin thing that hunts by sound and sight and talks with the player's recorded voice.
//
// States:
//   wander       roams rooms, drifting toward the player
//   investigate  heard something: goes there and listens
//   stalk        hides just out of sight near the player and plays a clip to lure them
//   chase        saw the player
//   hunt         knows which locker/wardrobe the player is hiding in and goes to drag them out
//   peek         (set up by the director) stands still at the end of a corridor, staring
//   flee         was looked at while peeking: darts out of sight
import * as THREE from 'three';
import { faceTexture } from './textures.js';

const TURN = 7;          // rad/s
const STATES = ['wander', 'investigate', 'stalk', 'chase', 'hunt', 'peek', 'flee'];
const RADIUS = 0.35;

function buildModel() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.85 }); // leathery, almost black
  const pale = new THREE.MeshStandardMaterial({ color: 0x2c251f, roughness: 0.8 });
  const part = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const limb = (r1, r2, len, mat) => {
    const g = new THREE.CylinderGeometry(r1, r2, len, 6);
    g.translate(0, -len / 2, 0); // pivot at the top
    return new THREE.Mesh(g, mat);
  };

  const body = new THREE.Group();
  root.add(body);

  // Legs (hip pivot at 1.2m).
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 1.2, 0);
    const thigh = limb(0.07, 0.05, 0.62, skin);
    const knee = new THREE.Group();
    knee.position.y = -0.62;
    const shin = limb(0.05, 0.03, 0.6, skin);
    const foot = part(new THREE.BoxGeometry(0.08, 0.04, 0.26), skin, 0, -0.6, 0.07);
    knee.add(shin, foot, part(new THREE.SphereGeometry(0.055, 8, 6), skin)); // knobbly knee
    hip.add(part(new THREE.SphereGeometry(0.075, 8, 6), skin));
    hip.add(thigh, knee);
    thigh.castShadow = shin.castShadow = true;
    body.add(hip);
    legs.push({ hip, knee });
  }

  // Hunched torso, pivoting at the hips.
  const torso = new THREE.Group();
  torso.position.y = 1.2;
  torso.rotation.x = 0.28;
  body.add(torso);
  const chestGeo = new THREE.CylinderGeometry(0.19, 0.1, 0.82, 9);
  chestGeo.scale(1, 1, 0.55);
  torso.add(part(chestGeo, skin, 0, 0.4, 0));
  const pelvis = new THREE.SphereGeometry(0.15, 10, 8);
  pelvis.scale(1.15, 0.6, 0.75);
  torso.add(part(pelvis, skin, 0, 0.02, 0));
  const collar = new THREE.CylinderGeometry(0.035, 0.035, 0.46, 6);
  collar.rotateZ(Math.PI / 2);
  torso.add(part(collar, skin, 0, 0.74, 0));
  for (let i = 0; i < 5; i++) { // ribs pushing through the skin
    const rib = part(new THREE.CylinderGeometry(0.008, 0.008, 0.28 - i * 0.03, 4), pale, 0, 0.42 + i * 0.07, 0.095);
    rib.rotation.z = Math.PI / 2;
    torso.add(rib);
  }

  // Arms: far too long, hands hang at the knees.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.23, 0.74, 0);
    shoulder.rotation.z = -side * 0.05; // arms hang close, slightly inward
    shoulder.add(part(new THREE.SphereGeometry(0.06, 8, 6), skin));
    const upper = limb(0.045, 0.035, 0.68, skin);
    const elbow = new THREE.Group();
    elbow.position.y = -0.68;
    const fore = limb(0.035, 0.028, 0.66, skin);
    const hand = new THREE.Group();
    hand.position.y = -0.66;
    for (let f = 0; f < 4; f++) {
      const finger = limb(0.012, 0.006, 0.24, pale);
      finger.position.x = (f - 1.5) * 0.025;
      finger.rotation.x = 0.15 * (f - 1.5);
      hand.add(finger);
    }
    elbow.add(fore, hand, part(new THREE.SphereGeometry(0.04, 6, 5), skin));
    shoulder.add(upper, elbow);
    upper.castShadow = fore.castShadow = true;
    torso.add(shoulder);
    arms.push({ shoulder, elbow });
  }

  // Neck and head.
  const neck = new THREE.Group();
  neck.position.y = 0.8;
  torso.add(neck);
  neck.add(part(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 6), skin, 0, 0.12, 0));
  const head = new THREE.Group();
  head.position.y = 0.32;
  head.rotation.x = -0.28; // level the face out of the hunch
  neck.add(head);
  const skull = new THREE.SphereGeometry(0.19, 14, 12);
  skull.scale(0.9, 1.3, 0.82); // flat-fronted, so the face sits on it
  head.add(part(skull, skin));
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.31, 0.42),
    new THREE.MeshStandardMaterial({ map: faceTexture(), color: 0x9a9286, transparent: true, roughness: 0.55, alphaTest: 0.05 }),
  );
  face.position.set(0, -0.02, 0.172);
  head.add(face);
  // Eye shine: tiny points that catch the flashlight in the dark.
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e0, emissiveIntensity: 0.9, fog: false }); // shine through the dark
  const eyes = [-0.045, 0.045].map((x) => part(new THREE.SphereGeometry(0.005, 6, 4), eyeMat, x * 1.15, 0.03, 0.18));
  head.add(...eyes);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, legs, arms, torso, head, eyeMat, eyes };
}

export class Mimic {
  constructor(level, scene, sfx, hooks) {
    this.level = level;
    this.sfx = sfx;
    this.hooks = hooks; // { speak(style, emitter) -> seconds, onCatch(playerId), onSpotted(playerId) }
    this.model = buildModel();
    scene.add(this.model.root);
    this.emitter = sfx.emitter();
    this.breath = sfx.breath(this.emitter); // ragged breathing you hear when it's close

    this.x = level.mimicPos.x; this.z = level.mimicPos.z;
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'wander';
    this.path = [];
    this.wait = 1;
    this.repath = 0;
    this.lostT = 0;
    this.lastSeen = null;
    this.hideTarget = null;
    this.stalkCd = 22 + Math.random() * 15;  // first lure comes fairly soon
    this.speakCd = 10;
    this.screamCd = 0;
    this.speaking = 0;
    this.aggro = 1;
    this.enraged = 0;
    this.phase = 0;
    this.stepDist = 0;
    this.speed = 0;
    this.stuckT = 0;
    this.twitchT = 1;
    this.headRoll = 0;
    this.headRollTarget = 0;
    this.lunge = 0;
    this.frozen = false;
    this.animAcc = 1;
    this.shyT = 0; // after fleeing it keeps its distance for a moment
    this.graceT = 40; // it doesn't hunt you for the first stretch of a run
    this.noticeT = 0; // how long it has been looking at you
    this.targetId = null; // which player it's after
    this.lureStyle = 'lure';
    this.stalkRange = [6, 14];
  }

  dispose() { this.breath.stop(); this.emitter.dispose(); }

  // ---------- senses ----------
  canSee(P, d) {
    if (P.hidden) return false;
    if (this.graceT > 0) return false;
    let range = P.flashOn ? 16 : 9;
    if (P.crouch) range *= 0.75;
    if (this.enraged > 0) range = 40;
    if (d > range) return false;
    if (!this.level.los(this.x, this.z, P.x, P.z)) return false;
    if (d < 2.5 || this.enraged > 0) return true;
    const dx = P.x - this.x, dz = P.z - this.z;
    if ((Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d > 0.5) return true; // in front of it
    // Shining a flashlight in its face gets its attention.
    if (P.flashOn && -(P.lookX * dx + P.lookZ * dz) / d > 0.85) return true;
    return false;
  }

  // A noise at (x, z) audible within `radius` metres.
  hear(x, z, radius, kind) {
    if (this.state === 'chase' || this.state === 'hunt' || this.state === 'peek' || this.state === 'flee' || this.frozen) return;
    if (Math.hypot(x - this.x, z - this.z) > radius) return;
    this.investigate(x, z, kind === 'voice' ? 2.2 : 1.9);
  }

  // The player hid. If it watched them do it, it knows exactly where they are.
  notifyHide(prop, P) {
    if (this.state !== 'chase' || this.lostT > 0.6) return;
    const d = Math.hypot(P.x - this.x, P.z - this.z);
    if (d < 18 && this.level.los(this.x, this.z, P.x, P.z)) this.huntHide(prop, P.id);
  }

  // It heard the player talking from inside a hiding spot.
  foundHidden(prop, id) { if (this.state !== 'hunt') this.huntHide(prop, id); }

  huntHide(prop, id) {
    this.state = 'hunt';
    this.targetId = id;
    this.hideTarget = prop;
    this.path = this.level.findPath(this.x, this.z, prop.front.x, prop.front.z);
    this.repath = 0.5;
  }

  enrage(P) {
    this.enraged = 14;
    this.aggro += 0.1;
    this.lastSeen = { x: P.x, z: P.z };
    this.targetId = P.id;
    this.startChase(true);
  }

  // ---------- state changes ----------
  startChase(silent = false) {
    if (this.state !== 'chase' && !silent) this.hooks.onSpotted(this.targetId);
    this.state = 'chase';
    this.lostT = 0;
    this.repath = 0;
    if (!silent && this.screamCd <= 0 && Math.random() < 0.5) { this.speak('scream'); this.screamCd = 8; }
  }

  investigate(x, z, speed) {
    this.state = 'investigate';
    this.invSpeed = speed;
    this.path = this.level.findPath(this.x, this.z, x, z);
    this.wait = 2 + Math.random() * 2.5;
  }

  wander(P) {
    this.state = 'wander';
    const lv = this.level;
    // Usually drift toward the player's part of the map, sometimes anywhere.
    const near = lv.rooms.filter((r) => Math.hypot(lv.roomCenter(r.id).x - P.x, lv.roomCenter(r.id).z - P.z) < 22);
    const pool = Math.random() < 0.45 && near.length ? near : lv.rooms;
    const room = pool[Math.floor(Math.random() * pool.length)];
    const c = lv.roomCenter(room.id);
    this.path = lv.findPath(this.x, this.z, c.x + (Math.random() - 0.5) * 2, c.z + (Math.random() - 0.5) * 2);
    this.wait = 1 + Math.random() * 3;
  }

  // Find a spot near the player, out of their sight, and go there to call out.
  stalk(P) {
    const lv = this.level;
    let best = null;
    for (let i = 0; i < 70; i++) {
      const p = lv.randomFloor();
      if (!p) continue;
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      const [lo, hi] = this.stalkRange;
      if (d < lo || d > hi || lv.los(p.x, p.z, P.x, P.z)) continue;
      const score = Math.abs(d - (lo + hi) / 2);
      if (!best || score < best.score) best = { ...p, score };
    }
    if (!best) { this.stalkCd = 6; return; }
    const path = lv.findPath(this.x, this.z, best.x, best.z);
    if (!path.length) { this.stalkCd = 6; return; }
    this.state = 'stalk';
    this.path = path;
    this.lures = 0;
    this.wait = 0;
    this.stalkCd = 24 + Math.random() * 22;
  }

  // Appear at (spot) facing the player, and just stare.
  peek(spot, P) {
    this.x = spot.x; this.z = spot.z;
    this.yaw = Math.atan2(P.x - spot.x, P.z - spot.z);
    this.state = 'peek';
    this.targetId = P.id;
    this.path = [];
    this.peekT = 0;
    this.seenT = 0;
    this.speed = 0;
    this.animAcc = 1;
  }

  // Dart to the nearest spot the player can't see.
  flee(P) {
    this.shyT = 10; // keeps its distance for a while, even if it can't find a hiding spot
    const lv = this.level;
    let best = null;
    for (let i = 0; i < 80; i++) {
      const p = lv.randomFloor();
      if (!p || lv.los(p.x, p.z, P.x, P.z)) continue;
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d > 2 && d < 12 && (!best || d < best.d)) best = { ...p, d };
    }
    const path = best ? lv.findPath(this.x, this.z, best.x, best.z) : [];
    if (!path.length) { this.wander(P); return; }
    this.state = 'flee';
    this.path = path;
  }

  speak(style) {
    const d = this.hooks.speak(style, this.emitter);
    this.speaking = d;
    this.speakCd = 9 + Math.random() * 8;
  }

  // ---------- movement ----------
  // Follow this.path. Returns true once there's nowhere left to go.
  follow(dt, speed) {
    const lv = this.level;
    while (this.path.length > 1 && lv.clearWalk(this.x, this.z, this.path[1].x, this.path[1].z, RADIUS)) this.path.shift();
    const wp = this.path[0];
    if (!wp) { this.speed = 0; return true; }
    const dx = wp.x - this.x, dz = wp.z - this.z, dist = Math.hypot(dx, dz);
    if (dist < 0.2) { this.path.shift(); return !this.path.length; }
    const step = Math.min(dist, speed * dt);
    const p = { x: this.x + (dx / dist) * step, z: this.z + (dz / dist) * step };
    lv.collide(p, RADIUS);
    const moved = Math.hypot(p.x - this.x, p.z - this.z);
    this.x = p.x; this.z = p.z;
    this.turnTo(Math.atan2(dx, dz), dt);
    this.speed = moved / dt;
    this.phase += moved * 2.3;
    this.stepDist += moved;
    if (this.stepDist > (speed > 3 ? 1.5 : 1.05)) {
      this.stepDist = 0;
      this.sfx.footstep(this.emitter, { heavy: true, vol: speed > 3 ? 1 : 0.55 });
    }
    // Stuck on a corner: ask for a fresh path.
    if (moved < step * 0.3) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) { this.stuckT = 0; this.path = []; this.repath = 0; }
    } else this.stuckT = 0;
    return false;
  }

  turnTo(target, dt) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
  }

  // ---------- main update ----------
  // players: everyone it can hunt (alive, not escaped): { id, x, z, yaw, hidden, crouch, flashOn, lookX, lookZ }
  update(dt, players, t) {
    if (this.frozen) return; // posed by the jumpscare
    this.speaking = Math.max(0, this.speaking - dt);
    this.speakCd -= dt; this.screamCd -= dt; this.stalkCd -= dt; this.enraged -= dt; this.shyT -= dt; this.graceT -= dt;
    if (!players.length) { // nobody left: drift around
      if (!this.path.length || this.follow(dt, 1.5)) this.wander({ x: this.x, z: this.z });
      this.state = 'wander';
      this.animate(dt, t);
      return;
    }
    const dist = (q) => Math.hypot(q.x - this.x, q.z - this.z);
    const closest = (list) => list.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    // Keep after the same player; switch to whoever it can see if it lost them.
    const seen = players.filter((q) => this.canSee(q, dist(q)) && !(this.shyT > 0 && dist(q) > 5));
    let P = players.find((q) => q.id === this.targetId);
    if (seen.length && (!P || (!seen.includes(P) && this.state !== 'hunt'))) P = closest(seen);
    if (!P) P = closest(players);
    this.targetId = P.id;
    const dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz);
    const sees = seen.includes(P);
    if (!sees) this.noticeT = 0;
    if (sees) {
      this.lastSeen = { x: P.x, z: P.z };
      this.lostT = 0;
      this.noticeT += dt;
      const calm = this.state !== 'chase' && this.state !== 'hunt' && this.state !== 'peek' && this.state !== 'flee';
      if (calm && (this.noticeT > 0.6 || d < 4)) this.startChase();
      else if (calm) this.turnTo(Math.atan2(dx, dz), dt); // it stops and turns toward you...
    }

    switch (this.state) {
      case 'chase': {
        if (!sees) {
          this.lostT += dt;
          if (this.enraged > 0) this.lastSeen = { x: P.x, z: P.z }; // it just knows
          if (P.hidden && this.lostT < 0.6) { this.notifyHide(P.hidden, P); break; }
          if (this.lostT > (this.enraged > 0 ? 7 : 3)) {
            if (this.lastSeen) this.investigate(this.lastSeen.x, this.lastSeen.z, 3.2); else this.wander(P);
            break;
          }
        }
        this.repath -= dt;
        if (this.repath <= 0 && this.lastSeen) {
          const tgt = sees ? P : this.lastSeen;
          this.path = this.level.findPath(this.x, this.z, tgt.x, tgt.z);
          this.repath = 0.3;
        }
        this.follow(dt, (this.enraged > 0 ? 3.8 : 3.0) * this.aggro);
        if (sees && d < 1.35) this.hooks.onCatch(P.id); // long arms
        if (sees && d > 4 && this.screamCd <= 0 && Math.random() < dt * 0.2) { this.speak('scream'); this.screamCd = 9; }
        break;
      }
      case 'hunt': {
        if (!P.hidden || P.id !== this.targetId) { this.state = 'chase'; this.lostT = 0; break; }
        const f = this.hideTarget.front;
        this.repath -= dt;
        if (this.repath <= 0 && !this.path.length) { this.path = this.level.findPath(this.x, this.z, f.x, f.z); this.repath = 0.5; }
        this.follow(dt, 2.8 * this.aggro);
        if (Math.hypot(f.x - this.x, f.z - this.z) < 1.2) this.hooks.onCatch(P.id);
        break;
      }
      case 'peek': {
        this.speed = 0;
        this.turnTo(Math.atan2(dx, dz), dt);
        this.peekT += dt;
        // Is the player looking right at it?
        const looking = !P.hidden && d > 0 && (P.lookX * -dx + P.lookZ * -dz) / d > 0.95 && this.level.los(P.x, P.z, this.x, this.z);
        if (looking) {
          if (this.seenT === 0) this.hooks.onPeekSeen();
          this.seenT += dt;
        }
        if (this.seenT > 0.9 || this.peekT > 7 || d < 6) this.flee(P);
        break;
      }
      case 'flee': {
        if (this.follow(dt, 6.5)) { this.shyT = 8; this.wander(P); }
        if (d < 2.5 && !P.hidden) this.startChase();
        break;
      }
      case 'investigate': {
        if (this.path.length) { this.follow(dt, this.invSpeed * this.aggro); break; }
        this.speed = 0;
        this.yaw += Math.sin(t * 1.3) * dt * 1.5; // looks around, listening
        this.wait -= dt;
        if (this.wait <= 0) {
          if (this.stalkCd <= 0 && d < 30) this.stalk(P); else this.wander(P);
        }
        break;
      }
      case 'stalk': {
        if (this.path.length) { this.follow(dt, 2.4 * this.aggro); break; }
        this.speed = 0;
        this.turnTo(Math.atan2(dx, dz), dt); // face where the player is, through the wall
        this.wait -= dt;
        if (this.wait <= 0) {
          if (this.lures < (Math.random() < 0.45 ? 2 : 1)) {
            this.speak(this.lureStyle);
            this.lures++;
            this.wait = this.speaking + 3 + Math.random() * 3;
          } else this.wander(P);
        }
        break;
      }
      default: { // wander
        if (this.path.length) this.follow(dt, 1.5 * this.aggro);
        else {
          this.speed = 0;
          this.wait -= dt;
          if (this.wait <= 0) this.wander(P);
        }
        if (this.stalkCd <= 0 && d < 30) this.stalk(P);
        else if (this.speakCd <= 0 && d < 16 && !this.level.los(this.x, this.z, P.x, P.z) && Math.random() < dt * 0.06) this.speak(this.lureStyle);
      }
    }
    this.animate(dt, t);
  }

  animate(dt, t) {
    const m = this.model;
    const peeking = this.state === 'peek';
    m.eyeMat.emissiveIntensity = peeking ? 6 : 0.9;
    m.eyes.forEach((e) => e.scale.setScalar(peeking ? 4.5 : 1));
    // Outside a chase it moves like stop-motion: the pose only updates ~9 times a second.
    this.animAcc += dt;
    const fast = this.state === 'chase' || this.state === 'hunt' || this.state === 'flee';
    if (!fast && this.animAcc < 0.11) { this.emitter.setPos(this.x, 2.2, this.z); return; }
    dt = this.animAcc;
    this.animAcc = 0;
    m.root.position.set(this.x, 0, this.z);
    m.root.rotation.y = this.yaw;
    const k = Math.min(1, this.speed / 2.5);
    const s = Math.sin(this.phase);
    m.legs[0].hip.rotation.x = s * 0.6 * k;
    m.legs[1].hip.rotation.x = -s * 0.6 * k;
    // Always slightly crouched, like it's about to spring.
    m.legs[0].hip.rotation.x -= 0.12;
    m.legs[1].hip.rotation.x -= 0.12;
    m.legs[0].knee.rotation.x = 0.25 + Math.max(0, -Math.cos(this.phase)) * 0.9 * k;
    m.legs[1].knee.rotation.x = 0.25 + Math.max(0, Math.cos(this.phase)) * 0.9 * k;
    m.arms[0].shoulder.rotation.x = -s * 0.35 * k + 0.05;
    m.arms[1].shoulder.rotation.x = s * 0.35 * k + 0.05;
    m.arms[0].elbow.rotation.x = -0.15 - k * 0.2;
    m.arms[1].elbow.rotation.x = -0.15 - k * 0.2;
    m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * k;
    m.torso.rotation.x = 0.28 + k * 0.15 + (this.state === 'chase' ? 0.12 : 0);

    // Head: jerky twitches; tilts while it talks; scans when standing still.
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = 0.3 + Math.random() * 2.5;
      this.headRollTarget = (Math.random() - 0.5) * 0.9;
    }
    const roll = this.speaking > 0 ? 0.55 : this.headRollTarget;
    this.headRoll += (roll - this.headRoll) * Math.min(1, dt * (this.speaking > 0 ? 3 : 22));
    m.head.rotation.z = this.headRoll;
    m.head.rotation.y = this.speed < 0.1 && this.state !== 'stalk' ? Math.sin(t * 0.9) * 0.7 : 0;

    this.emitter.setPos(this.x, 2.2 + m.root.position.y, this.z);
  }

  // ---------- puppet (multiplayer, non-host): follows the host's snapshots ----------
  // s: [x, z, yaw, stateIndex, speaking]
  applySnap(s) {
    [this.tx, this.tz, this.tyaw] = s;
    this.state = STATES[s[3]] || 'wander';
    this.speaking = s[4] ? 1 : 0;
    if (this.tx0 === undefined) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; this.tx0 = 1; }
  }

  puppet(dt, t) {
    if (this.frozen || this.tx0 === undefined) return;
    const k = 1 - Math.exp(-dt * 12);
    const ox = this.x, oz = this.z;
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    this.yaw += Math.atan2(Math.sin(this.tyaw - this.yaw), Math.cos(this.tyaw - this.yaw)) * k;
    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.speed = moved / dt;
    this.phase += moved * 2.3;
    this.stepDist += moved;
    if (this.stepDist > (this.speed > 3 ? 1.5 : 1.05)) {
      this.stepDist = 0;
      this.sfx.footstep(this.emitter, { heavy: true, vol: this.speed > 3 ? 1 : 0.55 });
    }
    this.animate(dt, t);
  }

  snap() { return [+this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), STATES.indexOf(this.state), this.speaking > 0 ? 1 : 0]; }

  // Jumpscare pose: crouched right in front of the camera.
  pose(x, z, yaw, t) {
    this.frozen = true;
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0;
    const m = this.model;
    m.root.position.set(x, -0.75, z);
    m.root.rotation.y = yaw;
    m.torso.rotation.x = 0.55;
    m.head.rotation.z = Math.sin(t * 40) * 0.08 + 0.35;
    m.head.rotation.y = 0;
    m.arms.forEach((a, i) => { a.shoulder.rotation.x = -1.3; a.shoulder.rotation.z = (i ? 1 : -1) * 0.5; });
  }
}
