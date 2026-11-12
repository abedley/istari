/**
 * What the Strategist may know, and what it guesses.
 *
 * It sees only what a person across the table would: the opponent's cards once they're played or
 * revealed, how many cards they hold, and what they did. `blindView` is Game#getPlayerView with the
 * opponent's deck list taken out, and it's the only thing the Strategist's search is ever given.
 *
 * The hidden cards are guessed (`sampleWorld`): each is drawn from what a booster holds (every card
 * of the pool, weighted by its rarity slot), and what the opponent did narrows it. Mana is free in
 * Pai Gow, so a card held through its owner's own turn is seldom a plain creature, and more often
 * an instant, a trick, removal or a creature with flash.
 */
import { Game } from '../../engine/Game.js';
import { CARDS, isCreature, isInstant, isLand, isAura, isSorcery, hasKeyword, KEYWORD } from '../../cards/cards.js';
import { determinize } from '../determinize.js';

/** The cards a hidden card may be: LTR's, but for the basic lands (as PAIGOW_POOL; kept here so the AI needs no Pai Gow code). */
const POOL = Object.keys(CARDS).filter((id) => CARDS[id].set === 'ltr' && !(CARDS[id].supertypes ?? []).includes('Basic')).sort();

/** How often each card turns up in a booster's 15: 10 commons, 3 uncommons, a rare or mythic, and any card at all. */
const PRIOR = (() => {
  const count = (rarity) => POOL.filter((id) => CARDS[id].rarity === rarity).length;
  const rareSheet = 2 * count('rare') + count('mythic');
  const slot = {
    common: 10 / Math.max(1, count('common')), uncommon: 3 / Math.max(1, count('uncommon')), rare: 2 / Math.max(1, rareSheet), mythic: 1 / Math.max(1, rareSheet),
  };
  return Object.fromEntries(POOL.map((id) => [id, (slot[CARDS[id].rarity] ?? 0) + 1 / POOL.length]));
})();

/** How a card is usually played, for the inference: `deploy` cards come down as soon as they can. */
export function cardClass(card) {
  if (isLand(card)) return 'land';
  if (isInstant(card) || hasKeyword(card, KEYWORD.FLASH)) return 'instant';
  if (isSorcery(card)) return 'sorcery';
  if (isAura(card)) return 'aura';
  return isCreature(card) ? 'deploy' : 'permanent';
}

/** How much less (or more) likely a card of each class is, once its owner has held it through a turn of their own. */
export const HELD_WEIGHTS = Object.freeze({ deploy: 0.12, permanent: 0.4, sorcery: 0.7, aura: 0.8, land: 1.2, instant: 1.8 });

/** Card objects as the engine makes them, by card id (made once, from a game that's never started). */
let templates = null;
function template(cardId) {
  if (!templates) {
    const game = new Game({ players: [{ id: 'x' }, { id: 'y' }], decks: { x: POOL, y: [] }, emblems: { x: [], y: [] }, silent: true });
    templates = Object.fromEntries(game.serialize().zones.x.library.map((card) => [card.cardId, card]));
  }
  return templates[cardId];
}

/**
 * What `me` may know of the game: Game#getPlayerView, without the opponents' deck lists. `hidden`
 * says how many cards of each opponent are out of sight (hand and library).
 */
export function blindView(game, me) {
  const view = game.getPlayerView(me);
  view.hidden = {};
  for (const id of Object.keys(view.unknownCards)) {
    if (id === me) continue;
    view.hidden[id] = view.unknownCards[id].length;
    view.unknownCards[id] = [];
  }
  return view;
}

/** One card drawn from the prior, weighted for a slot the opponent has (`held`) or hasn't held through a turn. */
function drawCard(random, held, weights) {
  let total = 0;
  const odds = POOL.map((id) => {
    const w = PRIOR[id] * (held ? weights[cardClass(CARDS[id])] ?? 1 : 1);
    total += w;
    return w;
  });
  let r = random() * total;
  let i = 0;
  while (i < POOL.length - 1 && (r -= odds[i]) >= 0) i++;
  return POOL[i];
}

/**
 * A blind view with a guess of each opponent's hidden cards filled in, ready for determinize().
 * `handInfo` (one entry per hidden card in hand) says which were held through a turn (`noLand`).
 * With `deal: false` nothing is guessed: the opponents hold no cards in that world, and the search
 * plays the board as it stands (the evaluation is told how many cards are out of sight, see `unseen`).
 */
export function believe(view, random, { weights = HELD_WEIGHTS, deal = true } = {}) {
  const guessed = { ...view, unknownCards: { ...view.unknownCards } };
  for (const [id, zone] of Object.entries(view.zones)) {
    if (id === view.viewerId) continue;
    const inHand = zone.handSize - zone.hand.length;
    const total = view.hidden?.[id] ?? inHand + (zone.librarySize ?? 0);
    const info = zone.handInfo ?? [];
    const cards = [];
    // `deal: false`: the hidden cards are left out altogether (playing the board).
    for (let i = 0; deal && i < total; i++) {
      const held = i < inHand && Boolean(info[i]?.noLand);
      cards.push({ ...structuredClone(template(drawCard(random, held, weights))), id: null, ownerId: id });
    }
    guessed.unknownCards[id] = cards;
  }
  return guessed;
}

/** A complete game snapshot guessed from a blind view (for Game.deserialize). */
export function sampleWorld(view, random, options) {
  return determinize(believe(view, random, options), random);
}

/** As determinize(), for a search that's given a blind view (the current search AI, made blind for comparisons). */
export const blindDeterminizer = (view, random, options) => determinize(believe(view, random), random, options);

/** How many of the opponents' cards `view` (a blind view) can't see. */
export const unseenCards = (view) => Object.values(view.hidden ?? {}).reduce((sum, n) => sum + n, 0);
