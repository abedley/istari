/**
 * The campaign: Pai Gow matches (src/paigow/paigow.js) against a set line of opponents, one after
 * another, with three lives.
 *
 * Losing a match costs a life and you face the same opponent again (with a new booster); a tied match
 * costs nothing, and you face them again too. Beat an opponent and you choose a reward: take their Ring
 * of Power (their planeswalker power, an emblem in src/cards/emblems.js) to use alongside your hero's, at
 * the cost of starting every round with one less life (see playerLife in paigow.js), four rings at most;
 * or add a common to every booster you open after (so you have more cards than your three decks of five
 * need, and pick which to leave out).
 * Beat them all and the campaign is won; lose your last life and it's lost.
 *
 * Everything here is pure: a campaign is a plain object (it can be saved as JSON), and each function
 * returns a new one.
 */
import { createMatch, MATCH_OUTCOME } from './paigow.js';
import { PAIGOW_HEROES, PAIGOW_OPPONENTS, DEFAULT_HERO } from './personas.js';

export const CAMPAIGN_RULES = Object.freeze({
  lives: 3,
  /** Rings of Power taken from beaten opponents, besides your hero's own. */
  maxRings: 4,
});

/**
 * The opponents, in the order they're faced (ids in PAIGOW_OPPONENTS). Later this may be drawn from
 * buckets of opponents instead.
 */
export const CAMPAIGN_OPPONENTS = Object.freeze(['birthdayBilbo', 'burglarBilbo', 'gandalf', 'oldManWillow', 'gildor', 'riderInBlack']);

export const CAMPAIGN_STATUS = Object.freeze({ PLAYING: 'playing', WON: 'won', LOST: 'lost' });

/** A new campaign for the hero `heroId`. */
export function createCampaign({ heroId = DEFAULT_HERO, seed = Math.floor(Math.random() * 2 ** 32), opponents = CAMPAIGN_OPPONENTS } = {}) {
  if (!PAIGOW_HEROES[heroId]) throw new Error(`Unknown hero: ${heroId}`);
  for (const id of opponents) if (!PAIGOW_OPPONENTS[id]) throw new Error(`Unknown opponent: ${id}`);
  return {
    seed,
    heroId,
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
  const emblem = PAIGOW_OPPONENTS[campaign.offer].emblem;
  return { ...campaign, rings: [...campaign.rings, emblem], offer: null };
}

/** The campaign with an extra common in every booster from now on taken as the reward (the ring left behind). */
export function takeCommon(campaign) {
  if (!campaign.offer) throw new Error('No reward is on offer.');
  return { ...campaign, extraCommons: (campaign.extraCommons ?? 0) + 1, offer: null };
}
