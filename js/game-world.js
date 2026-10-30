// The world around you: its voice, fear and dread, ambience, the lights, doors, hunger, wearing the dead.
// Part of Game (game.js): these methods are mixed into Game.prototype.
import * as THREE from 'three';
import { rumble } from './controls.js';
import { clamp, angleDiff } from './game-shared.js';
import { plan, build } from './splice.js';

export const WorldPart = {
  // Host: feet showing under a curtain. If it wanders close and can see the curtain, it knows.
  checkCurtains() {
    const m = this.mimic;
    if (!['wander', 'investigate', 'stalk'].includes(m.state) || m.graceT > 0) return;
    for (const P of this.targets()) {
      const pr = P.hidden;
      if (pr?.kind === 'curtain' && Math.hypot(pr.x - m.x, pr.z - m.z) < 3 && this.level.los(m.x, m.z, pr.front.x, pr.front.z)) { m.huntHide(pr, P.id); return; }
    }
  },

  // How good it is at being you by now, 0..1: clumsy early on (the pitch off, the tape catching), cleaner as the
  // run goes on and the more it has practised.
  mimicSkill() { return clamp((this.time - 20) / 300 + this.lures * 0.025, 0, 1); },

  // The mimic (host) talks: everyone hears the same clip from it.
  mimicSpeaks(style, emitter, want = null, prefer = null) {
    const dead = (owner) => this.status.get(owner) === 'dead', c0 = (k) => k && this.mp?.clips.get(k);
    if (style === 'chorus') {
      if (!this.mp) {
        const bufs = [...new Set([0, 1, 2].map(() => this.voice.pick('chorus')).filter(Boolean))].map((c) => c.buffer);
        return bufs.length ? this.sfx.chorus(bufs, emitter) : this.sfx.whisper(emitter);
      }
      const keys = [...new Set([0, 1, 2].map(() => this.mp.pickKey(dead, null, 'chorus')).filter(Boolean))];
      keys.forEach((k) => this.recap.voice(k));
      this.broadcast({ t: 'say', keys, style });
      return 3;
    }
    this.ls.hear(this.mimic.x, this.mimic.z, 16, 'voice'); // its lures draw the listener too
    if (!this.mp) return this.localSpeak(style, emitter, want);
    const wearing = this.mimic.wearId;
    const key = this.mp.pickKey(dead, wearing || prefer, want || (wearing && style !== 'scream' ? 'lure' : style));
    this.recap.voice(key);
    const q = +this.mimicSkill().toFixed(2);
    if (c0(key)) this.gait.follow(c0(key).owner); // it walks like whoever it's pretending to be
    const say = { t: 'say', key, style: wearing && style !== 'scream' ? 'lure' : style, q };
    // Sometimes a sentence they never said, cut from their recordings (everyone builds it from the same plan).
    const c = key && this.mp.clips.get(key);
    if (c && style !== 'scream' && Math.random() < 0.4) {
      const more = [...this.mp.clips.keys()].filter((k) => k !== key && this.mp.clips.get(k).owner === c.owner).sort(() => Math.random() - 0.5).slice(0, 2);
      const keys = [key, ...more], p = more.length && plan(keys.map((k) => this.mp.clips.get(k).buffer), Math.random, q);
      if (p) {
        say.sp = { keys, p };
        this.broadcast(say);
        return p.reduce((t, s) => t + (s[2] - s[1] + s[6]) / s[3] + s[4], 0) / 0.98;
      }
    }
    this.broadcast(say);
    return c ? c.buffer.duration / (style === 'scream' ? 0.6 : 0.98) : 1.2;
  },

  // The mine: every voice comes back off the rock a moment later, from somewhere else, so you can't tell where it was.
  echoVoice(buffer, q = 1) {
    if (!this.level.theme.mine || !buffer) return;
    const c = this.camera.position, lv = this.level;
    const spot = lv.randomFloor((s) => { const d = Math.hypot(s.x - c.x, s.z - c.z); return d > 8 && d < 18; });
    if (!spot) return;
    const em = this.sfx.emitter();
    em.setPos(spot.x, 1.6, spot.z);
    em.setOcclusion(!lv.los(c.x, c.z, spot.x, spot.z));
    setTimeout(() => {
      if (this.state === 'ended') { em.dispose(); return; }
      const d = this.sfx.playVoice(buffer, em, 'distant', q);
      this.voice.suppress(d + 0.3);
      setTimeout(() => em.dispose(), (d + 3) * 1000);
    }, 220 + Math.random() * 220);
  },

  // A voice only I hear (the director's tricks, the jumpscare).
  localSpeak(style, emitter, want = null) {
    want ||= style;
    // Alone, your own voice is too obviously the mimic, so it disguises it: a stranger (pitched, over a
    // bad phone line), a sentence you never said (spliced from your recordings), or, in the story, Ellie.
    if (!this.mp && (style === 'lure' || style === 'distant') && this.voice.started && this.voice.clips.length) {
      const r = Math.random();
      if (this.story) { if (r < 0.7) style = this.story.voice || 'ellie'; }
      else if (r < 0.3) style = 'stranger';
      else if (r < 0.75 && this.voice.clips.length > 1) {
        const bufs = [...new Set([0, 1, 2].map(() => this.voice.pick(want)?.buffer).filter(Boolean))];
        const q = this.mimicSkill(), p = bufs.length > 1 && plan(bufs, Math.random, q);
        if (p) {
          const buf = build(this.sfx.ctx, p, bufs);
          const d = this.sfx.playVoice(buf, emitter, r < 0.45 ? 'stranger' : style, q);
          this.echoVoice(buf, q);
          this.voice.suppress(d + 0.3);
          this.lures++;
          this.recap.voice(null, buf);
          return d;
        }
      }
    }
    let buffer = null;
    if (this.mp) {
      const key = this.mp.pickKey((owner) => this.status.get(owner) === 'dead', null, want);
      buffer = key && this.mp.clips.get(key).buffer;
    } else buffer = (this.voice.started ? this.voice.pick(want) : null)?.buffer;
    if (!buffer) return this.sfx.whisper(emitter);
    const d = this.sfx.playVoice(buffer, emitter, style, this.mp ? 1 : this.mimicSkill());
    if (style === 'lure' || style === 'distant' || style === 'stranger') this.echoVoice(buffer, this.mp ? 1 : this.mimicSkill());
    this.voice.suppress(d + 0.3);
    this.lures++;
    if (!this.mp) this.recap.voice(null, buffer);
    return d;
  },

  updateVoice(dt) {
    const v = this.voice, hud = this.hud, p = this.p;
    hud.mic.classList.toggle('off', !v.started);
    if (!v.started) return;
    // What's going on while you talk, so it knows a scream from a chase or a whisper from a hiding spot.
    const m = this.mimic, md = Math.hypot(m.x - p.x, m.z - p.z);
    v.context = p.hidden ? 'hide' : (md < 14 && ['chase', 'hunt', 'transform'].includes(m.state)) || this.fear > 0.75 ? 'chase' : null;
    hud.micBar.style.width = `${v.meter * 100}%`;
    hud.micLine.style.left = `${v.thresholdPos * 100}%`;
    let heard = false;
    this.noiseT -= dt;
    if (v.hear > 0.05) {
      const radius = 4 + 18 * v.hear;
      heard = Math.hypot(this.mimic.x - p.x, this.mimic.z - p.z) <= radius;
      if (this.isHost || this.noiseT <= 0) { this.noise(radius, 'voice'); this.noiseT = 0.25; }
    }
    if (heard) this.heardT = 1.2;
    this.heardT = Math.max(0, (this.heardT || 0) - dt);
    hud.mic.classList.toggle('heard', this.heardT > 0);
    hud.micText.textContent = this.heardT > 0 ? 'it heard you' : '';
  },

  // Spotting it while it peeks: a sting and a lurch toward it.
  watchPeek() {
    const m = this.mimic;
    if (m.state !== 'peek') { this.peekSeen = false; return; }
    if (this.peekSeen) return;
    const c = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const dx = m.x - c.x, dz = m.z - c.z, d = Math.hypot(dx, dz);
    if (d > 0 && (fwd.x * dx + fwd.z * dz) / d > 0.95 && this.level.los(c.x, c.z, m.x, m.z)) {
      this.peekSeen = true;
      this.sfx.sting();
      this.zoomT = 1;
    }
  },

  updateFear(dt) {
    const p = this.p, m = this.mimic;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    const vis = this.level.los(p.x, p.z, m.x, m.z);
    let f = Math.max(clamp(1 - d / 12, 0, 1) * (vis ? 1 : 0.45), this.ls.nearness(p.x, p.z) * 0.8, this.sk.nearness(p.x, p.z) * 0.7, this.sd.nearness(p.x, p.z) * 0.8, this.db.nearness(p.x, p.z) * 0.8, this.mo.nearness(p.x, p.z) * 0.8, this.tr.nearness(p.x, p.z), this.mc.nearness(p.x, p.z) * 0.7, this.pt.nearness(p.x, p.z) * 0.8, this.swarm.nearness(p.x, p.z));
    if ((m.state === 'chase' || m.state === 'hunt') && (!this.mp || d < 25)) f = Math.max(f, 0.45);
    this.fear += (f - this.fear) * (1 - Math.exp(-dt * 3));
    this.hud.fear.style.opacity = (this.fear * 0.85).toFixed(3);
    this.hud.grain.style.opacity = (0.08 + this.fear * 0.18).toFixed(3);
    if (this.fear > 0.15) {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.sfx.heartbeat(this.fear); this.hbT = 1.1 - this.fear * 0.65; }
    }

    // Sound: a dread drone swells as it gets closer (even through walls), and the background
    // goes silent when it's near and quiet. A pounding pulse while it chases (you, online).
    const chasing = (m.state === 'chase' || m.state === 'hunt') && (!this.mp || m.targetId === this.me || d < 15);
    const near = Math.max(clamp(1 - d / 20, 0, 1), this.ls.nearness(p.x, p.z), this.mo.nearness(p.x, p.z));
    this.sfx.setDread(chasing ? 1 : near * near);
    this.sfx.setAmbient(d < 8 && !chasing ? 0.1 : 1);
    if (chasing) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.sfx.pulse(); this.pulseT = 0.43; }
      this.snarlT = (this.snarlT ?? 2) - dt;
      if (this.snarlT <= 0 && d < 25) { this.sfx.snarl(this.mimic.emitter); this.snarlT = 3 + Math.random() * 3; }
    }
    // Your own breathing: out of breath, or scared.
    const breath = Math.max(1 - p.stamina, this.fear * 1.2);
    if (breath > 0.3) {
      this.breathT -= dt;
      if (this.breathT <= 0) { this.sfx.playerBreath(Math.min(1, breath)); this.breathT = 1.7 - Math.min(1, breath) * 0.6; }
    }

    // The camcorder picture breaks up when it's close: more the closer it is, with sudden tears.
    if (vis && d < 8 && !this.settings.calm && Math.random() < dt * 1.8 * (1 - d / 8)) this.glitchT = 0.06 + Math.random() * 0.1;
    this.glitchT = Math.max(0, (this.glitchT || 0) - dt);
    const want = this.fear * 0.12 + (vis && d < 8 ? (1 - d / 8) * 0.15 : 0) + (this.glitchT > 0 ? 0.5 : 0);
    this.distort += ((this.settings.calm ? want * 0.4 : want) - this.distort) * Math.min(1, dt * (this.glitchT > 0 ? 30 : 5));

    // Being chased: start recording, in case it's the end (clip.js). Got away: throw it out.
    const chasingMe = (m.state === 'chase' || m.state === 'hunt') && (!this.mp || m.targetId === this.me) && d < 25 && !this.room;
    if (chasingMe) {
      this.chaseGoneT = 0;
      if (this.clip.stale) this.clip.stop(false);
      if (!this.clip.recording) this.clip.start();
    } else if (this.clip.recording && (this.chaseGoneT += dt) > 5) this.clip.stop(false);

    // Spotting it peeking: a quick dolly-zoom lurch toward it.
    if (this.zoomT > 0) {
      this.zoomT = Math.max(0, this.zoomT - dt * 0.9);
      this.camera.fov = this.settings.fov - 18 * Math.sin(Math.PI * this.zoomT);
      this.camera.updateProjectionMatrix();
    }
  },

  updateAmbient(dt) {
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 10 + Math.random() * 12;
    const p = this.level.randomFloor((q) => Math.hypot(q.x - this.p.x, q.z - this.p.z) > 10);
    if (!p) return;
    this.ambientEmitter.setPos(p.x, 1.5, p.z);
    this.ambientEmitter.setOcclusion(!this.level.los(this.p.x, this.p.z, p.x, p.z));
    if (Math.random() < 0.35 && this.sfx.moan(this.ambientEmitter)) return; // something, far off, moaning
    this.sfx.distant(this.level.theme.id, this.ambientEmitter);
  },

  updateLights(dt) {
    const t = this.t, th = this.level.theme, m = this.mimic, c = this.camera.position;
    for (const L of this.world.fixtures) {
      let lvl = 1;
      if ((L.broken && !this.power) || L.dead) lvl = 0;
      else {
        if (L.burst > 0) { L.burst -= dt; lvl = this.settings.calm ? 0.45 : Math.sin(t * 67 + L.seed) > 0.1 ? 1 : 0.1; } // (Fewer flashes: a dip, not a strobe)
        else if (L.flicker && Math.random() < dt * 0.3) L.burst = 0.15 + Math.random() * 0.9;
        // Lights stutter when it walks under them.
        if (L.burst <= 0 && Math.hypot(L.x - m.x, L.z - m.z) < 5 && Math.random() < dt * 2.5) L.burst = 0.25 + Math.random() * 0.5;
        if (this.power) lvl *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 4.5));
      }
      if (this.blackout > 0 && Math.hypot(L.x - this.p.x, L.z - this.p.z) < 18) lvl = 0;
      if (this.inc.dark() && !this.power) lvl = 0; // a power cut
      if (L.offUntil > t) lvl = 0; // put out by a scripted scare
      L.level = lvl;
      L.mat.emissiveIntensity = lvl * 1.5;
    }
    this.poolT -= dt;
    if (this.poolT <= 0) {
      this.poolT = 0.25;
      this.assigned = this.world.fixtures.filter((L) => (!L.broken || this.power) && !L.dead)
        .map((L) => ({ L, d: Math.hypot(L.x - c.x, L.z - c.z) })).sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length).map((e) => e.L);
    }
    this.pool.forEach((pl, i) => {
      const L = this.assigned[i];
      if (!L) { pl.intensity = 0; return; }
      pl.position.set(L.x, L.y, L.z);
      pl.color.setHex(this.power ? 0xff1828 : th.light);
      pl.intensity = L.level * th.lightIntensity * (this.power ? 1.3 : 1);
    });
  },

  // Real doors swing toward where they should be.
  updateDoors(dt) {
    for (const wd of this.world.idoors) {
      for (const l of wd.leaves) {
        const target = wd.door.open ? l.open : l.closed;
        l.pivot.rotation.y += angleDiff(target, l.pivot.rotation.y) * Math.min(1, dt * (wd.door.open ? 4 : 9));
      }
    }
  },

  // Host: every 150 s it gets hungrier (bolder, faster, chattier).
  updateHunger(dt) {
    if (this.story && !this.story.hunger) return;
    this.hungerT += dt;
    if (this.hungerT < 150 * this.diff.hunger || this.mimic.hunger >= 4) return;
    this.hungerT = 0;
    this.mimic.hunger++;
    this.mimic.aggro += 0.06;
  },

  // Everyone: each hunger stage kills two more lights, for good (same lights for everyone).
  applyHunger() {
    const h = this.mimic.hunger;
    if (h <= this.hungerSeen) return;
    for (let i = this.hungerSeen * 2; i < h * 2 && i < this.hungerOrder.length; i++) this.world.fixtures[this.hungerOrder[i]].broken = true;
    this.hungerSeen = h;
    this.sfx.rumble(2.5);
    this.sfx.clank(this.ambientEmitter, 0.6);
  },

  // Host, online: when it goes stalking, it sometimes wears someone it took.
  updateWear() {
    const m = this.mimic;
    if (m.state === 'stalk' && this.prevMimicState !== 'stalk' && !m.wearId) {
      const dead = this.order.filter((id) => this.status.get(id) === 'dead' && this.remotes.has(id));
      if (dead.length && Math.random() < 0.55) m.wear(dead[Math.floor(Math.random() * dead.length)]);
    }
    if (m.wearId && ['chase', 'hunt', 'sniff', 'stunned', 'transform', 'peek'].includes(m.state)) m.unwear();
    this.prevMimicState = m.state;
  },

};
