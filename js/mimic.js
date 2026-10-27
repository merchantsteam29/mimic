// The mimic: a tall, thin thing that hunts by sound and sight and talks with the player's recorded voice.
//
// States:
//   wander       roams rooms, drifting toward the player
//   investigate  heard something: goes there and listens
//   stalk        hides just out of sight near the player and plays a clip to lure them
//   chase        saw the player
//   hunt         knows which locker/wardrobe the player is hiding in and goes to drag them out
//   peek         (set up by the director) stands still at the end of a corridor, staring
//   flee         was looked at while peeking (or stunned): darts out of sight
//   stunned      hit by a flare / a medic's rescue: blinded for a few seconds, then flees
//   sniff        at the door of a hiding spot, listening (the hidden player plays the heartbeat game)
//   transform    the power came back: it convulses into its second form, then hunts
// Also: it may crawl on the ceiling (dropping down when it chases), wear a dead player's body
// (online), and open doors (slowly, unless it's chasing).
import * as THREE from 'three';
import { faceTexture, jawTexture, skinNormal } from './textures.js';

const TURN = 7;          // rad/s
const STATES = ['wander', 'investigate', 'stalk', 'chase', 'hunt', 'peek', 'flee', 'stunned', 'sniff', 'transform'];
const CEIL = 3;          // ceiling height (level.js WALL_H)
const DROP = 0.45;       // seconds to drop from the ceiling
const RADIUS = 0.35;
// Difficulty: how fast it moves, how far it sees, how often it talks (a multiplier on the wait between lures).
export const DIFFICULTY = {
  easy: { name: 'Easy', speed: 0.85, sight: 0.8, talk: 1.35, battery: 1.5, grace: 20, hunger: 1.5 },
  normal: { name: 'Normal', speed: 1, sight: 1, talk: 1, battery: 1, grace: 0, hunger: 1 },
  nightmare: { name: 'Nightmare', speed: 1.15, sight: 1.25, talk: 0.7, battery: 0.7, grace: -8, hunger: 0.65 },
};

