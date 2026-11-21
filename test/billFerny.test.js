import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION, PHASE, TOKEN, EFFECT, KEYWORD } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { OPPONENTS, opponentSetup } from '../src/match/personas.js';
import { createMatch, placeInDecks, MATCH_RULES } from '../src/match/match.js';
import { CAMPAIGN_OPPONENTS } from '../src/match/campaign.js';
import { placeOf } from '../src/match/places.js';
import { TOKEN_PRESENTATION } from '../src/cards/tokenArt.js';
import {
  setup, state, ok, cast, advanceTo, named,
} from './helpers/ltrGame.js';

const HOARD = { id: 'hoard', name: 'Hoard', manaCost: {}, types: ['Sorcery'], effects: [{ type: EFFECT.CREATE_TOKEN, count: 2, token: TOKEN.TREASURE }] };

const fernyGame = () => setup({ p1: ['hoard'], extra: { hoard: HOARD }, options: { emblems: { p1: ['billFerny'], p2: [] } } });

const powers = (game) => state(game).validActions.filter((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-1');
const resolve = (game) => {
  for (let i = 0; i < 10 && state(game).stack.length; i++) ok(game, { type: ACTION.PASS_PRIORITY, playerId: state(game).priorityPlayerId });
};

test('Bill Ferny is an opponent whose power sacrifices a Treasure for a Nazgûl', () => {
  assert.equal(OPPONENTS.billFerny.emblem, 'billFerny');
  assert.ok(CAMPAIGN_OPPONENTS.includes('billFerny'));
  assert.equal(placeOf('billFerny').card, 'Bill Ferny, Bree Swindler');
  assert.equal(EMBLEMS.billFerny.abilities[0].timing, 'sorcery');
  assert.equal(EMBLEMS.billFerny.activationsPerTurn, undefined, 'any number of times a turn');

  const { game } = fernyGame();
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  assert.equal(powers(game).length, 0, 'no Treasure, no power');
  cast(game, 'p1', 'hoard');
  resolve(game);
  const [action] = powers(game);
  assert.ok(action, 'a Treasure to sacrifice');
  ok(game, action);
  resolve(game);
  assert.equal(named(game, 'Treasure').length, 1, 'one Treasure sacrificed');
  const [nazgul] = named(game, 'Nazgûl');
  assert.ok(nazgul?.token, 'a Nazgûl token');
  assert.ok(nazgul.keywords.includes(KEYWORD.DEATHTOUCH));
  assert.deepEqual(nazgul.subtypes, ['Wraith', 'Knight']);
  // It entered, so the Ring tempted him, and so it got a +1/+1 counter, as the card's would.
  assert.equal(state(game).players.find((p) => p.id === 'p1').ring.level, 1);
  assert.deepEqual([nazgul.power, nazgul.toughness], [2, 3]);
  // Any number of times: the other Treasure makes a second.
  ok(game, powers(game)[0]);
  resolve(game);
  assert.equal(named(game, 'Treasure').length, 0);
  assert.equal(named(game, 'Nazgûl').length, 2);
  assert.equal(powers(game).length, 0, 'no Treasure left');
  assert.ok(Object.keys(TOKEN_PRESENTATION).some((id) => id.startsWith('token:Nazgûl:1/2:black:deathtouch')), 'the token has art');
});

test('Bill Ferny’s packs always hold two of himself and two Bill the Ponys', () => {
  assert.deepEqual(opponentSetup('billFerny').pack, ['billFernyBreeSwindler', 'billFernyBreeSwindler', 'billThePony', 'billThePony']);
  for (let seed = 1; seed <= 20; seed += 1) {
    const cards = createMatch({ seed, opponentId: 'billFerny' }).cpuDecks.flat();
    assert.equal(cards.filter((id) => id === 'billFernyBreeSwindler').length, 2, `seed ${seed}`);
    assert.equal(cards.filter((id) => id === 'billThePony').length, 2, `seed ${seed}`);
    assert.equal(cards.length, MATCH_RULES.cardsDealt);
  }
});

test('Bill Ferny’s first deck and his second each hold one of himself and one Bill the Pony', () => {
  assert.deepEqual(opponentSetup('billFerny').decks, [['billFernyBreeSwindler', 'billThePony'], ['billFernyBreeSwindler', 'billThePony']]);
  const count = (deck, id) => deck.filter((card) => card === id).length;
  for (let seed = 1; seed <= 40; seed += 1) {
    const { cpuDecks } = createMatch({ seed, opponentId: 'billFerny' });
    for (const deck of cpuDecks.slice(0, 2)) {
      assert.equal(count(deck, 'billFernyBreeSwindler'), 1, `seed ${seed}`);
      assert.equal(count(deck, 'billThePony'), 1, `seed ${seed}`);
    }
    assert.equal(count(cpuDecks[2], 'billFernyBreeSwindler') + count(cpuDecks[2], 'billThePony'), 0, `seed ${seed}`);
    assert.ok(cpuDecks.every((deck) => deck.length === MATCH_RULES.deckSize));
  }
});

test('placeInDecks swaps a card into its deck for that deck\'s weakest spare card, and leaves a deck alone when it holds it', () => {
  // Birthday Escape (3) is the weakest of the first deck; Bag End Porter (10) is its strongest.
  const decks = [['bagEndPorter', 'birthdayEscape', 'arwensGift'], ['bombadilsSong', 'billThePony', 'brandywineFarmer']];
  assert.deepEqual(placeInDecks(decks, []), decks);
  assert.deepEqual(placeInDecks(decks, [['billThePony']]), [['bagEndPorter', 'billThePony', 'arwensGift'], ['bombadilsSong', 'birthdayEscape', 'brandywineFarmer']]);
  assert.deepEqual(placeInDecks(decks, [[], ['billThePony']]), decks, 'already there');
  assert.throws(() => placeInDecks(decks, [['glorfindelDauntlessRescuer']]), /No glorfindelDauntlessRescuer/);
});
