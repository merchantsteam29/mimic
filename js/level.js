// Random map: a grid of 2m cells carved into rooms and corridors, themed as a facility, a house, a hospital, a mall, a school, a hotel, a church, an asylum,
// the woods, a subway station, an abandoned fairground or an old mine.
// Also holds the collision, line-of-sight and path-finding the player and the mimic use.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeTextures } from './textures.js';
import { makeMascot } from './mascot.js';

export const CELL = 2;
export const WALL_H = 3;
export const WALL = 0, FLOOR = 1, PROP = 2, EXIT = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const THEMES = {
  facility: {
    id: 'facility', look: 'facility', kicker: 'Research facility',
    names: ['Site-9 · Sublevel 3', 'Kestrel Labs · Wing C', 'Pump Station 14', 'Archive Bunker 7'],
    size: 28, roomSize: [4, 7], tries: 120, minRooms: 8,
    light: 0xd8ecff, lightIntensity: 8.5, corridorLights: true, flicker: 0.4, broken: 0.3,
    fog: 0x020303, fogDensity: 0.08, reverb: [2.8, 0.42],
    props: ['crate', 'shelf', 'desk', 'barrel', 'cabinet', 'crate'], hideProp: 'locker', surface: 'hard',
  },
  house: {
    id: 'house', look: 'house', kicker: 'Abandoned house',
    names: ['The Holloway House', '14 Ashgrove Lane', 'The Marrow Estate', 'Grandmother\'s House'],
    size: 24, roomSize: [3, 6], tries: 100, minRooms: 7,
    light: 0xffb36b, lightIntensity: 7, corridorLights: false, flicker: 0.3, broken: 0.35,
    fog: 0x030201, fogDensity: 0.085, reverb: [1.4, 0.28],
    props: ['bed', 'sofa', 'table', 'bookshelf', 'dresser'], hideProp: 'wardrobe', surface: 'wood',
  },
  // Built like the facility (look: tube lights, metal doors, keycards), dressed as a closed-down hospital.
  hospital: {
    id: 'hospital', look: 'facility', kicker: 'Abandoned hospital',
    names: ['St. Agnes Hospital · Ward 4', 'Mercy General · Isolation Wing', 'Holloway Sanatorium', 'Ward B · Paediatrics'],
    size: 28, roomSize: [3, 6], tries: 120, minRooms: 9,
    light: 0xdcf5e4, lightIntensity: 8, corridorLights: true, flicker: 0.55, broken: 0.35,
    fog: 0x020302, fogDensity: 0.085, reverb: [2.4, 0.4],
    props: ['gurney', 'wheelchair', 'ivstand', 'curtain', 'medcabinet', 'gurney', 'desk'], hideProp: 'locker', surface: 'hard',
  },
  // A shopping mall, closed for years: big shops off long halls, an echo, music still playing somewhere. Built like the
  // facility (tube lights, metal doors, keycards). Hide in the fitting rooms. The mannequins move when you aren't looking.
  mall: {
    id: 'mall', look: 'facility', kicker: 'Closed shopping mall',
    names: ['Westgate Mall · Lower Level', 'Crestview Galleria', 'Northfield Shopping Centre', 'The Arcade at Pine Hills'],
    size: 30, roomSize: [4, 8], tries: 140, minRooms: 8,
    light: 0xfff0dc, lightIntensity: 8, corridorLights: true, flicker: 0.45, broken: 0.35,
    fog: 0x030202, fogDensity: 0.075, reverb: [3.4, 0.5],
    props: ['mannequin', 'clothesrack', 'counter', 'bench', 'planter', 'shoerack', 'mannequin', 'clothesrack'], hideProp: 'fittingroom', surface: 'hard',
  },
  // A school at night: classrooms off long halls of lockers, a clock ticking, the PA system. Built like the facility.
  school: {
    id: 'school', look: 'facility', kicker: 'Closed school',
    names: ['Ashgrove Elementary', 'Pine Hills Middle School', 'St. Brendan\'s · East Wing', 'Holloway County High'],
    size: 28, roomSize: [4, 7], tries: 130, minRooms: 9,
    light: 0xf2f4ff, lightIntensity: 8, corridorLights: true, flicker: 0.45, broken: 0.35,
    fog: 0x020203, fogDensity: 0.08, reverb: [2.6, 0.44],
    props: ['schooldesk', 'schooldesk', 'chalkboard', 'teacherdesk', 'bookshelf', 'cubbies', 'trophycase', 'schooldesk'], hideProp: 'locker', surface: 'hard',
  },
  // An old hotel: lots of small rooms off long carpeted halls. Built like the house (lamps, wooden doors, a key).
  hotel: {
    id: 'hotel', look: 'house', kicker: 'Closed hotel',
    names: ['The Overlook Inn · Floor 3', 'Hotel Marlowe', 'The Grand Ashby', 'Pinewood Lodge · East Wing'],
    size: 30, roomSize: [3, 5], tries: 160, minRooms: 11,
    light: 0xffc27a, lightIntensity: 6.5, corridorLights: true, flicker: 0.35, broken: 0.35,
    fog: 0x030201, fogDensity: 0.085, reverb: [1.2, 0.24],
    props: ['bed', 'bed', 'armchair', 'tvstand', 'dresser', 'luggagecart', 'table'], hideProp: 'wardrobe', surface: 'carpet',
  },
  // An old church and the rooms around it: the nave full of pews, side chapels, the vestry, the crypt stairs.
  // Built like the house (candle lamps, wooden doors, a key). Hide in the confessionals. The statues watch you.
  church: {
    id: 'church', look: 'house', kicker: 'Abandoned church',
    names: ['St. Agnes Parish Church', 'Holloway Chapel', 'Our Lady of the Marsh', 'The Old Kirk, Ashgrove'],
    size: 28, roomSize: [4, 8], tries: 130, minRooms: 8,
    light: 0xffb060, lightIntensity: 6, corridorLights: false, flicker: 0.5, broken: 0.4,
    fog: 0x030202, fogDensity: 0.08, reverb: [4.2, 0.6],
    props: ['pew', 'pew', 'pew', 'candelabra', 'statue', 'altar', 'lectern', 'pew'], hideProp: 'confessional', surface: 'stone',
  },
  // A closed asylum: wards of iron cots off long tiled halls, treatment rooms, the isolation cells. Built like the
  // facility (tube lights, metal doors, keycards). Hide under the cots or in a padded cell. Doors bang from the other side.
  asylum: {
    id: 'asylum', look: 'facility', kicker: 'Closed asylum',
    names: ['Blackmoor State Hospital · Ward C', 'Holloway Asylum', 'Kestrel Hill · East Block', 'Ashgrove Mental Hospital'],
    size: 28, roomSize: [3, 6], tries: 130, minRooms: 9,
    light: 0xe8f0d8, lightIntensity: 7, corridorLights: true, flicker: 0.6, broken: 0.4,
    fog: 0x020302, fogDensity: 0.085, reverb: [2.8, 0.45],
    props: ['bunk', 'bunk', 'restraint', 'tub', 'bunk', 'wheelchair', 'medcabinet', 'restraint'], hideProp: 'isolation', surface: 'hard',
  },
  // Outdoors for once: clearings in the woods joined by paths, the trees too thick to walk through, no ceiling but the dark.
  // You start in a log cabin (the spawn room has walls and a roof). Built like the house (lanterns, wooden gates, a key).
  // Hide in an outhouse. Something snaps a branch out there, and calls you by your own voice.
  forest: {
    id: 'forest', look: 'house', outdoor: true, kicker: 'The woods, off the logging road',
    names: ['Cabin 9, Blackmoor Forest', 'The Hollow, Pine Ridge', 'Camp Kestrel (closed for the season)', 'Mile 14, Old Logging Road'],
    size: 30, roomSize: [4, 8], tries: 140, minRooms: 8,
    light: 0xffa850, lightIntensity: 5, corridorLights: false, flicker: 0.5, broken: 0.45,
    fog: 0x020304, fogDensity: 0.075, reverb: [1.2, 0.2],
    props: ['stump', 'logpile', 'rock', 'deadtree', 'tent', 'stump', 'rock', 'campfire'], hideProp: 'outhouse', surface: 'dirt',
  },
  // A closed subway station: the line runs straight across the map, platforms either side of the track, ticket halls,
  // staff rooms and stairs off them. Built like the facility (tube lights, metal doors, keycards). Hide in a ticket booth.
  // The trains still run, and nobody's driving them (subway.js): don't be on the track when one comes.
  subway: {
    id: 'subway', look: 'facility', tunnel: true, kicker: 'Closed subway station',
    names: ['Ashgrove Street Station', 'Kestrel Line · Platform 2', 'Holloway Junction', 'Pine Hills (closed since 1987)'],
    size: 30, roomSize: [4, 7], tries: 170, minRooms: 8,
    light: 0xe8f2ff, lightIntensity: 7.5, corridorLights: true, flicker: 0.5, broken: 0.4,
    fog: 0x020203, fogDensity: 0.08, reverb: [3.6, 0.5],
    props: ['bench', 'vending', 'bin', 'bench', 'mapboard', 'pillar', 'bin', 'vending'], hideProp: 'ticketbooth', surface: 'hard',
  },
  // Outdoors: an abandoned fairground at night. The "rooms" are open lots between the striped canvas of the stalls and
  // tents; you start in the ticket office (walls and a roof). Built like the house (lamp posts, wooden gates, a key).
  // Game stalls, popcorn carts, teacups, a high striker, and mascot statues that turn when you aren't looking (one of
  // them might not be a statue: mascot.js). Hide in a photo booth. One lot has the ghost train (fair.js), one is the
  // hall of mirrors. The Ferris wheel turns over all of it, and sometimes the music comes back on.
  fair: {
    id: 'fair', look: 'house', outdoor: true, fair: true, kicker: 'Abandoned fairground',
    names: ['Funland Pier (closed 1994)', 'Kestrel Valley Fair', 'Happy Jack\'s Travelling Carnival', 'Blackmoor Fun Park'],
    size: 30, roomSize: [4, 8], tries: 140, minRooms: 8,
    light: 0xffb878, lightIntensity: 5.5, corridorLights: false, flicker: 0.6, broken: 0.4,
    fog: 0x040306, fogDensity: 0.07, reverb: [1.3, 0.22],
    props: ['gamestall', 'popcorn', 'mascot', 'balloons', 'teacup', 'strongman', 'mascot', 'gamestall'], hideProp: 'photobooth', surface: 'dirt',
  },
  // An old mine: tunnels propped up with timber, rail lines, chambers cut out of the rock, a few caged bulbs that still
  // work. Built like the facility (metal doors to the old offices, keycards) but with no vents: you hide in crawl
  // spaces dug into the rock (they work like vents: it can't follow you in). Sound carries strangely down here: every
  // voice comes back off the rock from somewhere else (game.echoVoice).
  mine: {
    id: 'mine', look: 'facility', mine: true, kicker: 'Abandoned mine',
    names: ['Blackmoor Colliery · Seam 4', 'Kestrel Hill Mine (sealed 1961)', 'The Hollow Drift', 'Ashgrove Pit No. 2'],
    size: 30, roomSize: [3, 6], tries: 150, minRooms: 9,
    light: 0xffbf70, lightIntensity: 5, corridorLights: true, flicker: 0.7, broken: 0.6,
    fog: 0x030201, fogDensity: 0.1, reverb: [4.2, 0.65],
    props: ['minecart', 'crate', 'barrel', 'toolrack', 'rubble', 'minecart', 'tnt', 'crate'], hideProp: 'crawlspace', surface: 'stone',
  },
};

// Footprint (w across the front, d front-to-back) of each prop, in metres. Front faces +z.
const PROP_DEFS = {
  crate: { w: 1.25, d: 1.25 }, shelf: { w: 1.8, d: 0.6 }, desk: { w: 1.6, d: 0.8 }, barrel: { w: 1.3, d: 0.75 },
  cabinet: { w: 0.9, d: 0.55 }, locker: { w: 1.0, d: 0.75 }, bed: { w: 1.4, d: 1.95 }, sofa: { w: 1.8, d: 0.85 },
  table: { w: 1.4, d: 0.9 }, generator: { w: 1.5, d: 0.95 }, bookshelf: { w: 1.6, d: 0.45 }, dresser: { w: 1.2, d: 0.55 }, wardrobe: { w: 1.25, d: 0.75 },
  gurney: { w: 0.9, d: 2.0 }, wheelchair: { w: 0.7, d: 0.8 }, ivstand: { w: 0.5, d: 0.5 }, curtain: { w: 1.9, d: 0.3 }, medcabinet: { w: 1.0, d: 0.45 },
  mannequin: { w: 0.6, d: 0.5 }, clothesrack: { w: 1.6, d: 0.6 }, counter: { w: 1.8, d: 0.8 }, bench: { w: 1.6, d: 0.6 }, planter: { w: 1.0, d: 1.0 },
  shoerack: { w: 1.6, d: 0.45 }, fittingroom: { w: 1.2, d: 1.0 }, vent: { w: 0.8, d: 0.12 },
  stump: { w: 0.7, d: 0.7 }, logpile: { w: 1.6, d: 0.8 }, rock: { w: 1.0, d: 0.9 }, deadtree: { w: 0.8, d: 0.8 }, tent: { w: 1.6, d: 1.6 },
  campfire: { w: 1.0, d: 1.0 }, outhouse: { w: 1.1, d: 1.1 },
  bunk: { w: 0.95, d: 1.95 }, restraint: { w: 0.8, d: 0.8 }, tub: { w: 0.9, d: 1.8 }, isolation: { w: 1.1, d: 1.0 },
  pew: { w: 1.9, d: 0.75 }, altar: { w: 1.6, d: 0.9 }, candelabra: { w: 0.6, d: 0.6 }, lectern: { w: 0.7, d: 0.6 }, statue: { w: 0.7, d: 0.7 },
  confessional: { w: 1.3, d: 1.0 },
  minecart: { w: 1.0, d: 1.4 }, toolrack: { w: 1.4, d: 0.4 }, rubble: { w: 1.2, d: 1.0 }, tnt: { w: 0.8, d: 0.6 }, crawlspace: { w: 1.2, d: 0.5 },
  gamestall: { w: 1.8, d: 0.9 }, popcorn: { w: 0.9, d: 0.7 }, mascot: { w: 0.8, d: 0.6 }, balloons: { w: 0.8, d: 0.8 }, teacup: { w: 1.5, d: 1.5 },
  strongman: { w: 0.8, d: 0.6 }, photobooth: { w: 1.2, d: 1.1 },
  vending: { w: 1.0, d: 0.8 }, bin: { w: 0.6, d: 0.6 }, mapboard: { w: 1.6, d: 0.2 }, pillar: { w: 0.7, d: 0.7 }, ticketbooth: { w: 1.3, d: 1.1 },
  armchair: { w: 0.9, d: 0.85 }, tvstand: { w: 1.1, d: 0.5 }, luggagecart: { w: 1.1, d: 0.6 },
  schooldesk: { w: 1.2, d: 1.1 }, teacherdesk: { w: 1.6, d: 0.8 }, chalkboard: { w: 1.9, d: 0.2 }, cubbies: { w: 1.6, d: 0.45 }, trophycase: { w: 1.4, d: 0.5 },
};

