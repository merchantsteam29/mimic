// The Mother (online, Normal mode, a lobby toggle). Huge and slow, bent double under the ceiling, a bundle held
// to her chest. She can't fit through a doorway (her paths never cross a door cell: level.idoors and the locked
// doors), so shut yourself in a room and she can only stand outside it. Every 30-45 s she stops and sings, in your
// voices: a few of everyone's clips at once, slowed into a lullaby ('moSing' {keys}). The mimic comes to her song.
// She takes anyone she reaches who isn't hiding (hostCatch 'mo'). The host runs her and sends her in 'snap' (mo).
//   gone - not here yet (the first time after ~75 s), or away for a while
//   walk - drifting after the nearest living player she can get to
//   sing - stopped, rocking the bundle, singing
import * as THREE from 'three';

const STATES = ['gone', 'walk', 'sing'];
const WALK = 1.25;       // m/s: faster than crouching, slower than walking
const R = 0.6;
const REACH = 1.3;
const STAY = 150;        // seconds she stays before going back into the dark
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Her face: grey, eyes shut with black running out of them, mouth a long open O.
function faceTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 58, 6, 64, 64, 64);
  gr.addColorStop(0, '#7e7a70'); gr.addColorStop(0.6, '#55524b'); gr.addColorStop(1, 'rgba(40,38,34,0)');
  x.fillStyle = gr; x.beginPath(); x.ellipse(64, 64, 50, 64, 0, 0, 7); x.fill();
  x.globalCompositeOperation = 'source-atop';
  for (const ex of [42, 86]) {
    const sk = x.createRadialGradient(ex, 52, 2, ex, 52, 20); // sunken
    sk.addColorStop(0, 'rgba(10,8,6,.9)'); sk.addColorStop(1, 'rgba(10,8,6,0)');
    x.fillStyle = sk; x.fillRect(ex - 22, 30, 44, 44);
    x.strokeStyle = '#0a0806'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(ex - 12, 52); x.lineTo(ex + 12, 52); x.stroke(); // shut, and sewn
    x.lineWidth = 1.5;
    for (let k = -9; k <= 9; k += 6) { x.beginPath(); x.moveTo(ex + k - 2, 48); x.lineTo(ex + k + 2, 57); x.stroke(); }
    x.fillStyle = 'rgba(6,4,3,.9)'; // what runs out of them
    for (let k = 0; k < 2; k++) x.fillRect(ex - 4 + k * 7, 54, 3, 30 + Math.random() * 30);
  }
  const mouth = x.createRadialGradient(64, 100, 2, 64, 100, 22);
  mouth.addColorStop(0, '#000'); mouth.addColorStop(0.75, '#0a0303'); mouth.addColorStop(1, 'rgba(40,10,10,0)');
  x.fillStyle = mouth;
  x.beginPath(); x.ellipse(64, 100, 15, 27, 0, 0, 7); x.fill();
  x.strokeStyle = 'rgba(70,20,20,.7)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(52, 92); x.lineTo(40, 84); x.moveTo(76, 92); x.lineTo(88, 83); x.stroke(); // torn at the corners
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(20,16,12,.35)'; x.beginPath(); x.arc(20 + Math.random() * 88, 20 + Math.random() * 100, 4 + Math.random() * 10, 0, 7); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeModel() {
  const cloth = new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 1, side: THREE.DoubleSide });
  const skin = new THREE.MeshStandardMaterial({ color: 0x7a756c, roughness: 0.6 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 1 });
  const hairMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // The dress: wide, to the floor, the hem torn and dragging. No feet show.
  const skirt = new THREE.CylinderGeometry(0.3, 0.85, 1.45, 18, 3, true);
  const pos = skirt.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.7) pos.setY(i, pos.getY(i) + Math.random() * 0.25 - 0.05);
  skirt.computeVertexNormals();
  body.add(mesh(skirt, cloth, 0, 0.72, 0));
  // Bent over from the waist (the ceiling's too low for her).
  const torso = new THREE.Group();
  torso.position.y = 1.4;
  torso.rotation.x = 0.55;
  body.add(torso);
  torso.add(mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 12), cloth, 0, 0.45, 0));
  const neck = new THREE.Group();
  neck.position.y = 0.9;
  neck.rotation.x = 0.35;
  torso.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 8).translate(0, 0.21, 0), skin));
  const head = new THREE.Group();
  head.position.y = 0.42;
  head.rotation.x = -0.6;
  neck.add(head);
  const skull = new THREE.SphereGeometry(0.2, 14, 12);
  skull.scale(0.85, 1.25, 0.78);
  head.add(mesh(skull, hairMat));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.36), new THREE.MeshLambertMaterial({ map: faceTex(), color: 0x6e6a64, transparent: true, alphaTest: 0.05 }));
  face.position.set(0, -0.02, 0.19);
  head.add(face);
  for (let i = 0; i < 40; i++) { // hair to the waist
    const a = Math.PI * (0.25 + (i / 40) * 1.5), len = 0.8 + Math.random() * 0.6;
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.006).translate(0, -len / 2, 0), hairMat);
    st.position.set(Math.sin(a) * 0.17, 0.2, Math.cos(a) * 0.16);
    st.rotation.set((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15);
    head.add(st);
  }
  // Long arms, folded round the bundle at her chest.
  const arms = [-1, 1].map((sd) => {
    const sh = new THREE.Group();
    sh.position.set(sd * 0.3, 0.82, 0.05);
    const upper = mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.75, 7).translate(0, -0.375, 0), cloth);
    const el = new THREE.Group();
    el.position.y = -0.75;
    el.add(mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.8, 7).translate(0, -0.4, 0), skin));
    for (let f = 0; f < 4; f++) el.add(mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.24, 4).translate((f - 1.5) * 0.02, -0.92, 0), skin));
    sh.add(upper, el);
    torso.add(sh);
    return { sh, el, sd };
  });
  const bundle = mesh(new THREE.SphereGeometry(0.2, 10, 8).scale(0.8, 1.35, 0.8), wrap, 0, 0.35, 0.36);
  bundle.rotation.z = 0.5;
  torso.add(bundle);
  root.visible = false;
  return { root, body, torso, neck, head, arms, bundle };
}

