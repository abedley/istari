import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION, DECISION, PHASE, passPriority, toggleAttacker, confirmAttackers, setBlocker, confirmBlockers,
} from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { OPPONENTS } from '../src/match/personas.js';
import {
  setup, state, ok, cast, advanceTo, byCard, actionFor,
} from './helpers/ltrGame.js';

const SLAY = { id: 'slay', name: 'Slay', manaCost: {}, types: ['Instant'], target: 'creature', effects: [{ type: 'destroy' }] };
/** A +1/+1 counter on target creature: a counter for Goldberry's power to remove. */
const BOLSTER = { id: 'bolster', name: 'Bolster', manaCost: {}, types: ['Instant'], target: 'creature', effects: [{ type: 'addCounters', counter: '+1/+1', count: 1 }] };
/** A stun counter and a +1/+1 counter on target creature: two kinds to choose from. */
const DAZE = {
  id: 'daze', name: 'Daze', manaCost: {}, types: ['Instant'], target: 'creature',
  effects: [{ type: 'addCounters', counter: 'stun', count: 1 }, { type: 'addCounters', counter: '+1/+1', count: 1 }],
};

/** A game where p1 has Goldberry's power. */
const goldberryGame = (p1, p2 = []) => setup({
  p1, p2, extra: { slay: SLAY, bolster: BOLSTER, daze: DAZE }, options: { emblems: { p1: ['goldberry'], p2: [] } },
});

const power = (game) => actionFor(game, ACTION.ACTIVATE_ABILITY, { playerId: 'p1', cardId: 'p1-emblem-1' });
const bear = (game, controllerId = 'p1') => byCard(game, 'bear').find((p) => p.controllerId === controllerId);

const resolve = (game) => {
  for (let i = 0; i < 10 && state(game).stack.length; i++) ok(game, passPriority(state(game).priorityPlayerId));
};

/** Goldberry's power, paid with a `counter` off `from`, for a shield counter on `to` (ids). */
const powerAction = (game, from, to, counter = '+1/+1') => state(game).validActions.find((a) => a.type === ACTION.ACTIVATE_ABILITY
  && a.playerId === 'p1' && a.cardId === 'p1-emblem-1' && a.targets?.[0] === to
  && a.costChoices?.removeCounter?.id === from && a.costChoices.removeCounter.counter === counter);

/** Uses Goldberry's power (see powerAction), and lets it resolve. */
function usePower(game, from, to, counter) {
  const action = powerAction(game, from, to, counter);
  assert.ok(action, 'the power can take the counter off the one and shield the other');
  ok(game, action);
  resolve(game);
}

/** Bolsters p1's Bear, then trades the +1/+1 counter for a shield counter on it. */
function shield(game) {
  const id = bear(game).id;
  cast(game, 'p1', 'bolster', { targets: [id] });
  resolve(game);
  usePower(game, id, id);
  assert.deepEqual(bear(game).counters, { shield: 1 });
}

