import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION, PHASE, TOKEN, EFFECT } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { PAIGOW_OPPONENTS, opponentSetup } from '../src/paigow/personas.js';
import { createMatch } from '../src/paigow/paigow.js';
import { CAMPAIGN_OPPONENTS } from '../src/paigow/campaign.js';
import { placeOf } from '../src/paigow/places.js';
import {
  setup, state, ok, cast, advanceTo, byCard, named,
} from './helpers/ltrGame.js';

const PICNIC = { id: 'picnic', name: 'Picnic', manaCost: {}, types: ['Sorcery'], effects: [{ type: EFFECT.CREATE_TOKEN, count: 2, token: TOKEN.FOOD }] };

const butterburGame = (p1, p2 = []) => setup({ p1, p2, extra: { picnic: PICNIC }, options: { emblems: { p1: ['butterbur'], p2: [] } } });

const powers = (game) => state(game).validActions.filter((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-1');
const resolve = (game) => {
  for (let i = 0; i < 10 && state(game).stack.length; i++) ok(game, { type: ACTION.PASS_PRIORITY, playerId: state(game).priorityPlayerId });
};

test('Butterbur is an opponent whose power sacrifices a Food for two +1/+1 counters on a creature, as a sorcery, once a turn', () => {
  assert.equal(PAIGOW_OPPONENTS.butterbur.emblem, 'butterbur');
  assert.ok(CAMPAIGN_OPPONENTS.includes('butterbur'));
  assert.equal(placeOf('butterbur').card, 'Butterbur, Bree Innkeeper');
  assert.equal(EMBLEMS.butterbur.abilities[0].timing, 'sorcery');

  const { game } = butterburGame(['bear', 'picnic']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  resolve(game);
  assert.equal(powers(game).length, 0, 'no Food, no power');
  cast(game, 'p1', 'picnic');
  resolve(game);
  const bear = byCard(game, 'bear')[0];
  const action = powers(game).find((a) => a.targets?.[0] === bear.id);
  assert.ok(action, 'the Bear can be fed');
  ok(game, action);
  resolve(game);
  assert.equal(named(game, 'Food').length, 1, 'one Food sacrificed');
  const fed = byCard(game, 'bear')[0];
  assert.equal(fed.counters['+1/+1'], 2);
  assert.deepEqual([fed.power, fed.toughness], [4, 4]);
  assert.equal(powers(game).length, 0, 'once a turn');
});

test('Butterbur’s power can feed an opponent’s creature too: "target creature"', () => {
  const { game } = butterburGame(['picnic'], ['bear']);
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p2', 'bear');
  resolve(game);
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'picnic');
  resolve(game);
  const theirs = byCard(game, 'bear')[0];
  assert.ok(powers(game).some((a) => a.targets?.[0] === theirs.id));
});

test('Butterbur’s packs always hold his own card', () => {
  assert.deepEqual(opponentSetup('butterbur').pack, ['butterburBreeInnkeeper']);
  for (let seed = 1; seed <= 20; seed += 1) {
    assert.ok(createMatch({ seed, opponentId: 'butterbur' }).cpuDecks.flat().includes('butterburBreeInnkeeper'), `seed ${seed}`);
  }
});
