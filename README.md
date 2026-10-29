# Mimic

A first-person browser horror game. Something is in the dark with you, and it has no voice of its own,
so it records yours. Everything you say through your microphone becomes a clip it can play back from
around the next corner.

## Play

Best in a dark room, with headphones and the volume up. The game asks you to set the brightness once,
and plays in full screen (Esc pauses).


```bash
node serve.js        # then open http://localhost:8080 in Chrome
```

The microphone only works on `localhost` or `https`, not on `file://`. Use headphones.

## Story

**Ellie** (solo, 8 chapters): your sister went into the Holloway house to film it and never came out. Find her tapes.

**The Operator** (solo, 5 chapters): you're a 911 dispatcher. The calls come from places that have been closed for years, in a voice you know.

**The Babysitter** (solo, 5 chapters): a Saturday night job in a big house. The parents keep calling to say they're on their way home. The kids say they never left.
Chapters unlock as you finish them (saved on your device).

**The Signal** (online, pick Story in the lobby): half the time, one of you is secretly working for it. They can jam
doors and sabotage the jobs. Once per game you can call a vote at the power panel. Guess right, and it takes them.
Guess wrong, and it gets hungrier.

## How it works

- **Your voice is its weapon.** Each time you talk, the game cuts the speech into a clip. The mimic
  sneaks somewhere near you, out of sight, and plays one back (sometimes with a skip on the first
  syllable, the way a bad recording does). The more you talk, the more it has to use.
- **It can hear you.** Talking or shouting, sprinting and walking all make noise. The mic bar in the
  bottom-left turns red when it heard you. Crouch (`C`) to move quietly.
- **Goal:** every run has 2–3 jobs before the power can come back: find **fuses** for the panel, repair
  **generators** (hold E, and hit the skill checks or they bang), smash its **tape recorders** (each one erases some
  of the voices it stole), and sometimes find the **keycard** to a locked room. Then pull the power lever and get
  out. Restoring power sets off the alarm, and the mimic comes straight for you.
- **Classes** (all free, pick one before each game, `G` to use): **Brute** (2 flares that blind and stun it),
  **Runner** (faster, longer sprint), **Medic** (one rescue: whoever gets it tears free from their next catch),
  **Tracker** (a motion tracker that beeps faster as it gets closer, loudly), **Sound guy** (a speaker: put it down, then play its own
  noises through it from anywhere to pull it off a friend), **Priest** (a crucifix that makes it back off, 3 times; shaky hands, a slower
  walk), **Scout** (marks what they look at for everyone for 20 s; quiet steps, a small battery) and **Mechanic** (fast generator repairs,
  wedges doors shut for 25 s; clanking tools).
- **Hiding:** lockers (facility) and wardrobes (house). It can't see you inside, but if it saw you
  get in, or hears you talk in there, it comes to the door and listens. Keep your heart steady (`Space` on each
  beat) and don't make a sound, or it rips the door open.
- **It plays with you:** you may hear your own voice whispered right behind you, footsteps sprinting
  toward you that stop dead, or the lights dying around you. Sometimes it just stands at the end of a
  hallway and stares. Listen for its breathing, and for the quiet when everything else stops.
- **Play with friends (up to 4):** host a room and share the 4-letter code or invite link. Voice chat is
  proximity-based: you only hear friends near you, muffled through walls. When the mimic takes someone, their voice
  just stops. Nobody is told. The mimic prefers the voices of the people it took, so the friend calling you from the next
  room might not be your friend anymore. Dead players watch through the eyes of the living and can only talk to each other.
- **It plays tricks:** it answers when you talk, with your own words. It crawls on the ceiling. One locker is it. Some
  pickups are it. A body on the floor isn't where you left it. Mirrors show it standing behind you (usually it isn't).
  It opens doors, slowly. It gets hungrier over time, and lights die for good. When the power comes back, it changes.
  Online, it can walk around as a friend it took. Old tapes from people who came before tell you what happened to them.
- **Random maps:** each run is a research facility, an old house, an abandoned hospital, a closed-down mall, a school at night, an old hotel, an abandoned church, a closed asylum, the woods, a subway station, an abandoned fairground or an old mine, with a new layout every time.
- **Hunt** (online mode): one of you, picked at random, IS the mimic. You see in the dark, you see their flashlights, you
  see where they made noise through the walls, and you can call to them in any of their voices. Bite them, rip open their
  hiding spots, kill the lights. Everyone else plays the normal game against you. The mimic wins if fewer than half get out.
- **Skinwalker** (online, Normal mode, the host switches it on in the lobby): something else is in there too, and it wears
  one of you who is still alive. Same body, same flashlight, same voice. If your friend is waiting for you at the end of a
  hallway, check where their voice is coming from. And don't stare at it too long.
- **The Listener** (online, Normal mode, a lobby switch): something blind is in there too. It clicks as it walks.
  It hears your footsteps, doors, and you talking on voice chat. Stand still, crouch, and keep quiet, and it can walk right past you.