// opts (story chapters): { size, tasks: { fuses, gens, tapes, keycard }, lore (tape count), broken (share of dead lights) }
export function generateLevel(seed, themeId, opts = {}) {
  const theme = THEMES[themeId];
  for (let attempt = 0; attempt < 60; attempt++) {
    const data = tryGenerate((seed + attempt * 7919) >>> 0, theme, opts);
    if (data) return new Level(data);
  }
  throw new Error('Could not generate a level');
}

function tryGenerate(seed, th, opts = {}) {
  const rand = mulberry32(seed);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  // Seeded Fisher-Yates. (Sorting with a random comparator is not deterministic across JS engine tiers,
  // and every player must build the exact same level from the seed.)
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const N = opts.size || th.size;
  const grid = new Uint8Array(N * N); // all WALL
  const roomId = new Int16Array(N * N).fill(-1);
  const at = (x, z) => (x < 0 || z < 0 || x >= N || z >= N ? WALL : grid[z * N + x]);
  const set = (x, z, v) => { grid[z * N + x] = v; };

  // The subway's line: four rows straight across (a platform, two rows of track, a platform).
  const tunnel = th.tunnel ? { z: ri(Math.floor(N * 0.36), Math.floor(N * 0.52)), h: 4 } : null;
  // Rooms, with at least one wall cell between any two.
  const rooms = [];
  for (let t = 0; t < th.tries; t++) {
    const w = ri(th.roomSize[0], th.roomSize[1]), h = ri(th.roomSize[0], th.roomSize[1]);
    const x = ri(1, N - w - 1), z = ri(1, N - h - 1);
    if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && z < r.z + r.h + 1 && z + h + 1 > r.z)) continue;
    if (tunnel && z < tunnel.z + tunnel.h + 1 && z + h + 1 > tunnel.z) continue;
    const room = { id: rooms.length, x, z, w, h, cx: x + (w >> 1), cz: z + (h >> 1) };
    rooms.push(room);
    for (let zz = z; zz < z + h; zz++) for (let xx = x; xx < x + w; xx++) { set(xx, zz, FLOOR); roomId[zz * N + xx] = room.id; }
  }
  if (rooms.length < (opts.size ? Math.min(th.minRooms, 7) : th.minRooms)) return null;

  const carve = (a, b) => {
    let x = a.cx, z = a.cz;
    const horizFirst = rand() < 0.5;
    const stepX = () => { while (x !== b.cx) { x += Math.sign(b.cx - x); set(x, z, FLOOR); } };
    const stepZ = () => { while (z !== b.cz) { z += Math.sign(b.cz - z); set(x, z, FLOOR); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
  };
  const dist = (a, b) => Math.abs(a.cx - b.cx) + Math.abs(a.cz - b.cz);

  // Connect every room to the nearest already-connected one (a spanning tree)...
  const done = [rooms[0]], rest = rooms.slice(1);
  while (rest.length) {
    let best = null;
    for (const a of done) for (const b of rest) if (!best || dist(a, b) < best.d) best = { a, b, d: dist(a, b) };
    carve(best.a, best.b);
    done.push(best.b);
    rest.splice(rest.indexOf(best.b), 1);
  }
  // ...then add loops, so the mimic can't corner you at every dead end.
  const loops = Math.max(2, Math.floor(rooms.length / 3));
  for (let i = 0; i < loops; i++) {
    const a = pick(rooms);
    const near = rooms.filter((r) => r !== a).sort((p, q) => dist(a, p) - dist(a, q)).slice(0, 3);
    carve(a, pick(near));
  }
  if (tunnel) { // the platforms and the track, joined to the nearest room on each side
    for (let z = tunnel.z; z < tunnel.z + tunnel.h; z++) for (let x = 1; x < N - 1; x++) set(x, z, FLOOR);
    for (const side of [rooms.filter((r) => r.cz < tunnel.z), rooms.filter((r) => r.cz >= tunnel.z + tunnel.h)]) {
      const r = side.sort((a, b) => Math.abs(a.cz - tunnel.z) - Math.abs(b.cz - tunnel.z))[0];
      if (r) carve(r, { cx: r.cx, cz: tunnel.z + (r.cz < tunnel.z ? 0 : tunnel.h - 1) });
    }
  }

  const bfs = (sx, sz, passable = (v) => v === FLOOR) => {
    const d = new Int16Array(N * N).fill(-1);
    const q = [sz * N + sx];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (d[j] < 0 && passable(grid[j], j)) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    return d;
  };

  const spawnRoom = rooms[0];
  const dist0 = bfs(spawnRoom.cx, spawnRoom.cz);
  const roomDist = (r) => dist0[r.cz * N + r.cx];
  const byDist = rooms.slice().sort((a, b) => roomDist(a) - roomDist(b));
  const exitRoom = byDist[byDist.length - 1];
  const reserved = new Set();
  const key = (x, z) => z * N + x;

  // Exit door: a straight wall cell beside the exit room.
  const exitCands = [];
  for (let z = exitRoom.z; z < exitRoom.z + exitRoom.h; z++) for (let x = exitRoom.x; x < exitRoom.x + exitRoom.w; x++) {
    for (const [dx, dz] of DIRS) {
      const wx = x + dx, wz = z + dz;
      if (wx < 1 || wz < 1 || wx >= N - 1 || wz >= N - 1 || at(wx, wz) !== WALL) continue;
      if (at(wx + dz, wz + dx) !== WALL || at(wx - dz, wz - dx) !== WALL || at(wx + dx, wz + dz) !== WALL) continue;
      exitCands.push({ fx: x, fz: z, wx, wz, dx, dz });
    }
  }
  if (!exitCands.length) return null;
  const exit = pick(exitCands);
  set(exit.wx, exit.wz, EXIT);
  reserved.add(key(exit.fx, exit.fz));

  // Fuse box on another wall of the exit room.
  const boxCands = [];
  for (let z = exitRoom.z; z < exitRoom.z + exitRoom.h; z++) for (let x = exitRoom.x; x < exitRoom.x + exitRoom.w; x++) {
    if (reserved.has(key(x, z)) || Math.abs(x - exit.fx) + Math.abs(z - exit.fz) < 2) continue;
    for (const [dx, dz] of DIRS) if (at(x + dx, z + dz) === WALL) boxCands.push({ x, z, dx, dz });
  }
  if (!boxCands.length) return null;
  const box = pick(boxCands);
  reserved.add(key(box.x, box.z));
  reserved.add(key(spawnRoom.cx, spawnRoom.cz));

  // Props against room walls, never cutting the map in two.
  let floorCount = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] === FLOOR) floorCount++;
  const props = [];
  const roomOrder = shuffle(rooms.slice());
  let hides = 0;
  // The fairground: one lot is the ghost train's (no stalls in it: the car goes round), another the hall of mirrors.
  const ghostLots = th.fair ? rooms.filter((r) => r !== spawnRoom && r !== exitRoom && r.w >= 4 && r.h >= 4) : [];
  const ghostRoom = ghostLots.length ? pick(ghostLots) : null;
  // Cells against a wall of the room, away from its doorways.
  const wallCells = (room) => {
    const cands = [];
    for (let z = room.z; z < room.z + room.h; z++) for (let x = room.x; x < room.x + room.w; x++) {
      if (reserved.has(key(x, z))) continue;
      const walls = DIRS.filter(([dx, dz]) => at(x + dx, z + dz) === WALL);
      if (!walls.length) continue;
      // Stay clear of doorways: no corridor floor next to this cell (8 neighbours).
      let doorway = false;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const v = at(x + ox, z + oz), r = roomId[(z + oz) * N + (x + ox)];
        if (v === FLOOR && r !== room.id) doorway = true;
      }
      if (!doorway) cands.push({ x, z, walls });
    }
    return shuffle(cands);
  };
  // Put a prop in a wall cell, unless it would cut the map in two. keepFront: nothing may block its front.
  const placeAt = (c, room, type, keepFront) => {
    if (grid[key(c.x, c.z)] !== FLOOR || reserved.has(key(c.x, c.z))) return null;
    const [dx, dz] = c.walls[Math.floor(rand() * c.walls.length)];
    const front = key(c.x - dx, c.z - dz);
    if (grid[front] !== FLOOR || reserved.has(front)) return null;
    set(c.x, c.z, PROP);
    const reach = bfs(spawnRoom.cx, spawnRoom.cz);
    let n = 0;
    for (let i = 0; i < grid.length; i++) if (reach[i] >= 0) n++;
    if (n !== floorCount - 1) { set(c.x, c.z, FLOOR); return null; }
    floorCount--;
    if (keepFront) reserved.add(front);
    const p = { cx: c.x, cz: c.z, dx, dz, room: room.id, type, hide: type === th.hideProp };
    props.push(p);
    return p;
  };
  for (const room of roomOrder) {
    if (room === ghostRoom) continue;
    let want = Math.floor((room.w * room.h) / 7) + (rand() < 0.5 ? 1 : 0);
    let wantHide = room === spawnRoom || rand() < 0.45 || hides < rooms.length / 3;
    for (const c of wallCells(room)) {
      if (want <= 0) break;
      const p = placeAt(c, room, wantHide ? th.hideProp : pick(th.props), wantHide);
      if (!p) continue;
      if (wantHide) hides++;
      wantHide = false;
      want--;
    }
  }

  // Free floor cell inside a room (for pickups).
  const freeCell = (room) => {
    for (let t = 0; t < 40; t++) {
      const x = ri(room.x, room.x + room.w - 1), z = ri(room.z, room.z + room.h - 1);
      if (grid[key(x, z)] === FLOOR && !reserved.has(key(x, z))) { reserved.add(key(x, z)); return { x, z }; }
    }
    return null;
  };

  const middle = byDist.filter((r) => r !== spawnRoom && r !== exitRoom);
  if (middle.length < 4) return null;
  const fuses = [];
  for (let i = 0; i < 4; i++) {
    const room = middle[Math.min(middle.length - 1, Math.floor(((i + 0.5) * middle.length) / 4))];
    const c = freeCell(room);
    if (!c) return null;
    fuses.push(c);
  }
  const batteries = [];
  for (let i = 0; i < 3; i++) {
    const c = freeCell(pick(middle.concat([exitRoom])));
    if (c) batteries.push(c);
  }

  // ---------- objectives for this run (from the seed, so every player gets the same) ----------
  const tasks = { fuses: false, gens: 0, tapes: 0, keycard: false };
  if (opts.tasks) { tasks.fuses = !!opts.tasks.fuses; tasks.gens = opts.tasks.gens || 0; tasks.tapes = opts.tasks.tapes || 0; }
  else for (const t of shuffle(['fuses', 'gens', 'tapes']).slice(0, rand() < 0.5 ? 2 : 3)) {
    if (t === 'fuses') tasks.fuses = true;
    if (t === 'gens') tasks.gens = 2;
    if (t === 'tapes') tasks.tapes = 3;
  }
  // Generators: big machines against a wall, in two different rooms.
  const gens = [];
  for (const room of shuffle(middle.slice())) {
    if (gens.length >= tasks.gens) break;
    for (const c of wallCells(room)) {
      const p = placeAt(c, room, 'generator', true);
      if (p) { gens.push(p); break; }
    }
  }
  tasks.gens = gens.length;
  // Tape recorders: on the floor, in different rooms.
  const tapes = [];
  for (const room of shuffle(middle.slice())) {
    if (tapes.length >= tasks.tapes) break;
    const c = freeCell(room);
    if (c) tapes.push(c);
  }
  tasks.tapes = tapes.length;
  if (!opts.tasks && (tasks.fuses ? 1 : 0) + (tasks.gens ? 1 : 0) + (tasks.tapes ? 1 : 0) < 2) return null;
  if (opts.tasks && (tasks.gens !== (opts.tasks.gens || 0) || tasks.tapes !== (opts.tasks.tapes || 0))) return null;

  // Keycard: half the time the exit room is locked (only if it has few doorways and locking it
  // doesn't cut off any other part of the map).
  let doors = [], keycard = null;
  if (opts.tasks ? opts.tasks.keycard : rand() < 0.5) {
    const ins = new Set();
    const ent = [];
    for (let z = exitRoom.z; z < exitRoom.z + exitRoom.h; z++) for (let x = exitRoom.x; x < exitRoom.x + exitRoom.w; x++) {
      for (const [dx, dz] of DIRS) {
        const ox = x + dx, oz = z + dz, k = key(ox, oz);
        if (at(ox, oz) === FLOOR && roomId[k] !== exitRoom.id && !ins.has(k)) { ins.add(k); ent.push({ cx: ox, cz: oz, dx: -dx, dz: -dz }); }
      }
    }
    const reach = bfs(spawnRoom.cx, spawnRoom.cz, (v, i) => v === FLOOR && !ins.has(i));
    let cut = false;
    for (let i = 0; i < grid.length; i++) if (grid[i] === FLOOR && roomId[i] !== exitRoom.id && !ins.has(i) && reach[i] < 0) cut = true;
    const kc = !cut && ent.length && ent.length <= 3 ? freeCell(pick(middle)) : null;
    if (kc) { doors = ent; keycard = kc; tasks.keycard = true; }
    else if (opts.tasks?.keycard) return null; // the chapter needs a locked room: try another layout
  }

  // ---------- scares, placed from the seed so every player gets the same ----------
  // Real doors on some rooms' doorways: you can close them behind you; it opens them, slowly.
  const taken = new Set(doors.map((d) => key(d.cx, d.cz)));
  const idoors = [];
  for (const room of rooms) {
    if (rand() > (th.look === 'house' ? 0.65 : 0.4) || (room === exitRoom && doors.length)) continue;
    const ent = [], seen = new Set();
    for (let z = room.z; z < room.z + room.h; z++) for (let x = room.x; x < room.x + room.w; x++) {
      for (const [dx, dz] of DIRS) {
        const ox = x + dx, oz = z + dz, k = key(ox, oz);
        if (at(ox, oz) === FLOOR && roomId[k] !== room.id && !seen.has(k)) { seen.add(k); ent.push({ cx: ox, cz: oz, dx: -dx, dz: -dz }); }
      }
    }
    if (!ent.length || ent.length > 2 || ent.some((e) => taken.has(key(e.cx, e.cz)))) continue;
    for (const e of ent) { taken.add(key(e.cx, e.cz)); idoors.push({ ...e, open: rand() < 0.4 }); }
  }
  // One hiding spot is it (never in the first room).
  const hidesAll = props.filter((p) => p.hide && p.room !== spawnRoom.id);
  const fakeHide = hidesAll.length >= 3 ? props.indexOf(pick(hidesAll)) : -1;
  // A decoy pickup that looks just like the real thing.
  const dc = freeCell(pick(middle));
  const decoy = dc ? { ...dc, kind: tasks.fuses && rand() < 0.5 ? 'fuse' : 'battery' } : null;
  // Mirrors on room walls.
  const mirrors = [];
  for (const room of shuffle(rooms.slice())) {
    if (mirrors.length >= (th.look === 'house' ? 3 : 2)) break;
    if (room === spawnRoom) continue;
    const c = wallCells(room).find((w) => grid[key(w.x, w.z)] === FLOOR && !reserved.has(key(w.x, w.z)));
    if (!c) continue;
    reserved.add(key(c.x, c.z));
    mirrors.push({ cx: c.x, cz: c.z, dx: c.walls[0][0], dz: c.walls[0][1] });
  }
  let hall = null;
  if (th.fair) { // the hall of mirrors: mirrors all round one lot
    const lots = rooms.filter((r) => r !== spawnRoom && r !== ghostRoom && !mirrors.some((m) => roomId[key(m.cx, m.cz)] === r.id));
    hall = lots.length ? pick(lots) : null;
    for (const c of hall ? wallCells(hall) : []) {
      if (mirrors.length >= 8) break;
      if (grid[key(c.x, c.z)] !== FLOOR || reserved.has(key(c.x, c.z))) continue;
      reserved.add(key(c.x, c.z));
      mirrors.push({ cx: c.x, cz: c.z, dx: c.walls[0][0], dz: c.walls[0][1] });
    }
  }
  // Recordings left by people who came before.
  const lore = [];
  const loreRooms = shuffle(middle.slice());
  for (let i = 0; i < (opts.lore ?? 2); i++) {
    const c = freeCell(loreRooms[i % loreRooms.length]);
    if (c) lore.push({ ...c, n: Math.floor(rand() * 1000) });
    else if (opts.lore) return null; // story tapes must all be there
  }

  // Ceiling lights: one per room, plus some in corridors.
  const lights = rooms.map((r) => ({
    cx: r.cx + (r.w % 2 ? 0.5 : 0), cz: r.cz + (r.h % 2 ? 0.5 : 0), room: r.id,
    broken: r !== spawnRoom && r !== exitRoom && rand() < (opts.broken ?? th.broken),
    flicker: rand() < th.flicker,
  }));
  const corridor = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (grid[key(x, z)] === FLOOR && roomId[key(x, z)] < 0) corridor.push({ x, z });
  shuffle(corridor);
  for (const c of corridor) {
    if (rand() > (th.corridorLights ? 0.5 : 0.12)) continue;
    if (lights.some((l) => Math.hypot(l.cx - (c.x + 0.5), l.cz - (c.z + 0.5)) < 4)) continue;
    lights.push({ cx: c.x + 0.5, cz: c.z + 0.5, room: -1, broken: rand() < th.broken, flicker: rand() < th.flicker });
  }

  const far = byDist.filter((r) => roomDist(r) >= roomDist(exitRoom) * 0.55 && r !== spawnRoom && r !== exitRoom);
  const mimicRoom = pick(far.length ? far : middle);

  return {
    seed, theme: th, name: pick(th.names), N, grid, roomId, rooms, props, fuses, batteries, lights,
    spawn: { cx: spawnRoom.cx, cz: spawnRoom.cz }, mimicSpawn: { cx: mimicRoom.cx, cz: mimicRoom.cz },
    exit, fuseBox: box, spawnRoom: spawnRoom.id, exitRoom: exitRoom.id,
    tasks, gens, tapes, doors, keycard, idoors, fakeHide, decoy, mirrors, lore, tunnel,
    fair: th.fair ? { ghost: ghostRoom ? ghostRoom.id : -1, hall: hall ? hall.id : -1 } : null,
  };
}

