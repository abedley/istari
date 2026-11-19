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

/** A game where p1 has Goldberry's power. */
const goldberryGame = (p1, p2 = []) => setup({ p1, p2, extra: { slay: SLAY }, options: { emblems: { p1: ['goldberry'], p2: [] } } });

const power = (game) => actionFor(game, ACTION.ACTIVATE_ABILITY, { playerId: 'p1', cardId: 'p1-emblem-1' });
const bear = (game, controllerId = 'p1') => byCard(game, 'bear').find((p) => p.controllerId === controllerId);

/** Uses Goldberry's power on p1's Bear, and lets it resolve. */
function shield(game) {
  const action = state(game).validActions.find((a) => a.type === ACTION.ACTIVATE_ABILITY && a.playerId === 'p1'
    && a.cardId === 'p1-emblem-1' && a.targets?.[0] === bear(game).id);
  assert.ok(action, 'the power can target the Bear');
  ok(game, action);
  for (let i = 0; i < 10 && state(game).stack.length; i++) ok(game, passPriority(state(game).priorityPlayerId));
  assert.equal(bear(game).counters.shield, 1);
}

test('Goldberry is an opponent whose power puts a shield counter on a creature of hers, once a game, as a sorcery', () => {
  assert.equal(OPPONENTS.goldberry.emblem, 'goldberry');
  const ring = EMBLEMS.goldberry;
  assert.equal(ring.activationsPerGame, 1);
  assert.equal(ring.abilities[0].timing, 'sorcery');
  assert.equal(ring.abilities[0].target, 'creatureYouControl');

  const { game } = goldberryGame(['bear', 'bear']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  // No creature of hers, no power.
  assert.equal(power(game), undefined);
  cast(game, 'p1', 'bear');
  shield(game);
  assert.equal(power(game), undefined, 'used');
  // Not on her next turn either, with a new creature to shield: once a game.
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'bear');
  assert.equal(power(game), undefined, 'once a game');
});

test('a shield counter is removed instead of damage being dealt, once', () => {
  const { game, events } = goldberryGame(['bear', 'shock', 'shock']);
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
  const { game } = goldberryGame(['bear', 'slay', 'slay']);
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
  const { game } = goldberryGame(['bear'], ['giant']);
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
