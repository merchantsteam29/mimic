// Building codes: a short code for a run's building (its kind + its seed), so friends can play the exact same
// map. The first letter is the kind of place, the rest is the seed in base 36: "H-4F2K9A" is that one house.
const LETTERS = { facility: 'F', house: 'H', hospital: 'P', mall: 'M', school: 'S', hotel: 'O' };
const THEME_OF = Object.fromEntries(Object.entries(LETTERS).map(([t, l]) => [l, t]));

export function buildingCode(theme, seed) {
  const l = LETTERS[theme];
  return l ? `${l}-${(seed >>> 0).toString(36).toUpperCase()}` : '';
}

// "h-4f2k9a", "H4F2K9A", " H - 4F2K9A " -> { theme, seed }, or null if it isn't one.
export function parseCode(text) {
  const m = /^\s*([A-Z])\s*-?\s*([0-9A-Z]{1,7})\s*$/i.exec(String(text || ''));
  if (!m) return null;
  const theme = THEME_OF[m[1].toUpperCase()], seed = parseInt(m[2], 36);
  return theme && Number.isFinite(seed) && seed <= 0xffffffff ? { theme, seed } : null;
}
