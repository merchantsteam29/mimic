// Random map: a grid of 2m cells carved into rooms and corridors, themed as a facility, a house, a hospital, a mall or a school.
// Also holds the collision, line-of-sight and path-finding the player and the mimic use.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { makeTextures } from './textures.js';

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
};

// Footprint (w across the front, d front-to-back) of each prop, in metres. Front faces +z.
const PROP_DEFS = {
  crate: { w: 1.25, d: 1.25 }, shelf: { w: 1.8, d: 0.6 }, desk: { w: 1.6, d: 0.8 }, barrel: { w: 1.3, d: 0.75 },
  cabinet: { w: 0.9, d: 0.55 }, locker: { w: 1.0, d: 0.75 }, bed: { w: 1.4, d: 1.95 }, sofa: { w: 1.8, d: 0.85 },
  table: { w: 1.4, d: 0.9 }, generator: { w: 1.5, d: 0.95 }, bookshelf: { w: 1.6, d: 0.45 }, dresser: { w: 1.2, d: 0.55 }, wardrobe: { w: 1.25, d: 0.75 },
  gurney: { w: 0.9, d: 2.0 }, wheelchair: { w: 0.7, d: 0.8 }, ivstand: { w: 0.5, d: 0.5 }, curtain: { w: 1.9, d: 0.3 }, medcabinet: { w: 1.0, d: 0.45 },
  mannequin: { w: 0.6, d: 0.5 }, clothesrack: { w: 1.6, d: 0.6 }, counter: { w: 1.8, d: 0.8 }, bench: { w: 1.6, d: 0.6 }, planter: { w: 1.0, d: 1.0 },
  shoerack: { w: 1.6, d: 0.45 }, fittingroom: { w: 1.2, d: 1.0 },
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

  // Rooms, with at least one wall cell between any two.
  const rooms = [];
  for (let t = 0; t < th.tries; t++) {
    const w = ri(th.roomSize[0], th.roomSize[1]), h = ri(th.roomSize[0], th.roomSize[1]);
    const x = ri(1, N - w - 1), z = ri(1, N - h - 1);
    if (rooms.some((r) => x < r.x + r.w + 1 && x + w + 1 > r.x && z < r.z + r.h + 1 && z + h + 1 > r.z)) continue;
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
    tasks, gens, tapes, doors, keycard, idoors, fakeHide, decoy, mirrors, lore,
  };
}

const center = (c) => (c + 0.5) * CELL;

export class Level {
  constructor(data) {
    Object.assign(this, data);
    this.exitOpen = false;
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
  findPath(x1, z1, x2, z2) {
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
    case 'bed':
      g.add(box(1.4, 0.35, 1.95, M.darkWood, 0, 0.2, 0));
      g.add(box(1.3, 0.2, 1.8, M.sheet, 0, 0.47, 0.05));
      g.add(box(0.5, 0.12, 0.35, M.sheet, -0.3, 0.63, -0.7));
      g.add(box(1.4, 1.0, 0.08, M.darkWood, 0, 0.5, -0.95));
      break;
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
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 }),
    clothes: [0x5a2230, 0x22344a, 0x3a3a36, 0x6a5a3a, 0x2a4a3a, 0x7a6a6a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 })),
    deadLeaf: new THREE.MeshStandardMaterial({ color: 0x3a3220, roughness: 1, side: THREE.DoubleSide }),
    booth: new THREE.MeshStandardMaterial({ color: 0x4a1418, roughness: 1, side: THREE.DoubleSide }),
    books: [0x4a1c1c, 0x1c2f4a, 0x2f3a1c, 0x4a3b1c, 0x2a2a2a, 0x5a4a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
  };

  // Floor and ceiling: one plane each over the whole grid (walls hide the rest).
  tex.floor.repeat.set(N, N); tex.floorN.repeat.set(N, N);
  tex.ceilingN.repeat.set(N, N);
  tex.ceiling.repeat.set(N, N);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat(tex.floor, { normalMap: tex.floorN, roughness: th.look === 'house' ? 0.7 : 0.85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(S / 2, 0, S / 2); floor.receiveShadow = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S, S), mat(tex.ceiling, { normalMap: tex.ceilingN, color: 0x9a968e }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(S / 2, WALL_H, S / 2); ceil.receiveShadow = true;
  group.add(floor, ceil);

  // Walls: a box per wall cell that touches open space.
  const wallCells = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    if (level.get(x, z) !== WALL) continue;
    if (DIRS.some(([dx, dz]) => level.get(x + dx, z + dz) !== WALL)) wallCells.push([x, z]);
  }
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), mat(tex.wall, { normalMap: tex.wallN, color: th.look === 'house' ? 0xffffff : 0xb8b4aa }), wallCells.length);
  const m4 = new THREE.Matrix4();
  wallCells.forEach(([x, z], i) => walls.setMatrixAt(i, m4.makeTranslation(center(x), WALL_H / 2, center(z))));
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);

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
    if (th.look === 'facility') {
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
    return { ...l, x, z, y: th.look === 'facility' ? WALL_H - 0.35 : WALL_H - 0.9, mat: fm, burst: 0, seed: Math.random() * 100 };
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
