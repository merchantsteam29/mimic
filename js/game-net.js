// Networking: intents to the host (hostHandle), what happened to everyone (onNet), catches and the end.
// Part of Game (game.js): these methods are mixed into Game.prototype.
import * as THREE from 'three';
import { makeFuse } from './level.js';
import { LOGGED, clamp, num } from './game-shared.js';
import { build } from './splice.js';

export const NetPart = {
  send(m) { if (this.mp) this.mp.send(m); else this.hostHandle(m, this.me); },
  broadcast(m) {
    if (this.mp && this.isHost && LOGGED.has(m.t)) this.log.push(m); // for anyone who drops and comes back
    if (this.mp) this.mp.broadcast(m); else this.onNet(m);
  },

  // Host: where a player who dropped was, for when they come back.
  resumeFor(id) {
    const r = this.remotes.get(id);
    return { status: this.status.get(id) || 'alive', x: r ? +r.tx.toFixed(2) : null, z: r ? +r.tz.toFixed(2) : null, time: +this.time.toFixed(1) };
  },
  sendTo(id, m) { if (!this.mp || id === this.me) this.onNet(m); else this.mp.net.sendTo(id, m); },
  nameOf(id) { return this.mp ? this.mp.net.nameOf(id) : 'You'; },
  alive(id) { return this.status.get(id) === 'alive'; },

  // Host: a player's intent.
  hostHandle(m, from) {
    const r = this.remotes.get(from);
    if (this.hunt.hostHandle(m, from) || this.chat.hostHandle(m, from) || this.radio.hostHandle(m, from) || this.rec.hostHandle(m, from) || this.thr.hostHandle(m, from) || this.sig.hostHandle(m, from) || this.revival.hostHandle(m, from) || this.haunt.hostHandle(m, from) || this.obj.hostHandle(m, from) || this.esc.hostHandle(m, from) || this.cl.hostHandle(m, from) || this.lan.hostHandle(m, from) || this.ab.hostHandle(m, from) || this.traitor.hostHandle(m, from)) return;
    switch (m.t) {
      case 'door': { // open / close a real door
        const d = this.level.idoors[m.i | 0];
        if (!d || (!this.alive(from) && from !== this.hunt.id)) break;
        if (d.jamUntil > this.t) { this.sendTo(from, { t: 'jammed' }); break; } // the traitor jammed it
        this.broadcast({ t: 'doorSet', i: d.i, open: !d.open, by: from });
        this.ls.hear(d.x, d.z, 6, 'step');
        break;
      }
      case 'trapped': if (this.alive(from)) this.hostCatch(from); break; // the fake locker had them
      case 'fakeDone': this.broadcast({ t: 'fakeGone', p: m.p | 0 }); break;
      case 'sniffRes': // the hidden player's heartbeat game is over
        if (this.mimic.state === 'sniff' && this.mimic.targetId === from) {
          this.sniffing = null;
          this.mimic.endSniff(!!m.ok, this.infoOf(from));
        }
        break;
      case 'st': {
        if (!r || !this.alive(from) || !Array.isArray(m.s)) return;
        const s = m.s.map((v) => num(v));
        const wasHidden = r.hidden;
        r.setState(s);
        if (r.hidden >= 0 && !this.level.props[r.hidden]) r.hidden = -1;
        if (wasHidden < 0 && r.hidden >= 0) this.mimic.notifyHide(this.level.props[r.hidden], this.infoOf(from));
        break;
      }
      case 'noise': {
        if (!this.alive(from)) return;
        if (this.tr.masking()) break; // a train going by: nobody could hear a thing
        const x = num(m.x), z = num(m.z), rad = clamp(num(m.r), 0, 25);
        const prop = r && r.hidden >= 0 ? this.level.props[r.hidden] : null;
        const d = Math.hypot(this.mimic.x - x, this.mimic.z - z);
        if (m.k === 'voice' && prop && d < Math.min(rad, 8)) this.mimic.foundHidden(prop, from);
        else this.mimic.hear(x, z, rad, m.k === 'voice' ? 'voice' : 'step');
        this.hunt.heard(x, z, rad);
        this.ls.hear(x, z, rad, m.k === 'voice' ? 'voice' : 'step', from);
        break;
      }
      case 'take': {
        const it = this.items[m.i];
        if (!it || !it.active || !['fuse', 'battery', 'keycard', 'recorder', 'lifetape', 'throwable'].includes(it.type) || !this.alive(from)) return;
        if (it.type === 'lifetape' && this.revival.holder) return; // one at a time
        if (it.fake) { // the decoy: it was it
          it.active = false;
          this.mimic.hear(it.x, it.z, 15, 'step');
          this.broadcast({ t: 'fakeItem', i: m.i, by: from });
          return;
        }
        it.active = false;
        if (it.type === 'fuse') { this.held.set(from, (this.held.get(from) || 0) + 1); this.mimic.aggro += 0.03; }
        this.broadcast({ t: 'took', i: m.i, by: from });
        break;
      }
      case 'insert': {
        const n = this.held.get(from) || 0;
        if (!n || this.power || !this.alive(from)) return;
        this.held.set(from, 0);
        this.hostFusesIn = Math.min(4, this.hostFusesIn + n);
        this.broadcast({ t: 'fuses', ins: this.hostFusesIn, by: from });
        break;
      }
      case 'escaped': {
        if (!this.alive(from) || !this.level.exitOpen) return;
        this.held.set(from, 0);
        this.recap.event('out', from);
        this.broadcast({ t: 'out', id: from });
        this.revival.escaped(from);
        break;
      }
      case 'quit': { // a player's connection dropped
        if (!this.status.has(m.id) || this.status.get(m.id) === 'left') return;
        if (m.id === this.hunt.id) this.hunt.on = false; // the hunter left: the mimic thinks for itself again
        this.dropFuses(m.id);
        this.broadcast({ t: 'left', id: m.id });
        break;
      }
    }
  },

  // Everyone: what happened.
  onNet(m) {
    if (this.obj.onNet(m) || this.ab.onNet(m) || this.traitor.onNet(m) || this.sw.onNet(m) || this.hunt.onNet(m) || this.chat.onNet(m) || this.haunt.onNet(m) || this.inc.onNet(m) || this.radio.onNet(m) || this.rec.onNet(m) || this.thr.onNet(m) || this.sig.onNet(m) || this.revival.onNet(m) || this.sd.onNet(m) || this.db.onNet(m) || this.esc.onNet(m) || this.cl.onNet(m) || this.lan.onNet(m) || this.mo.onNet(m) || this.tr.onNet(m) || this.fair.onNet(m) || this.mc.onNet(m)) return;
    switch (m.t) {
      case 'doorSet': {
        const d = this.level.idoors[m.i | 0];
        if (!d) return;
        d.open = !!m.open;
        const c = this.camera.position;
        this.doorEm.setPos(d.x, 1.2, d.z);
        this.doorEm.setOcclusion(!this.level.los(c.x, c.z, d.x - d.dx * 0.3, d.z - d.dz * 0.3));
        this.sfx.door(this.doorEm, d.open, m.by === 'm' && this.mimic.state === 'chase');
        break;
      }
      case 'creak': { // its hand on the door handle
        const d = this.level.idoors[m.i | 0];
        if (!d) return;
        this.doorEm.setPos(d.x, 1.2, d.z);
        this.sfx.handle(this.doorEm, !!m.fast);
        break;
      }
      case 'fakeGone': { const pr = this.level.props[m.p]; if (pr) this.scares.fakeGone(pr); break; }
      case 'fakeItem': {
        const it = this.items[m.i];
        if (!it) return;
        it.active = false;
        // It scuttles off into the dark.
        if (it.mesh) {
          const a = Math.random() * Math.PI * 2, mesh = it.mesh, t0 = performance.now();
          const run = () => {
            const k = (performance.now() - t0) / 600;
            mesh.position.x += Math.sin(a) * 0.12; mesh.position.z += Math.cos(a) * 0.12;
            if (k < 1) requestAnimationFrame(run); else mesh.removeFromParent();
          };
          run();
        }
        if (m.by === this.me) {
          this.sfx.bite();
          this.hud.flash.classList.remove('hit');
          void this.hud.flash.offsetWidth;
          this.hud.flash.classList.add('hit');
          this.toast('It bit you.');
          this.p.stamina = 0; this.p.tired = true;
          this.p.battery = Math.max(0, this.p.battery - 25);
        }
        break;
      }
      case 'sniff': this.hb.start(); break;
      case 'sniffEnd': if (this.hb.on) { this.hb.stop(); this.toast('It went away… for now.'); } break;
      case 'snap': {
        if (this.isHost) return;
        if (Array.isArray(m.m) && !(this.state === 'caught')) this.mimic.applySnap(m.m);
        if (m.sw && this.state !== 'caught') this.sw.applySnap(m.sw);
        if (m.ls && this.state !== 'caught') this.ls.applySnap(m.ls);
        if (m.sk && this.state !== 'caught') this.sk.applySnap(m.sk);
        if (m.sd && this.state !== 'caught') this.sd.applySnap(m.sd);
        if (m.db && this.state !== 'caught') this.db.applySnap(m.db);
        if (m.mo && this.state !== 'caught') this.mo.applySnap(m.mo);
        if (m.mc && this.state !== 'caught') this.mc.applySnap(m.mc);
        for (const row of m.p || []) {
          const r = this.remotes.get(row[0]);
          if (r) r.setState(row.slice(1).map((v) => num(v)));
        }
        break;
      }
      case 'say': {
        let d;
        if (Array.isArray(m.keys)) { // the chorus: several voices at once
          const bufs = m.keys.map((k) => this.mp?.clips.get(k)?.buffer).filter(Boolean);
          d = bufs.length ? this.sfx.chorus(bufs, this.mimic.emitter) : this.sfx.whisper(this.mimic.emitter);
        } else {
          const c = m.key && this.mp?.clips.get(m.key);
          const bufs = Array.isArray(m.sp?.keys) && m.sp.keys.map((k) => this.mp?.clips.get(k)?.buffer);
          const sp = bufs?.length && bufs.every(Boolean) && Array.isArray(m.sp.p) && m.sp.p.length ? build(this.sfx.ctx, m.sp.p, bufs) : null;
          d = sp || c ? this.sfx.playVoice(sp || c.buffer, this.mimic.emitter, m.style, Number.isFinite(m.q) ? m.q : 1) : this.sfx.whisper(this.mimic.emitter);
        }
        if (!this.isHost) this.mimic.speaking = d;
        this.voice.suppress(d + 0.3);
        this.lures++;
        break;
      }
      case 'sting': if (this.state === 'playing') this.sfx.sting(this.mimic.emitter); break;
      case 'took': {
        const it = this.items[m.i];
        if (!it) return;
        it.active = false;
        if (!['recorder', 'lifetape', 'throwable'].includes(it.type)) it.mesh?.removeFromParent();
        const mine = m.by === this.me;
        if (it.type === 'recorder') { it.active = false; this.rec.took(it, m.by); if (mine) this.sfx.pickup(); this.updateObjective(); break; }
        if (it.type === 'lifetape') { this.revival.took(it, m.by); if (mine) this.sfx.pickup(); break; }
        if (it.type === 'throwable') { this.thr.took(it, m.by); if (mine) this.sfx.pickup(); break; }
        if (it.type === 'keycard') { this.obj.tookKey(m.by); if (mine) this.events.progress('key'); }
        else if (it.type === 'fuse') {
          this.fusesFound++;
          if (mine) { this.fusesHeld++; this.sfx.pickup(); this.toast(`Fuse ${this.fusesFound}/4`); this.events.progress('fuse'); }
        } else if (mine) {
          this.p.battery = Math.min(100, this.p.battery + 60);
          this.sfx.pickup();
          this.toast('Flashlight battery');
        }
        this.updateObjective();
        break;
      }
      case 'drop': { // what a player was carrying when they were taken
        const key = m.kind === 'keycard';
        const mesh = key ? new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.055), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, emissive: 0x2a4a7a })) : makeFuse();
        mesh.position.set(m.x, key ? 0.005 : 0.06, m.z);
        this.world.group.add(mesh);
        this.items[m.i] = { type: key ? 'keycard' : 'fuse', x: m.x, y: 0.1, z: m.z, mesh, range: 2.1, active: true };
        if (key) this.obj.droppedKey();
        else this.fusesFound = Math.max(0, this.fusesFound - 1);
        this.updateObjective();
        break;
      }
      case 'fuses': {
        if (this.level.tasks.fuses) this.world.fuseBox.slots.forEach((sl, i) => {
          sl.emissive.setHex(i < m.ins ? 0x2bff5a : 0xff1a1a);
          sl.color.setHex(i < m.ins ? 0x002200 : 0x220000);
        });
        if (m.pulled) { // someone pulled a fuse back out
          const fb = this.world.fuseBox, c = this.camera.position;
          this.doorEm.setPos(fb.x, 1.3, fb.z);
          this.doorEm.setOcclusion(!this.level.los(c.x, c.z, fb.x - this.level.fuseBox.dx * 0.3, fb.z - this.level.fuseBox.dz * 0.3));
          this.sfx.clunk();
        }
        this.fusesIn = m.ins;
        if (m.by === this.me) {
          this.fusesHeld = 0;
          this.sfx.clunk();
          if (m.ins < 4) this.toast(`${4 - m.ins} more to go`);
        }
        this.updateObjective();
        break;
      }
      case 'power': this.powerOn(m.by); break;
      case 'caught': {
        this.status.set(m.id, 'dead');
        const at = ['sw', 'ls', 'sk', 'sd', 'db', 'mo', 'tr', 'mc'].map((k) => m[k]).find(Array.isArray) || null;
        this.kc.caught(m.id, ['sw', 'ls', 'sk', 'sd', 'db', 'mo', 'tr', 'mc'].find((k) => m[k]));
        if (m.id === this.me && this.state !== 'intro') this.caught(at ? { x: num(at[0]), z: num(at[1]), ceiling: false, dropT: 0, sw: !!m.sw, ls: !!m.ls, sk: !!m.sk, sd: !!m.sd, db: !!m.db, mo: !!m.mo, tr: !!m.tr, mc: !!m.mc } : null);
        // Nobody else is told. Their voice just stops, as if they wandered off.
        else if (this.alive(this.me)) this.mp?.vc?.route(m.id, { on: false });
        this.checkEnd();
        break;
      }
      case 'hour': this.ns.onHour(num(m.h, 0)); break;
      case 'hsPhase': this.hs.onPhase(m.p); break;
      case 'out': {
        this.status.set(m.id, 'out');
        if (m.id === this.me) { if (this.state !== 'intro') { this.toast(m.dawn ? (this.hs.on ? 'Time\'s up. It never found you.' : 'You lasted the night.') : 'You got out.'); this.startSpectate(); } }
        else if (!m.dawn) this.toast(`${this.nameOf(m.id)} got out`);
        this.checkEnd();
        break;
      }
      case 'left': {
        this.status.set(m.id, 'left');
        if (this.state === 'playing') this.toast(`${this.nameOf(m.id)} left the game`);
        this.checkEnd();
        break;
      }
      case 'end': this.finish(m); break;
      case 'resume': { // back after a drop: where I was
        this.status.set(this.me, m.status === 'dead' || m.status === 'out' ? m.status : 'alive');
        if (Number.isFinite(m.x) && Number.isFinite(m.z)) { this.p.x = m.x; this.p.z = m.z; }
        if (Number.isFinite(m.time)) this.time = m.time;
        this.resumed = true;
        break;
      }
    }
  },

  // Host: did everyone get out or get taken?
  checkEnd() {
    if (!this.isHost || this.ended) return;
    if ([...this.status.values()].some((s) => s === 'alive')) return;
    this.ended = true;
    if (!this.mp) return; // alone, the jumpscare / escape ends the run itself
    this.broadcast({ t: 'end', st: Object.fromEntries(this.status), time: this.time, mode: this.hunt.id ? 'hunt' : this.traitor.on ? 'story' : this.vs.on ? 'versus' : this.ns.on ? 'nights' : this.hs.on ? 'hide' : this.lan.on ? 'escort' : 'normal', night: this.ns.night, hour: this.ns.hour, hunter: this.hunt.id, recap: this.recap.data(), ...this.traitor.result(), ...this.vs.result(), ...this.hs.result() });
  },

  // Host: the mimic (or, by 'sw', the skinwalker; 'ls', the listener) reached a player.
  hostCatch(id, by = null) {
    if (!this.alive(id)) return;
    if (this.ab.hostSave(id)) return; // a medic's rescue: they tear free
    this.dropFuses(id);
    this.hs.caught(id);
    this.recap.event('caught', id, by);
    const at = id === this.me ? this.p : this.remotes.get(id);
    if (at) this.revival.taken(id, at.x, at.z);
    if (by === 'sw') { this.broadcast({ t: 'caught', id, sw: [+this.sw.x.toFixed(2), +this.sw.z.toFixed(2)] }); return; }
    if (by === 'ls') { this.broadcast({ t: 'caught', id, ls: [+this.ls.x.toFixed(2), +this.ls.z.toFixed(2)] }); return; }
    if (by === 'sk') { this.broadcast({ t: 'caught', id, sk: [+this.sk.x.toFixed(2), +this.sk.z.toFixed(2)] }); return; }
    if (by === 'sd') { this.broadcast({ t: 'caught', id, sd: [+this.sd.x.toFixed(2), +this.sd.z.toFixed(2)] }); return; }
    if (by === 'db') { this.broadcast({ t: 'caught', id, db: [+this.db.x.toFixed(2), +this.db.z.toFixed(2)] }); return; }
    if (by === 'mc') { this.broadcast({ t: 'caught', id, mc: [+this.mc.x.toFixed(2), +this.mc.z.toFixed(2)] }); return; }
    if (by === 'mo') { this.broadcast({ t: 'caught', id, mo: [+this.mo.x.toFixed(2), +this.mo.z.toFixed(2)] }); return; }
    if (by === 'tr') { this.broadcast({ t: 'caught', id, tr: [+(this.tr.front() ?? 0).toFixed(2), +this.tr.zc.toFixed(2)] }); return; }
    this.mimic.shyT = 8; // it lets the others breathe for a moment
    this.mimic.state = 'wander';
    this.mimic.path = [];
    this.broadcast({ t: 'caught', id });
  },

  dropFuses(id) {
    const n = this.held.get(id) || 0;
    this.held.set(id, 0);
    const at = id === this.me ? this.p : this.remotes.get(id);
    if (!at) return;
    this.revival.dropped(id, at.x, at.z);
    if (this.obj.keyHolder === id) {
      this.obj.keyHolder = null;
      const pos = this.level.collide({ x: at.x, z: at.z }, 0.2);
      this.broadcast({ t: 'drop', kind: 'keycard', i: this.nextItem++, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) });
    }
    for (let k = 0; k < n; k++) {
      const pos = this.level.collide({ x: at.x + (Math.random() - 0.5) * 0.8, z: at.z + (Math.random() - 0.5) * 0.8 }, 0.2);
      this.broadcast({ t: 'drop', i: this.nextItem++, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) });
    }
  },

};
