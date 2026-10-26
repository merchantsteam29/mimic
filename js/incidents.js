// Random events, partway through a run (not in the story or the tutorial). The host picks one every
// few minutes, before the power is back, and tells everyone ('incident'):
//   cut    - every light goes out for a while (it's faster in the dark)
//   storm  - rain and thunder for a minute; the rain covers your footsteps, lightning shows everything
//   alarm  - a security alarm goes off somewhere far from everyone; it goes to see what it is
//   lock   - lockdown: a few doors slam shut and won't open for a while
const KINDS = ['cut', 'storm', 'alarm', 'lock'];

export class Incidents {
  constructor(g, on) {
    this.g = g;
    this.on = !!on;
    this.nextT = 100 + Math.random() * 70; // host: seconds until the first one
    this.last = null;
    this.cutUntil = 0; this.stormUntil = 0;
    this.thunderT = 0; this.flashT = 0;
    this.em = g.sfx.emitter();
  }

  // Footsteps are this much quieter (the rain covers them).
  get stepScale() { return this.g.t < this.stormUntil ? 0.55 : 1; }
  dark() { return this.g.t < this.cutUntil; }

  // ---------- host ----------
  think(dt) {
    const g = this.g;
    if (!this.on || g.power || g.ended) return;
    this.nextT -= dt;
    if (this.nextT > 0) return;
    this.nextT = 150 + Math.random() * 110;
    const kinds = KINDS.filter((k) => k !== this.last && (k !== 'lock' || g.level.idoors.length >= 2));
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    this.last = k;
    const lv = g.level, T = g.targets();
    if (k === 'cut') g.broadcast({ t: 'incident', k, d: 22 });
    else if (k === 'storm') g.broadcast({ t: 'incident', k, d: 70 });
    else if (k === 'alarm') {
      const at = lv.randomFloor((q) => T.every((P) => Math.hypot(P.x - q.x, P.z - q.z) > 14));
      if (!at) { this.nextT = 20; return; }
      g.broadcast({ t: 'incident', k, x: +at.x.toFixed(1), z: +at.z.toFixed(1), d: 14 });
      // It goes to see what it is.
      if (!g.hunt.on) g.mimic.hear(at.x, at.z, 80, 'step');
      g.hunt.heard(at.x, at.z, 30);
      g.ls.hear(at.x, at.z, 80, 'voice');
    } else {
      // The doors nearest the players, so it matters.
      const doors = lv.idoors.map((d) => ({ d, n: Math.min(...T.map((P) => Math.hypot(P.x - d.x, P.z - d.z)), 99) }))
        .sort((a, b) => a.n - b.n).slice(0, 4).map((q) => q.d);
      for (const d of doors) d.jamUntil = g.t + 40;
      g.broadcast({ t: 'incident', k, doors: doors.map((d) => d.i), d: 40 });
      for (const d of doors) if (d.open) g.broadcast({ t: 'doorSet', i: d.i, open: false, by: 'lock' });
    }
  }

  // ---------- everyone ----------
  onNet(m) {
    if (m.t !== 'incident') return false;
    const g = this.g, d = Math.min(120, Number(m.d) || 20), live = g.state === 'playing' || g.state === 'spectate';
    switch (m.k) {
      case 'cut':
        this.cutUntil = g.t + d;
        if (live) { g.sfx.powerDown(); g.toast('The power just cut out.'); }
        break;
      case 'storm':
        this.stormUntil = g.t + d;
        this.thunderT = 1.5;
        if (live) { g.sfx.rain(true); g.toast('A storm. The rain is covering your footsteps.'); }
        break;
      case 'alarm': {
        const x = Number(m.x) || 0, z = Number(m.z) || 0, c = g.camera.position;
        this.em.setPos(x, 2.4, z);
        this.em.setOcclusion(!g.level.los(c.x, c.z, x, z));
        if (live) { g.sfx.siren(this.em, d); g.toast('Something set off an alarm.'); }
        break;
      }
      case 'lock': {
        const c = g.camera.position;
        for (const i of Array.isArray(m.doors) ? m.doors : []) {
          const door = g.level.idoors[i | 0];
          if (!door) continue;
          door.jamUntil = g.t + d;
          if (live && Math.hypot(door.x - c.x, door.z - c.z) < 30) {
            g.doorEm.setPos(door.x, 1.5, door.z);
            g.sfx.shutter(g.doorEm);
          }
        }
        if (live) g.toast('Lockdown. Doors are sealing.');
        break;
      }
    }
    return true;
  }

  update(dt) {
    const g = this.g;
    if (g.isHost) this.think(dt);
    // The power coming back after a cut: a clunk, and the lights stutter on.
    if (this.cutUntil && g.t >= this.cutUntil) {
      this.cutUntil = 0;
      g.sfx.clunk();
      for (const L of g.world.fixtures) L.burst = 0.6 + Math.random() * 0.8;
    }
    if (this.stormUntil) {
      if (g.t >= this.stormUntil) { this.stormUntil = 0; g.sfx.rain(false); }
      else if ((this.thunderT -= dt) <= 0) {
        this.thunderT = 7 + Math.random() * 9;
        const far = Math.random();
        g.sfx.thunder(far);
        // Lightning through the windows (not underground).
        if (far < 0.6 && g.level.theme.id !== 'facility' && !g.settings.calm) this.flashT = 0.35;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0.25 || (this.flashT > 0.05 && this.flashT < 0.15);
      g.hemi.intensity = on ? 2.4 : g.hemiBase;
      if (this.flashT <= 0) g.hemi.intensity = g.hemiBase;
    }
  }

  dispose() { this.g.sfx.rain(false); this.em.dispose(); }
}
