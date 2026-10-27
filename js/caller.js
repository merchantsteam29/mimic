// The caller (online, Normal mode, a lobby toggle). Every minute or so an old phone appears on the floor a few metres
// from one of you, and rings. Leave it and it keeps ringing, loudly, and the mimic comes to see. Pick it up and you
// hear a voice down the line, usually someone it has already taken, and for a few seconds you know exactly where the
// next thing you need is. But it heard you pick up: it knows where you are now.
// The host runs it: broadcast 'ring' {i, x, z} -> intent 'answer' {i} -> broadcast 'answered' {i, by, key}, or 'ringEnd' {i}.
import * as THREE from 'three';

const RING_T = 12;

function makePhone() {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.35 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.18), body);
  base.position.y = 0.045;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0xc8c0a8, roughness: 0.5 }));
  dial.position.set(0, 0.095, 0.02); dial.rotation.x = -0.35;
  const handset = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.05), body);
  handset.position.set(0, 0.115, -0.04);
  g.add(base, dial, handset);
  g.userData.handset = handset;
  return g;
}

// A glow that shows through walls: "it's there".
function marker() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.4, 'rgba(255,200,120,.5)'); gr.addColorStop(1, 'rgba(255,160,80,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true, fog: false }));
  s.scale.set(0.7, 0.7, 1);
  s.renderOrder = 10;
  return s;
}

const NEEDED = ['fuse', 'gen', 'tape', 'keycard', 'note', 'keypad', 'lore'];

