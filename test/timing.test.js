// When the AIs cast instants and permanents with flash: at the last moment they're needed, never in
// their own main phase (src/ai/timing.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Game, PHASE, STEP, ACTION, BasicAIController, passPriority,
} from '../src/index.js';
import { listMacros } from '../src/ai/macroActions.js';
import { trickPays, permanentWindowAllows, windowAllows, WINDOW } from '../src/ai/timing.js';
import { CARDS as ALL_CARDS } from '../src/cards/cards.js';

const players = [{ id: 'p1' }, { id: 'p2' }];
const CARDS = {
  bear: { id: 'bear', name: 'Bear', manaCost: { generic: 1 }, types: ['Creature'], power: 2, toughness: 2 },
  ox: { id: 'ox', name: 'Ox', manaCost: { generic: 1 }, types: ['Creature'], power: 1, toughness: 4 },
  zap: { id: 'zap', name: 'Zap', manaCost: { generic: 1 }, types: ['Instant'], target: 'any', effects: [{ type: 'dealDamage', amount: 2 }] },
  salve: { id: 'salve', name: 'Salve', manaCost: { generic: 1 }, types: ['Instant'], effects: [{ type: 'gainLife', amount: 3 }] },
  dreadfulAsTheStorm: ALL_CARDS.dreadfulAsTheStorm,
  giftOfStrands: ALL_CARDS.giftOfStrands,
  ambusher: { id: 'ambusher', name: 'Ambusher', manaCost: { generic: 1 }, types: ['Creature'], keywords: ['flash'], power: 3, toughness: 3 },
};

/**
 * A game where p2 cast `p2Board` on turn 1 and it's now p1's turn 2 main phase with `p1Hand`
 * (infinite mana, no libraries, as in Pai Gow).
 */
function setup({ p1Hand, p2Board = [], p2Life }) {
  const game = new Game({
    players, cards: CARDS, shuffleLibraries: false, emblems: { p1: [], p2: [] }, startingPlayerId: 'p2',
    decks: { p1: p1Hand, p2: p2Board }, openingHandSize: 3, deckingLoss: false, infiniteMana: true,
    ...(p2Life ? { startingLife: { p2: p2Life } } : {}),
  });
  game.start();
  passTo(game, (s) => s.activePlayerId === 'p2' && s.phase === PHASE.PRECOMBAT_MAIN);
  for (const cardId of p2Board) {
    const card = game.getState().players[1].hand.find((c) => c.cardId === cardId);
    assert.equal(game.dispatch({ type: ACTION.CAST_SPELL, playerId: 'p2', cardId: card.id }).ok, true);
    passTo(game, (s) => s.stack.length === 0);
  }
  passTo(game, (s) => s.activePlayerId === 'p1' && s.phase === PHASE.PRECOMBAT_MAIN);
  return game;
}

/** Passes (or confirms empty declarations) until `until(state)`. */
function passTo(game, until) {
  for (let i = 0; i < 200; i++) {
    const s = game.getState();
    if (until(s)) return s;
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const mine = s.validActions.filter((a) => a.playerId === actor);
    game.dispatch(mine.find((a) => a.type === ACTION.PASS_PRIORITY) ?? mine.find((a) => a.type.startsWith('CONFIRM')) ?? mine[0]);
  }
  throw new Error('never got there');
}

/**
 * Lets the basic AI play p1 (and p2 pass, or attack with everything when `p2Attacks`) until p1 casts a
 * spell; returns the state then and the cast, or null if it never does by `maxTurn`.
 */
function firstCast(game, { p2Attacks = false, maxTurn = 4 } = {}) {
  const ai = new BasicAIController({ game: null, playerId: 'p1' });
  for (let i = 0; i < 400; i++) {
    const s = game.getState();
    if (s.turn > maxTurn) return null;
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    let action;
    if (actor === 'p1') {
      action = ai.chooseAction(s);
      if (action?.type === ACTION.CAST_SPELL) return { state: s, action };
    } else {
      const mine = s.validActions.filter((a) => a.playerId === actor);
      const toggle = p2Attacks && s.pendingDecision?.type === 'declareAttackers'
        && mine.find((a) => a.type === ACTION.TOGGLE_ATTACKER && !s.pendingDecision.attackers.includes(a.cardId));
      action = toggle || mine.find((a) => a.type === ACTION.PASS_PRIORITY) || mine.find((a) => a.type.startsWith('CONFIRM')) || mine[0];
    }
    game.dispatch(action);
  }
  return null;
}