- **Things go wrong:** partway through a run the power can cut out, a storm can roll in (the rain covers your footsteps),
  an alarm can go off somewhere, or the building can go into lockdown and seal doors around you.
- **Walkie-talkies** (online): hold `B` to talk to everyone, wherever they are. But every other radio crackles out loud
  while you talk, and it can hear that. It has a radio too. If a friend calls you over the radio, check they're still alive.
- **Waiting room:** while you wait for the host, walk around a small house together and talk.
- **Save the jumpscare:** when it gets you, the end screen lets you save (or share, on a phone) a clip of the moment.
- **Share the voice that fooled you:** the end screen can turn it into a short camcorder-style video (the voice, whose it was,
  "It wasn't them.", and the building code) to save or send. It's made in your browser; there are no accounts and nothing is uploaded.
- **Your stats** (title screen) and a **Fewer flashes** setting for players sensitive to flashing light.
- **Your own tape recorder:** pick one up, press `X` and say something, then put it down. It plays your voice a few times, loudly,
  and it goes to see who's there. Use its trick against it.
- **Difficulty:** Easy, Normal or Nightmare (alone on the class screen; the host picks it online).
- **The Stalker** (online, Normal mode, a lobby switch): it only moves when nobody can see it. Keep it in your light.
- **Bring them back** (online, once per game): when a friend is taken, their tape is left where it happened. Play it at
  the power panel and they come back, or carry it out and they get out with you.
- **Hand signals** (online): `Z` to wave, point, hold up a hand or beckon. Silent: only people who can see you get it.
- **Game settings** (online, the host): lights, how many jobs, batteries, how fast it is, random events on or off.
- **More places to hide:** under beds (it may not look), in vents (it can't follow, but they're loud), behind curtains
  (quick, but your feet show).
