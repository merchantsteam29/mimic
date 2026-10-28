// One run of the game: builds the level, runs the player, the mimic, lights, HUD and the win/lose flow.
//
// Alone or online, every shared event goes the same way: intents go to the host (send ->
// hostHandle), the host decides and tells everyone (broadcast -> onNet). Alone, this browser is
// the host. Online (mp = Session), the host's browser runs the mimic and the others show a puppet.
import * as THREE from 'three';
import { generateLevel, buildLevelScene, makeFuse, CELL, WALL_H } from './level.js';
import { Mimic, DIFFICULTY } from './mimic.js';
import { Director } from './director.js';
import { RemotePlayer } from './remote.js';
import { Objectives } from './objectives.js';
import { Abilities } from './abilities.js';
import { Heartbeat } from './heartbeat.js';
import { Scares } from './scares.js';
import { Traitor } from './traitor.js';
import { Events } from './events.js';
import { Hand } from './hand.js';
import { Skinwalker } from './skinwalker.js';
import { Hunter } from './hunter.js';
import { Chat } from './chat.js';
import { Haunt } from './haunt.js';
import { Tutorial, TUTORIAL } from './tutorial.js';
import { Recap } from './recap.js';
import { Listener } from './listener.js';
import { Incidents } from './incidents.js';
import { Radio } from './radio.js';
import { ScareClip } from './clip.js';
import { Stalker } from './stalker.js';
import { Recorder } from './recorder.js';
import { Signals } from './signals.js';
import { Revive } from './revive.js';
import { Throwables } from './throwables.js';
import { Versus } from './versus.js';
import { Shadow } from './shadow.js';
import { Double } from './double.js';
import { Caller } from './caller.js';
import { Mother } from './mother.js';
import { Subway } from './subway.js';
import { Mascot } from './mascot.js';
import { Fair } from './fair.js';
import { KillCam } from './killcam.js';
import { Trailer } from './trailer.js';
import { Gait } from './gait.js';
import { Imposter } from './imposter.js';
import { Patient } from './patient.js';
import { Escort } from './escort.js';
import { HideSeek, hideLevel } from './hideseek.js';
import { Escape } from './escape.js';
import { Landmarks } from './landmarks.js';
import { pickRun, applyRun } from './runs.js';
import { LIGHTS, cleanLook } from './look.js';
import { NightShift, nightLevel, nightRules } from './nightshift.js';

import { mulberry32 } from './level.js';
import { keyLabel, rumble } from './controls.js';
import { CUSTOM, customLevel, ROOM, LOGGED, QUALITY, EYE, PLAYER_R, NET_HZ, clamp } from './game-shared.js';
import { RoomPart } from './game-room.js';
import { NetPart } from './game-net.js';
import { PlayerPart } from './game-player.js';
import { WorldPart } from './game-world.js';
import { DeathPart } from './game-death.js';

