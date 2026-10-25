// A run's jobs besides fuses: generators (hold E, skill checks), tapes (smash them: each erases some
// of the voices it stole), and the keycard for the locked room. When every job is done, someone pulls
// the power lever at the panel. The host owns the progress; everyone mirrors it (see game.js send/broadcast).

const REPAIR_TIME = 12;        // seconds of work for one player to repair a generator
const SKILL_SPEED = 4.2;       // needle speed, radians per second
const SKILL_ZONE = 0.55;       // radians

export class Objectives {
  constructor(game) {
    this.g = game;
    const lv = game.level, w = game.world;
    this.tasks = lv.tasks;
    this.gen = lv.gens.map(() => 0);           // repair progress 0..1
    this.tapesLeft = lv.tapes.length;
    this.doorsOpen = !lv.doorsLocked;
    this.keyFound = false;
    this.hasKey = false;
    this.keyHolder = null;                      // host
    this.repairing = null;
    this.workAcc = 0; this.workT = 0; this.noiseT = 0;
    this.skill = null; this.skillT = 4;
    this.whisperT = 15 + Math.random() * 15;
    this.doorT = -1;
    this.emitter = game.sfx.emitter();
    this.keyName = lv.theme.id === 'house' ? 'key' : 'keycard';

    // New things to use with E (appended after the core items, same order for every player).
    lv.gens.forEach((p, i) => game.items.push({ type: 'gen', i, prop: p, x: p.x - p.dx * (p.d / 2), y: 0.9, z: p.z - p.dz * (p.d / 2), range: 2.4, active: true }));
    w.tapes.forEach((t, i) => game.items.push({ type: 'tape', i, x: t.x, y: 0.1, z: t.z, mesh: t.mesh, range: 2.0, active: true }));
    if (w.keycard) game.items.push({ type: 'keycard', x: w.keycard.x, y: 0.05, z: w.keycard.z, mesh: w.keycard.mesh, range: 2.0, active: true });
    lv.doors.forEach((d, i) => game.items.push({ type: 'door', i, x: d.x - d.dx * 0.3, y: 1.3, z: d.z - d.dz * 0.3, range: 2.2, active: true }));

    // The skill check's bright zone, drawn once per check.
    this.hud = { skill: document.getElementById('skill'), zone: document.getElementById('skillZone'), needle: document.getElementById('skillNeedle') };
  }

  dispose() { this.emitter.dispose(); this.endSkill(); }

  allDone() {
    const g = this.g;
    return (!this.tasks.fuses || g.fusesIn >= 4) && this.gen.every((p) => p >= 1) && this.tapesLeft === 0 && this.doorsOpen
      && this.storyHeard() >= this.storyNeed();
  }

  // Story chapters: every tape must be heard.
  storyNeed() { return this.g.story ? this.g.story.tapes.length : 0; }
  storyHeard() { return this.g.items.filter((it) => it?.type === 'lore' && it.heard).length; }

  lines() {
    const out = [];
    if (this.storyNeed()) out.push(`${this.g.story.tapeLabel}  ${this.storyHeard()}/${this.storyNeed()}`);
    if (this.tasks.gens) out.push(`Generators  ${this.gen.filter((p) => p >= 1).length}/${this.gen.length}`);
    if (this.tasks.tapes) out.push(`Tapes destroyed  ${this.tasks.tapes - this.tapesLeft}/${this.tasks.tapes}`);
    if (this.tasks.keycard && !this.doorsOpen) out.push(this.keyFound ? `Unlock the locked room` : `Find the ${this.keyName} to the locked room`);
    return out;
  }

  prompt(it) {
    switch (it.type) {
      case 'gen': return this.gen[it.i] >= 1 ? null : `Hold to repair generator (${Math.floor(this.gen[it.i] * 100)}%)`;
      case 'tape': return 'Smash the tape recorder';
      case 'keycard': return `Pick up the ${this.keyName}`;
      case 'door': return this.hasKey ? 'Unlock' : 'Locked';
    }
    return undefined;
  }

  // E pressed on one of our items. Returns true if handled.
  interact(it) {
    const g = this.g;
    switch (it.type) {
      case 'gen':
        if (this.gen[it.i] < 1) { this.repairing = it; this.skillT = 2 + Math.random() * 3; }
        return true;
      case 'tape':
        it.pending = g.t + 1;
        g.send({ t: 'smash', i: it.i });
        return true;
      case 'keycard':
        it.pending = g.t + 1;
        g.send({ t: 'take', i: g.items.indexOf(it) });
        return true;
      case 'door':
        if (this.hasKey) g.send({ t: 'unlock' });
        else { g.sfx.denied(); g.toast(`Locked. Find the ${this.keyName}.`); }
        return true;
    }
    return false;
  }

