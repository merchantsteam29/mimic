// Every run is a little different, so you can't learn it by heart (picked from the seed: the same for everyone).
//   mood  - what kind of thing it is tonight. It's never told: you work it out from what it does. The end
//           screen says what it was. Multipliers on its speed, sight, talk and hunger, how often it lures, how long
//           it keeps chasing, and the director's weights for the tricks.
//   twist - one rule that's different tonight (shown in the intro), or none.
import { mulberry32 } from './level.js';

export const MOODS = {
  stalker: { name: 'The Stalker', about: 'It was patient. It followed you, and it talked.', speed: 0.95, sight: 1, talk: 0.7, hunger: 1, stalk: 0.6, chase: 0.8, pace: 1, dir: { behind: 2, peek: 1, rush: 0.5 } },
  hunter: { name: 'The Hunter', about: 'It was hungry. It ran you down, and it didn\'t give up.', speed: 1.12, sight: 1.2, talk: 1.5, hunger: 0.75, stalk: 1.6, chase: 1.7, pace: 1.3, dir: { rush: 2 } },
  trickster: { name: 'The Trickster', about: 'It lied. Voices, footsteps, things that weren\'t there.', speed: 0.95, sight: 0.95, talk: 0.55, hunger: 1, stalk: 0.5, chase: 0.9, pace: 0.7, dir: { behind: 2, rush: 2, distant: 3, blackout: 1.5 } },
  watcher: { name: 'The Watcher', about: 'It watched you. From the ends of corridors, from the dark. Mostly it just watched.', speed: 0.9, sight: 1.3, talk: 1.1, hunger: 1.1, stalk: 1.2, chase: 1, pace: 0.8, dir: { peek: 3, blackout: 1.5 } },
};

export const TWISTS = {
  dying: { text: 'The lights are dying faster tonight.' },
  fog: { text: 'There\'s a fog in the building tonight.' },
  vents: { text: 'Tonight it can get into the vents.' },
  batteries: { text: 'Your batteries are old.' },
  chatty: { text: 'Tonight it won\'t stop talking.' },
  ears: { text: 'It can barely see tonight. It can hear everything.' },
};

// kind: 'plain' (mood and twist), 'mood' (a mood only), or 'none'.
export function pickRun(seed, kind) {
  if (kind === 'none') return { mood: null, twist: null };
  const r = mulberry32((seed ^ 0x5eed) >>> 0);
  const ids = Object.keys(MOODS), tw = Object.keys(TWISTS);
  const mood = ids[Math.floor(r() * ids.length)];
  const twist = kind === 'plain' && r() < 0.7 ? tw[Math.floor(r() * tw.length)] : null;
  return { mood, twist };
}

// Fold a mood and twist into the run's difficulty (game.diff) and the mimic.
export function applyRun(g, { mood, twist }) {
  const d = g.diff, m = g.mimic, M = MOODS[mood];
  if (M) {
    Object.assign(d, { speed: d.speed * M.speed, sight: d.sight * M.sight, talk: d.talk * M.talk, hunger: d.hunger * M.hunger });
    m.mood = M;
  }
  switch (twist) {
    case 'dying': d.hunger *= 0.55; break;
    case 'batteries': d.battery *= 0.6; break;
    case 'chatty': d.talk *= 0.55; break;
    case 'ears': d.sight *= 0.6; m.hearMul = 1.6; break;
    case 'vents': m.ventsOK = true; break;
    case 'fog': g.scene.fog.density *= 1.7; break;
  }
}
