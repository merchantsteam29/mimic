// Online story mode ("The Signal"): half the time, one player is secretly working for it.
//   The traitor wins if fewer than half of the rest get out (and nobody exposes them).
//   Powers (only the traitor sees them): Q jams the door you're looking at shut for 20 s;
//   R sabotages: knocks a generator's progress back, or pulls a fuse out of the panel (it clunks).
//   Once per game anyone can call a vote at the power panel (V). Vote out the traitor: exposed, and
//   it takes them. Vote out someone innocent: it gets hungrier.
// The host knows who it is; only the traitor's own browser is told ('role').

const JAM_TIME = 20, JAM_CD = 45, SAB_CD = 40, VOTE_TIME = 20;

export class Traitor {
  constructor(game, { mode = 'normal', traitorId = null } = {}) {
    this.g = game;
    this.on = mode === 'story';
    this.traitorId = traitorId;     // host only
    this.me = traitorId === game.me; // the host may be the traitor
    this.jamT = 0; this.sabT = 0;    // my cooldowns (traitor)
    this.hostCd = { jam: 0, sab: 0 }; // host: when each power is next allowed
    this.accused = false;            // host: the vote happened
    this.vote = null;                // host: { ids, ballots, until }
    this.exposed = false;
    this.el = {
      badge: document.getElementById('traitor'), vote: document.getElementById('vote'),
      voteTitle: document.getElementById('voteTitle'), voteList: document.getElementById('voteList'),
    };
    if (this.me) this.becomeTraitor();
  }

  dispose() { this.el.badge.hidden = true; this.el.vote.hidden = true; }

  becomeTraitor() {
    this.me = true;
    this.el.badge.hidden = false;
    this.draw();
    setTimeout(() => this.g.toast('You\'re working for it now. Nobody can know.'), 1500);
  }

  draw() {
    if (!this.me) return;
    const cd = (t) => (t > 0 ? ` (${Math.ceil(t)}s)` : '');
    this.el.badge.innerHTML = `<b>You are working for it.</b> <kbd>Q</kbd>jam a door${cd(this.jamT)} · <kbd>R</kbd>sabotage${cd(this.sabT)}`;
  }

  // Extra prompt text at the power panel.
  panelHint() {
    return this.on && !this.voteUsed && this.g.alive(this.g.me) ? '  ·  V accuse someone' : '';
  }

  // Keys. True if used.
  onKey(code) {
    const g = this.g;
    if (this.voting && /^Digit[0-9]$/.test(code)) { this.castBallot(Number(code.slice(5))); return true; }
    if (!this.on || g.state !== 'playing') return false;
    if (code === 'KeyV' && g.focus?.type === 'fusebox' && !this.voteUsed) { g.send({ t: 'accuse' }); return true; }
    if (!this.me) return false;
    if (code === 'KeyQ') {
      if (this.jamT > 0) return true;
      if (g.focus?.type !== 'idoor') { g.toast('Look at a door to jam it'); return true; }
      g.send({ t: 'jam', i: g.focus.i });
      this.jamT = JAM_CD;
      return true;
    }
    if (code === 'KeyR') {
      if (this.sabT > 0) return true;
      const f = g.focus;
      if (f?.type === 'gen' && g.obj.gen[f.i] > 0 && g.obj.gen[f.i] < 1) g.send({ t: 'sab', kind: 'gen', i: f.i });
      else if (f?.type === 'fusebox' && g.level.tasks.fuses && g.fusesIn > 0 && !g.power) g.send({ t: 'sab', kind: 'fuse' });
      else { g.toast('Nothing to sabotage here'); return true; }
      this.sabT = SAB_CD;
      return true;
    }
    return false;
  }