export function buildModel() {
  const root = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x3c3832, roughness: 0.55, normalMap: skinNormal(), normalScale: new THREE.Vector2(0.8, 0.8) }); // grey, clammy, almost human
  const pale = new THREE.MeshStandardMaterial({ color: 0x3e3832, roughness: 0.8 });
  const part = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  // Smooth, rounded limbs (pivot at the top).
  const limb = (r1, r2, len, mat) => {
    const r = (r1 + r2) / 2;
    const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 10);
    g.translate(0, -len / 2, 0);
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
  // A starved body: a wide ribcage over a sunken belly.
  const profile = [[0.075, 0], [0.085, 0.1], [0.075, 0.22], [0.11, 0.34], [0.15, 0.48], [0.165, 0.6], [0.155, 0.7], [0.12, 0.78], [0.05, 0.83]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const chestGeo = new THREE.LatheGeometry(profile, 16);
  chestGeo.scale(1, 1, 0.62);
  torso.add(part(chestGeo, skin, 0, 0, 0));
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
      const finger = limb(0.01, 0.005, 0.32, pale); // far too long
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

  // Second form: another pair of arms, folded against its chest until the power comes back.
  const extra = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.19, 0.42, 0.06);
    sh.rotation.set(-0.4, 0, side * 0.6);
    const el = new THREE.Group();
    el.position.y = -0.55;
    el.rotation.x = -1.2;
    el.add(limb(0.025, 0.02, 0.6, skin));
    sh.add(limb(0.035, 0.025, 0.55, skin), el);
    sh.visible = false;
    torso.add(sh);
    extra.push(sh);
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
  const hairMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); // unlit: hair stays black however close the flashlight is
  const skull = new THREE.SphereGeometry(0.17, 14, 12);
  skull.scale(0.88, 1.32, 0.85);
  head.add(part(skull, hairMat)); // the back of its head is all hair
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(), transparent: true, roughness: 0.5, alphaTest: 0.04 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), faceMat);
  face.position.set(0, 0.03, 0.15);
  head.add(face);
  // Behind the jaw: the inside of its mouth (red, in the second form).
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.22), new THREE.MeshBasicMaterial({ color: 0x080303 }));
  mouth.position.set(0, -0.2, 0.12);
  head.add(mouth);
  // The jaw hangs from a hinge just under the teeth, and opens far too wide.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.145);
  const jg = new THREE.PlaneGeometry(0.22, 0.15);
  jg.translate(0, -0.075, 0);
  jaw.add(new THREE.Mesh(jg, new THREE.MeshStandardMaterial({ map: jawTexture(), transparent: true, roughness: 0.5, alphaTest: 0.04 })));
  head.add(jaw);
  // Long black hair: down its back and either side of its face, a few strands across it.
  const hair = new THREE.Group();
  head.add(hair);
  const strand = (x, z, len, w) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.006), hairMat);
    m.geometry.translate(0, -len / 2, 0);
    m.position.set(x, 0.2, z);
    m.rotation.set((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.15);
    hair.add(m);
  };
  for (let i = 0; i < 34; i++) {
    const a = Math.PI * (0.3 + (i / 34) * 1.4); // from one side, round the back, to the other
    strand(Math.sin(a) * 0.15, Math.cos(a) * 0.14, 0.45 + Math.random() * 0.4, 0.014 + Math.random() * 0.012);
  }
  for (const x of [-0.13, -0.11, 0.11, 0.13]) strand(x, 0.14, 0.4 + Math.random() * 0.2, 0.02); // framing the face
  for (const x of [-0.05, 0.02, 0.06]) strand(x, 0.168, 0.22 + Math.random() * 0.12, 0.005); // a few across it
  // Eye shine: two pinpricks that catch the flashlight.
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e0, emissiveIntensity: 0.7, fog: false });
  const eyes = [[-0.044, 0.044], [0.049, 0.04]].map(([x, y]) => part(new THREE.SphereGeometry(0.004, 6, 4), eyeMat, x, y, 0.156));
  head.add(...eyes);

  root.rotation.order = 'YXZ'; // so it can flip upside down onto the ceiling
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, legs, arms, torso, head, eyeMat, eyes, extra, mouth, jaw, hair };
}

export class Mimic {
  constructor(level, scene, sfx, hooks) {
    this.level = level;
    this.sfx = sfx;
    this.hooks = hooks; // { speak(style, emitter) -> seconds, onCatch(playerId), onSpotted(playerId), onSniff(playerId) }
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
    this.stalkCd = 12 + Math.random() * 8;   // the first lure comes soon
    this.speakCd = 10;
    this.diff = DIFFICULTY.normal; // set by the game
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
    this.graceT = 18; // it doesn't hunt you for the first stretch of a run
    this.noticeT = 0; // how long it has been looking at you
    this.targetId = null; // which player it's after
    this.lureStyle = 'lure';
    this.stalkRange = [6, 14];
    this.ceiling = false;  // crawling on the ceiling
    this.dropT = 0;
    this.form = 1;
    this.wearId = null;    // online: wearing a dead player's body
    this.hunger = 0;       // 0..4, it gets bolder over time
    this.opening = null;   // a door it's opening
    this.chorusCd = 8;
  }

  // The second form: bigger, two more arms, a glowing split mouth, red eyes.
  setForm(n) {
    if (this.form === n) return;
    this.form = n;
    const m = this.model;
    m.root.scale.setScalar(n === 2 ? 1.15 : 1);
    m.extra.forEach((e) => { e.visible = n === 2; });
    m.mouth.material.color.setHex(n === 2 ? 0x8a0a0a : 0x080303);
    m.eyeMat.emissive.setHex(n === 2 ? 0xff2010 : 0xfff4e0);
    m.arms.forEach((a) => { a.shoulder.scale.y = n === 2 ? 1.25 : 1; });
  }

  wear(id) { this.wearId = id; this.ceiling = false; }
  unwear() { this.wearId = null; }

  dispose() { this.breath.stop(); this.emitter.dispose(); }

