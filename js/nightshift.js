// Night Shift (alone from the title screen, or a lobby Mode online): you're the night watch. No jobs and no way out:
// the doors are chained until 6 a.m. Each hour is a minute, the bell tolls the hour, and every night you last, the
// next one is worse (faster, sharper-eyed, hungrier, darker, weaker batteries). Nothing to unlock: just how far you got.
export const HOUR = 60, NIGHT_LEN = 6 * HOUR;
const BEST = 'mimic.nights';

// How hard night n is (1 = the first). From night 8 on it stops getting worse.
export function nightRules(n) {
  const k = Math.min(Math.max(1, n), 8) - 1;
  return { speed: 1 + k * 0.05, sight: 1 + k * 0.04, hunger: Math.max(0.35, 0.8 - k * 0.07), battery: Math.max(0.55, 1 - k * 0.07), broken: Math.min(0.8, 0.3 + k * 0.07), grace: -k * 2 };
}
// The level: no jobs at all, and fewer working lights each night.
export const nightLevel = (n) => ({ tasks: { fuses: false, gens: 0, tapes: 0, keycard: false }, broken: nightRules(n).broken });

// Your longest run of nights alone (this device only).
export const bestNight = () => { try { return Number(localStorage.getItem(BEST)) || 0; } catch { return 0; } };
export function recordNight(n) { try { if (n > bestNight()) localStorage.setItem(BEST, String(n)); } catch { /* ignore */ } }

export class NightShift {
  constructor(game, night = 0) {
    this.g = game;
    this.night = Math.max(0, night | 0);
    this.on = this.night > 0;
    this.t = 0;      // seconds into the night (keeps running while you watch from the dead)
    this.hour = 0;   // the last hour the bell tolled (host's, broadcast as 'hour')
    this.dawnT = -1; // host: seconds since 6 a.m.
  }

  // The camcorder's clock: midnight when you go in.
  stamp() {
    const c = Math.floor(this.t * (3600 / HOUR)), two = (n) => String(n).padStart(2, '0');
    return `NIGHT ${this.night}\n${two(Math.floor(c / 3600) % 12 || 12)}:${two(Math.floor(c / 60) % 60)}:${two(c % 60)} AM`;
  }

  line() { return this.hour >= 6 ? '6 A.M.' : `Night ${this.night}  ·  hold on until 6 A.M.`; }

  update(dt) {
    const g = this.g;
    if (!this.on || g.state === 'ended' || g.state === 'won' || g.state === 'dead') return;
    if (g.state === 'playing' || g.state === 'spectate' || g.state === 'caught') this.t += dt;
    if (!g.isHost) return;
    const h = Math.min(6, Math.floor(this.t / HOUR));
    if (h > this.hour) g.broadcast({ t: 'hour', h });
    // Host: a few seconds after six, whoever is still alive has made it.
    if (this.dawnT >= 0 && (this.dawnT += dt) > 3.5) {
      this.dawnT = -1;
      if (!g.mp) { g.end(true); return; }
      for (const [id, s] of g.status) if (s === 'alive') { g.recap.event('out', id); g.broadcast({ t: 'out', id, dawn: 1 }); }
    }
  }

  // Everyone: the bell tolls the hour (6 = it's over).
  onHour(h) {
    const g = this.g;
    if (!(h > this.hour) || h > 6) return;
    this.hour = h;
    this.t = Math.max(this.t, h * HOUR); // a client whose clock ran slow catches up
    g.sfx.bell(h === 6 ? 3 : h);
    g.toast(h === 6 ? '6 A.M. The chains come off the doors.' : `${h} A.M.`);
    g.updateObjective();
    if (h === 6) {
      g.mimic.shyT = 30; // it slinks off as the light comes
      if (g.isHost) this.dawnT = 0;
    }
  }
}