const center = (c) => (c + 0.5) * CELL;

// Where you can hide, and what each costs you:
//   box     lockers, wardrobes, fitting rooms: it sniffs at the door (the heartbeat game)
//   bed     under a bed: half the time it doesn't think to look; if it does, the heartbeat game
//   vent    in the wall: it can't follow you in, but getting in and out is loud
//   curtain behind a curtain: quick, but your feet show: if it comes close, it has you
export const HIDE_KIND = { bed: 'bed', bunk: 'bed', curtain: 'curtain', vent: 'vent', crawlspace: 'vent' };

// How far a footstep carries on each floor (x the usual step noise).
export const STEP_CARRY = { carpet: 0.7, wood: 1, hard: 1, stone: 1.1, dirt: 1 };

export class Level {
  constructor(data) {
    Object.assign(this, data);
    this.exitOpen = false;
    // Vents (facility-built places): a few low grates in room walls, from the seed. Added after the layout, so maps don't change.
    if (this.theme.look === 'facility' && !this.theme.mine) { // (the mine has crawl spaces instead)
      const rand = mulberry32(this.seed ^ 0x7e47), N = this.N, cells = [];
      const taken = new Set(this.props.map((q) => q.cz * N + q.cx));
      for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
        if (this.grid[z * N + x] !== FLOOR || this.roomId[z * N + x] < 0 || this.roomId[z * N + x] === this.spawnRoom || taken.has(z * N + x)) continue;
        const walls = DIRS.filter(([dx, dz]) => this.grid[(z + dz) * N + (x + dx)] === WALL);
        if (walls.length === 1) cells.push([x, z, walls[0]]);
      }
      for (let k = 0; k < 3 && cells.length; k++) {
        const [cx, cz, [dx, dz]] = cells.splice(Math.floor(rand() * cells.length), 1)[0];
        this.props.push({ cx, cz, dx, dz, room: this.roomId[cz * N + cx], type: 'vent', hide: true });
      }
    }
    // World-space boxes for props (the grid cell is bigger than the furniture in it).
    for (const p of this.props) {
      const def = PROP_DEFS[p.type];
      const off = CELL / 2 - def.d / 2 - 0.04;
      p.x = center(p.cx) + p.dx * off;
      p.z = center(p.cz) + p.dz * off;
      p.yaw = Math.atan2(-p.dx, -p.dz); // front faces away from the wall
      p.w = def.w; p.d = def.d;
      const hx = p.dx ? def.d / 2 : def.w / 2, hz = p.dx ? def.w / 2 : def.d / 2;
      p.box = { minx: p.x - hx, maxx: p.x + hx, minz: p.z - hz, maxz: p.z + hz };
      p.front = { x: p.x - p.dx * (def.d / 2 + 0.5), z: p.z - p.dz * (def.d / 2 + 0.5) };
      p.kind = HIDE_KIND[p.type] || 'box';
      if (p.kind !== 'box') p.hide = true; // beds and curtains were always there; now you can use them
      if (p.type === 'vent') p.box = { minx: 1, maxx: 0, minz: 1, maxz: 0 }; // in the wall: nothing to bump into
    }
    this.doorsLocked = this.doors.length > 0;
    this.doorCells = new Set(this.doors.map((d) => d.cz * this.N + d.cx));
    for (const d of this.doors) {
      // The door sits on the edge of the corridor cell, where it meets the room.
      const off = CELL / 2 - 0.08;
      d.x = center(d.cx) + d.dx * off; d.z = center(d.cz) + d.dz * off;
      const hx = d.dx ? 0.1 : CELL / 2, hz = d.dx ? CELL / 2 : 0.1;
      d.box = { minx: d.x - hx, maxx: d.x + hx, minz: d.z - hz, maxz: d.z + hz };
    }
    if (this.fakeHide >= 0) this.props[this.fakeHide].fake = true;
    // Real doors: same spot as the keycard doors (the corridor side of a room's doorway).
    this.idoorAt = new Map();
    this.idoors.forEach((d, i) => {
      d.i = i;
      const off = CELL / 2 - 0.08;
      d.x = center(d.cx) + d.dx * off; d.z = center(d.cz) + d.dz * off;
      const hx = d.dx ? 0.08 : CELL / 2, hz = d.dx ? CELL / 2 : 0.08;
      d.box = { minx: d.x - hx, maxx: d.x + hx, minz: d.z - hz, maxz: d.z + hz };
      this.idoorAt.set(d.cz * this.N + d.cx, d);
    });
    for (const m of this.mirrors) {
      m.x = center(m.cx) + m.dx * (CELL / 2 - 0.03); m.z = center(m.cz) + m.dz * (CELL / 2 - 0.03);
      m.nx = -m.dx; m.nz = -m.dz; // facing into the room
    }
    this.spawnPos = { x: center(this.spawn.cx), z: center(this.spawn.cz) };
    this.mimicPos = { x: center(this.mimicSpawn.cx), z: center(this.mimicSpawn.cz) };
  }

  cellOf(v) { return Math.floor(v / CELL); }

  // What's underfoot here: the footstep sound (sfx.footstep) and how far a step carries (STEP_CARRY).
  // Mostly the place's own floor; in the woods the cabin has boards and outside it's leaves and dirt.
  surfaceAt(x, z) {
    const th = this.theme;
    if (th.outdoor) return this.roomId[this.cellOf(z) * this.N + this.cellOf(x)] === this.spawnRoom ? 'wood' : 'dirt';
    return th.surface;
  }
  // The subway's track (the middle two rows of the tunnel): where a train will hit you.
  onTrack(x, z) {
    const t = this.tunnel, cz = this.cellOf(z);
    return !!t && cz >= t.z + 1 && cz <= t.z + 2;
  }
  get(cx, cz) { return cx < 0 || cz < 0 || cx >= this.N || cz >= this.N ? WALL : this.grid[cz * this.N + cx]; }
  blocksMove(cx, cz) { const v = this.get(cx, cz); return v === WALL || (v === EXIT && !this.exitOpen); }
  passable(cx, cz) { const v = this.get(cx, cz); return (v === FLOOR && !this.lockedDoor(cx, cz)) || (v === EXIT && this.exitOpen); }
  lockedDoor(cx, cz) { return this.doorsLocked && this.doorCells.has(cz * this.N + cx); }
  // A real door that's shut (blocks walking and sight; the mimic can open it).
  closedDoor(cx, cz) { const d = this.idoorAt.get(cz * this.N + cx); return d && !d.open ? d : null; }

  // Walls block sight; furniture doesn't.
  los(x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1, n = Math.ceil(Math.hypot(dx, dz) / 0.25);
    for (let i = 1; i < n; i++) {
      const cx = this.cellOf(x1 + (dx * i) / n), cz = this.cellOf(z1 + (dz * i) / n);
      if (this.blocksMove(cx, cz) || this.lockedDoor(cx, cz) || this.closedDoor(cx, cz)) return false;
    }
    return true;
  }

  // Push a circle (p.x, p.z, radius r) out of walls and furniture.
  collide(p, r) {
    const push = (minx, maxx, minz, maxz) => {
      const qx = Math.max(minx, Math.min(p.x, maxx)), qz = Math.max(minz, Math.min(p.z, maxz));
      let dx = p.x - qx, dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d); p.z += (dz / d) * (r - d);
      } else { // centre inside the box: leave by the shortest side
        const opts = [[minx - r - p.x, 0], [maxx + r - p.x, 0], [0, minz - r - p.z], [0, maxz + r - p.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        p.x += opts[0][0]; p.z += opts[0][1];
      }
    };
    for (let k = 0; k < 2; k++) {
      const x0 = this.cellOf(p.x - r), x1 = this.cellOf(p.x + r), z0 = this.cellOf(p.z - r), z1 = this.cellOf(p.z + r);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        if (this.blocksMove(cx, cz)) push(cx * CELL, (cx + 1) * CELL, cz * CELL, (cz + 1) * CELL);
      }
      const boxes = this.props.concat(this.doorsLocked ? this.doors : [], this.idoors.filter((d) => !d.open));
      for (const pr of boxes) {
        const b = pr.box;
        if (p.x + r > b.minx && p.x - r < b.maxx && p.z + r > b.minz && p.z - r < b.maxz) push(b.minx, b.maxx, b.minz, b.maxz);
      }
    }
    return p;
  }

  // Could something of radius r walk straight from a to b? (used to smooth paths)
  clearWalk(x1, z1, x2, z2, r) {
    const dx = x2 - x1, dz = z2 - z1, n = Math.ceil(Math.hypot(dx, dz) / 0.3);
    for (let i = 1; i <= n; i++) {
      const x = x1 + (dx * i) / n, z = z1 + (dz * i) / n;
      for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        const cx = this.cellOf(x + ox), cz = this.cellOf(z + oz);
        if (!this.passable(cx, cz) || this.closedDoor(cx, cz)) return false;
      }
    }
    return true;
  }

  // Breadth-first path over the grid, as world-space waypoints ending at the exact goal.
  findPath(x1, z1, x2, z2, blocked = null) {
    const N = this.N;
    const sx = this.cellOf(x1), sz = this.cellOf(z1);
    let gx = this.cellOf(x2), gz = this.cellOf(z2);
    if (!this.passable(gx, gz)) {
      const n = DIRS.map(([dx, dz]) => [gx + dx, gz + dz]).filter(([x, z]) => this.passable(x, z))
        .sort((a, b) => Math.hypot(center(a[0]) - x1, center(a[1]) - z1) - Math.hypot(center(b[0]) - x1, center(b[1]) - z1));
      if (!n.length) return [];
      [gx, gz] = n[0];
    }
    const prev = new Int32Array(N * N).fill(-1);
    const start = sz * N + sx, goal = gz * N + gx;
    prev[start] = start;
    const q = [start];
    for (let h = 0; h < q.length && prev[goal] < 0; h++) {
      const i = q[h], x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!this.passable(nx, nz)) continue;
        const j = nz * N + nx;
        if (blocked?.has(j)) continue;
        if (prev[j] < 0) { prev[j] = i; q.push(j); }
      }
    }
    if (prev[goal] < 0) return [];
    const path = [];
    for (let i = goal; i !== start; i = prev[i]) path.push({ x: center(i % N), z: center((i / N) | 0) });
    path.reverse();
    if (this.passable(this.cellOf(x2), this.cellOf(z2))) {
      if (path.length) path[path.length - 1] = { x: x2, z: z2 };
      else path.push({ x: x2, z: z2 });
    }
    return path;
  }

  randomFloor(filter = () => true) {
    for (let t = 0; t < 200; t++) {
      const cx = Math.floor(Math.random() * this.N), cz = Math.floor(Math.random() * this.N);
      if (this.get(cx, cz) !== FLOOR) continue;
      const p = { x: center(cx) + (Math.random() - 0.5) * 0.8, z: center(cz) + (Math.random() - 0.5) * 0.8 };
      if (filter(p)) return p;
    }
    return null;
  }

  roomCenter(id) { const r = this.rooms[id]; return { x: center(r.cx), z: center(r.cz) }; }
}