  // Host: a player's intent. Returns true if handled.
  hostHandle(m, from) {
    const g = this.g;
    if (!g.alive(from)) return false;
    switch (m.t) {
      case 'work': {
        const i = m.i | 0;
        if (!(i in this.gen) || this.gen[i] >= 1) return true;
        this.gen[i] = Math.min(1, this.gen[i] + Math.min(0.06, Math.max(0, Number(m.a) || 0)));
        g.broadcast({ t: 'gen', i, p: +this.gen[i].toFixed(3) });
        return true;
      }
      case 'bang': {
        const i = m.i | 0, p = g.level.gens[i];
        if (!p || this.gen[i] >= 1) return true;
        this.gen[i] = Math.max(0, this.gen[i] - 0.1);
        g.mimic.hear(p.x, p.z, 24, 'step'); // it heard that from across the building
        g.broadcast({ t: 'gen', i, p: +this.gen[i].toFixed(3), bang: 1 });
        return true;
      }
      case 'smash': {
        const it = g.items.find((x) => x?.type === 'tape' && x.i === (m.i | 0));
        if (!it || !it.active) return true;
        it.active = false;
        g.mimic.hear(it.x, it.z, 18, 'step');
        // Each remaining tape holds an equal share of the voices it stole: erase that share (the last one, all of it).
        const msg = { t: 'smashed', i: it.i, by: from };
        if (g.mp) {
          const keys = [...g.mp.clips.keys()];
          msg.keys = keys.sort(() => Math.random() - 0.5).slice(0, Math.ceil(keys.length / Math.max(1, this.tapesLeft)));
        } else msg.n = Math.ceil(g.voice.clips.length / Math.max(1, this.tapesLeft));
        g.broadcast(msg);
        return true;
      }
      case 'unlock':
        if (this.doorsOpen || this.keyHolder !== from) return true;
        g.broadcast({ t: 'unlocked', by: from });
        return true;
      case 'lever':
        if (g.power || !this.allDone()) return true;
        g.broadcast({ t: 'power', by: from });
        return true;
    }
    return false;
  }

  // Everyone: what happened. Returns true if handled.
  onNet(m) {
    const g = this.g;
    switch (m.t) {
      case 'gen': {
        const i = m.i | 0, p = g.level.gens[i];
        if (!p) return true;
        const was = this.gen[i];
        this.gen[i] = Number(m.p) || 0;
        this.at(p.x, 0.8, p.z);
        if (m.bang) g.sfx.bang(this.emitter);
        if (was < 1 && this.gen[i] >= 1) {
          p.mesh?.userData.lamp?.emissive.setHex(0x2bff5a);
          g.sfx.engine(this.emitter);
          if (this.repairing?.i === i) { this.repairing = null; this.endSkill(); }
          g.toast('Generator running');
          g.events?.progress('gen');
        }
        g.updateObjective();
        return true;
      }
      case 'smashed': {
        const it = g.items.find((x) => x?.type === 'tape' && x.i === m.i);
        if (it) { it.active = false; it.mesh?.removeFromParent(); this.at(it.x, 0.3, it.z); g.sfx.smash(this.emitter); }
        this.tapesLeft = Math.max(0, this.tapesLeft - 1);
        if (Array.isArray(m.keys) && g.mp) for (const k of m.keys) g.mp.clips.delete(k);
        if (m.n) g.voice.clips.splice(0, Math.min(g.voice.clips.length, m.n));
        if (m.by === g.me) { g.toast('Tape destroyed. It forgot some of the voices.'); g.events?.progress('tape'); }
        g.updateObjective();
        return true;
      }
      case 'unlocked': {
        if (this.doorsOpen) return true;
        this.doorsOpen = true;
        g.level.doorsLocked = false;
        for (const it of g.items) if (it?.type === 'door') it.active = false;
        this.doorT = 0;
        g.sfx.unlock();
        g.toast(m.by === g.me ? 'Unlocked' : 'Somewhere, a door unlocks');
        g.updateObjective();
        return true;
      }
    }
    return false;
  }

