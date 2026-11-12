// The Strategist (src/ai/strategist/): what it's allowed to know, and the plays it must and mustn't make.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GAME_STATUS, PHASE, STEP, ACTION, BasicAIController, seededRandom } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { actingPlayerId } from '../src/ai/simulate.js';
import { blindView, sampleWorld } from '../src/ai/strategist/beliefs.js';
import { candidates, probe } from '../src/ai/strategist/moves.js';
import { decide, strategistPolicy } from '../src/ai/strategist/policy.js';
import { profileFor, TEMPERAMENTS, PERSONA_TEMPERAMENT } from '../src/ai/strategist/profiles.js';
import { StrategistAIController } from '../src/ai/strategist/StrategistAIController.js';
import { createMatch, setDecks, roundSetup, arrangeCpuDecks, PLAYER_ID, CPU_ID } from '../src/paigow/paigow.js';
import { PAIGOW_OPPONENTS } from '../src/paigow/personas.js';
import { createCpuController, AI_KIND } from '../src/ai/cpu.js';

const players = [{ id: 'p1' }, { id: 'p2' }];
const creature = (id, power, toughness, keywords = []) => ({ id, name: id, manaCost: { generic: 1 }, types: ['Creature'], power, toughness, keywords });
const CARDS = {
  bear: creature('bear', 2, 2),
  ox: creature('ox', 1, 4),
  giant: creature('giant', 5, 5),
  hawk: creature('hawk', 2, 1, ['flying']),
  growth: { id: 'growth', name: 'Growth', manaCost: { generic: 1 }, types: ['Instant'], target: 'creature', effects: [{ type: 'pump', power: 3, toughness: 3 }] },
  murder: { id: 'murder', name: 'Murder', manaCost: { generic: 1 }, types: ['Instant'], target: 'creature', effects: [{ type: 'destroy' }] },
  zap: { id: 'zap', name: 'Zap', manaCost: { generic: 1 }, types: ['Instant'], target: 'any', effects: [{ type: 'dealDamage', amount: 2 }] },
};

/** Passes (or confirms empty declarations) until `until(state)`. */
function passTo(game, until) {
  for (let i = 0; i < 400; i++) {
    const s = game.getState();
    if (until(s)) return s;
    const actor = actingPlayerId(s);
    const mine = s.validActions.filter((a) => a.playerId === actor);
    game.dispatch(mine.find((a) => a.type === ACTION.PASS_PRIORITY) ?? mine.find((a) => a.type.startsWith('CONFIRM')) ?? mine[0]);
  }
  throw new Error('never got there');
}

const mainOf = (id, turn = 0) => (s) => s.activePlayerId === id && s.phase === PHASE.PRECOMBAT_MAIN && s.stack.length === 0 && s.turn >= turn && !s.pendingDecision;

function cast(game, playerId, cardId, targetName = null) {
  const s = game.getState();
  const card = s.players.find((p) => p.id === playerId).hand.find((c) => c.cardId === cardId);
  const target = targetName && s.battlefield.find((p) => p.cardId === targetName);
  const action = s.validActions.find((a) => a.type === ACTION.CAST_SPELL && a.cardId === card.id && (!target || a.targets?.[0] === target.id));
  assert.ok(action, `can cast ${cardId}`);
  assert.equal(game.dispatch(action).ok, true);
}

/**
 * A Pai Gow-like game (infinite mana, no libraries) where p2 goes first: each side's `board` is cast in
 * its first main phase, and it's then p1's main phase on turn 4, with `hand` still in each hand.
 */
function position({ p1 = {}, p2 = {} }) {
  const deck = (side) => [...(side.board ?? []), ...(side.hand ?? [])];
  const game = new Game({
    players, cards: CARDS, shuffleLibraries: false, startingPlayerId: 'p2', decks: { p1: deck(p1), p2: deck(p2) },
    emblems: { p1: p1.emblems ?? [], p2: p2.emblems ?? [] }, startingLife: { p1: p1.life ?? 8, p2: p2.life ?? 8 },
    openingHandSize: 7, deckingLoss: false, infiniteMana: true,
  });
  game.start();
  for (const [id, side] of [['p2', p2], ['p1', p1]]) {
    passTo(game, mainOf(id));
    for (const cardId of side.board ?? []) {
      cast(game, id, cardId);
      passTo(game, (s) => s.stack.length === 0);
    }
  }
  passTo(game, mainOf('p1', 4));
  return game;
}