export class Mother {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.state = 'gone';
    this.x = 0; this.z = 0; this.yaw = 0;
    this.tx = 0; this.tz = 0; this.tyaw = 0;
    this.cd = 70 + Math.random() * 20; // host: until she first comes
    this.stateT = 0; this.hereT = 0; this.pathT = 0; this.path = [];
    this.singCd = 25; this.stuckT = 0;
    this.phase = 0; this.stepD = 0; this.speed = 0;
    if (!this.on) return;
    const lv = g.level;
    // Doorways she can't get through.
    this.blocked = new Set([...lv.idoors.map((d) => d.cz * lv.N + d.cx), ...lv.doorCells]);
    this.model = makeModel();
    g.scene.add(this.model.root);
    this.emitter = g.sfx.emitter();
  }

  set(state) { this.state = state; this.stateT = 0; this.path = []; this.pathT = 0; }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    this.stateT += dt;
    if (this.state === 'gone') {
      if ((this.cd -= dt) > 0) return;
      this.cd = 5;
      const spot = lv.randomFloor((q) => !this.blocked.has(lv.cellOf(q.z) * lv.N + lv.cellOf(q.x)) && T.every((P) => dist(P, q) > 20 && !lv.los(P.x, P.z, q.x, q.z)));
      if (!spot) return;
      this.x = spot.x; this.z = spot.z;
      this.hereT = 0; this.singCd = 20 + Math.random() * 10;
      this.set('walk');
      return;
    }
    this.hereT += dt;
    for (const P of T) if (!P.hidden && dist(P, this) < REACH) { g.hostCatch(P.id, 'mo'); this.set('sing'); this.sing(); return; }
    if (this.hereT > STAY && this.state === 'walk' && T.every((P) => !lv.los(P.x, P.z, this.x, this.z))) { this.cd = 50 + Math.random() * 30; this.set('gone'); return; }
    if (this.state === 'sing') { if (this.stateT > this.singFor) this.set('walk'); return; }
    // Walking: after the nearest living player she can get to. Nobody she can reach for a while, and she sings.
    this.singCd -= dt;
    this.pathT -= dt;
    if (this.pathT <= 0) {
      this.pathT = 1.2;
      let best = null;
      for (const P of T) {
        if (P.hidden) continue;
        const path = lv.findPath(this.x, this.z, P.x, P.z, this.blocked);
        if (path.length && (!best || path.length < best.length)) best = path;
      }
      // Nobody she can get to: as close as she can get to the nearest of them, and she stands there.
      const P = !best && T.filter((q) => !q.hidden).sort((a, b) => dist(a, this) - dist(b, this))[0];
      const near = P && this.closest(P);
      this.blockedT = best ? 0 : (this.blockedT || 0) + 1.2;
      this.path = best || (near && dist(near, this) > 1 ? lv.findPath(this.x, this.z, near.x, near.z, this.blocked) : []);
    }
    this.stuckT = this.blockedT > 0 && !this.path.length ? this.stuckT + dt : 0;
    if (this.singCd <= 0 || this.stuckT > 6) { this.stuckT = 0; this.set('sing'); this.sing(); return; }
    let wp = this.path[0];
    while (wp && dist(wp, this) < 0.3) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, WALK * dt);
    const p = lv.collide({ x: this.x + (dx / d) * step, z: this.z + (dz / d) * step }, R);
    this.x = p.x; this.z = p.z;
    this.yaw += angleDiff(Math.atan2(dx, dz), this.yaw) * Math.min(1, dt * 2.5);
  }

  // Host: the spot she can get to that's nearest to P (searching from where she is, never through a doorway).
  closest(P) {
    const lv = this.g.level, N = lv.N, start = lv.cellOf(this.z) * N + lv.cellOf(this.x);
    const seen = new Uint8Array(N * N), q = [start];
    seen[start] = 1;
    let best = start, bd = Infinity;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, z = (i / N) | 0, d = Math.hypot((x + 0.5) * 2 - P.x, (z + 0.5) * 2 - P.z);
      if (d < bd) { bd = d; best = i; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * N + nx;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || seen[j] || this.blocked.has(j) || !lv.passable(nx, nz)) continue;
        seen[j] = 1; q.push(j);
      }
    }
    return { x: (best % N + 0.5) * 2, z: (((best / N) | 0) + 0.5) * 2 };
  }

  // Host: she sings. A few clips (the dead's first), and the mimic comes to hear it.
  sing() {
    const g = this.g, keys = [];
    for (let i = 0; i < 8 && keys.length < 3; i++) { const k = g.mp?.pickKey((id) => g.status.get(id) === 'dead'); if (k && !keys.includes(k)) keys.push(k); }
    this.singCd = 30 + Math.random() * 15;
    this.singFor = 6; // (until the song itself says how long)
    g.broadcast({ t: 'moSing', keys });
    const m = g.mimic;
    if (!['chase', 'hunt', 'sniff', 'stunned', 'transform'].includes(m.state)) m.investigate(this.x, this.z, 3.2);
    g.ls.hear?.(this.x, this.z, 30, 'voice', null);
  }

  onNet(m) {
    if (!this.on || m.t !== 'moSing') return false;
    const g = this.g, keys = Array.isArray(m.keys) ? m.keys.slice(0, 3) : [];
    const c = g.camera.position;
    this.emitter.setPos(this.x, 2.4, this.z);
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, this.x, this.z));
    let longest = g.sfx.lullaby(this.emitter);
    keys.forEach((k, i) => {
      const clip = g.mp?.clips.get(String(k));
      if (!clip) return;
      setTimeout(() => { if (this.state !== 'gone') g.sfx.playVoice(clip.buffer, this.emitter, 'sing'); }, 400 + i * 700);
      longest = Math.max(longest, 0.4 + i * 0.7 + clip.buffer.duration / 0.74);
    });
    this.singFor = Math.min(12, longest + 0.5);
    g.voice.suppress(this.singFor + 0.3); // (so nobody's mic records her)
    if (g.isHost) this.singFor = Math.max(this.singFor, 4);
    return true;
  }

  // [stateIndex, x, z, yaw]
  snap() { return [STATES.indexOf(this.state), +this.x.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(2)]; }

  applySnap(s) {
    if (!Array.isArray(s)) return;
    const st = STATES[s[0] | 0] || 'gone';
    const appeared = this.state === 'gone' && st !== 'gone';
    if (st !== this.state) this.stateT = 0;
    this.state = st;
    [this.tx, this.tz, this.tyaw] = [Number(s[1]) || 0, Number(s[2]) || 0, Number(s[3]) || 0];
    if (appeared) { this.x = this.tx; this.z = this.tz; this.yaw = this.tyaw; }
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g, ox = this.x, oz = this.z;
    if (g.isHost) { if (!g.ended) this.think(dt); } else {
      this.stateT += dt;
      const k = 1 - Math.exp(-dt * 10);
      this.x += (this.tx - this.x) * k; this.z += (this.tz - this.z) * k;
      this.yaw += angleDiff(this.tyaw, this.yaw) * k;
    }
    if (this.posed) return; // the jumpscare has her
    const m = this.model, here = this.state !== 'gone';
    m.root.visible = here;
    if (!here) return;
    const moved = Math.hypot(this.x - ox, this.z - oz), t = g.t;
    this.speed += (moved / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 6);
    this.phase += moved * 2;
    m.root.position.set(this.x, 0, this.z);
    m.root.rotation.y = this.yaw;
    const singing = this.state === 'sing';
    // She sways as she goes, side to side; singing, she rocks the bundle and her head goes back.
    m.body.rotation.z = Math.sin(this.phase) * 0.06 + (singing ? Math.sin(t * 1.6) * 0.08 : 0);
    m.torso.rotation.x = singing ? 0.4 + Math.sin(t * 1.6) * 0.05 : 0.55;
    m.head.rotation.x = singing ? -0.95 + Math.sin(t * 0.8) * 0.1 : -0.6;
    m.head.rotation.z = singing ? Math.sin(t * 0.8) * 0.25 : Math.sin(t * 0.4) * 0.12;
    for (const a of m.arms) { a.sh.rotation.set(-0.75 + (singing ? Math.sin(t * 1.6) * 0.1 : 0), 0, a.sd * 0.2); a.el.rotation.set(-1.25, 0, -a.sd * 1.25); }
    this.emitter.setPos(this.x, 2.4, this.z);
    const c = g.camera.position;
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, this.x, this.z));
    this.stepD += moved;
    if (this.stepD > 1.3) { this.stepD = 0; g.sfx.footstep(this.emitter, { heavy: true, vol: 0.8 }); }
  }

  // How close she is, 0..1, for the fear and the dread drone.
  nearness(x, z) {
    if (!this.on || this.state === 'gone') return 0;
    return Math.max(0, 1 - Math.hypot(this.x - x, this.z - z) / 14);
  }

  // The jumpscare: she folds right down to you, mouth open.
  poseAt(x, z, yaw, t) {
    if (!this.on) return null;
    const m = this.model;
    this.posed = true;
    m.root.visible = true;
    m.root.position.set(x - Math.sin(yaw) * 1.0, 0, z - Math.cos(yaw) * 1.0); // (she's bent so far over that her face is a metre in front of her)
    m.root.rotation.y = yaw;
    m.torso.rotation.x = 1.1;
    m.head.rotation.set(-1.3, 0, Math.sin(t * 30) * 0.08);
    for (const a of m.arms) { a.sh.rotation.set(-1.6, 0, -a.sd * 0.5); a.el.rotation.set(-0.3, 0, 0); } // reaching for you
    return m;
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    this.emitter.dispose();
  }
}