const castsIn = (state, cardId) => listMacros(state, 'p1').filter((m) => m.kind === 'cast'
  && state.players[0].hand.find((c) => c.id === m.cardId)?.cardId === cardId);

test('removal waits for the start of combat, not the main phase', () => {
  const game = setup({ p1Hand: ['bear', 'zap'], p2Board: ['bear'] });
  const theirBear = game.getState().battlefield.find((p) => p.controllerId === 'p2').id;
  assert.deepEqual(castsIn(game.getState(), 'zap'), [], 'the search AI keeps it in the main phase');
  const { state, action } = firstCast(game);
  // Its own Bear first, at sorcery speed.
  assert.equal(state.phase, PHASE.PRECOMBAT_MAIN);
  game.dispatch(action);
  passTo(game, (s) => s.stack.length === 0 && s.priorityPlayerId === 'p1');
  const zap = firstCast(game);
  assert.equal(zap.state.step, STEP.BEGINNING_OF_COMBAT);
  assert.deepEqual(zap.action.targets, [theirBear]);
  assert.equal(castsIn(zap.state, 'zap').length > 0, true, 'the search AI considers it then');
});

test('a creature with flash waits to ambush an attacker', () => {
  const game = setup({ p1Hand: ['ambusher'], p2Board: ['bear'] });
  assert.deepEqual(castsIn(game.getState(), 'ambusher'), []);
  const cast = firstCast(game, { p2Attacks: true });
  assert.equal(cast.state.activePlayerId, 'p2');
  assert.equal(cast.state.step, STEP.DECLARE_ATTACKERS);
  assert.ok(cast.state.combat.attackers.length > 0);
});

test('a creature with flash comes in at the end of the opponent\'s turn when nobody attacks', () => {
  const game = setup({ p1Hand: ['ambusher'] });
  const cast = firstCast(game);
  assert.equal(cast.state.activePlayerId, 'p2');
  assert.equal(cast.state.step, STEP.END);
});

test('other instants wait for the end of the opponent\'s turn', () => {
  const game = setup({ p1Hand: ['salve'] });
  assert.deepEqual(castsIn(game.getState(), 'salve'), []);
  const cast = firstCast(game);
  assert.equal(cast.state.activePlayerId, 'p2');
  assert.equal(cast.state.step, STEP.END);
  assert.equal(castsIn(cast.state, 'salve').length, 1);
});

test('burn that wins the game is cast at once', () => {
  const game = setup({ p1Hand: ['zap'], p2Board: ['ox'], p2Life: 2 });
  const { state, action } = firstCast(game);
  assert.equal(state.phase, PHASE.PRECOMBAT_MAIN);
  assert.deepEqual(action.targets, ['p2']);
  assert.deepEqual(castsIn(state, 'zap').map((m) => m.targetId), ['p2']);
});

test("combat tricks aren't cast for nothing: not at the end of the opponent's turn, nor on an unblocked attack", () => {
  // p1 has a Bear and both tricks; nobody blocks, and nothing they'd do kills anything or wins.
  const game = setup({ p1Hand: ['bear', 'dreadfulAsTheStorm', 'giftOfStrands'] });
  const { action } = firstCast(game);
  assert.equal(game.getState().players[0].hand.find((c) => c.id === action.cardId).cardId, 'bear');
  game.dispatch(action);
  passTo(game, (s) => s.stack.length === 0 && s.priorityPlayerId === 'p1');
  assert.equal(firstCast(game, { maxTurn: 6 }), null);
});

/** A combat: p1's 2/2 Bear attacks, blocked by p2's `blocker` (or unblocked); p2 at `life`. */
const combat = ({ blocker = null, life = 20 } = {}) => ({
  activePlayerId: 'p1',
  players: [{ id: 'p1', life: 20 }, { id: 'p2', life }],
  battlefield: [
    { id: 'b', controllerId: 'p1', types: ['Creature'], power: 2, toughness: 2, damage: 0, keywords: [] },
    ...(blocker ? [{ id: 'x', controllerId: 'p2', types: ['Creature'], damage: 0, keywords: [], ...blocker }] : []),
  ],
  combat: { attackers: [{ cardId: 'b', blockerIds: blocker ? ['x'] : [], blocked: Boolean(blocker) }] },
});

