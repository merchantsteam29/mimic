// Your look (online): coat colour, hat and flashlight colour, so friends can tell you apart in the dark.
// All of it is free from the start. Kept in settings.look, shared through the roster (Session.setLook).
export const COATS = [0x6b3a2a, 0x2a4a6b, 0x4a5a2a, 0x5a2a5a, 0x7a6a3a, 0x2a2a2a, 0x8a2a2a, 0x3a6a6a];
export const HATS = ['beanie', 'cap', 'hood', 'none'];
export const LIGHTS = { warm: 0xfff1d8, white: 0xf2f6ff, cold: 0xcfe2ff, red: 0xffb0a0 };
export const DEFAULT_LOOK = { coat: -1, hat: 'beanie', light: 'warm' }; // coat -1: the colour of your place in the room

// A look that came over the network: only the known choices get through.
export function cleanLook(l) {
  return {
    coat: Number.isInteger(l?.coat) && l.coat >= -1 && l.coat < COATS.length ? l.coat : -1,
    hat: HATS.includes(l?.hat) ? l.hat : 'beanie',
    light: l?.light in LIGHTS ? l.light : 'warm',
  };
}
