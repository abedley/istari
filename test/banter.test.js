import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, PAIGOW_OPPONENTS } from '../src/index.js';
import { REAL_CARDS, REAL_DECKS } from './fixtures/realCards.js';
import {
  BANTER, BANTER_KINDS, SwingWatch, outlook, pickLine, banterProblems,
} from '../src/ai/banter.js';

test('every opponent has its own lines for every kind of banter', () => {
  const seen = new Map();
  for (const [id, opponent] of Object.entries(PAIGOW_OPPONENTS)) {
    assert.deepEqual(banterProblems(id, opponent.banter), []);
    for (const kind of BANTER_KINDS) {
      assert.ok(opponent.banter?.[kind]?.length >= 2, `${id}: ${kind}`);
      for (const line of opponent.banter[kind]) {
        assert.ok(!seen.has(line), `"${line}" is said by both ${seen.get(line)} and ${id}`);
        seen.set(line, id);
      }
    }
  }
});

test('banterProblems catches malformed banter', () => {
  const problems = banterProblems('raider', { start: [], gloat: ['Ha!'] });
  assert.ok(problems.some((p) => p.includes('"start" needs lines')), problems.join('; '));
  assert.ok(problems.some((p) => p.includes('unknown banter kind "gloat"')), problems.join('; '));
});

test('SwingWatch reports a swing only after a confident mood flips', () => {
  const watch = new SwingWatch({ threshold: 10, window: 2 });
  // Even, then winning: no swing yet, only a mood.
  assert.deepEqual([0, 5, 20, 20].map((s) => watch.observe(s)), [null, null, null, null]);
  assert.equal(watch.mood, 'winning');
  // Slipping back to even is no swing; losing is a collapse, once.
  assert.deepEqual([0, -5, -20, -25].map((s) => watch.observe(s)), [null, null, BANTER.COLLAPSE, null]);
  assert.equal(watch.mood, 'losing');
  // And back again: a comeback.
  assert.deepEqual([30, 30].map((s) => watch.observe(s)), [null, BANTER.COMEBACK]);
});

test('SwingWatch averages out the bounce between turns', () => {
  const watch = new SwingWatch({ threshold: 10, window: 2 });
  // Alternating +12/-12 (whose turn it is) averages to even: never a mood.
  for (let i = 0; i < 10; i++) assert.equal(watch.observe(i % 2 ? 12 : -12), null);
  assert.equal(watch.mood, null);
});

test('pickLine says each line once before repeating, and nothing without lines', () => {
  const banter = { start: ['a', 'b', 'c'] };
  const used = new Set();
  const said = [0, 1, 2].map(() => pickLine(banter, BANTER.START, { used, random: () => 0 }));
  assert.deepEqual(said.sort(), ['a', 'b', 'c']);
  assert.ok(['a', 'b', 'c'].includes(pickLine(banter, BANTER.START, { used })));
  assert.equal(pickLine(banter, BANTER.WIN), null);
  assert.equal(pickLine(null, BANTER.START), null);
});

test('outlook is even at the start, and doesn\'t look at the other hand', () => {
  const game = new Game({ players: [{ id: 'p1' }, { id: 'p2' }], seed: 7, cards: REAL_CARDS, decks: { p1: REAL_DECKS.redBurn, p2: REAL_DECKS.blueSkies } });
  game.start();
  const state = game.getState();
  assert.ok(Math.abs(outlook(state, 'p2')) < 15);
  // Swapping p1's hand for all lands doesn't change p2's outlook.
  const lands = state.players[0].hand.map((c) => ({ ...c, cardId: 'mountain', types: ['land'] }));
  const swapped = { ...state, players: [{ ...state.players[0], hand: lands }, state.players[1]] };
  assert.equal(outlook(swapped, 'p2'), outlook(state, 'p2'));
});

