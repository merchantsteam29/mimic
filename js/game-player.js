// You: moving, the camera, the flashlight, using things, hiding, the power and the HUD.
// Part of Game (game.js): these methods are mixed into Game.prototype.
import * as THREE from 'three';
import { WALL_H, STEP_CARRY } from './level.js';
import { keyLabel, rumble } from './controls.js';
import { nameTag } from './remote.js';
import { EYE, EYE_CROUCH, PLAYER_R, BATTERY_LIFE, clamp, angleDiff } from './game-shared.js';

export const PlayerPart = {
  updatePlayer(dt) {
    const p = this.p, k = this.keys;
    if (p.hidden) {
      // Peeking out through the slats: limited look, no movement.
      const dy = angleDiff(p.yaw, p.hideYaw);
      if (Math.abs(dy) > 0.7) p.yaw = p.hideYaw + Math.sign(dy) * 0.7;
      p.pitch = clamp(p.pitch, -0.5, 0.5);
      p.speed = 0;
      return;
    }
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (this.stick) { f = clamp(f - this.stick.y, -1, 1); s = clamp(s + this.stick.x, -1, 1); }
    const push = Math.min(1, Math.hypot(f, s)); // a half-pushed stick walks slower
    p.crouch = k.has('KeyC');
    const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && (f || s) && f >= 0 && !p.crouch && !p.tired;

    if (sprint) {
      p.stamina -= dt / this.ab.staminaTime;
      if (p.stamina <= 0) { p.stamina = 0; p.tired = true; }
    } else {
      p.stamina = Math.min(1, p.stamina + dt / (p.tired ? this.ab.recover * 1.4 : this.ab.recover));
      if (p.tired && p.stamina > 0.25) p.tired = false;
    }

    const speed = (p.crouch ? 1.4 : sprint ? this.ab.sprint : 2.7 * (this.ab.boostT > 0 ? 1.25 : 1)) * this.marks.slow(p.x, p.z) * this.ab.walk;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx *= push / wl; wz *= push / wl; }
    const a = 1 - Math.exp(-dt * 12);
    p.vx += (wx * speed - p.vx) * a;
    p.vz += (wz * speed - p.vz) * a;
    const pos = this.level.collide({ x: p.x + p.vx * dt, z: p.z + p.vz * dt }, PLAYER_R);
    p.speed = Math.hypot(pos.x - p.x, pos.z - p.z) / dt;
    p.x = pos.x; p.z = pos.z;

    if (p.speed > 0.3) {
      const prev = p.bob;
      p.bob += dt * p.speed * 2.3;
      if (Math.floor(prev / Math.PI) !== Math.floor(p.bob / Math.PI)) this.footstep();
    }
    p.eye += ((p.crouch ? EYE_CROUCH : EYE) - p.eye) * (1 - Math.exp(-dt * 10));

    this.hud.stamina.classList.toggle('on', p.stamina < 0.99);
    this.hud.stamina.classList.toggle('tired', p.tired);
    this.hud.staminaBar.style.width = `${p.stamina * 100}%`;

    const ex = this.level.exit;
    if (this.level.exitOpen && this.level.cellOf(p.x) === ex.wx && this.level.cellOf(p.z) === ex.wz) {
      if (!this.mp) this.end(true);
      else if (!this.escapeSent) { this.escapeSent = true; this.send({ t: 'escaped' }); }
    }
  },

  footstep() {
    const p = this.p;
    const run = p.speed > 4;
    const surface = this.level.surfaceAt(p.x, p.z);
    this.sfx.footstep(null, { vol: p.crouch ? 0.3 : run ? 1.1 : 0.65, surface });
    const wet = this.marks.splash(p.x, p.z); // wading: every step splashes
    this.noise((p.crouch ? 1 : run ? this.ab.sprintNoise : 3) * this.inc.stepScale * this.fair.stepScale * (wet ? 1.6 : STEP_CARRY[surface] || 1) * this.ab.stepMul, 'step');
    if (this.ab.id === 'mechanic' && !p.crouch) this.sfx.clink(); // the tools on their belt
  },

  // Something the mimic might hear, at my position.
  noise(radius, kind) {
    const p = this.p;
    if (this.tr.masking()) return; // a train going by drowns everything
    if (this.isHost) {
      if (kind === 'voice' && p.hidden && Math.hypot(this.mimic.x - p.x, this.mimic.z - p.z) < Math.min(radius, 8)) this.mimic.foundHidden(p.hidden, this.me);
      else this.mimic.hear(p.x, p.z, radius, kind);
      this.hunt.heard(p.x, p.z, radius);
      this.ls.hear(p.x, p.z, radius, kind, this.me);
    } else this.send({ t: 'noise', x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +radius.toFixed(1), k: kind });
  },

  updateCamera() {
    const c = this.camera;
    if (this.state === 'spectate') {
      const r = this.specTarget();
      if (this.freeCam) { const f = this.freeCam; c.position.set(f.x, f.y, f.z); c.rotation.set(f.pitch, f.yaw, 0); }
      else if (r) { c.position.set(r.x, r.eye, r.z); c.rotation.set(r.pitch, r.yaw, 0); }
      return;
    }
    const p = this.p;
    const k = Math.min(1, p.speed / 3);
    c.position.set(p.x, p.eye + (Math.abs(Math.sin(p.bob)) * 0.06 - 0.03) * k, p.z);
    c.rotation.set(p.pitch, p.yaw, Math.sin(p.bob) * 0.008 * k);
    if (this.state === 'caught') {
      const shake = 0.04 * Math.max(0, 1 - this.ct / 1.6);
      c.rotation.x += (Math.random() - 0.5) * shake;
      c.rotation.y += (Math.random() - 0.5) * shake;
    }
  },

  toggleFlash() {
    if (this.p.hidden || this.lan.noFlash()) return;
    this.p.flashOn = !this.p.flashOn;
    this.sfx.click();
  },

  updateFlash(dt) {
    const p = this.p;
    let on = !this.hunt.me && ((p.flashOn && p.battery > 0 && !p.hidden && !this.lan.on) || this.state === 'caught');
    if (this.state === 'spectate') on = !!this.specTarget()?.flash;
    if (on && this.state === 'playing') p.battery = Math.max(0, p.battery - (dt * 100) / (BATTERY_LIFE * this.diff.battery * this.ab.flashMul));
    let I = on ? (this.state === 'caught' ? 20 : 42) : 0; // a little dimmer in its face, so it isn't washed out
    if (this.state === 'caught' && this.scare === 'dark') { // the light dies, then stutters back on with it in your face
      if (this.ct < 0.85) I = 0;
      else if (this.ct < 1.15 && Math.random() < 0.5) I = 0;
    }
    if (this.blackout > 0 && this.state === 'playing') {
      const since = this.blackoutTotal - this.blackout;
      if (since < 1.8) I = 0;
      else if (since < 2.6 && Math.random() < 0.5) I *= 0.2;
    }
    if (on && p.battery < 15 && this.state === 'playing' && Math.random() < 0.06) I *= 0.15; // dying battery
    this.flash.intensity = I;
    const c = this.camera;
    const fwd = c.getWorldDirection(new THREE.Vector3());
    this.flashDir.lerp(fwd, 1 - Math.exp(-dt * 16)).normalize();
    this.hand.update(dt, { yaw: p.yaw, pitch: p.pitch, bob: p.bob, speed: p.speed, fear: Math.min(1, this.fear + this.ab.shaky), on: on && I > 0, visible: this.state === 'playing' && !p.hidden && !this.hunt.me && !this.lan.on });
    this.flash.position.copy(this.state === 'playing' && !p.hidden ? this.hand.lensWorld(new THREE.Vector3()) : c.localToWorld(new THREE.Vector3(0.12, -0.12, 0.05)));
    this.flash.target.position.copy(this.flash.position).addScaledVector(this.flashDir, 5);
    this.hud.batteryBar.style.width = `${p.battery}%`;
    this.hud.battery.classList.toggle('low', p.battery < 20);
  },

  // ---------- interaction ----------
  updateFocus() {
    const p = this.p;
    if (p.hidden) { this.focus = { type: 'unhide' }; this.setPrompt('Leave hiding spot'); return; }
    const c = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestDot = 0;
    for (const it of this.items) {
      if (!it?.active || it.pending > this.t) continue;
      const dx = it.x - c.x, dy = it.y - c.y, dz = it.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d > it.range) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      const need = ['fuse', 'battery', 'recorder', 'lifetape', 'throwable'].includes(it.type) ? 0.86 : 0.72;
      // (A shut door blocks sight of itself, so doors skip the line-of-sight check.)
      if (dot < need || dot < bestDot || (it.type !== 'idoor' && !this.level.los(c.x, c.z, it.x, it.z))) continue;
      best = it; bestDot = dot;
    }
    this.focus = best;
    let custom = best && (this.obj.prompt(best) ?? this.esc.prompt(best) ?? this.cl.prompt(best) ?? this.lan.prompt?.(best) ?? this.scares.prompt(best));
    if (best?.type === 'idoor') custom = this.level.idoors[best.i].open ? 'Close door' : 'Open door';
    if (custom !== undefined) { this.setPrompt(custom); return; }
    const text = {
      fuse: 'Pick up fuse',
      battery: 'Take battery',
      recorder: 'Pick up tape recorder',
      throwable: { bottle: 'Pick up bottle', can: 'Pick up can', camera: 'Pick up camera' }[best?.kind],
      lifetape: best?.owner ? `Pick up ${this.nameOf(best.owner)}'s tape` : '',
      fusebox: this.revival.prompt() || (this.fusesHeld && this.fusesIn < 4 ? `Insert fuse${this.fusesHeld > 1 ? 's' : ''} (${this.fusesHeld})` : this.obj.allDone() ? 'Restore power' : 'Power panel') + this.traitor.panelHint(),
      hide: { bed: 'Hide under the bed', vent: 'Crawl into the vent', curtain: 'Hide behind the curtain' }[best?.prop?.kind] || 'Hide',
      exit: 'Open exit',
    }[best?.type];
    this.setPrompt(text);
  },

  setPrompt(text) {
    if (text) this.hud.prompt.innerHTML = `<kbd>${keyLabel('E')}</kbd>${text}`;
    this.hud.prompt.classList.toggle('on', !!text);
  },

  interact() {
    const f = this.focus;
    if (!f || this.obj.interact(f) || this.esc.interact(f) || this.cl.interact(f) || this.lan.interact?.(f) || this.scares.interact(f)) return;
    if (f.type === 'idoor') { this.send({ t: 'door', i: f.i }); return; }
    switch (f.type) {
      case 'unhide': this.exitHide(); break;
      case 'fuse':
      case 'battery':
      case 'recorder':
      case 'lifetape':
      case 'throwable':
        if (f.type === 'recorder' && this.rec.phase !== 'none') { this.toast('You already have one.'); break; }
        if (f.type === 'throwable' && this.thr.held) { this.toast('Your hands are full.'); break; }
        f.pending = this.t + 1; // the host confirms (instantly when alone)
        this.send({ t: 'take', i: this.items.indexOf(f) });
        break;
      case 'fusebox':
        if (this.revival.carry) { this.send({ t: 'revive' }); break; }
        if (this.ns.on) { this.sfx.denied(); this.toast('The power stays off on the night shift. Hold on until 6 a.m.'); break; }
        if (this.hs.on) { this.sfx.denied(); this.toast('No power, no way out. Just hide.'); break; }
        if (this.fusesHeld && this.fusesIn < 4) { this.send({ t: 'insert' }); break; }
        if (this.obj.allDone()) { this.send({ t: 'lever' }); break; }
        this.sfx.denied();
        this.toast(this.missing());
        break;
      case 'hide': this.enterHide(f.prop); break;
      case 'exit':
        this.sfx.denied();
        this.toast(this.ns.on ? 'Chained shut until 6 a.m.' : this.hs.on ? 'Chained shut. Just hide.' : 'It won\'t open. There\'s no power.');
        break;
    }
  },

  enterHide(prop) {
    const p = this.p;
    p.hidden = prop;
    p.hideFrom = { x: p.x, z: p.z };
    p.hideYaw = Math.atan2(prop.dx, prop.dz); // look out of the front
    p.yaw = p.hideYaw; p.pitch = 0;
    p.x = prop.x; p.z = prop.z;
    p.vx = p.vz = 0;
    p.eye = { bed: 0.17, vent: 0.32, curtain: 1.55 }[prop.kind] ?? 1.5;
    this.hud.locker.dataset.kind = prop.kind || 'box';
    this.hud.locker.hidden = false;
    if (prop.kind === 'vent') { this.sfx.clank(null, 0.7); this.noise(12, 'step'); } // the grate is loud
    else if (prop.kind !== 'curtain') this.sfx.creak(null, 0.25);
    this.sfx.cloth();
    if (this.scares.trap(prop)) return; // it was it
    if (this.tut.holds) return; // the tutorial stages this one itself
    this.events.onHide();
    if (this.isHost) this.mimic.notifyHide(prop, this.playerInfo());
  },

  exitHide(silent = false) {
    const p = this.p, prop = p.hidden;
    if (!prop) return;
    p.hidden = null;
    p.x = prop.front.x; p.z = prop.front.z;
    this.hud.locker.hidden = true;
    if (!silent && prop.kind === 'vent') { this.sfx.clank(null, 0.7); this.noise(12, 'step'); }
    else if (!silent) this.sfx.creak(null, 0.25);
  },

  powerOn(by) {
    if (this.power) return;
    this.power = true;
    this.vs.powered(by);
    this.items.find((i) => i?.type === 'exit').active = !!this.esc?.lift; // (a lift: call it at the exit)
    this.items.find((i) => i?.type === 'fusebox').active = false;
    for (const L of this.world.fixtures) L.mat.emissive.setHex(0xff1020);
    if (this.state === 'playing' || this.state === 'spectate') { this.sfx.alarm(); this.sfx.rumble(3.2); }
    if (!this.esc?.lift) this.doorT = 0;
    if (this.state === 'playing') this.toast(this.esc?.lift ? 'Power restored. Now call the lift.' : 'Power restored');
    this.updateObjective();
    if (this.isHost) {
      const ts = this.targets();
      const P = ts.find((q) => q.id === by) || ts[0];
      if (P) this.mimic.enrage(P);
    }
  },

  updateDoor(dt) {
    if (this.doorT < 0 || this.doorT > 3) return;
    this.doorT += dt;
    const k = Math.min(1, this.doorT / 3);
    this.world.door.position.y = WALL_H / 2 + k * (WALL_H - 0.25);
    this.world.sign.position.y = WALL_H - 0.3 + k * (WALL_H - 0.25);
    if (this.doorT > 2.2) this.level.exitOpen = true;
  },

  // The camcorder overlay: timestamp (it's 2:13 a.m. when you go in), tape counter, battery; and the HUD's visibility.
  updateCam(dt) {
    this.peekHud = Math.max(0, this.peekHud - dt);
    this.hud.root.classList.toggle('reveal', this.tabDown || this.peekHud > 0);
    const sec = Math.floor(this.time);
    if (sec !== this.camSec) {
      this.camSec = sec;
      const clock = 2 * 3600 + 13 * 60 + 7 + sec, h = Math.floor(clock / 3600) % 12 || 12;
      const two = (n) => String(n).padStart(2, '0');
      this.hud.camStamp.textContent = this.ns.on ? this.ns.stamp() : `OCT 25 2026\n${two(h)}:${two(Math.floor(clock / 60) % 60)}:${two(clock % 60)} AM`;
      this.hud.camCounter.textContent = `SP ▶ ${Math.floor(sec / 3600)}:${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)}`;
    }
    this.hud.camBat.style.width = `calc(${this.p.battery}% - 6px)`;
    this.hud.camBatBox.classList.toggle('low', this.p.battery < 20);
  },

  updateObjective() {
    this.peekHud = Math.max(this.peekHud, 4); // something changed: show the HUD for a moment
    const o = this.hud.objective;
    o.classList.toggle('alarm', this.power);
    if (this.power) { o.textContent = this.esc?.powerLine() || 'THE EXIT IS OPEN. RUN.'; return; }
    if (!this.obj) return;
    const lines = [];
    if (this.ns?.on || this.hs?.on) { // the night shift, hide and seek: nothing to do but last
      o.textContent = [this.hs?.on ? this.hs.line() : this.ns.line(), this.rec?.line(), this.thr?.line()].filter(Boolean).join('\n');
      return;
    }
    if (this.level.tasks.fuses) {
      lines.push(`Fuses found  ${this.fusesFound}/4  ·  in the panel  ${this.fusesIn}/4`);
      if (this.mp && this.fusesHeld) lines.push(`Carrying  ${this.fusesHeld}`);
    }
    lines.push(...this.obj.lines(), ...(this.esc?.lines() || []));
    if (this.rec?.line()) lines.push(this.rec.line());
    if (this.thr?.line()) lines.push(this.thr.line());
    if (this.vs?.line()) lines.unshift(this.vs.line());
    if (this.obj.allDone()) lines.push('Restore power at the panel');
    o.textContent = lines.join('\n');
  },

  // Name tags over friends (Settings > Name tags, off by default): faint, and only when you could actually see them.
  // Anything wearing a friend gets their tag too.
  updateTags() {
    const on = !!this.settings.tags, c = this.camera.position, fd = this.flashDir;
    const each = (a, id) => {
      if (!on && !a.tag) return;
      if (!a.tag) a.tag = nameTag(this.nameOf(id), a.root);
      const d = Math.hypot(a.x - c.x, a.z - c.z);
      const show = on && id !== this.specId && d < 16 && this.level.los(c.x, c.z, a.x, a.z);
      const beam = this.p.flashOn && this.p.battery > 0 && d > 0.1 && ((a.x - c.x) * fd.x + (a.z - c.z) * fd.z) / d > 0.85;
      const lit = d < 5 || beam || this.mimic.hooks.isLit(a.x, a.z);
      a.tag.material.opacity = show ? clamp(1.25 - d / 14, 0, 1) * (lit ? 0.9 : 0.35) : 0;
      a.tag.visible = a.tag.material.opacity > 0.02;
    };
    for (const [id, a] of this.remotes) each(a, id);
    for (const [id, a] of this.sw.avatars || []) each(a, id);
    for (const [id, a] of this.db.avatars || []) each(a, id);
  },

  // Why the power won't come on yet.
  missing() {
    if (this.esc?.missing()) return this.esc.missing();
    if (this.level.tasks.fuses && this.fusesIn < 4) return `The panel needs ${4 - this.fusesIn} more fuse${4 - this.fusesIn > 1 ? 's' : ''}`;
    if (this.obj.gen.some((p) => p < 1)) return 'The generators are still dead';
    if (this.obj.tapesLeft) return 'Its tapes are still recording';
    if (this.obj.storyHeard() < this.obj.storyNeed()) return `${this.story.tapeLabel}: ${this.obj.storyHeard()}/${this.obj.storyNeed()} found`;
    return 'The power won\'t come on yet';
  },

  // Your own "I found something. Come here." from the voice check (or any recording of you).
  playOwnVoice() {
    const own = this.voice.clips.filter((c) => c.tag === 'seed');
    const clip = own[1] || own[0] || this.voice.clips[this.voice.clips.length - 1];
    if (!clip) return;
    const d = this.sfx.playVoice(clip.buffer, null, 'echo');
    this.voice.suppress(d + 0.3);
  },

  toast(text) {
    const t = this.hud.toast;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  },

};
