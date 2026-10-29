// Constants and helpers shared by game.js and its parts (game-*.js).
// The host's game settings (online lobby): light, how much there is to do, random events, batteries, its speed.
export const CUSTOM = {
  dark: { light: 0.12, normal: null, dark: 0.6 },                 // share of dead lights
  jobs: { short: { fuses: true }, normal: null, long: { fuses: true, gens: 2, tapes: 3 } },
  battery: { plenty: 1.5, normal: 1, scarce: 0.65 },
  speed: { slow: 0.85, normal: 1, fast: 1.15 },
};
export const customLevel = (c) => {
  if (!c) return {};
  const o = {};
  if (CUSTOM.dark[c.dark] != null) o.broken = CUSTOM.dark[c.dark];
  if (CUSTOM.jobs[c.jobs]) o.tasks = CUSTOM.jobs[c.jobs];
  return o;
};

// The waiting room (online, before a game): a small house, the same for everyone, where you can walk around and talk.
export const ROOM = { theme: 'house', seed: 2604, gen: { size: 18, tasks: { fuses: true }, lore: 0, broken: 0 } };
// What a player needs to catch up on after a drop: the messages that change the world for good.
export const LOGGED = new Set(['took', 'drop', 'fuses', 'power', 'caught', 'out', 'left', 'doorSet', 'gen', 'smashed', 'unlocked', 'fakeItem', 'fakeGone', 'lifeTape', 'revived', 'lightOut', 'hour', 'hsPhase', 'coded', 'liftCalled', 'liftHere', 'lanternDrop', 'lanternHeld']);
export const POOL = 6;              // real point lights, moved to the nearest fixtures (fewer on lower graphics settings)
// lights: the point-light pool; shadow: the flashlight's shadow map (0 = none); mirrors: how many may reflect at once (each one draws
// the whole scene again); far: how far the camera draws (potato: the fog hides the rest anyway).
export const QUALITY = { potato: { lights: 1, shadow: 0, mirrors: 0, far: 40 }, lowest: { lights: 2, shadow: 0, mirrors: 1, far: 60 }, low: { lights: 3, shadow: 512, mirrors: 2, far: 80 }, medium: { lights: 4, shadow: 768, mirrors: 2, far: 80 }, high: { lights: POOL, shadow: 1024, mirrors: 3, far: 80 } };
export const EYE = 1.62, EYE_CROUCH = 1.0;
export const PLAYER_R = 0.3;
export const BATTERY_LIFE = 300;    // seconds of flashlight on a full battery
export const NET_HZ = 15;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
