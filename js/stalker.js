// The stalker (online, Normal mode, a lobby toggle). A pale, cracked figure that only moves while nobody
// can see it. Someone has to keep it in view, in the light: if every living player looks away, turns their
// flashlight off near it, or it's out in the dark, it comes, fast. Each time you look back it's closer, and
// standing differently. It can't open a hiding spot. It comes and goes: about a minute at a time.
// The host runs it and sends it in 'snap' (sk); everyone draws it.
import * as THREE from 'three';

const STATES = ['gone', 'here'];
const RUN = 5.6, R = 0.3, STAY = 70;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
// Poses: [left arm, right arm] as [forward, sideways] swing, head [nod, tilt], lean. Each one reaches further.
const POSES = [
  { arms: [[0, 0.1], [0, -0.1]], head: [0.1, 0.45], lean: 0 },
  { arms: [[-1.4, 0.1], [0, -0.1]], head: [0, -0.3], lean: 0.1 },
  { arms: [[-1.5, 0.15], [-1.5, -0.15]], head: [0.35, 0], lean: 0.2 },
  { arms: [[-2.8, 0.3], [-2.6, -0.3]], head: [-0.2, 0.6], lean: 0 },
  { arms: [[-1.1, 0.5], [-1.2, -0.5]], head: [0.5, -0.5], lean: 0.45 },
  { arms: [[-1.6, 0], [0.3, -0.4]], head: [0.2, 1.1], lean: 0.25 },
];

function makeModel() {
  const skin = new THREE.MeshStandardMaterial({ color: 0xd6d0c4, roughness: 0.28, metalness: 0.05 }); // like old porcelain
  const crack = new THREE.MeshBasicMaterial({ color: 0x1a1612 });
  const hole = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const limb = (r, len) => { const g = new THREE.CapsuleGeometry(r, len - 2 * r, 4, 8); g.translate(0, -len / 2, 0); const m = new THREE.Mesh(g, skin); m.castShadow = true; return m; };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs = [-1, 1].map((s) => { const l = limb(0.06, 1.1); l.position.set(s * 0.11, 1.1, 0); body.add(l); return l; });
  const torso = new THREE.Group();
  torso.position.y = 1.1;
  body.add(torso);
  const chest = mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 10), skin, 0, 0.38, 0);
  chest.scale.z = 0.65;
  torso.add(chest);
  torso.add(mesh(new THREE.BoxGeometry(0.012, 0.42, 0.01), crack, 0.05, 0.4, 0.1)); // a crack down the chest
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.22, 0.68, 0);
    sh.add(limb(0.045, 0.75));
    const fingers = new THREE.Group();
    fingers.position.y = -0.75;
    for (let f = 0; f < 4; f++) { const fg = limb(0.01, 0.24); fg.position.x = (f - 1.5) * 0.022; fingers.add(fg); }
    sh.add(fingers);
    torso.add(sh);
    return sh;
  });
  const head = new THREE.Group();
  head.position.y = 0.98;
  const skull = mesh(new THREE.SphereGeometry(0.14, 14, 12), skin);
  skull.scale.set(0.9, 1.22, 0.95);
  head.add(skull);
  for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.03, 8, 6), hole, s * 0.05, 0.03, 0.115); e.scale.z = 0.5; head.add(e); }
  const c1 = mesh(new THREE.BoxGeometry(0.008, 0.16, 0.01), crack, 0.03, 0.06, 0.13); c1.rotation.z = 0.4; head.add(c1);
  const c2 = mesh(new THREE.BoxGeometry(0.006, 0.09, 0.01), crack, -0.01, -0.05, 0.135); c2.rotation.z = -0.6; head.add(c2);
  torso.add(head);
  root.visible = false;
  return { root, body, torso, head, arms, legs };
}

