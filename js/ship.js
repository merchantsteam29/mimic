// The ship in a storm (ship theme only, alone and online; everything here is local to each player):
// - the sea: the whole ship rolls (the camera tilts slowly from side to side) and now and then a big wave hits:
//   a lurch, everything groans, something falls over somewhere, and you're thrown a step sideways.
// - the storm: rain on the deck, thunder, lightning through the portholes.
// - the engine room: the big engine (prop 'engine') still turns over: pistons going, a heavy thump you can feel.
//   Near it (within 9 m) nobody hears your steps at all (stepScale).
// The flooded lower decks are Landmarks floods (landmarks.js): the rooms in the bottom third of the ship.
const ROLL = 0.035;

export class Ship {
  constructor(g) {
    this.g = g;
    this.on = !!g.level.theme.ship;
    this.lurch = 0;     // 0..1, a big wave hitting
    if (!this.on) return;
    this.engine = g.level.props.find((p) => p.type === 'engine');
    this.engineEm = g.sfx.emitter();
    if (this.engine) this.engineEm.setPos(this.engine.x, 1, this.engine.z);
    this.thumpT = 0;
    this.waveT = 25 + Math.random() * 20;
    this.thunderT = 6;
    this.flashT = 0;
    g.sfx.rain(true);
  }

  // Near the engine, your steps don't carry.
  stepScale(x, z) { return this.on && this.engine && Math.hypot(this.engine.x - x, this.engine.z - z) < 9 ? 0.15 : 1; }

  update(dt) {
    if (!this.on) return;
    const g = this.g;
    // A big wave every 40-70 s.
    if ((this.waveT -= dt) <= 0) {
      this.waveT = 40 + Math.random() * 30;
      this.lurch = 1;
      g.sfx.creak(null, 0.8);
      g.sfx.distant?.('ship', g.ambientEmitter);
      if (g.state === 'playing' && !g.p.hidden) { const s = Math.random() < 0.5 ? -1 : 1; g.p.vx += Math.cos(g.p.yaw) * 2.2 * s; g.p.vz -= Math.sin(g.p.yaw) * 2.2 * s; }
      if (!this.told && g.state === 'playing') { this.told = true; g.toast('The whole ship lurches.'); }
    }
    this.lurch = Math.max(0, this.lurch - dt / 4);
    // Thunder, and lightning through the portholes.
    if ((this.thunderT -= dt) <= 0) {
      this.thunderT = 8 + Math.random() * 12;
      const far = Math.random();
      g.sfx.thunder(far);
      if (far < 0.6 && !g.settings.calm) this.flashT = 0.35;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0.25 || (this.flashT > 0.05 && this.flashT < 0.15);
      g.hemi.intensity = on ? 1.8 : g.hemiBase;
      if (this.flashT <= 0) g.hemi.intensity = g.hemiBase;
    }
    // The engine.
    if (this.engine) {
      const c = g.camera.position;
      this.engineEm.setOcclusion(!g.level.los(c.x, c.z, this.engine.x, this.engine.z));
      if ((this.thumpT -= dt) <= 0) { this.thumpT = 0.55; g.sfx.engineThump?.(this.engineEm); }
      const pist = this.engine.mesh?.userData.pistons;
      if (pist) pist.forEach((p, i) => { p.position.y = p.userData.y0 + Math.sin(g.t * 11.4 + i * 2.1) * 0.18; });
    }
  }

  // After the camera is placed: the roll of the sea (and a wave's lurch).
  sway() {
    if (!this.on) return;
    const g = this.g, t = g.t, c = g.camera;
    const roll = Math.sin(t * 0.35) * ROLL + Math.sin(t * 1.7) * this.lurch * 0.09;
    c.rotation.z += g.settings.calm ? roll * 0.4 : roll;
    c.rotation.x += Math.sin(t * 0.27) * 0.012;
  }

  dispose() {
    if (!this.on) return;
    this.g.sfx.rain(false);
    this.engineEm.dispose();
  }
}