export class Caller {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.cd = 70 + Math.random() * 20;
    this.phones = new Map();   // item index -> { x, z, mesh, em, t }
    this.mark = null; this.markT = 0;
  }

  // ---------- host ----------
  think(dt) {
    const g = this.g;
    if (g.power || g.hunt.on) return;
    for (const [i, ph] of this.phones) {
      ph.t += dt;
      if (Math.floor(ph.t / 3) !== Math.floor((ph.t - dt) / 3)) { g.mimic.hear(ph.x, ph.z, 14, 'step'); g.ls.hear?.(ph.x, ph.z, 14, 'step', null); } // every ring carries
      if (ph.t > RING_T && !ph.done) { ph.done = true; g.broadcast({ t: 'ringEnd', i }); }
    }
    if ((this.cd -= dt) > 0) return;
    this.cd = 50 + Math.random() * 30;
    const T = g.targets().filter((P) => !P.hidden);
    const P = T[Math.floor(Math.random() * T.length)];
    if (!P) return;
    const lv = g.level;
    const at = lv.randomFloor((q) => { const d = Math.hypot(q.x - P.x, q.z - P.z); return d > 4 && d < 9 && lv.los(P.x, P.z, q.x, q.z); })
      || lv.randomFloor((q) => { const d = Math.hypot(q.x - P.x, q.z - P.z); return d > 3 && d < 10; });
    if (!at) return;
    const spot = lv.collide({ x: at.x + (Math.random() - 0.5) * 0.8, z: at.z + (Math.random() - 0.5) * 0.8 }, 0.25);
    g.broadcast({ t: 'ring', i: g.nextItem++, x: +spot.x.toFixed(2), z: +spot.z.toFixed(2) });
  }

  hostHandle(m, from) {
    const g = this.g;
    if (m.t !== 'answer') return false;
    const ph = this.phones.get(m.i | 0);
    const at = from === g.me ? g.p : g.remotes.get(from);
    if (!ph || ph.done || !g.alive(from) || !at || Math.hypot(at.x - ph.x, at.z - ph.z) > 3) return true;
    ph.done = true;
    const key = g.mp?.pickKey((id) => g.status.get(id) === 'dead') ?? null; // the dead, mostly
    g.broadcast({ t: 'answered', i: m.i | 0, by: from, key });
    // It heard the receiver come up. It knows where you are.
    g.mimic.investigate(ph.x, ph.z, 3.4);
    g.ls.hear?.(ph.x, ph.z, 30, 'step', from);
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    if (!this.on) return false;
    switch (m.t) {
      case 'ring': {
        const x = Number(m.x) || 0, z = Number(m.z) || 0, i = m.i | 0;
        const mesh = makePhone();
        mesh.position.set(x, 0, z); mesh.rotation.y = Math.random() * 6.28;
        g.world.group.add(mesh);
        const em = g.sfx.emitter();
        em.setPos(x, 0.3, z);
        em.setOcclusion(!g.level.los(g.p.x, g.p.z, x, z));
        g.sfx.phone(em);
        this.phones.set(i, { x, z, mesh, em, t: 0 });
        g.items[i] = { type: 'phone', i, x, y: 0.15, z, mesh, range: 2.2, active: true };
        return true;
      }
      case 'answered': {
        const ph = this.phones.get(m.i | 0);
        if (!ph) return true;
        this.hangUp(m.i | 0, false);
        ph.mesh.userData.handset.position.set(0.15, 0.02, 0.12); // the receiver left off the hook
        if (m.by !== g.me) return true;
        // Down the line: someone's voice. Then, for a moment, you know where the next thing is.
        const c = g.mp?.clips.get(m.key);
        const d = c ? g.sfx.playVoice(c.buffer, null, 'phone') : 2;
        if (c) g.voice.suppress(d + 0.3);
        else g.sfx.whisper(null);
        g.toast(c ? `${g.nameOf(c.owner)}? No. It can't be.` : 'Breathing, on the other end.');
        setTimeout(() => this.reveal(), (d + 0.4) * 1000);
        return true;
      }
      case 'ringEnd': this.hangUp(m.i | 0, true); return true;
    }
    return false;
  }

  hangUp(i, remove) {
    const g = this.g, ph = this.phones.get(i);
    if (!ph) return;
    ph.em.dispose(); // the ringing stops
    ph.em = null;
    if (g.items[i]) g.items[i].active = false;
    if (remove) { ph.mesh.removeFromParent(); this.phones.delete(i); } else setTimeout(() => { ph.mesh.removeFromParent(); this.phones.delete(i); }, 20000);
  }

  // The nearest thing you still need, glowing through the walls for 12 s (only for whoever answered).
  reveal() {
    const g = this.g;
    if (g.state !== 'playing') return;
    const p = g.p;
    const want = g.items.filter((it) => it?.active && !it.fake && NEEDED.includes(it.type) && !(it.type === 'gen' && g.obj.gen[it.i] >= 1)
      && !(it.type === 'lore' && it.heard));
    if (g.obj.allDone() && !g.power) want.push(g.items.find((it) => it?.type === 'fusebox'));
    const it = want.filter(Boolean).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!it) return;
    this.mark?.removeFromParent();
    this.mark = marker();
    this.mark.position.set(it.x, (it.y || 0.1) + 0.5, it.z);
    g.scene.add(this.mark);
    this.markT = 12;
    // Which way to look: ahead, behind, left or right of where you're facing.
    const dx = it.x - p.x, dz = it.z - p.z, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const ahead = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1), side = dx * -fz + dz * fx;
    const way = ahead > 0.7 ? 'ahead of you' : ahead < -0.7 ? 'behind you' : side > 0 ? 'to your right' : 'to your left';
    g.toast(`The line goes dead. But now you know: it's ${way}.`);
  }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (g.isHost && !g.ended) this.think(dt);
    if (this.mark) {
      this.markT -= dt;
      this.mark.material.opacity = Math.min(1, this.markT / 2) * (0.75 + Math.sin(g.t * 6) * 0.25);
      if (this.markT <= 0) { this.mark.removeFromParent(); this.mark = null; }
    }
    for (const ph of this.phones.values()) if (ph.em) ph.em.setOcclusion(!g.level.los(g.camera.position.x, g.camera.position.z, ph.x, ph.z));
  }

  prompt(it) { return it.type === 'phone' ? 'Answer the phone' : undefined; }

  interact(it) {
    if (it.type !== 'phone') return false;
    this.g.send({ t: 'answer', i: it.i });
    return true;
  }

  dispose() {
    for (const ph of this.phones.values()) { ph.em?.dispose(); ph.mesh.removeFromParent(); }
    this.mark?.removeFromParent();
  }
}
