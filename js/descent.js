// Endless descent (alone from the title screen, or a lobby Mode online): floor after floor. Each floor is a whole
// building (a new place every time, unless you picked one), and its way out is the way down. Every floor you clear,
// the next is worse: faster, sharper-eyed, hungrier, darker, weaker batteries, less time before it starts. The first
// floor is gentle (fuses only). Nothing to unlock: just how deep you got (your deepest, on this device).
const BEST = 'mimic.depth';

// How hard floor d is (1 = the first). From floor 12 on it stops getting worse.
export function descentRules(d) {
  const k = Math.min(Math.max(1, d), 12) - 1;
  return { speed: 1 + k * 0.04, sight: 1 + k * 0.03, hunger: Math.max(0.4, 1 - k * 0.05), battery: Math.max(0.5, 1 - k * 0.05), broken: Math.min(0.75, 0.25 + k * 0.05), grace: -k * 1.5 };
}

// The level: fuses only on the first floor, then whatever the building has; fewer working lights the deeper you go.
export function descentLevel(d, base = {}) {
  const o = { ...base, broken: descentRules(d).broken };
  if (d <= 1) o.tasks = { fuses: true, gens: 0, tapes: 0, keycard: false };
  return o;
}

export const bestDepth = () => { try { return Number(localStorage.getItem(BEST)) || 0; } catch { return 0; } };
export function recordDepth(d) { try { if (d > bestDepth()) localStorage.setItem(BEST, String(d)); } catch { /* ignore */ } }

// The camcorder stamp's first line.
export const depthStamp = (d) => `FLOOR -${d}`;
