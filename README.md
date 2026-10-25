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
- **Goal:** find 4 fuses, put them in the fuse box, then get out through the exit before it catches you.
  Restoring power sets off the alarm, and the mimic comes straight for you.
- **Hiding:** lockers (facility) and wardrobes (house). It can't see you inside, but if it saw you
  get in, or hears you talk in there, it will drag you out.
- **Random maps:** each run is either a research facility or an old house, with a new layout every time.

Controls: `WASD` move, mouse look, `Shift` sprint, `C` crouch, `F` flashlight, `E` interact / hide,
`Esc` pause.

Privacy: recordings stay in memory in your browser tab. They are never uploaded or saved to disk,
and closing the tab deletes them.