const OPTIONS = { profile: profileFor('trickster'), budgetMs: 150 };
const choose = (game, me = 'p1', seed = 3) => decide(blindView(game, me), me, { ...OPTIONS, random: seededRandom(seed) }).macro;
/** The Strategist plays `me` until `until(state)`; returns the actions it took that weren't passes. */
function play(game, me, until, seed = 3) {
  const policy = strategistPolicy(me, { ...OPTIONS, seed });
  const taken = [];
  for (let i = 0; i < 400; i++) {
    const s = game.peekState();
    if (s.status !== GAME_STATUS.IN_PROGRESS || until(s)) return taken;
    const actor = actingPlayerId(s);
    const mine = s.validActions.filter((a) => a.playerId === actor);
    const action = actor === me ? policy(s, game)
      : mine.find((a) => a.type === ACTION.PASS_PRIORITY) ?? mine.find((a) => a.type.startsWith('CONFIRM')) ?? mine[0];
    if (actor === me && action.type !== ACTION.PASS_PRIORITY) taken.push({ ...action, turn: s.turn });
    game.applyTrusted(action);
  }
  throw new Error('never got there');
}
const named = (game, id) => game.peekState().battlefield.find((p) => p.id === id)?.cardId;

// ---------------------------------------------------------------------------
// What it knows

function paigowRound(seed, { silent = true } = {}) {
  let match = createMatch({ seed });
  match = setDecks(match, arrangeCpuDecks(match.cards, seededRandom(seed + 1)));
  const game = new Game({ ...roundSetup(match).game, silent });
  game.start();
  return { game, match };
}

test('a blind view holds nothing of the other player\'s hidden cards', () => {
  const { game } = paigowRound(11);
  const view = blindView(game, CPU_ID);
  assert.deepEqual(view.unknownCards[PLAYER_ID], []);
  assert.deepEqual(view.zones[PLAYER_ID].hand, []);
  assert.equal(view.zones[PLAYER_ID].handSize, 5);
  assert.equal(view.hidden[PLAYER_ID], 5);
  const hidden = game.peekState().players.find((p) => p.id === PLAYER_ID).hand;
  const text = JSON.stringify(view, (key, value) => (value === Infinity ? 'inf' : value));
  for (const card of hidden) assert.ok(!text.includes(`"${card.id}"`), `${card.name} isn't in the view`);
  // Its own cards are there.
  assert.equal(view.zones[CPU_ID].hand.length, 5);
});

test('a guessed world deals the opponent as many cards as they hold, from the booster\'s cards', () => {
  const { game } = paigowRound(12);
  const world = Game.deserialize(sampleWorld(blindView(game, CPU_ID), seededRandom(4)), { silent: true }).peekState();
  const theirs = world.players.find((p) => p.id === PLAYER_ID).hand;
  assert.equal(theirs.length, 5);
  assert.ok(theirs.every((card) => card.ownerId === PLAYER_ID && card.id.startsWith(`${PLAYER_ID}-h`)));
  const mine = world.players.find((p) => p.id === CPU_ID).hand.map((c) => c.id).sort();
  assert.deepEqual(mine, game.peekState().players.find((p) => p.id === CPU_ID).hand.map((c) => c.id).sort());
});

