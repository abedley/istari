import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCampaign, campaignStatus, currentOpponent, startMatch, updateMatch, recordMatch, takeRing, takeCommon, canTakeRing,
  CAMPAIGN_RULES, CAMPAIGN_OPPONENTS, CAMPAIGN_STATUS,
} from '../src/paigow/campaign.js';
import {
  roundSetup, setDecks, validDecks, playerLife, MATCH_OUTCOME, PAIGOW_RULES, PLAYER_ID,
} from '../src/paigow/paigow.js';
import { PAIGOW_OPPONENTS } from '../src/paigow/personas.js';
import { CARDS } from '../src/cards/cards.js';

const { WON, LOST, TIE } = MATCH_OUTCOME;

/** The campaign after its next match ends with `outcome`. */
const play = (campaign, outcome) => recordMatch(startMatch(campaign), outcome);

test('a campaign faces every opponent in turn, Sauron last, with three lives', () => {
  assert.deepEqual(CAMPAIGN_OPPONENTS, [
    'birthdayBilbo', 'burglarBilbo', 'gandalf', 'oldManWillow', 'tomBombadil', 'gildor', 'riderInBlack',
    'elrond', 'galadriel', 'theoden', 'saruman', 'denethor', 'sauron',
  ]);
  assert.deepEqual([...CAMPAIGN_OPPONENTS].sort(), Object.keys(PAIGOW_OPPONENTS).sort(), 'no opponent is left out');
  const campaign = createCampaign({ heroId: 'strider', seed: 1 });
  assert.equal(campaign.lives, 3);
  assert.equal(currentOpponent(campaign), 'birthdayBilbo');
  const started = startMatch(campaign);
  assert.equal(started.match.opponentId, 'birthdayBilbo');
  assert.equal(started.match.heroId, 'strider');
  assert.equal(started.match.campaign, true);
  assert.equal(startMatch(started), started, 'a match in progress carries on');
  assert.throws(() => createCampaign({ heroId: 'gollum' }));
});

test('losing a match costs a life and the same opponent again; a tie costs nothing', () => {
  let campaign = createCampaign({ seed: 2 });
  campaign = play(campaign, LOST);
  assert.equal(campaign.lives, 2);
  assert.equal(currentOpponent(campaign), 'birthdayBilbo');
  const seeds = new Set();
  campaign = play(campaign, TIE);
  assert.equal(campaign.lives, 2);
  assert.equal(currentOpponent(campaign), 'birthdayBilbo');
  // Every match gets a booster of its own.
  for (let i = 0; i < 2; i++) seeds.add(startMatch(campaign).match.seed);
  seeds.add(startMatch(play(campaign, TIE)).match.seed);
  assert.equal(seeds.size, 2);
  campaign = play(play(campaign, LOST), LOST);
  assert.equal(campaign.lives, 0);
  assert.equal(campaignStatus(campaign), CAMPAIGN_STATUS.LOST);
  assert.equal(currentOpponent(campaign), null);
  assert.throws(() => startMatch(campaign));
});

test('a win moves on and offers the beaten opponent’s ring; beating them all wins the campaign', () => {
  let campaign = play(createCampaign({ seed: 3 }), WON);
  assert.equal(currentOpponent(campaign), 'burglarBilbo');
  assert.equal(campaign.offer, 'birthdayBilbo');
  assert.throws(() => startMatch(campaign), /reward/);
  campaign = takeRing(campaign);
  assert.deepEqual(campaign.rings, [PAIGOW_OPPONENTS.birthdayBilbo.emblem]);
  assert.equal(campaign.offer, null);
  campaign = takeCommon(play(campaign, WON));
  assert.deepEqual(campaign.rings, ['birthdayBilbo']);
  while (currentOpponent(campaign) !== CAMPAIGN_OPPONENTS.at(-1)) campaign = takeCommon(play(campaign, WON));
  campaign = play(campaign, WON);
  // No ring is offered after the last opponent: there's no one left to use it on.
  assert.equal(campaign.offer, null);
  assert.equal(campaignStatus(campaign), CAMPAIGN_STATUS.WON);
  assert.deepEqual(campaign.history.map((m) => m.opponentId), CAMPAIGN_OPPONENTS);
});

test('the other reward: a common more in every booster after, and the spare cards left out of the decks', () => {
  let campaign = createCampaign({ seed: 6 });
  assert.equal(startMatch(campaign).match.cards.length, PAIGOW_RULES.cardsDealt);
  campaign = takeCommon(play(campaign, WON));
  assert.equal(campaign.extraCommons, 1);
  assert.deepEqual(campaign.rings, []);
  assert.equal(campaign.offer, null);
  assert.throws(() => takeCommon(campaign), /reward/);
  campaign = takeCommon(play(campaign, WON));
  const { match } = startMatch(campaign);
  assert.equal(match.cards.length, PAIGOW_RULES.cardsDealt + 2);
  assert.equal(new Set(match.cards.slice(0, 12)).size, 12);
  assert.ok(match.cards.slice(0, 12).every((id) => CARDS[id].rarity === 'common'));
  // The CPU's booster is as ever.
  assert.equal(match.cpuDecks.flat().length, PAIGOW_RULES.cardsDealt);
  // Any 15 of the cards make three decks; the other two are left out.
  const decks = [0, 1, 2].map((i) => match.cards.slice(2 + i * 5, 2 + i * 5 + 5));
  assert.equal(validDecks(match, decks), true);
  assert.equal(setDecks(match, decks).decks.flat().length, 15);
  assert.equal(validDecks(match, [decks[0], decks[1], [...decks[2].slice(0, 4), decks[0][0]]]), false, 'a card used twice');
  // A campaign saved before this reward existed has none.
  const { extraCommons, ...old } = createCampaign({ seed: 7 });
  assert.equal(startMatch(old).match.cards.length, PAIGOW_RULES.cardsDealt);
});

test('a match is counted once', () => {
  const started = startMatch(createCampaign({ seed: 4 }));
  const once = recordMatch(started, LOST, started.match);
  assert.equal(recordMatch(once, LOST, started.match), once);
  assert.equal(updateMatch(once, started.match), once);
});

test('each ring taken costs a life at the start of every round, four rings at most', () => {
  let campaign = createCampaign({ seed: 5, opponents: ['birthdayBilbo', 'burglarBilbo', 'gandalf', 'sauron', 'saruman', 'elrond'] });
  for (let i = 0; i < 4; i++) campaign = takeRing(play(campaign, WON));
  assert.equal(campaign.rings.length, CAMPAIGN_RULES.maxRings);
  campaign = play(campaign, WON);
  assert.equal(canTakeRing(campaign), false);
  assert.throws(() => takeRing(campaign));
  campaign = takeCommon(campaign);

  const { match } = startMatch(campaign);
  const ready = updateMatch(startMatch(campaign), setDecks(match, [0, 1, 2].map((i) => match.cards.slice(i * 5, i * 5 + 5)))).match;
  const { game } = roundSetup(ready);
  assert.deepEqual(game.emblems[PLAYER_ID], ['frodo', 'birthdayBilbo', 'burglarBilbo', 'gandalf', 'sauron']);
  const life = playerLife(ready);
  assert.deepEqual(life, { first: PAIGOW_RULES.startingLife - 4, second: PAIGOW_RULES.secondPlayerLife - 4 });
  assert.ok([life.first, life.second].includes(game.startingLife[PLAYER_ID]));
});