export class Stalker {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.pose = 0; this.shownPose = 0;
    this.cd = 80 + Math.random() * 40;
    this.stayT = 0; this.path = []; this.pathT = 0; this.moving = false;
    this.v = new THREE.Vector3();
    if (!this.on) return;
    this.model = makeModel();
    g.scene.add(this.model.root);
    this.emitter = g.sfx.emitter();
  }

  // Someone can see it: it's in front of them, in sight, and lit (or close).
  seenBy(P) {
    const g = this.g, d = Math.hypot(this.x - P.x, this.z - P.z);
    if (P.hidden || d > 34 || !g.level.los(P.x, P.z, this.x, this.z)) return false;
    const dot = d < 0.01 ? 1 : (P.lookX * (this.x - P.x) + P.lookZ * (this.z - P.z)) / d;
    if (dot < 0.55) return false;
    if (d < 6) return true;
    const lit = (P.flashOn && dot > 0.9 && d < 20) || g.mimic.hooks.isLit(this.x, this.z);
    return lit;
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    if (this.state === 'gone') {
      if ((this.cd -= dt) > 0) return;
      this.cd = 5;
      const spot = lv.randomFloor((q) => T.length && T.every((P) => dist(P, q) > 18 && !lv.los(P.x, P.z, q.x, q.z)));
      if (!spot) return;
      this.x = spot.x; this.z = spot.z;
      this.state = 'here'; this.stayT = STAY;
      return;
    }
    const seen = T.some((P) => this.seenBy(P));
    this.stayT -= dt;
    if (seen) { this.moving = false; return; }
    // Unseen, and its time is up: it's just gone.
    if (this.stayT <= 0) { this.state = 'gone'; this.cd = 60 + Math.random() * 50; return; }
    const prey = T.filter((P) => !P.hidden).sort((a, b) => dist(a, this) - dist(b, this))[0];
    if (!prey) return;
    if (!this.moving) { this.moving = true; this.pose = (this.pose + 1 + Math.floor(Math.random() * (POSES.length - 1))) % POSES.length; }
    if (dist(prey, this) < 1.0) { g.hostCatch(prey.id, 'sk'); this.state = 'gone'; this.cd = 45 + Math.random() * 40; return; }
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, prey.x, prey.z); this.path.push({ x: prey.x, z: prey.z }); this.pathT = 0.6; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, RUN * dt);
    const p = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = p.x; this.z = p.z;
    this.yaw = Math.atan2(prey.x - this.x, prey.z - this.z); // always facing whoever it's coming for
  }

  // [stateIndex, x, z, yaw, pose]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), this.pose]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const appeared = this.state === 'gone' && st !== 'gone';
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    this.pose = (s[4] | 0) % POSES.length;
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost) { if (!g.ended) this.think(dt); }
    if (this.posed) return;
    const m = this.model;
    m.root.visible = this.state === 'here';
    if (!m.root.visible) return;
    // While I'm looking at it, it never moves or changes, even if the host's view is a moment behind.
    const me = g.alive(g.me) && g.state === 'playing' ? g.playerInfo() : null;
    const watching = me && this.seenBy(me);
    if (!g.isHost && !watching) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
    if (!watching) {
      if (this.shownPose !== this.pose && this.wasWatching) {
        // It moved while you looked away. Up close, that's a sting.
        const d = Math.hypot(this.x - g.p.x, this.z - g.p.z);
        if (d < 7 && me) this.stingNext = true;
      }
      this.shownPose = this.pose;
      m.root.position.set(this.x, 0, this.z);
      m.root.rotation.y = this.yaw;
      this.applyPose(POSES[this.shownPose]);
    } else if (this.stingNext) { this.stingNext = false; g.sfx.sting(this.emitter); }
    this.wasWatching = watching;
    this.emitter.setPos(this.x, 1.6, this.z);
    this.emitter.setOcclusion(!g.level.los(g.camera.position.x, g.camera.position.z, this.x, this.z));
    // Stone dragging on the floor while it moves (you hear it when you aren't looking).
    const moved = Math.hypot(this.x - (this.lx ?? this.x), this.z - (this.lz ?? this.z));
    this.lx = this.x; this.lz = this.z;
    if (moved > 0.01 && (this.scrapeT = (this.scrapeT ?? 0) - dt) <= 0) { g.sfx.scrape(this.emitter); this.scrapeT = 0.5 + Math.random() * 0.4; }
  }

  applyPose(P) {
    const m = this.model;
    m.arms.forEach((a, i) => { a.rotation.x = P.arms[i][0]; a.rotation.z = P.arms[i][1]; });
    m.head.rotation.set(P.head[0], 0, P.head[1]);
    m.torso.rotation.x = P.lean;
  }

  nearness(x, z) {
    if (!this.on || this.state === 'gone') return 0;
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 10);
  }

  // The jumpscare: it's just there, reaching for your face.
  poseAt(x, z, yaw, t) {
    if (!this.on) return null;
    const m = this.model;
    this.posed = true;
    m.root.visible = true;
    m.root.position.set(x, 0, z);
    m.root.rotation.y = yaw;
    this.applyPose({ arms: [[-1.7, 0.25], [-1.7, -0.25]], head: [0.35, Math.sin(t * 30) * 0.08], lean: 0.35 });
    return m;
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    this.emitter.dispose();
  }
}