test('its choices don\'t change when the other player\'s hidden cards do', () => {
  let checked = 0;
  for (const seed of [21, 22, 23]) {
    const { game } = paigowRound(seed);
    // Other cards for the player's hand, as the engine makes them, under the same ids.
    const others = new Game({ ...roundSetup(setDecks(createMatch({ seed: seed + 100 }), arrangeCpuDecks(createMatch({ seed: seed + 100 }).cards, seededRandom(1)))).game, silent: true });
    others.start();
    const spare = others.serialize().zones[PLAYER_ID].hand;
    const ais = { [PLAYER_ID]: new BasicAIController({ game: null, playerId: PLAYER_ID }), [CPU_ID]: new BasicAIController({ game: null, playerId: CPU_ID }) };
    for (let step = 0; step < 600 && checked < 12; step++) {
      const state = game.peekState();
      if (state.status !== GAME_STATUS.IN_PROGRESS) break;
      const actor = actingPlayerId(state);
      if (actor === CPU_ID && state.validActions.length > 1 && step % 3 === 0) {
        const snapshot = game.serialize();
        const hand = snapshot.zones[PLAYER_ID].hand;
        if (hand.length) {
          snapshot.zones[PLAYER_ID].hand = hand.map((card, i) => ({ ...spare[i % spare.length], id: card.id }));
          const swapped = Game.deserialize(snapshot, { silent: true });
          const pick = (g) => decide(blindView(g, CPU_ID), CPU_ID, { ...OPTIONS, budgetMs: 1e9, maxDepth: 1, random: seededRandom(5) }).macro?.key ?? null;
          assert.equal(pick(swapped), pick(game), `seed ${seed}, step ${step}`);
          checked += 1;
        }
      }
      game.applyTrusted(ais[actor].chooseAction(state) ?? state.validActions.find((a) => a.playerId === actor));
    }
  }
  assert.ok(checked >= 6, `${checked} positions checked`);
});

// ---------------------------------------------------------------------------
// Tricks: only to kill, to save, or to win

test('it never casts a pump in its main phase', () => {
  const game = position({ p1: { board: ['bear'], hand: ['growth'] }, p2: { board: ['ox'] } });
  const moves = candidates(game.peekState(), 'p1', game);
  const growth = game.peekState().players[0].hand[0].id;
  assert.ok(!moves.some((m) => m.action?.cardId === growth), 'the pump isn\'t even considered');
});

test('after blocks, it pumps to win the fight, and not when the pump changes nothing', () => {
  // Our bear attacks into their ox (1/4): alone it kills nothing; with +3/+3 it kills the ox and lives.
  const game = position({ p1: { board: ['bear'], hand: ['growth'] }, p2: { board: ['ox'] } });
  passTo(game, (s) => s.pendingDecision?.type === 'declareAttackers');
  const bear = game.peekState().battlefield.find((p) => p.cardId === 'bear');
  game.dispatch({ type: ACTION.TOGGLE_ATTACKER, playerId: 'p1', cardId: bear.id });
  game.dispatch({ type: ACTION.CONFIRM_ATTACKERS, playerId: 'p1' });
  passTo(game, (s) => s.pendingDecision?.type === 'declareBlockers');
  const blocked = game.clone();
  const ox = game.peekState().battlefield.find((p) => p.cardId === 'ox');
  blocked.dispatch({ type: ACTION.SET_BLOCKER, playerId: 'p2', cardId: ox.id, attackerId: bear.id });
  blocked.dispatch({ type: ACTION.CONFIRM_BLOCKERS, playerId: 'p2' });
  passTo(blocked, (s) => s.priorityPlayerId === 'p1' && s.step === STEP.DECLARE_BLOCKERS);
  const macro = choose(blocked);
  assert.equal(macro.action.type, ACTION.CAST_SPELL);
  assert.equal(named(blocked, macro.action.targets[0]), 'bear');
  // Unblocked, the pump would only add damage that doesn't kill: it keeps the card.
  game.dispatch({ type: ACTION.CONFIRM_BLOCKERS, playerId: 'p2' });
  passTo(game, (s) => s.priorityPlayerId === 'p1' && s.step === STEP.DECLARE_BLOCKERS);
  assert.equal(choose(game).action.type, ACTION.PASS_PRIORITY);
});

test('it pumps for the last points of damage', () => {
  const game = position({ p1: { board: ['bear'], hand: ['growth'] }, p2: { life: 5 } });
  const taken = play(game, 'p1', (s) => s.turn > 4);
  assert.equal(game.peekState().winnerId, 'p1');
  assert.ok(taken.some((a) => a.type === ACTION.CAST_SPELL));
});

