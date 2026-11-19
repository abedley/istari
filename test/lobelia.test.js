import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION, PHASE, TOKEN, EFFECT } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { OPPONENTS, opponentSetup } from '../src/match/personas.js';
import { createMatch, MATCH_RULES } from '../src/match/match.js';
import { CAMPAIGN_OPPONENTS } from '../src/match/campaign.js';
import { placeOf } from '../src/match/places.js';
import {
  setup, state, ok, cast, advanceTo, byCard, named,
} from './helpers/ltrGame.js';

const HOARD = { id: 'hoard', name: 'Hoard', manaCost: {}, types: ['Sorcery'], effects: [{ type: EFFECT.CREATE_TOKEN, count: 2, token: TOKEN.TREASURE }] };

/** A game where p1 has Lobelia's ring, and p2 a Bear without it. */
const lobeliaGame = (p1, p2 = []) => setup({ p1, p2, extra: { hoard: HOARD }, options: { emblems: { p1: ['lobelia'], p2: [] } } });

const bear = (game, controllerId = 'p1') => byCard(game, 'bear').find((p) => p.controllerId === controllerId);
const resolve = (game) => {
  for (let i = 0; i < 10 && state(game).stack.length; i++) ok(game, { type: ACTION.PASS_PRIORITY, playerId: state(game).priorityPlayerId });
};

test('Lobelia is an opponent whose ring makes her creatures +1/+1 for each Treasure she controls', () => {
  assert.equal(OPPONENTS.lobelia.emblem, 'lobelia');
  assert.equal(OPPONENTS.lobelia.name, 'Lobelia Sackville-Baggins');
  assert.ok(EMBLEMS.lobelia.passive);
  assert.ok(CAMPAIGN_OPPONENTS.includes('lobelia'));
  assert.equal(placeOf('lobelia').card, 'Lobelia Sackville-Baggins');

  const { game } = lobeliaGame(['bear', 'hoard'], ['bear']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  resolve(game);
  assert.deepEqual([bear(game).power, bear(game).toughness], [2, 2], 'no Treasure, no bonus');
  cast(game, 'p1', 'hoard');
  resolve(game);
  assert.equal(named(game, 'Treasure').length, 2);
  assert.deepEqual([bear(game).power, bear(game).toughness], [4, 4], '+2/+2 for two Treasures');

  // Spending a Treasure takes its +1/+1 away.
  const [treasure] = named(game, 'Treasure');
  const spend = state(game).validActions.find((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === treasure.id);
  ok(game, spend);
  resolve(game);
  assert.deepEqual([bear(game).power, bear(game).toughness], [3, 3]);
});

test('the ring counts only her own Treasures, and only pumps her own creatures', () => {
  const { game } = lobeliaGame(['hoard'], ['bear', 'hoard']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'hoard');
  resolve(game);
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p2', 'bear');
  resolve(game);
  cast(game, 'p2', 'hoard');
  resolve(game);
  assert.equal(named(game, 'Treasure').length, 4);
  assert.deepEqual([bear(game, 'p2').power, bear(game, 'p2').toughness], [2, 2]);
});

test('Lobelia’s packs always hold her own card and Lotho, Corrupt Shirriff', () => {
  assert.deepEqual(opponentSetup('lobelia').pack, ['lobeliaSackvilleBaggins', 'lothoCorruptShirriff']);
  for (let seed = 1; seed <= 20; seed += 1) {
    const cards = createMatch({ seed, opponentId: 'lobelia' }).cpuDecks.flat();
    assert.ok(cards.includes('lobeliaSackvilleBaggins'), `seed ${seed}`);
    assert.ok(cards.includes('lothoCorruptShirriff'), `seed ${seed}`);
    assert.equal(cards.length, MATCH_RULES.cardsDealt);
  }
});
