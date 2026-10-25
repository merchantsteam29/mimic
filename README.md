# Mimic

A first-person browser horror game. Something is in the dark with you, and it has no voice of its own,
so it records yours. Everything you say through your microphone becomes a clip it can play back from
around the next corner.

## Play

```bash
node serve.js        # then open http://localhost:8080 in Chrome
```

The microphone only works on `localhost` or `https`, not on `file://`. Use headphones.

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
  **Tracker** (a motion tracker that beeps faster as it gets closer, loudly).
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
- **Random maps:** each run is either a research facility or an old house, with a new layout every time.

Controls: `WASD` move, mouse look, `Shift` sprint, `C` crouch, `F` flashlight, `E` interact / hide (hold to
repair), `G` class ability, `Space` skill checks and heartbeats, `Esc` pause.

Privacy: recordings stay in memory in your browser tab. They are never uploaded or saved to disk,
and closing the tab deletes them.
