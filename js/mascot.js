// The clown (the fairground mascot). Alone it lives in the fairground; online it's a lobby toggle (Normal mode)
// and goes anywhere. It looks just like the mascot statues the fairground is full of (buildProp 'mascot' uses the
// same model), and like them it never moves while anyone is looking. Out of sight it walks to the nearest player
// who isn't hiding, standing a new way each time you look back. Watch it too long up close and its head follows
// you. Now and then it laughs, in your voice: a few syllables of one of your clips, chopped up and pitched high.
// It takes anyone it reaches. It can't open a hiding spot. Here about 80 s, then gone for a minute or so.
// The host runs it and sends it in 'snap' (mc); the laugh is 'mcLaugh' {key, s, e} (online) so everyone hears it.
import * as THREE from 'three';
import { pieces } from './splice.js';

const STATES = ['gone', 'here'];
const WALK = 3.2, R = 0.32, STAY = 80;
// Poses: arms [forward, sideways] swing, head [nod, tilt], lean. A mascot's poses: a wave, a bow, arms out for a hug...
const POSES = [
  { arms: [[0, 0.15], [0, -0.15]], head: [0, 0.3], lean: 0 },
  { arms: [[0, 0.2], [-2.6, -0.5]], head: [0.1, -0.25], lean: 0 },         // waving
  { arms: [[-1.4, 0.7], [-1.4, -0.7]], head: [0.25, 0], lean: 0.15 },      // arms out for a hug
  { arms: [[0.4, 0.1], [0.4, -0.1]], head: [0.5, 0.2], lean: 0.5 },        // a bow, looking up at you
  { arms: [[-1.6, 0.1], [-1.6, -0.1]], head: [-0.15, 0.7], lean: 0.25 },   // reaching
  { arms: [[-0.4, 1.2], [0.2, -0.2]], head: [0.2, -0.9], lean: 0.1 },      // ta-da
];

let faceTex = null;
// The big foam head's face (drawn so the middle of the face sits at u = 0.25: the +z side of a sphere).
function face() {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${90 + Math.random() * 40},${70 + Math.random() * 30},40,${0.05 + Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 256, 4 + Math.random() * 30, 0, 7); g.fill(); }
  const cx = 128;
  // Cheeks.
  for (const s of [-1, 1]) { const gr = g.createRadialGradient(cx + s * 48, 150, 2, cx + s * 48, 150, 26); gr.addColorStop(0, 'rgba(200,60,70,.7)'); gr.addColorStop(1, 'rgba(200,60,70,0)'); g.fillStyle = gr; g.fillRect(cx + s * 48 - 30, 120, 60, 60); }
  // Eyes: painted black diamonds with lashes, and a dark mesh slit in each where someone would look out.
  for (const s of [-1, 1]) {
    const ex = cx + s * 26;
    g.fillStyle = '#0c0a0a';
    g.beginPath(); g.moveTo(ex, 82); g.lineTo(ex + 13, 108); g.lineTo(ex, 136); g.lineTo(ex - 13, 108); g.closePath(); g.fill();
    g.strokeStyle = '#0c0a0a'; g.lineWidth = 3;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(ex + k * 6, 84); g.lineTo(ex + k * 10, 70); g.stroke(); }
    g.fillStyle = '#000'; g.fillRect(ex - 7, 104, 14, 5);
  }
  // The grin, ear to ear, the paint cracked.
  g.fillStyle = '#8a1018';
  g.beginPath(); g.moveTo(cx - 70, 150); g.quadraticCurveTo(cx, 230, cx + 70, 150); g.quadraticCurveTo(cx, 190, cx - 70, 150); g.fill();
  g.fillStyle = '#e8e2d0';
  for (let x = -40; x <= 40; x += 13) g.fillRect(cx + x - 5, 168 + Math.abs(x) * -0.25, 10, 10);
  g.strokeStyle = 'rgba(30,20,15,.6)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const x = cx - 80 + Math.random() * 160, y = 60 + Math.random() * 150; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 30, y + Math.random() * 20); g.stroke(); }
  faceTex = new THREE.CanvasTexture(c);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  return faceTex;
}

