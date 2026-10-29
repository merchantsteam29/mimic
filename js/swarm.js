// The swarm. Alone it lives in the mine, the subway and the sewers; online it's a lobby toggle (Normal mode) and goes anywhere.
// When the mimic gets near one of you (16 m), rats pour out of the dark, run the length of the corridor right past
// you and away again. They don't hurt. They squeal: anyone they run past (within 2.2 m, not hiding) is given away,
// and the mimic hears exactly where. Step into a room or a hiding spot and they go by. Once every 35-50 s at most.
// The host decides and broadcasts 'swarm' {p: [x, z, x, z, ...]} (the route); every browser runs the same rats.
import * as THREE from 'three';

const RATS = 40, NEAR = 2.2;

function ratMeshes() {
  const fur = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x6a5048, roughness: 0.8 });
  const bodyGeo = new THREE.SphereGeometry(0.09, 7, 5);
  bodyGeo.scale(0.75, 0.6, 1.5);
  bodyGeo.translate(0, 0.06, 0);
  const tailGeo = new THREE.CylinderGeometry(0.008, 0.004, 0.22, 4);
  tailGeo.rotateX(Math.PI / 2);
  tailGeo.translate(0, 0.04, -0.23);
  const body = new THREE.InstancedMesh(bodyGeo, fur, RATS), tail = new THREE.InstancedMesh(tailGeo, tailMat, RATS);
  body.frustumCulled = tail.frustumCulled = false;
  return { body, tail };
}

export class Swarm {
  constructor(g, on) {
    this.g = g;
    this.on = !!on;
    this.run = null;   // { pts, cum, L, t }
    this.cd = 40;      // host
    this.near = new Map(); // host: id -> seconds until it can squeal on them again
    if (!this.on) return;
    this.mesh = ratMeshes();
    g.scene.add(this.mesh.body, this.mesh.tail);
    this.emitter = g.sfx.emitter();
    // Each rat's own lag, side offset and speed (the same everywhere: a fixed pattern).
    this.rats = Array.from({ length: RATS }, (_, i) => ({ d: (i * 0.618) % 1 * 1.6, side: (((i * 0.377) % 1) - 0.5) * 1.2, v: 4.2 + ((i * 0.733) % 1) * 1.2, ph: i }));
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(1, 1, 1); this.p = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
    this.hide();
  }

  hide() { this.mesh.body.count = this.mesh.tail.count = 0; }

  // ---------- host ----------
  think(dt) {
    const g = this.g, lv = g.level, m = g.mimic;
    for (const [id, t] of this.near) this.near.set(id, t - dt);
    if (this.run) { this.squeal(); return; }
    if ((this.cd -= dt) > 0) return;
    const T = g.targets().filter((P) => !P.hidden && Math.hypot(P.x - m.x, P.z - m.z) < 16);
    if (!T.length) return;
    const P = T[Math.floor(Math.random() * T.length)];
    // From the dark on one side of them, past them, and off the other way.
    const from = lv.randomFloor((q) => { const d = Math.hypot(q.x - P.x, q.z - P.z); return d > 7 && d < 12 && !lv.los(P.x, P.z, q.x, q.z); });
    const to = from && lv.randomFloor((q) => { const d = Math.hypot(q.x - P.x, q.z - P.z); return d > 7 && d < 13 && Math.hypot(q.x - from.x, q.z - from.z) > d; });
    if (!from || !to) { this.cd = 3; return; }
    const pts = [...lv.findPath(from.x, from.z, P.x, P.z), { x: P.x, z: P.z }, ...lv.findPath(P.x, P.z, to.x, to.z)].slice(0, 60);
    if (pts.length < 3) { this.cd = 3; return; }
    this.cd = 35 + Math.random() * 15;
    g.broadcast({ t: 'swarm', p: [from.x, from.z, ...pts.flatMap((q) => [q.x, q.z])].map((v) => +v.toFixed(1)) });
  }

  // Host: anyone the rats are running past is given away.
  squeal() {
    const g = this.g;
    for (const P of g.targets()) {
      if (P.hidden || (this.near.get(P.id) ?? 0) > 0) continue;
      if (this.closest(P.x, P.z) > NEAR) continue;
      this.near.set(P.id, 0.8);
      g.mimic.hear(P.x, P.z, 40, 'step'); // it knows where you are
      g.ls.hear(P.x, P.z, 20, 'step');
    }
  }

  onNet(m) {
    if (!this.on || m.t !== 'swarm' || !Array.isArray(m.p)) return false;
    const pts = [];
    for (let i = 0; i + 1 < m.p.length; i += 2) pts.push({ x: Number(m.p[i]) || 0, z: Number(m.p[i + 1]) || 0 });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.run = { pts, cum, L: cum[cum.length - 1], t: 0 };
    this.sqT = 0;
    return true;
  }

  // Where along the route a rat is (s metres in).
  at(s, out) {
    const { pts, cum } = this.run;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, k = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
    out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k;
    out.dx = (b.x - a.x) / seg; out.dz = (b.z - a.z) / seg;
    return out;
  }

  // How close the nearest rat is to (x, z) right now.
  closest(x, z) {
    if (!this.run) return Infinity;
    let best = Infinity;
    const o = {};
    for (const r of this.rats) {
      const s = (this.run.t - r.d) * r.v;
      if (s < 0 || s > this.run.L) continue;
      this.at(s, o);
      best = Math.min(best, Math.hypot(o.x - x, o.z - z));
    }
    return best;
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && !g.ended) this.think(dt);
    const R = this.run;
    if (!R) return;
    R.t += dt;
    const { body, tail } = this.mesh, o = {};
    let n = 0, cx = 0, cz = 0;
    for (const r of this.rats) {
      const s = (R.t - r.d) * r.v;
      if (s < 0 || s > R.L) continue;
      this.at(s, o);
      const sx = -o.dz * r.side, sz = o.dx * r.side; // off to one side of the line
      const wob = Math.sin(R.t * 18 + r.ph) * 0.06;
      this.p.set(o.x + sx + -o.dz * wob, 0, o.z + sz + o.dx * wob);
      this.q.setFromAxisAngle(this.up, Math.atan2(o.dx, o.dz));
      this.m4.compose(this.p, this.q, this.s);
      body.setMatrixAt(n, this.m4); tail.setMatrixAt(n, this.m4);
      cx += this.p.x; cz += this.p.z; n++;
    }
    body.count = tail.count = n;
    body.instanceMatrix.needsUpdate = tail.instanceMatrix.needsUpdate = true;
    if (!n && R.t > 2) { this.run = null; this.hide(); return; }
    if (n) {
      this.emitter.setPos(cx / n, 0.3, cz / n);
      const c = g.camera.position;
      this.emitter.setOcclusion(!g.level.los(c.x, c.z, cx / n, cz / n));
      if ((this.sqT -= dt) <= 0) { this.sqT = 0.25; g.sfx.rats(this.emitter, Math.min(1, n / 20)); }
      if (!this.told && g.state === 'playing' && this.closest(g.p.x, g.p.z) < NEAR && !g.p.hidden) { this.told = true; g.toast('The rats are giving you away. Get out of their way.'); }
    }
  }

  nearness(x, z) { return this.run ? Math.max(0, 1 - this.closest(x, z) / 6) * 0.5 : 0; }

  dispose() {
    if (!this.on) return;
    this.mesh.body.removeFromParent(); this.mesh.tail.removeFromParent();
    this.emitter.dispose();
  }
}