test('MomentWatch: a death or a taken ring gets a word, but not twice in two turns', async () => {
  const { MomentWatch } = await import('../src/ai/banter.js');
  const creature = (id, controllerId, more = {}) => ({ id, controllerId, types: ['Creature'], power: 2, toughness: 2, ...more });
  const players = [
    { id: 'me', emblems: [{ id: 'me-emblem-1', emblemId: 'frodo' }, { id: 'me-emblem-2', emblemId: 'gandalf' }] },
    { id: 'cpu', emblems: [{ id: 'cpu-emblem-1', emblemId: 'sauron' }] },
  ];
  const board = [creature('a', 'me'), creature('b', 'cpu'), creature('c', 'cpu', { power: 4, toughness: 4 }),
    creature('d', 'cpu', { supertypes: ['Legendary'] }), creature('t', 'me', { token: true }), { id: 'x', controllerId: 'me', types: ['Artifact'] }];
  const state = (turn, battlefield = board) => ({ turn, players, battlefield });
  const died = (cardId, name = 'creatureDied') => ({ name, payload: { cardId } });
  const watch = () => {
    const w = new MomentWatch({ cpu: 'cpu', ownEmblem: 'frodo' });
    assert.equal(w.observe([], state(1)), null);
    return w;
  };
  // One of yours dies: a gloat. A token, or an artifact, doesn't count.
  assert.equal(watch().observe([died('a')], state(1)), BANTER.KILL);
  assert.equal(watch().observe([died('a', 'permanentDestroyed')], state(1)), BANTER.KILL);
  assert.equal(watch().observe([died('t'), died('x', 'permanentDestroyed')], state(1)), null);
  // One of its own: only when it mattered (big, or a legend).
  assert.equal(watch().observe([died('b')], state(1)), null);
  assert.equal(watch().observe([died('c')], state(1)), BANTER.LOSS);
  assert.equal(watch().observe([died('d')], state(1)), BANTER.LOSS);
  // A trade: the gloat wins.
  assert.equal(watch().observe([died('c'), died('a')], state(1)), BANTER.KILL);
  // A ring taken on the road, not your own character's, and not the CPU's.
  const ring = (cardId, playerId = 'me') => ({ name: 'abilityActivated', payload: { playerId, cardId } });
  assert.equal(watch().observe([ring('me-emblem-2')], state(1)), BANTER.RING);
  assert.equal(watch().observe([ring('me-emblem-1')], state(1)), null);
  assert.equal(watch().observe([ring('cpu-emblem-1', 'cpu')], state(1)), null);
  // Having spoken on turn 3, it holds its tongue on turn 4 and speaks again on turn 5.
  const w = watch();
  w.spoke(3);
  assert.equal(w.observe([died('a')], state(4, board.slice(1))), null);
  assert.equal(w.observe([], state(4)), null);
  assert.equal(w.observe([died('a')], state(5)), BANTER.KILL);
});

test('MomentWatch reads a real game: the state has what it looks for', async () => {
  const { MomentWatch } = await import('../src/ai/banter.js');
  const { createMatch, setDecks, roundSetup, PLAYER_ID, CPU_ID } = await import('../src/paigow/paigow.js');
  // Tom Bombadil's ring, taken on the road: "Untap target creature you control", so it needs a creature.
  let match = createMatch({ seed: 3, heroId: 'frodo', opponentId: 'oldManWillow', rings: ['galadriel'] });
  match = setDecks(match, [match.cards.slice(0, 5), match.cards.slice(5, 10), match.cards.slice(10, 15)]);
  const setup = roundSetup(match);
  assert.equal(setup.game.emblems[PLAYER_ID][0], 'frodo');
  const game = new Game(setup.game);
  const events = [];
  game.onAny((name, payload) => { if (name !== 'state') events.push({ name, payload }); });
  game.start();
  const state = game.getState();
  const mine = state.players.find((p) => p.id === PLAYER_ID);
  assert.deepEqual(mine.emblems.map((e) => e.emblemId), ['frodo', 'galadriel']);
  // Old Man Willow starts with Forests: permanents carry what the watch reads.
  const forest = state.battlefield.find((p) => p.controllerId === CPU_ID);
  assert.ok(forest.types.includes('Land') && forest.supertypes.includes('Basic'), JSON.stringify(Object.keys(forest)));
  const watch = new MomentWatch({ cpu: CPU_ID, ownEmblem: setup.game.emblems[PLAYER_ID][0] });
  assert.equal(watch.observe(events, state), null);
  // An activation of the taken ring, as the engine reports one.
  const taken = mine.emblems[1];
  assert.equal(watch.observe([{ name: 'abilityActivated', payload: { playerId: PLAYER_ID, cardId: taken.id, abilityId: taken.abilities[0].id } }], state), BANTER.RING);
});
