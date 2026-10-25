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
buttons for a player. GitHub Pages ignores `?v=` and serves the newest file, so the tool also writes `js/version.js`
and `window.MIMIC_VERSION` in the page. When they differ (an old cached page with new scripts), `main.js` reloads once with
`?fresh=`. A new `js/*.js` file also needs a `<link rel="modulepreload">` (the tool warns if one is missing).

## Modules (`js/`)

- `main.js`: menus, settings (localStorage `mimic.settings`), voice check, pointer lock / pause, run start / end.
- `game.js`: one run. Player movement, collision, stamina, flashlight battery, interactables (fuses,
  batteries, fuse box, hiding spots, exit), the light pool, fear / heartbeat, power-on, jumpscare, win.
- `level.js`: grid map generator (2 m cells, `WALL/FLOOR/PROP/EXIT`) with rooms, spanning-tree corridors
  plus loops, props that never disconnect the map, fuse / battery / exit / fuse box placement, and the lights.
  `Level` has `collide`, `los` (walls block sight, furniture doesn't), `clearWalk`, `findPath` (BFS).
  `buildLevelScene` makes the meshes. Themes live in `THEMES`: `facility`, `house`, `hospital`. Each theme has a `look`
  (`facility` or `house`) that picks lights, doors, keycard vs key and so on; branch on `th.look`, not `th.id`, unless it's truly
  theme-specific (textures in `makeTextures`, the ambience in `sfx.startAmbient`: the hospital has a ballast buzz and a heart monitor).
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
- `objectives.js`: each run's jobs, picked from the seed in `level.js` (`level.tasks`): 2–3 of fuses (4, into the panel),
  generators (2: hold E, with skill checks on Space; a miss bangs and the mimic hears it from 24 m) and tapes (3: smashing one
  erases an equal share of the remaining clips), plus a keycard (key in the house) for the locked exit room about half the time.
  When everything is done, the panel's lever (`lever`) restores power. The host owns the progress (`work`, `bang`, `smash`,
  `unlock`, `lever` -> `gen`, `smashed`, `unlocked`, `power`).
- `scares.js`: personal scares (each player alone): it **talks back** after you speak, the **body** (lying, then standing in a
  corner facing the wall, then gone), **mirror** ghosts (Reflector mirrors, only drawn within 9 m; sometimes the host puts the real
  mimic there), the **fake locker** (`props[fakeHide].fake`: it breathes, mash E to escape, or `trapped` -> caught; `fakeDone` ->
  `fakeGone` for everyone), decoys twitching, and **victims' tapes** (`lore.js`, subtitles over `sfx.tapeVoice`).
- Shared scares (`game.js`): **real doors** (`level.idoors`: E toggles via `door` -> `doorSet`; the mimic stops, turns the handle
  (`creak`) and opens them, fast when chasing); the **decoy** pickup (`take` -> `fakeItem`: it bites and runs); **hunger** (every
  150 s: bolder, chattier, and 2 lights die for good, in a seeded order); online it **wears a dead player** (`mimic.wearId`: their
  avatar walks in its place and talks with their clips; chasing rips it off); the **chorus** (`say` with `keys`); **varied jumpscares**
  (`game.scare`: above / behind / drag / front).
- Mimic: crawls on the **ceiling** (`ceiling`, drops when it chases) and has a **second form** (`enrage` -> `transform` -> `setForm(2)`: an
  extra pair of arms, a split mouth, red eyes, faster). Snapshots carry ceiling / form / wearId / hunger.
- **Syntax check with `node tools/check.mjs`.** Plain `node --check` silently skips ES-module files.
- `story.js`: solo story **Ellie** (5 `CHAPTERS`: fixed seed and theme, `gen` level options (`size`, forced `tasks`, `broken`),
  `tapes` that must all be heard (shown as `lore` items, `objectives.storyNeed`), `intro` / `ending` text; a line `{ playerClip }` plays
  your own voice-check clip via `game.playOwnVoice`). Progress is `localStorage mimic.story` (chapters finished), story progress only.
  `generateLevel(seed, theme, opts)` takes the `gen` options. Online story: `SIGNAL`.
- `traitor.js`: online **story mode** (`The Signal`, lobby Mode: `session.setMode`, `start` carries `mode`). Half the time the host
  picks a secret traitor (`session.traitorId`, host only; only that player gets `role`). Traitor powers: Q jams a looked-at door for 20 s
  (`jam` -> `jamDoor`; then `door` -> `jammed`), R sabotages (`sab`: generator -20%, or pulls a fuse from the panel -> `fuses` with
  `pulled` plus a `drop`). Once per game V at the panel calls a vote (`accuse` -> `vote` -> `ballot` -> `verdict`). More than half must
  agree; the traitor is exposed and taken, an innocent makes it hungrier. `end` carries `traitor` / `traitorWins` (wins if fewer
  than half of the rest got out and they weren't exposed).
- **Message names:** a client intent and the host's broadcast must never share a `t` (`mp.js` routes every `HOST_TYPES` name to
  `hostHandle`), e.g. `jam` (intent) vs `jamDoor` (result).
