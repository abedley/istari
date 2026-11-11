import {
  EFFECT, ACTIVATION_TIMING, TARGET, KEYWORD, COUNTER, AFFECTED, TRIGGER,
} from './cards.js';

/**
 * Emblem definitions.
 *
 * In this game every player starts with emblems in the command zone that grant
 * them planeswalker-style abilities. Real Magic emblems (114) only have static or
 * triggered abilities; here they can also have activated abilities, which work
 * like a planeswalker's loyalty abilities (606.3): sorcery timing, and a limited
 * number of activations per emblem each turn. Instead of loyalty, the costs are
 * life, mana, or nothing.
 *
 * Abilities use the same format as card abilities (see src/cards/cards.js).
 * `activationsPerTurn` limits how many of an emblem's abilities can be
 * activated each turn, in total.
 */
const deepFreeze = (value) => {
  if (value && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

/**
 * An emblem with one planeswalker power, shown in the app as a Ring of Power: `ring` is the ring's name
 * (the emblem's, and shown on its button), `power` the name of what it does, `text` its rules text,
 * `timing` 'sorcery' or left out for any time with priority. Each can be used once a turn.
 */
const power = (id, ring, powerName, { text, cost = {}, effects, target, timing }) => ({
  id,
  name: ring,
  ring: true,
  power: powerName,
  activationsPerTurn: 1,
  abilities: [{ id: 'power', name: ring, text, cost, effects, ...(target ? { target } : {}), ...(timing ? { timing } : {}) }],
});
const SORCERY = ACTIVATION_TIMING.SORCERY;

export const EMBLEMS = deepFreeze({
  planeswalker: {
    id: 'planeswalker',
    name: 'Planeswalker',
    activationsPerTurn: 1,
    abilities: [
      {
        id: 'gainLife',
        text: '0: You gain 1 life.',
        cost: {},
        effect: { type: EFFECT.GAIN_LIFE, amount: 1 },
        timing: ACTIVATION_TIMING.SORCERY,
      },
    ],
  },

  // Pai Gow's heroes, one for the player to choose (PAIGOW_HEROES in src/paigow/personas.js).
  frodo: power('frodo', 'The One Ring', 'The Burden', {
    text: '0: The Ring tempts you. Activate only as a sorcery.',
    effects: [{ type: EFFECT.RING_TEMPTS }],
    timing: SORCERY,
  }),
  strider: power('strider', 'The Ring of Barahir', 'Ranger of the North', {
    text: "0: Target creature's power becomes 4 until your next turn. Activate only as a sorcery.",
    // Any creature: one of yours grows, one of theirs (bigger than 4) shrinks.
    target: TARGET.CREATURE,
    // Until your next turn: it blocks as a 4-power creature on the opponent's turn too.
    effects: [{ type: EFFECT.PUMP, setBase: { power: 4 }, untilYourNextTurn: true }],
    timing: SORCERY,
  }),
  // A passive power: no ability to activate, just something the game starts with (`startsWith`, card ids put onto
  // the battlefield before the first turn; see Game's #startFirstTurn).
  samwise: {
    id: 'samwise',
    name: 'Field-Tested Frying Pan',
    ring: true,
    passive: true,
    text: 'Start the game with Field-Tested Frying Pan on the battlefield.',
    startsWith: ['fieldTestedFryingPan'],
    abilities: [],
  },

  // Pai Gow's CPU opponents, one each (PAIGOW_OPPONENTS in src/paigow/personas.js).
  birthdayBilbo: power('birthdayBilbo', 'Gollum’s Birthday Present', 'Eleventy-First Birthday', {
    text: '0: You gain 1 life. Activate only as a sorcery.',
    effects: [{ type: EFFECT.GAIN_LIFE, amount: 1 }],
    timing: SORCERY,
  }),
  burglarBilbo: power('burglarBilbo', 'The Magic Ring', 'Burglar’s Stealth', {
    text: '0: Target creature you control gets +1/+0 and gains menace until end of turn. Activate only as a sorcery.',
    target: TARGET.CREATURE_YOU_CONTROL,
    effects: [{ type: EFFECT.PUMP, power: 1, toughness: 0, keywords: [KEYWORD.MENACE] }],
    timing: SORCERY,
  }),
  gandalf: power('gandalf', 'Narya', 'You Shall Not Pass', {
    text: '0: Tap target creature an opponent controls. Activate only as a sorcery.',
    target: TARGET.CREATURE_OPPONENT_CONTROLS,
    effects: [{ type: EFFECT.TAP }],
    timing: SORCERY,
  }),
  // A passive power with a triggered ability: emblems' `triggeredAbilities` trigger like a permanent's (see Game's
  // #triggerAtBeginningOf).
  oldManWillow: {
    id: 'oldManWillow',
    name: 'The Withywindle Ring',
    ring: true,
    passive: true,
    power: 'Roots of the Old Forest',
    text: 'At the beginning of your end step, if a creature you controlled died this turn, create a 2/2 green Treefolk creature token.',
    abilities: [],
    triggeredAbilities: [{
      id: 'roots',
      trigger: TRIGGER.END_STEP,
      text: 'At the beginning of your end step, if a creature you controlled died this turn, create a 2/2 green Treefolk creature token.',
      condition: { creatureDiedThisTurn: true },
      effects: [{ type: EFFECT.CREATE_TOKEN, count: 1, token: { colors: ['green'], subtypes: ['Treefolk'], power: 2, toughness: 2 } }],
    }],
  },
  // A passive power that adds cards to the library as the game starts (`shufflesIn`; see Game's #startFirstTurn).
  gildor: {
    id: 'gildor',
    name: 'The Starlit Ring',
    ring: true,
    passive: true,
    power: 'A Star Shines on Our Meeting',
    text: 'At the start of the game, shuffle two Forests and a Chance-Met Elves into your library.',
    shufflesIn: ['forest', 'forest', 'chanceMetElves'],
    abilities: [],
  },
  riderInBlack: {
    id: 'riderInBlack',
    name: 'A Ring of the Nine',
    ring: true,
    passive: true,
    power: 'Hunting the Ring',
    text: 'At the beginning of your end step, each opponent who controls a Ring-bearer loses life equal to the number of abilities their Ring has.',
    abilities: [],
    triggeredAbilities: [{
      id: 'hunt',
      trigger: TRIGGER.END_STEP,
      text: 'At the beginning of your end step, each opponent who controls a Ring-bearer loses life equal to the number of abilities their Ring has.',
      // Counted for each opponent: their own Ring's abilities, 1 to 4 (no Ring-bearer, no life lost).
      effects: [{ type: EFFECT.LOSE_LIFE, amount: 1, affected: AFFECTED.EACH_OPPONENT, perPlayer: { of: 'ringAbilities' } }],
    }],
  },
  tomBombadil: power('tomBombadil', 'Goldberry’s Ring', 'Hey Dol! Merry Dol!', {
    text: '0: Untap target creature you control. It gets +0/+2 until end of turn.',
    target: TARGET.CREATURE_YOU_CONTROL,
    effects: [{ type: EFFECT.UNTAP }, { type: EFFECT.PUMP, power: 0, toughness: 2 }],
  }),
  sauron: power('sauron', 'The Ruling Ring', 'Armies of Mordor', {
    text: '0: Amass Orcs 1. Activate only as a sorcery.',
    effects: [{ type: EFFECT.AMASS, count: 1, subtype: 'Orc' }],
    timing: SORCERY,
  }),
  saruman: power('saruman', 'The Ring of Many Colours', 'The Voice', {
    text: '0: Target creature an opponent controls gets −2/−0 until end of turn.',
    target: TARGET.CREATURE_OPPONENT_CONTROLS,
    effects: [{ type: EFFECT.PUMP, power: -2, toughness: 0 }],
  }),
  theoden: power('theoden', 'The Ring of Eorl', 'Ride Now!', {
    text: '0: Target creature you control gets +1/+0 and gains haste until end of turn. Activate only as a sorcery.',
    target: TARGET.CREATURE_YOU_CONTROL,
    effects: [{ type: EFFECT.PUMP, power: 1, toughness: 0, keywords: [KEYWORD.HASTE] }],
    timing: SORCERY,
  }),
  denethor: power('denethor', 'The Steward’s Ring', 'Despair', {
    text: 'Pay 1 life: Each opponent discards a card. Activate only as a sorcery.',
    cost: { life: 1 },
    effects: [{ type: EFFECT.DISCARD, count: 1, affected: AFFECTED.EACH_OPPONENT }],
    timing: SORCERY,
  }),
  elrond: power('elrond', 'Vilya', 'Ring of Air', {
    text: '0: Target creature you control gains hexproof and indestructible until end of turn.',
    target: TARGET.CREATURE_YOU_CONTROL,
    effects: [{ type: EFFECT.PUMP, power: 0, toughness: 0, keywords: [KEYWORD.HEXPROOF, KEYWORD.INDESTRUCTIBLE] }],
  }),
  galadriel: power('galadriel', 'Nenya', 'Light of Eärendil', {
    text: '0: Put a +1/+1 counter on target creature you control. Activate only as a sorcery.',
    target: TARGET.CREATURE_YOU_CONTROL,
    effects: [{ type: EFFECT.ADD_COUNTERS, counter: COUNTER.PLUS_ONE, count: 1 }],
    timing: SORCERY,
  }),
});

/** Emblems each player starts with unless the game is told otherwise. */
export const DEFAULT_EMBLEMS = Object.freeze(['planeswalker']);