// ---------------------------------------------------------------------------------------------
// Building the 3D scene for a level.

function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));
  m.position.set(x, y, z);
  return m;
}

function buildProp(type, M) {
  const g = new THREE.Group();
  const r = Math.random;
  switch (type) {
    case 'crate':
      g.add(box(1.1, 1.0, 1.1, M.crate, 0, 0.5, 0));
      if (r() < 0.6) { const b = box(0.7, 0.6, 0.7, M.crate, 0.1, 1.3, -0.1); b.rotation.y = r() - 0.5; g.add(b); }
      break;
    case 'shelf':
      for (const x of [-0.88, 0.88]) for (const z of [-0.27, 0.27]) g.add(box(0.05, 2.2, 0.05, M.metal, x, 1.1, z));
      for (const y of [0.15, 0.75, 1.35, 1.95]) {
        g.add(box(1.8, 0.04, 0.6, M.metal, 0, y, 0));
        for (let x = -0.7; x < 0.7; x += 0.45) if (r() < 0.6) g.add(box(0.35, 0.25 + r() * 0.15, 0.4, M.cardboard, x + r() * 0.1, y + 0.17, 0));
      }
      break;
    case 'desk':
      g.add(box(1.6, 0.06, 0.8, M.metal, 0, 0.75, 0));
      for (const x of [-0.75, 0.75]) for (const z of [-0.35, 0.35]) g.add(box(0.05, 0.75, 0.05, M.metal, x, 0.375, z));
      g.add(box(0.5, 0.36, 0.06, M.black, -0.2, 0.98, -0.2));
      g.add(box(0.3, 0.01, 0.22, M.paper, 0.4, 0.785, 0.1));
      break;
    case 'barrel':
      for (const x of [-0.3, 0.32]) g.add(cyl(0.32, 0.32, 0.95, M.rust, x, 0.475, r() * 0.1));
      break;
    case 'cabinet':
      g.add(box(0.9, 1.3, 0.55, M.metal, 0, 0.65, 0));
      for (const y of [0.3, 0.7, 1.1]) g.add(box(0.8, 0.02, 0.01, M.black, 0, y + 0.18, 0.28));
      break;
    case 'locker':
      g.add(box(1.0, 2.1, 0.75, M.locker, 0, 1.05, 0));
      g.add(box(0.02, 2.0, 0.01, M.black, 0, 1.05, 0.376));
      for (let i = 0; i < 6; i++) for (const x of [-0.25, 0.25]) g.add(box(0.3, 0.025, 0.01, M.black, x, 1.6 + i * 0.06, 0.377));
      break;
    case 'bed': // on legs, with room underneath for someone lying flat
      g.add(box(1.4, 0.12, 1.95, M.darkWood, 0, 0.36, 0));
      for (const x of [-0.65, 0.65]) for (const z of [-0.9, 0.9]) g.add(box(0.07, 0.3, 0.07, M.darkWood, x, 0.15, z));
      g.add(box(1.3, 0.2, 1.8, M.sheet, 0, 0.52, 0.05));
      g.add(box(1.36, 0.28, 0.02, M.sheet, 0, 0.3, 0.97)); // the sheet hanging down over the side
      g.add(box(0.5, 0.12, 0.35, M.sheet, -0.3, 0.68, -0.7));
      g.add(box(1.4, 1.0, 0.08, M.darkWood, 0, 0.5, -0.95));
      break;
    case 'stump':
      g.add(cyl(0.3, 0.36, 0.45, M.bark, 0, 0.225, 0, 10), cyl(0.29, 0.29, 0.02, M.wood, 0, 0.455, 0, 10));
      if (r() < 0.4) g.add(box(0.05, 0.03, 0.4, M.metal, 0.05, 0.47, 0)); // an axe head left in it
      break;
    case 'logpile':
      for (let i = 0; i < 6; i++) { const l = cyl(0.12, 0.12, 1.5, M.bark, -0.45 + (i % 3) * 0.26 + (i > 2 ? 0.13 : 0), 0.12 + (i > 2 ? 0.22 : 0), 0, 8); l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2; g.add(l); }
      break;
    case 'rock': {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.stone);
      rk.scale.set(1, 0.6, 0.85); rk.position.y = 0.25; rk.rotation.y = r() * 6;
      g.add(shadowed(rk));
      break;
    }
    case 'deadtree': { // a bare dead tree, branches like arms
      g.add(cyl(0.12, 0.2, 3.2, M.bark, 0, 1.6, 0, 8));
      for (let i = 0; i < 4; i++) { const b = cyl(0.03, 0.06, 1.1, M.bark, 0, 1.6 + i * 0.4, 0, 6); b.rotation.z = (i % 2 ? 1 : -1) * (0.8 + r() * 0.4); b.rotation.y = r() * 6; b.position.x += Math.sin(b.rotation.z) * -0.4; g.add(b); }
      break;
    }
    case 'tent': { // a collapsed tent, half pegged
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 4, 1, true), M.tent);
      t.position.y = 0.5; t.rotation.y = Math.PI / 4; t.rotation.z = 0.25; t.scale.set(1, 1, 1.3);
      g.add(shadowed(t));
      break;
    }
    case 'campfire': { // a ring of stones and burnt-out logs, still smoking (no light)
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(box(0.18, 0.12, 0.14, M.stone, Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42)); }
      for (let i = 0; i < 3; i++) { const l = cyl(0.05, 0.05, 0.6, M.black, 0, 0.08, 0, 6); l.rotation.z = Math.PI / 2; l.rotation.y = i * 1.05; g.add(l); }
      break;
    }
    case 'outhouse': // a wooden outhouse, the moon cut in the door. You can hide in it
      g.add(box(1.0, 2.2, 0.05, M.wood, 0, 1.1, -0.5), box(1.1, 0.06, 1.1, M.darkWood, 0, 2.25, 0));
      for (const x of [-0.5, 0.5]) g.add(box(0.05, 2.2, 1.0, M.wood, x, 1.1, 0));
      g.add(box(0.9, 2.0, 0.05, M.darkWood, 0, 1.0, 0.5));
      g.add(box(0.12, 0.12, 0.02, M.black, 0, 1.75, 0.53)); // the moon
      break;
    case 'bunk': // an iron cot, a thin stained mattress, the straps still on it; room underneath to lie flat
      g.add(box(0.95, 0.04, 1.95, M.metal, 0, 0.42, 0));
      for (const x of [-0.45, 0.45]) for (const z of [-0.93, 0.93]) g.add(cyl(0.022, 0.022, 0.44, M.metal, x, 0.22, z, 6));
      g.add(box(0.9, 0.7, 0.04, M.metal, 0, 0.65, -0.95));
      g.add(box(0.86, 0.12, 1.85, M.sheet, 0, 0.5, 0.02));
      g.add(box(0.88, 0.22, 0.02, M.sheet, 0, 0.36, 0.97)); // the sheet hanging down at the foot
      for (const z of [-0.3, 0.35]) g.add(box(0.98, 0.02, 0.07, M.strap, 0, 0.57, z));
      break;
    case 'restraint': // a heavy wooden chair bolted to the floor, with straps at the wrists and ankles
      g.add(box(0.62, 0.08, 0.55, M.darkWood, 0, 0.48, 0), box(0.62, 0.9, 0.08, M.darkWood, 0, 0.95, -0.24));
      for (const x of [-0.28, 0.28]) {
        g.add(box(0.08, 0.48, 0.08, M.darkWood, x, 0.24, 0.22), box(0.08, 0.48, 0.08, M.darkWood, x, 0.24, -0.22));
        g.add(box(0.08, 0.06, 0.5, M.darkWood, x, 0.72, 0), box(0.1, 0.03, 0.1, M.strap, x, 0.76, 0.12), box(0.1, 0.1, 0.03, M.strap, x, 0.12, 0.24));
      }
      g.add(box(0.66, 0.06, 0.04, M.strap, 0, 1.1, -0.19)); // across the chest
      break;
    case 'tub': // a deep iron bath for "hydrotherapy", the canvas cover half pulled back
      g.add(box(0.85, 0.65, 1.75, M.white, 0, 0.33, 0));
      g.add(box(0.7, 0.04, 1.6, M.black, 0, 0.64, 0));
      g.add(box(0.88, 0.03, 0.9, M.canvas, 0, 0.67, -0.42));
      g.add(cyl(0.03, 0.03, 0.4, M.metal, 0, 0.85, -0.83, 6));
      break;
    case 'isolation': // a padded cell: quilted walls, a heavy door with a slot to look through. You can hide in it
      g.add(box(1.1, 2.3, 0.06, M.padded, 0, 1.15, -0.47), box(1.1, 0.06, 1.0, M.padded, 0, 2.3, 0));
      for (const x of [-0.52, 0.52]) g.add(box(0.06, 2.3, 1.0, M.padded, x, 1.15, 0));
      g.add(box(1.0, 2.1, 0.06, M.locker, 0, 1.05, 0.47)); // the door
      g.add(box(0.3, 0.08, 0.02, M.black, 0, 1.6, 0.505)); // the slot
      g.add(box(0.05, 0.22, 0.05, M.metal, 0.4, 1.05, 0.52)); // the bolt
      break;
    case 'pew':
      g.add(box(1.85, 0.06, 0.42, M.darkWood, 0, 0.45, 0.08), box(1.85, 0.62, 0.05, M.darkWood, 0, 0.78, -0.16));
      for (const x of [-0.9, 0.9]) g.add(box(0.06, 0.95, 0.6, M.darkWood, x, 0.48, 0));
      if (r() < 0.4) g.add(box(0.16, 0.04, 0.22, M.books[0], (r() - 0.5) * 1.2, 0.5, 0.1)); // a hymn book left behind
      break;
    case 'altar':
      g.add(box(1.6, 0.95, 0.85, M.stone, 0, 0.475, 0), box(1.66, 0.03, 0.9, M.altarCloth, 0, 0.965, 0), box(1.3, 0.5, 0.02, M.altarCloth, 0, 0.72, 0.44));
      for (const x of [-0.5, 0.5]) g.add(cyl(0.025, 0.025, 0.3, M.wax, x, 1.13, -0.2, 8), cyl(0.012, 0.004, 0.05, M.flame, x, 1.31, -0.2, 6));
      break;
    case 'candelabra':
      g.add(cyl(0.18, 0.22, 0.05, M.brass, 0, 0.025, 0, 10), cyl(0.025, 0.025, 1.4, M.brass, 0, 0.72, 0, 6), box(0.5, 0.025, 0.025, M.brass, 0, 1.42, 0));
      for (const x of [-0.24, 0, 0.24]) g.add(cyl(0.02, 0.02, 0.18, M.wax, x, 1.53, 0, 6), cyl(0.01, 0.003, 0.04, M.flame, x, 1.64, 0, 6));
      break;
    case 'lectern':
      g.add(cyl(0.05, 0.08, 1.05, M.darkWood, 0, 0.53, 0, 8), box(0.5, 0.03, 0.38, M.darkWood, 0, 1.1, 0.02));
      g.children[1].rotation.x = -0.35;
      g.add(box(0.36, 0.04, 0.26, M.paper, 0, 1.13, 0.04));
      break;
    case 'statue': { // a robed figure on a plinth; like the mall's mannequins, it turns when you aren't looking (scares.js)
      g.add(box(0.6, 0.5, 0.6, M.stone, 0, 0.25, 0));
      const body = new THREE.Group();
      body.position.y = 0.5;
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.25, 10), M.stone);
      robe.position.y = 0.62;
      body.add(robe);
      for (const sx of [-1, 1]) { const a = box(0.08, 0.5, 0.08, M.stone, sx * 0.08, 1.0, 0.14); a.rotation.x = -0.9; a.rotation.z = sx * 0.3; body.add(a); } // hands together
      const head = new THREE.Group();
      head.position.y = 1.4;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.stone);
      skull.scale.y = 1.2;
      head.add(skull, new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), M.stone)); // the hood
      head.children[1].position.set(0, 0.02, -0.02);
      body.add(head);
      g.add(body);
      g.userData.mannequin = { body, head };
      break;
    }
    case 'confessional': // a wooden booth with a lattice and a heavy curtain: you can hide in it
      g.add(box(1.3, 2.3, 0.05, M.darkWood, 0, 1.15, -0.48), box(1.3, 0.08, 1.0, M.darkWood, 0, 2.3, 0));
      for (const x of [-0.63, 0.63]) g.add(box(0.05, 2.3, 1.0, M.darkWood, x, 1.15, 0));
      g.add(box(1.36, 0.12, 0.08, M.darkWood, 0, 2.18, 0.48));
      for (let i = 0; i < 6; i++) g.add(box(0.2, 1.8, 0.02, M.booth, -0.5 + i * 0.2, 1.1, 0.47 + (i % 2) * 0.03));
      for (let i = 0; i < 5; i++) g.add(box(0.02, 0.4, 0.02, M.darkWood, 0.62, 1.4, -0.3 + i * 0.12)); // the lattice
      break;
    case 'armchair':
      g.add(box(0.85, 0.42, 0.8, M.fabric, 0, 0.21, 0), box(0.85, 0.6, 0.18, M.fabric, 0, 0.72, -0.31));
      for (const x of [-0.37, 0.37]) g.add(box(0.13, 0.25, 0.8, M.fabric, x, 0.53, 0));
      g.rotation.y = (r() - 0.5) * 0.5;
      break;
    case 'tvstand': { // an old TV, still faintly on
      g.add(box(1.1, 0.5, 0.48, M.darkWood, 0, 0.25, 0), box(0.62, 0.48, 0.45, M.black, 0, 0.75, -0.02));
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.36), new THREE.MeshStandardMaterial({ color: 0x0a0c0c, emissive: 0x3a4a48, emissiveIntensity: 0.5 }));
      screen.position.set(0, 0.76, 0.205);
      g.add(screen);
      break;
    }
    case 'luggagecart':
      g.add(box(1.0, 0.05, 0.55, M.brass, 0, 0.18, 0));
      for (const x of [-0.48, 0.48]) g.add(box(0.03, 1.6, 0.03, M.brass, x, 0.98, 0));
      g.add(box(1.0, 0.03, 0.03, M.brass, 0, 1.78, 0));
      for (let i = 0; i < 3; i++) if (r() < 0.75) g.add(box(0.5 + r() * 0.3, 0.3, 0.42, M.clothes[Math.floor(r() * M.clothes.length)], (r() - 0.5) * 0.3, 0.36 + i * 0.32, 0));
      for (const x of [-0.42, 0.42]) for (const z of [-0.22, 0.22]) g.add(cyl(0.05, 0.05, 0.04, M.black, x, 0.05, z, 8));
      break;
    case 'minecart': { // an ore cart on a short length of rail, half full of rock
      g.add(box(0.8, 0.5, 1.2, M.rust, 0, 0.5, 0), box(0.7, 0.12, 1.1, M.stone, 0, 0.72, 0));
      for (const x of [-0.42, 0.42]) for (const z of [-0.4, 0.4]) { const w = cyl(0.14, 0.14, 0.06, M.black, x, 0.18, z, 10); w.rotation.z = Math.PI / 2; g.add(w); }
      for (const x of [-0.35, 0.35]) g.add(box(0.05, 0.05, 1.4, M.metal, x, 0.03, 0));
      for (let z = -0.6; z <= 0.61; z += 0.4) g.add(box(1.0, 0.04, 0.14, M.darkWood, 0, 0.02, z));
      break;
    }
    case 'toolrack': // picks and shovels leaning on a board, a hard hat on a nail
      g.add(box(1.4, 1.2, 0.06, M.darkWood, 0, 1.1, -0.17));
      for (let i = 0; i < 4; i++) { const h = cyl(0.025, 0.025, 1.2, M.wood, -0.5 + i * 0.33, 0.62, -0.08, 6); h.rotation.z = (r() - 0.5) * 0.25; g.add(h, box(0.3, 0.06, 0.05, M.metal, -0.5 + i * 0.33, 1.2, -0.08)); }
      g.add(cyl(0.16, 0.18, 0.12, M.awningHat || M.genPaint, 0.4, 1.55, -0.1, 10));
      break;
    case 'rubble': // a fall of rock from the roof, timber snapped under it
      for (let i = 0; i < 7; i++) { const b = box(0.25 + r() * 0.35, 0.2 + r() * 0.3, 0.25 + r() * 0.3, M.stone, (r() - 0.5) * 0.9, 0.12 + r() * 0.2, (r() - 0.5) * 0.7); b.rotation.set(r(), r(), r()); g.add(b); }
      { const t = box(0.14, 0.14, 1.3, M.darkWood, 0.1, 0.3, 0); t.rotation.set(0.3, 0.6, 0.2); g.add(t); }
      break;
    case 'tnt': // a crate of old dynamite, the lid off
      g.add(box(0.8, 0.45, 0.55, M.crate, 0, 0.225, 0));
      for (let i = 0; i < 5; i++) { const s = cyl(0.04, 0.04, 0.5, M.tntRed || M.bag, -0.24 + i * 0.12, 0.5, 0.05, 8); s.rotation.x = Math.PI / 2; g.add(s); }
      break;
    case 'crawlspace': { // a low hole dug into the rock, propped with two bits of timber. You can crawl in and hide
      const dark = new THREE.MeshBasicMaterial({ color: 0x010101 });
      g.add(box(1.0, 0.6, 0.04, dark, 0, 0.32, -0.22));
      g.add(box(0.12, 0.7, 0.12, M.darkWood, -0.55, 0.35, -0.18), box(0.12, 0.7, 0.12, M.darkWood, 0.55, 0.35, -0.18), box(1.25, 0.12, 0.14, M.darkWood, 0, 0.72, -0.18));
      for (let i = 0; i < 4; i++) { const b = box(0.2 + r() * 0.2, 0.12, 0.2, M.stone, (r() - 0.5) * 1.2, 0.06, 0.05 + r() * 0.15); b.rotation.y = r() * 3; g.add(b); }
      break;
    }
    case 'vent': { // a low grate in the wall
      g.add(box(0.75, 0.48, 0.05, M.metal, 0, 0.3, -0.02));
      const dark = new THREE.MeshBasicMaterial({ color: 0x020202 });
      g.add(box(0.66, 0.4, 0.02, dark, 0, 0.3, -0.03));
      for (let i = 0; i < 6; i++) g.add(box(0.68, 0.025, 0.03, M.metal, 0, 0.12 + i * 0.07, 0.005));
      break;
    }
    case 'sofa':
      g.add(box(1.8, 0.45, 0.85, M.fabric, 0, 0.225, 0));
      g.add(box(1.8, 0.55, 0.22, M.fabric, 0, 0.72, -0.31));
      for (const x of [-0.82, 0.82]) g.add(box(0.16, 0.3, 0.85, M.fabric, x, 0.6, 0));
      break;
    case 'table':
      g.add(box(1.4, 0.06, 0.9, M.wood, 0, 0.76, 0));
      for (const x of [-0.62, 0.62]) for (const z of [-0.38, 0.38]) g.add(box(0.06, 0.76, 0.06, M.wood, x, 0.38, z));
      if (r() < 0.6) g.add(cyl(0.12, 0.1, 0.03, M.paper, 0.3, 0.805, 0.1));
      break;
    case 'bookshelf':
      g.add(box(1.6, 2.2, 0.04, M.darkWood, 0, 1.1, -0.2));
      for (const x of [-0.78, 0.78]) g.add(box(0.04, 2.2, 0.45, M.darkWood, x, 1.1, 0));
      for (const y of [0.05, 0.6, 1.15, 1.7, 2.18]) g.add(box(1.6, 0.04, 0.45, M.darkWood, 0, y, 0));
      for (const y of [0.07, 0.62, 1.17, 1.72]) {
        let x = -0.72;
        while (x < 0.68) {
          const w = 0.04 + r() * 0.05, h = 0.3 + r() * 0.18;
          if (r() < 0.85) g.add(box(w, h, 0.3, M.books[Math.floor(r() * M.books.length)], x + w / 2, y + h / 2 + 0.02, 0.02));
          x += w + 0.005;
        }
      }
      break;
    case 'dresser':
      g.add(box(1.2, 0.9, 0.55, M.wood, 0, 0.45, 0));
      for (const y of [0.25, 0.5, 0.75]) g.add(box(1.1, 0.015, 0.01, M.black, 0, y, 0.28));
      if (r() < 0.5) g.add(box(0.35, 0.45, 0.04, M.mirror, 0, 1.15, -0.2));
      break;
    case 'generator': {
      g.add(box(1.4, 0.95, 0.8, M.genPaint, 0, 0.55, 0));
      g.add(box(1.5, 0.08, 0.9, M.metal, 0, 0.04, 0));
      const tank = cyl(0.22, 0.22, 0.9, M.metal, -0.2, 0.62, 0.42, 12);
      tank.rotation.z = Math.PI / 2;
      g.add(tank);
      for (let i = 0; i < 5; i++) g.add(box(0.02, 0.5, 0.01, M.black, 0.25 + i * 0.07, 0.6, 0.405)); // vents
      g.add(cyl(0.05, 0.05, 0.7, M.rust, 0.55, 1.25, -0.2, 8));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 1.2 }));
      lamp.position.set(-0.55, 1.08, 0.3);
      g.add(lamp);
      g.userData.lamp = lamp.material;
      break;
    }
    case 'gurney': { // a hospital bed on wheels, sheet still on it
      g.add(box(0.85, 0.08, 1.95, M.metal, 0, 0.62, 0));
      g.add(box(0.8, 0.12, 1.85, M.sheet, 0, 0.72, 0));
      if (r() < 0.5) g.add(box(0.45, 0.14, 1.1, M.sheet, 0.05, 0.85, 0.2)); // something under the sheet
      g.add(box(0.85, 0.5, 0.05, M.metal, 0, 0.9, -0.97));
      for (const x of [-0.42, 0.42]) {
        g.add(box(0.03, 0.03, 1.8, M.metal, x, 0.85, 0)); // rails
        for (const z of [-0.85, 0.85]) { g.add(box(0.04, 0.58, 0.04, M.metal, x * 0.9, 0.31, z)); g.add(cyl(0.05, 0.05, 0.04, M.black, x * 0.9, 0.05, z, 8)); }
      }
      break;
    }
    case 'wheelchair': {
      g.add(box(0.5, 0.05, 0.45, M.fabric, 0, 0.5, 0));
      g.add(box(0.5, 0.45, 0.04, M.fabric, 0, 0.78, -0.22));
      for (const x of [-0.3, 0.3]) {
        const w = cyl(0.3, 0.3, 0.03, M.metal, x, 0.3, -0.05, 16);
        w.rotation.z = Math.PI / 2;
        g.add(w, box(0.03, 0.03, 0.4, M.metal, x * 0.85, 0.7, 0)); // armrests
      }
      for (const x of [-0.2, 0.2]) g.add(cyl(0.06, 0.06, 0.03, M.black, x, 0.06, 0.3, 8));
      g.rotation.y = (r() - 0.5) * 0.8;
      break;
    }
    case 'ivstand':
      g.add(cyl(0.015, 0.015, 1.9, M.metal, 0, 0.95, 0, 6));
      for (let i = 0; i < 4; i++) { const leg = box(0.32, 0.02, 0.02, M.metal, 0, 0.04, 0); leg.rotation.y = (i * Math.PI) / 2; leg.position.set(Math.cos(i * Math.PI / 2) * 0.14, 0.04, Math.sin(i * Math.PI / 2) * 0.14); g.add(leg); }
      g.add(box(0.3, 0.015, 0.015, M.metal, 0, 1.85, 0));
      g.add(box(0.12, 0.2, 0.05, M.bag, 0.12, 1.68, 0));
      if (r() < 0.6) g.add(box(0.12, 0.2, 0.05, M.bag, -0.12, 1.68, 0));
      break;
    case 'curtain': { // a privacy screen on a frame, a little torn
      for (const x of [-0.9, 0.9]) { g.add(box(0.03, 1.9, 0.03, M.metal, x, 0.95, 0)); g.add(box(0.03, 0.03, 0.4, M.metal, x, 0.02, 0)); }
      g.add(box(1.8, 0.03, 0.03, M.metal, 0, 1.9, 0));
      for (let i = 0; i < 6; i++) {
        const h = 1.35 + (r() < 0.2 ? -0.5 * r() : 0);
        g.add(box(0.3, h, 0.02, M.curtain, -0.75 + i * 0.3, 1.88 - h / 2, (i % 2) * 0.04 - 0.02));
      }
      break;
    }
    case 'medcabinet':
      g.add(box(1.0, 1.9, 0.45, M.white, 0, 0.95, 0));
      g.add(box(0.9, 0.9, 0.01, M.glass, 0, 1.35, 0.23));
      for (const y of [1.0, 1.3, 1.6]) for (let x = -0.35; x < 0.4; x += 0.14) if (r() < 0.55) g.add(cyl(0.035, 0.035, 0.12, M.bottles[Math.floor(r() * M.bottles.length)], x, y + 0.07, 0.05, 8));
      g.add(box(0.95, 0.02, 0.01, M.black, 0, 0.55, 0.23));
      break;
    case 'mannequin': { // pale plastic, no face; its head and body turn when nobody's looking (scares.js)
      g.add(cyl(0.18, 0.2, 0.03, M.metal, 0, 0.015, 0, 12), cyl(0.015, 0.015, 0.75, M.metal, 0, 0.4, 0, 6));
      const body = new THREE.Group();
      body.position.y = 0.75;
      body.add(box(0.36, 0.55, 0.2, M.plastic, 0, 0.42, 0), box(0.3, 0.25, 0.18, M.plastic, 0, 0.1, 0));
      if (r() < 0.6) body.add(box(0.4, 0.42, 0.23, M.clothes[Math.floor(r() * M.clothes.length)], 0, 0.45, 0));
      const head = new THREE.Group();
      head.position.y = 0.82;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M.plastic);
      skull.scale.y = 1.25;
      head.add(skull, cyl(0.04, 0.05, 0.1, M.plastic, 0, -0.13, 0, 8));
      body.add(head);
      for (const sx of [-1, 1]) { const a = box(0.07, 0.6, 0.07, M.plastic, sx * 0.22, 0.38, 0); a.rotation.z = sx * (0.08 + r() * 0.2); body.add(a); }
      g.add(body);
      g.userData.mannequin = { body, head };
      break;
    }
    case 'clothesrack':
      for (const x of [-0.75, 0.75]) g.add(box(0.04, 1.45, 0.04, M.metal, x, 0.72, 0), box(0.04, 0.03, 0.5, M.metal, x, 0.02, 0));
      g.add(box(1.55, 0.03, 0.03, M.metal, 0, 1.45, 0));
      for (let x = -0.65; x < 0.66; x += 0.11) if (r() < 0.75) {
        const len = 0.6 + r() * 0.35, c = box(0.05, len, 0.42, M.clothes[Math.floor(r() * M.clothes.length)], x, 1.42 - len / 2, 0);
        c.rotation.y = (r() - 0.5) * 0.3;
        g.add(c);
      }
      break;
    case 'counter': // a shop till: a glass-topped counter with the register still on it
      g.add(box(1.8, 0.95, 0.7, M.white, 0, 0.475, 0), box(1.8, 0.02, 0.75, M.glass, 0, 0.96, 0));
      g.add(box(0.4, 0.2, 0.35, M.black, -0.4, 1.07, -0.05), box(0.32, 0.15, 0.03, M.black, -0.4, 1.25, -0.2));
      if (r() < 0.6) g.add(box(0.3, 0.02, 0.2, M.paper, 0.4, 0.98, 0.1));
      break;
    case 'bench':
      for (const z of [-0.2, 0, 0.2]) g.add(box(1.6, 0.04, 0.16, M.wood, 0, 0.45, z));
      for (const x of [-0.7, 0.7]) g.add(box(0.06, 0.45, 0.5, M.metal, x, 0.22, 0));
      break;
    case 'planter': { // a dead plant in a big square planter
      g.add(box(0.95, 0.6, 0.95, M.white, 0, 0.3, 0), box(0.85, 0.02, 0.85, M.cardboard, 0, 0.6, 0));
      g.add(cyl(0.04, 0.05, 1.2, M.darkWood, 0, 1.2, 0, 6));
      for (let i = 0; i < 6; i++) {
        const leaf = box(0.06, 0.5, 0.02, M.deadLeaf, 0, 1.6 + r() * 0.3, 0);
        leaf.rotation.set((r() - 0.5) * 2.4, r() * 6, (r() - 0.5) * 2.4);
        g.add(leaf);
      }
      break;
    }
    case 'shoerack':
      g.add(box(1.6, 1.8, 0.04, M.white, 0, 0.9, -0.2));
      for (const y of [0.1, 0.5, 0.9, 1.3, 1.7]) g.add(box(1.6, 0.03, 0.42, M.white, 0, y, 0));
      for (const y of [0.12, 0.52, 0.92, 1.32]) for (let x = -0.62; x < 0.65; x += 0.31) if (r() < 0.7) g.add(box(0.26, 0.11, 0.3, M.clothes[Math.floor(r() * M.clothes.length)], x, y + 0.07, 0));
      break;
    case 'fittingroom': // a booth with a heavy curtain in front: you can hide in it
      g.add(box(1.2, 2.2, 0.04, M.white, 0, 1.1, -0.48));
      for (const x of [-0.58, 0.58]) g.add(box(0.04, 2.2, 1.0, M.white, x, 1.1, 0));
      g.add(box(1.2, 0.03, 0.03, M.metal, 0, 2.05, 0.48));
      for (let i = 0; i < 6; i++) g.add(box(0.19, 1.75, 0.02, M.booth, -0.48 + i * 0.193, 1.12, 0.47 + (i % 2) * 0.03));
      g.add(box(0.5, 0.75, 0.02, M.mirror, 0, 1.4, -0.45));
      break;
    case 'schooldesk': // two small desks and their chairs, one knocked over
      for (const x of [-0.32, 0.32]) {
        g.add(box(0.55, 0.03, 0.42, M.wood, x, 0.7, -0.2), box(0.5, 0.18, 0.38, M.metal, x, 0.6, -0.2));
        for (const lx of [-0.24, 0.24]) g.add(box(0.03, 0.6, 0.03, M.metal, x + lx, 0.3, -0.2));
        const chair = new THREE.Group();
        chair.add(box(0.38, 0.03, 0.36, M.wood, 0, 0.42, 0), box(0.38, 0.3, 0.03, M.wood, 0, 0.62, 0.18));
        for (const cx of [-0.17, 0.17]) for (const cz of [-0.15, 0.15]) chair.add(box(0.025, 0.42, 0.025, M.metal, cx, 0.21, cz));
        chair.position.set(x, 0, 0.28);
        if (r() < 0.25) { chair.rotation.x = -Math.PI / 2; chair.position.y = 0.18; chair.position.z = 0.45; }
        g.add(chair);
      }
      break;
    case 'teacherdesk':
      g.add(box(1.6, 0.05, 0.8, M.wood, 0, 0.76, 0), box(0.45, 0.72, 0.75, M.wood, -0.55, 0.37, 0), box(1.5, 0.5, 0.03, M.wood, 0, 0.5, -0.37));
      if (r() < 0.6) g.add(cyl(0.05, 0.05, 0.1, M.metal, 0.4, 0.84, 0.1, 8)); // a mug
      if (r() < 0.7) g.add(box(0.3, 0.04, 0.22, M.paper, 0.1, 0.8, -0.05));
      break;
    case 'chalkboard': // on the wall; somebody's been writing lines
      g.add(box(1.85, 1.05, 0.04, M.chalk, 0, 1.55, -0.06), box(1.9, 0.05, 0.12, M.wood, 0, 1.0, -0.02));
      for (const y of [0.995, 2.095]) g.add(box(1.92, 0.04, 0.06, M.wood, 0, y, -0.05));
      break;
    case 'cubbies':
      g.add(box(1.6, 1.4, 0.04, M.wood, 0, 0.7, -0.2));
      for (const y of [0.02, 0.47, 0.92, 1.38]) g.add(box(1.6, 0.03, 0.42, M.wood, 0, y, 0));
      for (const x of [-0.79, -0.4, 0, 0.4, 0.79]) g.add(box(0.03, 1.4, 0.42, M.wood, x, 0.7, 0));
      for (const y of [0.05, 0.5, 0.95]) for (const x of [-0.6, -0.2, 0.2, 0.6]) if (r() < 0.5) g.add(box(0.28, 0.25, 0.3, M.clothes[Math.floor(r() * M.clothes.length)], x, y + 0.14, 0)); // left-behind bags
      break;
    case 'trophycase':
      g.add(box(1.4, 0.8, 0.5, M.darkWood, 0, 0.4, 0), box(1.4, 1.1, 0.02, M.glass, 0, 1.35, 0.24), box(1.4, 1.1, 0.04, M.darkWood, 0, 1.35, -0.23));
      g.add(box(1.4, 0.04, 0.5, M.darkWood, 0, 1.92, 0), box(1.4, 0.02, 0.45, M.glass, 0, 1.35, 0));
      for (let x = -0.5; x < 0.55; x += 0.25) if (r() < 0.75) g.add(cyl(0.04, 0.06, 0.22, M.brass, x, 0.92, 0, 8), cyl(0.06, 0.03, 0.08, M.brass, x, 1.07, 0, 8));
      break;
    case 'gamestall': { // a ring-toss stall: a striped awning, a counter, bottles to throw at, prizes hanging off the back
      g.add(box(1.8, 1.0, 0.5, M.stallWood, 0, 0.5, 0.15), box(1.8, 2.4, 0.06, M.stallWood, 0, 1.2, -0.42));
      for (const x of [-0.88, 0.88]) g.add(box(0.07, 2.5, 0.07, M.stallWood, x, 1.25, 0.38));
      const awn = box(1.95, 0.05, 1.0, M.awning, 0, 2.45, 0.05); awn.rotation.x = 0.18; g.add(awn);
      for (let x = -0.6; x <= 0.61; x += 0.2) g.add(cyl(0.03, 0.04, 0.2, M.bottles[Math.floor(r() * 3)], x, 1.1, 0.1 + (r() - 0.5) * 0.1, 6));
      for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.prizes[Math.floor(r() * M.prizes.length)]); p.position.set(-0.7 + i * 0.35, 1.8 - r() * 0.3, -0.36); p.scale.y = 1.3; g.add(shadowed(p)); }
      break;
    }
    case 'popcorn': { // a popcorn cart: a glass box on wheels, the kernels gone grey
      g.add(box(0.8, 0.7, 0.55, M.awning, 0, 0.55, 0), box(0.7, 0.55, 0.5, M.glass, 0, 1.18, 0), box(0.78, 0.05, 0.58, M.metal, 0, 1.48, 0));
      g.add(box(0.66, 0.15, 0.45, M.paper, 0, 0.98, 0));
      for (const x of [-0.35, 0.35]) { const w = cyl(0.18, 0.18, 0.05, M.black, x, 0.18, 0.3, 12); w.rotation.x = Math.PI / 2; g.add(w); }
      break;
    }
    case 'mascot': { // a fairground mascot in its clown suit, posed; it turns when you aren't looking (scares.js). Probably a statue
      const m = makeMascot(r);
      m.arms.forEach((a, i) => { a.rotation.x = -r() * 1.5; a.rotation.z = (i ? -1 : 1) * (0.1 + r() * 0.5); });
      m.head.rotation.z = (r() - 0.5) * 0.6;
      g.add(m.root);
      g.userData.mannequin = { body: m.body, head: m.head };
      break;
    }
    case 'balloons': { // a balloon seller's stand: a post, and the balloons, mostly gone soft, still on their strings
      g.add(cyl(0.04, 0.05, 1.6, M.metal, 0, 0.8, 0, 6), cyl(0.25, 0.25, 0.06, M.metal, 0, 0.03, 0, 10));
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, h = 1.9 + r() * 0.8, b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.prizes[i % M.prizes.length]);
        b.position.set(Math.cos(a) * 0.25, h, Math.sin(a) * 0.25); b.scale.set(1, r() < 0.4 ? 0.7 : 1.15, 1);
        g.add(shadowed(b), cyl(0.003, 0.003, h - 1.6, M.black, Math.cos(a) * 0.12, 1.6 + (h - 1.6) / 2, Math.sin(a) * 0.12, 3));
      }
      break;
    }
    case 'teacup': { // a teacup off the ride, tipped over on its side
      const cup = new THREE.Group();
      cup.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.8, 16, 1, true), M.cup)), cyl(0.5, 0.5, 0.04, M.cup, 0, -0.4, 0, 16));
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 10, Math.PI), M.cup);
      handle.position.set(0.68, 0, 0); handle.rotation.z = -Math.PI / 2;
      cup.add(handle);
      cup.position.set(0, 0.62, 0); cup.rotation.z = 1.2;
      g.add(cup);
      break;
    }
    case 'strongman': { // the high striker: a tall board with a bell at the top, the mallet lying at its foot
      g.add(box(0.5, 0.15, 0.5, M.stallWood, 0, 0.075, 0), box(0.25, 3.6, 0.1, M.awning, 0, 1.95, -0.1), cyl(0.12, 0.08, 0.1, M.metal, 0, 3.8, -0.05, 10));
      const mallet = cyl(0.03, 0.03, 0.9, M.stallWood, 0.35, 0.05, 0.2, 6); mallet.rotation.z = Math.PI / 2;
      g.add(mallet, box(0.18, 0.18, 0.3, M.stallWood, 0.8, 0.09, 0.2));
      break;
    }
    case 'photobooth': // a photo booth: a curtain on the front, a stool, a strip of four photos stuck in the slot. You can hide in it
      g.add(box(1.2, 2.2, 0.05, M.awning, 0, 1.1, -0.52), box(0.05, 2.2, 1.05, M.awning, -0.58, 1.1, 0), box(0.05, 2.2, 1.05, M.awning, 0.58, 1.1, 0));
      g.add(box(1.25, 0.25, 1.1, M.stallWood, 0, 2.3, 0), box(1.1, 1.9, 0.02, M.curtain, 0, 1.15, 0.52), box(0.06, 0.25, 0.01, M.paper, 0.7, 1.3, 0.3));
      break;
    case 'vending': { // a drinks machine, its front still faintly lit, half the rows empty
      g.add(box(1.0, 1.9, 0.8, M.vend, 0, 0.95, 0), box(0.62, 1.3, 0.02, M.vendGlass, -0.12, 1.2, 0.41));
      for (let y = 0.7; y < 1.8; y += 0.27) for (let x = -0.38; x < 0.15; x += 0.13) if (r() < 0.55) g.add(cyl(0.035, 0.035, 0.14, M.bottles[Math.floor(r() * 3)], x, y, 0.3, 6));
      g.add(box(0.2, 0.5, 0.02, M.black, 0.33, 1.2, 0.41), box(0.5, 0.12, 0.05, M.black, -0.12, 0.3, 0.4));
      break;
    }
    case 'bin':
      g.add(cyl(0.24, 0.21, 0.8, M.metal, 0, 0.4, 0, 10), cyl(0.27, 0.27, 0.05, M.metal, 0, 0.82, 0, 10));
      if (r() < 0.5) { const b = box(0.3, 0.12, 0.25, M.paper, 0.32, 0.06, 0.1); b.rotation.y = r() * 3; g.add(b); }
      break;
    case 'mapboard': // the line map in a frame on the wall, scratched, one stop circled over and over
      g.add(box(1.6, 1.0, 0.05, M.metal, 0, 1.5, -0.05), box(1.5, 0.9, 0.01, M.lineMap, 0, 1.5, -0.02));
      break;
    case 'pillar': // a tiled column
      g.add(box(0.7, WALL_H, 0.7, M.tile, 0, WALL_H / 2, 0));
      break;
    case 'ticketbooth': // a ticket booth: a window with a slot, a door at the side. You can hide in it
      g.add(box(1.3, 2.4, 0.05, M.vend, 0, 1.2, -0.52), box(0.05, 2.4, 1.1, M.vend, -0.63, 1.2, 0), box(0.05, 2.4, 1.1, M.vend, 0.63, 1.2, 0));
      g.add(box(1.3, 1.0, 0.06, M.vend, 0, 0.5, 0.52), box(1.2, 0.85, 0.02, M.glass, 0, 1.45, 0.52), box(1.3, 0.5, 0.06, M.vend, 0, 2.15, 0.52));
      g.add(box(1.36, 0.05, 1.16, M.metal, 0, 2.42, 0), box(0.4, 0.04, 0.2, M.metal, 0, 1.0, 0.6));
      g.add(box(0.9, 0.18, 0.02, M.boothSign, 0, 2.15, 0.56));
      break;
    case 'wardrobe':
      g.add(box(1.25, 2.2, 0.75, M.darkWood, 0, 1.1, 0));
      g.add(box(0.015, 2.0, 0.01, M.black, 0, 1.1, 0.376));
      for (const x of [-0.06, 0.06]) g.add(cyl(0.02, 0.02, 0.05, M.metal, x, 1.15, 0.39, 6));
      for (let i = 0; i < 5; i++) for (const x of [-0.3, 0.3]) g.add(box(0.36, 0.02, 0.01, M.black, x, 1.65 + i * 0.07, 0.377));
      break;
  }
  return g;
}