- **Things to throw:** bottles and cans to make it look somewhere else, and a disposable camera whose flash blinds it.
- **Versus** (online mode): red team against blue. Race to pull the lever first, then get out. It hunts both of you.
- **The dead help:** while watching, they can see where it is, and leave a red handprint where you're looking.
- **Field guide** (title screen): case files on every creature, hiding spot, item and event: what it does, its tells, how to survive it.
- **Building codes:** the end screen and the pause menu show a code like `H-4F2K9A`. Enter it (class screen, or the lobby's Settings tab)
  to play that exact building again, or send it to a friend.
- **Quick Play:** no friends online? It lists the public rooms open right now, whose they are, how full, whether they're playing or
  waiting, the mode and the map. Join one, or open your own for strangers to find.
- **Dead, but not done:** press R to drift around the building on your own instead of watching through a friend's eyes.
- **The Shadow** (online, Normal mode, a lobby switch): it lives where the lights are dead. Stay in the light, and keep your flashlight on it.
- **New here?** The first time you play alone, a short tutorial walks you through it (it's also under How to play).
- **What happened:** after every round, the end screen replays it on a map: everyone's route, its route, where people
  were taken, and whose voice it used most.
- **The woods:** outdoors for once. You start in a log cabin; outside, clearings and paths through trees too thick to walk
  through, lanterns on posts, a little moonlight, branches snapping somewhere out in the dark. Hide in the outhouses.
- **The Caller** (online, Normal mode, a lobby switch): an old phone appears near one of you and rings. Leave it and it rings
  loudly, and the mimic comes to see. Answer it and you hear someone it took, and for a moment you know where the next thing you
  need is. But it heard you pick up.
- **The subway:** platforms either side of a track straight across the station, ticket halls and staff rooms off them, ticket
  booths to hide in. The trains still run: a rumble, the horn, its lights in the tunnel, and anyone on the track is gone. Nothing
  can hear you while one goes by, and one will knock the mimic flat.
- **The fairground:** outdoors, lots between the striped canvas of the stalls, a ticket office to start in, photo booths to hide in.
  The Ferris wheel turns over everything, the ghost train still goes round (and the mimic goes to see), there's a hall of mirrors,
  and when the music comes back on it covers your footsteps.
- **The ship:** a liner in a storm. It rolls, big waves throw you sideways, the lower decks are flooded (slow, splashing), and in the
  engine room the noise hides your steps completely. Cabins with wardrobes and bunks to hide in.
- **The snow station:** huts joined by tunnels, and open yards in a blizzard between them. Out there you get colder: slower, frost at
  the edges, and past halfway your teeth chatter loud enough for it to hear. Inside you warm up. The radio set picks up voices. Yours.
- **Endless descent** (title screen, or a lobby Mode): floor after floor, each a new building and each worse than the last (faster,
  sharper-eyed, darker). The first floor is fuses only. Your deepest floor is kept on this device; nothing to unlock.
- **The swarm** (always in the mine and the subway; online, Normal mode, a lobby switch, anywhere): when it's near, rats run the
  corridor past you, squealing, and it hears exactly where you are.
- **The mine:** pitch-black tunnels propped up with timber, rails, chambers cut out of the rock, crawl spaces to hide in (it can't
  follow you in), and every voice echoes back from somewhere else.
- **The patient** (always in the hospital and the asylum; online, Normal mode, a lobby switch, anywhere): a body on a bed. Walk past
  and it sits up; run near it and it gets up and follows.
- **Imposter voices** (online lobby Mode): there's one more of you than there should be. Look at who you think it is, press V, and
  everyone votes.
- **Kill-cam:** when it gets you, a replay from behind you shows the last few seconds before it reached you (Space skips). Online, when a
  friend is taken while you're dead or out, K watches theirs.
- **The clown** (always in the fairground; online, Normal mode, a lobby switch, anywhere): a mascot in a clown suit that looks
  just like the statues. It only moves when nobody's looking, its head follows you if you stare, and it laughs in your voice.
- **The Mother** (online, Normal mode, a lobby switch): huge and slow, and too big to fit through a doorway. Every so often she
  stops and sings a lullaby in your voices, and the mimic comes to listen.
- **The Double** (online, Normal mode, a lobby switch): it walks the routes one of you walked a minute ago, with their coat,
  flashlight, footsteps and voice. Get too close, hold a light on it, or see your own double, and it turns round.
- **The asylum:** iron cots to hide under, padded cells to hide in, restraint chairs, tally marks on the walls, and doors that
  someone bangs on from the other side.
- **No two nights the same:** it has a **mood** each run (the Stalker, the Hunter, the Trickster, the Watcher), and you work out
  which from what it does (the end screen tells you). Most nights there's a **twist**: the lights die faster, a fog, old batteries,
  it gets into the vents, it won't stop talking, or it's half blind and hears everything. Some exits have a **keypad** (the code is on
  a note that only the reader sees: say it out loud), some buildings have a **lift** you call and then survive 40 seconds waiting for,
  and some have a **strange room**: flooded, a fallen ceiling, a ring of candles. Your stats keep your fastest time out of each place.
- **Hide and seek** (online, a lobby Mode): you get a minute to hide while it waits, then it comes looking, and every so often
  it simply knows where one of you is. Whoever it hasn't found after four minutes wins; if it finds everyone, the last one found wins.
- **Escort** (online, a lobby Mode): none of the flashlights work. One of you carries the only lantern and everyone else has to
  see by it; it's slower in its light. If it takes the carrier, the light goes out and someone has to pick the lantern up in the dark.
- **Pick the map:** Random, or any building, on the class screen alone, or in the lobby's Mode tab for the host.
- **The one that worked:** the end screen plays back the voice that fooled someone (they walked toward it, or it took them soon after).
- **Name tags** (Settings, off by default): your friends' names over their heads, faint in the dark. Things wearing your friends
  get their names too.
- **Night Shift** (title screen, or a lobby Mode online): midnight to 6 a.m., no jobs, the doors chained. Each hour is a minute and
  the bell tolls it. Last the night and the next one is worse: faster, sharper-eyed, hungrier, with fewer lights. How many nights can you do?
- **The church:** pews, candles, an altar, confessionals to hide in, statues that turn when you aren't looking, and a bell that
  tolls once for every one of you it has taken.
- **Sound captions** (Settings) show what you'd hear and where it came from. **Graphics: Auto** lowers the quality by
  itself on slower phones.

It hates the light: under working lights it's slow, but in the dark it's faster than you.

It all plays out through a camcorder: grainy VHS footage that tears apart when it gets close.
Press `Tab` to show your objectives (and again to hide them).

Controls: `WASD` move, mouse look, `Shift` sprint, `C` crouch, `F` flashlight, `E` interact / hide (hold to
repair), `G` class ability, `Space` skill checks and heartbeats, `Esc` pause.

**Change any key or button** in Settings › Controls, and drag the touch buttons wherever you like.

**Quick chat** (online, `T`): set phrases for when you can't talk. **When you're dead**, you can still reach the living
every 30 seconds: flicker a light near them (`F`), knock (`G`) or whisper behind them (`C`). They won't know it was you.

**Controllers and phones work too.** Controller: left stick move, right stick look, `A` use, `B` crouch, `X` flashlight,
`Y` ability, `LT` sprint, `RT` skill checks, `Start` pause (menus work with the D-pad). Phone or tablet: play sideways, left
thumb moves, drag with the right thumb to look, and tap the on-screen buttons.

**Install it:** in Chrome or Edge, use "Install as an app" on the title screen. On a phone, Add to Home Screen.
It opens full screen like a normal app. Settings has a Graphics option (Low / Medium / High) for slower devices.

Privacy: recordings stay in memory in your browser tab. They are never uploaded or saved to disk,
and closing the tab deletes them.
