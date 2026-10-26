// Personal scares: each runs on one player's own browser, for them alone.
//   talk back    you finish saying something; it answers, with your own words, from nearby
//   the body     someone lying on the floor... later standing in a corner, facing the wall... then gone
//   mirrors      it's standing behind you in the mirror (turn around: nothing. Usually.)
//   fake locker  one hiding spot is it: mash E to tear yourself out
//   tapes        recordings from people who came before
import * as THREE from 'three';
import { RemotePlayer } from './remote.js';
import { buildModel } from './mimic.js';
import { LORE } from './lore.js';
import { tapeId, preload, recording } from './voices.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class Scares {
  constructor(game) {
    const g = this.g = game, lv = game.level, sfx = game.sfx;
    this.replyEm = sfx.emitter();
    this.talkCd = 20; this.inUtt = false; this.uttStart = 0; this.lastLoud = 0; this.replyT = -1;
    this.body = null; this.bodyCd = rand(70, 130);
    this.mirrorDone = new Set(); this.ghost = null; this.lookT = 0;
    this.qte = null;
    this.tape = null;
    this.twitchT = 2;
    // The fake locker breathes, very quietly.
    this.fake = lv.props.find((p) => p.fake) || null;
    if (this.fake) {
      this.fakeEm = sfx.emitter();
      this.fakeEm.input.gain.value = 0.3;
      this.fakeEm.setPos(this.fake.x, 1.2, this.fake.z);
      this.fakeBreath = sfx.breath(this.fakeEm);
    }
    // Cassettes are only ever played locally, but their items share the list (same order for everyone).
    game.world.lore.forEach((l, i) => game.items.push({ type: 'lore', i, n: l.n, x: l.x, y: 0.05, z: l.z, mesh: l.mesh, range: 2, active: true }));
    // Recorded voices for this level's tapes, if anyone has recorded them (voices.js).
    game.world.lore.forEach((l, i) => {
      const id = tapeId(game.story, i, l.n), entry = game.story ? game.story.tapes[i] : LORE[l.n % LORE.length];
      preload(id, sfx.ctx);
      entry?.lines.forEach((_, k) => preload(`${id}-${k + 1}`, sfx.ctx)); // or one file per line
    });
    this.el = {
      lore: document.getElementById('lore'), loreWho: document.getElementById('loreWho'), loreLine: document.getElementById('loreLine'),
      qte: document.getElementById('qte'), qteBar: document.querySelector('#qte i'),
    };
  }

  dispose() {
    this.replyEm.dispose();
    this.fakeBreath?.stop();
    this.phoneEm?.dispose();
    this.fakeEm?.dispose();
    this.body?.dispose();
    this.ghost?.removeFromParent();
    this.el.lore.hidden = true;
    this.el.qte.hidden = true;
  }

  prompt(it) {
    if (it.type === 'lore') return it.heard ? 'Play the tape again' : 'Play the tape';
    return undefined;
  }

  interact(it) {
    if (it.type !== 'lore') return false;
    this.play(it);
    return true;
  }

  // ---------- tapes ----------
  play(it) {
    const g = this.g;
    const entry = g.story ? g.story.tapes[it.i] : LORE[it.n % LORE.length];
    it.heard = true;
    g.updateObjective();
    const id = tapeId(g.story, it.i, it.n);
    const lines = entry.lines.map((l, k) => {
      const text = typeof l === 'string' ? l : l.text;
      const shown = typeof l === 'object' && l.by ? `${l.by}: ${text}` : text; // two voices on a tape: say who
      const buf = recording(`${id}-${k + 1}`);                             // that line, recorded on its own
      return { text: shown, own: typeof l === 'object' && l.playerClip, buf, dur: buf ? buf.duration + 0.45 : Math.max(2.4, text.length * 0.065) };
    });
    // A real recording of the whole tape: the subtitles share its length out by how long each line is (your own voice comes after it).
    const rec = recording(id);
    if (rec) {
      const spoken = lines.filter((l) => !l.own), chars = spoken.reduce((a, l) => a + l.text.length, 0) || 1;
      for (const l of spoken) { l.dur = (rec.duration * l.text.length) / chars; l.buf = null; }
    }
    const perLine = !rec && lines.some((l) => l.buf);
    const total = lines.reduce((a, l) => a + l.dur, 0);
    this.tape = { lines, i: -1, t: 0, next: 0.6 };
    this.el.loreWho.textContent = entry.who;
    this.el.loreLine.textContent = '';
    this.el.lore.hidden = false;
    g.sfx.click();
    if (rec) { g.sfx.tapeHiss(rec.duration + 1); setTimeout(() => { const d = g.sfx.playVoice(rec, null, 'tape'); g.voice.suppress(d + 0.5); }, 600); }
    else if (perLine) g.sfx.tapeHiss(total + 1); // each line plays as it comes up (updateTape)
    else g.sfx.tapeVoice(total + 0.6);
    g.noise(6, 'step'); // a tape player isn't quiet
  }

  updateTape(dt) {
    const tp = this.tape;
    if (!tp) return;
    tp.t += dt;
    if (tp.t < tp.next) return;
    tp.i++;
    if (tp.i >= tp.lines.length) { this.tape = null; this.el.lore.hidden = true; return; }
    const line = tp.lines[tp.i];
    this.el.loreLine.textContent = line.text;
    if (line.buf) { const d = this.g.sfx.playVoice(line.buf, null, 'tape'); this.g.voice.suppress(d + 0.5); }
    if (line.own) this.g.playOwnVoice(); // the tape has your voice on it
    tp.next = tp.t + line.dur;
  }

  // ---------- the fake locker ----------
  // Called when I climb into a hiding spot. True if it was a trap.
  trap(prop) {
    if (!prop.fake) return false;
    const g = this.g;
    this.qte = { t: 0, got: 0, need: 7, limit: 1.9, prop };
    this.el.qte.hidden = false;
    this.el.qteBar.style.width = '0%';
    g.sfx.bite();
    g.sfx.screech();
    g.hud.flash.classList.remove('hit');
    void g.hud.flash.offsetWidth;
    g.hud.flash.classList.add('hit');
    return true;
  }

  // E while trapped. True if used.
  onKey(code) {
    if (!this.qte || code !== 'KeyE') return false;
    this.qte.got++;
    this.el.qteBar.style.width = `${Math.min(100, (this.qte.got / this.qte.need) * 100)}%`;
    if (this.qte.got >= this.qte.need) this.endTrap(true);
    return true;
  }

  updateTrap(dt) {
    if (!this.qte) return;
    this.qte.t += dt;
    const g = this.g;
    g.p.yaw += (Math.random() - 0.5) * 0.05; // it's shaking you
    if (this.qte.t > this.qte.limit) this.endTrap(false);
  }

  endTrap(free) {
    const g = this.g, q = this.qte;
    this.qte = null;
    this.el.qte.hidden = true;
    if (free) {
      g.exitHide();
      g.toast('You tore yourself out of it.');
      g.sfx.sting();
      g.noise(15, 'step');
      g.send({ t: 'fakeDone', p: g.level.props.indexOf(q.prop) });
    } else g.send({ t: 'trapped' });
  }

  // The fake locker gave itself away: it's just a locker now (for everyone).
  fakeGone(prop) {
    prop.fake = false;
    if (prop === this.fake) { this.fakeBreath?.stop(); this.fakeBreath = null; }
  }

  // ---------- talking back ----------
  updateTalkBack(dt) {
    const g = this.g, v = g.voice;
    this.talkCd -= dt;
    if (!v.started) return;
    if (v.talking) {
      if (!this.inUtt) { this.inUtt = true; this.uttStart = g.t; }
      this.lastLoud = g.t;
    } else if (this.inUtt && g.t - this.lastLoud > 0.6) {
      this.inUtt = false;
      const said = this.lastLoud - this.uttStart;
      const m = g.mimic;
      if (said > 0.5 && this.talkCd <= 0 && Math.random() < 0.35 && !['chase', 'hunt', 'sniff'].includes(m.state)) {
        this.replyT = rand(0.8, 1.6);
        this.talkCd = rand(30, 50);
      }
    }
    if (this.replyT > 0) {
      this.replyT -= dt;
      if (this.replyT <= 0) {
        const p = g.p, lv = g.level;
        const q = lv.randomFloor((s) => { const d = Math.hypot(s.x - p.x, s.z - p.z); return d > 5 && d < 10 && !lv.los(s.x, s.z, p.x, p.z); });
        if (q) {
          this.replyEm.setPos(q.x, 1.6, q.z);
          this.replyEm.setOcclusion(true);
          g.localSpeak('lure', this.replyEm);
        }
      }
    }
  }

  // ---------- the body ----------
  // Online it's someone it took; alone, someone who came before.
  updateBody(dt) {
    const g = this.g, p = g.p, lv = g.level;
    if (!this.body) {
      this.bodyCd -= dt;
      if (this.bodyCd > 0) return;
      const dead = g.order.filter((id) => g.status.get(id) === 'dead' && id !== g.me);
      if (g.mp && !dead.length) { this.bodyCd = 30; return; }
      const idx = g.mp ? g.order.indexOf(dead[Math.floor(Math.random() * dead.length)]) : Math.floor(Math.random() * 4);
      const q = lv.randomFloor((s) => {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        return d > 8 && d < 15 && !lv.los(s.x, s.z, p.x, p.z) && lv.roomId[lv.cellOf(s.z) * lv.N + lv.cellOf(s.x)] >= 0;
      });
      if (!q) { this.bodyCd = 10; return; }
      const r = new RemotePlayer(g.scene, g.sfx, idx);
      r.torch.intensity = 0;
      r.root.position.set(q.x, 0.14, q.z);
      r.root.rotation.set(-Math.PI / 2, Math.random() * Math.PI * 2, 0);
      r.root.visible = true;
      this.body = { r, stage: 1, seen: false, away: 0, x: q.x, z: q.z, dispose: () => r.dispose() };
      return;
    }
    const b = this.body;
    const c = g.camera.position, fwd = g.camera.getWorldDirection(new THREE.Vector3());
    const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
    const visible = d < 13 && lv.los(c.x, c.z, b.x, b.z);
    if (visible && (fwd.x * dx + fwd.z * dz) / d > 0.7) b.seen = true;
    if (b.stage === 2 && visible && d < 2.6 && !b.turned) { // it turns its head all the way round
      b.turned = true;
      b.r.head.rotation.y = Math.PI * 0.9;
      g.sfx.sting();
    }
    if (!b.seen || visible) { b.away = 0; return; }
    b.away += dt;
    if (b.stage === 1 && b.away > 12) {
      // Now it's standing in a corner of a room nearby, facing the wall.
      const q = lv.randomFloor((s) => {
        const dd = Math.hypot(s.x - p.x, s.z - p.z);
        return dd > 6 && dd < 13 && !lv.los(s.x, s.z, p.x, p.z) && lv.roomId[lv.cellOf(s.z) * lv.N + lv.cellOf(s.x)] >= 0;
      });
      if (!q) return;
      const cx = lv.cellOf(q.x), cz = lv.cellOf(q.z);
      const wall = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([wx, wz]) => lv.blocksMove(cx + wx, cz + wz)) || [0, 1];
      b.x = (cx + 0.5) * 2 + wall[0] * 0.6; b.z = (cz + 0.5) * 2 + wall[1] * 0.6;
      b.r.root.position.set(b.x, 0, b.z);
      b.r.root.rotation.set(0, Math.atan2(-wall[0], -wall[1]), 0);
      b.stage = 2; b.seen = false; b.away = 0;
    } else if (b.stage === 2 && b.away > 8) {
      b.dispose();
      this.body = null;
      this.bodyCd = rand(120, 200);
    }
  }

  // ---------- mirrors ----------
  updateMirrors(dt) {
    const g = this.g, c = g.camera.position, fwd = g.camera.getWorldDirection(new THREE.Vector3());
    for (const [i, m] of g.world.mirrors.entries()) {
      const dx = m.x - c.x, dz = m.z - c.z, d = Math.hypot(dx, dz);
      m.glass.visible = d < 9 && g.level.los(c.x, c.z, m.x - m.nx * 0.2, m.z - m.nz * 0.2); // reflections are expensive
      if (this.ghost || this.mirrorDone.has(i) || g.state !== 'playing' || g.p.hidden) continue;
      const facing = d < 3.4 && (fwd.x * dx + fwd.z * dz) / d > 0.85 && (m.nx * -dx + m.nz * -dz) / d > 0.5;
      if (!facing) continue;
      this.lookT += dt;
      if (this.lookT < 0.7) continue;
      this.lookT = 0;
      this.mirrorDone.add(i);
      if (Math.random() > 0.65) continue;
      const bx = c.x - (dx / d) * 1.4, bz = c.z - (dz / d) * 1.4;
      const mm = g.mimic;
      // Sometimes it's really there.
      if (g.isHost && !g.hunt.on && Math.random() < 0.25 && mm.graceT <= 0 && !['chase', 'hunt', 'sniff', 'transform'].includes(mm.state)) {
        mm.x = bx; mm.z = bz; mm.yaw = Math.atan2(c.x - bx, c.z - bz);
        mm.state = 'stalk'; mm.path = []; mm.wait = 3; mm.ceiling = false; mm.unwear();
        continue;
      }
      const model = buildModel();
      model.root.position.set(bx, 0, bz);
      model.root.rotation.y = Math.atan2(c.x - bx, c.z - bz);
      model.torso.rotation.x = 0.4;
      model.head.rotation.z = 0.5;
      model.eyeMat.emissiveIntensity = 5; // two points of light in the glass
      model.eyes.forEach((e) => e.scale.setScalar(3));
      g.scene.add(model.root);
      this.ghost = { root: model.root, t: 0, x: bx, z: bz };
    }
    // Turn around: there's nothing there.
    if (this.ghost) {
      const gh = this.ghost;
      gh.t += dt;
      const dx = gh.x - c.x, dz = gh.z - c.z, d = Math.hypot(dx, dz) || 1;
      if ((fwd.x * dx + fwd.z * dz) / d > 0.3 || gh.t > 5) {
        gh.root.removeFromParent();
        this.ghost = null;
      }
    }
  }

  // Decoys twitch now and then: the only tell.
  updateDecoys(dt) {
    this.twitchT -= dt;
    if (this.twitchT > 0) return;
    this.twitchT = rand(2, 5);
    for (const it of this.g.items) if (it?.fake && it.active && it.mesh) it.mesh.rotation.y += (Math.random() - 0.5) * 0.6;
  }

  update(dt) {
    const g = this.g;
    this.updateTape(dt);
    this.updateMirrors(dt);
    if (g.state !== 'playing') return;
    this.updateTrap(dt);
    this.updateTalkBack(dt);
    this.updateBody(dt);
    this.updateDecoys(dt);
    this.updateMannequins(dt);
    this.updatePA(dt);
    this.updatePhone(dt);
  }

  // The hotel: a phone rings in a room nearby. It stops before you get there. Mostly.
  updatePhone(dt) {
    const g = this.g;
    if (g.level.theme.id !== 'hotel' || g.power) return;
    this.phoneT = (this.phoneT ?? 60 + Math.random() * 40) - dt;
    if (this.phoneT > 0) return;
    this.phoneT = 100 + Math.random() * 80;
    const at = g.level.randomFloor((q) => { const d = Math.hypot(q.x - g.p.x, q.z - g.p.z); return d > 7 && d < 15; });
    if (!at) return;
    this.phoneEm ||= g.sfx.emitter();
    this.phoneEm.setPos(at.x, 0.8, at.z);
    this.phoneEm.setOcclusion(!g.level.los(g.p.x, g.p.z, at.x, at.z));
    const d = g.sfx.phone(this.phoneEm);
    // Someone picks it up. It's you, saying hello.
    setTimeout(() => { if (g.state === 'playing' && Math.random() < 0.6) g.localSpeak('distant', this.phoneEm); }, (d + 0.5) * 1000);
  }

  // The school's PA: a chime, then your own voice over the speakers, far away.
  updatePA(dt) {
    const g = this.g;
    if (g.level.theme.id !== 'school' || g.power) return;
    this.paT = (this.paT ?? 70 + Math.random() * 40) - dt;
    if (this.paT > 0) return;
    this.paT = 110 + Math.random() * 70;
    const wait = g.sfx.chime();
    setTimeout(() => { if (g.state === 'playing') g.localSpeak('distant', null); }, wait * 1000);
  }

  // The mall's mannequins: when you aren't looking, one turns a little more toward you, or tilts its head.
  updateMannequins(dt) {
    const g = this.g;
    this.manT = (this.manT ?? 1) - dt;
    if (this.manT > 0) return;
    this.manT = 0.5;
    const c = g.camera.position, fwd = g.camera.getWorldDirection(this.fwd ||= new THREE.Vector3());
    for (const pr of g.level.props) {
      const mq = pr.mesh?.userData.mannequin;
      if (!mq) continue;
      const dx = pr.x - c.x, dz = pr.z - c.z, d = Math.hypot(dx, dz);
      if (d > 14 || d < 1.5) continue;
      const watched = (fwd.x * dx + fwd.z * dz) / d > 0.45 && g.level.los(c.x, c.z, pr.x, pr.z);
      if (watched || Math.random() > (d < 6 ? 0.12 : 0.05)) continue;
      const want = Math.atan2(-dx, -dz) - pr.mesh.rotation.y; // face the camera
      const diff = Math.atan2(Math.sin(want - mq.body.rotation.y), Math.cos(want - mq.body.rotation.y));
      mq.body.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), 0.6);
      mq.head.rotation.z = (Math.random() - 0.5) * 0.7;
      if (d < 7) g.sfx.creak(null, 0.05);
    }
  }
}
