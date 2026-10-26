// Bringing a friend back (online, once per game). When someone is taken, their tape drops where it
// happened: a cassette with everything it took from them. Carry it to the power panel and play it, and
// they come back, standing at the panel. Or carry it out through the exit, and they get out with you.
// If whoever carries it is taken, the tape drops again. Once anyone has been brought back, no more tapes drop.
//   host -> 'lifeTape' {i, owner, x, z};  intent 'revive' (at the panel) -> 'revived' {id, x, z}
import * as THREE from 'three';

function makeTape() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.07), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }));
  shell.position.y = 0.01;
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.021, 0.035), new THREE.MeshStandardMaterial({ color: 0xd0c8a8, emissive: 0x3a1010, emissiveIntensity: 0.6 }));
  label.position.y = 0.011;
  g.add(shell, label);
  return g;
}

export class Revive {
  constructor(g) {
    this.g = g;
    this.on = !!g.mp;
    this.used = false;    // someone already came back this game
    this.holder = null;   // host: who's carrying a tape
    this.carry = null;    // me: whose tape I'm carrying
  }

  // Host: someone was taken at (x, z).
  taken(id, x, z) {
    const g = this.g;
    if (!this.on || this.used || id === g.hunt.id) return;
    const at = g.level.collide({ x, z }, 0.2);
    g.broadcast({ t: 'lifeTape', i: g.nextItem++, owner: id, x: +at.x.toFixed(2), z: +at.z.toFixed(2) });
  }

  // Host: the carrier was taken (or left): the tape drops where they were.
  dropped(id, x, z) {
    if (this.holder?.by !== id) return;
    const owner = this.holder.owner;
    this.holder = null;
    if (this.g.status.get(owner) === 'dead') this.taken(owner, x, z);
  }

  // Someone picked a tape up (from 'took').
  took(it, by) {
    it.mesh.removeFromParent();
    if (this.g.isHost) this.holder = { by, owner: it.owner };
    if (by !== this.g.me) return;
    this.carry = it.owner;
    this.g.toast(`${this.g.nameOf(it.owner)}'s tape. Play it at the power panel to bring them back, or carry it out.`);
  }

  // The panel's prompt while carrying one.
  prompt() { return this.carry ? `Play ${this.g.nameOf(this.carry)}'s tape` : null; }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'revive') return false;
    const g = this.g, h = this.holder;
    if (!h || h.by !== from || this.used || !g.alive(from) || g.status.get(h.owner) !== 'dead' || g.power) return true;
    this.used = true;
    this.holder = null;
    const fb = g.world.fuseBox, lv = g.level;
    const at = lv.collide({ x: fb.x - lv.fuseBox.dx * 1.2, z: fb.z - lv.fuseBox.dz * 1.2 }, 0.3);
    if (g.mimic.wearId === h.owner) g.mimic.unwear();
    g.broadcast({ t: 'revived', id: h.owner, x: +at.x.toFixed(2), z: +at.z.toFixed(2), by: from });
    return true;
  }

  // Host: the carrier got out. The one on the tape gets out with them.
  escaped(id) {
    const h = this.holder;
    if (!h || h.by !== id || this.g.status.get(h.owner) !== 'dead') return;
    this.used = true;
    this.holder = null;
    this.g.recap.event('out', h.owner);
    this.g.broadcast({ t: 'out', id: h.owner });
  }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    if (m.t === 'lifeTape') {
      const mesh = makeTape();
      mesh.position.set(m.x, 0, m.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      g.world.group.add(mesh);
      g.items[m.i] = { type: 'lifetape', owner: m.owner, x: m.x, y: 0.1, z: m.z, mesh, range: 2.1, active: true };
      return true;
    }
    if (m.t === 'revived') {
      this.used = true;
      if (this.carry === m.id) this.carry = null;
      for (const it of g.items) if (it?.type === 'lifetape') { it.active = false; it.mesh.removeFromParent(); }
      g.status.set(m.id, 'alive');
      if (m.id === g.me) g.revive(Number(m.x) || 0, Number(m.z) || 0);
      else {
        const r = g.remotes.get(m.id);
        if (r) { r.status = 'alive'; r.tx = r.x = Number(m.x) || r.x; r.tz = r.z = Number(m.z) || r.z; }
        if (g.alive(g.me) && g.state === 'playing') g.toast(m.by === g.me ? `${g.nameOf(m.id)} is back.` : `Someone brought ${g.nameOf(m.id)} back.`);
      }
      return true;
    }
    if (m.t === 'out' && m.id === this.carry) this.carry = null;
    return false;
  }
}