// Fuses: small amber glass cartridges that glow faintly so a flashlight catches them.
const fuseGlass = () => new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff8a1a, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.9 });
export function makeFuse(metal = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.6 })) {
  const g = new THREE.Group();
  const glass = fuseGlass();
  g.add(cyl(0.045, 0.045, 0.2, glass, 0, 0, 0), cyl(0.05, 0.05, 0.05, metal, 0, 0.12, 0), cyl(0.05, 0.05, 0.05, metal, 0, -0.12, 0));
  g.rotation.z = Math.PI / 2;
  g.rotation.y = Math.random() * Math.PI;
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

// The woods instead of walls: the cabin's log walls around the room you start in; everywhere else a black thicket
// (tall, so nothing shows over it) with tree trunks standing in front of it.
function buildWoods(level, wallCells, tex, mat, group) { // (also the fairground)
  const N = level.N, cab = level.rooms[0], m4 = new THREE.Matrix4(), r = mulberry32((level.seed ^ 0x7ee5) >>> 0);
  const near = (x, z) => x >= cab.x - 1 && x <= cab.x + cab.w && z >= cab.z - 1 && z <= cab.z + cab.h;
  const cabin = wallCells.filter(([x, z]) => near(x, z)), woods = wallCells.filter(([x, z]) => !near(x, z));
  const logs = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), mat(tex.cabin, { color: 0x9a8a78 }), Math.max(1, cabin.length));
  cabin.forEach(([x, z], i) => logs.setMatrixAt(i, m4.makeTranslation(center(x), WALL_H / 2, center(z))));
  logs.count = cabin.length;
  const fair = level.theme.fair, H = fair ? 4.2 : 8; // the fairground: the striped canvas of tents and stalls, not trees
  const thicket = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, H, CELL), mat(tex.wall, { color: fair ? 0xb0a8a0 : 0x6a7060 }), Math.max(1, woods.length));
  woods.forEach(([x, z], i) => thicket.setMatrixAt(i, m4.makeTranslation(center(x), H / 2, center(z))));
  thicket.count = woods.length;
  logs.receiveShadow = thicket.receiveShadow = true;
  group.add(logs, thicket);
  if (fair) return;
  // Trunks along the edge of every clearing and path.
  const spots = [];
  for (const [x, z] of woods) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const v = level.get(x + dx, z + dz);
    if (v !== WALL && v !== undefined && r() < 0.8) spots.push([center(x) + dx * (CELL / 2 + 0.15) + (r() - 0.5) * 1.4 * Math.abs(dz), center(z) + dz * (CELL / 2 + 0.15) + (r() - 0.5) * 1.4 * Math.abs(dx), 0.3 + r() * 0.2]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 1, H, 7), new THREE.MeshStandardMaterial({ color: 0x2a221a, roughness: 1 }), Math.max(1, spots.length));
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  spots.forEach(([x, z, rad], i) => trunks.setMatrixAt(i, m4.compose(pos.set(x, H / 2, z), q, sc.set(rad, 1, rad))));
  trunks.count = spots.length;
  trunks.castShadow = trunks.receiveShadow = true;
  group.add(trunks);
}

