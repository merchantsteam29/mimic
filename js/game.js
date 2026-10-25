// One run of the game: builds the level, runs the player, the mimic, lights, HUD and the win/lose flow.
//
// Alone or online, every shared event goes the same way: intents go to the host (send ->
// hostHandle), the host decides and tells everyone (broadcast -> onNet). Alone, this browser is
// the host. Online (mp = Session), the host's browser runs the mimic and the others show a puppet.
import * as THREE from 'three';
import { generateLevel, buildLevelScene, makeFuse, CELL, WALL_H } from './level.js';
import { Mimic } from './mimic.js';
import { Director } from './director.js';
import { RemotePlayer } from './remote.js';
import { Objectives } from './objectives.js';
import { Abilities } from './abilities.js';
import { Heartbeat } from './heartbeat.js';
import { Scares } from './scares.js';
import { Traitor } from './traitor.js';
import { Events } from './events.js';
import { Hand } from './hand.js';
import { mulberry32 } from './level.js';
import { keyLabel, rumble } from './controls.js';

const POOL = 6;              // real point lights, moved to the nearest fixtures
const EYE = 1.62, EYE_CROUCH = 1.0;
const PLAYER_R = 0.3;
const BATTERY_LIFE = 300;    // seconds of flashlight on a full battery
const NET_HZ = 15;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

export class Game {
  constructor({ renderer, sfx, voice, settings, hud, themeId, seed, onEnd, noLock = false, mp = null, order = null, classes = null, story = null, mode = 'normal', traitorId = null, vhs = null }) {
    Object.assign(this, { renderer, sfx, voice, settings, hud, onEnd, noLock, mp, story, vhs });
    this.distort = 0;    // camcorder distortion, 0..1
    this.peekHud = 0;    // seconds the HUD stays visible after something changes
    this.tabDown = false;
    this.me = mp ? mp.id : 'h';
    this.classes = classes || { [this.me]: 'runner' }; // player id -> class
    this.isHost = !mp || mp.isHost;
    this.order = order || [this.me];
    const level = this.level = generateLevel(seed, themeId, story ? { ...story.gen, lore: story.tapes.length } : {});
    const th = level.theme;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.world = buildLevelScene(level);
    scene.add(this.world.group);
    scene.add(new THREE.HemisphereLight(th.id === 'house' ? 0x6a5a48 : 0x56687a, 0x0a0806, 0.12));

    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);

    // Flashlight: the only shadow-casting light.
    this.flash = new THREE.SpotLight(0xfff1d8, 0, 24, 0.4, 0.55, 1.5);
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

    // Things you can use with E. Indexes are shared by every player (the level is built from the same seed).
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

    // Everyone starts in the same room, a step apart.
    const sp = level.spawnPos, idx = Math.max(0, this.order.indexOf(this.me));
    const start = level.collide({ x: sp.x + ((idx % 2) - 0.5) * 1.1, z: sp.z + ((idx >> 1) - 0.5) * 1.1 }, PLAYER_R);
    this.p = {
      x: start.x, z: start.z, vx: 0, vz: 0, yaw: Math.random() * Math.PI * 2, pitch: 0, eye: EYE,
      stamina: 1, tired: false, battery: 100, flashOn: true, hidden: null, crouch: false, bob: 0, speed: 0,
    };
    this.status = new Map(this.order.map((id) => [id, 'alive'])); // alive | dead | out | left
    this.held = new Map();      // host: fuses each player carries
    this.hostFusesIn = 0;       // host: fuses in the box
    this.fusesFound = 0; this.fusesHeld = 0; this.fusesIn = 0;
    this.power = false;
    this.doorT = -1;
    this.t = 0; this.time = 0;
    this.fear = 0; this.hbT = 0; this.pulseT = 0; this.breathT = 0; this.glitchT = 0; this.zoomT = 0;
    this.blackout = 0; this.blackoutTotal = 0;
    this.ambientT = 6 + Math.random() * 8;
    this.lures = 0;
    this.netT = 0; this.noiseT = 0;
    this.specIdx = 0;

    this.remotes = new Map();
    this.order.forEach((id, i) => { if (id !== this.me) this.remotes.set(id, new RemotePlayer(scene, sfx, i)); });

    this.mimic = new Mimic(level, scene, sfx, {
      speak: (style, emitter) => this.mimicSpeaks(style, emitter),
      onCatch: (id) => this.hostCatch(id),
      onSpotted: (id) => this.sendTo(id, { t: 'sting' }),
      onSniff: (id) => { this.sniffing = id; this.sendTo(id, { t: 'sniff' }); },
      isLit: (x, z) => this.world.fixtures.some((L) => L.level > 0.5 && (!L.broken || this.power) && Math.hypot(L.x - x, L.z - z) < 3.2),
      openDoor: (d) => this.broadcast({ t: 'doorSet', i: d.i, open: true, by: 'm' }),
      creakDoor: (d, fast) => this.broadcast({ t: 'creak', i: d.i, fast: fast ? 1 : 0 }),
      onPeekSeen: () => {}, // each player notices a peek themselves (see watchPeek)
    });
    if (mp) { this.mimic.lureStyle = 'distant'; this.mimic.stalkRange = [9, 16]; }
    if (story) this.mimic.graceT = story.grace;
    this.ambientEmitter = sfx.emitter();
    this.director = new Director(this);
    this.events = new Events(this);   // hand-placed scares
    this.hand = new Hand(this.camera); // your hand holding the flashlight
    this.obj = new Objectives(this);           // generators, tapes, keycard (adds their items)
    this.ab = new Abilities(this, this.classes[this.me] || 'runner');
    this.hb = new Heartbeat(this);
    level.idoors.forEach((d, i) => this.items.push({ type: 'idoor', i, x: d.x, y: 1.2, z: d.z, range: 2.3, active: true }));
    const dc = this.world.decoy;
    if (dc) this.items.push({ type: dc.kind, fake: true, x: dc.x, y: 0.1, z: dc.z, mesh: dc.mesh, range: 2.1, active: true });
    this.scares = new Scares(this);
    this.traitor = new Traitor(this, { mode, traitorId });
    this.doorEm = sfx.emitter();
    // Hunger: every couple of minutes it gets bolder, and lights die for good (in the same order for everyone).
    this.hungerT = 0;
    this.hungerSeen = 0;
    const hr = mulberry32(level.seed ^ 0xbeef);
    this.hungerOrder = this.world.fixtures.map((_, i) => i).sort((a, b) => a - b);
    for (let i = this.hungerOrder.length - 1; i > 0; i--) { const j = Math.floor(hr() * (i + 1)); [this.hungerOrder[i], this.hungerOrder[j]] = [this.hungerOrder[j], this.hungerOrder[i]]; }
    this.nextItem = this.items.length;         // host: index for things dropped by the dead
    if (!level.tasks.fuses) { // no fuses this run: the panel's fuse slots stay dark
      for (const it of this.items) if (it.type === 'fuse') { it.active = false; it.mesh.removeFromParent(); }
      for (const sl of this.world.fuseBox.slots) { sl.emissive.setHex(0x000000); sl.color.setHex(0x111111); }
      this.fusesIn = 4;
    }
    sfx.setReverb(...th.reverb);
    sfx.startAmbient(th.id);