- `vhs.js`: the **camcorder look**. The scene renders into a 360-line half-float target, then a full-screen shader applies tone mapping
  and sRGB itself, plus grain, bleed, scanlines, tracking, bulge and dropouts. `game.distort` (0..1) drives the tearing: proximity,
  random tears when it's close, the death sequence. Overlay `#cam` (REC, timestamp from 2:13 a.m., tape counter, battery) and
  `#signal` (SIGNAL LOST). The renderer's pixel ratio is 1. The HUD is hidden except while Tab is held, briefly after changes
  (`peekHud`), and the mic only when it heard you.
- `samples.js`: **recorded CC0 sounds** in `sounds/` (credits in `sounds/CREDITS.txt`). `sfx.rec(bank, emitter, opts)` plays one,
  falling back to the synthesized sound. Banks: steps, creaks, doors, latch, click, cloth, bang, metal, glass, slam, snarl, attack, moan.
- Mimic look: grey gaunt body, `faceTexture` (sunken eyes, upper teeth) plus `jawTexture` on a hinged `jaw` (opens when talking,
  chasing, and in the jumpscare), unlit black hair, all fours when chasing.
- Photo textures: `textures/` (CC0 ambientCG, 512px, credits in `textures/CREDITS.txt`), loaded once by `textures.js` `photo()`
  (each run gets copies; `preloadPhotos()` at page load) with normal maps. The mimic's skin uses the plaster normal map.
- `events.js`: **hand-placed scares** (hello whisper at ~9 s, it crossing the end of a long hallway, a door slamming ahead,
  first-progress reactions via `events.progress(kind)`, lights going out behind you then a step, a knock on your first hide).
- `hand.js`: your gloved hand holding the flashlight (drawn on top; the beam starts at its lens; it shakes with `fear`).
- Danger: it sees 22 m (flashlight on) or 12 m (off) and is fast in the dark (3.6 m/s), but slower under working lights
  (`hooks.isLit`). Hiding makes it lose you faster. Alone, lures are disguised: `stranger` (pitched, over a bad phone line),
  `playStitch` (half of one clip plus half of another), and `ellie` in the story.
- `#ready` ("Before you go in"): tips plus a brightness check (setting `bright` scales `toneMappingExposure`), shown before the first
  intro of each session (`readyShown` in main.js). "Click to enter" / Resume / clicking the view ask for full screen; leaving it pauses.
- `classes.js` / `abilities.js`: classes (all free, no unlocks; G = ability). Brute: 2 flares (`flare`: host stuns
  the mimic for 4 s if it's within 8 m and in sight). Runner: sprints 6.2 m/s for 13 s, recovers fast, louder steps. Medic: 1 rescue
  (`rescue` on the teammate in front, or self; the host's `hostSave` turns their next catch into a stun plus `saved`). Tracker:
  a local motion tracker (90 s of battery) whose beeps make noise. The host caps uses per player.
- `controls.js`: **controllers and touch screens**. Both feed the game as synthetic `keydown`/`keyup` events (so key handlers
  just work), plus `game.stick` (analog move) and `game.look(dx, dy)`. The mode (`mouse|pad|touch`, body class `input-*`) follows the
  last device used; `keyLabel(k)` names keys for prompts, `kbd[data-k]` and `data-mouse/pad/touch` text update in the page. Pad: A use
  (and heartbeat while hidden), B crouch toggle, X light, Y ability, LT/L3 sprint, RT Space, LB/RB jam/sabotage, D-pad up accuse
  (votes on the D-pad, B = nobody), View = Tab, Start pause; in menus the D-pad moves focus. Touch (`#touch`): left thumb stick, right
  thumb drag to look, buttons, vote by tapping a name. Pad and touch play **without pointer lock** (`openPause`/`closePause` in main.js).
  `rumble()` on catches and heartbeats.
- `skinwalker.js`: online, **Normal mode only**, a host lobby toggle (`session.setSkinwalker`, `start` carries `sw`). A second
  creature that wears a **living** player (`wearId`): a copy of their avatar with their flashlight and their own clips (`swSay`). It
  spawns out of sight of everyone, finds a victim far (14 m+) from the real player, and stands at the edge of the light calling
  (`lure`). Tells: it crawls when nobody is looking at it, its eyes shine in your flashlight, its head tilts up close, and the real
  friend's voice comes from elsewhere. Getting within 3.2 m, or lighting it up for 2.6 s, triggers `swReveal` -> `chase` (pale, long
  limbs, upside-down head, split mouth). A catch is `hostCatch(id, 'sw')` -> `caught` with `sw` (the jumpscare uses `sw.poseAt`). It
  leaves if the real friend could see it, and stops after power-on. Host state goes in `snap.sw`.
- `heartbeat.js`: the hiding-spot minigame. When the mimic hunts you to a locker, it stops at the door (`sniff` state), and
  the hidden player gets `sniff`: press Space on 10–13 beats. Miss 3, or make a sound on the mic, and `sniffRes` false means
  caught. Success means it flees. If the mimic leaves without a verdict (a teammate's flare), the host sends `sniffEnd`.

## Decisions

- Raw clips only (no speech-to-text) for now. Clips persist across runs within a tab, but are never saved to disk.
- Ctrl is not used for crouching, because Ctrl+W closes the tab.
- **Never add tokens, currency, shops or unlock grinds** (the owner's rule: it must not become "a roblox horror game").
- Level generation must be deterministic from the seed (every player builds the level locally). Use the seeded `shuffle`
  in `tryGenerate`, never `sort(() => rand() - 0.5)`. That gave different layouts from the same seed once the engine optimized it.
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
