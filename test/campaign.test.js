import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCampaign, campaignStatus, currentOpponent, startMatch, updateMatch, recordMatch, takeRing, takeCommon, canTakeRing,
  CAMPAIGN_RULES, CAMPAIGN_OPPONENTS, CAMPAIGN_STATUS, CAMPAIGN_BOOKS, drawBookOpponents,
} from '../src/paigow/campaign.js';
import {
  roundSetup, setDecks, validDecks, playerLife, MATCH_OUTCOME, PAIGOW_RULES, PLAYER_ID,
} from '../src/paigow/paigow.js';
import { PAIGOW_OPPONENTS } from '../src/paigow/personas.js';
import { CARDS } from '../src/cards/cards.js';

const { WON, LOST, TIE } = MATCH_OUTCOME;

/** The campaign after its next match ends with `outcome`. */
const play = (campaign, outcome) => recordMatch(startMatch(campaign), outcome);

test('the road holds every opponent, in order, Sauron last', () => {
  assert.deepEqual(CAMPAIGN_OPPONENTS, [
    'birthdayBilbo', 'burglarBilbo', 'lobelia', 'gandalf', 'pippin', 'merry', 'oldManWillow', 'goldberry', 'tomBombadil', 'gildor', 'riderInBlack', 'butterbur', 'billFerny', 'strider',
    'ringwraiths', 'glorfindel', 'elrond', 'galadriel', 'theoden', 'saruman', 'denethor', 'sauron',
  ]);
  assert.deepEqual([...CAMPAIGN_OPPONENTS].sort(), Object.keys(PAIGOW_OPPONENTS).sort(), 'no opponent is left out');
});

test('a campaign walks Book I: four opponents drawn at random, in road order, then the Ringwraiths, with three lives', () => {
  const [book] = CAMPAIGN_BOOKS;
  assert.equal(book.boss, 'ringwraiths');
  assert.equal(book.draw, 4);
  assert.ok(!book.pool.includes(book.boss));
  assert.deepEqual([...book.pool].sort(), CAMPAIGN_OPPONENTS.slice(0, CAMPAIGN_OPPONENTS.indexOf('elrond')).filter((id) => id !== 'ringwraiths').sort());
  const roads = new Set();
  const met = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const { opponents, book: index } = createCampaign({ seed });
    assert.equal(index, 0);
    assert.equal(opponents.length, 5);
    assert.equal(opponents.at(-1), 'ringwraiths');
    const drawn = opponents.slice(0, 4);
    assert.equal(new Set(drawn).size, 4);
    assert.ok(drawn.every((id) => book.pool.includes(id)));
    const order = drawn.map((id) => CAMPAIGN_OPPONENTS.indexOf(id));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in road order');
    roads.add(opponents.join());
    drawn.forEach((id) => met.add(id));
  }
  assert.ok(roads.size > 50, 'roads differ from campaign to campaign');
  assert.equal(met.size, book.pool.length, 'any of the pool may be met');
  assert.deepEqual(createCampaign({ seed: 9 }).opponents, createCampaign({ seed: 9 }).opponents, 'the same seed, the same road');
  assert.deepEqual(drawBookOpponents(book, () => 0.5).length, 5);

  const campaign = createCampaign({ heroId: 'strider', seed: 1 });
  assert.equal(campaign.lives, 3);
  const first = campaign.opponents[0];
  assert.equal(currentOpponent(campaign), first);
  const started = startMatch(campaign);
  assert.equal(started.match.opponentId, first);
  assert.equal(started.match.heroId, 'strider');
  assert.equal(started.match.campaign, true);
  assert.equal(startMatch(started), started, 'a match in progress carries on');
  assert.throws(() => createCampaign({ heroId: 'gollum' }));
});

test('you never meet your own hero on the road: Merry, Pippin and Strider are left out of their own campaigns', () => {
  for (const heroId of ['merry', 'pippin', 'strider']) {
    const met = new Set();
    for (let seed = 1; seed <= 200; seed++) createCampaign({ heroId, seed }).opponents.forEach((id) => met.add(id));
    assert.ok(!met.has(heroId), heroId);
    for (const other of ['merry', 'pippin', 'strider']) if (other !== heroId) assert.ok(met.has(other), `${heroId} meets ${other}`);
  }
});

test('losing a match costs a life and the same opponent again; a tie costs nothing', () => {
  let campaign = createCampaign({ seed: 2 });
  const first = currentOpponent(campaign);
  campaign = play(campaign, LOST);
  assert.equal(campaign.lives, 2);
  assert.equal(currentOpponent(campaign), first);
  const seeds = new Set();
  campaign = play(campaign, TIE);
  assert.equal(campaign.lives, 2);
  assert.equal(currentOpponent(campaign), first);
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

test('a win moves on and offers the beaten opponent’s ring; beating the Ringwraiths wins the campaign', () => {
  const start = createCampaign({ seed: 3 });
  const [first, second] = start.opponents;
  let campaign = play(start, WON);
  assert.equal(currentOpponent(campaign), second);
  assert.equal(campaign.offer, first);
  assert.throws(() => startMatch(campaign), /reward/);
  campaign = takeRing(campaign);
  assert.deepEqual(campaign.rings, [PAIGOW_OPPONENTS[first].emblem]);
  assert.equal(campaign.offer, null);
  campaign = takeCommon(play(campaign, WON));
  assert.deepEqual(campaign.rings, [PAIGOW_OPPONENTS[first].emblem]);
  while (currentOpponent(campaign) !== 'ringwraiths') campaign = takeCommon(play(campaign, WON));
  campaign = play(campaign, WON);
  // No ring is offered after the boss: there's no one left to use it on.
  assert.equal(campaign.offer, null);
  assert.equal(campaignStatus(campaign), CAMPAIGN_STATUS.WON);
  assert.deepEqual(campaign.history.map((m) => m.opponentId), start.opponents);
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
