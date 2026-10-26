// End-of-round recap. The host writes down, every couple of seconds, where each player and the mimic
// were, plus who was taken or got out (where and when) and whose voice it used. That goes out with
// 'end', and the end screen replays it on a map of the building: everyone's route, its route in red,
// and an X where someone was taken.
import { CELL, WALL, EXIT } from './level.js';

const EVERY = 2;
export const PLAYER_COLORS = ['#e0a060', '#62a8e8', '#9ed060', '#d47ad4'];
const MIMIC = '#e01a3a';

export class Recap {
  constructor(g) {
    this.g = g;
    this.paths = {};  // id -> [[x, z, t], ...]
    this.mimic = [];
    this.ev = [];     // [kind ('caught' | 'out'), id, x, z, t, by]
    this.voices = {}; // id -> times it used their voice
    this.t = 0;
  }

  where(id) {
    const g = this.g;
    if (id === g.me) return g.hunt.me ? null : g.p;
    const r = g.remotes.get(id);
    return r?.seen ? { x: r.tx, z: r.tz } : null;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = EVERY;
    const g = this.g;
    for (const id of g.order) {
      const at = g.alive(id) && this.where(id);
      if (at) this.add(this.paths[id] ||= [], at.x, at.z);
    }
    if (g.mimic.model.root.visible || g.hunt.on) this.add(this.mimic, g.mimic.x, g.mimic.z);
  }

  add(path, x, z, force = false) {
    const q = [Math.round(x * 2) / 2, Math.round(z * 2) / 2, Math.round(this.g.time)];
    const l = path[path.length - 1];
    if (!force && l && Math.hypot(l[0] - q[0], l[1] - q[1]) < 1) return;
    path.push(q);
  }

  event(kind, id, by = null) {
    const at = this.where(id);
    if (!at) return;
    this.add(this.paths[id] ||= [], at.x, at.z, true);
    this.ev.push([kind, id, Math.round(at.x * 2) / 2, Math.round(at.z * 2) / 2, Math.round(this.g.time), by === 'sw' ? 'sw' : 0]);
  }

  // The mimic used a clip (online: its key says whose; alone: yours).
  voice(key) {
    const g = this.g, owner = key == null ? g.me : g.mp?.clips.get(key)?.owner;
    if (owner) this.voices[owner] = (this.voices[owner] || 0) + 1;
  }

  data() { return { p: this.paths, m: this.mimic, ev: this.ev, v: this.voices }; }
}

// ---------- the end screen ----------
// Replays the round on a map over a few seconds. Returns a function that stops it.
export function drawRecap(canvas, level, rc, order) {
  const N = level.N, ctx = canvas.getContext('2d');
  const px = Math.max(4, Math.floor(Math.min(560, innerWidth - 80) / N));
  canvas.width = canvas.height = N * px;
  const s = px / CELL; // world metres -> pixels
  const T = Math.max(1, ...Object.values(rc.p || {}).flat().map((q) => q[2]), ...(rc.m || []).map((q) => q[2]));
  const base = document.createElement('canvas');
  base.width = base.height = N * px;
  const b = base.getContext('2d');
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const v = level.get(x, z);
    if (v === WALL) continue;
    b.fillStyle = v === EXIT ? '#3d8a52' : '#2b2825';
    b.fillRect(x * px, z * px, px, px);
  }
  const fb = level.fuseBox;
  b.fillStyle = '#c9a62a';
  b.fillRect((fb.x + 0.3) * px, (fb.z + 0.3) * px, px * 0.4, px * 0.4);
  b.fillStyle = '#e9e4da';
  b.beginPath(); b.arc(level.spawnPos.x * s, level.spawnPos.z * s, px * 0.3, 0, Math.PI * 2); b.fill();

  const line = (pts, upto, color, dash) => {
    const seen = pts.filter((q) => q[2] <= upto);
    if (!seen.length) return null;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, px * 0.28); ctx.lineJoin = ctx.lineCap = 'round';
    ctx.setLineDash(dash ? [px * 0.6, px * 0.5] : []);
    ctx.beginPath();
    seen.forEach((q, i) => (i ? ctx.lineTo(q[0] * s, q[1] * s) : ctx.moveTo(q[0] * s, q[1] * s)));
    ctx.stroke();
    ctx.setLineDash([]);
    return seen[seen.length - 1];
  };
  const dot = (q, color, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(q[0] * s, q[1] * s, r, 0, Math.PI * 2); ctx.fill(); };
  const cross = (x, z, color) => {
    const r = px * 0.55;
    ctx.lineWidth = Math.max(3, px * 0.35); ctx.strokeStyle = '#000';
    for (const w of [ctx.lineWidth + 2, ctx.lineWidth]) {
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x * s - r, z * s - r); ctx.lineTo(x * s + r, z * s + r); ctx.moveTo(x * s + r, z * s - r); ctx.lineTo(x * s - r, z * s + r); ctx.stroke();
      ctx.strokeStyle = color;
    }
  };

  let raf = 0;
  const t0 = performance.now(), DUR = 6000;
  const draw = () => {
    const k = Math.min(1, (performance.now() - t0) / DUR), upto = k * T;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    const mh = line(rc.m || [], upto, MIMIC, true);
    order.forEach((id, i) => {
      const head = line(rc.p?.[id] || [], upto, PLAYER_COLORS[i % 4], false);
      if (head && k < 1) dot(head, PLAYER_COLORS[i % 4], px * 0.45);
    });
    if (mh && k < 1) dot(mh, MIMIC, px * 0.5);
    for (const [kind, id, x, z, t] of rc.ev || []) {
      if (t > upto) continue;
      const c = PLAYER_COLORS[Math.max(0, order.indexOf(id)) % 4];
      if (kind === 'caught') cross(x, z, c);
      else { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x * s, z * s, px * 0.6, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (k < 1) raf = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(raf);
}
