// Hand signals (online): talk without a sound. Z opens the list (controller: D-pad left, then a D-pad
// direction; touch: Signal, then tap one). Your figure waves, points, holds up a hand or beckons for a
// couple of seconds. Only people who can see you get the message, and the mimic hears nothing.
//   intent 'sig' {k} -> broadcast 'sign' {id, k}
import { controls, keyLabel } from './controls.js';

export const SIGNS = ['Wave', 'Point', 'Stop', 'Come here'];
const HOLD = 2.6;
const $ = (id) => document.getElementById(id);

export class Signals {
  constructor(g) {
    this.g = g;
    this.open = false;
    this.cd = 0;
  }

  can() {
    const g = this.g;
    return !!g.mp && g.state === 'playing' && g.alive(g.me) && !g.hunt.me && !g.p.hidden && !g.menuOpen;
  }

  toggle() {
    if (this.open) this.close();
    else if (this.can()) { this.g.chat.close(); this.open = true; this.draw(); }
  }

  close() { this.open = false; $('signals').hidden = true; }

  // Keys. True if used.
  onKey(code) {
    if (code === 'KeyZ') { if (!this.can() && !this.open) return false; this.toggle(); return true; }
    if (!this.open) return false;
    if (/^Digit[1-4]$/.test(code)) { this.give(Number(code.slice(5)) - 1); return true; }
    if (code === 'Escape') { this.close(); return true; }
    return false;
  }

  give(k) {
    this.close();
    if (this.cd > 0) return;
    this.cd = 1;
    this.g.send({ t: 'sig', k });
    this.g.toast(`You signal: ${SIGNS[k]}`);
  }

  draw() {
    const el = $('signals');
    const pad = ['▲', '▶', '▼', '◀'];
    el.innerHTML = `<p class="kicker">Signal</p><ol>${SIGNS.map((s, i) =>
      `<li><kbd>${controls.mode === 'pad' ? pad[i] : i + 1}</kbd>${s}</li>`).join('')}</ol><p class="fine">${keyLabel('Z')} to close · silent</p>`;
    el.hidden = false;
  }

  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    if (this.open && !this.can()) this.close();
  }

  // ---------- host ----------
  hostHandle(m, from) {
    if (m.t !== 'sig') return false;
    const g = this.g, k = m.k | 0;
    if (k >= 0 && k < SIGNS.length && g.alive(from)) g.broadcast({ t: 'sign', id: from, k });
    return true;
  }

  // ---------- everyone ----------
  onNet(m) {
    if (m.t !== 'sign') return false;
    const r = this.g.remotes.get(m.id);
    if (r) r.sign = { k: m.k | 0, t: HOLD };
    return true;
  }

  dispose() { this.close(); }
}

// Pose a remote player's free (left) arm for a signal. Called from RemotePlayer.update.
export function poseSign(r, dt) {
  const s = r.sign;
  if (!s) return;
  s.t -= dt;
  if (s.t <= 0) { r.sign = null; r.arms[0].rotation.z = 0; return; }
  const a = r.arms[0], w = Math.sin((2.6 - s.t) * 9);
  if (s.k === 0) { a.rotation.x = 2.8; a.rotation.z = -0.25 + w * 0.35; }        // wave, overhead
  else if (s.k === 1) { a.rotation.x = 1.55 - r.pitch * 0.8; a.rotation.z = 0.05; } // point where they're looking
  else if (s.k === 2) { a.rotation.x = 1.9; a.rotation.z = 0; }                     // stop: palm up and out
  else { a.rotation.x = 1.35 + Math.max(0, w) * 0.45; a.rotation.z = 0; }          // come here: beckoning
}
