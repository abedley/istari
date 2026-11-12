/**
 * The Strategist's personalities. A profile tilts how a position is judged (evaluate.js) and which
 * of two near-equal moves is taken; it never makes the search consider worse moves.
 * - `aggression`: what a race it's winning is worth. `caution`: what one it's losing costs.
 * - `patience`: what cards kept in hand are worth.
 * - `foresight`: how many guesses it makes of the opponent's hidden hand (beliefs.js); 0 plays the board as it stands.
 * - `risk`: with guesses, how much the bad ones weigh (0: the average; 1: a lot).
 * - `budgetMs`: its thinking time for one decision.
 * - `tastes`: what it likes in a deck (deckBuilder.js).
 */
const profile = (temperament, numbers, tastes) => Object.freeze({ temperament, ...numbers, tastes: Object.freeze(tastes) });

export const TEMPERAMENTS = Object.freeze({
  /** Deploys its hand and attacks when the race is even. */
  raider: profile('raider', { aggression: 1.3, caution: 0.85, patience: 0.8, risk: 0.1, foresight: 0, budgetMs: 100 }, { evasion: 1.3, power: 1.2, removal: 0.9, toughness: 0.8, tricks: 1.1 }),
  /** Holds answers, trades, wins late; the one that imagines what the opponent may hold. */
  warden: profile('warden', { aggression: 0.85, caution: 1.25, patience: 1.3, risk: 0.5, foresight: 2, budgetMs: 150 }, { evasion: 0.9, power: 0.9, removal: 1.3, toughness: 1.25, tricks: 0.9 }),
  /** Tempo: tricks and flash at the last moment. */
  trickster: profile('trickster', { aggression: 1, caution: 1, patience: 1.1, risk: 0.3, foresight: 0, budgetMs: 100 }, { evasion: 1.1, power: 1, removal: 1.1, toughness: 1, tricks: 1.3 }),
});

/** Each Pai Gow opponent's temperament (PAIGOW_OPPONENTS in src/paigow/personas.js). */
export const PERSONA_TEMPERAMENT = Object.freeze({
  sauron: 'raider', theoden: 'raider', riderInBlack: 'raider', burglarBilbo: 'raider',
  saruman: 'warden', denethor: 'warden', elrond: 'warden', oldManWillow: 'warden',
  gandalf: 'trickster', galadriel: 'trickster', tomBombadil: 'trickster', gildor: 'trickster', birthdayBilbo: 'trickster',
});

/** How a deck's plan (deckPlan in src/paigow/deckBuilder.js) shifts the way it's played, whoever plays it. */
const PLAN_TILT = Object.freeze({
  race: { aggression: 0.15, patience: -0.1 },
  grind: { caution: 0.15, patience: 0.1 },
  tempo: {},
});

/**
 * A profile from a temperament's name, an opponent's id, or a profile (missing numbers from the trickster).
 * `plan`: what the deck in hand is built to do ('race', 'grind' or 'tempo'): a Warden handed a racing deck races a little more.
 */
export function profileFor(given, plan = null) {
  const base = given && typeof given === 'object' ? { ...TEMPERAMENTS.trickster, ...given }
    : TEMPERAMENTS[given] ?? TEMPERAMENTS[PERSONA_TEMPERAMENT[given]] ?? TEMPERAMENTS.trickster;
  const tilt = PLAN_TILT[plan];
  if (!tilt) return base;
  const tilted = { ...base };
  for (const [trait, change] of Object.entries(tilt)) tilted[trait] = Math.round((base[trait] + change) * 100) / 100;
  return tilted;
}