// The mascot: a baggy striped suit, a ruff, white gloves, big shoes, and the foam head. Also the statues (level.js).
export function makeMascot(r = Math.random) {
  const stripes = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    for (let x = 0; x < 64; x += 16) { g.fillStyle = '#7a1c1c'; g.fillRect(x, 0, 8, 64); g.fillStyle = '#c8b898'; g.fillRect(x + 8, 0, 8, 64); }
    g.fillStyle = 'rgba(40,25,15,.35)'; for (let i = 0; i < 12; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 6 + Math.random() * 14, 3 + Math.random() * 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
    return t;
  })();
  const suit = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a1a18, roughness: 0.5 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x9a4a1a, roughness: 1 });
  const head0 = new THREE.MeshStandardMaterial({ map: face(), roughness: 0.85 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const limb = (rad, len, mat) => { const g = new THREE.CapsuleGeometry(rad, len - 2 * rad, 4, 8); g.translate(0, -len / 2, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs = [-1, 1].map((s) => {
    const l = limb(0.11, 0.95, suit); l.position.set(s * 0.15, 0.98, 0); body.add(l);
    const shoe = mesh(new THREE.SphereGeometry(0.13, 10, 8), red, 0, -0.93, 0.1); shoe.scale.set(0.9, 0.55, 1.7); l.add(shoe);
    return l;
  });
  const torso = new THREE.Group();
  torso.position.y = 0.98;
  body.add(torso);
  const belly = mesh(new THREE.SphereGeometry(0.32, 14, 12), suit, 0, 0.3, 0);
  belly.scale.set(1, 1.25, 0.85);
  torso.add(belly);
  for (let i = 0; i < 3; i++) torso.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), red, 0, 0.45 - i * 0.16, 0.28));
  const ruff = mesh(new THREE.TorusGeometry(0.2, 0.07, 6, 14), white, 0, 0.7, 0);
  ruff.rotation.x = Math.PI / 2;
  torso.add(ruff);
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.34, 0.6, 0);
    sh.add(limb(0.08, 0.62, suit));
    const glove = mesh(new THREE.SphereGeometry(0.1, 10, 8), white, 0, -0.66, 0);
    glove.scale.set(1, 1.2, 0.7);
    sh.add(glove);
    torso.add(sh);
    return sh;
  });
  const head = new THREE.Group();
  head.position.y = 0.95;
  const skull = mesh(new THREE.SphereGeometry(0.3, 18, 14), head0);
  skull.scale.set(1, 1.05, 0.95);
  head.add(skull);
  head.add(mesh(new THREE.SphereGeometry(0.06, 10, 8), red, 0, -0.01, 0.29)); // the nose
  for (let i = 0; i < 9; i++) { // matted tufts of hair either side
    const s = i % 2 ? 1 : -1, a = r() * 0.8;
    head.add(mesh(new THREE.SphereGeometry(0.07 + r() * 0.05, 7, 6), hair, s * (0.26 + r() * 0.06), 0.05 + a * 0.18, -0.05 - r() * 0.15));
  }
  const hat = mesh(new THREE.ConeGeometry(0.1, 0.26, 10), red, 0.08, 0.36, 0);
  hat.rotation.z = -0.3;
  head.add(hat);
  torso.add(head);
  return { root, body, torso, head, arms, legs };
}

export class Mascot {
  constructor(g, on) {
    this.g = g;
    this.on = !!on;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0; this.look = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.pose = 0; this.shownPose = 0;
    this.cd = 45 + Math.random() * 30;
    this.stayT = 0; this.path = []; this.pathT = 0; this.moving = false;
    this.laughT = 12; this.stareT = 0;
    if (!this.on) return;
    this.model = makeMascot();
    this.model.root.visible = false;
    g.scene.add(this.model.root);
    this.emitter = g.sfx.emitter();
  }