export { CUSTOM, ROOM } from './game-shared.js';
export class Game {
  constructor({ renderer, sfx, voice, settings, hud, themeId, seed, onEnd, noLock = false, mp = null, order = null, classes = null, story = null, mode = 'normal', traitorId = null, vhs = null, skinwalker = false, hunter = null, tutorial = false, listener = false, room = false, difficulty = 'normal', stalker = false, custom = null, teams = null, shadow = false, night = 0, double = false, hideSeek = false, caller = false, escort = null, mother = false, mascot = false, imposter = false, patient = false }) {
    Object.assign(this, { renderer, sfx, voice, settings, hud, onEnd, noLock, mp, story, vhs, room, custom, themeId, seed });
    this.distort = 0;    // camcorder distortion, 0..1
    this.peekHud = 0;    // seconds the HUD stays visible after something changes
    this.tabDown = false;
    this.me = mp ? mp.id : 'h';
    this.classes = classes || { [this.me]: 'runner' }; // player id -> class
    this.isHost = !mp || mp.isHost;
    this.order = order || [this.me];
    const level = this.level = generateLevel(seed, themeId, story ? { ...story.gen, lore: story.tapes.length } : tutorial ? TUTORIAL.gen : room ? ROOM.gen : hideSeek ? hideLevel() : night ? nightLevel(night) : customLevel(custom));
    const th = level.theme;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    this.world = buildLevelScene(level);
    scene.add(this.world.group);
    this.hemiBase = 0.12; // (lightning flashes it brighter: incidents.js)
    this.hemi = new THREE.HemisphereLight(th.look === 'house' ? 0x6a5a48 : 0x56687a, 0x0a0806, this.hemiBase);
    scene.add(this.hemi);
    if (th.outdoor) { // the woods: no ceiling, so a little cold moonlight gets through
      this.hemiBase = 0.42;
      this.hemi.color.setHex(0x6a7a9a);
      this.hemi.intensity = this.hemiBase;
      const moon = new THREE.DirectionalLight(0x8a9ac0, 0.35);
      moon.position.set(level.N * 0.3, 30, level.N * 0.2);
      scene.add(moon);
    }

    this.camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 80);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);

    // Flashlight: the only shadow-casting light.
    this.flash = new THREE.SpotLight(0xfff1d8, 0, 24, 0.4, 0.55, 1.5);
    const q = QUALITY[settings.quality === 'auto' ? settings.tier : settings.quality] || QUALITY.high;
    this.flash.castShadow = q.shadow > 0;
    this.flash.shadow.mapSize.set(q.shadow || 512, q.shadow || 512);
    this.flash.color.setHex(LIGHTS[cleanLook(settings.look).light]);
    this.flash.shadow.bias = -0.0006;
    this.flash.shadow.camera.near = 0.1;
    this.flash.shadow.camera.far = 26;
    scene.add(this.flash, this.flash.target);
    this.flashDir = new THREE.Vector3(0, 0, -1);

    this.pool = [];
    for (let i = 0; i < q.lights; i++) {
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
    this.order.forEach((id, i) => { if (id !== this.me) this.remotes.set(id, new RemotePlayer(scene, sfx, i, this.lookOf(id))); });

    this.mimic = new Mimic(level, scene, sfx, {
      speak: (style, emitter) => this.mimicSpeaks(style, emitter),
      gait: () => this.gait.profile(), // walking like one of you
      onCatch: (id) => this.hostCatch(id),
      onSpotted: (id) => this.sendTo(id, { t: 'sting' }),
      onSniff: (id) => { this.sniffing = id; this.sendTo(id, { t: 'sniff' }); },
      isLit: (x, z) => this.world.fixtures.some((L) => L.level > 0.5 && (!L.broken || this.power) && !L.dead && Math.hypot(L.x - x, L.z - z) < 3.2) || !!this.lan?.near(x, z),
      openDoor: (d) => this.broadcast({ t: 'doorSet', i: d.i, open: true, by: 'm' }),
      creakDoor: (d, fast) => this.broadcast({ t: 'creak', i: d.i, fast: fast ? 1 : 0 }),
      bangDoor: (d) => this.broadcast({ t: 'doorBang', i: d.i }),
      onPeekSeen: () => {}, // each player notices a peek themselves (see watchPeek)
    });
    if (mp) { this.mimic.lureStyle = 'distant'; this.mimic.stalkRange = [9, 16]; }
    this.sw = imposter && mp && !hunter ? new Imposter(this, true) : new Skinwalker(this, skinwalker); // online only: something wearing a living friend (Imposter voices: a fake teammate that never stops pretending)
    this.hunt = new Hunter(this, hunter);       // Hunt mode: a player is the mimic
    this.ls = new Listener(this, listener && !hunter); // online: the blind thing that hunts by sound
    this.sk = new Stalker(this, stalker && !hunter);   // online: the thing that only moves when unseen
    this.sd = new Shadow(this, shadow && !hunter);     // online: the thing that lives in the dark
    this.db = new Double(this, double && !hunter);     // online: the thing that walks where you walked
    this.cl = new Caller(this, caller && !hunter);     // online: phones that ring with the voices of the taken
    this.mo = new Mother(this, mother && !hunter);     // online: the huge thing that sings in your voices
    this.tr = new Subway(this);                        // the subway: trains that don't stop
    this.fair = new Fair(this);                        // the fairground: the wheel, the ghost train, the music
    // The clown: online a lobby toggle; alone, it lives in the fairground.
    this.mc = new Mascot(this, !hunter && (mp ? mascot : themeId === 'fair' && !story && !tutorial && !room));
    // The patient: online a lobby toggle; alone, it lives in the hospital and the asylum.
    this.pt = new Patient(this, !hunter && !room && (mp ? patient : ['hospital', 'asylum'].includes(themeId) && !story && !tutorial));
    this.lan = new Escort(this, room ? null : escort);  // Escort mode: one lantern for everyone
    if (this.hunt.on) this.status.set(hunter, 'hunter');
    if (story) this.mimic.graceT = story.grace;
    const base = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.diff = { ...base, speed: base.speed * (CUSTOM.speed[custom?.speed] || 1), battery: base.battery * (CUSTOM.battery[custom?.battery] || 1) };
    this.ns = new NightShift(this, room ? 0 : night); // the night shift: hold on until 6 a.m., each night worse
    if (this.ns.on) {
      const r = nightRules(night);
      Object.assign(this.diff, { speed: this.diff.speed * r.speed, sight: this.diff.sight * r.sight, hunger: this.diff.hunger * r.hunger, battery: this.diff.battery * r.battery, grace: this.diff.grace + r.grace });
    }
    // So runs don't all play the same: its mood tonight, and tonight's twist (runs.js; the same for everyone).
    const plain = !story && !tutorial && !room && !night && !hideSeek;
    this.run = pickRun(seed, plain && !hunter ? 'plain' : !story && !tutorial && !room && !hunter ? 'mood' : 'none');
    applyRun(this, this.run);
    this.mimic.diff = this.diff;
    this.mimic.graceT = Math.max(6, this.mimic.graceT + this.diff.grace);
    this.ambientEmitter = sfx.emitter();
    this.director = new Director(this);
    this.events = new Events(this);   // hand-placed scares
    this.hand = new Hand(this.camera); // your hand holding the flashlight
    this.obj = new Objectives(this);           // generators, tapes, keycard (adds their items)
    this.esc = new Escape(this, !story && !tutorial && !room && !night && !hideSeek); // a door code, a lift (adds their items)
    this.marks = new Landmarks(this, !story && !tutorial && !room); // a flooded room, a collapsed ceiling, a shrine
    this.ab = new Abilities(this, this.classes[this.me] || 'runner');
    this.hb = new Heartbeat(this);
    level.idoors.forEach((d, i) => this.items.push({ type: 'idoor', i, x: d.x, y: 1.2, z: d.z, range: 2.3, active: true }));
    const dc = this.world.decoy;
    if (dc) this.items.push({ type: dc.kind, fake: true, x: dc.x, y: 0.1, z: dc.z, mesh: dc.mesh, range: 2.1, active: true });
    this.rec = new Recorder(this); // your own tape recorders (adds their items)
    this.thr = new Throwables(this); // bottles, cans, a camera (adds their items)
    this.vs = new Versus(this, teams);   // versus mode: red against blue
    this.tut = new Tutorial(this, tutorial && !mp); // before Scares: it takes the tricks out
    this.scares = new Scares(this);
    this.recap = new Recap(this); // host: where everyone went, for the end screen
    this.traitor = new Traitor(this, { mode, traitorId });
    this.chat = new Chat(this);   // quick chat (online)
    this.haunt = new Haunt(this); // the dead reaching back (online)
    this.radio = new Radio(this); // walkie-talkies (online)
    this.clip = new ScareClip(sfx); // the jumpscare, saved for the end screen
    this.sig = new Signals(this);     // hand signals (online)
    this.revival = new Revive(this);  // a taken friend's tape (online)
    this.hs = new HideSeek(this, hideSeek && !room); // hide and seek (online)
    this.chaseGoneT = 0;
    this.doorEm = sfx.emitter();
    this.inc = new Incidents(this, !story && !tutorial && !room && !hideSeek && custom?.events !== false); // power cuts, storms, alarms, lockdowns
    this.kc = new KillCam(this);                       // the replay of how someone was taken
    this.trailer = new Trailer(this);                  // (hidden: ?trailer) a camera for filming trailers
    this.gait = new Gait(this);                        // how each of you walks (the mimic copies it)
    // Hunger: every couple of minutes it gets bolder, and lights die for good (in the same order for everyone).
    this.hungerT = 0;
    this.hungerSeen = 0;
    const hr = mulberry32(level.seed ^ 0xbeef);
    this.hungerOrder = this.world.fixtures.map((_, i) => i).sort((a, b) => a - b);
    for (let i = this.hungerOrder.length - 1; i > 0; i--) { const j = Math.floor(hr() * (i + 1)); [this.hungerOrder[i], this.hungerOrder[j]] = [this.hungerOrder[j], this.hungerOrder[i]]; }
    this.nextItem = this.items.length;         // host: index for things dropped by the dead
    this.log = [];                              // host: what happened (see LOGGED)
    if (!level.tasks.fuses) { // no fuses this run: the panel's fuse slots stay dark
      for (const it of this.items) if (it.type === 'fuse') { it.active = false; it.mesh.removeFromParent(); }
      for (const sl of this.world.fuseBox.slots) { sl.emissive.setHex(0x000000); sl.color.setHex(0x111111); }
      this.fusesIn = 4;
    }
    if (room) this.setupRoom();
    sfx.setReverb(...th.reverb);
    sfx.startAmbient(th.id);

    // Input.
    this.keys = new Set();
    this.onKeyDown = (e) => {
      if (this.menuOpen) return;
      if (!e.repeat && this.kc.onKey(e.code)) { e.preventDefault(); return; }
      if (!e.repeat && this.state === 'playing' && this.sw.onKey?.(e.code)) return; // Imposter voices: accuse, vote
      const live = this.state === 'playing' || this.state === 'spectate';
      if (!e.repeat && this.radio.onKey(e.code, true)) return;
      if (live && !e.repeat && this.esc.onKey(e.code)) return; // typing at a keypad
      if (live && !e.repeat && (this.sig.onKey(e.code) || this.chat.onKey(e.code) || this.haunt.onKey(e.code))) { if (e.code === 'Tab') e.preventDefault(); return; }
      if (this.state === 'spectate' && !e.repeat && e.code === 'KeyR') { this.toggleFreeCam(); return; }
      if (this.state === 'spectate' && !e.repeat && (e.code === 'Space' || e.code === 'KeyE')) { if (this.freeCam) this.toggleFreeCam(); else this.specIdx++; return; }
      if (this.state === 'spectate' && this.freeCam) { this.keys.add(e.code); return; } // flying about
      if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) this.tabDown = !this.tabDown; return; } // Tab shows the HUD until Tab again
      if (this.state !== 'playing') return;
      if (e.code === 'Space') e.preventDefault();
      if (this.hunt.me) { if (!e.repeat && this.hunt.onKey(e.code)) return; this.keys.add(e.code); return; }
      if (!e.repeat && (this.rec.onKey(e.code) || this.thr.onKey(e.code) || this.traitor.onKey(e.code) || this.scares.onKey(e.code) || this.hb.onKey(e.code) || this.obj.onKey(e.code))) return;
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyF') this.toggleFlash();
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyG') this.ab.use();
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); this.radio.onKey(e.code, false); };
    this.onBlur = () => this.keys.clear();
    this.onMouse = (e) => {
      if ((this.state !== 'playing' && !this.freeCam) || this.menuOpen || (!document.pointerLockElement && !this.noLock)) return;
      const s = 0.0022 * this.settings.mouse;
      this.look(e.movementX * s, e.movementY * s);
    };
    this.stick = null; // analog movement from a controller or the touch stick (controls.js), x/y in -1..1
    this.onClick = () => {
      if (!document.pointerLockElement) return;
      if (this.state === 'spectate') this.specIdx++;
      else if (this.hunt.me && this.state === 'playing' && !this.menuOpen) this.hunt.act();
      else if (this.state === 'playing' && !this.menuOpen && this.thr.held && !this.p.hidden) this.thr.use(); // click to throw
    };
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

    this.state = room ? 'playing' : 'intro';
    this.updateCamera();
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  // A player's chosen look (look.js), from the room's roster.
  lookOf(id) { return this.mp?.roster.find((r) => r.id === id)?.look || null; }

  // ---------- lifecycle ----------
  begin() {
    if (this.state !== 'intro') return;
    this.state = 'playing';
    this.hud.root.hidden = false;
    this.hud.cam.hidden = false;
    this.peekHud = 6;
    this.hunt.begin();
    this.updateObjective();
    this.toast(this.resumed ? 'You\'re back in.' : this.level.name);
    if (!this.resumed) this.vs.begin();
    if (this.mp && !this.alive(this.me) && !this.hunt.me) this.startSpectate(); // came back after being taken (or getting out)
  }

  // Turn the view (radians). The mouse, a controller's right stick and touch drags all come here.
  look(dx, dy) {
    if (this.freeCam && this.state === 'spectate' && !this.menuOpen) { // the dead, looking around on their own
      this.freeCam.yaw -= dx;
      this.freeCam.pitch = clamp(this.freeCam.pitch - dy, -1.45, 1.45);
      return;
    }
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

  // Auto graphics changed tier mid-run: fewer lights, a smaller (or no) flashlight shadow. Shaders recompile once.
  setQuality(tier) {
    const q = QUALITY[tier];
    if (!q) return;
    while (this.pool.length > q.lights) this.scene.remove(this.pool.pop());
    this.flash.shadow.map?.dispose();
    this.flash.shadow.map = null;
    this.flash.castShadow = q.shadow > 0;
    if (q.shadow) this.flash.shadow.mapSize.set(q.shadow, q.shadow);
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
    this.sw.dispose();
    this.ls.dispose();
    this.sk.dispose();
    this.sd.dispose();
    this.db.dispose();
    this.cl.dispose();
    this.mo.dispose();
    this.tr.dispose();
    this.fair.dispose();
    this.kc.dispose();
    this.trailer.dispose();
    this.mc.dispose();
    this.pt.dispose();
    this.lan.dispose();
    this.esc.dispose();
    this.marks.dispose();
    this.rec.dispose();
    this.thr.dispose();
    this.inc.dispose();
    this.hunt.dispose();
    this.chat.dispose();
    this.radio.dispose();
    this.clip.dispose();
    this.sig.dispose();
    this.haunt.dispose();
    this.tut.dispose();
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
    Object.values(this.world.textures).forEach((t) => t?.dispose()); // (some are theme-only: null elsewhere)
    this.flash.shadow.map?.dispose();
    this.hud.root.hidden = true;
    this.hud.locker.hidden = true;
    this.hud.spec.hidden = true;
    this.hud.cam.hidden = true;
    this.hud.signal.hidden = true;
    this.hud.fear.style.opacity = 0;
  }

  // ---------- main loop ----------
  frame(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.last ?? now)) / 1000));
    this.last = now;
    this.simulate(dt * this.trailer.scale); // (slow motion, for filming)
    this.render(dt);
  }

  simulate(dt) {
    if (this.state === 'ended' || this.state === 'paused') return;
    if (this.room) { this.simulateRoom(dt); return; }
    this.t += dt;
    if (this.state === 'playing' && this.hunt.me) {
      this.time += dt;
      this.hunt.update(dt);
    } else if (this.state === 'playing') {
      this.time += dt;
      this.updatePlayer(dt);
      this.updateFocus();
      this.updateVoice(dt);
      this.updateFear(dt);
      this.updateAmbient(dt);
      if (!this.tut.quiet && !this.hs.on) { this.director.update(dt); this.events.update(dt); } // (hide and seek: nothing moves it but the game)
      this.tut.update(dt);
      this.watchPeek();
      this.obj.update(dt);
      this.hb.update(dt);
      if (this.isHost && !this.power && !this.tut.on) this.updateHunger(dt);
    } else if (this.state === 'caught') this.updateCaught(dt);
    else if (this.state === 'spectate') this.updateFreeCam(dt);
    this.updateDoor(dt);
    this.chat.update(dt);
    this.haunt.update(dt);
    this.radio.update(dt);
    this.sig.update(dt);
    if (!this.hunt.me) { this.ab.update(dt); if (!this.tut.quiet) this.scares.update(dt); }
    this.traitor.update(dt);
    this.ns.update(dt);
    this.hs.update(dt);
    this.esc.update(dt);
    this.marks.update(dt);
    this.updateDoors(dt);
    this.applyHunger();
    if (this.isHost && this.mp && !this.hunt.on) this.updateWear();
    if (this.isHost && !this.hunt.on && !this.tut.holds) this.checkCurtains();
    // The mimic left a hiding spot without a verdict (a flare, say): end that player's heartbeat game.
    if (this.isHost && this.sniffing && this.mimic.state !== 'sniff') { this.sendTo(this.sniffing, { t: 'sniffEnd' }); this.sniffing = null; }

    if (!this.isHost) this.mimic.puppet(dt, this.t);
    else if (this.hunt.on) this.hunt.driveMimic(dt);
    else if (this.tut.holds) this.tut.driveMimic(dt);
    else if (this.mp || this.state === 'playing') this.mimic.update(dt, this.targets(), this.t);
    if (this.hunt.me) this.mimic.model.root.visible = false; // you're inside it
    this.sw.update(dt);
    this.ls.update(dt);
    this.sk.update(dt);
    this.sd.update(dt);
    this.db.update(dt);
    this.cl.update(dt);
    this.mo.update(dt);
    this.tr.update(dt);
    this.fair.update(dt);
    this.mc.update(dt);
    this.pt.update(dt);
    this.lan.update(dt);
    if (this.state === 'playing' || this.state === 'spectate') this.rec.update(dt);
    this.thr.update(dt);
    if (this.state === 'playing' || this.state === 'spectate') this.inc.update(dt);

    const watching = this.state === 'spectate' ? this.specTarget() : null;
    const worn = this.mimic.wearId && this.remotes.get(this.mimic.wearId);
    for (const [id, r] of this.remotes) {
      if (r === worn) { // it walks around as them
        r.status = 'alive'; r.hidden = -1; r.seen = true; r.flash = true; r.crouch = false; r.pitch = 0;
        r.tx = this.mimic.x; r.tz = this.mimic.z; r.tyaw = this.mimic.yaw + Math.PI;
      } else if (!this.alive(id)) r.status = 'gone';
      r.update(dt, this.surfaceFn ||= (x, z) => this.level.surfaceAt(x, z), r === watching);
      // Up close, something's wrong with how it holds its head.
      if (r === worn && Math.hypot(r.x - this.camera.position.x, r.z - this.camera.position.z) < 3.5) {
        r.head.rotation.z = 0.6 + Math.sin(this.t * 25) * 0.15;
      } else r.head.rotation.z = 0;
    }
    this.kc.update(dt);
    if (this.state === 'playing' || this.state === 'spectate') this.gait.update(dt);
    if (this.mp) { this.netTick(dt); this.routeVoices(); this.updateTags(); }
    if (this.isHost && (this.state === 'playing' || this.state === 'spectate')) this.recap.update(dt);
  }

  render(dt) {
    if (this.state !== 'paused') this.updateLights(dt);
    this.updateCamera();
    this.kc.render(dt); // (a replay takes the camera)
    this.trailer.render(dt);
    this.updateFlash(dt);
    this.sfx.updateListener(this.camera);
    const c = this.camera.position;
    this.mimic.emitter.setOcclusion(!this.level.los(c.x, c.z, this.mimic.x, this.mimic.z));
    for (const r of this.remotes.values()) r.emitter.setOcclusion(!this.level.los(c.x, c.z, r.x, r.z));
    this.updateCam(dt);
    if (this.vhs) this.vhs.render(this.scene, this.camera, this.t, this.distort);
    else this.renderer.render(this.scene, this.camera);
    if (this.clip.recording) this.clip.frame(this.renderer.domElement, this.hud.camStamp.textContent, this.lost);
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
      this.mp.net.broadcast({ t: 'snap', m: this.mimic.snap(), p: rows, sw: this.sw.on ? this.sw.snap() : undefined, ls: this.ls.on ? this.ls.snap() : undefined, sk: this.sk.on ? this.sk.snap() : undefined, sd: this.sd.on ? this.sd.snap() : undefined, db: this.db.on ? this.db.snap() : undefined, mo: this.mo.on ? this.mo.snap() : undefined, mc: this.mc.on ? this.mc.snap() : undefined, pt: this.pt.on ? this.pt.snap() : undefined }, { self: false });
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
      if (this.radio.routes(id)) { vc.route(id, { on: true, radio: true }); continue; } // on the walkie-talkie
      const d = Math.hypot(r.x - c.x, r.z - c.z);
      const pos = { x: r.x, y: r.eye, z: r.z }, occluded = !this.level.los(c.x, c.z, r.x, r.z);
      // Full volume up close, fading out by 45 m (the waiting room, and "Voices: everywhere": never below a floor).
      let volume = clamp(1 - (d - 8) / 37, 0, 1);
      if (this.room) volume = Math.max(volume, 0.5);
      else if (this.custom?.voices === 'everywhere') volume = Math.max(volume, 0.7);
      vc.route(id, { on: volume > 0, volume, pos, occluded });
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
      id: this.me, x: p.x, z: p.z, yaw: p.yaw, hidden: p.hidden, crouch: p.crouch, running: p.speed > 4,
      flashOn: p.flashOn && p.battery > 0 && !p.hidden,
      lookX: -Math.sin(p.yaw), lookZ: -Math.cos(p.yaw),
    };
  }

  infoOf(id) {
    if (id === this.me) return this.playerInfo();
    const r = this.remotes.get(id);
    return {
      id, x: r.tx, z: r.tz, yaw: r.tyaw, hidden: r.hidden >= 0 ? this.level.props[r.hidden] : null, crouch: r.crouch, running: r.speed > 4,
      flashOn: r.flash, lookX: -Math.sin(r.tyaw), lookZ: -Math.cos(r.tyaw),
    };
  }

}

// The rest of Game lives in its parts.
Object.assign(Game.prototype, RoomPart, NetPart, PlayerPart, WorldPart, DeathPart);
