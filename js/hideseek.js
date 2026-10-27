// Hide and seek (online, a lobby Mode). No jobs and no way out. You get a minute to hide while it waits, then it
// comes looking, and every 20 s or so it simply knows where one of you is. Whoever it hasn't found when the time runs
// out wins; if it finds everyone, the last one found wins. Move between hiding spots if you dare.
export const HIDE_T = 60, SEEK_T = 240;
export const hideLevel = () => ({ tasks: { fuses: false, gens: 0, tapes: 0, keycard: false } });

export class HideSeek {
  constructor(g, on) {
    this.g = g;
    this.on = !!on && !!g.mp;
    this.phase = 'hide';  // hide | seek | over
    this.t = 0;           // seconds into this phase
    this.found = [];      // host: who it found, in order
    this.hintT = 25;
    if (!this.on) return;
    g.revival.on = false;   // no coming back in this one
    g.mimic.frozen = true;  // it waits while you hide
  }

  left() { return Math.max(0, (this.phase === 'hide' ? HIDE_T : SEEK_T) - this.t); }

  line() {
    const m = Math.floor(this.left() / 60), s = String(Math.floor(this.left() % 60)).padStart(2, '0');
    if (this.phase === 'hide') return `HIDE.  It starts looking in ${m}:${s}`;
    const hidden = [...this.g.status.values()].filter((v) => v === 'alive').length;
    return `Stay hidden  ·  ${m}:${s} left  ·  ${hidden} still hidden`;
  }

  update(dt) {
    const g = this.g;
    if (!this.on || this.phase === 'over' || g.state === 'intro') return;
    const sec = Math.floor(this.t);
    this.t += dt;
    if (Math.floor(this.t) !== sec) g.updateObjective(); // the countdown
    if (!g.isHost) return;
    if (this.phase === 'hide') {
      g.mimic.frozen = true;
      if (this.t >= HIDE_T) g.broadcast({ t: 'hsPhase', p: 'seek' });
      return;
    }
    // Seeking: now and then it just knows where one of you is hiding.
    if ((this.hintT -= dt) <= 0) {
      this.hintT = 18 + Math.random() * 8;
      const m = g.mimic, hid = g.targets().filter((P) => P.hidden && P.hidden.kind !== 'vent');
      if (hid.length && !['chase', 'hunt', 'sniff', 'stunned'].includes(m.state)) {
        const P = hid[Math.floor(Math.random() * hid.length)];
        m.huntHide(P.hidden, P.id);
      }
    }
    if (this.t >= SEEK_T) this.finish();
  }

  // Host: time's up. Everyone it didn't find wins.
  finish() {
    const g = this.g;
    this.phase = 'over';
    for (const [id, s] of g.status) if (s === 'alive') { g.recap.event('out', id); g.broadcast({ t: 'out', id, dawn: 1 }); }
  }

  onPhase(p) {
    const g = this.g;
    if (p !== 'seek' || this.phase !== 'hide') return;
    this.phase = 'seek';
    this.t = 0;
    g.sfx.bell(1);
    g.toast('Ready or not.');
    g.mimic.frozen = false;
    if (g.isHost) { g.mimic.graceT = 0; g.mimic.aggro = Math.max(g.mimic.aggro, 1.15); g.mimic.speak?.('scream'); }
    g.updateObjective();
  }

  // Host: it found someone.
  caught(id) { if (this.on && !this.found.includes(id)) this.found.push(id); }

  // For 'end': who won. Anyone it never found; or, if it found everyone, the last one.
  result() {
    if (!this.on) return {};
    const g = this.g, still = this.g.order.filter((id) => g.status.get(id) === 'out');
    return { hs: still.length ? still : this.found.slice(-1), hsAll: !still.length };
  }
}
