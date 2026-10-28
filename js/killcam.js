// Kill-cam: how someone was taken, replayed from behind them. Every browser keeps the last few seconds of where
// everyone was (15 times a second: the mimic, each player, each creature), from what it can see. After your own
// catch (once SIGNAL LOST has played) the replay runs before you spectate (alone: before the end screen); when a
// friend is taken while you're dead or out, K watches theirs. The last second goes slow. Space / E skips.
// The replay uses its own puppets (a second mimic, copies of the players) so the live game carries on underneath.
import * as THREE from 'three';
import { Mimic } from './mimic.js';
import { RemotePlayer } from './remote.js';
import { keyLabel } from './controls.js';

const HZ = 15, KEEP = 10, SHOW = 7; // samples a second, seconds kept, seconds shown
const KINDS = ['sw', 'ls', 'sk', 'sd', 'db', 'mo', 'mc', 'pt']; // creatures that can take you (the train doesn't get a replay)
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class KillCam {
  constructor(g) {
    this.g = g;
    this.on = !g.room && !g.tut.on;
    this.frames = [];
    this.sampleT = 0;
    this.catches = new Map(); // id -> { t, by }
    this.play = null;
    this.offer = null; // { id, until } a friend's replay you can watch
    this.el = document.getElementById('killcam');
  }

  // ---------- recording ----------
  record(dt) {
    const g = this.g;
    if ((this.sampleT -= dt) > 0) return;
    this.sampleT = 1 / HZ;
    const p = [];
    const mine = g.myState();
    if (mine) p.push([g.me, ...mine]);
    for (const [id, r] of g.remotes) if (r.seen && g.alive(id) && r !== this.worn()) p.push([id, +r.x.toFixed(2), +r.z.toFixed(2), +r.yaw.toFixed(2), +r.pitch.toFixed(2), r.crouch ? 1 : 0, r.flash ? 1 : 0, r.hidden]);
    const c = [];
    for (const k of KINDS) { const C = g[k]; if (C?.on && C.state !== 'gone' && Number.isFinite(C.x)) c.push([k, +C.x.toFixed(2), +C.z.toFixed(2), +(C.yaw || 0).toFixed(2)]); }
    const m = g.mimic.snap();
    m[7] = 0; // in the replay it shows itself, not whoever it was wearing
    this.frames.push({ t: g.t, m, p, c });
    while (this.frames.length && this.frames[0].t < g.t - KEEP) this.frames.shift();
  }

  worn() { return this.g.mimic.wearId && this.g.remotes.get(this.g.mimic.wearId); }

  // Someone was taken (every browser, from 'caught').
  caught(id, by) {
    if (!this.on) return;
    this.catches.set(id, { t: this.g.t, by: by || null });
    const g = this.g;
    if (id !== g.me && g.state === 'spectate' && by !== 'tr') {
      this.offer = { id, until: g.t + 15 };
      g.toast(`${keyLabel('K')}: watch how ${g.nameOf(id)} was taken`);
    }
  }

  // ---------- playing ----------
  // Start the replay of id's catch; done() runs after it (or at once, if there's nothing to show).
  start(id, done = () => {}) {
    const g = this.g, c = this.catches.get(id);
    const frames = c && this.frames.filter((f) => f.t >= c.t - SHOW && f.t <= c.t + 0.15);
    if (!this.on || !c || c.by === 'tr' || !frames || frames.length < HZ * 2 || !frames.some((f) => f.p.some((r) => r[0] === id))) { done(); return false; }
    this.stop(false);
    const P = { id, by: c.by, frames, T: frames[0].t, end: frames[frames.length - 1].t, done, avatars: new Map(), cam: null };
    // The victim's last frame where they're in it: the replay ends there.
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].p.some((r) => r[0] === id)) { P.end = frames[i].t; break; }
    if (!c.by) {
      P.mimic = new Mimic(g.level, g.scene, g.sfx, {});
      P.mimic.setForm(g.mimic.form);
    } else {
      P.creature = g[c.by];
      if (P.creature) P.creature.posed = true;
    }
    this.play = P;
    this.offer = null;
    if (this.el) {
      this.el.querySelector('b').textContent = id === g.me ? 'How it got you' : `How it got ${g.nameOf(id)}`;
      this.el.hidden = false;
    }
    g.hud.signal.hidden = true;
    g.hud.spec.hidden = true;
    return true;
  }

  // Finish (skipped or over): clear the puppets, hand back.
  stop(callDone = true) {
    const P = this.play;
    if (!P) return;
    this.play = null;
    if (P.mimic) { P.mimic.model.root.removeFromParent(); P.mimic.dispose(); }
    if (P.creature) P.creature.posed = false;
    for (const a of P.avatars.values()) a.dispose();
    if (this.el) this.el.hidden = true;
    const g = this.g;
    g.distort = 0;
    if (g.state === 'spectate') g.hud.spec.hidden = false;
    if (callDone) { g.sfx.static(0.5); P.done(); }
  }

  get active() { return !!this.play; }

  onKey(code) {
    const g = this.g;
    if (this.play && (code === 'Space' || code === 'KeyE')) { this.stop(); return true; }
    if (!this.play && code === 'KeyK' && this.offer && g.t < this.offer.until && g.state === 'spectate') { this.start(this.offer.id); return true; }
    return false;
  }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.state === 'playing' || g.state === 'spectate' || g.state === 'caught') this.record(dt);
    const P = this.play;
    if (!P) return;
    // Slow for the last second.
    P.T += dt * (P.end - P.T < 1.1 ? 0.35 : 1);
    if (P.T >= P.end + 0.6) { this.stop(); return; }
    const fs = P.frames;
    let i = 0;
    const T = Math.min(P.T, P.end); // (it holds on the moment of the catch)
    while (i < fs.length - 2 && fs[i + 1].t <= T) i++;
    const a = fs[i], b = fs[i + 1] || a, k = b.t > a.t ? Math.min(1, Math.max(0, (T - a.t) / (b.t - a.t))) : 0;
    // The players.
    const seen = new Set();
    for (const ra of a.p) {
      const rb = b.p.find((r) => r[0] === ra[0]) || ra, id = ra[0];
      seen.add(id);
      let av = P.avatars.get(id);
      if (!av) { av = new RemotePlayer(g.scene, g.sfx, Math.max(0, g.order.indexOf(id)), g.lookOf(id)); P.avatars.set(id, av); }
      av.setState([lerp(ra[1], rb[1], k), lerp(ra[2], rb[2], k), lerpAng(ra[3], rb[3], k), ra[4], ra[5], ra[6], ra[7]]);
      av.status = 'alive';
    }
    for (const [id, av] of P.avatars) if (!seen.has(id) && id !== P.id) av.status = 'gone';
    for (const av of P.avatars.values()) av.update(dt, (x, z) => g.level.surfaceAt(x, z));
    // What took them.
    if (P.mimic) {
      const m = a.m.slice();
      m[0] = lerp(a.m[0], b.m[0], k); m[1] = lerp(a.m[1], b.m[1], k); m[2] = lerpAng(a.m[2], b.m[2], k);
      P.mimic.applySnap(m);
      P.mimic.puppet(dt, g.t);
      P.who = P.mimic;
    } else if (P.creature?.model || P.creature?.wearId) {
      const ca = a.c.find((r) => r[0] === P.by), cb = b.c.find((r) => r[0] === P.by) || ca;
      const root = P.creature.model?.root || P.creature.avatar(P.creature.wearId).root; // (the skinwalker / imposter: the friend it was wearing)
      root.visible = !!ca;
      if (ca) {
        root.position.set(lerp(ca[1], cb[1], k), 0, lerp(ca[2], cb[2], k));
        root.rotation.y = lerpAng(ca[3], cb[3], k);
        P.who = { x: root.position.x, z: root.position.z };
      }
    }
  }

  // After the game's own camera: hide the live things and look from behind the victim, toward what's coming.
  render(dt) {
    const P = this.play;
    if (!P) return;
    const g = this.g;
    g.mimic.model.root.visible = false;
    for (const r of g.remotes.values()) r.root.visible = false;
    const v = P.avatars.get(P.id);
    if (!v) return;
    const w = P.who || { x: v.x + Math.sin(v.yaw), z: v.z + Math.cos(v.yaw) };
    let dx = v.x - w.x, dz = v.z - w.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    // Behind the victim (on the far side from it), a little to one side and above; pulled in if a wall's in the way.
    let back = 3.2, cx, cz;
    for (; back > 0.6; back -= 0.2) {
      cx = v.x + dx * back - dz * 1.1; cz = v.z + dz * back + dx * 1.1;
      if (g.level.los(v.x, v.z, cx, cz)) break;
    }
    const want = new THREE.Vector3(cx, 2.5, cz);
    P.cam = P.cam ? P.cam.lerp(want, Math.min(1, dt * 3)) : want;
    const c = g.camera;
    c.position.copy(P.cam);
    const tx = (v.x + w.x) / 2, tz = (v.z + w.z) / 2;
    c.lookAt(lerp(v.x, tx, 0.6), 1.1, lerp(v.z, tz, 0.6));
    g.distort = P.end - P.T < 1.1 ? 0.12 : 0.04;
  }

  dispose() { this.stop(false); }
}
