// Player classes. Everyone can pick any class, any time: no unlocks, no currency, ever.
// The ability key is G for all of them.

export const CLASSES = {
  brute: {
    name: 'Brute',
    blurb: 'Carries 2 flares. Light one (G) when it gets close: it is blinded and stunned for 4 seconds, then runs.',
    ability: 'Flare', charges: 2,
  },
  runner: {
    name: 'Runner',
    blurb: 'Sprints faster and for longer, and gets their breath back quickly. Their footsteps are louder when sprinting.',
    ability: null, charges: 0,
    sprint: 6.2, stamina: 13, recover: 2.5,
  },
  medic: {
    name: 'Medic',
    blurb: 'One rescue. Use it (G) on a teammate, or on yourself: the next time it catches them, they tear free and it reels back, stunned.',
    ability: 'Rescue', charges: 1,
  },
  tracker: {
    name: 'Tracker',
    blurb: 'Carries a motion tracker (G). It shows anything moving nearby and beeps faster as it gets closer. The beeping is loud, and the battery runs out.',
    ability: 'Tracker', charges: 0,
    battery: 90,
  },
  soundguy: {
    name: 'Sound guy',
    blurb: 'Carries a speaker. G puts it down; G again, from anywhere, plays its own noises through it (3 times), and it goes to look. Pull it off a friend.',
    ability: 'Speaker', charges: 3,
  },
  priest: {
    name: 'Priest',
    blurb: 'Holds up a crucifix (G) when it gets close: it backs away and keeps its distance for a while. 3 times a game. Shaky hands, and walks a little slower.',
    ability: 'Crucifix', charges: 3,
    walk: 0.88, shaky: 0.3,
  },
  scout: {
    name: 'Scout',
    blurb: 'Marks whatever they look at (G): it glows for everyone for 20 seconds, even through walls. Quiet on their feet, but the flashlight battery is small.',
    ability: 'Mark', charges: 0,
    steps: 0.55, flash: 0.6,
  },
  mechanic: {
    name: 'Mechanic',
    blurb: 'Fixes generators much faster. Wedges a door shut (G, looking at it) for 25 seconds: it can\'t get through, and neither can you. 3 wedges. Their tools clank when they walk.',
    ability: 'Wedge', charges: 3,
    repair: 1.7, steps: 1.25,
  },
};

export const CLASS_ORDER = ['brute', 'runner', 'medic', 'tracker', 'soundguy', 'priest', 'scout', 'mechanic'];
export const classOf = (id) => CLASSES[id] || CLASSES.runner;