test('Goldberry is an opponent whose power, for a counter removed from a permanent, puts a shield counter on a creature of hers', () => {
  assert.equal(OPPONENTS.goldberry.emblem, 'goldberry');
  const ring = EMBLEMS.goldberry;
  assert.equal(ring.activationsPerTurn, 1);
  assert.equal(ring.activationsPerGame, undefined, 'no longer once a game');
  assert.equal(ring.abilities[0].timing, 'sorcery');
  assert.deepEqual(ring.abilities[0].cost, { removeAnyCounter: true });
  assert.equal(ring.abilities[0].target, 'creatureYouControl');

  const { game } = goldberryGame(['bear', 'bear', 'bolster']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  // A creature to shield, but no counter anywhere to remove: no power.
  assert.equal(power(game), undefined, 'no counter, no power');
  shield(game);
  assert.equal(power(game), undefined, 'once a turn');
  // On her next turn she can move the shield to another creature.
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  const [first, second] = byCard(game, 'bear').filter((p) => p.controllerId === 'p1').map((p) => p.id);
  usePower(game, first, second, 'shield');
  assert.deepEqual(state(game).battlefield.find((p) => p.id === first).counters, {});
  assert.deepEqual(state(game).battlefield.find((p) => p.id === second).counters, { shield: 1 });
});

test('the counter is a cost: it comes off as the power is activated, before anything can answer it', () => {
  const { game } = goldberryGame(['bear', 'bolster']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  const id = bear(game).id;
  cast(game, 'p1', 'bolster', { targets: [id] });
  resolve(game);
  ok(game, powerAction(game, id, id));
  // On the stack: the counter is already gone, and only the shield is left to resolve.
  assert.equal(state(game).stack.length, 1);
  assert.deepEqual(bear(game).counters, {}, 'paid on activation');
  resolve(game);
  assert.deepEqual(bear(game).counters, { shield: 1 });
});

test('Goldberry\'s power can take any kind of counter off an opponent\'s permanent, chosen as it\'s paid', () => {
  const { game } = goldberryGame(['bear', 'daze'], ['bear']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p2', 'bear');
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  const theirs = bear(game, 'p2').id;
  cast(game, 'p1', 'daze', { targets: [theirs] });
  resolve(game);
  assert.deepEqual(bear(game, 'p2').counters, { stun: 1, '+1/+1': 1 });
  assert.ok(powerAction(game, theirs, bear(game).id, 'stun'), 'either kind can be removed');
  usePower(game, theirs, bear(game).id, '+1/+1');
  assert.deepEqual(bear(game, 'p2').counters, { stun: 1 }, 'the +1/+1 counter is gone, the stun counter stays');
  assert.deepEqual(bear(game).counters, { shield: 1 });
});

test('a shield counter is removed instead of damage being dealt, once', () => {
  const { game, events } = goldberryGame(['bear', 'bolster', 'shock', 'shock']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  shield(game);
  const id = bear(game).id;
  cast(game, 'p1', 'shock', { targets: [id] });
  assert.equal(bear(game).damage, 0, 'no damage dealt');
  assert.equal(bear(game).counters.shield, undefined, 'the counter is gone');
  assert.ok(events.some((e) => e.name === 'countersRemoved' && e.payload.counter === 'shield' && e.payload.reason === 'damage'));
  cast(game, 'p1', 'shock', { targets: [id] });
  assert.equal(bear(game), undefined, 'the second Shock kills it');
});

test('a shield counter is removed instead of a creature being destroyed', () => {
  const { game } = goldberryGame(['bear', 'bolster', 'slay', 'slay']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  shield(game);
  const id = bear(game).id;
  cast(game, 'p1', 'slay', { targets: [id] });
  assert.ok(bear(game), 'still there');
  assert.equal(bear(game).counters.shield, undefined);
  cast(game, 'p1', 'slay', { targets: [id] });
  assert.equal(bear(game), undefined);
});

test('in combat, a shield counter keeps off all the damage dealt to a creature at once', () => {
  const { game } = goldberryGame(['bear', 'bolster'], ['giant']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  shield(game);
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p2', 'giant');
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  while (!state(game).pendingDecision) ok(game, passPriority(state(game).priorityPlayerId));
  assert.equal(state(game).pendingDecision.type, DECISION.DECLARE_ATTACKERS);
  const id = bear(game).id;
  ok(game, toggleAttacker('p1', id));
  ok(game, confirmAttackers('p1'));
  while (!state(game).pendingDecision) ok(game, passPriority(state(game).priorityPlayerId));
  const giant = byCard(game, 'giant')[0];
  ok(game, setBlocker('p2', giant.id, id));
  ok(game, confirmBlockers('p2'));
  advanceTo(game, { turn: 3, phase: PHASE.POSTCOMBAT_MAIN });
  assert.ok(bear(game), 'the Bear survives the 5/5');
  assert.equal(bear(game).damage, 0);
  assert.equal(bear(game).counters.shield, undefined);
  assert.equal(byCard(game, 'giant')[0].damage, 2, 'the Bear still deals its damage');
});
