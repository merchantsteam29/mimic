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

**Before every push: `node tools/stamp.mjs`.** It stamps every module URL in `index.html` (import map, preloads, entry
script) with a new `?v=`. GitHub Pages lets browsers cache files for 10 minutes, and a new page with old cached scripts broke
buttons for a player. A new `js/*.js` file also needs a `<link rel="modulepreload">` (the tool warns if one is missing).

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
  hiding spot), `peek` (set up by the director: stares from 8-13 m with glowing eyes), and `flee` (after
  being looked at; then `shyT` stops it chasing from more than 5 m away). Senses: `canSee` and `hear(x, z, radius)`.
  Moves in stop-motion (pose updates about 9 times a second) except when chasing or fleeing. It breathes (`sfx.breath`).
- `director.js`: scare pacing, one event every 28-60 s, never during a chase or after power-on: `behind` (your
  clip whispered at your ear), `peek`, `blackout` (lights and flashlight die, plus a step in the dark), `rush` (fake footsteps
  sprinting at you), `distant` (your scream far away) and `knock` (on your hiding spot).
- `voice.js`: mic capture through an AudioWorklet (`recorder-worklet.js`), voice detection with an adaptive
  noise floor, utterances become `AudioBuffer` clips (max 60). `hear` (0..1) drives the mimic's hearing.
  `suppress()` stops recording while the mimic talks, so it never records itself.
- `sfx.js`: all sound is synthesized. A 0.4 trim after the compressor sets the overall loudness. `setDread` (drone that
  rises as it gets close) and `setAmbient` (ducks to near-silence when it's near) are driven from `game.updateFear`. `emitter()` is a positional source (occlusion lowpass + HRTF panner).
  `playVoice(buffer, emitter, style)` plays the mimic's voice: `lure`, `scream` or `echo` (end screen).
- `textures.js`: canvas textures, including the mimic's face.

## Decisions

- Raw clips only (no speech-to-text) for now. Clips persist across runs within a tab, but are never saved to disk.
- Ctrl is not used for crouching, because Ctrl+W closes the tab.
- Only the flashlight casts shadows. Six point lights move to the nearest working fixtures.

## Multiplayer (up to 4, peer-to-peer)

- `net.js`: PeerJS rooms. The host's PeerJS id is `mimic-v1-<CODE>`; data is a star through the host. Player
  ids: `h` (host), `p1`, `p2`... Invite links are `?join=CODE`. A dropped connection reaches the game as `quit`.
- `vc.js`: voice is a direct call between every pair (the lower peer id calls). Every incoming voice goes through
  Web Audio (with a muted <audio> element, which Chrome needs). `route(id, {on, pos, volume, occluded})` is decided by the
  listener every frame in `game.routeVoices`: the living hear the living (positional, fading out by ~30 m), the dead hear everyone.
  When someone is caught, the living cut their voice instantly, with **no death message** (the owner wants friends to think they're just lost).
- `mp.js` `Session`: room + voice + **clips**. Every clip is sent as 16 kHz Int16 to the host, which relays it, so every
  browser holds all clips. `pickKey` prefers dead players' clips (6x) when anyone is dead. Lures online use style `distant`
  and stalk from 9-16 m.
- `game.js`: the same code runs alone and online. Intents go through `send` -> `hostHandle` (host), results through
  `broadcast` -> `onNet` (everyone). Alone, this browser is the host. Client -> host: `st`, `noise`, `take`, `insert`,
  `escaped`. Host -> all: `snap` (15 Hz: mimic + players), `say` (the mimic speaks clip X), `took`, `drop` (a dead player's
  fuses), `fuses`, `power`, `caught`, `out`, `left`, `end`, plus `sting` to one player. The host runs the mimic AI
  (`mimic.update(dt, targets)`, chasing the nearest player it sees); others run `mimic.puppet`. Host simulation keeps going
  in a background tab through a Worker timer. Online, Esc opens the menu but the game doesn't pause.
- Director: local tricks (behind, blackout, rush, distant, knock) run on every player's own browser, for them alone
  (`game.localSpeak`). Peeks move the real mimic, so only the host stages them, at any living player.
- Dead or escaped players spectate a living player's view (`startSpectate` / `specTarget`, Space for the next one).
- `remote.js`: other players' avatars (with working flashlights and footsteps).
- Test with two tabs: `window.__mimic.game` / `.session`. Headless Chrome throttles background tabs, so timers run late there.
