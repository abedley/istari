import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine/Game.js';
import { BasicAIController } from '../src/ai/BasicAIController.js';
import { playout } from '../src/ai/simulate.js';
import {
  createMatch, setDecks, recordRound, roundSetup, outcome, decidingRound, PLAYER_ID, CPU_ID, ROUND_RESULT, MATCH_OUTCOME,
} from '../src/paigow/paigow.js';
import { createCampaign, CAMPAIGN_OPPONENTS } from '../src/paigow/campaign.js';
import { PAIGOW_HEROES, PAIGOW_OPPONENTS } from '../src/paigow/personas.js';
import { CARDS } from '../src/cards/cards.js';
import { RoundStats, matchStats, emptyStats } from '../src/paigow/roundStats.js';
import {
  emptyBook, readBook, recordBooster, recordRoundPlayed, recordMatchEnd, recordRing, recordCampaignBegun, recordCampaignProgress,
  catchUp, recap, dayBefore, knows,
} from '../src/paigow/book.js';
import {
  HERO_UNLOCKS, heroOpen, heroNeeds, portraitOpen, unlocksOf,
} from '../src/paigow/unlocks.js';
import {
  dayOf, daySeed, dailyMatch, dayLabel, shareText,
} from '../src/paigow/daily.js';

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
  assert.deepEqual(Object.keys(HERO_UNLOCKS).sort(), Object.keys(PAIGOW_HEROES).sort());
  for (const beat of Object.values(HERO_UNLOCKS)) if (beat) assert.ok(CAMPAIGN_OPPONENTS.includes(beat), beat);
  assert.deepEqual(Object.keys(PAIGOW_HEROES).filter((id) => heroOpen(book, id)).sort(), ['frodo', 'legolas', 'merry', 'samwise']);
  assert.equal(heroNeeds('frodo'), null);
  assert.match(heroNeeds('pippin'), /Beat Birthday Bilbo/);
  assert.deepEqual(unlocksOf(book), []);
  // Beating Birthday Bilbo opens Pippin, and the match's recap says so.
  let match = ready({ opponentId: 'birthdayBilbo' });
  match = recordRound(recordRound(match, ROUND_RESULT.WON), ROUND_RESULT.WON);
  const lost = recordMatchEnd(book, { ...match, seed: 1 }, MATCH_OUTCOME.LOST, { unlocksOf });
  assert.equal(heroOpen(lost, 'pippin'), false);
  book = recordMatchEnd(book, match, MATCH_OUTCOME.WON, { unlocksOf });
  assert.equal(heroOpen(book, 'pippin'), true);
  assert.deepEqual(recap(book, match).unlocks, ['Pippin']);
  // A campaign won with Frodo opens his second portrait; Radagast has none to open.
  assert.equal(portraitOpen(book, 'frodo'), false);
  const begun = createCampaign({ heroId: 'frodo', seed: 4 });
  const campaign = { ...begun, stage: begun.opponents.length };
  book = recordCampaignProgress(recordCampaignProgress(book, campaign, { won: true, unlocksOf }), campaign, { won: true, unlocksOf });
  assert.deepEqual(book.heroes.frodo, { begun: 1, won: 1, furthest: begun.opponents.length });
  assert.equal(portraitOpen(book, 'frodo'), true);
  assert.ok(book.fresh.unlocks.includes('A new portrait for Frodo'));
  assert.equal(portraitOpen({ ...book, heroes: { radagast: { begun: 1, won: 1, furthest: 13 } } }, 'radagast'), false);
  for (const [id, hero] of Object.entries(PAIGOW_HEROES)) {
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
  assert.equal(heroOpen(book, 'pippin'), true);
  assert.equal(catchUp(book, null), book);
  book = recordRing(recordRing(book, 'gandalf'), 'gandalf');
  assert.deepEqual(book.rings, ['birthdayBilbo', 'gandalf']);
  assert.equal(recordCampaignBegun(book, campaign), book, 'already begun');
});

test('today\'s road: the same match for the same day, another the next, and a streak of days', () => {
  assert.equal(dayOf(new Date(2026, 10, 14, 23, 59)), '2026-11-14');
  assert.equal(dayOf(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dayLabel('2026-11-14'), '14 Nov');
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2026-01-01'), '2025-12-31');
  const a = dailyMatch('2026-11-14');
  assert.deepEqual(dailyMatch('2026-11-14'), a);
  assert.equal(a.daily, '2026-11-14');
  assert.ok(PAIGOW_HEROES[a.heroId] && PAIGOW_OPPONENTS[a.opponentId]);
  assert.equal(a.cards.length, 15);
  assert.ok(!a.campaign);
  const b = dailyMatch('2026-11-15');
  assert.notEqual(daySeed('2026-11-14'), daySeed('2026-11-15'));
  assert.notDeepEqual(b.cards, a.cards);
  // Over a month, more than one hero and several opponents turn up.
  const month = Array.from({ length: 30 }, (_, i) => dailyMatch(`2026-11-${String(i + 1).padStart(2, '0')}`));
  assert.ok(new Set(month.map((m) => m.heroId)).size >= 4);
  assert.ok(new Set(month.map((m) => m.opponentId)).size >= 8);
  // Played, and shared.
  let match = setDecks(a, [a.cards.slice(0, 5), a.cards.slice(5, 10), a.cards.slice(10, 15)]);
  match = [ROUND_RESULT.WON, ROUND_RESULT.LOST, ROUND_RESULT.WON].reduce((m, r) => recordRound(m, r), match);
  const text = shareText(match);
  assert.match(text, /^Istari · 14 Nov · .+ at .+ · ✅❌✅ 2–1$/);
  assert.ok(text.includes(PAIGOW_OPPONENTS[a.opponentId].name));
  // The streak: two days running, then a day missed.
  const day = (d, seed) => ({ ...match, daily: d, seed });
  let book = recordMatchEnd(emptyBook(), day('2026-11-14', 1), MATCH_OUTCOME.WON);
  book = recordMatchEnd(book, day('2026-11-14', 1), MATCH_OUTCOME.WON);
  book = recordMatchEnd(book, day('2026-11-15', 2), MATCH_OUTCOME.LOST);
  assert.deepEqual(book.daily, { played: 2, won: 1, streak: 2, best: 2, last: '2026-11-15' });
  book = recordMatchEnd(book, day('2026-11-17', 3), MATCH_OUTCOME.WON);
  assert.deepEqual(book.daily, { played: 3, won: 2, streak: 1, best: 2, last: '2026-11-17' });
});