test('it saves its creature from removal with Elrond\'s ring, where the basic AI lets it die', () => {
  const setup = () => {
    const game = position({ p1: { board: ['giant'], emblems: ['elrond'] }, p2: { hand: ['murder'] } });
    passTo(game, mainOf('p2', 5));
    cast(game, 'p2', 'murder', 'giant');
    game.dispatch({ type: ACTION.PASS_PRIORITY, playerId: 'p2' });
    assert.equal(game.peekState().priorityPlayerId, 'p1');
    return game;
  };
  const game = setup();
  const macro = choose(game);
  assert.equal(macro.action.type, ACTION.ACTIVATE_ABILITY);
  assert.equal(named(game, macro.action.targets[0]), 'giant');
  game.dispatch(macro.action);
  passTo(game, (s) => s.stack.length === 0);
  assert.ok(game.peekState().battlefield.some((p) => p.cardId === 'giant'), 'the giant lives');
  // The basic AI (the search AI's fallback, and its rule for when to act) only answers spells with counterspells.
  const basic = new BasicAIController({ game: null, playerId: 'p1' });
  assert.equal(basic.chooseAction(setup().peekState()).type, ACTION.PASS_PRIORITY);
});

test('it doesn\'t use Elrond\'s ring when nothing threatens its creature', () => {
  const game = position({ p1: { board: ['giant'], emblems: ['elrond'] }, p2: { board: ['bear'] } });
  const taken = play(game, 'p1', (s) => s.turn > 5);
  assert.ok(!taken.some((a) => a.type === ACTION.ACTIVATE_ABILITY), 'no activation');
});

test('burn is kept for something it kills', () => {
  // Zap deals 2: their ox (1/4) survives it, and they're at 8.
  const game = position({ p1: { board: ['bear'], hand: ['zap'] }, p2: { board: ['ox'] } });
  const taken = play(game, 'p1', (s) => s.turn > 5);
  assert.ok(!taken.some((a) => a.type === ACTION.CAST_SPELL), 'no cast');
  // Against a hawk (2/1) it's a kill.
  const second = position({ p1: { board: ['ox'], hand: ['zap'] }, p2: { board: ['hawk'] } });
  const casts = play(second, 'p1', (s) => s.turn > 5).filter((a) => a.type === ACTION.CAST_SPELL);
  assert.equal(casts.length, 1);
  assert.ok(!second.peekState().battlefield.some((p) => p.cardId === 'hawk'));
});

// ---------------------------------------------------------------------------
// Attacks and blocks

test('lethal on the board: it attacks with everything', () => {
  const game = position({ p1: { board: ['bear', 'bear', 'ox'] }, p2: { board: ['ox'], life: 3 } });
  passTo(game, (s) => s.pendingDecision?.type === 'declareAttackers');
  const moves = candidates(game.peekState(), 'p1', game);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].attackers.length, 3);
  play(game, 'p1', (s) => s.turn > 4);
  assert.equal(game.peekState().winnerId, 'p1');
});

test('it doesn\'t attack into a block that kills its creature for nothing', () => {
  const game = position({ p1: { board: ['bear'] }, p2: { board: ['giant'] } });
  const taken = play(game, 'p1', (s) => s.turn > 4);
  assert.ok(!taken.some((a) => a.type === ACTION.TOGGLE_ATTACKER), 'the bear stays home');
});

test('it keeps its blocker home when the swing back would kill it', () => {
  // At 2 life, with one ox to hold off their bear: attacking for 1 loses the game.
  const game = position({ p1: { board: ['ox'], life: 2 }, p2: { board: ['bear'], life: 8 } });
  const taken = play(game, 'p1', (s) => s.turn > 4);
  assert.ok(!taken.some((a) => a.type === ACTION.TOGGLE_ATTACKER));
});

test('a creature Théoden\'s ring sends into battle does attack', () => {
  const game = position({ p1: { board: ['giant', 'bear'], emblems: ['theoden'] }, p2: { board: ['ox'] } });
  const giant = game.peekState().battlefield.find((p) => p.cardId === 'giant');
  const power = game.peekState().validActions.find((a) => a.type === ACTION.ACTIVATE_ABILITY && a.targets?.[0] === giant.id);
  game.dispatch(power);
  passTo(game, (s) => s.pendingDecision?.type === 'declareAttackers');
  const moves = candidates(game.peekState(), 'p1', game);
  assert.ok(moves.length >= 1 && moves.every((m) => m.attackers.includes(giant.id)), 'every attack considered includes it');
});

