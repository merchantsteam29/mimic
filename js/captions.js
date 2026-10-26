// Sound captions (Settings): "[Footsteps, behind you]" for players who can't hear the game.
// Every positional sound goes through sfx, so the caption comes from wrapping those calls: the emitter
// remembers where it is (setPos), and the direction is worked out from the camera. Things that never
// go through a one-shot (its breathing, a friend talking) are checked every frame instead.

// sfx method -> [index of the emitter argument, caption(args) or null to skip]
const SOUNDS = {
  footstep: [0, (e, o) => e && (o?.heavy ? 'Heavy footsteps' : 'Footsteps')],
  knock: [0, () => 'Knocking'],
  whisper: [0, () => 'Whispering'],
  playVoice: [1, (b, e, style) => ({ scream: 'A scream', echo: 'Your own voice', distant: 'A voice, far off', ellie: 'A girl\'s voice',
    stranger: 'A stranger\'s voice', radio: 'A voice on the radio', recorder: 'A voice on a tape recorder', tape: null }[style] ?? (e ? 'Someone calls out' : 'A voice'))],
  playStitch: [2, () => 'A voice, not quite right'],
  chorus: [1, () => 'Many voices at once'],
  door: [0, (e, open, fast) => (fast ? 'A door bangs open' : open ? 'A door opens' : 'A door closes')],
  handle: [0, () => 'A door handle turns'],
  creak: [0, (e) => e && 'Something creaks'],
  clank: [0, () => 'Metal clanks'],
  moan: [0, () => 'Something moans'],
  snarl: [0, () => 'Snarling'],
  bang: [0, () => 'A loud bang'],
  smash: [0, () => 'Glass smashes'],
  alarm: [-1, () => 'Alarm'],
  rumble: [-1, () => 'The building rumbles'],
  sniff: [0, () => 'Sniffing'],
  screech: [-1, () => 'A screech'],
  flare: [0, () => 'A flare hisses'],
  powerDown: [-1, () => 'The power dies'],
  sting: [0, (e) => e && 'It\'s seen you'],
  clicks: [0, () => 'Clicking'],
  chime: [-1, () => 'The PA chimes'],
  scrape: [0, () => 'Stone scraping'],
  squelch: [-1, (end) => (end ? null : 'Radio crackles')],
  thunder: [-1, () => 'Thunder'],
  siren: [0, () => 'An alarm is going off'],
  shutter: [0, () => 'A shutter slams down'],
};
const FAR = 30;     // not captioned beyond this
const LIFE = 3.2;   // seconds on screen

export class Captions {
  constructor(el, getGame, enabled) {
    Object.assign(this, { el, getGame, enabled });
    this.lines = new Map(); // text -> { el, until }
  }

  // Wrap the sound calls once, when the audio starts.
  attach(sfx) {
    const make = sfx.emitter.bind(sfx);
    sfx.emitter = (...a) => {
      const e = make(...a), set = e.setPos;
      e.setPos = (x, y, z) => { e.x = x; e.z = z; set(x, y, z); };
      return e;
    };
    for (const [name, [at, text]] of Object.entries(SOUNDS)) {
      const fn = sfx[name]?.bind(sfx);
      if (!fn) continue;
      sfx[name] = (...a) => {
        const r = fn(...a);
        if (r !== false && this.enabled()) {
          const t = text(...a);
          if (t) this.add(t, at >= 0 ? a[at] : null);
        }
        return r;
      };
    }
  }

  // Where it came from, from where the camera looks.
  where(e) {
    const g = this.getGame();
    if (!e || e.x === undefined || !g) return '';
    const c = g.camera, dx = e.x - c.position.x, dz = e.z - c.position.z, d = Math.hypot(dx, dz);
    if (d > FAR) return null;
    if (d < 1.2) return 'right next to you';
    const yaw = c.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ahead = (dx * fx + dz * fz) / d, right = (dx * -fz + dz * fx) / d;
    const dir = ahead > 0.7 ? 'ahead' : ahead < -0.6 ? 'behind you' : right > 0 ? 'to the right' : 'to the left';
    return d > 16 ? `far off, ${dir}` : dir;
  }

  add(text, emitter) {
    const g = this.getGame();
    if (!g || !['playing', 'spectate', 'caught'].includes(g.state) || g.paused) return;
    const w = this.where(emitter);
    if (w === null) return;
    this.show(text, w);
  }

  show(text, where = '') {
    const line = where ? `${text}, ${where}` : text;
    let l = this.lines.get(text); // the same sound again just moves the existing line
    if (!l) {
      l = { el: document.createElement('p') };
      this.el.append(l.el);
      this.lines.set(text, l);
      while (this.lines.size > 4) { const [k, old] = this.lines.entries().next().value; old.el.remove(); this.lines.delete(k); }
    }
    l.el.textContent = `[${line}]`;
    l.until = performance.now() + LIFE * 1000;
  }

  // Every frame: expire lines, and caption what isn't a one-shot.
  update() {
    const now = performance.now(), g = this.getGame();
    for (const [k, l] of this.lines) if (now > l.until) { l.el.remove(); this.lines.delete(k); }
    this.el.hidden = !this.enabled() || !g || !['playing', 'spectate', 'caught'].includes(g.state);
    if (this.el.hidden || g.paused || now < (this.slowT || 0)) return;
    this.slowT = now + 700;
    const c = g.camera.position, m = g.mimic;
    // Its breathing, close by (not when you are it).
    if (!g.hunt?.me && m && Math.hypot(m.x - c.x, m.z - c.z) < 6 && m.model.root.visible !== false) {
      this.show('Ragged breathing', this.where({ x: m.x, z: m.z }) || '');
    }
    // Friends talking on voice chat that you can hear.
    const vc = g.mp?.vc;
    if (vc) for (const [id, r] of g.remotes) {
      if (!vc.talking(id) || (g.alive(g.me) && !g.alive(id))) continue;
      const w = g.alive(id) && g.alive(g.me) ? this.where({ x: r.x, z: r.z }) : '';
      if (w !== null) this.show(`${g.nameOf(id)} is talking`, w);
    }
  }
}