    // Input.
    this.keys = new Set();
    this.onKeyDown = (e) => {
      if (this.menuOpen) return;
      if (this.state === 'spectate' && !e.repeat && (e.code === 'Space' || e.code === 'KeyE')) { this.specIdx++; return; }
      if (e.code === 'Tab') { e.preventDefault(); this.tabDown = true; return; } // hold Tab to see the HUD
      if (this.state !== 'playing') return;
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat && (this.traitor.onKey(e.code) || this.scares.onKey(e.code) || this.hb.onKey(e.code) || this.obj.onKey(e.code))) return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyF') this.toggleFlash();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyG') this.ab.use();
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); if (e.code === 'Tab') this.tabDown = false; };
    this.onBlur = () => this.keys.clear();
    this.onMouse = (e) => {
      if (this.state !== 'playing' || this.menuOpen || (!document.pointerLockElement && !this.noLock)) return;
      const s = 0.0022 * this.settings.mouse;
      this.look(e.movementX * s, e.movementY * s);
    };
    this.stick = null; // analog movement from a controller or the touch stick (controls.js), x/y in -1..1
    this.onClick = () => { if (this.state === 'spectate' && document.pointerLockElement) this.specIdx++; };
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    addEventListener('mousemove', this.onMouse);
    addEventListener('mousedown', this.onClick);

    // The host's world must keep running when its tab is in the background (requestAnimationFrame
    // stops there, but a worker's timer doesn't).
    if (mp && this.isHost) {
      const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50)'], { type: 'text/javascript' }));
      this.worker = new Worker(src);
      this.worker.onmessage = () => { if (performance.now() - (this.last || 0) > 200) this.simulate(0.05); };
    }

    this.state = 'intro';
    this.updateCamera();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  // ---------- lifecycle ----------
  begin() {
    if (this.state !== 'intro') return;
    this.state = 'playing';
    this.hud.root.hidden = false;
    this.hud.cam.hidden = false;
    this.peekHud = 6;
    this.updateObjective();
    this.toast(this.level.name);
  }

  // Turn the view (radians). The mouse, a controller's right stick and touch drags all come here.
  look(dx, dy) {
    if (this.state !== 'playing' || this.menuOpen) return;
    this.p.yaw -= dx;
    this.p.pitch = clamp(this.p.pitch - dy, -1.45, 1.45);
  }

  get paused() { return this.state === 'paused' || !!this.menuOpen; }

  pause() {
    if (this.mp) { this.menuOpen = true; this.keys.clear(); return; } // the world can't stop online
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.keys.clear();
    this.sfx.ctx.suspend();
  }

  resume() {
    if (this.mp) { this.menuOpen = false; return; }
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
    this.worker?.terminate();
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    removeEventListener('mousemove', this.onMouse);
    removeEventListener('mousedown', this.onClick);
    this.mimic.dispose();
    this.ambientEmitter.dispose();
    this.director.dispose();
    this.events.dispose();
    this.obj.dispose();
    this.ab.dispose();
    this.scares.dispose();
    this.traitor.dispose();
    this.doorEm.dispose();
    this.hb.stop();
    for (const r of this.remotes.values()) r.dispose();
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
    this.hud.spec.hidden = true;
    this.hud.cam.hidden = true;
    this.hud.signal.hidden = true;
    this.hud.fear.style.opacity = 0;
  }

  // ---------- networking glue ----------
  send(m) { if (this.mp) this.mp.send(m); else this.hostHandle(m, this.me); }
  broadcast(m) { if (this.mp) this.mp.broadcast(m); else this.onNet(m); }
  sendTo(id, m) { if (!this.mp || id === this.me) this.onNet(m); else this.mp.net.sendTo(id, m); }
  nameOf(id) { return this.mp ? this.mp.net.nameOf(id) : 'You'; }
  alive(id) { return this.status.get(id) === 'alive'; }

  // Host: a player's intent.
  hostHandle(m, from) {
    const r = this.remotes.get(from);
    if (this.obj.hostHandle(m, from) || this.ab.hostHandle(m, from) || this.traitor.hostHandle(m, from)) return;
    switch (m.t) {
      case 'door': { // open / close a real door
        const d = this.level.idoors[m.i | 0];
        if (!d || !this.alive(from)) break;
        if (d.jamUntil > this.t) { this.sendTo(from, { t: 'jammed' }); break; } // the traitor jammed it
        this.broadcast({ t: 'doorSet', i: d.i, open: !d.open, by: from });
        break;
      }
      case 'trapped': if (this.alive(from)) this.hostCatch(from); break; // the fake locker had them
      case 'fakeDone': this.broadcast({ t: 'fakeGone', p: m.p | 0 }); break;
      case 'sniffRes': // the hidden player's heartbeat game is over
        if (this.mimic.state === 'sniff' && this.mimic.targetId === from) {
          this.sniffing = null;
          this.mimic.endSniff(!!m.ok, this.infoOf(from));
        }
        break;
      case 'st': {
        if (!r || !this.alive(from) || !Array.isArray(m.s)) return;
        const s = m.s.map((v) => num(v));
        const wasHidden = r.hidden;
        r.setState(s);
        if (r.hidden >= 0 && !this.level.props[r.hidden]) r.hidden = -1;
        if (wasHidden < 0 && r.hidden >= 0) this.mimic.notifyHide(this.level.props[r.hidden], this.infoOf(from));
        break;
      }
      case 'noise': {
        if (!this.alive(from)) return;
        const x = num(m.x), z = num(m.z), rad = clamp(num(m.r), 0, 25);
        const prop = r && r.hidden >= 0 ? this.level.props[r.hidden] : null;
        const d = Math.hypot(this.mimic.x - x, this.mimic.z - z);
        if (m.k === 'voice' && prop && d < Math.min(rad, 8)) this.mimic.foundHidden(prop, from);
        else this.mimic.hear(x, z, rad, m.k === 'voice' ? 'voice' : 'step');
        break;
      }
      case 'take': {
        const it = this.items[m.i];
        if (!it || !it.active || !['fuse', 'battery', 'keycard'].includes(it.type) || !this.alive(from)) return;
        if (it.fake) { // the decoy: it was it
          it.active = false;
          this.mimic.hear(it.x, it.z, 15, 'step');
          this.broadcast({ t: 'fakeItem', i: m.i, by: from });
          return;
        }
        it.active = false;
        if (it.type === 'fuse') { this.held.set(from, (this.held.get(from) || 0) + 1); this.mimic.aggro += 0.03; }
        this.broadcast({ t: 'took', i: m.i, by: from });
        break;
      }
      case 'insert': {
        const n = this.held.get(from) || 0;
        if (!n || this.power || !this.alive(from)) return;
        this.held.set(from, 0);
        this.hostFusesIn = Math.min(4, this.hostFusesIn + n);
        this.broadcast({ t: 'fuses', ins: this.hostFusesIn, by: from });
        break;
      }
      case 'escaped': {
        if (!this.alive(from) || !this.level.exitOpen) return;
        this.held.set(from, 0);
        this.broadcast({ t: 'out', id: from });
        break;
      }
      case 'quit': { // a player's connection dropped
        if (!this.status.has(m.id) || this.status.get(m.id) === 'left') return;
        this.dropFuses(m.id);
        this.broadcast({ t: 'left', id: m.id });
        break;
      }
    }
  }

  // Everyone: what happened.
  onNet(m) {
    if (this.obj.onNet(m) || this.ab.onNet(m) || this.traitor.onNet(m)) return;
    switch (m.t) {
      case 'doorSet': {
        const d = this.level.idoors[m.i | 0];
        if (!d) return;
        d.open = !!m.open;
        const c = this.camera.position;
        this.doorEm.setPos(d.x, 1.2, d.z);
        this.doorEm.setOcclusion(!this.level.los(c.x, c.z, d.x - d.dx * 0.3, d.z - d.dz * 0.3));
        this.sfx.door(this.doorEm, d.open, m.by === 'm' && this.mimic.state === 'chase');
        break;
      }
      case 'creak': { // its hand on the door handle
        const d = this.level.idoors[m.i | 0];
        if (!d) return;
        this.doorEm.setPos(d.x, 1.2, d.z);
        this.sfx.handle(this.doorEm, !!m.fast);
        break;
      }
      case 'fakeGone': { const pr = this.level.props[m.p]; if (pr) this.scares.fakeGone(pr); break; }
      case 'fakeItem': {
        const it = this.items[m.i];
        if (!it) return;
        it.active = false;
        // It scuttles off into the dark.
        if (it.mesh) {
          const a = Math.random() * Math.PI * 2, mesh = it.mesh, t0 = performance.now();
          const run = () => {
            const k = (performance.now() - t0) / 600;
            mesh.position.x += Math.sin(a) * 0.12; mesh.position.z += Math.cos(a) * 0.12;
            if (k < 1) requestAnimationFrame(run); else mesh.removeFromParent();
          };
          run();
        }
        if (m.by === this.me) {
          this.sfx.bite();
          this.hud.flash.classList.remove('hit');
          void this.hud.flash.offsetWidth;
          this.hud.flash.classList.add('hit');
          this.toast('It bit you.');
          this.p.stamina = 0; this.p.tired = true;
          this.p.battery = Math.max(0, this.p.battery - 25);
        }
        break;
      }
      case 'sniff': this.hb.start(); break;
      case 'sniffEnd': if (this.hb.on) { this.hb.stop(); this.toast('It went away… for now.'); } break;
      case 'snap': {
        if (this.isHost) return;
        if (Array.isArray(m.m) && !(this.state === 'caught')) this.mimic.applySnap(m.m);
        for (const row of m.p || []) {
          const r = this.remotes.get(row[0]);
          if (r) r.setState(row.slice(1).map((v) => num(v)));
        }
        break;
      }
      case 'say': {
        let d;
        if (Array.isArray(m.keys)) { // the chorus: several voices at once
          const bufs = m.keys.map((k) => this.mp?.clips.get(k)?.buffer).filter(Boolean);
          d = bufs.length ? this.sfx.chorus(bufs, this.mimic.emitter) : this.sfx.whisper(this.mimic.emitter);
        } else {
          const c = m.key && this.mp?.clips.get(m.key);
          d = c ? this.sfx.playVoice(c.buffer, this.mimic.emitter, m.style) : this.sfx.whisper(this.mimic.emitter);
        }
        if (!this.isHost) this.mimic.speaking = d;
        this.voice.suppress(d + 0.3);
        this.lures++;
        break;
      }
      case 'sting': if (this.state === 'playing') this.sfx.sting(this.mimic.emitter); break;
      case 'took': {
        const it = this.items[m.i];
        if (!it) return;
        it.active = false;
        it.mesh?.removeFromParent();
        const mine = m.by === this.me;
        if (it.type === 'keycard') { this.obj.tookKey(m.by); if (mine) this.events.progress('key'); }
        else if (it.type === 'fuse') {
          this.fusesFound++;
          if (mine) { this.fusesHeld++; this.sfx.pickup(); this.toast(`Fuse ${this.fusesFound}/4`); this.events.progress('fuse'); }
        } else if (mine) {
          this.p.battery = Math.min(100, this.p.battery + 60);
          this.sfx.pickup();
          this.toast('Flashlight battery');
        }
        this.updateObjective();
        break;
      }
      case 'drop': { // what a player was carrying when they were taken
        const key = m.kind === 'keycard';
        const mesh = key ? new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.055), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, emissive: 0x2a4a7a })) : makeFuse();
        mesh.position.set(m.x, key ? 0.005 : 0.06, m.z);
        this.world.group.add(mesh);
        this.items[m.i] = { type: key ? 'keycard' : 'fuse', x: m.x, y: 0.1, z: m.z, mesh, range: 2.1, active: true };
        if (key) this.obj.droppedKey();
        else this.fusesFound = Math.max(0, this.fusesFound - 1);
        this.updateObjective();
        break;
      }
      case 'fuses': {
        if (this.level.tasks.fuses) this.world.fuseBox.slots.forEach((sl, i) => {
          sl.emissive.setHex(i < m.ins ? 0x2bff5a : 0xff1a1a);
          sl.color.setHex(i < m.ins ? 0x002200 : 0x220000);
        });
        if (m.pulled) { // someone pulled a fuse back out
          const fb = this.world.fuseBox, c = this.camera.position;
          this.doorEm.setPos(fb.x, 1.3, fb.z);
          this.doorEm.setOcclusion(!this.level.los(c.x, c.z, fb.x - this.level.fuseBox.dx * 0.3, fb.z - this.level.fuseBox.dz * 0.3));
          this.sfx.clunk();
        }
        this.fusesIn = m.ins;
        if (m.by === this.me) {
          this.fusesHeld = 0;
          this.sfx.clunk();
          if (m.ins < 4) this.toast(`${4 - m.ins} more to go`);
        }
        this.updateObjective();
        break;
      }
      case 'power': this.powerOn(m.by); break;
      case 'caught': {
        this.status.set(m.id, 'dead');
        if (m.id === this.me) this.caught();
        // Nobody else is told. Their voice just stops, as if they wandered off.
        else if (this.alive(this.me)) this.mp?.vc?.route(m.id, { on: false });
        this.checkEnd();
        break;
      }
      case 'out': {
        this.status.set(m.id, 'out');
        if (m.id === this.me) { this.toast('You got out.'); this.startSpectate(); }
        else this.toast(`${this.nameOf(m.id)} got out`);
        this.checkEnd();
        break;
      }
      case 'left': {
        this.status.set(m.id, 'left');
        if (this.state === 'playing') this.toast(`${this.nameOf(m.id)} left the game`);
        this.checkEnd();
        break;
      }
      case 'end': this.finish(m); break;
    }
  }

  // Host: did everyone get out or get taken?
  checkEnd() {
    if (!this.isHost || this.ended) return;
    if ([...this.status.values()].some((s) => s === 'alive')) return;
    this.ended = true;
    if (!this.mp) return; // alone, the jumpscare / escape ends the run itself
    this.broadcast({ t: 'end', st: Object.fromEntries(this.status), time: this.time, mode: this.traitor.on ? 'story' : 'normal', ...this.traitor.result() });
  }

  // Host: the mimic reached a player.
  hostCatch(id) {
    if (!this.alive(id)) return;
    if (this.ab.hostSave(id)) return; // a medic's rescue: they tear free
    this.dropFuses(id);
    this.mimic.shyT = 8; // it lets the others breathe for a moment
    this.mimic.state = 'wander';
    this.mimic.path = [];
    this.broadcast({ t: 'caught', id });
  }

  dropFuses(id) {
    const n = this.held.get(id) || 0;
    this.held.set(id, 0);
    const at = id === this.me ? this.p : this.remotes.get(id);
    if (!at) return;
    if (this.obj.keyHolder === id) {
      this.obj.keyHolder = null;
      const pos = this.level.collide({ x: at.x, z: at.z }, 0.2);
      this.broadcast({ t: 'drop', kind: 'keycard', i: this.nextItem++, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) });
    }
    for (let k = 0; k < n; k++) {
      const pos = this.level.collide({ x: at.x + (Math.random() - 0.5) * 0.8, z: at.z + (Math.random() - 0.5) * 0.8 }, 0.2);
      this.broadcast({ t: 'drop', i: this.nextItem++, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) });
    }
  }

  // ---------- main loop ----------
  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.last ?? now)) / 1000));
    this.last = now;
    this.simulate(dt);
    this.render(dt);
  }

  simulate(dt) {
    if (this.state === 'ended' || this.state === 'paused') return;
    this.t += dt;
    if (this.state === 'playing') {
      this.time += dt;
      this.updatePlayer(dt);
      this.updateFocus();
      this.updateVoice(dt);
      this.updateFear(dt);
      this.updateAmbient(dt);
      this.director.update(dt);
      this.events.update(dt);
      this.watchPeek();
      this.obj.update(dt);
      this.hb.update(dt);
      if (this.isHost && !this.power) this.updateHunger(dt);
    } else if (this.state === 'caught') this.updateCaught(dt);
    this.updateDoor(dt);
    this.ab.update(dt);
    this.scares.update(dt);
    this.traitor.update(dt);
    this.updateDoors(dt);
    this.applyHunger();
    if (this.isHost && this.mp) this.updateWear();
    // The mimic left a hiding spot without a verdict (a flare, say): end that player's heartbeat game.
    if (this.isHost && this.sniffing && this.mimic.state !== 'sniff') { this.sendTo(this.sniffing, { t: 'sniffEnd' }); this.sniffing = null; }

    if (!this.isHost) this.mimic.puppet(dt, this.t);
    else if (this.mp || this.state === 'playing') this.mimic.update(dt, this.targets(), this.t);

    const watching = this.state === 'spectate' ? this.specTarget() : null;
    const worn = this.mimic.wearId && this.remotes.get(this.mimic.wearId);
    for (const [id, r] of this.remotes) {
      if (r === worn) { // it walks around as them
        r.status = 'alive'; r.hidden = -1; r.seen = true; r.flash = true; r.crouch = false; r.pitch = 0;
        r.tx = this.mimic.x; r.tz = this.mimic.z; r.tyaw = this.mimic.yaw + Math.PI;
      } else if (!this.alive(id)) r.status = 'gone';
      r.update(dt, this.level.theme.surface, r === watching);
      // Up close, something's wrong with how it holds its head.
      if (r === worn && Math.hypot(r.x - this.camera.position.x, r.z - this.camera.position.z) < 3.5) {
        r.head.rotation.z = 0.6 + Math.sin(this.t * 25) * 0.15;
      } else r.head.rotation.z = 0;
    }
    if (this.mp) { this.netTick(dt); this.routeVoices(); }
  }

  render(dt) {
    if (this.state !== 'paused') this.updateLights(dt);
    this.updateCamera();
    this.updateFlash(dt);
    this.sfx.updateListener(this.camera);
    const c = this.camera.position;
    this.mimic.emitter.setOcclusion(!this.level.los(c.x, c.z, this.mimic.x, this.mimic.z));
    for (const r of this.remotes.values()) r.emitter.setOcclusion(!this.level.los(c.x, c.z, r.x, r.z));
    this.updateCam(dt);
    if (this.vhs) this.vhs.render(this.scene, this.camera, this.t, this.distort);
    else this.renderer.render(this.scene, this.camera);
  }

  netTick(dt) {
    this.netT -= dt;
    if (this.netT > 0) return;
    this.netT = 1 / NET_HZ;
    const mine = this.myState();
    if (this.isHost) {
      const rows = [];
      if (mine) rows.push([this.me, ...mine]);
      for (const [id, r] of this.remotes) if (this.alive(id) && r.seen) rows.push([id, +r.tx.toFixed(2), +r.tz.toFixed(2), +r.tyaw.toFixed(2), +r.pitch.toFixed(2), r.crouch ? 1 : 0, r.flash ? 1 : 0, r.hidden]);
      this.mp.net.broadcast({ t: 'snap', m: this.mimic.snap(), p: rows }, { self: false });
    } else if (mine) this.send({ t: 'st', s: mine });
  }

  // [x, z, yaw, pitch, crouch, flash, hiddenProp] while I'm alive in the level.
  myState() {
    if (!this.alive(this.me) || this.state === 'caught') return null;
    const p = this.p;
    return [+p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2), p.crouch ? 1 : 0,
      p.flashOn && p.battery > 0 && !p.hidden ? 1 : 0, p.hidden ? this.level.props.indexOf(p.hidden) : -1];
  }

  // Proximity voice: the living hear the living around them; the dead hear everyone.
  routeVoices() {
    const vc = this.mp.vc;
    if (!vc) return;
    const meAlive = this.alive(this.me), c = this.camera.position;
    for (const [id, r] of this.remotes) {
      if (!this.alive(id)) { vc.route(id, { on: !meAlive }); continue; }
      const d = Math.hypot(r.x - c.x, r.z - c.z);
      const volume = clamp(1.25 - d / 24, 0, 1);
      vc.route(id, { on: volume > 0, volume, pos: { x: r.x, y: r.eye, z: r.z }, occluded: !this.level.los(c.x, c.z, r.x, r.z) });
    }
  }

  // Who the mimic can hunt.
  targets() {
    const list = [];
    if (this.alive(this.me) && this.state !== 'caught' && this.state !== 'spectate') list.push(this.playerInfo());
    for (const [id] of this.remotes) if (this.alive(id) && this.remotes.get(id).seen) list.push(this.infoOf(id));
    return list;
  }

  playerInfo() {
    const p = this.p;
    return {
      id: this.me, x: p.x, z: p.z, yaw: p.yaw, hidden: p.hidden, crouch: p.crouch,
      flashOn: p.flashOn && p.battery > 0 && !p.hidden,
      lookX: -Math.sin(p.yaw), lookZ: -Math.cos(p.yaw),
    };
  }

  infoOf(id) {
    if (id === this.me) return this.playerInfo();
    const r = this.remotes.get(id);
    return {
      id, x: r.tx, z: r.tz, yaw: r.tyaw, hidden: r.hidden >= 0 ? this.level.props[r.hidden] : null, crouch: r.crouch,
      flashOn: r.flash, lookX: -Math.sin(r.tyaw), lookZ: -Math.cos(r.tyaw),
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
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (this.stick) { f = clamp(f - this.stick.y, -1, 1); s = clamp(s + this.stick.x, -1, 1); }
    const push = Math.min(1, Math.hypot(f, s)); // a half-pushed stick walks slower
    p.crouch = k.has('KeyC');
    const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) && (f || s) && f >= 0 && !p.crouch && !p.tired;

    if (sprint) {
      p.stamina -= dt / this.ab.staminaTime;
      if (p.stamina <= 0) { p.stamina = 0; p.tired = true; }
    } else {
      p.stamina = Math.min(1, p.stamina + dt / (p.tired ? this.ab.recover * 1.4 : this.ab.recover));
      if (p.tired && p.stamina > 0.25) p.tired = false;
    }

    const speed = p.crouch ? 1.4 : sprint ? this.ab.sprint : 2.7 * (this.ab.boostT > 0 ? 1.25 : 1);
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx *= push / wl; wz *= push / wl; }
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
    if (this.level.exitOpen && this.level.cellOf(p.x) === ex.wx && this.level.cellOf(p.z) === ex.wz) {
      if (!this.mp) this.end(true);
      else if (!this.escapeSent) { this.escapeSent = true; this.send({ t: 'escaped' }); }
    }
  }

  footstep() {
    const p = this.p;
    const run = p.speed > 4;
    this.sfx.footstep(null, { vol: p.crouch ? 0.3 : run ? 1.1 : 0.65, surface: this.level.theme.surface });
    this.noise(p.crouch ? 1 : run ? this.ab.sprintNoise : 3, 'step');
  }

  // Something the mimic might hear, at my position.
  noise(radius, kind) {
    const p = this.p;
    if (this.isHost) {
      if (kind === 'voice' && p.hidden && Math.hypot(this.mimic.x - p.x, this.mimic.z - p.z) < Math.min(radius, 8)) this.mimic.foundHidden(p.hidden, this.me);
      else this.mimic.hear(p.x, p.z, radius, kind);
    } else this.send({ t: 'noise', x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +radius.toFixed(1), k: kind });
  }

  updateCamera() {
    const c = this.camera;
    if (this.state === 'spectate') {
      const r = this.specTarget();
      if (r) { c.position.set(r.x, r.eye, r.z); c.rotation.set(r.pitch, r.yaw, 0); }
      return;
    }
    const p = this.p;
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
    let on = (p.flashOn && p.battery > 0 && !p.hidden) || this.state === 'caught';
    if (this.state === 'spectate') on = !!this.specTarget()?.flash;
    if (on && this.state === 'playing') p.battery = Math.max(0, p.battery - (dt * 100) / BATTERY_LIFE);
    let I = on ? (this.state === 'caught' ? 20 : 42) : 0; // a little dimmer in its face, so it isn't washed out
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
    this.hand.update(dt, { yaw: p.yaw, pitch: p.pitch, bob: p.bob, speed: p.speed, fear: this.fear, on: on && I > 0, visible: this.state === 'playing' && !p.hidden });
    this.flash.position.copy(this.state === 'playing' && !p.hidden ? this.hand.lensWorld(new THREE.Vector3()) : c.localToWorld(new THREE.Vector3(0.12, -0.12, 0.05)));
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
      if (!it?.active || it.pending > this.t) continue;
      const dx = it.x - c.x, dy = it.y - c.y, dz = it.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d > it.range) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      const need = it.type === 'fuse' || it.type === 'battery' ? 0.86 : 0.72;
      // (A shut door blocks sight of itself, so doors skip the line-of-sight check.)
      if (dot < need || dot < bestDot || (it.type !== 'idoor' && !this.level.los(c.x, c.z, it.x, it.z))) continue;
      best = it; bestDot = dot;
    }
    this.focus = best;
    let custom = best && (this.obj.prompt(best) ?? this.scares.prompt(best));
    if (best?.type === 'idoor') custom = this.level.idoors[best.i].open ? 'Close door' : 'Open door';
    if (custom !== undefined) { this.setPrompt(custom); return; }
    const text = {
      fuse: 'Pick up fuse',
      battery: 'Take battery',
      fusebox: (this.fusesHeld && this.fusesIn < 4 ? `Insert fuse${this.fusesHeld > 1 ? 's' : ''} (${this.fusesHeld})` : this.obj.allDone() ? 'Restore power' : 'Power panel') + this.traitor.panelHint(),
      hide: 'Hide',
      exit: 'Open exit',
    }[best?.type];
    this.setPrompt(text);
  }

  setPrompt(text) {
    if (text) this.hud.prompt.innerHTML = `<kbd>${keyLabel('E')}</kbd>${text}`;
    this.hud.prompt.classList.toggle('on', !!text);
  }

  interact() {
    const f = this.focus;
    if (!f || this.obj.interact(f) || this.scares.interact(f)) return;
    if (f.type === 'idoor') { this.send({ t: 'door', i: f.i }); return; }
    switch (f.type) {
      case 'unhide': this.exitHide(); break;
      case 'fuse':
      case 'battery':
        f.pending = this.t + 1; // the host confirms (instantly when alone)
        this.send({ t: 'take', i: this.items.indexOf(f) });
        break;
      case 'fusebox':
        if (this.fusesHeld && this.fusesIn < 4) { this.send({ t: 'insert' }); break; }
        if (this.obj.allDone()) { this.send({ t: 'lever' }); break; }
        this.sfx.denied();
        this.toast(this.missing());
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
    this.sfx.cloth();
    if (this.scares.trap(prop)) return; // it was it
    this.events.onHide();
    if (this.isHost) this.mimic.notifyHide(prop, this.playerInfo());
  }

  exitHide(silent = false) {
    const p = this.p, prop = p.hidden;
    if (!prop) return;
    p.hidden = null;
    p.x = prop.front.x; p.z = prop.front.z;
    this.hud.locker.hidden = true;
    if (!silent) this.sfx.creak(null, 0.25);
  }

  powerOn(by) {
    if (this.power) return;
    this.power = true;
    this.items.find((i) => i?.type === 'exit').active = false;
    this.items.find((i) => i?.type === 'fusebox').active = false;
    for (const L of this.world.fixtures) L.mat.emissive.setHex(0xff1020);
    if (this.state === 'playing' || this.state === 'spectate') { this.sfx.alarm(); this.sfx.rumble(3.2); }
    this.doorT = 0;
    if (this.state === 'playing') this.toast('Power restored');
    this.updateObjective();
    if (this.isHost) {
      const ts = this.targets();
      const P = ts.find((q) => q.id === by) || ts[0];
      if (P) this.mimic.enrage(P);
    }
  }

  updateDoor(dt) {
    if (this.doorT < 0 || this.doorT > 3) return;
    this.doorT += dt;
    const k = Math.min(1, this.doorT / 3);
    this.world.door.position.y = WALL_H / 2 + k * (WALL_H - 0.25);
    this.world.sign.position.y = WALL_H - 0.3 + k * (WALL_H - 0.25);
    if (this.doorT > 2.2) this.level.exitOpen = true;
  }

  // The camcorder overlay: timestamp (it's 2:13 a.m. when you go in), tape counter, battery; and the HUD's visibility.
  updateCam(dt) {
    this.peekHud = Math.max(0, this.peekHud - dt);
    this.hud.root.classList.toggle('reveal', this.tabDown || this.peekHud > 0);
    const sec = Math.floor(this.time);
    if (sec !== this.camSec) {
      this.camSec = sec;
      const clock = 2 * 3600 + 13 * 60 + 7 + sec, h = Math.floor(clock / 3600) % 12 || 12;
      const two = (n) => String(n).padStart(2, '0');
      this.hud.camStamp.textContent = `OCT 25 2026\n${two(h)}:${two(Math.floor(clock / 60) % 60)}:${two(clock % 60)} AM`;
      this.hud.camCounter.textContent = `SP ▶ ${Math.floor(sec / 3600)}:${two(Math.floor(sec / 60) % 60)}:${two(sec % 60)}`;
    }
    this.hud.camBat.style.width = `calc(${this.p.battery}% - 6px)`;
    this.hud.camBatBox.classList.toggle('low', this.p.battery < 20);
  }

  updateObjective() {
    this.peekHud = Math.max(this.peekHud, 4); // something changed: show the HUD for a moment
    const o = this.hud.objective;
    o.classList.toggle('alarm', this.power);
    if (this.power) { o.textContent = 'THE EXIT IS OPEN. RUN.'; return; }
    if (!this.obj) return;
    const lines = [];
    if (this.level.tasks.fuses) {
      lines.push(`Fuses found  ${this.fusesFound}/4  ·  in the panel  ${this.fusesIn}/4`);
      if (this.mp && this.fusesHeld) lines.push(`Carrying  ${this.fusesHeld}`);
    }
    lines.push(...this.obj.lines());
    if (this.obj.allDone()) lines.push('Restore power at the panel');
    o.textContent = lines.join('\n');
  }

  // Why the power won't come on yet.
  missing() {
    if (this.level.tasks.fuses && this.fusesIn < 4) return `The panel needs ${4 - this.fusesIn} more fuse${4 - this.fusesIn > 1 ? 's' : ''}`;
    if (this.obj.gen.some((p) => p < 1)) return 'The generators are still dead';
    if (this.obj.tapesLeft) return 'Its tapes are still recording';
    if (this.obj.storyHeard() < this.obj.storyNeed()) return `${this.story.tapeLabel}: ${this.obj.storyHeard()}/${this.obj.storyNeed()} found`;
    return 'The power won\'t come on yet';
  }

  // Your own "I found something. Come here." from the voice check (or any recording of you).
  playOwnVoice() {
    const own = this.voice.clips.filter((c) => c.tag === 'seed');
    const clip = own[1] || own[0] || this.voice.clips[this.voice.clips.length - 1];
    if (!clip) return;
    const d = this.sfx.playVoice(clip.buffer, null, 'echo');
    this.voice.suppress(d + 0.3);
  }

  toast(text) {
    const t = this.hud.toast;
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ---------- voice, fear, lights ----------
  // The mimic (host) talks: everyone hears the same clip from it.
  mimicSpeaks(style, emitter) {
    const dead = (owner) => this.status.get(owner) === 'dead';
    if (style === 'chorus') {
      if (!this.mp) {
        const bufs = this.voice.clips.slice().sort(() => Math.random() - 0.5).slice(0, 3).map((c) => c.buffer);
        return bufs.length ? this.sfx.chorus(bufs, emitter) : this.sfx.whisper(emitter);
      }
      const keys = [...new Set([0, 1, 2].map(() => this.mp.pickKey(dead)).filter(Boolean))];
      this.broadcast({ t: 'say', keys, style });
      return 3;
    }
    if (!this.mp) return this.localSpeak(style, emitter);
    const wearing = this.mimic.wearId;
    const key = this.mp.pickKey(dead, wearing);
    this.broadcast({ t: 'say', key, style: wearing && style !== 'scream' ? 'lure' : style });
    const c = key && this.mp.clips.get(key);
    return c ? c.buffer.duration / (style === 'scream' ? 0.6 : 0.98) : 1.2;
  }

  // A voice only I hear (the director's tricks, the jumpscare).
  localSpeak(style, emitter) {
    // Alone, your own voice is too obviously the mimic, so it disguises it: a stranger (pitched, over a
    // bad phone line), a sentence stitched from two recordings, or, in the story, Ellie.
    if (!this.mp && (style === 'lure' || style === 'distant') && this.voice.started && this.voice.clips.length) {
      const r = Math.random();
      if (this.story) { if (r < 0.7) style = 'ellie'; }
      else if (r < 0.4) style = 'stranger';
      else if (r < 0.7 && this.voice.clips.length > 1) {
        const a = this.voice.pick(), b = this.voice.pick();
        if (a && b && a !== b) {
          const d = this.sfx.playStitch(a.buffer, b.buffer, emitter, 'stranger');
          this.voice.suppress(d + 0.3);
          this.lures++;
          return d;
        }
      }
    }
    let buffer = null;
    if (this.mp) {
      const key = this.mp.pickKey((owner) => this.status.get(owner) === 'dead');
      buffer = key && this.mp.clips.get(key).buffer;
    } else buffer = (this.voice.started ? this.voice.pick() : null)?.buffer;
    if (!buffer) return this.sfx.whisper(emitter);
    const d = this.sfx.playVoice(buffer, emitter, style);
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
    this.noiseT -= dt;
    if (v.hear > 0.05) {
      const radius = 4 + 18 * v.hear;
      heard = Math.hypot(this.mimic.x - p.x, this.mimic.z - p.z) <= radius;
      if (this.isHost || this.noiseT <= 0) { this.noise(radius, 'voice'); this.noiseT = 0.25; }
    }
    if (heard) this.heardT = 1.2;
    this.heardT = Math.max(0, (this.heardT || 0) - dt);
    hud.mic.classList.toggle('heard', this.heardT > 0);
    hud.micText.textContent = this.heardT > 0 ? 'it heard you' : '';
  }

  // Spotting it while it peeks: a sting and a lurch toward it.
  watchPeek() {
    const m = this.mimic;
    if (m.state !== 'peek') { this.peekSeen = false; return; }
    if (this.peekSeen) return;
    const c = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const dx = m.x - c.x, dz = m.z - c.z, d = Math.hypot(dx, dz);
    if (d > 0 && (fwd.x * dx + fwd.z * dz) / d > 0.95 && this.level.los(c.x, c.z, m.x, m.z)) {
      this.peekSeen = true;
      this.sfx.sting();
      this.zoomT = 1;
    }
  }

  updateFear(dt) {
    const p = this.p, m = this.mimic;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    const vis = this.level.los(p.x, p.z, m.x, m.z);
    let f = clamp(1 - d / 12, 0, 1) * (vis ? 1 : 0.45);
    if ((m.state === 'chase' || m.state === 'hunt') && (!this.mp || d < 25)) f = Math.max(f, 0.45);
    this.fear += (f - this.fear) * (1 - Math.exp(-dt * 3));
    this.hud.fear.style.opacity = (this.fear * 0.85).toFixed(3);
    this.hud.grain.style.opacity = (0.08 + this.fear * 0.18).toFixed(3);
    if (this.fear > 0.15) {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.sfx.heartbeat(this.fear); this.hbT = 1.1 - this.fear * 0.65; }
    }

    // Sound: a dread drone swells as it gets closer (even through walls), and the background
    // goes silent when it's near and quiet. A pounding pulse while it chases (you, online).
    const chasing = (m.state === 'chase' || m.state === 'hunt') && (!this.mp || m.targetId === this.me || d < 15);
    const near = clamp(1 - d / 20, 0, 1);
    this.sfx.setDread(chasing ? 1 : near * near);
    this.sfx.setAmbient(d < 8 && !chasing ? 0.1 : 1);
    if (chasing) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) { this.sfx.pulse(); this.pulseT = 0.43; }
      this.snarlT = (this.snarlT ?? 2) - dt;
      if (this.snarlT <= 0 && d < 25) { this.sfx.snarl(this.mimic.emitter); this.snarlT = 3 + Math.random() * 3; }
    }
    // Your own breathing: out of breath, or scared.
    const breath = Math.max(1 - p.stamina, this.fear * 1.2);
    if (breath > 0.3) {
      this.breathT -= dt;
      if (this.breathT <= 0) { this.sfx.playerBreath(Math.min(1, breath)); this.breathT = 1.7 - Math.min(1, breath) * 0.6; }
    }

    // The camcorder picture breaks up when it's close: more the closer it is, with sudden tears.
    if (vis && d < 8 && Math.random() < dt * 1.8 * (1 - d / 8)) this.glitchT = 0.06 + Math.random() * 0.1;
    this.glitchT = Math.max(0, (this.glitchT || 0) - dt);
    const want = this.fear * 0.12 + (vis && d < 8 ? (1 - d / 8) * 0.15 : 0) + (this.glitchT > 0 ? 0.5 : 0);
    this.distort += (want - this.distort) * Math.min(1, dt * (this.glitchT > 0 ? 30 : 5));

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
    this.ambientT = 10 + Math.random() * 12;
    const p = this.level.randomFloor((q) => Math.hypot(q.x - this.p.x, q.z - this.p.z) > 10);
    if (!p) return;
    this.ambientEmitter.setPos(p.x, 1.5, p.z);
    this.ambientEmitter.setOcclusion(!this.level.los(this.p.x, this.p.z, p.x, p.z));
    if (Math.random() < 0.35 && this.sfx.moan(this.ambientEmitter)) return; // something, far off, moaning
    if (this.level.theme.id === 'facility') this.sfx.clank(this.ambientEmitter, 0.5);
    else this.sfx.creak(this.ambientEmitter, 0.5);
  }

  updateLights(dt) {
    const t = this.t, th = this.level.theme, m = this.mimic, c = this.camera.position;
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
      if (L.offUntil > t) lvl = 0; // put out by a scripted scare
      L.level = lvl;
      L.mat.emissiveIntensity = lvl * 1.5;
    }
    this.poolT -= dt;
    if (this.poolT <= 0) {
      this.poolT = 0.25;
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

  // Real doors swing toward where they should be.
  updateDoors(dt) {
    for (const wd of this.world.idoors) {
      for (const l of wd.leaves) {
        const target = wd.door.open ? l.open : l.closed;
        l.pivot.rotation.y += angleDiff(target, l.pivot.rotation.y) * Math.min(1, dt * (wd.door.open ? 4 : 9));
      }
    }
  }

  // Host: every 150 s it gets hungrier (bolder, faster, chattier).
  updateHunger(dt) {
    if (this.story && !this.story.hunger) return;
    this.hungerT += dt;
    if (this.hungerT < 150 || this.mimic.hunger >= 4) return;
    this.hungerT = 0;
    this.mimic.hunger++;
    this.mimic.aggro += 0.06;
  }

  // Everyone: each hunger stage kills two more lights, for good (same lights for everyone).
  applyHunger() {
    const h = this.mimic.hunger;
    if (h <= this.hungerSeen) return;
    for (let i = this.hungerSeen * 2; i < h * 2 && i < this.hungerOrder.length; i++) this.world.fixtures[this.hungerOrder[i]].broken = true;
    this.hungerSeen = h;
    this.sfx.rumble(2.5);
    this.sfx.clank(this.ambientEmitter, 0.6);
  }

  // Host, online: when it goes stalking, it sometimes wears someone it took.
  updateWear() {
    const m = this.mimic;
    if (m.state === 'stalk' && this.prevMimicState !== 'stalk' && !m.wearId) {
      const dead = this.order.filter((id) => this.status.get(id) === 'dead' && this.remotes.has(id));
      if (dead.length && Math.random() < 0.55) m.wear(dead[Math.floor(Math.random() * dead.length)]);
    }
    if (m.wearId && ['chase', 'hunt', 'sniff', 'stunned', 'transform', 'peek'].includes(m.state)) m.unwear();
    this.prevMimicState = m.state;
  }

  // ---------- death, escape, spectating ----------
  caught() {
    if (this.state !== 'playing') return;
    this.hb.stop();
    this.obj.repairing = null;
    this.obj.endSkill();
    this.exitHide(true);
    this.state = 'caught';
    this.ct = 0;
    this.lost = false;
    this.hud.locker.hidden = true;
    this.hud.root.hidden = true;
    this.hud.flash.classList.remove('hit');
    void this.hud.flash.offsetWidth;
    this.hud.flash.classList.add('hit');
    this.sfx.stopAmbient();
    this.sfx.screech();
    rumble(1, 700);
    this.sfx.setDread(0);
    this.renderer.domElement.style.transform = this.renderer.domElement.style.filter = '';
    setTimeout(() => this.localSpeak('scream', null), 150);
    // Turn to face it.
    const p = this.p, m = this.mimic;
    this.catchYaw = Math.atan2(-(m.x - p.x), -(m.z - p.z));
    p.speed = 0;
    // How it gets you: from above (off the ceiling), from behind, dragged away, or straight on.
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz) || 1;
    const behind = (-Math.sin(p.yaw) * dx - Math.cos(p.yaw) * dz) / d < -0.3;
    this.scare = m.ceiling || m.dropT > 0 ? 'above' : behind ? 'behind' : Math.random() < 0.3 ? 'drag' : 'front';
    if (this.scare === 'behind') this.sfx.sniff(m.emitter);
  }

  updateCaught(dt) {
    this.ct += dt;
    const p = this.p, sc = this.scare;
    const fx = -Math.sin(this.catchYaw), fz = -Math.cos(this.catchYaw);
    // It lunges in, then stays bent over right in your face (or hangs down from above).
    const dist = sc === 'above' ? 1.05 : 1.25 + Math.max(0, 1 - this.ct * 5) * 0.6;
    this.mimic.pose(p.x + fx * dist, p.z + fz * dist, Math.atan2(-fx, -fz), this.t, sc === 'above');
    if (sc === 'drag') {
      // Pulled off your feet and dragged backwards into the dark.
      if (this.ct > 1.5 && !this.dragging) {
        this.dragging = true;
        this.renderer.domElement.style.filter = 'brightness(0.05)';
        this.sfx.drag(1.5);
        setTimeout(() => this.localSpeak('echo', null), 400);
      }
      if (this.dragging) { p.eye = Math.max(0.25, p.eye - dt * 3); p.x -= fx * dt * 1.2; p.z -= fz * dt * 1.2; }
    }
    const root = this.mimic.model.root;
    root.updateMatrixWorld(true);
    const head = this.mimic.model.head.getWorldPosition(new THREE.Vector3());
    const dx = head.x - p.x, dy = head.y - p.eye, dz = head.z - p.z;
    if (sc === 'behind' && this.ct < 0.4) return; // you hear it breathe behind you first
    const k = Math.min(1, dt * (sc === 'behind' ? 22 : 14));
    p.yaw += angleDiff(Math.atan2(-dx, -dz), p.yaw) * k;
    p.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - p.pitch) * k;
    const T = sc === 'drag' ? 2.8 : 2.5;
    // First you see its face (the picture only shudders), then the tape tears apart.
    this.distort = this.ct < 1.7 ? 0.06 + Math.random() * 0.08 : Math.min(1, 0.4 + (this.ct - 1.7) * 1.2);
    if (this.ct > T && !this.lost) { this.lost = true; this.hud.signal.hidden = false; this.sfx.static(1.2); }
    if (this.ct > T + 1.1 && this.state === 'caught') {
      this.renderer.domElement.style.filter = '';
      this.dragging = false;
      if (!this.mp) { this.end(false); return; }
      this.mimic.frozen = false;
      this.startSpectate();
    }
  }

  startSpectate() {
    this.state = 'spectate';
    this.hud.signal.hidden = true;
    this.distort = 0;
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    this.hud.fear.style.opacity = 0;
    this.renderer.domElement.style.transform = this.renderer.domElement.style.filter = '';
    this.sfx.setDread(0);
    if (!this.sfx.ambient) this.sfx.startAmbient(this.level.theme.id);
    this.hud.spec.hidden = false;
  }

  // The living player I'm watching (cycles with Space / click).
  specTarget() {
    const living = [...this.remotes.entries()].filter(([id, r]) => this.alive(id) && r.seen);
    if (!living.length) { this.hud.spec.textContent = 'No one is left to watch.'; return null; }
    const [id, r] = living[this.specIdx % living.length];
    this.hud.spec.textContent = `Watching ${this.nameOf(id)}  ·  ${keyLabel('Next')} for next  ·  Only the dead can hear you`;
    return r;
  }

  end(won) {
    if (this.state === 'won' || this.state === 'dead' || this.state === 'ended') return;
    this.state = won ? 'won' : 'dead';
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    if (won) this.sfx.stopAmbient();
    this.onEnd({
      won, time: this.time, fuses: this.fusesFound, lures: this.lures,
      clips: this.voice.clips.length, place: this.story ? this.story.title : this.level.name, story: this.story,
    });
  }

  // Online: the host says the game is over.
  finish(m) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    this.hud.spec.hidden = true;
    this.sfx.stopAmbient();
    const st = m.st || {};
    this.onEnd({
      mp: true, won: m.traitor === this.me ? !!m.traitorWins : st[this.me] === 'out', time: num(m.time, this.time), fuses: this.fusesFound, lures: this.lures,
      mode: m.mode, traitor: m.traitor || null, traitorName: m.traitor ? this.nameOf(m.traitor) : null, traitorWins: !!m.traitorWins,
      clips: this.mp.clips.size, place: this.level.name,
      results: this.order.map((id) => ({ id, name: this.nameOf(id), status: st[id] || 'left' })),
    });
  }
}
