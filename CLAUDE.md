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

- `main.js`: menus, settings (localStorage `mimic.settings`; `quality` auto/low/medium/high sets the tape lines and pixel ratio,
  and `game.js` uses it for the light pool size and the flashlight's shadow map. **Auto** (the default) starts phones on medium and
  `watchPerf` steps `settings.tier` down (to `lowest`: no flashlight shadow) after ~4 s under 27 fps, or up after ~30 s over 57; mid-run
  `game.setQuality(tier)` drops lights / shadows), voice check, pointer lock / pause, run start / end,
  the Install button (`beforeinstallprompt`).
- `captions.js`: **sound captions** (Settings, off by default). `attach(sfx)` wraps the sfx one-shots (`SOUNDS`: which argument is
  the emitter, and the caption) and makes emitters remember `setPos`; the direction (ahead / behind you / left / right, far off)
  comes from the camera. `update()` (main's rAF loop) adds its breathing up close and friends talking. `#captions`.
- `tutorial.js`: the **first-time tutorial** (offered once on the first Play alone, localStorage `mimic.tutorial`; also in How to
  play; `?autostart&tutorial`). A fixed small facility (`TUTORIAL`), steps with a coach line (`#coach`): move, flashlight, a battery
  moved near the start, Tab, say something (then your clip plays back from behind a wall), hide (a staged walk-up: `holds` = the
  tutorial drives the mimic puppet; `quiet` = no director / events / scares), then a bottle and a tape recorder are moved next to you
  (`place`) for a throw and a recording, then `release()` wakes the AI and tips show the first time things happen. Steps are merged
  (move + flashlight, battery + Tab) and every gated step times out, so nobody gets stuck; `live` steps refresh their text each second.
- `recap.js`: the **end-of-round recap**. The host samples everyone's and the mimic's position every 2 s, plus catches / escapes
  (`event`) and whose clips it used (`voice`); `end` carries `recap` (alone, `end()` passes it). `drawRecap` replays it on a map of
  the level on the end screen (`#recap`).
- **Rejoining after a drop** (online): the host keeps a dropped player's place for 45 s during a game (`net.away`; `welcome` gives
  each player a `secret`). The client's `Session.dropped` retries for ~30 s (`#rejoining` overlay) with `join(code, name, {id, secret})`;
  the host (`net.onRejoin`) sends the `start` again, then everything in `game.log` (the host logs every broadcast in `LOGGED`: items,
  fuses, doors, power, catches...), then `resume` (where they were, their status). Catching up never plays a jumpscare.
- **Lobby tabs** (`#lobbyTabs`, `.ltab`): Players (list, class) / Mode (mode, difficulty) / Creatures / Settings (game settings).
- **Loading**: the title's buttons wait for `body.ready` (set at the end of main.js) behind `#loading`. `sw.js` caches, cache-first,
  only the pinned CDN libraries and `textures/` / `sounds/` files (**bump `KEEP` in sw.js if you replace one of those files**).
- Voice clips (`voice.js`): 0.4 s pre-roll, 0.75 s hangover with a softer threshold once talking (fewer cut-off words), a ~90 Hz
  high-pass, and levelled by the speech's RMS (not its peak).
- `title.js`: the title screen as found footage: camcorder text, scanlines and grain, whispered lines surfacing at the edges, eyes
  that vanish when the cursor nears, a tagline that slips, and after 25 s idle it plays one of your clips (once per visit).
- Sharing and installing: Open Graph / Twitter tags in `index.html` point at `og.png` (1200x630) on GitHub Pages;
  `manifest.webmanifest` + `icons/` + `sw.js` (a pass-through service worker that caches nothing, only there for installing).
