// Imposter voices (online lobby Mode 'imposter', 2+ players). There's one more of you than there should be. From the
// start of the run something walks with the team wearing one of you: their coat, their name over its head, their
// light, their voice (their own clips, now and then, out loud like voice chat), their way of walking (gait.js). It
// keeps out of sight of the one it's copying. Once it has had a while to blend in, it takes anyone it gets alone
// (nobody else within 12 m), and goes back to pretending.
// The team calls it out: look at someone and press V (Accuse). Everyone alive votes, yes or no (1 / 0, D-pad up / B,
// or tap). A yes from more than half and they're out: if it was the fake, it drops the act, chases for a moment, and
// is gone for good; if it was really your friend, it was wrong, and the mimic gets hungrier. One call every 40 s.
// It is game.sw (a Skinwalker underneath): snap 'sw', catches 'sw', the reveal and jumpscare all carry over.
import { Skinwalker } from './skinwalker.js';
import { keyLabel } from './controls.js';

const BLEND = 100, ALONE = 12, VOTE = 12, COOL = 40;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Imposter extends Skinwalker {
  constructor(g, on) {
    super(g, on);
    this.imp = this.on;
    this.cd = 3;            // it's there almost from the start
    this.exposed = false;
    this.takeT = 0; this.huntCd = BLEND; this.speakT = 15;
    this.vote = null;       // { by, target, name, until, ballots (host) }
    this.callT = 0;         // when anyone may accuse again
    this.el = document.getElementById('impVote');
  }

  // ---------- host: being one of you ----------
  think(dt) {
    if (!this.imp) return super.think(dt);
    if (this.exposed || ['reveal', 'chase', 'leave'].includes(this.state)) {
      if (this.exposed && this.state === 'gone') return; // voted out: gone for good
      return super.think(dt);
    }
    const g = this.g, lv = g.level, T = g.targets();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    if (this.state === 'gone') {
      if ((this.cd -= dt) > 0 || T.length < 2) return;
      // Wear someone, and start just out of their sight, near someone else.
      const w = T[Math.floor(Math.random() * T.length)], buddy = T.find((P) => P.id !== w.id);
      const spot = lv.randomFloor((q) => dist(q, buddy) > 6 && dist(q, buddy) < 16 && !lv.los(w.x, w.z, q.x, q.z));
      if (!spot) { this.cd = 2; return; }
      this.x = spot.x; this.z = spot.z;
      this.wearId = w.id; this.victimId = buddy.id;
      this.set('roam');
      return;
    }
    this.stateT += dt;
    const W = T.find((P) => P.id === this.wearId);
    if (!W && !g.order.includes(this.wearId)) { this.set('gone'); this.cd = 3; return; } // (they left the game)
    // Its buddy: whoever isn't the one it's copying, nearest first.
    const others = T.filter((P) => P.id !== this.wearId && !P.hidden).sort((a, b) => dist(a, this) - dist(b, this));
    const B = others[0];
    this.crawl = false;
    if (!B) return;
    this.victimId = B.id;
    const seenByReal = W && !W.hidden && dist(W, this) < 25 && lv.los(W.x, W.z, this.x, this.z);
    // Taking someone who's on their own (after it has blended in for a while).
    this.huntCd -= dt;
    const alone = T.every((P) => P.id === B.id || dist(P, B) > ALONE);
    if (this.huntCd <= 0 && alone && !seenByReal && !B.hidden) {
      if (dist(B, this) < 1.1) { g.hostCatch(B.id, 'sw'); this.huntCd = 70; this.takeT = 0; return; }
      this.walk(B.x, B.z, 3.4, dt);
      return;
    }
    // Keep out of sight of the real one; otherwise stay a few metres from the buddy, like a teammate.
    if (seenByReal) {
      this.goal ||= lv.randomFloor((q) => !lv.los(W.x, W.z, q.x, q.z) && dist(q, B) < 14);
      if (this.goal) this.walk(this.goal.x, this.goal.z, 3.0, dt);
    } else {
      this.goal = null;
      const d = dist(B, this);
      if (d > 7) this.walk(B.x, B.z, d > 14 ? 3.6 : 2.4, dt);
      else if (d < 2.5) this.walk(this.x - (B.x - this.x), this.z - (B.z - this.z), 1.6, dt);
      else this.yaw = Math.atan2(-(B.x - this.x), -(B.z - this.z)) + Math.sin(this.stateT * 0.4) * 0.8; // looking around
    }
    this.speakT -= dt;
    if (this.speakT <= 0) { this.speakT = 22 + Math.random() * 20; this.say(); }
  }

  // ---------- the vote ----------
  // Who I'm looking at (a friend, or it), within 9 m and in sight: 'sw' or a player id.
  aimed() {
    const g = this.g, c = g.camera.position, f = g.flashDir;
    let best = null, bd = 0.965;
    const look = (id, x, z) => {
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
      if (d > 9 || d < 0.3 || !g.level.los(c.x, c.z, x, z)) return;
      const dot = (dx * f.x + dz * f.z) / (d * Math.hypot(f.x, f.z) || 1);
      if (dot > bd) { bd = dot; best = id; }
    };
    for (const [id, r] of g.remotes) if (g.alive(id) && r.visible) look(id, r.x, r.z);
    if (this.state !== 'gone' && this.wearId) look('sw', this.x, this.z);
    return best;
  }

  canAccuse() { const g = this.g; return this.imp && !this.exposed && !this.vote && g.state === 'playing' && g.alive(g.me) && g.t >= this.callT; }

  onKey(code) {
    const g = this.g;
    if (!this.imp) return false;
    if (this.vote && this.vote.mine === undefined && g.alive(g.me) && (code === 'Digit1' || code === 'Digit0')) { this.cast(code === 'Digit1'); return true; }
    if (code !== 'KeyV' || !this.canAccuse()) return false;
    const t = this.aimed();
    if (!t) { g.toast('Look at the one you mean, then accuse'); return true; }
    g.send({ t: 'impAccuse', target: t });
    return true;
  }

  cast(yes) {
    this.vote.mine = yes;
    this.g.send({ t: 'impBallot', yes: !!yes });
    this.render();
  }

  // Host: intents.
  hostHandle(m, from) {
    const g = this.g;
    if (!this.imp) return false;
    if (m.t === 'impAccuse') {
      if (this.exposed || this.vote || g.t < this.callT || !g.alive(from)) return true;
      const target = m.target === 'sw' ? 'sw' : g.order.includes(m.target) && g.alive(m.target) ? m.target : null;
      if (!target) return true;
      // Whose name it goes by: the fake answers to the one it's wearing.
      const name = g.nameOf(target === 'sw' ? this.wearId : target);
      this.ballots = new Map();
      g.broadcast({ t: 'impVote', by: from, target: target === 'sw' ? 'x' : target, name, until: VOTE });
      this.ballots.set(from, true); // accusing is a yes
      return true;
    }
    if (m.t === 'impBallot') {
      if (!this.vote || !this.ballots || !g.alive(from)) return true;
      this.ballots.set(from, !!m.yes);
      this.tally(false);
      return true;
    }
    return false;
  }

  // Host: count. Everyone alive (but the accused, if it's a real friend) gets a say; more than half must say yes.
  tally(timeUp) {
    const g = this.g, v = this.vote;
    if (!v || !this.ballots) return;
    const voters = g.order.filter((id) => g.alive(id) && id !== v.target);
    if (!timeUp && voters.some((id) => !this.ballots.has(id))) return;
    const yes = voters.filter((id) => this.ballots.get(id)).length, out = yes * 2 > voters.length;
    const fake = v.target === 'x';
    g.broadcast({ t: 'impVerdict', out, fake, name: v.name, yes, of: voters.length });
    this.ballots = null;
    if (!out) return;
    if (fake) { this.exposed = true; if (this.state !== 'gone') this.reveal(); }
    else g.mimic.hunger = Math.min(4, g.mimic.hunger + 1); // a real friend: it's wrong, and it's hungrier
  }

  // ---------- everyone ----------
  onNet(m) {
    const g = this.g;
    if (this.imp && m.t === 'impVote') {
      this.vote = { by: m.by, target: m.target, name: m.name, end: g.t + (Number(m.until) || VOTE) };
      this.left = Math.ceil(Number(m.until) || VOTE);
      if (m.by === g.me) this.vote.mine = true;
      this.callT = g.t + COOL;
      g.sfx.sting();
      this.render();
      return true;
    }
    if (this.imp && m.t === 'impVerdict') {
      this.vote = null;
      this.render();
      g.toast(!m.out ? `Not enough of you agreed (${m.yes} of ${m.of}).`
        : m.fake ? `That wasn't ${m.name}.` : `That was really ${m.name}. It's laughing at you.`);
      if (m.out && !m.fake) g.sfx.sting();
      return true;
    }
    return super.onNet(m);
  }

  update(dt) {
    super.update(dt);
    if (!this.imp || !this.vote) return;
    const left = Math.ceil(this.vote.end - this.g.t);
    if (left !== this.left) { this.left = left; this.render(); }
    if (this.g.isHost && this.g.t >= this.vote.end && this.ballots) this.tally(true);
  }

  render() {
    const el = this.el, v = this.vote, g = this.g;
    if (!el) return;
    el.hidden = !v || !g.alive(g.me);
    if (el.hidden) return;
    const who = v.by === g.me ? 'You say' : `${esc(g.nameOf(v.by))} says`;
    const about = v.target === g.me ? 'you are not you' : `that ${esc(v.name)} isn't ${esc(v.name)}`;
    el.innerHTML = `<p>${who} ${about}.</p>`
      + (v.target === g.me ? '<p class="dim">You don\'t get a vote.</p>'
        : v.mine !== undefined ? `<p class="dim">You said ${v.mine ? 'yes' : 'no'}. Waiting for the others.</p>`
          : `<p><button data-yes="1"><kbd>${keyLabel('1')}</kbd> It's not them</button> <button data-yes="0"><kbd>${keyLabel('0')}</kbd> It is</button></p>`)
      + `<p class="dim">${Math.max(0, this.left ?? 0)} s</p>`;
    for (const b of el.querySelectorAll('button[data-yes]')) b.onclick = () => { if (this.vote && this.vote.mine === undefined) this.cast(b.dataset.yes === '1'); };
  }

  get voting() { const g = this.g; return !!this.vote && this.vote.mine === undefined && this.vote.target !== g.me && g.alive(g.me); }

  dispose() {
    super.dispose();
    if (this.el) this.el.hidden = true;
  }
}