// The subway: gravel and rails down the middle two rows, a yellow line along each platform edge, and black
// tunnel mouths at both ends where the train comes out of the dark.
function buildTrack(level, tex, M, group) {
  const t = level.tunnel, N = level.N, x0 = CELL, x1 = (N - 1) * CELL, len = x1 - x0, mid = (x0 + x1) / 2;
  const z0 = (t.z + 1) * CELL, z1 = (t.z + 3) * CELL, zc = (z0 + z1) / 2;
  tex.gravel.repeat.set(len / 2, 2);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(len, z1 - z0), new THREE.MeshStandardMaterial({ map: tex.gravel, roughness: 1 }));
  bed.rotation.x = -Math.PI / 2; bed.position.set(mid, 0.012, zc); bed.receiveShadow = true;
  group.add(bed);
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a645c, roughness: 0.35, metalness: 0.85 });
  for (const dz of [-0.72, 0.72]) group.add(box(len, 0.12, 0.08, steel, mid, 0.06, zc + dz));
  const n = Math.floor(len / 0.7), sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.07, 2.1), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 1 }), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) sleepers.setMatrixAt(i, m4.makeTranslation(x0 + 0.35 + i * 0.7, 0.035, zc));
  sleepers.receiveShadow = true;
  group.add(sleepers);
  const yellow = new THREE.MeshStandardMaterial({ color: 0xb89a1a, roughness: 0.7 });
  for (const z of [z0 + 0.12, z1 - 0.12]) group.add(box(len, 0.012, 0.18, yellow, mid, 0.008, z));
  const dark = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const [x, ry] of [[x0 + 0.01, Math.PI / 2], [x1 - 0.01, -Math.PI / 2]]) {
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 + 0.4, WALL_H), dark);
    mouth.position.set(x, WALL_H / 2, zc); mouth.rotation.y = ry;
    group.add(mouth);
  }
}