  // ---------- senses ----------
  canSee(P, d) {
    if (this.state === 'stunned' || this.state === 'sniff') return false;
    if (P.hidden) return false;
    if (this.graceT > 0) return false;
    let range = (P.flashOn ? 22 : 12) * this.diff.sight;
    if (P.crouch) range *= 0.75;
    if (this.enraged > 0) range = 40;
    if (d > range) return false;
    if (!this.level.los(this.x, this.z, P.x, P.z)) return false;
    if (d < 2.5 || this.enraged > 0) return true;
    const dx = P.x - this.x, dz = P.z - this.z;
    if ((Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / d > 0.3) return true; // in front of it
    // Shining a flashlight in its face gets its attention.
    if (P.flashOn && -(P.lookX * dx + P.lookZ * dz) / d > 0.85) return true;
    return false;
  }

  // A noise at (x, z) audible within `radius` metres.
  hear(x, z, radius, kind) {
    radius *= this.hearMul || 1; // (tonight's twist: it hears everything)
    if (['chase', 'hunt', 'peek', 'flee', 'stunned', 'sniff'].includes(this.state) || this.frozen) return;
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
    // It can't follow you into a vent: it comes to the grate, and loses interest.
    if (prop.kind === 'vent' && !this.ventsOK) { if (this.state === 'chase') this.investigate(prop.front.x, prop.front.z, 2.2); return; }
    if (this.ceiling) { this.ceiling = false; this.dropT = DROP; }
    this.unwear();
    this.state = 'hunt';
    this.targetId = id;
    this.hideTarget = prop;
    this.path = this.toDoor(prop);
    this.repath = 0.5;
  }

  // A path right up to a hiding spot's door. (The door is inside the furniture's own grid cell, which the
  // path-finder won't enter, so the last step is added by hand.)
  toDoor(prop) {
    const path = this.level.findPath(this.x, this.z, prop.front.x, prop.front.z);
    path.push({ x: prop.front.x, z: prop.front.z });
    return path;
  }

  enrage(P) {
    this.enraged = 16;
    this.aggro += 0.1;
    this.lastSeen = { x: P.x, z: P.z };
    this.targetId = P.id;
    this.unwear();
    this.ceiling = false;
    this.state = 'transform';
    this.transT = 2.4;
    this.path = [];
    this.setForm(2);
    this.speak('scream');
  }

  // ---------- state changes ----------
  startChase(silent = false) {
    if (this.wearId) { this.unwear(); silent = false; this.screamCd = 0; } // the disguise comes off
    if (this.ceiling) { this.ceiling = false; this.dropT = DROP; this.sfx.footstep(this.emitter, { heavy: true, vol: 1.6 }); }
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
    this.ceiling = !this.wearId && this.form === 1 && !this.level.theme.outdoor && Math.random() < 0.3;
    const lv = this.level;
    // Usually drift toward the player's part of the map, sometimes anywhere.
    const near = lv.rooms.filter((r) => Math.hypot(lv.roomCenter(r.id).x - P.x, lv.roomCenter(r.id).z - P.z) < 22);
    const pool = Math.random() < 0.7 && near.length ? near : lv.rooms;
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
      // Wearing someone, it wants to be seen: it walks right up like they would.
      if (d < lo || d > hi || (!this.wearId && lv.los(p.x, p.z, P.x, P.z))) continue;
      const score = Math.abs(d - (lo + hi) / 2);
      if (!best || score < best.score) best = { ...p, score };
    }
    if (!best) { this.stalkCd = 6; return; }
    const path = lv.findPath(this.x, this.z, best.x, best.z);
    if (!path.length) { this.stalkCd = 6; return; }
    this.state = 'stalk';
    this.ceiling = !this.wearId && this.form === 1 && !this.level.theme.outdoor && Math.random() < 0.35;
    this.path = path;
    this.lures = 0;
    this.wait = 0;
    this.stalkCd = (24 + Math.random() * 22) * (1 - this.hunger * 0.1) * (this.mood?.stalk ?? 1);
  }