- `game.js`: one run: the constructor, lifecycle and main loop. The rest of `Game` is split into parts mixed into
  `Game.prototype` (`Object.assign` at the bottom of game.js): `game-net.js` (send / broadcast / hostHandle / onNet, catches, the end
  check), `game-player.js` (movement, camera, flashlight, interaction, hiding, power, HUD), `game-world.js` (its voice, fear, ambience,
  lights, doors, hunger, wearing the dead), `game-death.js` (jumpscares, spectating, `revive`, end / finish), `game-room.js` (the
  waiting room). Shared constants and helpers (`EYE`, `clamp`, `LOGGED`, `CUSTOM`, `ROOM`...) are in `game-shared.js`. Methods in
  the parts are object-literal methods (commas between them), and use `this` exactly as before.
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
- `story.js`: solo story **Ellie** (8 `CHAPTERS`; 6-7 in the hospital, 8 back at Kestrel: fixed seed and theme, `gen` level options (`size`, forced `tasks`, `broken`),
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
  `#signal` (SIGNAL LOST). The renderer's pixel ratio is 1. The HUD is hidden except while Tab has it open (a toggle: `tabDown`), briefly after changes
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
  `rumble()` on catches and heartbeats. Only pads with `mapping === 'standard'` are used (wheels / flight sticks / pedals have resting axes that
  spun the camera and scrolled menus); an axis counts once seen centred, and only a change (new press, stick pushed) switches to
  pad mode. Settings > Controllers: Off (`settings.pads`, `controls.pads`) ignores every gamepad.
- `binds.js`: **rebinding** (Settings > Controls, `#binds`; localStorage `mimic.binds`). The game always listens for its default
  codes (`GAME_CODE`); `controls.js` translates a rebound key into that code in a capture-phase listener (and swallows a default
  key that was moved away), and `gamePad` reads controller buttons from `binds.pad`. `keyLabel` names keys from the bindings.
  Touch buttons can be dragged in a layout editor (`editTouchLayout`); positions are `binds.touch` (screen fractions).
- `chat.js`: **quick chat** (online), 8 set phrases. T / R3 / Say opens it. Intent `chat` -> broadcast `said`. Same rules as voices:
  the living see the living within 30 m, only the dead see the dead. The Hunt-mode mimic can't use it. `#chat`, `#chatFeed`.
- `haunt.js`: **haunting**: a dead spectator (not an escaped one) can, every 30 s, flicker the light nearest the player they
  watch (F), knock nearby (G) or whisper behind them (C). Intent `haunt` -> broadcast `haunted`; positional, so only people
  nearby hear it. The hint and feedback live in the spectator line (`game.specId` is who you're watching).
- `skinwalker.js`: online, **Normal mode only**, a host lobby toggle (`session.setSkinwalker`, `start` carries `sw`). A second
  creature that wears a **living** player (`wearId`): a copy of their avatar with their flashlight and their own clips (`swSay`). It
  spawns out of sight of everyone, finds a victim far (14 m+) from the real player, and stands at the edge of the light calling
  (`lure`). Tells: it crawls when nobody is looking at it, its eyes shine in your flashlight, its head tilts up close, and the real
  friend's voice comes from elsewhere. Getting within 3.2 m, or lighting it up for 2.6 s, triggers `swReveal` -> `chase` (pale, long
  limbs, upside-down head, split mouth). A catch is `hostCatch(id, 'sw')` -> `caught` with `sw` (the jumpscare uses `sw.poseAt`). It
  leaves if the real friend could see it, and stops after power-on. Host state goes in `snap.sw`.
- `clip.js`: **save the jumpscare**. `ScareClip` records a 640x360 canvas (the game frame plus a REC stamp and the site address) with
  the whole mix (`sfx.tap`, a MediaStreamDestination after the master trim) through MediaRecorder. It starts when it chases you
  (`updateFear`; restarted after 14 s, thrown away 5 s after a chase ends) or on the catch, and is kept at SIGNAL LOST + 1 s. The end
  screen's "Save the jumpscare" (`offerClip`) shares it (touch) or downloads it.
- **Feedback** (beta): "Report a bug / idea" (title) and "Report a bug" (pause) open the Google Form (`FEEDBACK_FORM` in main.js:
  https://forms.gle/CG3PAo4xpdrp7y6u6) in a new tab, after copying the version, device, settings and what you were doing to the clipboard.
- `guide.js`: the **field guide** (title > Field guide, `#guide`): case files on the creatures, hiding spots, items and events
  (`SECTIONS`; keep it up to date when you add one). Also **What's new** (`newTape`): a "recovered tape" shown once per `RELEASE` to
  players who have played before (localStorage `mimic.release`). **Bump `RELEASE` and rewrite `NOTES` for each notable update.**
- `codes.js`: **building codes** (`H-4F2K9A`: the theme's letter + the seed in base 36). Shown on the end screen and the pause menu;
  enter one on the class screen (alone) or in the lobby's Settings tab (host) to play that exact building.
- `stats.js`: **Your stats** (title screen; localStorage `mimic.stats`, this device only, nothing to unlock). `recordRun` from `endRun`.
- **Fewer flashes** (setting `calm`, body class `calm`): no lightning, lights dip instead of strobing, no random tears, distortion
  capped, a soft hit flash.
- Jumpscares (`game.caught`): above / behind / drag / front, plus the mimic's slow ones: `dark` (your light and the picture go out,
  then stutter back with it in your face) and `stare` (it stands 2 m off, head tipping over, whispering, then lunges). `lunge` delays
  the strike (flash, screech, scream). The listener's head is two hinged halves (`halves`) lined with teeth that part when it rushes.
- `stalker.js`: the **stalker**: online, **Normal mode only**, a host lobby toggle (`session.setStalker`, `start` carries `sk`). A pale
  cracked figure that only moves while no living player can see it (`seenBy`: in their view cone, line of sight, and lit: within 6 m,
  in their beam, or under a working light). Unseen it runs (5.6 m/s) at the nearest player not hiding, and changes pose each time it moves
  (`POSES`); clients never move or re-pose it while they're looking. Stays ~70 s, then gone for 60-110 s. `hostCatch(id, 'sk')`, `snap.sk`.
- `recorder.js`: **your own tape recorder**: two per level at seeded spots (item type `recorder`, taken through `take`). X records (your
  next clip within 8 s, else your last one), X again puts it down: intent `recDrop` -> `recSet`; it plays 3 times (4 / 11 / 18 s) as
  `playVoice(..., 'recorder')`, and each play the host calls `mimic.hear` / `ls.hear` at 24 m. Then it can be picked up again. Online the
  clip goes by its key (`clip.key`, set in `Session.shareClip`).
- **Difficulty** (`DIFFICULTY` in mimic.js: Easy / Normal / Nightmare): its speed, sight range, how often it talks, battery life, grace
  time and hunger interval. Alone it's `settings.diff` (class screen); online the host sets it in the lobby (`setDifficulty`, `start.diff`).
- **School** theme (`school`, look `facility`): classroom desks, chalkboards with lines written on them (`tex.chalk`), cubbies, trophy
  cases, lockers to hide in; a ticking clock; the PA (`scares.updatePA`: `sfx.chime`, then your voice, far off).
- **Game settings** (online lobby, "Game settings"; `session.custom`, checked by `cleanCustom` in mp.js, sent in `mode` / `start.cs`):
  lights (more / fewer: level `broken`), jobs (fewer = fuses only, more = all three: level `tasks`), batteries and its speed (multiply
  the difficulty), random events on / off. `CUSTOM` and `customLevel` in game.js.
- `signals.js`: **hand signals** (online). Z (pad D-pad left, touch Signal) opens Wave / Point / Stop / Come here; intent `sig` ->
  `sign`; `poseSign` moves the remote player's free arm for 2.6 s. Silent.
- `revive.js`: **bringing a friend back** (online, once per game). A catch drops the victim's tape (`lifeTape`, item `lifetape`).
  Carry it (one at a time; it drops again if the carrier is taken) to the power panel: intent `revive` -> `revived` puts them back in
  the game at the panel (`game.revive`), or carry it out of the exit and they get out too. Not after power-on at the panel.
- **Hiding spots** (`prop.kind`, `HIDE_KIND` in level.js): `box` (lockers, wardrobes, fitting rooms: the heartbeat game), `bed` (under
  any bed: half the time it doesn't look; eye 0.17), `vent` (facility-built maps: 3 grates per map added from the seed in the Level
  constructor after the layout, so maps don't change; it can't follow you in, `huntHide` turns into an investigate; getting in or out
  is a noise of 12), `curtain` (hospital screens: `checkCurtains` (host) sees your feet within 3 m, and a hunt there is an instant catch).
  `#locker[data-kind]` draws each view. `mimic.toDoor` adds the last step to a hiding spot's door (it's inside the furniture's own grid
  cell, which `findPath` won't enter; before this the heartbeat game never started).
- `throwables.js`: bottles, cans and a disposable camera, 4 per map at seeded spots (item `throwable`). Carry one; H / click / RT
  (when holding) uses it. Bottles and cans: intent `throw` -> `thrown` (flies, smashes / clatters; host `hear` at 22). Camera (3 shots):
  `camFlash` -> `camFlashed`; the host stuns the mimic (or the hunter) if it's in front within 8 m and in sight.
- **Hotel** theme (`hotel`, look `house`): small rooms off long halls, beds (hide under), armchairs, old TVs, luggage carts; damask
  walls and the hex carpet; a lift hum; a phone that rings in a nearby room (`scares.updatePhone`), and sometimes you answer.
- `versus.js`: **Versus** (online lobby mode, 2+ players). `start` carries `teams` (id -> 0 red / 1 blue, shuffled). Everything is
  shared; `powered(by)` records which team pulled the lever. `result()` (in `end.versus`): the lever team wins if any of them got out,
  else the team with more out, else it wins. Walkie-talkies reach your own team only (`vs.same`). Remote players get a team armband.
- Haunting also has V: **a mark** (a red handprint on the floor where the watched player is looking, 25 s; `aim()`, `haunted` k `mark`),
  and the dead see **where it is** (`haunt.marker`, a red sprite over the mimic, through walls).
- **Quick Play** (Play with friends > Quick Play): no server, so public rooms use fixed codes (`QUICK_CODES` in net.js, `QQ?2`;
  `newCode` never makes a QQ code). `probe(codes)` tries them all from one throwaway peer: the ones that connect are open rooms (join
  them in turn; full or started ones refuse), and if none take you, you host a free one (`session.public`, shown in the lobby).
- **Drifting** (the dead): R in spectate toggles `game.freeCam` ({x, z, y, yaw, pitch}; `updateFreeCam`, walls still stop you; Space / E
  goes back to watching). Haunting then reaches the living player nearest the camera (`nearestLiving`), and a mark goes where you look.
- `shadow.js`: the **shadow**: online, **Normal mode only**, a host lobby toggle (`session.setShadow`, `start` carries `sd`). A shape of
  darkness with two pale eyes; it lives where the lights are dead (`lit()`: `isLit` and no power cut) and won't step into a working light.
  It goes for the nearest living player standing in the dark (hiding doesn't help). A flashlight beam on it (`inBeam`) shoves it back and
  after 1.8 s burns it away (`shadowBurnt`, `sfx.hiss`). Gone for good after power-on. `hostCatch(id, 'sd')`, `snap.sd`.
- **Two solo stories** (`STORIES` in story.js: `{ id, title, key, chapters, voice, blurb, lost }`): Ellie (`CHAPTERS`, 8) and **The Operator**
  (`OPERATOR`, 5: a 911 dispatcher; hospital, facility, school, hotel, mall). The story screen has a tab per story; progress is per
  story (`storyProgress(book)` / `finishChapter(i, book)`, localStorage `book.key`). A story's lures use `book.voice` (`ellie`, or
  `phone`: your voice down a telephone line).
- `voices.js`: **recorded voices for the tapes** (story tapes and the victims' tapes). One file per **line** in `voices/<book>/`, named by
  the tape id and line number (`ellie/3-2-1`, `operator/1-1-2`, `lore/4-1`), or one file for a whole tape (`ellie/3-2`); mp3 / m4a / ogg /
  opus / webm / wav. Tape lines are strings, or `{ by, text }` when a tape has more than one voice (subtitles say who); a leading
  `(how)` is the actor's direction. Every line must be something someone says (no narration). `tools/stamp.mjs` writes `voices/index.json` from
  what's there; `scares.js` preloads this level's tapes and, when one has a recording, plays it (`playVoice(..., 'tape')` + `sfx.tapeHiss`)
  with the subtitles timed by line length; otherwise the old murmur. `node tools/script.mjs` regenerates `voices/SCRIPT.md` (every line
  to record, from story.js and lore.js; run it after changing either).
- **Recording page** (`record/`, https://merchantsteam29.github.io/mimic/record/, not linked from the game): friends pick a part and record
  each line in the browser (MediaRecorder); takes are trimmed, levelled and saved as 24 kHz mono WAV in IndexedDB, then downloaded as a
  zip laid out as `voices/<book>/<id>.wav` (unzip it into the repo, run `tools/stamp.mjs`). `record/lines.js` (parts and lines from
  story.js / lore.js) is shared with `tools/script.mjs`.
- `title3d.js`: the **title screen's 3D shot**: a fixed hospital level (seed 4407), the camera creeping down its longest corridor
  through the camcorder look, lights stuttering, and every 18-32 s the mimic crossing the far end. `show()` starts it whenever there's
  no game and stops it when there is (the game owns the renderer loop).
- `look.js`: **your look** (lobby, Players tab; `settings.look` = { coat, hat, light }, all free). Shared like the class (`Session.setLook`,
  roster `look`, checked by `cleanLook`); `RemotePlayer` takes it (`setLook`: coat colour, beanie / cap / hood / none, torch colour), the
  skinwalker copies it, and your own flashlight uses your light colour.
- **Recent rooms** (Play with friends; localStorage `mimic.recent`, last 5, this device): host one again with the same code (`hostRoom(code)`,
  so old invite links work) or join it. Quick Play rooms aren't listed.
- `radio.js`: **walkie-talkies** (online). Hold B (pad D-pad down, touch Radio): intent `radio` {on} -> broadcast `radioOn`; listeners route
  that voice through `vc.route(id, { radio: true })` (a band-limited, distorted chain in `vc.js`) at full volume, anywhere. While anyone
  transmits, the host makes noise at every OTHER living player's position (the mimic / listener can hear the radios). Max 12 s a press.
  It fakes calls too: `radioFake` {key, as} plays a clip (prefers the dead) as `playVoice(..., 'radio')` with that owner's name on
  the display (`#radio`). Not in Hunt, not after power-on.
- **Waiting room** (`game.room`, `ROOM` in game.js): as soon as you host or join, `openRoom()` (main.js) builds a small house with
  no mimic, jobs or scares (`setupRoom` / `simulateRoom`), under the lobby menu (`menuOpen`). "Walk around while you wait" walks in;
  Esc / pause shows the lobby again. Voices are positional but never quieter than 35%. `renderLobby` calls `syncRoster` for joins and
  leaves. Start disposes it; Back to lobby rebuilds it.
- `listener.js`: the **blind listener**: online, **Normal mode only**, a host lobby toggle (`session.setListener`, `start` carries `ls`).
  Eyeless, tall, clicks as it moves (`sfx.clicks`). The host calls `ls.hear(x, z, r, kind, from)` wherever the mimic hears something
  (steps, voice chat via `noise`, doors, the mimic's own lures, alarms); it hears 1.35x further. States: roam / listen / rush / search.
  It takes anyone it walks into (`hostCatch(id, 'ls')` -> `caught` with `ls`), and someone hiding only if it came for a sound they made
  in there. Snapshots in `snap.ls`; `poseAt` for the jumpscare. Adds to fear / dread (`nearness`).
- `incidents.js`: **random events** (not in the story or the tutorial). Every ~2.5-4.5 min before power-on the host broadcasts
  `incident`: `cut` (all lights out ~22 s), `storm` (rain + thunder ~70 s; footstep noise x0.55; lightning flashes `game.hemi` except
  underground), `alarm` (a siren far from everyone; the mimic and listener go to it), `lock` (4 doors near players shut, `jamUntil` 40 s).
- **Mall** theme (`mall`, look `facility`): shops, fitting-room hiding spots (`fittingroom`), mannequins that turn toward you when
  unseen (`scares.updateMannequins`, `userData.mannequin`), textures `mallWall` / `mallFloor`, ambience: far-off muzak + escalator hum.
- `hunter.js`: online **Hunt** mode (lobby Mode; `start` carries `hunter`, picked at random). That player is the mimic in first
  person: status `hunter` (never `alive`, so survivors can't hear their voice), a red see-in-the-dark view (a hemisphere light only
  in their browser + a CSS filter), red rings through walls where survivors made noise (`heard`, from `game.noise` / host `noise`),
  a 20 s head start. Intents (in `HOST_TYPES`): `mst` (position, 15 Hz; the host drives the mimic puppet with `driveMimic` instead
  of the AI), `bite` (nearest survivor in reach, or rip open a hiding spot: whoever's inside is caught), `msay` (a clip of player N,
  played from the mimic), `mlight` (kills the nearest light for good: `L.dead`). Flares / rescues stun the hunter (`mStun`). The
  director's peek and the mirror trick don't move the real mimic in Hunt. If the hunter leaves, the AI takes over. `end` carries
  `hunter`; the mimic wins if fewer than half got out.
- `heartbeat.js`: the hiding-spot minigame. When the mimic hunts you to a locker, it stops at the door (`sniff` state), and
  the hidden player gets `sniff`: press Space on 10–13 beats. Miss 3, or make a sound on the mic, and `sniffRes` false means
  caught. Success means it flees. If the mimic leaves without a verdict (a teammate's flare), the host sends `sniffEnd`.

- **Mix** (measured 2026-10-26, loudest 100 ms RMS out of the final mix, 3 m away): its lures ~ -19 dB, its scream ~ -8, radio voice
  ~ -14, warnings you must hear (listener clicks, stalker scrape, phone, PA chime) -31 to -38, your own steps ~ -36, ambience ~ -36.
  New sounds should land near those for their kind. A re-run script plays every sound alone and measures the tap (`sfx.tap`).
- **Church** theme (`church`, look `house`): pews, altars, candelabras, lecterns, statues (`userData.mannequin`, so they turn like the
  mall's mannequins), confessionals to hide in (`box` kind); `churchWall` / `churchFloor`; ambience: a held organ chord; the bell
  (`sfx.bell(n)`, `scares.updateBell`: every 2-3 min, once per player taken). Building code letter `C`.
- **Asylum** theme (`asylum`, look `facility`): iron cots (`bunk`, hide kind `bed`), restraint chairs, hydrotherapy tubs, padded
  isolation cells to hide in (`isolation`, `box` kind, `tex.padded`, null on other themes: dispose skips nulls); `asylumWall`
  (tiles + tally marks) / `asylumFloor`; ambience: mains hum + a drip; `scares.updateCellDoor` (bangs on a shut door nearby, then
  sometimes your voice from behind it). Building code letter `A`.
- `double.js`: **the Double**: online, **Normal mode only**, a host lobby toggle (`session.setDouble`, `start` carries `db`). The host
  records every living player's trail (4 Hz, last 150 s); every 60-110 s (first after ~2 min) it replays 50 s of one player's route
  from a spot nobody can see, in their body (`RemotePlayer` with their look and flashlight) and now and then their clips (`dbSay`). It
  ignores everything (walks through shut doors) until someone is within 2.5 m, holds a beam on it for 1.2 s, or the player it copies
  sees it: `turn` (`dbTurn`, its head comes round) then `chase` at 5.2 m/s for 7 s. `hostCatch(id, 'db')`, `snap.db`.
- `hideseek.js`: **Hide and seek** (online lobby Mode `hide`; Game option `hideSeek`). No jobs (`hideLevel`), panel and exit refuse, no
  director / hand-placed events / incidents, no revive tapes. Phase `hide` (60 s: the host keeps `mimic.frozen`), then the host
  broadcasts `hsPhase` (logged for rejoins): it's released (`graceT` 0), and every 18-26 s the host `huntHide`s a random hidden player
  (not in a vent). `seek` lasts 240 s, then everyone alive gets `out` with `dawn`. `hostCatch` records `hs.found`; `end` carries
  `hs` (winners: anyone out, else the last found) and `hsAll`.
- **Name tags** (Settings, `settings.tags`, off by default): `game.updateTags()` (online, also in the waiting room) puts `nameTag()`
  (remote.js, a sprite) over remotes and over skinwalker / double avatars (their copied friend's name); faint unless lit, hidden
  through walls, past 16 m, and on the friend you're spectating.
- `nightshift.js`: **Night Shift** (title > Night Shift = `pickClass(1)`, or lobby Mode `nights`; Game option `night`, `?autostart&night=N`).
  No jobs (`nightLevel`: no tasks, `broken` rises), the panel and exit refuse until 6 a.m. Six hours of 60 s (`ns.t`, which keeps
  counting while dead); the host broadcasts `hour` (the bell tolls it, the camcorder clock says `NIGHT n`); at 6 the host, 3.5 s later,
  ends it alone (`end(true)`) or broadcasts `out` with `dawn` for everyone alive. `nightRules(n)` multiplies the difficulty (speed, sight,
  hunger, battery, grace) up to night 8. Alone: the end screen offers the next night, or night 1 again; best in localStorage `mimic.nights`.
  Online: `session.night` (sent with `mode`, `start.night`); the host's end screen calls `setNight` (next night if anyone lasted, else 1).
- **Short screens** (phones sideways, `max-height: 500px` in style.css): the title's buttons in two columns; a smaller camcorder overlay;
  on touch the objectives sit below the pause / jobs buttons.

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
- `vc.js`: voice is a direct call between every pair (the lower peer id calls), with Opus asked for 64 kb/s and FEC
  (`betterAudio` sdpTransform). Two ways to play a friend (Settings > Voice chat sound, `settings.voiceMode`): **clear** (default: the
  call's own <audio> element, like a video call; distance only sets its volume) or **3d** (Web Audio: equalpower panner for direction,
  a lowpass through walls, into `sfx.voiceBus`, which skips the game mix's trim and has its own limiter). The walkie-talkie always uses
  Web Audio. `route(id, {on, pos, volume, occluded, radio})` is decided by the listener every frame in `game.routeVoices`: full volume
  within 8 m, fading out by 45 m (host setting Voices: everywhere keeps a 70% floor; the waiting room 50%). Friends' volume is
  `settings.voiceVol`. When someone is caught, the living cut their voice instantly, with **no death message**.
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
