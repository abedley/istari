import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/Game.js';
import { BasicAIController } from '../src/ai/BasicAIController.js';
import { playout } from '../src/ai/simulate.js';
import {
  createMatch, setDecks, recordRound, roundSetup, outcome, decidingRound, PLAYER_ID, CPU_ID, ROUND_RESULT, MATCH_OUTCOME,
} from '../src/match/match.js';
import { createCampaign } from '../src/match/campaign.js';
import { HEROES, OPPONENTS } from '../src/match/personas.js';
import { CARDS } from '../src/cards/cards.js';
import { RoundStats, matchStats, emptyStats } from '../src/match/roundStats.js';
import {
  emptyBook, readBook, recordBooster, recordRoundPlayed, recordMatchEnd, recordRing, recordCampaignBegun, recordCampaignProgress,
  catchUp, recap, knows,
} from '../src/match/book.js';
import {
  STARTING_HERO, STARTING_HEROES, heroToUnlock, heroOpen, heroNeeds, portraitOpen, unlocksOf,
} from '../src/match/unlocks.js';

const ready = (options = {}) => {
  const match = createMatch({ seed: 9, heroId: 'frodo', opponentId: 'gandalf', ...options });
  return setDecks(match, [match.cards.slice(0, 5), match.cards.slice(5, 10), match.cards.slice(10, 15)]);
};

test('RoundStats: a real round\'s damage adds up to the life lost, and its deaths to the creatures gone', () => {
  for (const seed of [9, 21, 44]) {
    const setup = roundSetup(ready({ seed }));
    const game = new Game(setup.game);
    const stats = new RoundStats({ me: PLAYER_ID });
    let events = [];
    const lost = { [PLAYER_ID]: 0, [CPU_ID]: 0 };
    game.onAny((name, payload) => {
      if (name === 'state') { stats.observe(events, payload); events = []; return; }
      events.push({ name, payload });
      if (name === 'combatDamageDealt') for (const d of payload.damage) if (d.targetPlayerId) lost[d.targetPlayerId] += d.amount;
      if (name === 'damageDealt' && payload.targetPlayerId) lost[payload.targetPlayerId] += payload.amount;
    });
    game.start();
    const ais = { [PLAYER_ID]: new BasicAIController({ game: null, playerId: PLAYER_ID }), [CPU_ID]: new BasicAIController({ game: null, playerId: CPU_ID }) };
    const end = playout(game, { [PLAYER_ID]: (s) => ais[PLAYER_ID].chooseAction(s), [CPU_ID]: (s) => ais[CPU_ID].chooseAction(s) });
    stats.observe(events, game.getState());
    const got = stats.stats;
    assert.equal(got.dealt, lost[CPU_ID], `seed ${seed}: dealt`);
    assert.equal(got.taken, lost[PLAYER_ID], `seed ${seed}: taken`);
    assert.equal(got.turns, end.turn);
    assert.ok(got.dealt + got.taken > 0, `seed ${seed}: somebody was hit`);
    if (got.dealt > 0) {
      assert.ok(got.blow && got.blow.amount > 0 && got.blow.amount <= got.dealt + 40, JSON.stringify(got.blow));
      assert.ok(Object.values(CARDS).some((c) => c.name === got.blow.name) || /Army|Orc|Token|Halfling|Treefolk|Spirit|Soldier|Food/.test(got.blow.name), got.blow.name);
    }
    assert.ok(got.felled >= 0 && got.lost >= 0 && got.spells >= 0);
  }
});

test('RoundStats counts each death once, and only your own blows', () => {
  const stats = new RoundStats({ me: 'me' });
  const board = [{ id: 'a', name: 'Bear', controllerId: 'me', types: ['Creature'] }, { id: 'b', name: 'Orc', controllerId: 'cpu', types: ['Creature'] }];
  stats.observe([], { turn: 1, battlefield: board, stack: [{ controllerId: 'me', card: { id: 's', name: 'Shock' } }] });
  stats.observe([
    { name: 'combatDamageDealt', payload: { damage: [{ sourceId: 'a', targetPlayerId: 'cpu', amount: 2 }, { sourceId: 'b', targetPlayerId: 'me', amount: 5 }, { sourceId: 'a', targetCardId: 'b', amount: 3 }] } },
    { name: 'damageDealt', payload: { sourceId: 's', targetPlayerId: 'cpu', amount: 4 } },
    { name: 'permanentDestroyed', payload: { cardId: 'b' } }, { name: 'creatureDied', payload: { cardId: 'b' } },
    { name: 'spellCast', payload: { playerId: 'me' } }, { name: 'spellCast', payload: { playerId: 'cpu' } },
  ], { turn: 3, battlefield: [board[0]], stack: [] });
  assert.deepEqual(stats.stats, { dealt: 6, taken: 5, felled: 1, lost: 0, spells: 1, turns: 3, blow: { name: 'Shock', amount: 4 } });
});

