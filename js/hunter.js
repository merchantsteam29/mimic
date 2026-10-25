// Hunt mode (online, a lobby mode): one player IS the mimic, in first person. Everyone else plays
// the normal game against them instead of the AI.
//
// The hunter sees in the dark (a red-tinted view with its own light that only they have), sees the
// survivors' flashlights, and "hears" noise: every sound a survivor makes (steps, talking, a generator
// bang) shows up as a red ring through the walls for a moment. Controls: move / look / sprint like
// a player; E (or click) bites whoever is in front of you, or rips open a hiding spot, or opens a door;
// 1-4 play a stolen clip of that player (from wherever you are); R plays anyone's; Q kills the
// nearest working light for good.
//
// Network: the hunter sends 'mst' (where it is) and intents 'bite', 'msay', 'mlight'; the host moves
// the mimic puppet from 'mst' and decides the rest. The survivors can't hear the hunter's real voice.
import * as THREE from 'three';
import { keyLabel } from './controls.js';

const WALK = 2.9, RUN = 5.0, LIT = 0.6;  // m/s; LIT = speed multiplier under working lights
const RUN_TIME = 6, RECOVER = 7;         // seconds of sprint, seconds to recover it
const WAKE = 20;                         // the survivors get a head start
const BITE_CD = 1.4, SAY_CD = 3, LIGHT_CD = 25, MISS_CD = 3;
const R = 0.35;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A soft red ring, drawn through walls, where it heard something.
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,40,40,0)');
  grad.addColorStop(0.75, 'rgba(255,60,50,.9)');
  grad.addColorStop(1, 'rgba(255,40,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Hunter {
  constructor(g, id) {
    this.g = g;
    this.id = id || null;                 // who the mimic is
    this.on = !!(g.mp && id);
    this.me = this.on && g.me === id;
    this.st = null;                       // host: the hunter's last reported [x, z, yaw, run]
    this.cd = { bite: 0, say: 0, light: 0 };
    this.stunT = 0;
    this.wakeT = WAKE;
    this.stamina = 1; this.tired = false;
    this.sendT = 0;
    this.rings = [];
    this.focus = null;
  }

  // ---------- the hunter's own browser ----------
  begin() {
    if (!this.me) return;
    const g = this.g, lv = g.level, p = g.p;
    // Wake up somewhere far from them.
    const sp = lv.spawnPos;
    const spot = lv.randomFloor((q) => Math.hypot(q.x - sp.x, q.z - sp.z) > 22) || lv.randomFloor((q) => Math.hypot(q.x - sp.x, q.z - sp.z) > 12);
    if (spot) { p.x = spot.x; p.z = spot.z; }
    p.flashOn = false;
    p.eye = 1.3;
    // It sees in the dark: a light only this browser has, and a red picture.
    this.sight = new THREE.HemisphereLight(0xff8a7a, 0x301010, 1.6);
    g.scene.add(this.sight);
    g.scene.fog.density *= 0.45;
    g.renderer.domElement.style.filter = 'sepia(.55) saturate(2.2) hue-rotate(-28deg) contrast(1.15)';
    g.hud.cam.hidden = true;
    document.body.classList.add('hunter-me');
    this.ringTex = ringTexture();
    $('hunter').hidden = false;
    this.drawHud();
  }

  // Replaces the survivor's update while playing.
  update(dt) {
    const g = this.g, p = g.p, k = g.keys, lv = g.level;
    for (const n in this.cd) this.cd[n] = Math.max(0, this.cd[n] - dt);
    this.stunT = Math.max(0, this.stunT - dt);
    this.wakeT = Math.max(0, this.wakeT - dt);
    g.mimic.model.root.visible = false; // you're inside it

    // Move.
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (g.stick) { f = clamp(f - g.stick.y, -1, 1); s = clamp(s + g.stick.x, -1, 1); }
    const push = Math.min(1, Math.hypot(f, s));
    const frozen = this.wakeT > 0 || this.stunT > 0;
    const run = !frozen && push > 0 && (k.has('ShiftLeft') || k.has('ShiftRight')) && !this.tired;
    this.stamina = run ? this.stamina - dt / RUN_TIME : Math.min(1, this.stamina + dt / RECOVER);
    if (this.stamina <= 0) { this.stamina = 0; this.tired = true; }
    if (this.tired && this.stamina > 0.3) this.tired = false;
    const lit = g.world.fixtures.some((L) => L.level > 0.5 && (!L.broken || g.power) && !L.dead && Math.hypot(L.x - p.x, L.z - p.z) < 3.2);
    const speed = frozen ? 0 : (run ? RUN : WALK) * (lit ? LIT : 1);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx *= push / wl; wz *= push / wl; }
    const a = 1 - Math.exp(-dt * 10);
    p.vx += (wx * speed - p.vx) * a;
    p.vz += (wz * speed - p.vz) * a;
    const pos = lv.collide({ x: p.x + p.vx * dt, z: p.z + p.vz * dt }, R);
    p.speed = Math.hypot(pos.x - p.x, pos.z - p.z) / dt;
    p.x = pos.x; p.z = pos.z;
    p.bob += dt * p.speed * 1.6;
    p.eye += ((run ? 0.85 : 1.3) - p.eye) * (1 - Math.exp(-dt * 6)); // down on all fours to run
    this.run = run;

    // Tell the host where it is.
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 15;
      g.send({ t: 'mst', s: [+p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), run ? 1 : 0] });
    }
    this.updateFocus();
    this.updateRings(dt);
    this.drawT = (this.drawT || 0) - dt;
    if (this.drawT <= 0) { this.drawT = 0.25; this.drawHud(); }
  }

  // What E does here: a door, a hiding spot, or a bite.
  updateFocus() {
    const g = this.g, c = g.camera.position, fwd = g.camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestDot = 0.8;
    for (const it of g.items) {
      if (!it?.active || (it.type !== 'hide' && it.type !== 'idoor')) continue;
      const dx = it.x - c.x, dy = it.y - c.y, dz = it.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d > it.range + 0.3) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      if (dot > bestDot) { bestDot = dot; best = it; }
    }
    this.focus = best;
    g.focus = best;
    g.setPrompt(best?.type === 'hide' ? 'Rip it open' : best?.type === 'idoor' ? (g.level.idoors[best.i].open ? 'Close door' : 'Open door') : '');
  }

  // Keys (the hunter's own browser). True if used.
  onKey(code) {
    const g = this.g;
    if (g.state !== 'playing') return false;
    if (code === 'KeyE') { this.act(); return true; }
    if (code === 'KeyQ') {
      if (this.cd.light > 0) { g.toast(`Lights again in ${Math.ceil(this.cd.light)}s`); return true; }
      this.cd.light = LIGHT_CD;
      g.send({ t: 'mlight' });
      return true;
    }
    if (code === 'KeyR' || /^Digit[1-4]$/.test(code)) {
      if (this.cd.say > 0) return true;
      const who = code === 'KeyR' ? null : this.survivors()[Number(code.slice(5)) - 1]?.id;
      if (code !== 'KeyR' && !who) return true;
      this.cd.say = SAY_CD;
      g.send({ t: 'msay', who });
      return true;
    }
    // Things a survivor does that the mimic doesn't.
    return ['KeyF', 'KeyG', 'KeyC', 'KeyV', 'Space'].includes(code);
  }

  act() {
    const g = this.g, f = this.focus;
    if (this.wakeT > 0 || this.stunT > 0) return;
    if (f?.type === 'idoor') { g.send({ t: 'door', i: f.i }); return; }
    if (this.cd.bite > 0) return;
    this.cd.bite = BITE_CD;
    g.send({ t: 'bite', prop: f?.type === 'hide' ? g.level.props.indexOf(f.prop) : -1 });
    g.sfx.rec('snarl', g.mimic.emitter, { vol: 0.7 });
  }

  // Everyone it can use: the other players, in the order of the room.
  survivors() {
    return this.g.order.filter((id) => id !== this.id).map((id) => ({ id, name: this.g.nameOf(id) }));
  }

  drawHud() {
    const g = this.g, el = $('hunter');
    if (!el) return;
    const kb = (k) => `<kbd>${keyLabel(k)}</kbd>`;
    const clips = (id) => [...(g.mp?.clips.values() || [])].filter((c) => c.owner === id).length;
    const head = this.wakeT > 0 ? `<p class="whisper">They're spreading out. You wake in ${Math.ceil(this.wakeT)}…</p>`
      : this.stunT > 0 ? '<p class="whisper">Blinded…</p>' : '';
    el.innerHTML = `${head}<p class="kicker">Their voices</p><ol>${this.survivors().map((s, i) =>
      `<li class="${g.alive(s.id) ? '' : 'gone'}">${kb(String(i + 1))}${esc(s.name)} <span>${clips(s.id)} clip${clips(s.id) === 1 ? '' : 's'}</span></li>`).join('')}</ol>`
      + `<p class="fine">${kb('E')}bite · ${kb('R')}anyone's voice${this.cd.say ? ` (${Math.ceil(this.cd.say)})` : ''} · ${kb('Q')}kill a light${this.cd.light ? ` (${Math.ceil(this.cd.light)})` : ''} · ${kb('Shift')}run (${Math.round(this.stamina * 100)}%)</p>`;
  }

  // Where it heard something (shown through walls for a moment).
  showRing(x, z, r) {
    if (!this.ringTex) return;
    const c = this.g.camera.position;
    if (Math.hypot(x - c.x, z - c.z) < 4) return; // right next to you: you don't need a ring
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ringTex, depthTest: false, transparent: true, opacity: 0.9 }));
    s.position.set(x, 1.0, z);
    const size = clamp(r * 0.35, 0.8, 4);
    s.scale.set(size, size, 1);
    s.renderOrder = 10;
    this.g.scene.add(s);
    this.rings.push({ s, t: 0, size });
  }

  updateRings(dt) {
    for (const r of this.rings) {
      r.t += dt;
      r.s.material.opacity = 0.9 * Math.max(0, 1 - r.t / 2.5);
      const k = r.size * (1 + r.t * 0.5);
      r.s.scale.set(k, k, 1);
    }
    for (const r of this.rings.filter((q) => q.t > 2.5)) { r.s.removeFromParent(); r.s.material.dispose(); }
    this.rings = this.rings.filter((q) => q.t <= 2.5);
  }

  // ---------- host ----------
  // Drive the mimic puppet from where the hunter says it is.
  driveMimic(dt) {
    const g = this.g, m = g.mimic;
    const s = this.me ? [g.p.x, g.p.z, g.p.yaw, this.run ? 1 : 0] : this.st;
    if (s) {
      m.tx = s[0]; m.tz = s[1]; m.tyaw = s[2] + Math.PI; // the model faces the other way from a camera
      if (m.tx0 === undefined) { m.x = m.tx; m.z = m.tz; m.yaw = m.tyaw; m.tx0 = 1; }
      m.state = this.stunT > 0 ? 'stunned' : s[3] ? 'chase' : 'stalk';
    }
    m.puppet(dt, g.t);
    if (this.me) m.model.root.visible = false;
  }

  // A sound the mimic could hear: the hunter sees it.
  heard(x, z, r) {
    if (!this.on) return;
    // The same sound from the same spot (a voice, footsteps) shows at most twice a second.
    const key = `${Math.round(x / 2)},${Math.round(z / 2)}`, t = this.g.t;
    this.lastHeard ||= new Map();
    if (t - (this.lastHeard.get(key) ?? -9) < 0.5) return;
    this.lastHeard.set(key, t);
    if (this.lastHeard.size > 64) this.lastHeard.clear();
    if (this.me) this.showRing(x, z, r);
    else this.g.sendTo(this.id, { t: 'heard', x: +x.toFixed(1), z: +z.toFixed(1), r: +r.toFixed(1) });
  }

  // A flare, or a medic's rescue: the hunter is blinded for a moment.
  stun(s) {
    if (!this.on) return;
    this.g.sendTo(this.id, { t: 'mStun', s });
  }

  hostHandle(m, from) {
    if (!this.on || !['mst', 'bite', 'msay', 'mlight'].includes(m.t)) return false;
    if (from !== this.id) return true;
    const g = this.g, mm = g.mimic;
    switch (m.t) {
      case 'mst':
        if (Array.isArray(m.s)) this.st = m.s.map((v) => Number(v) || 0);
        return true;
      case 'bite': {
        // Ripping open a hiding spot: whoever is inside is caught.
        const prop = g.level.props[m.prop | 0];
        if (m.prop >= 0 && prop && Math.hypot(prop.x - mm.x, prop.z - mm.z) < 3) {
          const inside = g.targets().find((P) => P.hidden === prop);
          if (inside) g.hostCatch(inside.id);
          else { g.broadcast({ t: 'slam', x: +prop.x.toFixed(1), z: +prop.z.toFixed(1) }); this.sendMiss(); }
          return true;
        }
        // A bite: the nearest survivor in front, within reach.
        const fx = Math.sin(mm.yaw), fz = Math.cos(mm.yaw); // the model faces +z
        const prey = g.targets().filter((P) => {
          if (P.hidden) return false;
          const dx = P.x - mm.x, dz = P.z - mm.z, d = Math.hypot(dx, dz);
          return d < 1.9 && (d < 0.8 || (dx * fx + dz * fz) / d > 0.2) && g.level.los(mm.x, mm.z, P.x, P.z);
        }).sort((a, b) => Math.hypot(a.x - mm.x, a.z - mm.z) - Math.hypot(b.x - mm.x, b.z - mm.z))[0];
        if (prey) g.hostCatch(prey.id);
        return true;
      }
      case 'msay': {
        const mp = g.mp;
        const who = m.who && g.order.includes(m.who) ? m.who : null;
        if (who && ![...mp.clips.values()].some((c) => c.owner === who)) { g.sendTo(from, { t: 'mNoClip', who }); return true; }
        const key = mp.pickKey((owner) => g.status.get(owner) === 'dead', who);
        if (key) g.broadcast({ t: 'say', key, style: 'lure' });
        return true;
      }
      case 'mlight': {
        // The nearest working light within reach dies, for good.
        const L = g.world.fixtures.map((f, i) => ({ f, i, d: Math.hypot(f.x - mm.x, f.z - mm.z) }))
          .filter((q) => (!q.f.broken || g.power) && !q.f.dead && q.d < 8).sort((a, b) => a.d - b.d)[0];
        if (L) g.broadcast({ t: 'lightOut', i: L.i });
        return true;
      }
    }
    return true;
  }

  sendMiss() { this.g.sendTo(this.id, { t: 'mMiss' }); }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    switch (m.t) {
      case 'heard': if (this.me) this.showRing(Number(m.x) || 0, Number(m.z) || 0, Number(m.r) || 3); return true;
      case 'mStun': if (this.me) { this.stunT = Math.max(this.stunT, Number(m.s) || 3); g.toast('Light! You can\'t see.'); } return true;
      case 'mMiss': if (this.me) { this.cd.bite = MISS_CD; g.toast('Empty.'); } return true;
      case 'mNoClip': if (this.me) g.toast(`You have nothing of ${g.nameOf(m.who)}'s voice yet.`); return true;
      case 'slam': {
        const em = g.ambientEmitter;
        em.setPos(Number(m.x) || 0, 1.2, Number(m.z) || 0);
        g.sfx.rec('slam', em, { vol: 1 });
        return true;
      }
      case 'lightOut': {
        const L = g.world.fixtures[m.i | 0];
        if (!L) return true;
        L.broken = true;
        L.dead = true; // stays dead when the power comes back
        const em = g.ambientEmitter;
        em.setPos(L.x, 2.5, L.z);
        g.sfx.rec('glass', em, { vol: 0.9 });
        return true;
      }
    }
    return false;
  }

  dispose() {
    for (const r of this.rings) r.s.removeFromParent();
    this.sight?.removeFromParent();
    if (this.me) this.g.renderer.domElement.style.filter = '';
    document.body.classList.remove('hunter-me');
    this.ringTex?.dispose();
    const el = $('hunter');
    if (el) el.hidden = true;
  }
}
