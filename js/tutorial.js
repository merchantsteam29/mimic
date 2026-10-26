// The first-time tutorial: a small, quiet building and a coach line that teaches one thing at a time
// (moving, the flashlight, batteries, the HUD, the voice, hiding). Until the last step the mimic is
// parked out of the way, and the hiding lesson is staged: it walks up to your locker, sniffs, and
// leaves. Then it wakes up for real and the run plays out like any other, with a few tips the first
// time things happen. Alone only.
import { controls, keyLabel } from './controls.js';
import { binds, keyName } from './binds.js';

export const TUTORIAL = {
  theme: 'facility', seed: 5150,
  gen: { size: 20, tasks: { fuses: true }, lore: 0, broken: 0.1 },
  intro: [
    'A short walk through a quiet building, to learn how it works.',
    'It\'s in here too. It will leave you alone until you\'re ready.',
  ],
};

const moveText = () => ({
  pad: 'Walk with the left stick. Look around with the right stick.',
  touch: 'Walk with your left thumb. Drag with your right thumb to look around.',
}[controls.mode] ?? `Walk with ${['forward', 'left', 'back', 'right'].map((a) => keyName(binds.key[a])).join(' ')}. Look around with the mouse.`);

export class Tutorial {
  constructor(g, on) {
    this.g = g;
    this.on = !!on;
    this.quiet = this.on;   // no director or scripted scares yet
    this.holds = this.on;   // the tutorial moves the mimic, not its AI
    if (!this.on) return;
    const lv = g.level;
    this.el = document.getElementById('coach');
    // No tricks in the tutorial: the fake locker and the decoy are ordinary.
    if (lv.fakeHide >= 0) lv.props[lv.fakeHide].fake = false;
    for (const it of g.items) if (it?.fake) { it.active = false; it.mesh?.removeFromParent(); }
    g.mimic.graceT = 1e9;
    this.park();
    // A battery on the floor nearby, and a flashlight that could use it.
    g.p.battery = 55;
    const sp = lv.spawnPos;
    const spot = [...Array(40)].map(() => lv.randomFloor((q) => { const d = Math.hypot(q.x - sp.x, q.z - sp.z); return d > 2.2 && d < 5 && lv.los(sp.x, sp.z, q.x, q.z); })).find(Boolean);
    this.battery = g.items.find((it) => it.type === 'battery' && it.active);
    if (this.battery && spot) {
      this.battery.x = spot.x; this.battery.z = spot.z;
      this.battery.mesh.position.x = spot.x; this.battery.mesh.position.z = spot.z;
    }
    // The hiding spot nearest the start.
    this.hide = lv.props.filter((p) => p.hide).sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z))[0];
    this.start = { x: g.p.x, z: g.p.z };
    this.flashFlips = 0;
    this.lastFlash = true;
    this.tabT = 0;
    this.clips0 = 0;
    this.step = -1;
    this.tips = new Set();
    this.next();
  }

  // The mimic waits in its far room, out of sight.
  park() {
    const m = this.g.mimic, lv = this.g.level;
    const at = { x: (lv.mimicSpawn.cx + 0.5) * 2, z: (lv.mimicSpawn.cz + 0.5) * 2 };
    m.x = m.tx = at.x; m.z = m.tz = at.z; m.tx0 = 1;
    m.state = 'wander';
    m.model.root.visible = false;
  }

  say(html) {
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
  }

  tip(id, html, seconds = 7) {
    if (this.tips.has(id)) return;
    this.tips.add(id);
    this.say(html);
    this.tipUntil = this.g.t + seconds;
  }

  next() {
    this.step++;
    this.t = 0;
    const s = this.steps[this.step];
    if (!s) return;
    s.enter?.();
    if (s.text) this.say(s.text());
  }

  get steps() {
    const g = this.g, k = (key) => `<kbd>${keyLabel(key)}</kbd>`;
    return this._steps ||= [
      { text: moveText, done: () => Math.hypot(g.p.x - this.start.x, g.p.z - this.start.z) > 4 },
      {
        text: () => `${k('F')} turns your flashlight off and on. Try it.<br><span>It helps you see. It also helps <i>it</i> see you, from twice as far.</span>`,
        done: () => this.flashFlips >= 2,
      },
      {
        text: () => `The light runs on batteries. There's one on the floor nearby: look at it and press ${k('E')}.`,
        done: () => !this.battery?.active,
      },
      {
        text: () => `Hold ${k('Tab')} to see your jobs and your battery.`,
        done: () => this.tabT > 0.6 || this.t > 25,
      },
      {
        enter: () => { this.clips0 = g.voice.clips.length; },
        text: () => (g.voice.started
          ? 'It copies voices. Everything you say, it records.<br><span>Say something out loud now. Anything.</span>'
          : 'It copies voices: with a microphone on, it records what you say and calls you with it.<br><span>Your microphone is off, so it can only whisper.</span>'),
        done: () => (g.voice.started ? g.voice.clips.length > this.clips0 || this.t > 14 : this.t > 8),
      },
      ...(this.g.voice.started ? [{
        enter: () => { this.echoT = 1.6; this.echoStep = this.step; },
        text: () => '…',
        done: () => this.t > 9,
      }] : []),
      {
        enter: () => { this.hideSeen = false; },
        text: () => `Something is coming. Hide: look at a locker or a cupboard and press ${k('E')}.<span>${this.hideHint()}</span>`,
        done: () => !!g.p.hidden,
      },
      {
        enter: () => this.stageWalk(),
        text: () => 'Stay still. Don\'t make a sound.<br><span>You can look out through the gaps.</span>',
        done: () => this.walk?.done,
      },
      {
        text: () => `It's gone. Press ${k('E')} to get out.`,
        done: () => !g.p.hidden,
      },
      {
        enter: () => this.release(),
        text: () => `That's it. It's awake now.<br><span>Find the 4 fuses, put them in the power panel, then get out. ${k('Tab')} shows what's left.</span>`,
        done: () => this.t > 10,
      },
    ];
  }

  hideHint() {
    if (!this.hide) return '';
    const g = this.g, d = Math.hypot(this.hide.front.x - g.p.x, this.hide.front.z - g.p.z);
    return d < 3 ? '' : `<br>The nearest one is about ${Math.round(d)} m away.`;
  }

  // It walks up to where you're hiding, sniffs at the door, and goes away again.
  stageWalk() {
    const g = this.g, lv = g.level, prop = g.p.hidden || this.hide, m = g.mimic;
    const to = prop.front;
    const from = [...Array(60)].map(() => lv.randomFloor((q) => {
      const d = Math.hypot(q.x - to.x, q.z - to.z);
      return d > 10 && d < 16 && !lv.los(g.p.x, g.p.z, q.x, q.z);
    })).find(Boolean) || { x: (lv.mimicSpawn.cx + 0.5) * 2, z: (lv.mimicSpawn.cz + 0.5) * 2 };
    const path = lv.findPath(from.x, from.z, to.x, to.z);
    m.x = m.tx = from.x; m.z = m.tz = from.z;
    m.model.root.visible = true;
    this.walk = { path: [...path, { x: to.x, z: to.z }], i: 0, wait: 3.5, back: false, done: false, start: 2.5 };
  }

  driveMimic(dt) {
    const g = this.g, m = g.mimic, w = this.walk;
    m.state = 'stalk'; // never 'hunt' or 'chase' here: no snarls, no chase music
    if (!w || w.done) { m.model.root.visible = false; return; }
    if (w.start > 0) { w.start -= dt; m.model.root.visible = false; return; }
    m.model.root.visible = true;
    const pts = w.path, tgt = pts[w.i];
    if (tgt) {
      const dx = tgt.x - m.tx, dz = tgt.z - m.tz, d = Math.hypot(dx, dz), v = 1.5 * dt;
      if (d <= v) { m.tx = tgt.x; m.tz = tgt.z; w.i++; }
      else { m.tx += (dx / d) * v; m.tz += (dz / d) * v; m.tyaw = Math.atan2(dx, dz); }
    } else if (!w.back) { // at the door: it sniffs, breathes, waits
      if (w.wait === 3.5) { g.sfx.sniff(m.emitter); g.fear = Math.max(g.fear, 0.6); }
      m.tyaw = Math.atan2(g.p.x - m.x, g.p.z - m.z);
      w.wait -= dt;
      if (w.wait <= 0) { w.back = true; w.path = pts.slice().reverse(); w.i = 0; }
    } else { w.done = true; m.model.root.visible = false; this.park(); }
    m.puppet(dt, g.t);
  }

  release() {
    const m = this.g.mimic;
    this.holds = false;
    this.quiet = false;
    this.park();
    m.model.root.visible = true;
    m.graceT = 30;
  }

  update(dt) {
    if (!this.on || this.g.state !== 'playing') return;
    const g = this.g;
    this.t += dt;
    if (g.p.flashOn !== this.lastFlash) { this.lastFlash = g.p.flashOn; this.flashFlips++; }
    this.tabT = g.tabDown ? this.tabT + dt : 0;
    // Your own words come back, from somewhere you can't see.
    if (this.echoT > 0 && (this.echoT -= dt) <= 0) this.echo();
    const s = this.steps[this.step];
    if (s) {
      if (s.done()) this.next();
      else if (this.step === this.steps.length - 4 && Math.floor(this.t) !== Math.floor(this.t - dt)) this.say(s.text()); // keep the distance fresh
      return;
    }
    // After the lessons: a tip the first time something happens.
    if (this.tipUntil && g.t > this.tipUntil) { this.el.hidden = true; this.tipUntil = 0; }
    if (this.step === this.steps.length && !this.tipUntil) { this.el.hidden = true; this.step++; }
    const m = g.mimic, k = (key) => `<kbd>${keyLabel(key)}</kbd>`;
    if (m.state === 'chase' && m.targetId === g.me) this.tip('chase', `It's seen you. Run (${k('Shift')}), get out of its sight, then hide.`);
    else if (m.state === 'stalk' && m.speaking > 0) this.tip('lure', 'That voice is coming from it. Don\'t go to it.');
    else if (g.fusesHeld && !this.tips.has('fuse')) this.tip('fuse', 'Take fuses to the power panel. It has a row of red lights.');
    else if (g.hb.on) this.tip('beat', `It's at the door. Press ${k('Beat')} on each heartbeat, and keep quiet.`, 6);
  }

  echo() {
    const g = this.g, lv = g.level;
    const clip = g.voice.clips[g.voice.clips.length - 1];
    const at = [...Array(60)].map(() => lv.randomFloor((q) => {
      const d = Math.hypot(q.x - g.p.x, q.z - g.p.z);
      return d > 7 && d < 13 && !lv.los(g.p.x, g.p.z, q.x, q.z);
    })).find(Boolean);
    if (!clip || !at) { this.say('It copies voices. When you hear a friend calling from the dark, it might not be them.'); return; }
    g.ambientEmitter.setPos(at.x, 1.6, at.z);
    g.ambientEmitter.setOcclusion(true);
    const d = g.sfx.playVoice(clip.buffer, g.ambientEmitter, 'lure');
    g.voice.suppress(d + 0.3);
    setTimeout(() => {
      if (this.g.state === 'playing' && this.step === this.echoStep) this.say('That wasn\'t you.<br><span>When you hear a friend calling from the dark, it might not be them.</span>');
    }, (d + 0.6) * 1000);
  }

  dispose() { if (this.el) this.el.hidden = true; }
}