test('a round keeps its stats, a match adds them up, and the deciding round is found', () => {
  let match = ready();
  assert.equal(decidingRound(match), null);
  match = recordRound(match, ROUND_RESULT.LOST, { ...emptyStats(), dealt: 3, blow: { name: 'Bear', amount: 2 } });
  match = recordRound(match, ROUND_RESULT.WON);
  match = recordRound(match, ROUND_RESULT.WON, { ...emptyStats(), dealt: 8, felled: 2, blow: { name: 'Oliphaunt', amount: 6 } });
  assert.equal(outcome(match), MATCH_OUTCOME.WON);
  assert.equal(decidingRound(match), 2);
  assert.deepEqual(match.rounds[1], { result: ROUND_RESULT.WON });
  const total = matchStats(match);
  assert.equal(total.dealt, 11);
  assert.equal(total.felled, 2);
  assert.deepEqual(total.blow, { name: 'Oliphaunt', amount: 6 });
  const swept = recordRound(recordRound(ready(), ROUND_RESULT.WON), ROUND_RESULT.WON);
  assert.equal(decidingRound(swept), 1);
  const tied = [ROUND_RESULT.DRAWN, ROUND_RESULT.DRAWN, ROUND_RESULT.DRAWN].reduce((m, r) => recordRound(m, r), ready());
  assert.equal(decidingRound(tied), 2);
});

test('the Red Book counts a match once, however often it is recorded', () => {
  let match = ready();
  let book = emptyBook();
  for (let i = 0; i < 3; i += 1) book = recordBooster(book, match);
  assert.equal(Object.values(book.cards).reduce((a, b) => a + b, 0), 15);
  assert.equal(book.fresh.cards.length, new Set(match.cards).size);
  match = recordRound(match, ROUND_RESULT.WON, { ...emptyStats(), dealt: 7, felled: 1, blow: { name: 'Bear', amount: 4 } });
  for (let i = 0; i < 2; i += 1) book = recordRoundPlayed(book, match, 0);
  assert.equal(book.totals.rounds, 1);
  assert.equal(book.totals.damage, 7);
  assert.equal(book.mostDamage, 7);
  assert.deepEqual(book.blow, { name: 'Bear', amount: 4 });
  assert.ok(match.cpuDecks[0].every((id) => knows(book, id)));
  assert.equal(recordRoundPlayed(book, match, 1), book, 'a round not played changes nothing');
  match = recordRound(match, ROUND_RESULT.WON);
  book = recordRoundPlayed(book, match, 1);
  for (let i = 0; i < 3; i += 1) book = recordMatchEnd(book, match, MATCH_OUTCOME.WON, { unlocksOf });
  assert.deepEqual(book.people.gandalf, { won: 1, lost: 0, tied: 0 });
  assert.equal(book.totals.matches, 1);
  const told = recap(book, match);
  assert.equal(told.firstWin, true);
  assert.equal(told.stats.dealt, 7);
  assert.ok(told.newCards >= new Set(match.cards).size);
  assert.deepEqual(told.unlocks, []);
  // A second match against the same opponent: not a first win, and its cards are no longer new.
  let again = ready({ seed: 10 });
  book = recordBooster(book, again);
  again = recordRound(recordRound(again, ROUND_RESULT.WON), ROUND_RESULT.WON);
  book = recordMatchEnd(book, again, MATCH_OUTCOME.WON, { unlocksOf });
  assert.equal(recap(book, again).firstWin, false);
  assert.equal(book.people.gandalf.won, 2);
  // It survives storage, and a book from another version isn't read.
  assert.deepEqual(readBook(JSON.parse(JSON.stringify(book))), book);
  assert.equal(readBook({ version: 0 }), null);
  assert.equal(readBook(null), null);
});

