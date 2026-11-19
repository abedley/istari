import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION, PHASE } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { OPPONENTS, opponentSetup } from '../src/match/personas.js';
import { createMatch } from '../src/match/match.js';
import { CAMPAIGN_OPPONENTS } from '../src/match/campaign.js';
import { placeOf } from '../src/match/places.js';
import {
  setup, state, ok, cast, advanceTo, byCard, player, passRound,
} from './helpers/ltrGame.js';

const SLAY = { id: 'slay', name: 'Slay', manaCost: {}, types: ['Instant'], target: 'creature', effects: [{ type: 'destroy' }] };

/** A game where p1 has the Ringwraiths' rings. */
const wraithGame = (p1, p2 = [], extra = {}) => setup({
  p1, p2, cards: ['ringwraiths'], extra: { slay: SLAY, ...extra }, options: { emblems: { p1: ['ringwraiths'], p2: [] } },
});

const powerActions = (game, abilityId) => state(game).validActions
  .filter((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-1' && a.abilityId === abilityId);

/** Passes priority until the stack is empty, taking the first choice of any decision. */
function settle(game) {
  for (let i = 0; i < 40; i++) {
    const s = state(game);
    if (s.pendingDecision) ok(game, s.validActions.find((a) => a.type === ACTION.CONFIRM_CHOICE) ?? s.validActions[0]);
    else if (s.stack.length) passRound(game);
    else return;
  }
  throw new Error('Did not settle');
}

test('the Ringwraiths are an opponent with two Ringwraiths in every pack', () => {
  assert.equal(OPPONENTS.ringwraiths.emblem, 'ringwraiths');
  assert.ok(CAMPAIGN_OPPONENTS.includes('ringwraiths'));
  assert.equal(placeOf('ringwraiths').name, 'Weathertop');
  assert.deepEqual(opponentSetup('ringwraiths').pack, ['ringwraiths', 'ringwraiths']);
  for (let seed = 1; seed <= 20; seed += 1) {
    const cards = createMatch({ seed, opponentId: 'ringwraiths' }).cpuDecks.flat();
    assert.equal(cards.filter((id) => id === 'ringwraiths').length, 2, `seed ${seed}`);
  }
});

test('their ring has the Rider in Black’s powers, and the Morgul-knife', () => {
  const ring = EMBLEMS.ringwraiths;
  const rider = EMBLEMS.riderInBlack;
  assert.deepEqual(ring.triggeredAbilities, rider.triggeredAbilities, 'Hunting the Ring');
  assert.deepEqual(ring.abilities[0], { ...rider.abilities[0], oncePerTurn: true }, 'Drawn to the Ring, once a turn');
  const knife = ring.abilities[1];
  assert.equal(knife.timing, 'sorcery');
  assert.equal(knife.oncePerGame, true);
  assert.equal(knife.target, 'creature');
});

test('the Morgul-knife attaches a Morgul-Knife Wound to a creature, once a game, as a sorcery', () => {
  const { game } = wraithGame([], ['bear']);
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p2', 'bear');
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  const bear = byCard(game, 'bear')[0];
  ok(game, powerActions(game, 'morgulKnife').find((a) => a.targets?.[0] === bear.id));
  settle(game);
  const [wound] = byCard(game, 'morgulKnifeWound');
  assert.ok(wound, 'a Morgul-Knife Wound');
  assert.equal(wound.controllerId, 'p1');
  assert.equal(wound.attachedTo, bear.id);
  assert.equal(byCard(game, 'bear')[0].power, -1, '-3/-0');
  // Each power has its own limit: the Ring can still tempt them this turn, once.
  ok(game, powerActions(game, 'tempt')[0]);
  settle(game);
  assert.equal(powerActions(game, 'tempt').length, 0, 'once a turn');
  advanceTo(game, { turn: 4, phase: PHASE.PRECOMBAT_MAIN });
  // p2's upkeep: the Bear was exiled, or p2 paid 2 life to keep it.
  assert.ok(!byCard(game, 'bear').length || player(game, 'p2').life === 18);
  advanceTo(game, { turn: 5, phase: PHASE.PRECOMBAT_MAIN });
  assert.equal(powerActions(game, 'morgulKnife').length, 0, 'once a game');
  assert.equal(powerActions(game, 'tempt').length, 1, 'the other power is still there');
  assert.equal(state(game).players[0].emblems[0].usedThisGame.morgulKnife, true);
});

test('Ringwraiths: entering, -3/-3 to a creature of the opponent’s, and 3 life lost if it’s legendary', () => {
  const { game } = wraithGame(['ringwraiths'], ['hero']);
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p2', 'hero');
  advanceTo(game, { turn: 3, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'ringwraiths');
  settle(game);
  assert.equal(byCard(game, 'hero').length, 0, 'the 3/3 dies');
  assert.equal(player(game, 'p2').life, 17, 'it was legendary');
});

test('Ringwraiths: when the Ring tempts you, it returns from your graveyard to your hand', () => {
  const { game } = wraithGame(['ringwraiths', 'slay']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  cast(game, 'p1', 'ringwraiths');
  settle(game);
  const [wraith] = byCard(game, 'ringwraiths');
  cast(game, 'p1', 'slay', { targets: [wraith.id] });
  settle(game);
  assert.ok(player(game, 'p1').graveyard.some((c) => c.cardId === 'ringwraiths'));
  ok(game, powerActions(game, 'tempt')[0]);
  settle(game);
  assert.ok(!player(game, 'p1').graveyard.some((c) => c.cardId === 'ringwraiths'));
  assert.ok(player(game, 'p1').hand.some((c) => c.cardId === 'ringwraiths'));
});
