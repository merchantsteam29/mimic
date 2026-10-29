// The snow research station (snow theme only, alone and online, all of it local to each player):
// - the blizzard: the open yards between the huts (level.yards) have no roof. Out there snow drives past the camera,
//   the wind is loud and the fog closes in.
// - the cold: out in a yard you get colder (cold 0..1, about 25 s to freeze); inside, in a hut or a tunnel, you warm
//   back up. Cold slows you, frost creeps in at the edges of the picture, and past halfway
//   you shiver: your teeth chatter, loud enough for it to hear. Frozen through, you can't run.
// - the radio room: a radio set in one hut (prop 'radioset') that crackles into life when you're near, now and then
//   with a voice on it. Yours.
import * as THREE from 'three';

const FLAKES = 900, BOX = 14;

export class Snow {
  constructor(g) {
    this.g = g;
    this.on = !!g.level.theme.snow;
    this.cold = 0;
    this.out = 0; // 0..1 how outside the camera is (eases)
    if (!this.on) return;
    // Snow: points in a box that follows the camera, blown sideways.
    const pos = new Float32Array(FLAKES * 3);
    for (let i = 0; i < FLAKES * 3; i++) pos[i] = (Math.random() - 0.5) * BOX;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flakes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe6ee, size: 0.028, transparent: true, opacity: 0, depthWrite: false }));
    this.flakes.frustumCulled = false;
    g.scene.add(this.flakes);
    this.fog0 = g.scene.fog.density;
    this.wind = g.sfx.wind?.() || null;
    this.frost = document.getElementById('frost');
    this.radio = g.level.props.find((p) => p.type === 'radioset');
    this.radioEm = g.sfx.emitter();
    if (this.radio) this.radioEm.setPos(this.radio.x, 1.1, this.radio.z);
    this.radioT = 20;
    this.shiverT = 3;
  }

  // Cold slows you down (and frozen through, no running).
  get slow() { return this.on ? 1 - this.cold * 0.3 : 1; }
  get numb() { return this.on && this.cold > 0.95; }

  update(dt) {
    if (!this.on) return;
    const g = this.g, c = g.camera.position, lv = g.level;
    const outside = lv.outside(c.x, c.z);
    this.out += ((outside ? 1 : 0) - this.out) * Math.min(1, dt * 2);
    // The blizzard around the camera.
    const a = this.flakes.geometry.attributes.position, arr = a.array;
    for (let i = 0; i < FLAKES; i++) {
      arr[i * 3] += dt * 5.5; arr[i * 3 + 1] -= dt * (1.4 + (i % 7) * 0.2); arr[i * 3 + 2] += dt * 1.6 * Math.sin(g.t + i);
      for (let k = 0; k < 3; k++) if (arr[i * 3 + k] > BOX / 2) arr[i * 3 + k] -= BOX; else if (arr[i * 3 + k] < -BOX / 2) arr[i * 3 + k] += BOX;
    }
    a.needsUpdate = true;
    this.flakes.position.copy(c);
    this.flakes.material.opacity = 0.85 * this.out;
    g.scene.fog.density = this.fog0 * (1 + this.out * 0.7);
    this.wind?.set(0.25 + this.out * 0.75);
    // The cold: only while you're alive in the level.
    const live = g.state === 'playing' && !g.p.hidden;
    if (live && lv.outside(g.p.x, g.p.z)) this.cold = Math.min(1, this.cold + dt / 25);
    else this.cold = Math.max(0, this.cold - dt / (live ? 9 : 3));
    if (this.frost) this.frost.style.opacity = (this.cold * 0.9).toFixed(3);
    if (live && this.cold > 0.5 && (this.shiverT -= dt) <= 0) {
      this.shiverT = 2.2 + Math.random() * 2;
      g.sfx.chatter?.();
      g.noise(5 + this.cold * 5, 'step'); // teeth chattering: it can hear that
      if (!this.toldCold) { this.toldCold = true; g.toast('You\'re freezing. Get inside.'); }
    }
    // The radio set.
    if (this.radio && g.state === 'playing') {
      const d = Math.hypot(this.radio.x - g.p.x, this.radio.z - g.p.z);
      if (d < 7 && (this.radioT -= dt) <= 0) {
        this.radioT = 35 + Math.random() * 35;
        g.sfx.static(1.4, this.radioEm);
        const clip = Math.random() < 0.6 && g.voice.started ? g.voice.pick() : g.mp ? g.mp.clips.get(g.mp.pickKey(() => false)) : null;
        if (clip?.buffer) setTimeout(() => { if (g.state === 'playing') { const t = g.sfx.playVoice(clip.buffer, this.radioEm, 'radio'); g.voice.suppress(t + 0.3); } }, 900);
      }
    }
  }

  dispose() {
    if (!this.on) return;
    this.flakes.removeFromParent();
    this.flakes.geometry.dispose();
    this.wind?.stop();
    this.radioEm.dispose();
    if (this.frost) this.frost.style.opacity = 0;
  }
}