test('heroes and portraits open on the road', () => {
  let book = emptyBook();
  // Frodo, Samwise and Strider at first; a match won opens nobody.
  assert.deepEqual(Object.keys(HEROES).filter((id) => heroOpen(book, id)).sort(), [...STARTING_HEROES].sort());
  assert.ok(STARTING_HEROES.includes(STARTING_HERO));
  for (const id of STARTING_HEROES) assert.equal(heroNeeds(id), null);
  assert.match(heroNeeds('pippin'), /Win a campaign/);
  assert.deepEqual(unlocksOf(book), []);
  for (const id of Object.keys(OPPONENTS)) assert.ok(HEROES[id], `${id} can be played`);
  let match = ready({ opponentId: 'birthdayBilbo' });
  match = recordRound(recordRound(match, ROUND_RESULT.WON), ROUND_RESULT.WON);
  book = recordMatchEnd(book, match, MATCH_OUTCOME.WON, { unlocksOf });
  assert.equal(heroOpen(book, 'birthdayBilbo'), false);
  assert.deepEqual(recap(book, match).unlocks, []);
  // A hero already set out with stays open.
  assert.equal(heroOpen({ ...book, heroes: { pippin: { begun: 1, won: 0, furthest: 0 } } }, 'pippin'), true);
  // A campaign won with Frodo opens his second portrait; Radagast has none to open.
  assert.equal(portraitOpen(book, 'frodo'), false);
  const begun = createCampaign({ heroId: 'frodo', seed: 4 });
  const campaign = { ...begun, stage: begun.opponents.length };
  const won = (b) => recordCampaignProgress(b, campaign, { won: true, unlocksOf, pickUnlock: heroToUnlock });
  book = won(won(book));
  assert.deepEqual(book.heroes.frodo, { begun: 1, won: 1, furthest: begun.opponents.length });
  assert.equal(portraitOpen(book, 'frodo'), true);
  assert.ok(book.fresh.unlocks.includes('A new portrait for Frodo'));
  // It opens one hero, once: here, with no matches in its history, any hero still closed.
  assert.equal(book.unlocked.length, 1);
  assert.ok(HEROES[book.unlocked[0]] && !STARTING_HEROES.includes(book.unlocked[0]));
  assert.ok(book.fresh.unlocks.includes(HEROES[book.unlocked[0]].name));
  assert.equal(portraitOpen({ ...book, heroes: { radagast: { begun: 1, won: 1, furthest: 13 } } }, 'radagast'), false);
  for (const [id, hero] of Object.entries(HEROES)) {
    if (hero.altPortrait) {
      assert.match(hero.altPortrait.art, /^https:\/\/cards\.scryfall\.io\/art_crop\//);
      assert.ok(Object.values(CARDS).some((c) => c.name === hero.altPortrait.card), `${id}: ${hero.altPortrait.card}`);
    }
  }
});

test('a campaign from before the book is caught up with, once', () => {
  const campaign = {
    ...createCampaign({ heroId: 'samwise', seed: 77 }), stage: 2, rings: ['birthdayBilbo'],
    history: [{ opponentId: 'birthdayBilbo', outcome: 'won' }, { opponentId: 'burglarBilbo', outcome: 'lost' }, { opponentId: 'burglarBilbo', outcome: 'won' }],
  };
  let book = catchUp(catchUp(emptyBook(), campaign), campaign);
  assert.deepEqual(book.people.birthdayBilbo, { won: 1, lost: 0, tied: 0 });
  assert.deepEqual(book.people.burglarBilbo, { won: 1, lost: 1, tied: 0 });
  assert.equal(book.totals.matches, 3);
  assert.deepEqual(book.rings, ['birthdayBilbo']);
  assert.deepEqual(book.heroes.samwise, { begun: 1, won: 0, furthest: 2 });
  assert.equal(heroOpen(book, 'samwise'), true);
  assert.equal(heroOpen(book, 'pippin'), false);
  assert.equal(catchUp(book, null), book);
  book = recordRing(recordRing(book, 'gandalf'), 'gandalf');
  assert.deepEqual(book.rings, ['birthdayBilbo', 'gandalf']);
  assert.equal(recordCampaignBegun(book, campaign), book, 'already begun');
});

test('a campaign won opens one of the opponents beaten on its road, at random, or else any hero', () => {
  const won = (opponentId) => ({ opponentId, outcome: 'won' });
  const campaign = {
    ...createCampaign({ heroId: 'frodo', seed: 12 }),
    history: [won('gandalf'), { opponentId: 'lobelia', outcome: 'lost' }, won('lobelia'), won('strider'), won('ringwraiths')],
  };
  const book = emptyBook();
  const picked = heroToUnlock(book, campaign);
  // Strider is open from the start, so never picked.
  assert.ok(['gandalf', 'lobelia', 'ringwraiths'].includes(picked));
  assert.equal(heroToUnlock(book, campaign), picked, 'the same for the same campaign');
  // Over many campaigns, each beaten opponent comes up.
  const seen = new Set();
  for (let seed = 1; seed <= 100; seed += 1) seen.add(heroToUnlock(book, { ...campaign, seed }));
  assert.deepEqual([...seen].sort(), ['gandalf', 'lobelia', 'ringwraiths']);
  // Those already open are passed over.
  assert.equal(heroToUnlock({ ...book, unlocked: ['gandalf', 'lobelia'] }, campaign), 'ringwraiths');
  // All of them open: any hero still closed, beaten or not.
  const all = { ...book, unlocked: ['gandalf', 'lobelia', 'ringwraiths'] };
  const other = heroToUnlock(all, campaign);
  assert.ok(HEROES[other] && !heroOpen(all, other));
  // Every hero open: nobody.
  assert.equal(heroToUnlock({ ...book, unlocked: Object.keys(HEROES) }, campaign), null);
  // Recorded in the book, and told in the recap.
  const after = recordCampaignProgress(book, { ...campaign, stage: campaign.opponents.length }, { won: true, unlocksOf, pickUnlock: heroToUnlock });
  assert.deepEqual(after.unlocked, [picked]);
  assert.ok(after.fresh.unlocks.includes(HEROES[picked].name));
});
