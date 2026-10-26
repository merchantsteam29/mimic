// Walkie-talkies (online). Hold B (controller: D-pad down; touch: Radio) to talk to every living player,
// wherever they are, through a crackly radio. But every other radio crackles out loud while you talk,
// so it can hear where everyone is. And it has a radio too: now and then it calls over the radio in one
// of your voices. Usually someone who's dead. The name on the radio says who it sounds like.
//   intent 'radio' {on} -> broadcast 'radioOn' {id, on};  host -> 'radioFake' {key, as} (it, on the radio)
import { keyLabel } from './controls.js';

const MAX_TALK = 12;   // seconds per press
const $ = (id) => document.getElementById(id);

export class Radio {
  constructor(g) {
    this.g = g;
    this.on = !!g.mp;
    this.tx = new Set();     // who's talking on the radio now
    this.talking = false;    // me
    this.talkT = 0;
    this.noiseT = 0;
    this.fakeT = 70 + Math.random() * 60; // host: until it first uses the radio
    this.shown = null;       // whose name is on the radio display, and until when
    this.hostT = new Map();  // host: id -> when they started
  }

  can() {
    const g = this.g;
    return this.on && g.state === 'playing' && g.alive(g.me) && !g.hunt.me && !g.menuOpen;
  }

  // Keys: true if used.
  onKey(code, down) {
    if (code !== 'KeyB') return false;
    if (down && !this.talking && this.can()) this.start();
    else if (!down && this.talking) this.stop();
    return this.on;
  }

  start() {
    this.talking = true;
    this.talkT = 0;
    this.g.send({ t: 'radio', on: true });
    this.g.sfx.squelch();
    if (!this.hinted) { this.hinted = true; this.g.toast('Every other radio crackles while you talk. It can hear them.'); }
  }

  stop() {
    this.talking = false;
    this.g.send({ t: 'radio', on: false });
    this.g.sfx.squelch(true);
  }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'radio') return false;
    const g = this.g;
    const on = !!m.on && g.alive(from) && from !== g.hunt.id;
    if (on === this.tx.has(from)) return true;
    if (on) this.hostT.set(from, g.t);
    g.broadcast({ t: 'radioOn', id: from, on });
    return true;
  }

  think(dt) {
    const g = this.g;
    if (!this.on || g.ended) return;
    // Everyone else's radio is making noise right now.
    if (this.tx.size && (this.noiseT -= dt) <= 0) {
      this.noiseT = 0.8;
      for (const P of g.targets()) {
        if (this.tx.has(P.id)) continue;
        g.mimic.hear(P.x, P.z, 7, 'step');
        g.ls.hear(P.x, P.z, 7, 'voice');
        g.hunt.heard(P.x, P.z, 7);
      }
    }
    // A stuck key or a dropped connection: nobody talks forever.
    for (const id of this.tx) if (!g.alive(id) || g.t - (this.hostT.get(id) ?? g.t) > MAX_TALK + 2) g.broadcast({ t: 'radioOn', id, on: false });
    // It uses the radio too (not in Hunt: there, the player who's it has the voices).
    if (g.hunt.on || g.power) return;
    if ((this.fakeT -= dt) > 0) return;
    this.fakeT = 90 + Math.random() * 90;
    const key = g.mp.pickKey((owner) => g.status.get(owner) === 'dead');
    const c = key && g.mp.clips.get(key);
    if (!c || !g.targets().length) return;
    g.recap.voice(key);
    g.broadcast({ t: 'radioFake', key, as: c.owner });
  }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    if (m.t === 'radioOn') {
      const was = this.tx.has(m.id);
      if (m.id && m.on) this.tx.add(m.id); else this.tx.delete(m.id);
      if (m.id === g.me && !m.on && this.talking) { this.talking = false; g.sfx.squelch(true); }
      if (m.id !== g.me && was !== !!m.on && this.hears()) { g.sfx.squelch(!m.on); if (m.on) this.show(m.id, 999); else this.shown = null; }
      return true;
    }
    if (m.t === 'radioFake') {
      if (!this.hears()) return true;
      const c = g.mp?.clips.get(m.key);
      if (!c) return true;
      g.sfx.squelch();
      const d = g.sfx.playVoice(c.buffer, null, 'radio');
      g.voice.suppress(d + 0.3);
      setTimeout(() => g.sfx.squelch(true), (d + 0.15) * 1000);
      this.show(m.as, d + 2); // the name stays up a moment after
      return true;
    }
    return false;
  }

  // Only the living carry a radio that works.
  hears() { const g = this.g; return this.on && g.alive(g.me) && (g.state === 'playing' || g.state === 'caught'); }

  show(id, seconds) { this.shown = { id, until: this.g.t + seconds }; }

  update(dt) {
    const g = this.g;
    if (!this.on) return;
    if (g.isHost) this.think(dt);
    if (this.talking) {
      this.talkT += dt;
      if (this.talkT > MAX_TALK || !this.can()) this.stop();
    }
    // The radio display.
    const el = $('radio');
    let text = '';
    if (this.talking) text = `<b>● TRANSMITTING</b>`;
    else if (this.shown && g.t < this.shown.until && this.hears()) text = `<b>RADIO</b> ${escapeHtml(g.nameOf(this.shown.id))}`;
    else if (this.can() && g.peekHud > 0) text = `<span>${escapeHtml(keyLabel('B'))} radio</span>`;
    if (el.innerHTML !== text) el.innerHTML = text;
    el.hidden = !text;
  }

  // Radio voices: everyone who's talking reaches me through the radio (vc.route with radio).
  routes(id) { return this.hears() && this.tx.has(id) && this.g.alive(id); }

  dispose() { $('radio').hidden = true; }
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