// The mine: timber frames propping up the tunnels every few metres, and rails down the straight runs.
function buildMine(level, M, group) {
  const N = level.N, frames = [], rails = [];
  for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
    if (level.get(x, z) !== FLOOR || level.roomId[z * N + x] >= 0) continue;
    const wx = level.get(x - 1, z) === WALL && level.get(x + 1, z) === WALL, wz = level.get(x, z - 1) === WALL && level.get(x, z + 1) === WALL;
    if (!wx && !wz) continue;
    rails.push([x, z, wx]); // wx: walls left and right, so it runs along z
    if ((x + z) % 3 === 0) frames.push([x, z, wx]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, WALL_H, 0.18), M.darkWood, Math.max(1, frames.length * 2));
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 0.2, 0.2), M.darkWood, Math.max(1, frames.length));
  frames.forEach(([x, z, alongZ], i) => {
    const cx = center(x), cz = center(z);
    q.setFromAxisAngle(up, alongZ ? 0 : Math.PI / 2);
    for (const [k, o] of [[0, -0.88], [1, 0.88]]) posts.setMatrixAt(i * 2 + k, m4.compose(p.set(cx + (alongZ ? o : 0), WALL_H / 2, cz + (alongZ ? 0 : o)), q, s));
    beams.setMatrixAt(i, m4.compose(p.set(cx, WALL_H - 0.12, cz), q, s));
  });
  posts.count = frames.length * 2; beams.count = frames.length;
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.5, metalness: 0.8 });
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.06, CELL), steel, Math.max(1, rails.length * 2));
  const sleeper = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.04, 0.14), M.darkWood, Math.max(1, rails.length * 3));
  rails.forEach(([x, z, alongZ], i) => {
    const cx = center(x), cz = center(z);
    q.setFromAxisAngle(up, alongZ ? 0 : Math.PI / 2);
    for (const [k, o] of [[0, -0.32], [1, 0.32]]) rail.setMatrixAt(i * 2 + k, m4.compose(p.set(cx + (alongZ ? o : 0), 0.03, cz + (alongZ ? 0 : o)), q, s));
    for (let k = 0; k < 3; k++) { const o = -0.65 + k * 0.65; sleeper.setMatrixAt(i * 3 + k, m4.compose(p.set(cx + (alongZ ? 0 : o), 0.02, cz + (alongZ ? o : 0)), q, s)); }
  });
  rail.count = rails.length * 2; sleeper.count = rails.length * 3;
  for (const im of [posts, beams]) { im.castShadow = im.receiveShadow = true; group.add(im); }
  rail.receiveShadow = sleeper.receiveShadow = true;
  group.add(rail, sleeper);
}

