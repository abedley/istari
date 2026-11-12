/**
 * The Strategist's personalities. A profile tilts how a position is judged (evaluate.js) and which
 * of two near-equal moves is taken; it never makes the search consider worse moves.
 * - `aggression`: what a race it's winning is worth. `caution`: what one it's losing costs.
 * - `patience`: what cards kept in hand are worth.
 * - `risk`: how much the bad guesses of the opponent's hand weigh (0: the average; 1: a lot).
 * - `tastes`: what it likes in a deck (deckBuilder.js).
 */
const profile = (temperament, numbers, tastes) => Object.freeze({ temperament, ...numbers, tastes: Object.freeze(tastes) });

export const TEMPERAMENTS = Object.freeze({
  /** Deploys its hand and attacks when the race is even. */
  raider: profile('raider', { aggression: 1.3, caution: 0.85, patience: 0.8, risk: 0.1 }, { evasion: 1.3, power: 1.2, removal: 0.9, toughness: 0.8, tricks: 1.1 }),
  /** Holds answers, trades, wins late. */
  warden: profile('warden', { aggression: 0.85, caution: 1.25, patience: 1.3, risk: 0.5 }, { evasion: 0.9, power: 0.9, removal: 1.3, toughness: 1.25, tricks: 0.9 }),
  /** Tempo: tricks and flash at the last moment. */
  trickster: profile('trickster', { aggression: 1, caution: 1, patience: 1.1, risk: 0.3 }, { evasion: 1.1, power: 1, removal: 1.1, toughness: 1, tricks: 1.3 }),
});

/** Each Pai Gow opponent's temperament (PAIGOW_OPPONENTS in src/paigow/personas.js). */
export const PERSONA_TEMPERAMENT = Object.freeze({
  sauron: 'raider', theoden: 'raider', riderInBlack: 'raider', burglarBilbo: 'raider',
  saruman: 'warden', denethor: 'warden', elrond: 'warden', oldManWillow: 'warden',
  gandalf: 'trickster', galadriel: 'trickster', tomBombadil: 'trickster', gildor: 'trickster', birthdayBilbo: 'trickster',
});

/** A profile from a temperament's name, an opponent's id, or a profile (missing numbers from the trickster). */
export function profileFor(given) {
  if (given && typeof given === 'object') return { ...TEMPERAMENTS.trickster, ...given };
  return TEMPERAMENTS[given] ?? TEMPERAMENTS[PERSONA_TEMPERAMENT[given]] ?? TEMPERAMENTS.trickster;
}
