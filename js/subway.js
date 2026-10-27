// The subway's trains (subway theme only, alone and online). Nobody drives them and they don't stop.
// Every minute and a half or so the host broadcasts 'train' {d} (1 = out of the west tunnel, -1 = the east):
// WARN seconds of warning (a rumble that grows, the horn, its headlights in the tunnel mouth), then three cars
// go straight through at SPEED. Anyone standing on the track (level.onTrack) when it reaches them is taken
// (hostCatch 'tr': the jumpscare is the front of the train); the mimic is knocked flat (stunned). The platforms
// are safe. While it goes by it's too loud to hear anything: nobody's steps or voice make noise (masking()).
import * as THREE from 'three';
import { CELL } from './level.js';

const WARN = 6;          // seconds from the first rumble to the train coming out of the tunnel
const SPEED = 22;        // m/s
const CAR = 12, GAP = 0.6, CARS = 3;
const LEN = CARS * CAR + (CARS - 1) * GAP;

// The side of a car: dull steel, a row of lit windows, and people standing in them. They're all facing the glass.
function carSides() {
  const W = 512, H = 128, mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [c, g] = mk(), [e, ge] = mk();
  g.fillStyle = '#39404a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#6a1a1a'; g.fillRect(0, 92, W, 8);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let x = 14; x < W - 40; x += 62) {
    const door = (x - 14) % 186 === 124;
    for (const [ctx, col] of [[g, '#b8a874'], [ge, '#8a7a50']]) { ctx.fillStyle = col; ctx.fillRect(x, door ? 18 : 24, 46, door ? 96 : 50); }
    if (Math.random() < 0.45) { // someone standing there
      const px = x + 10 + Math.random() * 22;
      for (const ctx of [g, ge]) {
        ctx.fillStyle = '#0a0806';
        ctx.beginPath(); ctx.arc(px, 38, 6, 0, 7); ctx.fill();
        ctx.fillRect(px - 8, 44, 16, door ? 70 : 30);
      }
    }
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(10,8,6,.25)'; g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 30, 1 + Math.random() * 3); }
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  return [tex(c), tex(e)];
}

// A glow you can see from far off (the headlights coming).
function glow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 1, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,.55)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(3, 3, 1);
  return s;
}

// The train, front at x = 0, the cars trailing back along -x.
function makeTrain() {
  const root = new THREE.Group();
  const [side, sideE] = carSides();
  side.wrapS = sideE.wrapS = THREE.RepeatWrapping;
  side.repeat.x = sideE.repeat.x = 2;
  const body = new THREE.MeshStandardMaterial({ map: side, emissiveMap: sideE, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.5, metalness: 0.4 });
  const plain = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.6, metalness: 0.4 });
  const mats = [plain, plain, plain, plain, body, body]; // the box's +x, -x, +y, -y, +z, -z faces
  for (let i = 0; i < CARS; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(CAR, 2.6, 2.7), mats);
    car.position.set(-CAR / 2 - i * (CAR + GAP), 1.45, 0);
    root.add(car);
  }
  // The front: a dark windscreen with nobody behind it, two headlights, the sign.
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false });
  const glass = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.1, metalness: 0.6 });
  const front = new THREE.Group();
  front.position.x = 0.02;
  const wind = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), glass);
  wind.position.set(0, 2.0, 0); wind.rotation.y = Math.PI / 2;
  front.add(wind);
  for (const z of [-0.85, 0.85]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), lamp);
    l.position.set(0.01, 0.75, z); l.rotation.y = Math.PI / 2;
    front.add(l);
  }
  const head = new THREE.Object3D(); // where the jumpscare looks
  head.position.set(0, 1.45, 0);
  front.add(head);
  const beam = glow();
  beam.position.set(0.6, 0.85, 0);
  beam.scale.set(5, 4, 1);
  front.add(beam);
  root.add(front);
  root.visible = false;
  return { root, head };
}

export class Subway {
  constructor(g) {
    this.g = g;
    this.on = !!g.level.tunnel;
    if (!this.on) return;
    const lv = g.level, t = lv.tunnel;
    this.x0 = CELL; this.x1 = (lv.N - 1) * CELL;
    this.zc = (t.z + 2) * CELL;
    this.cd = 55 + Math.random() * 25;      // host: until the first train
    this.run = null;                         // { d, T } while one is coming or going by
    this.model = makeTrain();
    this.model.root.position.set(0, 0, this.zc);
    g.scene.add(this.model.root);
    this.mouth = glow();                     // its lights in the tunnel mouth, before it comes out
    this.mouth.material.opacity = 0;
    g.scene.add(this.mouth);
    this.emitter = g.sfx.emitter();
  }