export function buildLevelScene(level) {
  const th = level.theme, N = level.N, S = N * CELL;
  const tex = makeTextures(th.id);
  const group = new THREE.Group();
  const mat = (map, opts = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, ...opts });
  const M = {
    wood: mat(tex.wood, { normalMap: tex.woodN, roughness: 0.75 }), darkWood: mat(tex.darkWood, { normalMap: tex.woodN, color: 0x6a5040, roughness: 0.8 }),
    crate: mat(tex.crate), metal: mat(tex.metal, { roughness: 0.6, metalness: 0.4 }),
    locker: mat(tex.locker, { normalMap: tex.metalN, color: th.look === 'house' ? 0x8a8070 : 0x7a8a7e, roughness: 0.6, metalness: 0.35 }), rust: mat(tex.rust, { roughness: 0.8, metalness: 0.3 }),
    fabric: mat(tex.fabric), sheet: mat(tex.sheet), black: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xb8b2a2, roughness: 1 }), cardboard: new THREE.MeshStandardMaterial({ color: 0x7a5e3c, roughness: 1 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.08, metalness: 1 }),
    genPaint: new THREE.MeshStandardMaterial({ color: th.look === 'house' ? 0x5a4a2a : 0x6a6a2a, roughness: 0.6, metalness: 0.3 }),
    white: new THREE.MeshStandardMaterial({ color: 0xb8bab2, roughness: 0.5, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fb4b0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.25 }),
    curtain: new THREE.MeshStandardMaterial({ color: 0x7f9a8e, roughness: 1, side: THREE.DoubleSide }),
    bag: new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.3, transparent: true, opacity: 0.8 }),
    bottles: [0x5a3a14, 0x8a8a80, 0x2a4a5a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2 })),
    plastic: new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.35 }),
    chalk: new THREE.MeshStandardMaterial({ map: tex.chalk, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x7a766c, roughness: 0.95 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 1 }),
    tent: new THREE.MeshStandardMaterial({ color: 0x3a4a2e, roughness: 1, side: THREE.DoubleSide }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x9a9278, roughness: 1 }),
    padded: new THREE.MeshStandardMaterial({ map: tex.padded, color: 0xd8d4c4, roughness: 1 }),
    altarCloth: new THREE.MeshStandardMaterial({ color: 0x6a1418, roughness: 1 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.6 }),
    flame: new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xffa040, emissiveIntensity: 2.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 }),
    clothes: [0x5a2230, 0x22344a, 0x3a3a36, 0x6a5a3a, 0x2a4a3a, 0x7a6a6a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    deadLeaf: new THREE.MeshStandardMaterial({ color: 0x3a3220, roughness: 1, side: THREE.DoubleSide }),
    booth: new THREE.MeshStandardMaterial({ color: 0x4a1418, roughness: 1, side: THREE.DoubleSide }),
    books: [0x4a1c1c, 0x1c2f4a, 0x2f3a1c, 0x4a3b1c, 0x2a2a2a, 0x5a4a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
    vend: new THREE.MeshStandardMaterial({ color: 0x5a1a16, roughness: 0.5, metalness: 0.3 }),
    tntRed: new THREE.MeshStandardMaterial({ color: 0x7a1a12, roughness: 0.7 }),
    awningHat: new THREE.MeshStandardMaterial({ color: 0x8a7a2a, roughness: 0.5 }),
    awning: new THREE.MeshStandardMaterial({ map: tex.stripes || tex.wall, roughness: 0.95, side: THREE.DoubleSide }),
    stallWood: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
    cup: new THREE.MeshStandardMaterial({ color: 0x5a7a8a, roughness: 0.5, side: THREE.DoubleSide }),
    prizes: [0x8a2a2a, 0x2a5a8a, 0x8a7a2a, 0x5a2a7a, 0x2a7a4a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
    vendGlass: new THREE.MeshStandardMaterial({ color: 0x223038, emissive: 0x6a8a9a, emissiveIntensity: 0.25, roughness: 0.1, transparent: true, opacity: 0.55 }),
    lineMap: new THREE.MeshStandardMaterial({ map: tex.lineMap, roughness: 0.6 }),
    tile: new THREE.MeshStandardMaterial({ map: tex.wall, color: 0xb8b4aa, roughness: 0.6 }),
    boothSign: new THREE.MeshStandardMaterial({ map: tex.booth, emissive: 0x101010, roughness: 0.6 }),
  };

  // Floor and ceiling: one plane each over the whole grid (walls hide the rest).
  tex.floor.repeat.set(N, N); tex.floorN.repeat.set(N, N);
  tex.ceilingN.repeat.set(N, N);
  tex.ceiling.repeat.set(N, N);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat(tex.floor, { normalMap: tex.floorN, roughness: th.look === 'house' ? 0.7 : 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(S / 2, 0, S / 2); floor.receiveShadow = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat(tex.ceiling, { normalMap: tex.ceilingN, color: 0x9a968e }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(S / 2, WALL_H, S / 2); ceil.receiveShadow = true;
  if (!th.outdoor) group.add(floor, ceil);
  else { // the woods: the sky, and a roof over the cabin (the room you start in)
    group.add(floor);
    const cab = level.rooms[0], cw = cab.w * CELL, cd = cab.h * CELL;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(cw + CELL * 2, cd + CELL * 2), mat(tex.cabin, { color: 0x6a5a48 }));
    roof.rotation.x = Math.PI / 2; roof.position.set(cab.x * CELL + cw / 2, WALL_H, cab.z * CELL + cd / 2);
    group.add(roof);
  }

  // Walls: a box per wall cell that touches open space.
  const wallCells = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (level.get(x, z) !== WALL) continue;
    if (DIRS.some(([dx, dz]) => level.get(x + dx, z + dz) !== WALL)) wallCells.push([x, z]);
  }
  const m4 = new THREE.Matrix4();
  if (!th.outdoor) {
    const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), mat(tex.wall, { normalMap: tex.wallN, color: th.look === 'house' ? 0xffffff : 0xb8b4aa }), wallCells.length);
    wallCells.forEach(([x, z], i) => walls.setMatrixAt(i, m4.makeTranslation(center(x), WALL_H / 2, center(z))));
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);
  } else buildWoods(level, wallCells, tex, mat, group);
  if (level.tunnel) buildTrack(level, tex, M, group);
  if (th.mine) buildMine(level, M, group);

  // Furniture.
  for (const p of level.props) {
    const g = buildProp(p.type, M);
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.yaw;
    group.add(g);
    p.mesh = g;
  }

  // Light fixtures. Each gets its own material so it can flicker independently.
  const fixtures = level.lights.map((l) => {
    const fm = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: th.light, emissiveIntensity: 1, roughness: 0.5 });
    const x = l.cx * CELL, z = l.cz * CELL;
    const g = new THREE.Group();
    if (th.outdoor) { // a lantern on a post
      g.add(box(0.1, 1.9, 0.1, M.darkWood, 0, 0.95, 0), box(0.5, 0.06, 0.06, M.darkWood, 0.2, 1.88, 0));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), fm);
      lamp.position.set(0.4, 1.72, 0);
      g.add(lamp);
    } else if (th.mine) { // a bare bulb in a wire cage, on a cable along the roof
      g.add(cyl(0.006, 0.006, 0.4, M.black, 0, WALL_H - 0.2, 0, 4));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), fm);
      bulb.position.y = WALL_H - 0.45;
      g.add(bulb);
      for (let i = 0; i < 4; i++) { const w = cyl(0.004, 0.004, 0.2, M.black, Math.cos(i * 1.57) * 0.08, WALL_H - 0.45, Math.sin(i * 1.57) * 0.08, 3); g.add(w); }
    } else if (th.look === 'facility') {
      g.add(box(1.3, 0.08, 0.3, M.metal, 0, WALL_H - 0.04, 0));
      const tube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.2), fm);
      tube.position.y = WALL_H - 0.09;
      g.add(tube);
    } else {
      g.add(cyl(0.005, 0.005, 0.6, M.black, 0, WALL_H - 0.3, 0, 4));
      const shade = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.9, side: THREE.DoubleSide })));
      shade.position.y = WALL_H - 0.66;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), fm);
      bulb.position.y = WALL_H - 0.74;
      g.add(shade, bulb);
    }
    g.position.set(x, 0, z);
    g.traverse((o) => { o.castShadow = false; });
    group.add(g);
    return { ...l, x, z, y: th.outdoor ? 1.9 : th.look === 'facility' ? WALL_H - 0.35 : WALL_H - 0.9, mat: fm, burst: 0, seed: Math.random() * 100 };
  });

  // Pickup spots come from the seed, so every player's copy of the level has them in the same place.
  const rand = mulberry32(level.seed ^ 0x5eed);
  const fuses = level.fuses.map((f) => {
    const x = center(f.x) + (rand() - 0.5) * 0.8, z = center(f.z) + (rand() - 0.5) * 0.8;
    const mesh = makeFuse(M.metal);
    mesh.position.set(x, 0.06, z);
    group.add(mesh);
    return { x, z, mesh };
  });

  const cellGreen = new THREE.MeshStandardMaterial({ color: 0x1d3a22, emissive: 0x3cff6a, emissiveIntensity: 0.35, roughness: 0.4 });
  const batteries = level.batteries.map((b) => {
    const g = new THREE.Group();
    g.add(cyl(0.05, 0.05, 0.18, cellGreen, 0, 0.09, 0), cyl(0.02, 0.02, 0.02, M.metal, 0, 0.19, 0));
    const x = center(b.x) + (rand() - 0.5) * 0.8, z = center(b.z) + (rand() - 0.5) * 0.8;
    g.position.set(x, 0, z);
    group.add(g);
    return { x, z, mesh: g };
  });

  // Tape recorders: reels and a blinking red light.
  const tapes = level.tapes.map((t) => {
    const g = new THREE.Group();
    g.add(box(0.38, 0.12, 0.24, M.black, 0, 0.06, 0));
    for (const x of [-0.09, 0.09]) g.add(cyl(0.06, 0.06, 0.02, M.paper, x, 0.13, -0.02, 14));
    const led = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0a0a, emissiveIntensity: 2 });
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), led);
    l.position.set(0.15, 0.12, 0.1);
    g.add(l);
    const x = center(t.x) + (rand() - 0.5) * 0.6, z = center(t.z) + (rand() - 0.5) * 0.6;
    g.position.set(x, 0, z);
    g.rotation.y = rand() * Math.PI * 2;
    group.add(g);
    return { x, z, mesh: g, led };
  });

  // Keycard (a brass key in the house), glinting on the floor.
  let keycard = null;
  if (level.keycard) {
    const g = new THREE.Group();
    if (th.look === 'house') {
      const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, emissive: 0x3a2a08, roughness: 0.3, metalness: 0.9 });
      g.add(box(0.12, 0.012, 0.012, brass, 0, 0.01, 0), cyl(0.025, 0.025, 0.012, brass, -0.07, 0.01, 0, 12), box(0.012, 0.012, 0.03, brass, 0.05, 0.01, 0.012));
    } else {
      g.add(box(0.09, 0.006, 0.055, new THREE.MeshStandardMaterial({ color: 0xdfe6ea, emissive: 0x203040, roughness: 0.4 }), 0, 0.005, 0));
      g.add(box(0.09, 0.007, 0.012, new THREE.MeshStandardMaterial({ color: 0x103050, emissive: 0x2a7aff, emissiveIntensity: 1.2 }), 0, 0.006, 0.012));
    }
    const x = center(level.keycard.x) + (rand() - 0.5) * 0.6, z = center(level.keycard.z) + (rand() - 0.5) * 0.6;
    g.position.set(x, 0, z);
    g.rotation.y = rand() * Math.PI;
    group.add(g);
    keycard = { x, z, mesh: g };
  }
  const doors = level.doors.map((d) => {
    const g = new THREE.Group();
    const along = d.dx ? [0.12, WALL_H, CELL] : [CELL, WALL_H, 0.12];
    g.add(box(...along, th.look === 'house' ? M.darkWood : M.locker, 0, WALL_H / 2, 0));
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff1020, emissiveIntensity: 1.5 }));
    pad.position.set(-d.dx * 0.1 + (d.dx ? 0 : 0.6), 1.3, -d.dz * 0.1 + (d.dz ? 0 : 0.6));
    g.add(pad);
    g.position.set(d.x, 0, d.z);
    group.add(g);
    return { mesh: g, pad: pad.material };
  });

  // The decoy: it looks exactly like the real thing.
  let decoy = null;
  if (level.decoy) {
    const x = center(level.decoy.x) + (rand() - 0.5) * 0.6, z = center(level.decoy.z) + (rand() - 0.5) * 0.6;
    let mesh;
    if (level.decoy.kind === 'fuse') { mesh = makeFuse(M.metal); mesh.position.set(x, 0.06, z); }
    else {
      mesh = new THREE.Group();
      mesh.add(cyl(0.05, 0.05, 0.18, cellGreen, 0, 0.09, 0), cyl(0.02, 0.02, 0.02, M.metal, 0, 0.19, 0));
      mesh.position.set(x, 0, z);
    }
    group.add(mesh);
    decoy = { x, z, mesh, kind: level.decoy.kind };
  }

  // Real doors: double doors hinged at both sides, swinging into the room.
  const idoorMat = th.look === 'house' ? M.darkWood : M.locker;
  const idoors = level.idoors.map((d) => {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    const ax = d.dx ? 0 : 1, az = d.dx ? 1 : 0; // along the doorway
    const leaves = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * ax * (CELL / 2 - 0.02), 0, side * az * (CELL / 2 - 0.02));
      const leaf = box(0.06, 2.4, CELL / 2 - 0.04, idoorMat, 0, 1.2, (CELL / 2 - 0.04) / 2);
      const knob = cyl(0.03, 0.03, 0.08, M.metal, 0.06, 1.05, CELL / 2 - 0.15, 8);
      knob.rotation.z = Math.PI / 2;
      pivot.add(leaf, knob);
      g.add(pivot);
      // The leaf points along local +z: closed = toward the middle of the doorway, open = into the room.
      const closed = Math.atan2(-side * ax, -side * az), open = Math.atan2(d.dx, d.dz);
      pivot.rotation.y = d.open ? open : closed;
      return { pivot, closed, open };
    });
    // Fill the wall above the doors.
    g.add(box(d.dx ? 0.15 : CELL, 0.6, d.dx ? CELL : 0.15, M.locker, 0, 2.7, 0));
    group.add(g);
    return { door: d, leaves };
  });

  // Mirrors: real reflections (only drawn when you're close; see game.js).
  const mirrors = level.mirrors.map((m) => {
    const g = new THREE.Group();
    const glass = new Reflector(new THREE.PlaneGeometry(0.8, 1.25), { textureWidth: 384, textureHeight: 600, color: 0x9a9890, clipBias: 0.003 });
    g.add(glass);
    const frameMat = th.look === 'house' ? M.darkWood : M.metal;
    g.add(box(0.92, 0.06, 0.05, frameMat, 0, 0.66, -0.02), box(0.92, 0.06, 0.05, frameMat, 0, -0.66, -0.02),
      box(0.06, 1.3, 0.05, frameMat, 0.46, 0, -0.02), box(0.06, 1.3, 0.05, frameMat, -0.46, 0, -0.02));
    g.position.set(m.x, 1.55, m.z);
    g.rotation.y = Math.atan2(m.nx, m.nz);
    group.add(g);
    return { ...m, mesh: g, glass };
  });

  // Cassettes left by people who came before.
  const lore = level.lore.map((l) => {
    const g = new THREE.Group();
    g.add(box(0.11, 0.02, 0.07, M.black, 0, 0.01, 0));
    g.add(box(0.08, 0.021, 0.035, new THREE.MeshStandardMaterial({ color: 0xc8b88a, emissive: 0x2a2010, roughness: 0.8 }), 0, 0.011, 0));
    const x = center(l.x) + (rand() - 0.5) * 0.6, z = center(l.z) + (rand() - 0.5) * 0.6;
    g.position.set(x, 0, z);
    g.rotation.y = rand() * Math.PI * 2;
    group.add(g);
    return { x, z, mesh: g, n: l.n };
  });

  // Fuse box on the wall: four slots that light up green as fuses go in.
  const fb = level.fuseBox;
  const fbOff = CELL / 2 - 0.14;
  const fbx = center(fb.x) + fb.dx * fbOff, fbz = center(fb.z) + fb.dz * fbOff;
  const fuseBox = new THREE.Group();
  fuseBox.add(box(0.7, 0.9, 0.22, M.locker, 0, 0, 0));
  fuseBox.add(box(0.55, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: 0xc9a62a, roughness: 0.7 }), 0, 0.3, 0.115));
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const sm = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 0.9 });
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.03), sm);
    s.position.set(-0.21 + i * 0.14, -0.08, 0.12);
    fuseBox.add(s);
    slots.push(sm);
  }
  fuseBox.position.set(fbx, 1.35, fbz);
  fuseBox.rotation.y = Math.atan2(-fb.dx, -fb.dz);
  group.add(fuseBox);

  // Exit door, with a cold glow from outside behind it.
  const ex = level.exit;
  const doorMat = th.look === 'facility'
    ? new THREE.MeshStandardMaterial({ color: 0x3b4246, roughness: 0.5, metalness: 0.6 })
    : mat(tex.darkWood);
  const door = box(CELL, WALL_H, 0.16, doorMat);
  const dYaw = Math.atan2(-ex.dx, -ex.dz);
  const dx = center(ex.wx) - ex.dx * (CELL / 2 - 0.1), dz = center(ex.wz) - ex.dz * (CELL / 2 - 0.1);
  door.position.set(dx, WALL_H / 2, dz);
  door.rotation.y = dYaw;
  group.add(door);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: tex.exitSign, color: 0x991010 }));
  sign.position.set(dx - ex.dx * 0.12, WALL_H - 0.3, dz - ex.dz * 0.12);
  sign.rotation.y = dYaw;
  group.add(sign);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_H), new THREE.MeshBasicMaterial({ color: 0x9fb8cc }));
  outside.position.set(center(ex.wx) + ex.dx * (CELL / 2 - 0.02), WALL_H / 2, center(ex.wz) + ex.dz * (CELL / 2 - 0.02));
  outside.rotation.y = dYaw;
  group.add(outside);

  return { group, fixtures, fuses, batteries, tapes, keycard, doors, decoy, idoors, mirrors, lore, fuseBox: { mesh: fuseBox, slots, x: fbx, z: fbz }, door, sign, textures: tex };
}
