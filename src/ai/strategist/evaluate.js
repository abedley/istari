/**
 * The Strategist's evaluation, for Pai Gow (no lands, no library): the chance that `me` wins from a
 * position at the start of its own turn, between 0 and 1.
 *
 * It's a logistic model over a few features (positionFeatures), fitted to who went on to win in
 * tens of thousands of self-played rounds (tools/tune-eval.js writes evalWeights.js):
 * - life, each side's (as a logarithm: each point matters more when there are few);
 * - creatures: each side's total creatureValue, and how many;
 * - cards in hand: their worth (a creature nearly its value on the battlefield, another spell a flat
 *   amount, a land nothing) and their number;
 * - other permanents;
 * - the race: how many turns each side needs to kill the other through the best blocks, and the board
 *   played forward a few turns with nothing new cast (planLookaheadAttack): won, lost, or its score.
 *
 * A profile tilts it: `aggression` scales what its own clock and a won race count for, `caution`
 * what the opponent's clock and a lost race count for, `patience` what its cards in hand count for.
 */
import { GAME_STATUS } from '../../engine/Game.js';
import {
  CARDS, isCreature, isLand, hasKeyword, cantAttack, KEYWORD,
} from '../../cards/cards.js';
import { creatureValue, damageThrough } from '../combat.js';
import { planLookaheadAttack } from '../attacking.js';
import { EVAL_WEIGHTS } from './evalWeights.js';

/** A card in hand, in creatureValue points. */
export function handValue(card) {
  if (isLand(card)) return 0;
  return isCreature(card) ? 2 + creatureValue(card) : 5;
}

export const FEATURES = Object.freeze([
  'bias', 'myLife', 'theirLife', 'myCreatures', 'theirCreatures', 'myCount', 'theirCount', 'myHand', 'theirHand', 'myCards', 'theirCards',
  'myPermanents', 'theirPermanents', 'myClock', 'theirClock', 'raceWon', 'raceLost', 'raceScore',
]);

/** Which features each number of a profile scales. */
const TILT = Object.freeze({
  aggression: ['myClock', 'raceWon'],
  caution: ['theirClock', 'raceLost'],
  patience: ['myHand', 'myCards'],
});

const WIN = 10000;

/** Turns for `attackers` to kill a player at `life` through `blockers` (capped at 10). */
function turnsToKill(attackers, blockers, life) {
  const perTurn = damageThrough(attackers, blockers);
  return perTurn <= 0 ? 10 : Math.min(10, Math.ceil(life / perTurn));
}

/**
 * The features of a position for `me`, who is about to take a turn (or, when it's the opponent's
 * turn, as if it were: the race is then read from the opponent's side and turned round). `unseen`: cards
 * the opponent holds that aren't in `state` (a board-only world, see beliefs.js), each counted as an average card.
 */
export function positionFeatures(state, me, unseen = 0) {
  const player = state.players.find((p) => p.id === me);
  const opponent = state.players.find((p) => p.id !== me);
  const mine = [];
  const theirs = [];
  let myPermanents = 0;
  let theirPermanents = 0;
  for (const p of state.battlefield) {
    if (isCreature(p)) (p.controllerId === me ? mine : theirs).push(p);
    else if (!isLand(p)) {
      if (p.controllerId === me) myPermanents += 1;
      else theirPermanents += 1;
    }
  }
  const sum = (list, value) => list.reduce((total, x) => total + value(x), 0);
  const untapped = (list) => list.map((c) => (c.tapped ? { ...c, tapped: false } : c));
  const attackersOf = (list) => list.filter((c) => !cantAttack(c));
  // The board played forward, from whoever's turn it is.
  const meActive = state.activePlayerId === me;
  const able = (meActive ? mine : theirs).filter((p) => !p.tapped && (!p.summoningSick || hasKeyword(p, KEYWORD.HASTE)) && !cantAttack(p));
  const look = planLookaheadAttack(state, meActive ? me : opponent.id, able, { turns: 3 });
  const outlook = (meActive ? 1 : -1) * Math.max(...Object.values(look.scores));
  return {
    bias: 1,
    myLife: Math.log(1 + Math.max(0, player.life)),
    theirLife: Math.log(1 + Math.max(0, opponent.life)),
    myCreatures: sum(mine, creatureValue) / 10,
    theirCreatures: sum(theirs, creatureValue) / 10,
    myCount: mine.length,
    theirCount: theirs.length,
    myHand: sum(player.hand, handValue) / 10,
    theirHand: (sum(opponent.hand, handValue) + unseen * AVERAGE.value) / 10,
    myCards: player.hand.filter((c) => !isLand(c)).length,
    theirCards: opponent.hand.filter((c) => !isLand(c)).length + unseen * AVERAGE.spell,
    myPermanents,
    theirPermanents,
    myClock: 1 / turnsToKill(attackersOf(mine), untapped(theirs), opponent.life),
    theirClock: 1 / turnsToKill(attackersOf(theirs), untapped(mine), player.life),
    raceWon: outlook > WIN / 2 ? 1 : 0,
    raceLost: outlook < -WIN / 2 ? 1 : 0,
    raceScore: Math.abs(outlook) > WIN / 2 ? 0 : Math.max(-3, Math.min(3, outlook / 20)),
  };
}

/** What a card nobody has seen is worth on average, and how often it's a spell rather than a land: over LTR's cards. */
const AVERAGE = (() => {
  const pool = Object.values(CARDS).filter((card) => card.set === 'ltr' && !(card.supertypes ?? []).includes('Basic'));
  return {
    value: pool.reduce((sum, card) => sum + handValue(card), 0) / Math.max(1, pool.length),
    spell: pool.filter((card) => !isLand(card)).length / Math.max(1, pool.length),
  };
})();

/** The log-odds of winning for these features, by `weights` (EVAL_WEIGHTS), tilted by a profile. */
export function logOdds(features, weights = EVAL_WEIGHTS, profile = null) {
  let z = 0;
  for (const name of FEATURES) z += (weights[name] ?? 0) * features[name];
  if (profile) {
    for (const [trait, names] of Object.entries(TILT)) {
      const extra = (profile[trait] ?? 1) - 1;
      if (extra) for (const name of names) z += extra * (weights[name] ?? 0) * features[name];
    }
  }
  return z;
}

/** The chance `me` wins: 1, 0 or a half for a game that's over (won, lost, drawn), otherwise the model's. */
export function evaluate(state, me, profile = null, unseen = 0) {
  if (state.status === GAME_STATUS.GAME_OVER) return state.winnerId === me ? 1 : state.winnerId === null ? 0.5 : 0;
  return 1 / (1 + Math.exp(-logOdds(positionFeatures(state, me, unseen), EVAL_WEIGHTS, profile)));
}
