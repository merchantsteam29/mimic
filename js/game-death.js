// Being caught (the jumpscares), spectating, coming back, and the end of a run.
// Part of Game (game.js): these methods are mixed into Game.prototype.
import * as THREE from 'three';
import { keyLabel, rumble } from './controls.js';
import { EYE, angleDiff, num } from './game-shared.js';

export const DeathPart = {
  // by: where the skinwalker got me (null = the mimic).
  caught(by = null) {
    if (this.state !== 'playing') return;
    this.scareBy = by?.sw && this.sw.wearId ? this.sw : by?.ls && this.ls.on ? this.ls : by?.sk && this.sk.on ? this.sk : null;
    if (!this.clip.recording) this.clip.start();
    this.hb.stop();
    this.obj.repairing = null;
    this.obj.endSkill();
    this.exitHide(true);
    this.state = 'caught';
    this.ct = 0;
    this.lost = false;
    this.hud.locker.hidden = true;
    this.hud.root.hidden = true;
    this.sfx.stopAmbient();
    this.sfx.setDread(0);
    this.renderer.domElement.style.transform = this.renderer.domElement.style.filter = '';
    // Turn to face it.
    const p = this.p, m = by || this.mimic;
    this.catchYaw = Math.atan2(-(m.x - p.x), -(m.z - p.z));
    p.speed = 0;
    // How it gets you: from above (off the ceiling), from behind, dragged away, straight on; or the mimic's slow
    // ones: the light dies and it's there when it comes back (dark), or it stands and looks at you first (stare).
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz) || 1;
    const behind = (-Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz) / d < -0.3, r = Math.random();
    this.scare = m.ceiling || m.dropT > 0 ? 'above' : behind ? 'behind'
      : this.scareBy ? (r < 0.3 ? 'drag' : 'front')
        : r < 0.2 ? 'drag' : r < 0.42 ? 'dark' : r < 0.62 ? 'stare' : 'front';
    this.lunge = { dark: 1.0, stare: 1.8 }[this.scare] || 0; // how long before it strikes
    if (this.scare === 'behind' || this.scare === 'dark') this.sfx.sniff(this.scareBy ? this.scareBy.emitter : m.emitter);
    if (this.scare === 'stare') setTimeout(() => { if (this.state === 'caught') this.localSpeak('whisper', null); }, 250);
    const strike = () => {
      if (this.state !== 'caught') return;
      this.hud.flash.classList.remove('hit');
      void this.hud.flash.offsetWidth;
      this.hud.flash.classList.add('hit');
      this.sfx.screech();
      rumble(1, 700);
      setTimeout(() => this.localSpeak('scream', null), 150);
    };
    if (this.lunge) setTimeout(strike, this.lunge * 1000); else strike();
  },

  updateCaught(dt) {
    this.ct += dt;
    const p = this.p, sc = this.scare;
    const fx = -Math.sin(this.catchYaw), fz = -Math.cos(this.catchYaw);
    // It lunges in, then stays bent over right in your face (or hangs down from above).
    const st = Math.max(0, this.ct - this.lunge); // time since it struck
    let dist = sc === 'above' ? 1.05 : 1.25 + Math.max(0, 1 - st * 5) * 0.6;
    if (sc === 'dark') { // already right there in the dark: you just can't see it yet
      dist = 1.2;
      this.renderer.domElement.style.filter = this.ct < 0.85 || (this.ct < 1.15 && Math.random() < 0.5) ? 'brightness(0.06)' : '';
    }
    if (sc === 'stare' && this.ct < this.lunge) dist = 2.1; // standing back, looking at you
    const it = this.scareBy && this.scareBy.poseAt(p.x + fx * dist, p.z + fz * dist, Math.atan2(-fx, -fz), this.t);
    if (!it) this.mimic.pose(p.x + fx * dist, p.z + fz * dist, Math.atan2(-fx, -fz), this.t, sc === 'above');
    if (!it && this.ct < this.lunge) {
      const hd = this.mimic.model.head, jaw = this.mimic.model.jaw;
      if (sc === 'stare') { // upright, mouth shut, its head tipping slowly over sideways while it whispers
        this.mimic.model.torso.rotation.x = 0.15;
        hd.rotation.z = Math.min(1.7, this.ct * 1.1);
        jaw.rotation.x = 0.05;
      } else jaw.rotation.x = 0.1 + this.ct * 0.4; // dark: its jaw coming open
    }
    if (sc === 'drag') {
      // Pulled off your feet and dragged backwards into the dark.
      if (this.ct > 1.5 && !this.dragging) {
        this.dragging = true;
        this.renderer.domElement.style.filter = 'brightness(0.05)';
        this.sfx.drag(1.5);
        setTimeout(() => this.localSpeak('echo', null), 400);
      }
      if (this.dragging) { p.eye = Math.max(0.25, p.eye - dt * 3); p.x -= fx * dt * 1.2; p.z -= fz * dt * 1.2; }
    }
    const root = it ? it.root : this.mimic.model.root;
    root.updateMatrixWorld(true);
    const head = (it ? it.head : this.mimic.model.head).getWorldPosition(new THREE.Vector3());
    const dx = head.x - p.x, dy = head.y - p.eye, dz = head.z - p.z;
    if (sc === 'behind' && this.ct < 0.4) return; // you hear it breathe behind you first
    const k = Math.min(1, dt * (sc === 'behind' ? 22 : 14));
    p.yaw += angleDiff(Math.atan2(-dx, -dz), p.yaw) * k;
    p.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * k;
    const T = (sc === 'drag' ? 2.8 : 2.5) + this.lunge;
    // First you see its face (the picture only shudders), then the tape tears apart.
    this.distort = st < 1.7 ? (this.ct < this.lunge ? 0.03 : 0.06 + Math.random() * 0.08) : Math.min(this.settings.calm ? 0.45 : 1, 0.4 + (st - 1.7) * 1.2);
    if (this.ct > T && !this.lost) { this.lost = true; this.hud.signal.hidden = false; this.sfx.static(1.2); }
    if (this.ct > T + 1.1 && this.state === 'caught') {
      this.clip.stop(true);
      this.renderer.domElement.style.filter = '';
      this.dragging = false;
      if (!this.mp) { this.end(false); return; }
      this.mimic.frozen = false;
      this.sw.posed = false;
      this.ls.posed = false;
      this.sk.posed = false;
      this.startSpectate();
    }
  },

  startSpectate() {
    this.state = 'spectate';
    this.hud.signal.hidden = true;
    this.distort = 0;
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    this.hud.fear.style.opacity = 0;
    this.renderer.domElement.style.transform = this.renderer.domElement.style.filter = '';
    this.sfx.setDread(0);
    if (!this.sfx.ambient) this.sfx.startAmbient(this.level.theme.id);
    this.hud.spec.hidden = false;
  },

  // The living player I'm watching (cycles with Space / click).
  specTarget() {
    const living = [...this.remotes.entries()].filter(([id, r]) => this.alive(id) && r.seen);
    if (!living.length) { this.hud.spec.textContent = 'No one is left to watch.'; return null; }
    const [id, r] = living[this.specIdx % living.length];
    this.specId = id;
    this.hud.spec.textContent = `Watching ${this.nameOf(id)}  ·  ${keyLabel('Next')} for next  ·  ${this.status.get(this.me) === 'dead' ? 'Only the dead can hear you' : 'You got out'}${this.haunt.hint()}`;
    return r;
  },

  // Someone played my tape at the panel: back on my feet, there.
  revive(x, z) {
    const p = this.p;
    this.state = 'playing';
    p.x = x; p.z = z; p.vx = p.vz = 0; p.hidden = null; p.eye = EYE; p.stamina = 1; p.tired = false;
    p.battery = Math.max(p.battery, 50); p.flashOn = true;
    this.escapeSent = false;
    this.distort = 0;
    this.hud.spec.hidden = true;
    this.hud.signal.hidden = true;
    this.hud.root.hidden = false;
    this.renderer.domElement.style.filter = '';
    this.mimic.frozen = false; this.sw.posed = this.ls.posed = this.sk.posed = false; this.dragging = false; // (if it was mid-jumpscare)
    this.peekHud = 5;
    this.updateObjective();
    this.sfx.sting();
    this.toast('Someone played your tape. You\'re back.');
  },

  end(won) {
    if (this.state === 'won' || this.state === 'dead' || this.state === 'ended') return;
    this.state = won ? 'won' : 'dead';
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    if (won) this.sfx.stopAmbient();
    this.recap.event(won ? 'out' : 'caught', this.me);
    this.onEnd({
      recap: this.recap.data(), tutorial: this.tut.on,
      won, time: this.time, fuses: this.fusesFound, lures: this.lures,
      clips: this.voice.clips.length, place: this.story ? this.story.title : this.level.name, story: this.story,
    });
  },

  // Online: the host says the game is over.
  finish(m) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    this.hud.spec.hidden = true;
    this.sfx.stopAmbient();
    const st = m.st || {};
    // Hunt: the mimic wins if fewer than half of them got out.
    const others = this.order.filter((id) => id !== m.hunter), out = others.filter((id) => st[id] === 'out').length;
    const hunterWins = !!m.hunter && out * 2 < others.length;
    const vs = m.versus && typeof m.versus === 'object' ? m.versus : null;
    this.onEnd({
      mp: true, won: vs ? vs.winner === vs.teams?.[this.me] : m.hunter === this.me ? hunterWins : m.traitor === this.me ? !!m.traitorWins : st[this.me] === 'out',
      versus: vs,
      hunter: m.hunter || null, hunterName: m.hunter ? this.nameOf(m.hunter) : null, hunterWins, time: num(m.time, this.time), fuses: this.fusesFound, lures: this.lures,
      mode: m.mode, traitor: m.traitor || null, traitorName: m.traitor ? this.nameOf(m.traitor) : null, traitorWins: !!m.traitorWins,
      clips: this.mp.clips.size, place: this.level.name, recap: m.recap,
      results: this.order.map((id) => ({ id, name: this.nameOf(id), status: st[id] || 'left' })),
    });
  },
};