  // Appear at (spot) facing the player, and just stare.
  peek(spot, P) {
    this.x = spot.x; this.z = spot.z;
    this.yaw = Math.atan2(P.x - spot.x, P.z - spot.z);
    this.state = 'peek';
    this.ceiling = false;
    this.unwear();
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

  // A flare or a rescue: blinded for a while, then it runs.
  stun(seconds) {
    if (this.state === 'transform') return;
    if (this.ceiling) { this.ceiling = false; this.dropT = DROP; }
    this.unwear();
    this.state = 'stunned';
    this.stunT = seconds;
    this.path = [];
    this.speak('scream');
  }

  // The heartbeat game at a hiding spot is over: it heard them (rip them out) or it gives up.
  endSniff(heard, P) {
    if (this.state !== 'sniff') return;
    if (heard === false) { this.hooks.onCatch(P.id); return; }
    this.shyT = 10;
    this.hideTarget = null;
    this.flee(P);
  }

  speak(style) {
    const d = this.hooks.speak(style, this.emitter);
    this.speaking = d;
    this.speakCd = (9 + Math.random() * 8) * (1 - this.hunger * 0.12) * this.diff.talk; // hungrier, chattier
  }

  // ---------- movement ----------
  // Follow this.path. Returns true once there's nowhere left to go.
  follow(dt, speed) {
    const lv = this.level;
    while (this.path.length > 1 && lv.clearWalk(this.x, this.z, this.path[1].x, this.path[1].z, RADIUS)) this.path.shift();
    const wp = this.path[0];
    if (!wp) { this.speed = 0; return true; }
    // A shut door in the way: stop, turn the handle (slowly, unless chasing), and push it open.
    if (this.opening) {
      this.speed = 0;
      this.opening.t -= dt;
      if (this.opening.t <= 0) { this.hooks.openDoor?.(this.opening.door); this.opening = null; }
      return false;
    }
    const door = lv.idoors.find((d) => !d.open && Math.hypot(d.x - this.x, d.z - this.z) < 1.5
      && this.path.slice(0, 3).some((w) => Math.hypot(w.x - d.x, w.z - d.z) < 1.8));
    if (door) {
      this.opening = { door, t: this.state === 'chase' ? 0.45 : 1.7 };
      this.hooks.creakDoor?.(door, this.state === 'chase');
      this.speed = 0;
      return false;
    }
    const dx = wp.x - this.x, dz = wp.z - this.z, dist = Math.hypot(dx, dz);
    if (dist < 0.2) { this.path.shift(); return !this.path.length; }
    const step = Math.min(dist, speed * this.diff.speed * dt);
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
      const calm = !['chase', 'hunt', 'peek', 'flee', 'stunned', 'sniff'].includes(this.state);
      if (calm && (this.wearId ? this.noticeT > 2.5 || d < 2.2 : this.noticeT > 0.6 || d < 4)) this.startChase();
      else if (calm) this.turnTo(Math.atan2(dx, dz), dt); // it stops and turns toward you...
    }

    switch (this.state) {
      case 'chase': {
        if (!sees) {
          this.lostT += P.hidden ? dt * 2.5 : dt; // a good hiding spot makes it lose you faster
          if (this.enraged > 0) this.lastSeen = { x: P.x, z: P.z }; // it just knows
          if (P.hidden && this.lostT < 0.6) { this.notifyHide(P.hidden, P); break; }
          if (this.lostT > (this.enraged > 0 ? 8 : 4.5 * (this.mood?.chase ?? 1))) {
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
        // Fast in the dark (faster than you walk); it hates the light and slows right down under it.
        const lit = this.hooks.isLit?.(this.x, this.z);
        this.follow(dt, (this.enraged > 0 ? 4.4 : this.form === 2 ? 4.0 : 3.6) * this.aggro * (lit ? 0.62 : 1));
        if (sees && d < 1.35) this.hooks.onCatch(P.id); // long arms
        if (sees && d > 4 && this.screamCd <= 0 && Math.random() < dt * 0.2) { this.speak('scream'); this.screamCd = 9; }
        // All the voices it has, laughing at once.
        this.chorusCd -= dt;
        if (this.chorusCd <= 0 && Math.random() < dt * 0.15) { this.speak('chorus'); this.chorusCd = 16 + Math.random() * 10; this.screamCd = 6; }
        break;
      }
      case 'hunt': {
        if (!P.hidden || P.id !== this.targetId) { this.state = 'chase'; this.lostT = 0; break; }
        const f = this.hideTarget.front;
        this.repath -= dt;
        if (this.repath <= 0 && !this.path.length) { this.path = this.toDoor(this.hideTarget); this.repath = 0.5; }
        this.follow(dt, 2.8 * this.aggro);
        if (Math.hypot(f.x - this.x, f.z - this.z) < 1.2) {
          this.state = 'sniff';
          this.sniffT = 0;
          this.path = [];
          const kind = this.hideTarget.kind;
          if (kind === 'curtain') { this.hooks.onCatch(P.id); break; }                     // a curtain stops nothing
          if (kind === 'bed' && Math.random() < 0.5) { this.endSniff(true, P); break; }  // it didn't think to look under
          this.hooks.onSniff(P.id);
        }
        break;
      }
      case 'transform': {
        this.speed = 0;
        this.transT -= dt;
        if (this.transT <= 0) this.startChase(true);
        break;
      }
      case 'stunned': {
        this.speed = 0;
        this.stunT -= dt;
        if (this.stunT <= 0) { this.shyT = 10; this.flee(P); }
        break;
      }
      case 'sniff': {
        this.speed = 0;
        const prop = this.hideTarget;
        if (prop) this.turnTo(Math.atan2(prop.x - this.x, prop.z - this.z), dt);
        this.sniffT += dt;
        // They came out of hiding: chase. Nobody answered in time: give up.
        if (!P.hidden || P.id !== this.targetId) this.startChase(true);
        else if (this.sniffT > 20) this.endSniff(true, P);
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
    const fast = ['chase', 'hunt', 'flee', 'stunned'].includes(this.state);
    m.root.visible = !this.wearId;
    if (this.dropT > 0) this.dropT = Math.max(0, this.dropT - dt);
    if (!fast && this.dropT <= 0 && this.animAcc < 0.11) { this.emitter.setPos(this.x, this.ceiling ? 2.7 : 2.2, this.z); return; }
    dt = this.animAcc;
    this.animAcc = 0;
    const up = this.ceiling ? 1 : this.dropT / DROP; // 1 = upside down on the ceiling
    m.root.position.set(this.x, CEIL * up, this.z);
    m.root.rotation.set(0, this.yaw, Math.PI * up);
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
    if (this.state === 'stunned') { // arms over its face, shaking
      m.arms.forEach((a, i) => { a.shoulder.rotation.x = -2.0 + Math.sin(t * 40 + i) * 0.12; a.elbow.rotation.x = -2.1; });
      m.torso.rotation.x = 0.6;
    } else if (this.state === 'sniff') { // bent toward the door, listening
      m.torso.rotation.x = 0.75;
      m.arms.forEach((a) => { a.shoulder.rotation.x = -0.6; a.elbow.rotation.x = -0.4; });
    } else if (this.state === 'transform') { // convulsing
      m.torso.rotation.x = 0.4 + Math.sin(t * 31) * 0.25;
      m.arms.forEach((a, i) => { a.shoulder.rotation.x = -1 + Math.sin(t * 23 + i * 2) * 1.2; a.elbow.rotation.x = -1 + Math.cos(t * 19 + i) * 0.8; });
      m.head.rotation.x = Math.sin(t * 27) * 0.5;
    }
    if (this.form === 2) m.extra.forEach((e, i) => { e.rotation.x = -0.4 + Math.sin(this.phase * 1.3 + i * 2) * 0.5; });
    // Chasing, it drops onto all fours and comes at you like an animal.
    if (this.state === 'chase' && this.speed > 1.5 && !this.ceiling) {
      const q = Math.sin(this.phase * 1.6);
      m.body.position.y = -0.55;
      m.torso.rotation.x = 1.35;
      m.arms.forEach((a, i) => { a.shoulder.rotation.x = -1.25 + (i ? q : -q) * 0.7; a.elbow.rotation.x = -0.15; });
      m.legs.forEach((l, i) => { l.hip.rotation.x = 0.35 + (i ? -q : q) * 0.7; l.knee.rotation.x = 0.9; });
      m.head.rotation.x = -1.2;
    }
    // The jaw: hanging slack, working while it talks, wide open when it hunts.
    const jawOpen = this.state === 'chase' || this.state === 'transform' ? 0.7 + Math.sin(t * 9) * 0.15
      : this.speaking > 0 ? 0.2 + Math.abs(Math.sin(t * 13)) * 0.3 : 0.08;
    m.jaw.rotation.x = jawOpen * (this.form === 2 ? 1.5 : 1);
    m.hair.children.forEach((h, i) => { h.rotation.x = Math.sin(t * 1.3 + i) * 0.05 + (this.state === 'chase' ? -0.4 : 0); });
    // On the ceiling: flat against it like a spider, limbs spread.
    m.body.position.y = this.ceiling ? -0.85 : m.body.position.y;
    if (this.ceiling) {
      m.torso.rotation.x = 1.45;
      m.legs.forEach((l, i) => { l.hip.rotation.x = -1.4 + (i ? -s : s) * 0.4 * k; l.knee.rotation.x = 0.7; });
      m.arms.forEach((a, i) => { a.shoulder.rotation.x = -1.5 + (i ? s : -s) * 0.4 * k; a.elbow.rotation.x = -0.3; });
    }

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
    if (this.ceiling) m.head.rotation.x = -1.2; // looking down at you
    else if (this.state !== 'transform' && !(this.state === 'chase' && this.speed > 1.5)) m.head.rotation.x = 0;

    this.emitter.setPos(this.x, this.ceiling ? 2.7 : 2.2, this.z);
  }

  // ---------- puppet (multiplayer, non-host): follows the host's snapshots ----------
  // s: [x, z, yaw, stateIndex, speaking, ceiling, form, wearId (0 = none), hunger]
  applySnap(s) {
    [this.tx, this.tz, this.tyaw] = s;
    this.state = STATES[s[3]] || 'wander';
    this.speaking = s[4] ? 1 : 0;
    const ceiling = !!s[5];
    if (this.ceiling && !ceiling) this.dropT = DROP;
    this.ceiling = ceiling;
    this.setForm(s[6] === 2 ? 2 : 1);
    this.wearId = s[7] ? String(s[7]) : null;
    this.hunger = Number(s[8]) || 0;
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

  snap() {
    return [+this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), STATES.indexOf(this.state), this.speaking > 0 ? 1 : 0,
      this.ceiling ? 1 : 0, this.form, this.wearId || 0, this.hunger];
  }

  // Jumpscare pose: crouched right in front of the camera, or hanging upside down from above.
  pose(x, z, yaw, t, above = false) {
    this.frozen = true;
    this.model.jaw.rotation.x = 0.8 + Math.sin(t * 30) * 0.08; // hanging open
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0;
    this.wearId = null;
    const m = this.model;
    m.root.visible = true;
    m.root.position.set(x, above ? 4.2 : -0.75, z);
    m.root.rotation.set(0, yaw, above ? Math.PI : 0);
    m.body.position.y = 0;
    if (above) { // hanging straight down from the ceiling, face level with yours
      m.root.position.y = 4.3;
      m.torso.rotation.x = 0.1;
      m.head.rotation.set(0, 0, Math.sin(t * 40) * 0.1);
      m.arms.forEach((a, i) => { a.shoulder.rotation.x = -0.4; a.shoulder.rotation.z = (i ? 1 : -1) * 0.9; });
      return;
    }
    m.torso.rotation.x = 0.55;
    m.head.rotation.z = Math.sin(t * 40) * 0.08 + 0.35;
    m.head.rotation.y = 0;
    m.arms.forEach((a, i) => { a.shoulder.rotation.x = -1.3; a.shoulder.rotation.z = (i ? 1 : -1) * 0.5; });
  }
}