  get passT() { return (this.x1 - this.x0 + LEN + 4) / SPEED; }

  // Where its front is now (x), or null when it isn't out of the tunnel.
  front() {
    const r = this.run;
    if (!r || r.T < WARN) return null;
    const run = (r.T - WARN) * SPEED;
    return r.d > 0 ? this.x0 - 2 + run : this.x1 + 2 - run;
  }

  // Too loud to hear anything (footsteps and voices make no noise).
  masking() {
    const r = this.run;
    return !!r && r.T > WARN - 1.5 && r.T < WARN + this.passT + 1;
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g;
    if (!this.run) {
      if ((this.cd -= dt) > 0) return;
      this.cd = 75 + Math.random() * 40;
      g.broadcast({ t: 'train', d: Math.random() < 0.5 ? 1 : -1 });
      return;
    }
    const fx = this.front();
    if (fx === null) return;
    const bx = fx - this.run.d * LEN, lo = Math.min(fx, bx) - 0.4, hi = Math.max(fx, bx) + 0.4;
    const lv = g.level, hit = (q) => lv.onTrack(q.x, q.z) && q.x > lo && q.x < hi;
    for (const P of g.targets()) if (!P.hidden && hit(P)) g.hostCatch(P.id, 'tr');
    const m = g.mimic;
    if (hit(m) && !m.ceiling && m.state !== 'stunned' && m.state !== 'transform') { m.stun(5); g.hunt.stun?.(5); }
  }

  onNet(m) {
    if (!this.on || m.t !== 'train') return false;
    this.run = { d: m.d < 0 ? -1 : 1, T: 0 };
    this.ex = this.run.d > 0 ? this.x0 + 0.3 : this.x1 - 0.3;
    this.emitter.setPos(this.ex, 1.2, this.zc);
    this.g.sfx.train(this.emitter, WARN, this.passT);
    return true;
  }

  // ---------- everyone ----------
  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && !g.ended) this.think(dt);
    const r = this.run;
    if (!r) { if (!this.posed) this.model.root.visible = false; return; }
    r.T += dt;
    const c = g.camera.position;
    const mouthX = r.d > 0 ? this.x0 + 0.3 : this.x1 - 0.3;
    this.mouth.position.set(mouthX, 1.0, this.zc);
    this.mouth.material.opacity = r.T < WARN ? (r.T / WARN) ** 2 : Math.max(0, 1 - (r.T - WARN) * 2);
    this.mouth.scale.setScalar(1.5 + (r.T / WARN) * 3);
    const fx = this.front();
    if (fx !== null && !this.posed) {
      const m = this.model.root;
      m.visible = true;
      m.position.set(fx, 0, this.zc);
      m.rotation.y = r.d > 0 ? 0 : Math.PI;
      this.ex = Math.max(this.x0, Math.min(this.x1, fx - r.d * LEN * 0.3));
      this.emitter.setPos(this.ex, 1.2, this.zc);
      // The station lights up as it goes by, and the floor shakes.
      const lo = Math.min(fx, fx - r.d * LEN), hi = Math.max(fx, fx - r.d * LEN);
      const near = Math.max(0, 1 - Math.hypot(c.x < lo ? lo - c.x : c.x > hi ? c.x - hi : 0, c.z - this.zc) / 14);
      g.hemi.intensity = g.hemiBase + near * 0.5;
      if (g.state === 'playing' && near > 0.3) g.distort = Math.max(g.distort, near * 0.25);
    }
    this.emitter.setOcclusion(!g.level.los(c.x, c.z, fx === null ? mouthX : this.ex, this.zc));
    if (r.T > WARN + this.passT + 0.5) {
      this.run = null;
      if (!this.posed) this.model.root.visible = false;
      g.hemi.intensity = g.hemiBase;
    }
  }

  // How close it is, 0..1, for the fear and the dread drone (only while it's out).
  nearness(x, z) {
    const fx = this.front();
    if (fx === null) return 0;
    return Math.max(0, 1 - Math.hypot(fx - x, this.zc - z) / 16) * 0.8;
  }

  // The jumpscare: its front, right in front of you, lights blazing.
  poseAt(x, z, yaw) {
    if (!this.on) return null;
    this.posed = true;
    const m = this.model.root;
    m.visible = true;
    m.position.set(x, 0, z);
    m.rotation.y = yaw - Math.PI / 2; // (its front points along +x; the game passes the way a creature would face)
    return { root: m, head: this.model.head };
  }

  dispose() {
    if (!this.on) return;
    this.model.root.removeFromParent();
    this.mouth.removeFromParent();
    this.emitter.dispose();
  }
}
