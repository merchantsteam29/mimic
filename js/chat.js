// Quick chat (online): set phrases for players who can't or won't talk. T opens the list, 1-8 say one
// (controller: the chat button, then up / down and "use"; touch: Say, then tap a line).
// It follows the same rules as voices: the living read the living near them (30 m), the dead read
// everyone, and only the dead read the dead. The mimic player can't use it.
import { keyLabel } from './controls.js';

export const PHRASES = ['Over here', 'Help!', "It's behind you", 'Run!', 'Where are you?', 'Found something', "That wasn't me", "I'm hiding"];
const COOLDOWN = 1.2, SHOW = 7, RANGE = 30;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Chat {
  constructor(g) {
    this.g = g;
    this.open = false;
    this.sel = 0;
    this.cd = 0;
    this.hostCd = new Map(); // host: id -> time of their last line
    this.lines = [];
  }

  can() {
    const g = this.g;
    return !!g.mp && !g.hunt.me && (g.state === 'playing' || g.state === 'spectate') && !g.menuOpen;
  }

  toggle() {
    if (this.open) this.close();
    else if (this.can()) { this.open = true; this.sel = 0; this.draw(); }
  }

  close() {
    this.open = false;
    $('chat').hidden = true;
  }

  move(d) { this.sel = (this.sel + d + PHRASES.length) % PHRASES.length; this.draw(); }
  sendSelected() { this.say(this.sel); }

  say(i) {
    this.close();
    if (this.cd > 0) return;
    this.cd = COOLDOWN;
    this.g.send({ t: 'chat', i });
  }

  // Keys. True if used.
  onKey(code) {
    if (code === 'KeyT') { if (!this.can() && !this.open) return false; this.toggle(); return true; }
    if (!this.open) return false;
    if (/^Digit[1-8]$/.test(code)) { this.say(Number(code.slice(5)) - 1); return true; }
    if (code === 'Escape') { this.close(); return true; }
    return false;
  }

  draw() {
    const el = $('chat');
    el.innerHTML = `<p class="kicker">Say</p><ol>${PHRASES.map((p, i) =>
      `<li class="${i === this.sel ? 'sel' : ''}"><kbd>${i + 1}</kbd>${esc(p)}</li>`).join('')}</ol><p class="fine">${esc(keyLabel('T'))} to close</p>`;
    el.hidden = false;
  }

  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    if (this.open && !this.can()) this.close();
    const now = this.g.t;
    const keep = this.lines.filter((l) => now - l.t < SHOW);
    if (keep.length !== this.lines.length) { for (const l of this.lines) if (now - l.t >= SHOW) l.el.remove(); this.lines = keep; }
  }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'chat') return false;
    const g = this.g, i = m.i | 0;
    if (i < 0 || i >= PHRASES.length || from === g.hunt.id || !g.status.has(from)) return true;
    if (g.t - (this.hostCd.get(from) ?? -9) < 1) return true;
    this.hostCd.set(from, g.t);
    g.broadcast({ t: 'said', id: from, i });
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    if (m.t !== 'said') return false;
    const g = this.g, text = PHRASES[m.i | 0];
    if (!text) return true;
    const fromAlive = g.alive(m.id), meAlive = g.alive(g.me);
    let far = false;
    if (!fromAlive) {
      if (meAlive) return true; // only the dead read the dead
    } else if (m.id !== g.me) {
      const r = g.remotes.get(m.id), c = g.camera.position;
      if (!r) return true;
      const d = Math.hypot(r.x - c.x, r.z - c.z);
      if (d > RANGE) return true;
      far = d > 12;
    }
    const el = document.createElement('p');
    el.className = fromAlive ? '' : 'dead';
    el.innerHTML = `<b>${esc(m.id === g.me ? 'You' : g.nameOf(m.id))}</b> ${esc(text)}${far ? ' <span>(far off)</span>' : ''}`;
    $('chatFeed').appendChild(el);
    this.lines.push({ el, t: g.t });
    while (this.lines.length > 4) this.lines.shift().el.remove();
    g.sfx.click();
    return true;
  }

  dispose() {
    this.close();
    for (const l of this.lines) l.el.remove();
  }
}