  // ---------- host ----------
  hostHandle(m, from) {
    const g = this.g;
    switch (m.t) {
      case 'jam': {
        if (from !== this.traitorId || !g.alive(from) || g.time < this.hostCd.jam) return true;
        const d = g.level.idoors[m.i | 0];
        const P = g.infoOf(from);
        if (!d || Math.hypot(d.x - P.x, d.z - P.z) > 4) return true;
        this.hostCd.jam = g.time + JAM_CD - 1;
        if (d.open) g.broadcast({ t: 'doorSet', i: d.i, open: false, by: from });
        g.broadcast({ t: 'jamDoor', i: d.i, s: JAM_TIME }); // (not 'jam': that name is the request)
        return true;
      }
      case 'sab': {
        if (from !== this.traitorId || !g.alive(from) || g.time < this.hostCd.sab) return true;
        const P = g.infoOf(from);
        if (m.kind === 'gen') {
          const i = m.i | 0, p = g.level.gens[i];
          if (!p || !(g.obj.gen[i] < 1) || Math.hypot(p.x - P.x, p.z - P.z) > 4) return true;
          g.obj.gen[i] = Math.max(0, g.obj.gen[i] - 0.2);
          g.broadcast({ t: 'gen', i, p: +g.obj.gen[i].toFixed(3) }); // quietly
        } else if (m.kind === 'fuse') {
          const fb = g.world.fuseBox;
          if (g.hostFusesIn <= 0 || g.power || Math.hypot(fb.x - P.x, fb.z - P.z) > 4) return true;
          g.hostFusesIn--;
          g.broadcast({ t: 'fuses', ins: g.hostFusesIn, by: null, pulled: 1 });
          const lv = g.level, pos = lv.collide({ x: fb.x - lv.fuseBox.dx * 0.9, z: fb.z - lv.fuseBox.dz * 0.9 }, 0.2);
          g.broadcast({ t: 'drop', i: g.nextItem++, x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) });
        } else return true;
        this.hostCd.sab = g.time + SAB_CD - 1;
        return true;
      }
      case 'accuse': {
        if (!this.on || this.accused || this.vote || !g.alive(from)) return true;
        this.accused = true;
        const ids = g.order.filter((id) => g.alive(id));
        this.vote = { ids, ballots: new Map(), until: g.time + VOTE_TIME };
        g.broadcast({ t: 'vote', ids, by: from });
        return true;
      }
      case 'ballot': {
        const v = this.vote;
        if (!v || !v.ids.includes(from)) return true;
        v.ballots.set(from, v.ids.includes(m.who) ? m.who : null);
        if (v.ballots.size >= v.ids.length) this.resolve();
        return true;
      }
    }
    return false;
  }

  // Host: count the votes. More than half of the voters must agree.
  resolve() {
    const g = this.g, v = this.vote;
    this.vote = null;
    const tally = new Map();
    for (const who of v.ballots.values()) if (who) tally.set(who, (tally.get(who) || 0) + 1);
    let who = null, best = 0;
    for (const [id, n] of tally) if (n > best) { who = id; best = n; }
    if (best <= v.ids.length / 2) who = null;
    const traitor = !!who && who === this.traitorId;
    g.broadcast({ t: 'verdict', who, traitor });
    if (traitor) { this.exposed = true; setTimeout(() => g.hostCatch(who), 1500); }
    else if (who) { g.mimic.aggro += 0.15; g.mimic.hunger = Math.min(4, g.mimic.hunger + 1); }
  }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    switch (m.t) {
      case 'role': this.becomeTraitor(); return true;
      case 'jamDoor': { const d = g.level.idoors[m.i | 0]; if (d) d.jamUntil = g.t + (Number(m.s) || JAM_TIME); return true; }
      case 'jammed': g.sfx.denied(); g.toast('It won\'t budge. Something has jammed it.'); return true;
      case 'vote': {
        this.voteUsed = true;
        if (!g.alive(g.me) || !m.ids.includes(g.me)) return true;
        this.voting = m.ids;
        this.el.voteTitle.textContent = `${g.nameOf(m.by)} called a vote: who is working for it?`;
        this.el.voteList.innerHTML = m.ids.map((id, i) => `<li><kbd>${i + 1}</kbd>${esc(g.nameOf(id))}${id === g.me ? ' (you)' : ''}</li>`).join('')
          + '<li><kbd>0</kbd>Nobody</li>';
        this.el.vote.hidden = false;
        this.voteT = VOTE_TIME;
        return true;
      }
      case 'verdict': {
        this.voting = null;
        this.el.vote.hidden = true;
        this.voteUsed = true;
        if (!m.who) g.toast('Nobody was voted out.');
        else if (m.traitor) g.toast(m.who === g.me ? 'They know.' : `${g.nameOf(m.who)} was working for it.`);
        else g.toast(`${m.who === g.me ? 'You were' : `${g.nameOf(m.who)} was`} innocent. It's hungrier now.`);
        return true;
      }
    }
    return false;
  }

  castBallot(n) {
    const ids = this.voting;
    const who = n === 0 ? null : ids[n - 1];
    if (n !== 0 && !who) return;
    this.g.send({ t: 'ballot', who });
    this.voting = null;
    this.el.voteTitle.textContent = 'Vote cast. Waiting for the others…';
    this.el.voteList.innerHTML = '';
  }

  update(dt) {
    const g = this.g;
    if (this.me) {
      const was = [Math.ceil(this.jamT), Math.ceil(this.sabT)].join();
      this.jamT = Math.max(0, this.jamT - dt); this.sabT = Math.max(0, this.sabT - dt);
      if ([Math.ceil(this.jamT), Math.ceil(this.sabT)].join() !== was) this.draw();
      this.el.badge.hidden = g.state !== 'playing';
    }
    if (this.voteT > 0) { this.voteT -= dt; if (this.voteT <= 0) this.el.vote.hidden = true; }
    if (g.isHost && this.vote && g.time > this.vote.until) this.resolve();
  }

  // Host, at the end: who it was and whether they won.
  result() {
    const g = this.g, id = this.traitorId;
    if (!id) return { traitor: null, traitorWins: false };
    const team = g.order.filter((x) => x !== id);
    const out = team.filter((x) => g.status.get(x) === 'out').length;
    return { traitor: id, traitorWins: !this.exposed && out < team.length / 2 };
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
