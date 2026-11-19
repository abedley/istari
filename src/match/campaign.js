/**
 * The campaign: Istari matches (src/match/match.js) against a road of opponents, one after another,
 * with three lives. The road is split into books (CAMPAIGN_BOOKS), each ending with a boss: a book draws
 * a few of its opponents at random (kept in road order), then its boss. For now there is only Book I,
 * which ends with the Ringwraiths; beat them and the campaign is won.
 *
 * Losing a match costs a life and you face the same opponent again (with a new booster); a tied match
 * costs nothing, and you face them again too. Beat an opponent and you choose a reward: take their Ring
 * of Power (their planeswalker power, an emblem in src/cards/emblems.js) to use alongside your hero's, at
 * the cost of starting every round with one less life (see playerLife in match.js), four rings at most;
 * or add a common to every booster you open after (so you have more cards than your three decks of five
 * need, and pick which to leave out).
 * Beat every opponent on the road and the campaign is won; lose your last life and it's lost.
 *
 * Everything here is pure: a campaign is a plain object (it can be saved as JSON), and each function
 * returns a new one.
 */
import { createMatch, MATCH_OUTCOME } from './match.js';
import { HEROES, OPPONENTS, DEFAULT_HERO } from './personas.js';
import { seededRandom, shuffle } from '../engine/random.js';

export const CAMPAIGN_RULES = Object.freeze({
  lives: 3,
  /** Rings of Power taken from beaten opponents, besides your hero's own. */
  maxRings: 4,
});

/**
 * Every opponent on the road, in road order (ids in OPPONENTS): the books draw from these, and
 * those drawn are faced in this order.
 */
export const CAMPAIGN_OPPONENTS = Object.freeze([
  'birthdayBilbo', 'burglarBilbo', 'lobelia', 'gandalf', 'pippin', 'merry', 'oldManWillow', 'goldberry', 'tomBombadil', 'gildor', 'riderInBlack', 'butterbur', 'billFerny', 'strider',
  'ringwraiths', 'glorfindel', 'elrond', 'galadriel', 'theoden', 'saruman', 'denethor', 'sauron',
]);

/**
 * The books of the campaign: each draws `draw` opponents at random from its `pool`, then ends with its
 * `boss`. Books II to VI are still to come.
 */
export const CAMPAIGN_BOOKS = Object.freeze([
  Object.freeze({
    id: 'book1',
    name: 'Book I',
    pool: Object.freeze([
      'birthdayBilbo', 'burglarBilbo', 'lobelia', 'gandalf', 'pippin', 'merry', 'oldManWillow', 'goldberry', 'tomBombadil', 'gildor', 'riderInBlack', 'butterbur', 'billFerny', 'strider',
      'glorfindel',
    ]),
    draw: 4,
    boss: 'ringwraiths',
  }),
]);

/**
 * A book's road: `draw` of its pool at random (`random`: a function like Math.random), in road order, then its boss.
 * With `heroId`, the opponent who bears that hero's ring (Merry, for Merry) is left out: you never meet yourself.
 */
export function drawBookOpponents(book, random = Math.random, heroId = null) {
  const order = (id) => CAMPAIGN_OPPONENTS.indexOf(id);
  const own = HEROES[heroId]?.emblem;
  const pool = book.pool.filter((id) => OPPONENTS[id].emblem !== own);
  const picked = shuffle(pool, random).slice(0, book.draw).sort((a, b) => order(a) - order(b));
  return [...picked, book.boss];
}

export const CAMPAIGN_STATUS = Object.freeze({ PLAYING: 'playing', WON: 'won', LOST: 'lost' });

