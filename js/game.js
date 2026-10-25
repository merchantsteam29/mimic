// One run of the game: builds the level, runs the player, the mimic, lights, HUD and the win/lose flow.
import * as THREE from 'three';
import { generateLevel, buildLevelScene, CELL, WALL_H } from './level.js';
import { Mimic } from './mimic.js';
import { Director } from './director.js';

const POOL = 6;              // real point lights, moved to the nearest fixtures
const EYE = 1.62, EYE_CROUCH = 1.0;
const PLAYER_R = 0.3;
const BATTERY_LIFE = 300;    // seconds of flashlight on a full battery
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Game {
  constructor({ renderer, sfx, voice, settings, hud, themeId, seed, onEnd, noLock = false }) {
    Object.assign(this, { renderer, sfx, voice, settings, hud, onEnd, noLock });
    const level = this.level = generateLevel(seed, themeId);
    const th = level.theme;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.world = buildLevelScene(level);
    scene.add(this.world.group);
    scene.add(new THREE.HemisphereLight(th.id === 'house' ? 0x6a5a48 : 0x56687a, 0x0a0806, 0.15));

    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);

    // Flashlight: the only shadow-casting light.
    this.flash = new THREE.SpotLight(0xfff1d8, 0, 26, 0.42, 0.55, 1.4);
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.bias = -0.0006;
    this.flash.shadow.camera.near = 0.1;
    this.flash.shadow.camera.far = 26;
    scene.add(this.flash, this.flash.target);
    this.flashDir = new THREE.Vector3(0, 0, -1);

    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const l = new THREE.PointLight(th.light, 0, 10, 1.6);
      scene.add(l);
      this.pool.push(l);
    }
    this.assigned = [];
    this.poolT = 0;

    // Things you can use with E.
    const ex = level.exit;
    this.items = [
      ...this.world.fuses.map((f) => ({ type: 'fuse', x: f.x, y: 0.1, z: f.z, mesh: f.mesh, range: 2.1, active: true })),
      ...this.world.batteries.map((b) => ({ type: 'battery', x: b.x, y: 0.1, z: b.z, mesh: b.mesh, range: 2.1, active: true })),
      { type: 'fusebox', x: this.world.fuseBox.x, y: 1.35, z: this.world.fuseBox.z, range: 2.3, active: true },
      ...level.props.filter((p) => p.hide).map((p) => ({
        type: 'hide', prop: p, x: p.x - p.dx * (p.d / 2), y: 1.2, z: p.z - p.dz * (p.d / 2), range: 2.2, active: true,
      })),
      { type: 'exit', x: (ex.wx + 0.5) * CELL - ex.dx * (CELL / 2 + 0.15), y: 1.4, z: (ex.wz + 0.5) * CELL - ex.dz * (CELL / 2 + 0.15), range: 2.6, active: true },
    ];
    this.focus = null;

    const sp = level.spawnPos;
    this.p = {
      x: sp.x, z: sp.z, vx: 0, vz: 0, yaw: Math.random() * Math.PI * 2, pitch: 0, eye: EYE,
      stamina: 1, tired: false, battery: 100, flashOn: true, hidden: null, crouch: false, bob: 0, speed: 0,
    };
    this.fusesFound = 0; this.fusesHeld = 0; this.fusesIn = 0;
    this.power = false;
    this.doorT = -1;
    this.t = 0; this.time = 0;
    this.fear = 0; this.hbT = 0; this.pulseT = 0; this.breathT = 0; this.glitchT = 0; this.zoomT = 0;
    this.blackout = 0; this.blackoutTotal = 0;
    this.ambientT = 15 + Math.random() * 20;
    this.lures = 0;

    this.mimic = new Mimic(level, scene, sfx, {
      speak: (style, emitter) => this.mimicSpeaks(style, emitter),
      onCatch: () => this.caught(),
      onSpotted: () => this.sfx.sting(),
      onPeekSeen: () => { this.sfx.sting(); this.zoomT = 1; },
    });
    this.ambientEmitter = sfx.emitter();
    this.director = new Director(this);
    sfx.setReverb(...th.reverb);
    sfx.startAmbient(th.id);

    // Input.
    this.keys = new Set();
    this.onKeyDown = (e) => {
      if (this.state !== 'playing') return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyF') this.toggleFlash();
      if (e.code === 'KeyE') this.interact();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => this.keys.clear();
    this.onMouse = (e) => {
      if (this.state !== 'playing' || (!document.pointerLockElement && !this.noLock)) return;
      const s = 0.0022 * this.settings.mouse;
      this.p.yaw -= e.movementX * s;
      this.p.pitch = clamp(this.p.pitch - e.movementY * s, -1.45, 1.45);
    };
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    addEventListener('mousemove', this.onMouse);

    this.state = 'intro';
    this.updateCamera();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  // ---------- lifecycle ----------
  begin() {
    this.state = 'playing';
    this.hud.root.hidden = false;
    this.updateObjective();
    this.toast(this.level.name);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.keys.clear();
    this.sfx.ctx.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.last = undefined;
    this.sfx.ctx.resume();
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    removeEventListener('mousemove', this.onMouse);
    this.mimic.dispose();
    this.ambientEmitter.dispose();
    this.director.dispose();
    this.renderer.domElement.style.transform = this.renderer.domElement.style.filter = '';
    this.sfx.stopAmbient();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
    Object.values(this.world.textures).forEach((t) => t.dispose());
    this.flash.shadow.map?.dispose();
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    this.hud.fear.style.opacity = 0;
  }

  // ---------- main loop ----------
  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.last ?? now)) / 1000));
    this.last = now;
    if (this.state === 'playing') {
      this.t += dt;
      this.time += dt;
      this.updatePlayer(dt);
      this.updateFocus();
      this.updateVoice(dt);
      this.mimic.update(dt, this.playerInfo(), this.t);
      this.updateFear(dt);
      this.updateDoor(dt);
      this.updateAmbient(dt);
      this.director.update(dt);
    } else if (this.state === 'caught') {
      this.t += dt;
      this.updateCaught(dt);
    }
    if (this.state !== 'paused') this.updateLights(dt);
    this.updateCamera();
    this.updateFlash(dt);
    this.sfx.updateListener(this.camera);
    const c = this.camera.position;
    this.mimic.emitter.setOcclusion(!this.level.los(c.x, c.z, this.mimic.x, this.mimic.z));
    this.renderer.render(this.scene, this.camera);
  }

  playerInfo() {
    const p = this.p;
    return {
      x: p.x, z: p.z, hidden: p.hidden, crouch: p.crouch,
      flashOn: p.flashOn && p.battery > 0 && !p.hidden,
      lookX: -Math.sin(p.yaw), lookZ: -Math.cos(p.yaw),
    };
  }

  // ---------- player ----------
  updatePlayer(dt) {
    const p = this.p, k = this.keys;
    if (p.hidden) {
      // Peeking out through the slats: limited look, no movement.
      const dy = angleDiff(p.yaw, p.hideYaw);
      if (Math.abs(dy) > 0.7) p.yaw = p.hideYaw + Math.sign(dy) * 0.7;
      p.pitch = clamp(p.pitch, -0.5, 0.5);
      p.speed = 0;
      return;
    }
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    p.crouch = k.has('KeyC');
    const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && (f || s) && f >= 0 && !p.crouch && !p.tired;

    if (sprint) {
      p.stamina -= dt / 8;
      if (p.stamina <= 0) { p.stamina = 0; p.tired = true; }
    } else {
      p.stamina = Math.min(1, p.stamina + dt / (p.tired ? 5 : 3.5));
      if (p.tired && p.stamina > 0.25) p.tired = false;
    }

    const speed = p.crouch ? 1.4 : sprint ? 5.0 : 2.7;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const a = 1 - Math.exp(-dt * 12);
    p.vx += (wx * speed - p.vx) * a;
    p.vz += (wz * speed - p.vz) * a;
    const pos = this.level.collide({ x: p.x + p.vx * dt, z: p.z + p.vz * dt }, PLAYER_R);
    p.speed = Math.hypot(pos.x - p.x, pos.z - p.z) / dt;
    p.x = pos.x; p.z = pos.z;

    if (p.speed > 0.3) {
      const prev = p.bob;
      p.bob += dt * p.speed * 2.3;
      if (Math.floor(prev / Math.PI) !== Math.floor(p.bob / Math.PI)) this.footstep();
    }
    p.eye += ((p.crouch ? EYE_CROUCH : EYE) - p.eye) * (1 - Math.exp(-dt * 10));

    this.hud.stamina.classList.toggle('on', p.stamina < 0.99);
    this.hud.stamina.classList.toggle('tired', p.tired);
    this.hud.staminaBar.style.width = `${p.stamina * 100}%`;

    const ex = this.level.exit;
    if (this.level.exitOpen && this.level.cellOf(p.x) === ex.wx && this.level.cellOf(p.z) === ex.wz) this.end(true);
  }

  footstep() {
    const p = this.p;
    const run = p.speed > 4;
    this.sfx.footstep(null, { vol: p.crouch ? 0.3 : run ? 1.1 : 0.65, surface: this.level.theme.surface });
    this.mimic.hear(p.x, p.z, p.crouch ? 1 : run ? 9 : 3, 'step');
  }

  updateCamera() {
    const p = this.p, c = this.camera;
    const k = Math.min(1, p.speed / 3);
    c.position.set(p.x, p.eye + (Math.abs(Math.sin(p.bob)) * 0.06 - 0.03) * k, p.z);
    c.rotation.set(p.pitch, p.yaw, Math.sin(p.bob) * 0.008 * k);
    if (this.state === 'caught') {
      const shake = 0.04 * Math.max(0, 1 - this.ct / 1.6);
      c.rotation.x += (Math.random() - 0.5) * shake;
      c.rotation.y += (Math.random() - 0.5) * shake;
    }
  }

  toggleFlash() {
    if (this.p.hidden) return;
    this.p.flashOn = !this.p.flashOn;
    this.sfx.click();
  }

  updateFlash(dt) {
    const p = this.p;
    const on = (p.flashOn && p.battery > 0 && !p.hidden) || this.state === 'caught';
    if (on && this.state === 'playing') p.battery = Math.max(0, p.battery - (dt * 100) / BATTERY_LIFE);
    let I = on ? 38 : 0;
    if (this.blackout > 0 && this.state === 'playing') {
      const since = this.blackoutTotal - this.blackout;
      if (since < 1.8) I = 0;
      else if (since < 2.6 && Math.random() < 0.5) I *= 0.2;
    }
    if (on && p.battery < 15 && this.state === 'playing' && Math.random() < 0.06) I *= 0.15; // dying battery
    this.flash.intensity = I;
    const c = this.camera;
    const fwd = c.getWorldDirection(new THREE.Vector3());
    this.flashDir.lerp(fwd, 1 - Math.exp(-dt * 16)).normalize();
    this.flash.position.copy(c.localToWorld(new THREE.Vector3(0.12, -0.12, 0.05)));
    this.flash.target.position.copy(this.flash.position).addScaledVector(this.flashDir, 5);
    this.hud.batteryBar.style.width = `${p.battery}%`;
    this.hud.battery.classList.toggle('low', p.battery < 20);
  }

  // ---------- interaction ----------
  updateFocus() {
    const p = this.p;
    if (p.hidden) { this.focus = { type: 'unhide' }; this.setPrompt('Leave hiding spot'); return; }
    const c = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    let best = null, bestDot = 0;
    for (const it of this.items) {
      if (!it.active) continue;
      const dx = it.x - c.x, dy = it.y - c.y, dz = it.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d > it.range) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      const need = it.type === 'fuse' || it.type === 'battery' ? 0.86 : 0.72;
      if (dot < need || dot < bestDot || !this.level.los(c.x, c.z, it.x, it.z)) continue;
      best = it; bestDot = dot;
    }
    this.focus = best;
    const text = {
      fuse: 'Pick up fuse',
      battery: 'Take battery',
      fusebox: this.fusesHeld ? `Insert fuse${this.fusesHeld > 1 ? 's' : ''} (${this.fusesHeld})` : `Fuse box (${this.fusesIn}/4)`,
      hide: 'Hide',
      exit: 'Open exit',
    }[best?.type];
    this.setPrompt(text);
  }

  setPrompt(text) {
    if (text) this.hud.prompt.innerHTML = `<kbd>E</kbd>${text}`;
    this.hud.prompt.classList.toggle('on', !!text);
  }

  interact() {
    const f = this.focus;
    if (!f) return;
    switch (f.type) {
      case 'unhide': this.exitHide(); break;
      case 'fuse':
        f.active = false;
        f.mesh.removeFromParent();
        this.fusesFound++; this.fusesHeld++;
        this.mimic.aggro += 0.03; // it gets bolder as you get closer to leaving
        this.sfx.pickup();
        this.toast(`Fuse ${this.fusesFound}/4`);
        this.updateObjective();
        break;
      case 'battery':
        f.active = false;
        f.mesh.removeFromParent();
        this.p.battery = Math.min(100, this.p.battery + 60);
        this.sfx.pickup();
        this.toast('Flashlight battery');
        break;
      case 'fusebox':
        if (!this.fusesHeld) {
          this.sfx.denied();
          this.toast(`It needs ${4 - this.fusesIn} more fuse${4 - this.fusesIn > 1 ? 's' : ''}`);
          return;
        }
        for (let i = this.fusesIn; i < this.fusesIn + this.fusesHeld; i++) {
          this.world.fuseBox.slots[i].emissive.setHex(0x2bff5a);
          this.world.fuseBox.slots[i].color.setHex(0x002200);
        }
        this.fusesIn += this.fusesHeld;
        this.fusesHeld = 0;
        this.sfx.clunk();
        if (this.fusesIn >= 4) this.powerOn();
        else { this.toast(`${4 - this.fusesIn} more to go`); this.updateObjective(); }
        break;
      case 'hide': this.enterHide(f.prop); break;
      case 'exit':
        this.sfx.denied();
        this.toast('It won\'t open. There\'s no power.');
        break;
    }
  }

  enterHide(prop) {
    const p = this.p;
    p.hidden = prop;
    p.hideFrom = { x: p.x, z: p.z };
    p.hideYaw = Math.atan2(prop.dx, prop.dz); // look out of the front
    p.yaw = p.hideYaw; p.pitch = 0;
    p.x = prop.x; p.z = prop.z;
    p.vx = p.vz = 0;
    p.eye = 1.5;
    this.hud.locker.hidden = false;
    this.sfx.creak(null, 0.25);
    this.mimic.notifyHide(prop, this.playerInfo());
  }

  exitHide(silent = false) {
    const p = this.p, prop = p.hidden;
    if (!prop) return;
    p.hidden = null;
    p.x = prop.front.x; p.z = prop.front.z;
    this.hud.locker.hidden = true;
    if (!silent) this.sfx.creak(null, 0.25);
  }

  powerOn() {
    this.power = true;
    this.items.find((i) => i.type === 'exit').active = false;
    this.items.find((i) => i.type === 'fusebox').active = false;
    for (const L of this.world.fixtures) L.mat.emissive.setHex(0xff1020);
    this.sfx.alarm();
    this.sfx.rumble(3.2);
    this.doorT = 0;
    this.toast('Power restored');
    this.updateObjective();
    this.mimic.enrage(this.playerInfo());
  }

  updateDoor(dt) {
    if (this.doorT < 0 || this.doorT > 3) return;
    this.doorT += dt;
    const k = Math.min(1, this.doorT / 3);
    this.world.door.position.y = WALL_H / 2 + k * (WALL_H - 0.25);
    this.world.sign.position.y = WALL_H - 0.3 + k * (WALL_H - 0.25);
    if (this.doorT > 2.2) this.level.exitOpen = true;
  }

  updateObjective() {
    const o = this.hud.objective;
    o.classList.toggle('alarm', this.power);
    if (this.power) { o.textContent = 'THE EXIT IS OPEN. RUN.'; return; }
    const lines = [`Fuses found  ${this.fusesFound}/4`];
    lines.push(this.fusesIn ? `Fuse box  ${this.fusesIn}/4` : 'Restore power at the fuse box');
    o.textContent = lines.join('\n');
  }

  toast(text) {
    const t = this.hud.toast;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ---------- voice, fear, lights ----------
  mimicSpeaks(style, emitter) {
    const clip = this.voice.started ? this.voice.pick() : null;
    if (!clip) return this.sfx.whisper(emitter);
    const d = this.sfx.playVoice(clip.buffer, emitter, style);
    this.voice.suppress(d + 0.3);
    this.lures++;
    return d;
  }

  updateVoice(dt) {
    const v = this.voice, hud = this.hud, p = this.p;
    hud.mic.classList.toggle('off', !v.started);
    if (!v.started) return;
    hud.micBar.style.width = `${v.meter * 100}%`;
    hud.micLine.style.left = `${v.thresholdPos * 100}%`;
    let heard = false;
    if (v.hear > 0.05) {
      const radius = 4 + 18 * v.hear;
      const d = Math.hypot(this.mimic.x - p.x, this.mimic.z - p.z);
      heard = d <= radius;
      if (p.hidden && d < Math.min(radius, 8)) this.mimic.foundHidden(p.hidden);
      else this.mimic.hear(p.x, p.z, radius, 'voice');
    }
    if (heard) this.heardT = 1.2;
    this.heardT = Math.max(0, (this.heardT || 0) - dt);
    hud.mic.classList.toggle('heard', this.heardT > 0);
    hud.micText.textContent = this.heardT > 0 ? 'it heard you' : '';
  }

  updateFear(dt) {
    const p = this.p, m = this.mimic;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    const vis = this.level.los(p.x, p.z, m.x, m.z);
    let f = clamp(1 - d / 12, 0, 1) * (vis ? 1 : 0.45);
    if (m.state === 'chase' || m.state === 'hunt') f = Math.max(f, 0.45);
    this.fear += (f - this.fear) * (1 - Math.exp(-dt * 3));
    this.hud.fear.style.opacity = (this.fear * 0.85).toFixed(3);
    this.hud.grain.style.opacity = (0.08 + this.fear * 0.18).toFixed(3);
    if (this.fear > 0.15) {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.sfx.heartbeat(this.fear); this.hbT = 1.1 - this.fear * 0.65; }
    }

    // Sound: a dread drone swells as it gets closer (even through walls), and the background
    // goes silent when it's near and quiet. A pounding pulse while it chases you.
    const chasing = m.state === 'chase' || m.state === 'hunt';
    const near = clamp(1 - d / 20, 0, 1);
    this.sfx.setDread(chasing ? 1 : near * near);
    this.sfx.setAmbient(d < 8 && !chasing ? 0.1 : 1);
    if (chasing) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.sfx.pulse(); this.pulseT = 0.43; }
    }
    // Your own breathing: out of breath, or scared.
    const breath = Math.max(1 - p.stamina, this.fear * 1.2);
    if (breath > 0.3) {
      this.breathT -= dt;
      if (this.breathT <= 0) { this.sfx.playerBreath(Math.min(1, breath)); this.breathT = 1.7 - Math.min(1, breath) * 0.6; }
    }

    // The picture tears when it's close and in view.
    const cv = this.renderer.domElement;
    if (vis && d < 7 && Math.random() < dt * 7 * (1 - d / 7)) {
      cv.style.transform = `translate(${(Math.random() - 0.5) * 16}px, ${(Math.random() - 0.5) * 6}px)`;
      cv.style.filter = 'contrast(1.7) saturate(0.3)';
      this.glitchT = 0.05 + Math.random() * 0.06;
    }
    if (this.glitchT > 0) {
      this.glitchT -= dt;
      if (this.glitchT <= 0) cv.style.transform = cv.style.filter = '';
    }

    // Spotting it peeking: a quick dolly-zoom lurch toward it.
    if (this.zoomT > 0) {
      this.zoomT = Math.max(0, this.zoomT - dt * 0.9);
      this.camera.fov = this.settings.fov - 18 * Math.sin(Math.PI * this.zoomT);
      this.camera.updateProjectionMatrix();
    }
  }

  updateAmbient(dt) {
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 18 + Math.random() * 30;
    const p = this.level.randomFloor((q) => Math.hypot(q.x - this.p.x, q.z - this.p.z) > 10);
    if (!p) return;
    this.ambientEmitter.setPos(p.x, 1.5, p.z);
    if (this.level.theme.id === 'facility') this.sfx.clank(this.ambientEmitter, 0.5);
    else this.sfx.creak(this.ambientEmitter, 0.5);
  }

  updateLights(dt) {
    const t = this.t, th = this.level.theme, m = this.mimic;
    for (const L of this.world.fixtures) {
      let lvl = 1;
      if (L.broken && !this.power) lvl = 0;
      else {
        if (L.burst > 0) { L.burst -= dt; lvl = Math.sin(t * 67 + L.seed) > 0.1 ? 1 : 0.1; }
        else if (L.flicker && Math.random() < dt * 0.3) L.burst = 0.15 + Math.random() * 0.9;
        // Lights stutter when it walks under them.
        if (L.burst <= 0 && Math.hypot(L.x - m.x, L.z - m.z) < 5 && Math.random() < dt * 2.5) L.burst = 0.25 + Math.random() * 0.5;
        if (this.power) lvl *= 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 4.5));
      }
      if (this.blackout > 0 && Math.hypot(L.x - this.p.x, L.z - this.p.z) < 18) lvl = 0;
      L.level = lvl;
      L.mat.emissiveIntensity = lvl * 1.5;
    }
    this.poolT -= dt;
    if (this.poolT <= 0) {
      this.poolT = 0.25;
      const c = this.camera.position;
      this.assigned = this.world.fixtures.filter((L) => !L.broken || this.power)
        .map((L) => ({ L, d: Math.hypot(L.x - c.x, L.z - c.z) })).sort((a, b) => a.d - b.d)
        .slice(0, POOL).map((e) => e.L);
    }
    this.pool.forEach((pl, i) => {
      const L = this.assigned[i];
      if (!L) { pl.intensity = 0; return; }
      pl.position.set(L.x, L.y, L.z);
      pl.color.setHex(this.power ? 0xff1828 : th.light);
      pl.intensity = L.level * th.lightIntensity * (this.power ? 1.3 : 1);
    });
  }

  // ---------- death and escape ----------
  caught() {
    if (this.state !== 'playing') return;
    this.exitHide(true);
    this.state = 'caught';
    this.ct = 0;
    this.hud.locker.hidden = true;
    this.hud.root.hidden = true;
    this.hud.flash.classList.remove('hit');
    void this.hud.flash.offsetWidth;
    this.hud.flash.classList.add('hit');
    this.sfx.stopAmbient();
    this.sfx.screech();
    this.sfx.setDread(0);
    this.renderer.domElement.style.transform = this.renderer.domElement.style.filter = '';
    setTimeout(() => this.mimicSpeaks('scream', null), 150);
    // Turn to face it.
    const p = this.p, m = this.mimic;
    this.catchYaw = Math.atan2(-(m.x - p.x), -(m.z - p.z));
    p.speed = 0;
  }

  updateCaught(dt) {
    this.ct += dt;
    const p = this.p;
    const fx = -Math.sin(this.catchYaw), fz = -Math.cos(this.catchYaw);
    // It lunges in, then stays bent over right in your face.
    const dist = 1.25 + Math.max(0, 1 - this.ct * 5) * 0.6;
    this.mimic.pose(p.x + fx * dist, p.z + fz * dist, Math.atan2(-fx, -fz), this.t);
    const root = this.mimic.model.root;
    root.updateMatrixWorld(true);
    const head = this.mimic.model.head.getWorldPosition(new THREE.Vector3());
    const dx = head.x - p.x, dy = head.y - p.eye, dz = head.z - p.z;
    const k = Math.min(1, dt * 14);
    p.yaw += angleDiff(Math.atan2(-dx, -dz), p.yaw) * k;
    p.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * k;
    if (this.ct > 1.9 && this.state === 'caught') this.end(false);
  }

  end(won) {
    if (this.state === 'won' || this.state === 'dead') return;
    this.state = won ? 'won' : 'dead';
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    if (won) this.sfx.stopAmbient();
    this.onEnd({
      won, time: this.time, fuses: this.fusesFound, lures: this.lures,
      clips: this.voice.clips.length, place: this.level.name,
    });
  }
}