  // The keycard changing hands (from game.js 'took' / 'drop').
  tookKey(by) {
    this.keyFound = true;
    if (this.g.isHost) this.keyHolder = by;
    if (by === this.g.me) { this.hasKey = true; this.g.sfx.pickup(); this.g.toast(`You have the ${this.keyName}`); }
    this.g.updateObjective();
  }
  droppedKey() { this.hasKey = false; this.keyHolder = null; this.keyFound = false; }

  update(dt) {
    const g = this.g;
    // Repairing: hold E, stay close. Work is sent to the host in small steps.
    const r = this.repairing;
    if (r) {
      const p = g.p;
      const close = Math.hypot(r.x - p.x, r.z - p.z) < 2.6 && !p.hidden;
      if (!g.keys.has('KeyE') || !close || this.gen[r.i] >= 1 || g.state !== 'playing') { this.repairing = null; this.endSkill(); }
      else {
        if (!this.skill) {
          this.workAcc += dt / REPAIR_TIME;
          this.skillT -= dt;
          if (this.skillT <= 0) this.startSkill();
        }
        this.workT -= dt;
        if (this.workT <= 0 && this.workAcc > 0) { g.send({ t: 'work', i: r.i, a: +this.workAcc.toFixed(4) }); this.workAcc = 0; this.workT = 0.4; }
        this.noiseT -= dt;
        if (this.noiseT <= 0) { g.noise(5, 'step'); this.noiseT = 2; } // repairing is not quiet
        g.setPrompt(this.prompt(r));
      }
    }
    if (this.skill) this.updateSkill(dt);

    // Unlocked doors slide up into the ceiling.
    if (this.doorT >= 0 && this.doorT < 2) {
      this.doorT += dt;
      for (const d of g.world.doors) d.mesh.position.y = Math.min(1, this.doorT / 1.5) * 2.9;
    }

    // Unsmashed tapes murmur stolen voices now and then: a way to find them, and not a nice one.
    this.whisperT -= dt;
    if (this.whisperT <= 0 && g.state === 'playing') {
      this.whisperT = 20 + Math.random() * 20;
      const left = g.items.filter((x) => x?.type === 'tape' && x.active);
      const it = left[Math.floor(Math.random() * left.length)];
      if (it && Math.hypot(it.x - g.p.x, it.z - g.p.z) < 22) {
        this.at(it.x, 0.3, it.z);
        g.localSpeak('distant', this.emitter);
      }
    }
  }

  // Put our sound source somewhere, muffled if there's a wall between it and the listener.
  at(x, y, z) {
    const c = this.g.camera.position;
    this.emitter.setPos(x, y, z);
    this.emitter.setOcclusion(!this.g.level.los(c.x, c.z, x, z));
  }

  // ---------- skill checks ----------
  startSkill() {
    const start = 1.4 + Math.random() * 3.2; // where the zone begins (radians, clockwise from the top)
    this.skill = { a: 0, start, end: start + SKILL_ZONE };
    const arc = (a) => [50 + 40 * Math.sin(a), 50 - 40 * Math.cos(a)];
    const [x1, y1] = arc(start), [x2, y2] = arc(start + SKILL_ZONE);
    this.hud.zone.setAttribute('d', `M${x1} ${y1} A40 40 0 0 1 ${x2} ${y2}`);
    this.hud.skill.className = '';
    this.hud.skill.hidden = false;
    this.g.sfx.skillTick();
  }

  updateSkill(dt) {
    const s = this.skill;
    s.a += SKILL_SPEED * dt;
    this.hud.needle.setAttribute('transform', `rotate(${(s.a * 180) / Math.PI} 50 50)`);
    if (s.a > s.end + 0.15) this.resolveSkill(false); // too late
  }

  // Space during a skill check. Returns true if it was for us.
  onKey(code) {
    if (code !== 'Space' || !this.skill) return false;
    this.resolveSkill(this.skill.a >= this.skill.start && this.skill.a <= this.skill.end);
    return true;
  }

  resolveSkill(ok) {
    const g = this.g, r = this.repairing;
    this.skill = null;
    this.hud.skill.className = ok ? 'good' : 'bad';
    setTimeout(() => { if (!this.skill) this.hud.skill.hidden = true; }, 250);
    this.skillT = 3 + Math.random() * 4;
    if (!r) return;
    if (ok) { g.sfx.skillGood(); this.workAcc += 0.03; }
    else g.send({ t: 'bang', i: r.i });
  }

  endSkill() {
    this.skill = null;
    if (this.hud) this.hud.skill.hidden = true;
  }
}