test('a free power with no target is used as soon as it can be', () => {
  assert.equal(EMBLEMS.sauron.abilities[0].timing, 'sorcery');
  const game = position({ p1: { board: ['bear'], emblems: ['sauron'] }, p2: { board: ['ox'] } });
  const moves = candidates(game.peekState(), 'p1', game);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].action.type, ACTION.ACTIVATE_ABILITY);
});

test('a probe tells what an action changes', () => {
  const game = position({ p1: { board: ['giant'], emblems: ['elrond'] }, p2: { hand: ['murder'] } });
  passTo(game, mainOf('p2', 5));
  cast(game, 'p2', 'murder', 'giant');
  game.dispatch({ type: ACTION.PASS_PRIORITY, playerId: 'p2' });
  const save = game.peekState().validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.ACTIVATE_ABILITY);
  assert.ok(probe(game, 'p1', save) - probe(game, 'p1', null) > 10, 'the giant\'s worth');
});

// ---------------------------------------------------------------------------
// Personalities and the controller

test('every opponent has a temperament, and plays with the Strategist', () => {
  for (const [id, opponent] of Object.entries(PAIGOW_OPPONENTS)) {
    assert.equal(opponent.ai.kind, AI_KIND.STRATEGIST, id);
    assert.ok(TEMPERAMENTS[PERSONA_TEMPERAMENT[id]], `${id}'s temperament`);
    assert.equal(profileFor(id).temperament, PERSONA_TEMPERAMENT[id]);
  }
  assert.equal(profileFor('nobody').temperament, 'trickster');
  assert.ok(profileFor('sauron').aggression > profileFor('saruman').aggression);
  assert.ok(profileFor('saruman').patience > profileFor('sauron').patience);
});

test('the controller plays a whole round through the game\'s events, and is seen thinking', async () => {
  const { game, match } = paigowRound(31, { silent: false });
  const setup = roundSetup(match);
  assert.equal(setup.cpu.ai.kind, AI_KIND.STRATEGIST);
  assert.equal(setup.cpu.ai.persona, match.opponentId);
  // Timers that fire at once, in order; decisions made on this thread.
  const queue = [];
  const timers = { setTimeout: (fn) => queue.push(fn), clearTimeout: (id) => { queue[id - 1] = null; }, now: () => 0 };
  const runner = {
    decide: async ({ view, me, profile, seed, options }) => decide(view, me, { profile, random: seededRandom(seed), ...options, budgetMs: 20 }),
    dispose() {},
  };
  const cpu = new StrategistAIController({ game, playerId: CPU_ID, persona: setup.cpu.ai.persona, seed: 5, runner, timers });
  const player = new BasicAIController({ game, playerId: PLAYER_ID, delayMs: null });
  let thinking = 0;
  let refused = 0;
  cpu.on('thinking', ({ active }) => { thinking += active ? 1 : 0; });
  game.on('actionRejected', () => { refused += 1; });
  cpu.actNow();
  player.actNow();
  for (let idle = 0; idle < 2000 && game.peekState().status === GAME_STATUS.IN_PROGRESS;) {
    const next = queue.findIndex(Boolean);
    if (next >= 0) {
      const fn = queue[next];
      queue[next] = null;
      fn();
      idle = 0;
    } else {
      // A decision is being made: let it finish.
      await new Promise((resolve) => { setImmediate(resolve); });
      idle += 1;
    }
  }
  cpu.detach();
  player.detach();
  assert.equal(game.peekState().status, GAME_STATUS.GAME_OVER);
  assert.equal(refused, 0);
  assert.ok(thinking > 0);
});

test('createCpuController makes a Strategist for an opponent', () => {
  const { game, match } = paigowRound(32, { silent: false });
  const cpu = createCpuController(game, roundSetup(match).cpu, { seed: 1 });
  assert.ok(cpu instanceof StrategistAIController);
  cpu.detach();
});