  // Someone can see it: in front of them, in sight, and lit (or close).
  seenBy(P) {
    const g = this.g, d = Math.hypot(this.x - P.x, this.z - P.z);
    if (P.hidden || d > 30 || !g.level.los(P.x, P.z, this.x, this.z)) return false;
    const dot = d < 0.01 ? 1 : (P.lookX * (this.x - P.x) + P.lookZ * (this.z - P.z)) / d;
    if (dot < 0.55) return false;
    return d < 7 || (P.flashOn && dot > 0.9 && d < 20) || g.mimic.hooks.isLit(this.x, this.z);
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    if (this.state === 'gone') {
      if ((this.cd -= dt) > 0) return;
      this.cd = 5;
      const ok = (q) => T.length && T.every((P) => dist(P, q) > 16 && !lv.los(P.x, P.z, q.x, q.z));
      // In the fairground it likes to stand with the other mascots.
      const statues = lv.props.filter((p) => p.type === 'mascot').map((p) => ({ x: p.x - p.dx * 1.1, z: p.z - p.dz * 1.1 })).filter(ok);
      const spot = statues.length ? statues[Math.floor(Math.random() * statues.length)] : lv.randomFloor(ok);
      if (!spot) return;
      this.x = spot.x; this.z = spot.z;
      this.state = 'here'; this.stayT = STAY; this.laughT = 10 + Math.random() * 10;
      return;
    }
    const seers = T.filter((P) => this.seenBy(P));
    this.stayT -= dt;
    // Watched up close for a while, its head comes round to follow you.
    const close = seers.filter((P) => dist(P, this) < 9).sort((a, b) => dist(a, this) - dist(b, this))[0];
    this.stareT = close ? this.stareT + dt : 0;
    if (close && this.stareT > 2.5) {
      const want = angleTo(this, close) - this.yaw;
      this.look += Math.max(-dt * 0.5, Math.min(dt * 0.5, wrap(want - this.look)));
      this.look = Math.max(-1.4, Math.min(1.4, this.look));
      if (this.stareT > 4 && this.laughT > 3) this.laughT = 0.5; // and it laughs at you
    }
    const prey = T.filter((P) => !P.hidden).sort((a, b) => dist(a, this) - dist(b, this))[0];
    if ((this.laughT -= dt) <= 0) {
      this.laughT = 18 + Math.random() * 14;
      if (prey && dist(prey, this) < 22) this.laugh();
    }
    if (seers.length) { this.moving = false; return; }
    if (this.stayT <= 0) { this.state = 'gone'; this.cd = 50 + Math.random() * 40; return; }
    if (!prey) return;
    if (!this.moving) { this.moving = true; this.look = 0; this.pose = (this.pose + 1 + Math.floor(Math.random() * (POSES.length - 1))) % POSES.length; }
    if (dist(prey, this) < 1.0) { g.hostCatch(prey.id, 'mc'); this.state = 'gone'; this.cd = 45 + Math.random() * 40; return; }
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path.length) { this.path = lv.findPath(this.x, this.z, prey.x, prey.z); this.path.push({ x: prey.x, z: prey.z }); this.pathT = 0.6; }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.x, wp.z - this.z) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, WALK * dt);
    const p = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = p.x; this.z = p.z;
    this.yaw = angleTo(this, prey);
  }

  // Laugh with someone's voice (online: anyone's clip, the dead first; alone: yours).
  laugh() {
    const g = this.g;
    if (g.mp) {
      const key = g.mp.pickKey((owner) => g.status.get(owner) === 'dead');
      const c = key && g.mp.clips.get(key);
      const p = c && pieces(c.buffer);
      if (!p?.length) return;
      const [s, e] = p[Math.floor(Math.random() * p.length)];
      g.broadcast({ t: 'mcLaugh', key, s: +s.toFixed(3), e: +e.toFixed(3) });
      return;
    }
    const c = g.voice.started && g.voice.pick();
    const p = c && pieces(c.buffer);
    if (!p?.length) { g.sfx.whisper(this.emitter); return; }
    const [s, e] = p[Math.floor(Math.random() * p.length)];
    this.playLaugh(c.buffer, s, e);
  }

  // "Ha. Ha. Ha-ha-ha": the start of one word, said over and over, higher each time, then falling apart.
  playLaugh(buf, s, e) {
    const g = this.g, sr = buf.sampleRate, src = buf.getChannelData(0);
    const syl = Math.min(0.16, Math.max(0.07, (e - s) * 0.5)), n = 5 + Math.floor(Math.random() * 3);
    const out = g.sfx.ctx.createBuffer(1, Math.floor(sr * (n * (syl + 0.09) + 0.2)), sr), o = out.getChannelData(0);
    let at = 0;
    for (let k = 0; k < n; k++) {
      const rate = 1 + k * 0.07 + (k === n - 1 ? -0.25 : 0), len = Math.floor((syl * sr) / rate), fade = Math.floor(sr * 0.008);
      for (let i = 0; i < len && at + i < o.length; i++) {
        const x = s * sr + i * rate, j = Math.floor(x), f = x - j;
        o[at + i] = ((src[j] || 0) * (1 - f) + (src[j + 1] || 0) * f) * Math.min(1, i / fade, (len - i) / fade);
      }
      at += len + Math.floor(sr * (k < 2 ? 0.14 : 0.06) * (0.7 + Math.random() * 0.6));
    }
    const d = g.sfx.playVoice(out, this.emitter, 'laugh');
    g.voice.suppress(d + 0.3);
    if (g.isHost && Math.random() < 0.5) { g.mimic.hear(this.x, this.z, 18, 'voice'); g.ls.hear(this.x, this.z, 12, 'voice'); } // sometimes the mimic comes to see what's funny
    return d;
  }

  onNet(m) {
    if (!this.on || m.t !== 'mcLaugh') return false;
    const c = this.g.mp?.clips.get(m.key);
    if (c) this.playLaugh(c.buffer, Number(m.s) || 0, Number(m.e) || 0.2);
    return true;
  }

  // [state, x, z, yaw, pose, look]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2), this.pose, +this.look.toFixed(2)]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const appeared = this.state === 'gone' && st !== 'gone';
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    this.pose = (s[4] | 0) % POSES.length;
    this.look = Number(s[5]) || 0;
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && !g.ended) this.think(dt);
    if (this.posed) return;
    const m = this.model;
    m.root.visible = this.state === 'here';
    if (!m.root.visible) return;
    // While I'm looking at it, it never moves or changes pose, even if the host's view is a moment behind.
    const me = g.alive(g.me) && g.state === 'playing' ? g.playerInfo() : null;
    const watching = me && this.seenBy(me);
    if (!g.isHost && !watching) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
    if (!watching) {
      if (this.shownPose !== this.pose && this.wasWatching && me && Math.hypot(this.x - g.p.x, this.z - g.p.z) < 7) this.stingNext = true;
      this.shownPose = this.pose;
      m.root.position.set(this.x, 0, this.z);
      m.root.rotation.y = this.yaw;
      this.applyPose(POSES[this.shownPose]);
    } else if (this.stingNext) { this.stingNext = false; g.sfx.sting(this.emitter); }
    m.head.rotation.y += (this.look - m.head.rotation.y) * Math.min(1, dt * 4); // the head turning to follow you
    this.wasWatching = watching;
    this.emitter.setPos(this.x, 1.9, this.z);
    this.emitter.setOcclusion(!g.level.los(g.camera.position.x, g.camera.position.z, this.x, this.z));
    // Big shoes slapping the ground while it walks (you hear it when you aren't looking).
    const moved = Math.hypot(this.x - (this.lx ?? this.x), this.z - (this.lz ?? this.z));
    this.lx = this.x; this.lz = this.z;
    if (moved > 0.01 && (this.stepT = (this.stepT ?? 0) - dt) <= 0) { g.sfx.rec('steps', this.emitter, { rate: 0.7, vol: 0.9 }); this.stepT = 0.42; }
  }

  applyPose(P) {
    const m = this.model;
    m.arms.forEach((a, i) => { a.rotation.x = P.arms[i][0]; a.rotation.z = P.arms[i][1]; });
    m.head.rotation.x = P.head[0]; m.head.rotation.z = P.head[1];
    m.torso.rotation.x = P.lean;
  }

  nearness(x, z) {
    if (!this.on || this.state === 'gone') return 0;
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 10);
  }

  // The jumpscare: the grin, right up close, arms out for a hug.
  poseAt(x, z, yaw, t) {
    if (!this.on) return null;
    const m = this.model;
    this.posed = true;
    m.root.visible = true;
    m.root.position.set(x, 0, z);
    m.root.rotation.y = yaw;
    this.applyPose({ arms: [[-1.5, 0.5], [-1.5, -0.5]], head: [0.3, Math.sin(t * 24) * 0.25], lean: 0.4 });
    m.head.rotation.y = 0;
    return m;
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    this.emitter.dispose();
  }
}

const angleTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