test('a combat trick is worth it when it kills their creature or wins the game, not to save ours', () => {
  const dreadful = ALL_CARDS.dreadfulAsTheStorm.effects;
  const pump = [{ type: 'pump', power: 3, toughness: 3 }];
  // A 1/4 blocker survives a 2/2 Bear, but not a 5/5.
  assert.equal(trickPays(combat({ blocker: { power: 1, toughness: 4 } }), 'p1', dreadful, 'b'), true);
  assert.equal(windowAllows(WINDOW.COMBAT, dreadful, true, 'b', combat({ blocker: { power: 1, toughness: 4 } }), 'p1'), true);
  assert.equal(permanentWindowAllows(WINDOW.COMBAT, ALL_CARDS.giftOfStrands, 'b', combat({ blocker: { power: 1, toughness: 4 } }), 'p1'), true);
  // A 3/1 blocker dies anyway: the trick would only save the Bear.
  assert.equal(trickPays(combat({ blocker: { power: 3, toughness: 1 } }), 'p1', pump, 'b'), false);
  // Unblocked: only if the extra damage is lethal.
  assert.equal(trickPays(combat({ life: 20 }), 'p1', pump, 'b'), false);
  assert.equal(trickPays(combat({ life: 5 }), 'p1', pump, 'b'), true);
  assert.equal(trickPays(combat({ life: 2 }), 'p1', pump, 'b'), false, 'already lethal without it');
  // Never at the end of the opponent's turn, nor on their creature.
  assert.equal(windowAllows(WINDOW.END, dreadful, true, 'b', combat(), 'p1'), false);
  assert.equal(permanentWindowAllows(WINDOW.END, ALL_CARDS.giftOfStrands, 'b', combat(), 'p1'), false);
  assert.equal(trickPays(combat({ blocker: { power: 1, toughness: 4 } }), 'p1', pump, 'x'), false);
});

test('a combat trick that only works with another trick in hand is cast first, if there is the mana for both', () => {
  // As cards in a hand: Gift of Strands (+3/+3, flash Aura, {1}{G}), Rally (+2/+2 instant, {1}), Might (+5/+5, {1}).
  const gift = { id: 'h1', cardId: 'giftOfStrands', types: ['Enchantment'], subtypes: ['Aura'], keywords: ['flash'],
    manaCost: { generic: 1, G: 1 }, staticAbilities: ALL_CARDS.giftOfStrands.staticAbilities };
  const instant = (id, n) => ({ id, types: ['Instant'], keywords: [], manaCost: { generic: 1 }, spell: { target: 'creature', effects: [{ type: 'pump', power: n, toughness: n }] } });
  const rally = instant('h2', 2);
  const might = instant('h3', 5);
  /** p1's 2/2 Bear blocked by a 1/6: Gift alone makes it 5/5, Gift and Rally 7/7. */
  const state = (hand, { infiniteMana = true, lands = 0, toughness = 6 } = {}) => {
    const s = combat({ blocker: { power: 1, toughness } });
    s.infiniteMana = infiniteMana;
    s.players[0] = { ...s.players[0], hand, manaPool: {} };
    for (let i = 0; i < lands; i++) s.battlefield.push({ id: `l${i}`, controllerId: 'p1', types: ['Land'], tapped: false });
    return s;
  };
  const giftPays = (s) => permanentWindowAllows(WINDOW.COMBAT, gift, 'b', s, 'p1');
  assert.equal(giftPays(state([gift])), false, 'alone it kills nothing');
  assert.equal(giftPays(state([gift, rally])), true, 'with Rally it kills the blocker');
  assert.equal(windowAllows(WINDOW.COMBAT, rally.spell.effects, true, 'b', state([gift, rally]), 'p1', { sourceId: 'h2' }), true, 'either can go first');
  // The mana for both: 3 lands for Gift's 2 and Rally's 1, not 2.
  assert.equal(giftPays(state([gift, rally], { infiniteMana: false, lands: 3 })), true);
  assert.equal(giftPays(state([gift, rally], { infiniteMana: false, lands: 2 })), false);
  // Might does it alone: it's cast instead of the two.
  assert.equal(giftPays(state([gift, rally, might])), false);
  assert.equal(windowAllows(WINDOW.COMBAT, might.spell.effects, true, 'b', state([gift, rally, might]), 'p1', { sourceId: 'h3' }), true);
  // Up to three cards in all: against a 1/7, Gift needs two +1/+1s (7/7); one isn't enough, and three more is too many.
  const tiny = (id) => instant(id, 1);
  assert.equal(giftPays(state([gift, tiny('t1'), tiny('t2')], { toughness: 7 })), true);
  assert.equal(giftPays(state([gift, tiny('t1')], { toughness: 7 })), false);
  assert.equal(giftPays(state([gift, tiny('t1'), tiny('t2'), tiny('t3')], { toughness: 8 })), false);
});
