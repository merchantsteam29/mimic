// The hiding-spot minigame. It's right outside the door, listening: beats slide toward your heart and
// you press Space as each one arrives. Miss three, or make a sound into your mic, and it hears you.
// Runs on the hidden player's own browser; the result goes to the host ('sniffRes').

import { rumble } from './controls.js';

const TRAVEL = 1.5;   // seconds a beat takes to cross the track
const WINDOW = 0.17;  // seconds either side of the beat that count as a hit
const LIVES = 3;

export class Heartbeat {
  constructor(game) {
    this.g = game;
    this.on = false;
    this.el = {
      root: document.getElementById('heart'), beats: document.getElementById('heartBeats'),
      lives: document.getElementById('heartLives'), text: document.getElementById('heartText'),
      core: document.querySelector('#heart .core'),
    };
  }

  start() {
    if (this.on || !this.g.p.hidden) return;
    this.on = true;
    this.t = 0;
    this.misses = 0;
    this.sniffT = 0.5;
    // Your heart speeds up as it lingers.
    this.beats = [];
    let at = 1.8, gap = 0.9;
    const n = 10 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this.beats.push({ at, done: false, el: null });
      gap = Math.max(0.5, gap - 0.035);
      at += gap + (Math.random() - 0.5) * 0.08;
    }
    this.el.beats.innerHTML = '';
    this.el.text.textContent = 'It\'s right outside. Keep your heart steady.';
    this.drawLives();
    this.el.root.hidden = false;
  }

  drawLives() { this.el.lives.textContent = '♥'.repeat(LIVES - this.misses) + '♡'.repeat(this.misses); }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    if (!g.p.hidden) { this.stop(); return; } // came out of hiding
    this.t += dt;
    // It snuffles at the gap in the door.
    this.sniffT -= dt;
    if (this.sniffT <= 0) {
      this.sniffT = 1.2 + Math.random() * 1.6;
      g.sfx.sniff(g.mimic.emitter);
    }
    // Talking (or gasping) into the mic gives you away at once.
    if (g.voice.hear > 0.3) { this.finish(false, 'It heard you.'); return; }
    let left = 0;
    for (const b of this.beats) {
      const x = (b.at - this.t) / TRAVEL; // 1 = far right, 0 = at the heart
      if (!b.el && x <= 1) {
        b.el = document.createElement('i');
        this.el.beats.appendChild(b.el);
      }
      if (b.el) b.el.style.left = `calc(18px + ${Math.max(-0.2, x).toFixed(3)} * (100% - 36px))`;
      if (!b.ticked && this.t >= b.at) { b.ticked = true; g.sfx.heartbeat(0.45); rumble(0.25, 90); }
      if (!b.done && this.t > b.at + WINDOW) { b.done = true; b.el?.classList.add('missed'); this.miss(); if (!this.on) return; }
      if (b.done && b.el && x < -0.15) { b.el.remove(); b.el = null; }
      if (!b.done) left++;
    }
    if (!left) this.finish(true);
  }

  // Space: returns true if the game used the key.
  onKey(code) {
    if (!this.on || code !== 'Space') return false;
    const b = this.beats.find((x) => !x.done && Math.abs(this.t - x.at) <= WINDOW);
    if (b) {
      b.done = true;
      b.el?.remove();
      b.el = null;
      this.el.core.classList.remove('hit');
      void this.el.core.offsetWidth;
      this.el.core.classList.add('hit');
    } else this.miss(); // a beat that wasn't there
    return true;
  }

  miss() {
    this.misses++;
    this.drawLives();
    this.g.sfx.heartbeat(1.3); // your heart slams
    rumble(0.8, 160);
    if (this.misses >= LIVES) this.finish(false, 'Your heart is too loud.');
  }

  finish(ok, why = '') {
    if (!this.on) return;
    this.stop();
    if (!ok) this.g.toast(why);
    this.g.send({ t: 'sniffRes', ok });
  }

  stop() {
    this.on = false;
    this.el.root.hidden = true;
    this.el.beats.innerHTML = '';
  }
}
