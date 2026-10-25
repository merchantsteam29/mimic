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
};

export const CLASS_ORDER = ['brute', 'runner', 'medic', 'tracker'];
export const classOf = (id) => CLASSES[id] || CLASSES.runner;