/** A new campaign for the hero `heroId`. */
export function createCampaign({ heroId = DEFAULT_HERO, seed = Math.floor(Math.random() * 2 ** 32), opponents = null } = {}) {
  if (!HEROES[heroId]) throw new Error(`Unknown hero: ${heroId}`);
  // The road: Book I's draw (the same for the same seed), unless one is given.
  opponents ??= drawBookOpponents(CAMPAIGN_BOOKS[0], seededRandom(seed), heroId);
  for (const id of opponents) if (!OPPONENTS[id]) throw new Error(`Unknown opponent: ${id}`);
  return {
    seed,
    heroId,
    /** The book being walked (an index in CAMPAIGN_BOOKS). */
    book: 0,
    opponents: [...opponents],
    /** The index in `opponents` of the one to face next. */
    stage: 0,
    lives: CAMPAIGN_RULES.lives,
    /** Rings of Power taken (emblem ids). */
    rings: [],
    /** Extra commons in each of your boosters, one for each time you chose that reward. */
    extraCommons: 0,
    /** A beaten opponent whose reward is on offer (their id), until one is chosen. */
    offer: null,
    /** The match being played, or null between matches. */
    match: null,
    /** Every match played: `{ opponentId, outcome }`. */
    history: [],
  };
}

/** Whether the campaign is going on, won or lost (`CAMPAIGN_STATUS`). */
export function campaignStatus(campaign) {
  if (campaign.lives <= 0) return CAMPAIGN_STATUS.LOST;
  if (campaign.stage >= campaign.opponents.length) return CAMPAIGN_STATUS.WON;
  return CAMPAIGN_STATUS.PLAYING;
}

/** The id of the next opponent, or null once the campaign is over. */
export function currentOpponent(campaign) {
  return campaignStatus(campaign) === CAMPAIGN_STATUS.PLAYING ? campaign.opponents[campaign.stage] : null;
}

/** The campaign with a match against the next opponent begun (`campaign.match`). */
export function startMatch(campaign) {
  const opponentId = currentOpponent(campaign);
  if (!opponentId) throw new Error('The campaign is over.');
  if (campaign.offer) throw new Error('Choose the reward on offer first.');
  if (campaign.match) return campaign;
  // A different booster for every match.
  const seed = (campaign.seed + (campaign.history.length + 1) * 104729) >>> 0;
  const match = createMatch({
    seed, heroId: campaign.heroId, opponentId, rings: campaign.rings, extraCommons: campaign.extraCommons ?? 0, campaign: true,
  });
  return { ...campaign, match };
}

/** The campaign with the current match updated (as it goes from round to round), so it can be saved. */
export function updateMatch(campaign, match) {
  if (!campaign.match || campaign.match.seed !== match.seed) return campaign;
  return { ...campaign, match };
}

/**
 * The campaign after its current match ended with `outcome` (`MATCH_OUTCOME`): a loss costs a life,
 * a win moves on to the next opponent and offers a reward (their ring, or an extra common). `match`, when given, must be the current
 * match (so a match is never counted twice).
 */
export function recordMatch(campaign, outcome, match = campaign.match) {
  if (!campaign.match || match?.seed !== campaign.match.seed) return campaign;
  if (!Object.values(MATCH_OUTCOME).includes(outcome)) throw new Error(`Unknown outcome: ${outcome}`);
  const opponentId = campaign.match.opponentId;
  const next = { ...campaign, match: null, history: [...campaign.history, { opponentId, outcome }] };
  if (outcome === MATCH_OUTCOME.LOST) return { ...next, lives: campaign.lives - 1 };
  if (outcome === MATCH_OUTCOME.TIE) return next;
  const won = { ...next, stage: campaign.stage + 1 };
  return campaignStatus(won) === CAMPAIGN_STATUS.PLAYING ? { ...won, offer: opponentId } : won;
}

/** Whether another ring can be taken. */
export const canTakeRing = (campaign) => campaign.rings.length < CAMPAIGN_RULES.maxRings;

/** The campaign with the ring on offer taken, as the reward. */
export function takeRing(campaign) {
  if (!campaign.offer) throw new Error('No reward is on offer.');
  if (!canTakeRing(campaign)) throw new Error(`You can bear only ${CAMPAIGN_RULES.maxRings} rings.`);
  const emblem = OPPONENTS[campaign.offer].emblem;
  return { ...campaign, rings: [...campaign.rings, emblem], offer: null };
}

/** The campaign with an extra common in every booster from now on taken as the reward (the ring left behind). */
export function takeCommon(campaign) {
  if (!campaign.offer) throw new Error('No reward is on offer.');
  return { ...campaign, extraCommons: (campaign.extraCommons ?? 0) + 1, offer: null };
}
