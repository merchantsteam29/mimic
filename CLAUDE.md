# Mimic: notes for developers and AI agents

Browser horror game. Plain HTML + ES modules + Three.js 0.160 (import map from a CDN), no build step,
no backend, the same stack as Trigger Happy (`../Gun-game-fun`). Single-player now; **multiplayer with
proximity voice chat is next** (see "Multiplayer plan").

## Run / test

```bash
node serve.js                         # http://localhost:8080 (mic needs localhost/https)
```
Debug URL params: `?theme=facility|house`, `?seed=123`, `?autostart` (skips menus, no pointer lock,
exposes `window.__game`), `?nomic`. Headless Chrome with `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream` gives a fake mic (beeps) that exercises clip capture. SwiftShader
renders at a few FPS, and dt is capped at 0.05, so game time runs slow in headless tests.

## Modules (`js/`)

- `main.js`: menus, settings (localStorage `mimic.settings`), voice check, pointer lock / pause, run start / end.
- `game.js`: one run. Player movement, collision, stamina, flashlight battery, interactables (fuses,
  batteries, fuse box, hiding spots, exit), the light pool, fear / heartbeat, power-on, jumpscare, win.
- `level.js`: grid map generator (2 m cells, `WALL/FLOOR/PROP/EXIT`) with rooms, spanning-tree corridors
  plus loops, props that never disconnect the map, fuse / battery / exit / fuse box placement, and the lights.
  `Level` has `collide`, `los` (walls block sight, furniture doesn't), `clearWalk`, `findPath` (BFS).
  `buildLevelScene` makes the meshes. Themes live in `THEMES`.
- `mimic.js`: model and AI. States: `wander`, `investigate` (heard something), `stalk` (goes out of sight
  6–14 m from the player and plays a voice clip), `chase` (saw the player), `hunt` (goes to the player's
  hiding spot). Senses: `canSee` (range, facing, flashlight) and `hear(x, z, radius)`.
- `voice.js`: mic capture through an AudioWorklet (`recorder-worklet.js`), voice detection with an adaptive
  noise floor, utterances become `AudioBuffer` clips (max 60). `hear` (0..1) drives the mimic's hearing.
  `suppress()` stops recording while the mimic talks, so it never records itself.
- `sfx.js`: all sound is synthesized. `emitter()` is a positional source (occlusion lowpass + HRTF panner).
  `playVoice(buffer, emitter, style)` plays the mimic's voice: `lure`, `scream` or `echo` (end screen).
- `textures.js`: canvas textures, including the mimic's face.

## Decisions

- Raw clips only (no speech-to-text) for now. Clips persist across runs within a tab, but are never saved to disk.
- Ctrl is not used for crouching, because Ctrl+W closes the tab.
- Only the flashlight casts shadows. Six point lights move to the nearest working fixtures.

## Multiplayer plan

- PeerJS (WebRTC) like Trigger Happy: the host runs the mimic AI and the level seed, and clients send their state.
- Proximity voice: each player's mic `MediaStream` goes over a PeerJS media call. On the receiving side
  it plays through `sfx.emitter()` at that player's position, using the same occlusion and HRTF as the mimic.
- Clips: each client sends its own clips to the host (as compressed PCM or Opus via MediaRecorder).
  The host's mimic picks *any* player's clip and broadcasts "play clip X at position P". Every client
  plays it through an emitter, so friends hear the mimic using your voice from where the mimic is.
- Hearing: each client sends its `voice.hear` level, and the host feeds it into `mimic.hear()`.
