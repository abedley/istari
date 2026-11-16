import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GAME_STATUS } from '../src/engine/Game.js';
import { ACTION, passPriority } from '../src/engine/actions.js';
import { CARDS } from '../src/cards/cards.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { POWER_ICONS, hasIcon } from '../app/icons.js';
import { PAIGOW_OPPONENTS, PAIGOW_HEROES } from '../src/paigow/personas.js';
import {
  createMatch, setDecks, roundSetup, PLAYER_ID, CPU_ID,
} from '../src/paigow/paigow.js';
import { outOfActions } from '../src/paigow/fastForward.js';
import { BasicAIController } from '../src/ai/BasicAIController.js';
import { SHOCK } from './helpers/ltrGame.js';

const BEAR = { id: 'bear', name: 'Bear', manaCost: { generic: 1 }, types: ['Creature'], power: 2, toughness: 2 };
const players = [{ id: 'p1' }, { id: 'p2' }];

/** A Pai Gow-like game with these powers, in p1's first main phase once each side has cast up to two bears. */
function powerGame(mine, theirs, { p1 = ['bear', 'bear'], p2 = ['bear', 'bear'] } = {}) {
  const game = new Game({
    players, decks: { p1, p2 }, cards: { bear: BEAR, glorfindelDauntlessRescuer: CARDS.glorfindelDauntlessRescuer }, shuffleLibraries: false, openingHandSize: 5,
    deckingLoss: false, infiniteMana: true, emblems: { p1: mine ? [mine] : [], p2: theirs ? [theirs] : [] }, startingPlayerId: 'p2',
  });
  game.start();
  // Each side casts everything in its first main phase, until p1's.
  for (let i = 0; i < 500; i++) {
    const s = game.getState();
    if (s.activePlayerId === 'p1' && s.phase === 'precombatMain' && s.priorityPlayerId === 'p1' && s.stack.length === 0
      && s.battlefield.filter((p) => p.controllerId === 'p1').length === Math.min(2, p1.length)) return game;
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const acts = s.validActions.filter((a) => a.playerId === actor);
    // Each side casts two creatures at most, and keeps the rest.
    const cast = s.battlefield.filter((p) => p.controllerId === actor).length + s.stack.length < 2;
    const act = (cast ? acts.find((a) => a.type === ACTION.CAST_SPELL) : null) ?? acts.find((a) => a.type === ACTION.PASS_PRIORITY) ?? acts[0];
    assert.equal(game.dispatch(act).ok, true);
  }
  throw new Error('Too many steps.');
}

const activation = (state, playerId) => state.validActions.find((a) => a.playerId === playerId && a.type === ACTION.ACTIVATE_ABILITY && a.cardId === `${playerId}-emblem-1`);

/** Activates p1's power (on its first legal target, or on `targetOf(state)`), lets it resolve, and returns the state. */
function usePower(game, targetOf = null) {
  const state = game.getState();
  const action = targetOf
    ? state.validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-1' && a.targets?.[0] === targetOf(state))
    : activation(state, 'p1');
  assert.ok(action, 'the power can be activated');
  assert.equal(game.dispatch(action).ok, true);
  for (let i = 0; i < 50; i++) {
    const s = game.getState();
    if (s.stack.length === 0 && !s.pendingDecision) return s;
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const acts = s.validActions.filter((a) => a.playerId === actor);
    // A scry: everything to the bottom.
    assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type === ACTION.CONFIRM_CHOICE) ?? acts[0]).ok, true);
  }
  throw new Error('The power did not resolve.');
}

test('every hero and opponent has a power of their own, once a turn', () => {
  const people = [...Object.values(PAIGOW_HEROES), ...Object.values(PAIGOW_OPPONENTS)];
  const emblems = people.map((p) => p.emblem);
  assert.equal(new Set(emblems).size, people.length);
  for (const person of people) {
    const emblem = EMBLEMS[person.emblem];
    assert.ok(emblem, `${person.name}'s power`);
    assert.equal(emblem.ring, true);
    // A passive power has no ability, just its text and what the game starts with.
    if (emblem.passive) {
      // Any ability besides is a second power, with a name of its own, once a turn.
      if (emblem.abilities.length) {
        assert.equal(emblem.activationsPerTurn, 1);
        assert.ok(emblem.abilities.every((a) => a.name && a.text));
      }
      assert.ok(emblem.text && [...(emblem.startsWith ?? []), ...(emblem.shufflesIn ?? [])].every((id) => CARDS[id]));
      assert.ok(emblem.startsWith?.length || emblem.triggeredAbilities?.length || emblem.shufflesIn?.length || emblem.staticAbilities?.length || emblem.match, `${person.name}'s passive power does something`);
      continue;
    }
    assert.equal(emblem.activationsPerTurn, 1);
    assert.equal(emblem.abilities.length, 1);
    assert.ok(emblem.abilities[0].name && emblem.abilities[0].text);
    // Each is a Ring of Power, with a name of its own and a name for what it does.
    assert.ok(emblem.power);
  }
  assert.equal(new Set(emblems.map((id) => EMBLEMS[id].name)).size, people.length);
  assert.equal(EMBLEMS.gandalf.name, 'Narya');
  assert.equal(EMBLEMS.elrond.name, 'Vilya');
  assert.equal(EMBLEMS.galadriel.name, 'Nenya');
  assert.equal(EMBLEMS.frodo.name, 'The One Ring');
  assert.deepEqual(Object.values(PAIGOW_HEROES).map((h) => h.name), ['Frodo', 'Strider', 'Samwise', 'Radagast', 'Merry', 'Legolas', 'Pippin']);
  for (const hero of Object.values(PAIGOW_HEROES)) {
    assert.ok(Object.values(CARDS).some((c) => c.name === hero.portrait.card), `${hero.name}'s portrait card`);
  }
});

test('a round gives each side its power', () => {
  for (const heroId of Object.keys(PAIGOW_HEROES)) {
    const match = createMatch({ seed: 5, heroId });
    const ready = setDecks(match, [0, 1, 2].map((i) => match.cards.slice(i * 5, i * 5 + 5)));
    const { game } = roundSetup(ready);
    assert.deepEqual(game.emblems, { [PLAYER_ID]: [heroId], [CPU_ID]: [PAIGOW_OPPONENTS[match.opponentId].emblem] });
    const started = new Game({ ...game, cards: CARDS });
    started.start();
    assert.equal(started.getState().players[0].emblems[0].emblemId, heroId);
    if (!EMBLEMS[heroId].passive) assert.equal(started.getState().players[0].emblems[0].abilities[0].name, EMBLEMS[heroId].name);
  }
  assert.throws(() => createMatch({ heroId: 'gollum' }));
});

test('each power does what it says', () => {
  const p1Bear = (s) => s.battlefield.find((p) => p.controllerId === 'p1');
  const p2Bears = (s) => s.battlefield.filter((p) => p.controllerId === 'p2');
  let s = usePower(powerGame('frodo'));
  assert.equal(s.players[0].life, 20);
  assert.equal(s.players[0].ring.level, 1);
  s = usePower(powerGame('strider'), (st) => p1Bear(st).id);
  assert.equal(p1Bear(s).power, 4);
  assert.equal(p1Bear(s).toughness, 2);
  s = usePower(powerGame('gandalf'));
  assert.equal(p2Bears(s).filter((p) => p.tapped).length, 1);
  s = usePower(powerGame('sauron'));
  assert.ok(s.battlefield.some((p) => p.controllerId === 'p1' && p.subtypes?.includes('Army') && p.power === 1));
  s = usePower(powerGame('saruman'));
  assert.ok(p2Bears(s).some((p) => p.power === 0));
  s = usePower(powerGame('denethor', null, { p2: ['bear', 'bear', 'bear', 'bear', 'bear', 'bear', 'bear'] }));
  assert.equal(s.players[0].life, 19);
  assert.equal(s.players[1].graveyard.length, 1);
  s = usePower(powerGame('elrond'));
  // Beside the two Forests and the Elrond, Master of Healing he starts with.
  assert.equal(s.players[0].library.filter((c) => c.cardId === 'glorfindelDauntlessRescuer').length, 1);
  s = usePower(powerGame('galadriel'));
  assert.equal(p1Bear(s).power, 3);
  s = usePower(powerGame('birthdayBilbo'));
  assert.equal(s.players[0].life, 21);
  s = usePower(powerGame('burglarBilbo'));
  assert.equal(p1Bear(s).power, 3);
  assert.ok(p1Bear(s).keywords.includes('menace'));
});

test("Elrond's power is a sorcery that shuffles a new Glorfindel, Dauntless Rescuer into the library, then scries 2", () => {
  assert.equal(EMBLEMS.elrond.abilities[0].timing, 'sorcery');
  assert.equal(EMBLEMS.elrond.abilities[0].target, undefined);
  assert.equal(EMBLEMS.elrond.abilities[0].name, 'Help from Rivendell');
  const game = powerGame('elrond', null, { p1: Array(9).fill('bear') });
  const before = game.getState().players[0].library.length;
  assert.ok(before >= 2);
  game.dispatch(activation(game.getState(), 'p1'));
  // Resolve it: the scry, after the shuffle, looks at the top two cards.
  let scry = null;
  for (let i = 0; i < 20 && !scry; i++) {
    const s = game.getState();
    if (s.pendingDecision?.kind === 'scry') scry = s.pendingDecision;
    else game.dispatch(s.validActions.find((a) => a.type === ACTION.PASS_PRIORITY));
  }
  assert.ok(scry, 'p1 scries');
  assert.equal(scry.playerId, 'p1');
  assert.equal(scry.options.length, 2);
  const glorfindels = (st) => st.players[0].library.filter((c) => c.cardId === 'glorfindelDauntlessRescuer');
  assert.equal(glorfindels(game.getState()).length, 1, 'shuffled in before the scry');
  // Keep one on top, the other to the bottom.
  const [top, bottom] = scry.options;
  assert.equal(game.dispatch({ type: ACTION.TOGGLE_CHOICE, playerId: 'p1', choice: top }).ok, true);
  assert.equal(game.dispatch({ type: ACTION.CONFIRM_CHOICE, playerId: 'p1' }).ok, true);
  const s = game.getState();
  assert.equal(s.stack.length, 0);
  assert.equal(s.players[0].library.length, before + 1);
  assert.equal(s.players[0].library[0].id, top);
  assert.equal(s.players[0].library.at(-1).id, bottom);
  assert.equal(glorfindels(s).length, 1);
  // Once a turn: not again until p1's next turn.
  assert.equal(activation(s, 'p1'), undefined);
});

test("Frodo's power: Ring-bearers you control have deathtouch, and the Ring still tempts you once a turn", () => {
  assert.equal(EMBLEMS.frodo.passive, true);
  assert.equal(EMBLEMS.frodo.abilities[0].name, 'The Burden');
  const game = powerGame('frodo');
  const p1Bears = (st) => st.battlefield.filter((p) => p.controllerId === 'p1');
  const p2Bears = (st) => st.battlefield.filter((p) => p.controllerId === 'p2');
  // No Ring-bearer yet: no deathtouch.
  assert.ok(p1Bears(game.getState()).every((p) => !p.keywords.includes('deathtouch')));
  const s = usePower(game);
  assert.equal(s.players[0].ring.level, 1);
  const bearers = p1Bears(s).filter((p) => p.keywords.includes('deathtouch'));
  assert.equal(bearers.length, 1, 'just the Ring-bearer');
  assert.equal(bearers[0].id, s.players[0].ring.bearerId);
  // Only your own: the opponent's creatures are untouched, and the power is used for the turn.
  assert.ok(p2Bears(s).every((p) => !p.keywords.includes('deathtouch')));
  assert.equal(activation(s, 'p1'), undefined);
});

test('a power can be used once a turn', () => {
  const game = powerGame('galadriel');
  usePower(game);
  assert.equal(activation(game.getState(), 'p1'), undefined);
});

test('fast forward ignores powers that could do nothing more', () => {
  // Nothing in hand and no creatures: a power on your own creature is no action, one on theirs is.
  const empty = { p1: [], p2: ['bear'] };
  assert.equal(outOfActions(powerGame('burglarBilbo', null, empty).getState(), 'p1'), true);
  assert.equal(outOfActions(powerGame('gandalf', null, empty).getState(), 'p1'), false);
  assert.equal(outOfActions(powerGame('gandalf', null, { p1: [], p2: [] }).getState(), 'p1'), true);
  assert.equal(outOfActions(powerGame('sauron', null, empty).getState(), 'p1'), false);
  assert.equal(outOfActions(powerGame('denethor', null, empty).getState(), 'p1'), true);
  assert.equal(outOfActions(powerGame('frodo', null, empty).getState(), 'p1'), false);
  assert.equal(outOfActions(powerGame('birthdayBilbo', null, empty).getState(), 'p1'), true);
  // Merry's power needs a Food to sacrifice.
  assert.equal(outOfActions(powerGame('merry', null, empty).getState(), 'p1'), true);
});

test('two basic AIs play rounds with every pair of powers', () => {
  const heroes = Object.keys(PAIGOW_HEROES);
  const opponents = Object.keys(PAIGOW_OPPONENTS);
  for (const [i, opponentId] of opponents.entries()) {
    const game = new Game({
      players, decks: { p1: ['bear', 'bear', 'bear'], p2: ['bear', 'bear', 'bear'] }, cards: { bear: BEAR }, shuffleLibraries: false,
      openingHandSize: 3, deckingLoss: false, infiniteMana: true, stallDraw: true, turnLimit: 40,
      emblems: { p1: [PAIGOW_HEROES[heroes[i % heroes.length]].emblem], p2: [PAIGOW_OPPONENTS[opponentId].emblem] },
    });
    game.start();
    const ais = { p1: new BasicAIController({ game: null, playerId: 'p1' }), p2: new BasicAIController({ game: null, playerId: 'p2' }) };
    for (let step = 0; step < 20000; step++) {
      const s = game.getState();
      if (s.status !== GAME_STATUS.IN_PROGRESS) break;
      const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
      const action = ais[actor].chooseAction(s) ?? s.validActions.find((a) => a.playerId === actor);
      assert.equal(game.dispatch(action).ok, true);
    }
    assert.equal(game.getState().status, GAME_STATUS.GAME_OVER, opponentId);
  }
});

test("Strider's power: sorcery speed, and the creature's power becomes 4 until p1's next turn", () => {
  const game = powerGame('strider');
  const s = usePower(game, (st) => st.battlefield.find((p) => p.controllerId === 'p1').id);
  const bearId = s.battlefield.find((p) => p.controllerId === 'p1').id;
  const bear = () => game.getState().battlefield.find((p) => p.id === bearId);
  assert.equal(bear().power, 4);
  assert.equal(bear().toughness, 2);
  // Only as a sorcery: not in combat, on a fresh turn's power.
  const fresh = powerGame('strider');
  assert.ok(activation(fresh.getState(), 'p1'));
  for (let i = 0; i < 50 && fresh.getState().phase === 'precombatMain'; i++) fresh.dispatch(passPriority('p1'));
  let st = fresh.getState();
  for (let i = 0; i < 50 && st.priorityPlayerId !== 'p1'; i++) {
    const actor = st.pendingDecision?.playerId ?? st.priorityPlayerId;
    fresh.dispatch(st.validActions.find((a) => a.playerId === actor));
    st = fresh.getState();
  }
  assert.notEqual(st.phase, 'precombatMain');
  assert.equal(st.priorityPlayerId, 'p1');
  assert.equal(activation(st, 'p1'), undefined);
  /** Passes (no attacks, no blocks) until `done`. */
  const passUntil = (done) => {
    for (let i = 0; i < 500 && !done(game.getState()); i++) {
      const now = game.getState();
      const actor = now.pendingDecision?.playerId ?? now.priorityPlayerId;
      const acts = now.validActions.filter((a) => a.playerId === actor);
      game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type.startsWith('CONFIRM')) ?? acts[0]);
    }
  };
  // Still 4 through the opponent's turn, as a blocker.
  const turn = game.getState().turn;
  passUntil((st) => st.activePlayerId === 'p2' && st.phase === 'combat');
  assert.equal(bear().power, 4);
  passUntil((st) => st.activePlayerId === 'p2' && st.step === 'end');
  assert.equal(bear().power, 4);
  // Gone as p1's next turn begins.
  passUntil((st) => st.activePlayerId === 'p1' && st.turn > turn);
  assert.equal(bear().power, 2);
});

test('every power has a symbol of its own, to tell several apart', () => {
  for (const id of Object.keys(EMBLEMS)) {
    assert.ok(POWER_ICONS[id], `${id} has a symbol`);
    assert.ok(hasIcon(POWER_ICONS[id]), `${id}'s symbol is drawn`);
  }
  const symbols = Object.values(POWER_ICONS);
  assert.equal(new Set(symbols).size, symbols.length);
});

test("Samwise's power: the game starts with Field-Tested Frying Pan, like a Leyline: its enters ability doesn't trigger", () => {
  const game = new Game({
    players, decks: { p1: ['bear'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, shuffleLibraries: false, openingHandSize: 1,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['samwise'], p2: [] }, startingPlayerId: 'p2',
  });
  game.start();
  let s = game.getState();
  const pan = s.battlefield.find((p) => p.cardId === 'fieldTestedFryingPan');
  assert.equal(pan?.controllerId, 'p1');
  assert.equal(pan.attachedTo, null);
  for (let i = 0; i < 20 && s.phase === 'beginning'; i++) {
    game.dispatch(passPriority(s.priorityPlayerId));
    s = game.getState();
  }
  // No Food, no Halfling: just the pan.
  assert.equal(s.stack.length, 0);
  assert.deepEqual(s.battlefield.filter((p) => p.controllerId === 'p1').map((p) => p.cardId), ['fieldTestedFryingPan']);
  // There's nothing to activate.
  assert.equal(activation(s, 'p1'), undefined);
});

test('Field-Tested Frying Pan: equipped creature gets +X/+X whenever you gain life', () => {
  const game = new Game({
    players, decks: { p1: ['bear'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, shuffleLibraries: false, openingHandSize: 1,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['samwise', 'birthdayBilbo'], p2: [] }, startingPlayerId: 'p1',
  });
  game.start();
  const act = (find) => {
    const s = game.getState();
    const action = s.validActions.find((a) => a.playerId === 'p1' && find(a));
    assert.ok(action);
    assert.equal(game.dispatch(action).ok, true);
    for (let i = 0; i < 20 && game.getState().stack.length; i++) game.dispatch(passPriority(game.getState().priorityPlayerId));
  };
  let s = game.getState();
  for (let i = 0; i < 50 && !(s.phase === 'precombatMain' && !s.stack.length && s.priorityPlayerId === 'p1'); i++) {
    game.dispatch(passPriority(s.priorityPlayerId));
    s = game.getState();
  }
  const panId = s.battlefield.find((p) => p.cardId === 'fieldTestedFryingPan').id;
  act((a) => a.type === ACTION.CAST_SPELL);
  const bear = () => game.getState().battlefield.find((p) => p.cardId === 'bear');
  act((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === panId);
  assert.equal(game.getState().battlefield.find((p) => p.id === panId).attachedTo, bear().id);
  assert.equal(bear().power, 2);
  // Birthday Bilbo's power: gain 1 life, so the equipped Bear gets +1/+1.
  act((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-2');
  assert.equal(game.getState().players[0].life, 21);
  assert.equal(bear().power, 3);
  assert.equal(bear().toughness, 3);
});

test("Old Man Willow's power: at its end step, if a creature you controlled died this turn, create a 2/2 green Treefolk", () => {
  const game = new Game({
    players, decks: { p1: ['bear', 'shock'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR, shock: SHOCK }, shuffleLibraries: false,
    openingHandSize: 2, deckingLoss: false, infiniteMana: true, emblems: { p1: ['oldManWillow'], p2: [] }, startingPlayerId: 'p1',
  });
  game.start();
  const treefolk = () => game.getState().battlefield.filter((p) => p.controllerId === 'p1' && p.subtypes?.includes('Treefolk'));
  /** Passes until `done`, resolving whatever triggers. */
  const passUntil = (done) => {
    for (let i = 0; i < 200; i++) {
      const s = game.getState();
      if (done(s)) return s;
      const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
      const acts = s.validActions.filter((a) => a.playerId === actor);
      // No attacks: confirm combat decisions as they are.
      assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type.startsWith('CONFIRM')) ?? acts[0]).ok, true);
    }
    const s = game.getState();
    throw new Error(`Too many steps: turn ${s.turn}, ${s.phase}/${s.step}, ${s.status}, decision ${JSON.stringify(s.pendingDecision)?.slice(0, 200)}`);
  };
  // Turn 1: nothing died, so no Treefolk.
  passUntil((s) => s.turn === 2);
  assert.equal(treefolk().length, 0);
  // Turn 3: p1 casts a Bear, then Shocks it.
  let s = passUntil((st) => st.turn === 3 && st.phase === 'precombatMain' && st.priorityPlayerId === 'p1' && !st.stack.length);
  const hand = s.players[0].hand;
  const castCard = (cardId, targets) => s.validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.CAST_SPELL
    && a.cardId === hand.find((c) => c.cardId === cardId).id && (!targets || a.targets?.[0] === targets[0]));
  assert.equal(game.dispatch(castCard('bear')).ok, true);
  s = passUntil((st) => !st.stack.length && st.priorityPlayerId === 'p1');
  const bear = s.battlefield.find((p) => p.controllerId === 'p1' && p.cardId === 'bear');
  assert.ok(bear);
  const shock = castCard('shock', [bear.id]);
  assert.ok(shock, 'p1 can Shock its own Bear');
  assert.equal(game.dispatch(shock).ok, true);
  passUntil((st) => !st.stack.length && !st.battlefield.some((p) => p.id === bear.id));
  // Its end step: the ring makes a Treefolk.
  s = passUntil((st) => st.turn === 4);
  const [token] = treefolk();
  assert.equal(treefolk().length, 1);
  assert.equal(token.power, 2);
  assert.equal(token.toughness, 2);
  assert.deepEqual(token.colors, ['green']);
  // The next end step of p1's, with nothing dying, makes none.
  passUntil((st) => st.turn === 6);
  assert.equal(treefolk().length, 1);
});

test("Théoden's power: whenever you attack, a 2/2 red Human Knight with trample and haste joins the attack, tapped", () => {
  assert.equal(EMBLEMS.theoden.passive, true);
  assert.equal(EMBLEMS.theoden.abilities.length, 0);
  const game = new Game({
    players, decks: { p1: ['bear'], p2: [] }, cards: { ...CARDS, bear: BEAR }, shuffleLibraries: false,
    openingHandSize: 1, deckingLoss: false, infiniteMana: true, emblems: { p1: ['theoden'], p2: [] }, startingPlayerId: 'p1',
  });
  game.start();
  const knights = () => game.getState().battlefield.filter((p) => p.controllerId === 'p1' && p.subtypes?.includes('Knight'));
  const step = (choose) => {
    const s = game.getState();
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const acts = s.validActions.filter((a) => a.playerId === actor);
    assert.equal(game.dispatch(choose(acts, s) ?? acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type.startsWith('CONFIRM')) ?? acts[0]).ok, true);
  };
  // Turn 1: p1 casts its Bear, and doesn't attack (it can't): no Knight.
  for (let i = 0; i < 200 && game.getState().turn < 3; i++) step((acts) => acts.find((a) => a.type === ACTION.CAST_SPELL));
  assert.equal(knights().length, 0);
  // Turn 3: the Bear attacks; the trigger resolves before blockers.
  for (let i = 0; i < 200 && game.getState().pendingDecision?.type !== 'declareAttackers'; i++) step(() => null);
  const bear = game.getState().battlefield.find((p) => p.cardId === 'bear');
  assert.equal(game.dispatch({ type: ACTION.TOGGLE_ATTACKER, playerId: 'p1', cardId: bear.id }).ok, true);
  assert.equal(game.dispatch({ type: ACTION.CONFIRM_ATTACKERS, playerId: 'p1' }).ok, true);
  for (let i = 0; i < 20 && !knights().length; i++) step(() => null);
  const [knight] = knights();
  assert.ok(knight, 'a Knight token');
  assert.equal(knight.power, 2);
  assert.equal(knight.toughness, 2);
  assert.ok(knight.tapped);
  assert.ok(knight.keywords.includes('trample') && knight.keywords.includes('haste'));
  assert.ok(knight.colors.some((c) => /^(R|red)$/.test(c)));
  const attacker = game.getState().combat.attackers.find((a) => a.cardId === knight.id);
  assert.equal(attacker?.defendingPlayerId, 'p2', 'attacking that player');
  // Both deal damage: 2 + 2.
  for (let i = 0; i < 50 && game.getState().turn === 3 && game.getState().phase !== 'postcombatMain'; i++) step(() => null);
  assert.equal(game.getState().players[1].life, 16);
  // No attack, no Knight: p2's turn passes, and p1 holds back on turn 5.
  for (let i = 0; i < 400 && game.getState().turn < 6; i++) step(() => null);
  assert.equal(knights().length, 1);
});

test("Old Man Willow's power triggers at each end step, the opponent's too", () => {
  const game = new Game({
    players, decks: { p1: ['bear', 'shock'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR, shock: SHOCK }, shuffleLibraries: false,
    openingHandSize: 2, deckingLoss: false, infiniteMana: true, emblems: { p1: ['oldManWillow'], p2: [] }, startingPlayerId: 'p1',
  });
  game.start();
  const treefolk = () => game.getState().battlefield.filter((p) => p.controllerId === 'p1' && p.subtypes?.includes('Treefolk'));
  const passUntil = (done) => {
    for (let i = 0; i < 200; i++) {
      const s = game.getState();
      if (done(s)) return s;
      const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
      const acts = s.validActions.filter((a) => a.playerId === actor);
      assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type.startsWith('CONFIRM')) ?? acts[0]).ok, true);
    }
    throw new Error('Too many steps');
  };
  const castCard = (s, cardId, targets) => s.validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.CAST_SPELL
    && a.cardId === s.players[0].hand.find((c) => c.cardId === cardId).id && (!targets || a.targets?.[0] === targets[0]));
  // Turn 1: p1 casts a Bear.
  let s = passUntil((st) => st.phase === 'precombatMain' && st.priorityPlayerId === 'p1' && !st.stack.length);
  assert.equal(game.dispatch(castCard(s, 'bear')).ok, true);
  s = passUntil((st) => !st.stack.length && st.priorityPlayerId === 'p1');
  const bear = s.battlefield.find((p) => p.controllerId === 'p1' && p.cardId === 'bear');
  assert.ok(bear);
  // Turn 2, p2's: p1 Shocks its own Bear when it gets priority.
  s = passUntil((st) => st.turn === 2 && st.phase === 'precombatMain' && st.priorityPlayerId === 'p1' && !st.stack.length);
  assert.equal(treefolk().length, 0);
  assert.equal(game.dispatch(castCard(s, 'shock', [bear.id])).ok, true);
  passUntil((st) => !st.stack.length && !st.battlefield.some((p) => p.id === bear.id));
  // p2's end step: the ring makes a Treefolk.
  passUntil((st) => st.turn === 3);
  assert.equal(treefolk().length, 1);
});

test("Pippin's power: create a Morsel, a Food artifact with '{T}, Sacrifice this artifact: You gain 1 life'", () => {
  const game = powerGame('pippin');
  let s = usePower(game);
  const morsel = s.battlefield.find((p) => p.controllerId === 'p1' && p.name === 'Morsel');
  assert.ok(morsel, 'a Morsel');
  assert.ok(morsel.token);
  assert.deepEqual(morsel.types, ['Artifact']);
  assert.deepEqual(morsel.subtypes, ['Food']);
  // Eat it: no mana needed.
  const eat = s.validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.ACTIVATE_ABILITY && a.cardId === morsel.id);
  assert.ok(eat, 'the Morsel can be eaten');
  assert.equal(game.dispatch(eat).ok, true);
  for (let i = 0; i < 20 && game.getState().stack.length; i++) game.dispatch(passPriority(game.getState().priorityPlayerId));
  s = game.getState();
  assert.equal(s.players[0].life, 21);
  assert.ok(!s.battlefield.some((p) => p.id === morsel.id));
});

test("Merry's power: sacrifice a Food to create two 1/1 white Halflings, as a sorcery", () => {
  const FOOD_MAKER = { id: 'snack', name: 'Snack', manaCost: { generic: 1 }, types: ['Sorcery'], effects: [{ type: 'createToken', token: 'food' }] };
  const game = new Game({
    players, decks: { p1: ['snack'], p2: ['bear'] }, cards: { bear: BEAR, snack: FOOD_MAKER }, shuffleLibraries: false,
    openingHandSize: 1, deckingLoss: false, infiniteMana: true, emblems: { p1: ['merry'], p2: [] }, startingPlayerId: 'p1',
  });
  game.start();
  const pass = (done) => {
    for (let i = 0; i < 100; i++) {
      const s = game.getState();
      if (done(s)) return s;
      const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
      const acts = s.validActions.filter((a) => a.playerId === actor);
      assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY) ?? acts[0]).ok, true);
    }
    throw new Error('Too many steps');
  };
  let s = pass((st) => st.phase === 'precombatMain' && st.priorityPlayerId === 'p1' && !st.stack.length);
  // No Food, no power.
  assert.ok(!activation(s, 'p1'));
  assert.equal(game.dispatch(s.validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.CAST_SPELL)).ok, true);
  pass((st) => !st.stack.length && st.priorityPlayerId === 'p1');
  s = usePower(game);
  const halflings = s.battlefield.filter((p) => p.controllerId === 'p1' && p.subtypes?.includes('Halfling'));
  assert.equal(halflings.length, 2);
  assert.ok(halflings.every((p) => p.power === 1 && p.toughness === 1 && p.colors.includes('white')));
  assert.ok(!s.battlefield.some((p) => p.subtypes?.includes('Food')), 'the Food was sacrificed');
});

test("Gildor's power: as the game starts, after the opening hand, two Forests and a Chance-Met Elves are shuffled into the library", () => {
  const game = new Game({
    players, decks: { p1: ['bear', 'bear'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, openingHandSize: 2,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['gildor'], p2: [] }, startingPlayerId: 'p2', seed: 7,
  });
  game.start();
  const s = game.getState();
  const [mine, theirs] = s.players;
  // The opening hand is still the deck's own.
  assert.deepEqual(mine.hand.map((c) => c.cardId), ['bear', 'bear']);
  assert.deepEqual(mine.library.map((c) => c.cardId).sort(), ['chanceMetElves', 'forest', 'forest']);
  assert.equal(theirs.library.length, 0);
  // There's nothing to activate.
  assert.equal(activation(s, 'p1'), undefined);
});

/** Passes (or takes the first choice) until `done(state)`, and returns that state. */
function passUntil(game, done) {
  for (let i = 0; i < 500; i++) {
    const s = game.getState();
    if (done(s)) return s;
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const acts = s.validActions.filter((a) => a.playerId === actor);
    assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type === ACTION.CONFIRM_CHOICE) ?? acts[0]).ok, true);
  }
  throw new Error('Too many steps');
}

const p1Main = (s) => s.activePlayerId === 'p1' && s.phase === 'precombatMain' && s.priorityPlayerId === 'p1' && !s.stack.length && !s.pendingDecision;

test("Legolas's power: his library starts with his kit; as a sorcery, mill six cards to add a Legolas's Quick Reflexes to his hand", () => {
  const game = new Game({
    players, decks: { p1: ['bear', 'bear'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, openingHandSize: 2,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['legolas'], p2: [] }, startingPlayerId: 'p2', seed: 3,
  });
  game.start();
  let s = passUntil(game, (st) => st.activePlayerId === 'p2' && st.phase === 'precombatMain' && st.priorityPlayerId === 'p1');
  // Sorcery speed: not on the opponent's turn.
  assert.equal(activation(s, 'p1'), undefined);
  // The opening hand is still the deck's own; his library is two Elven Farsight, an Elven Chorus and seven Forests.
  assert.deepEqual(s.players[0].hand.map((c) => c.cardId), ['bear', 'bear']);
  assert.deepEqual(s.players[0].library.map((c) => c.cardId).sort(), ['elvenChorus', 'elvenFarsight', 'elvenFarsight', ...Array(7).fill('forest')]);
  s = passUntil(game, p1Main);
  // He drew one: nine left.
  assert.equal(s.players[0].library.length, 9);
  s = usePower(game);
  const me = s.players[0];
  assert.equal(me.library.length, 3);
  assert.equal(me.graveyard.length, 6);
  // His two Bears, the card he drew, and Legolas's Quick Reflexes.
  assert.equal(me.hand.length, 4);
  assert.equal(me.hand.filter((c) => c.cardId === 'legolassQuickReflexes').length, 1);
  // Once a turn.
  assert.equal(activation(s, 'p1'), undefined);
  // On his next turn, with fewer than six cards to mill, it can't be used.
  passUntil(game, (st) => st.activePlayerId === 'p2');
  s = passUntil(game, p1Main);
  assert.equal(s.players[0].library.length, 2);
  assert.equal(activation(s, 'p1'), undefined);
  // Fast forward doesn't count it with too few cards to mill, nor with no creature of his own to cast the card on.
  assert.equal(outOfActions(s, 'p1'), false, 'he has cards in hand');
  const empty = new Game({
    players, decks: { p1: [], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, openingHandSize: 0,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['legolas'], p2: [] }, startingPlayerId: 'p1', seed: 3,
  });
  empty.start();
  const st = passUntil(empty, p1Main);
  assert.equal(st.players[0].library.length, 10);
  assert.ok(activation(st, 'p1'), 'the power can be used');
  assert.equal(outOfActions(st, 'p1'), true);
});

test("Legolas's Quick Reflexes: split second; untap target creature; reach, hexproof, and it shoots when it becomes tapped", () => {
  const TAPPER = { id: 'tapper', name: 'Tapper', manaCost: {}, types: ['Instant'], target: 'creature', effects: [{ type: 'tap' }] };
  const game = new Game({
    players, decks: { p1: ['bear', 'legolassQuickReflexes', 'tapper', 'tapper'], p2: ['bear', 'shock'] },
    cards: { ...CARDS, bear: BEAR, tapper: TAPPER, shock: SHOCK }, shuffleLibraries: false, openingHandSize: 4,
    deckingLoss: false, infiniteMana: true, emblems: { p1: [], p2: [] }, startingPlayerId: 'p2',
  });
  game.start();
  const castBy = (playerId, cardId, targets) => {
    const s = game.getState();
    const card = s.players.find((p) => p.id === playerId).hand.find((c) => c.cardId === cardId);
    const action = s.validActions.find((a) => a.type === ACTION.CAST_SPELL && a.cardId === card.id
      && (!targets || JSON.stringify(a.targets) === JSON.stringify(targets)));
    assert.ok(action, `${cardId} can be cast: ${JSON.stringify(s.validActions.filter((a) => a.cardId === card.id))} ${s.phase} ${s.priorityPlayerId}`);
    assert.equal(game.dispatch(action).ok, true);
  };
  // p2 casts its Bear on its turn.
  let s = passUntil(game, (st) => st.activePlayerId === 'p2' && st.phase === 'precombatMain' && st.priorityPlayerId === 'p2');
  castBy('p2', 'bear');
  s = passUntil(game, p1Main);
  castBy('p1', 'bear');
  s = passUntil(game, (st) => !st.stack.length && st.priorityPlayerId === 'p1');
  const mine = s.battlefield.find((p) => p.controllerId === 'p1' && p.cardId === 'bear');
  const theirs = s.battlefield.find((p) => p.controllerId === 'p2' && p.cardId === 'bear');
  // Tap the Bear first, so there's something to untap.
  castBy('p1', 'tapper', [mine.id]);
  s = passUntil(game, (st) => !st.stack.length && st.priorityPlayerId === 'p1');
  assert.equal(s.battlefield.find((p) => p.id === mine.id).tapped, true);
  castBy('p1', 'legolassQuickReflexes', [mine.id]);
  // Split second: p1 passes, and p2, with Shock in hand and priority, can only pass too.
  assert.equal(game.dispatch(passPriority('p1')).ok, true);
  s = game.getState();
  assert.equal(s.priorityPlayerId, 'p2');
  assert.deepEqual(s.validActions.filter((a) => a.playerId === 'p2').map((a) => a.type), [ACTION.PASS_PRIORITY]);
  s = passUntil(game, (st) => !st.stack.length && st.priorityPlayerId === 'p1');
  let bear = s.battlefield.find((p) => p.id === mine.id);
  assert.equal(bear.tapped, false);
  assert.ok(bear.keywords.includes('reach') && bear.keywords.includes('hexproof'));
  // Once it's resolved, spells can be cast again; and as the Bear becomes tapped, it shoots theirs.
  castBy('p1', 'tapper', [mine.id]);
  s = passUntil(game, (st) => !st.stack.length && !st.pendingTriggers?.length && (st.pendingDecision || st.priorityPlayerId === 'p1'));
  for (let i = 0; i < 20 && s.battlefield.some((p) => p.id === theirs.id); i++) {
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const acts = s.validActions.filter((a) => a.playerId === actor);
    const aim = acts.find((a) => a.targets?.[0] === theirs.id);
    if (!aim && !s.stack.length && !s.pendingDecision) break;
    assert.equal(game.dispatch(aim ?? acts.find((a) => a.type === ACTION.PASS_PRIORITY) ?? acts[0]).ok, true);
    s = game.getState();
  }
  assert.ok(!s.battlefield.some((p) => p.id === theirs.id), 'the Bear shot theirs for 2');
  bear = s.battlefield.find((p) => p.id === mine.id);
  assert.equal(bear.tapped, true);
});

test("Elrond's ring: as the game starts, two Forests and an Elrond, Master of Healing are shuffled into the library", () => {
  const game = new Game({
    players, decks: { p1: ['bear', 'bear'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, openingHandSize: 2,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['elrond'], p2: [] }, startingPlayerId: 'p2', seed: 7,
  });
  game.start();
  const [mine, theirs] = game.getState().players;
  // The opening hand is still the deck's own.
  assert.deepEqual(mine.hand.map((c) => c.cardId), ['bear', 'bear']);
  assert.deepEqual(mine.library.map((c) => c.cardId).sort(), ['elrondMasterOfHealing', 'forest', 'forest']);
  assert.equal(theirs.library.length, 0);
});

test("Galadriel's ring: as the game starts, three Forests, a Galadriel of Lothlórien and a Celeborn the Wise are shuffled into the library", () => {
  const game = new Game({
    players, decks: { p1: ['bear', 'bear'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, openingHandSize: 2,
    deckingLoss: false, infiniteMana: true, emblems: { p1: ['galadriel'], p2: [] }, startingPlayerId: 'p2', seed: 7,
  });
  game.start();
  const [mine, theirs] = game.getState().players;
  // The opening hand is still the deck's own.
  assert.deepEqual(mine.hand.map((c) => c.cardId), ['bear', 'bear']);
  assert.deepEqual(mine.library.map((c) => c.cardId).sort(), ['celebornTheWise', 'forest', 'forest', 'forest', 'galadrielOfLothlorien']);
  assert.equal(theirs.library.length, 0);
});

test("the Rider in Black's power: at his end step, each opponent with a Ring-bearer loses life equal to their Ring's abilities", () => {
  /** p1's life as the Rider's (p2's) next end step begins, and once it's over. */
  const endStepLoss = (game) => {
    let before = null;
    for (let i = 0; i < 500; i++) {
      const s = game.getState();
      if (s.activePlayerId === 'p2' && s.step === 'end' && before === null) before = s.players[0].life;
      if (before !== null && s.activePlayerId === 'p1') return before - s.players[0].life;
      const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
      const acts = s.validActions.filter((a) => a.playerId === actor);
      // Nobody attacks or casts anything: just the power.
      assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type.startsWith('CONFIRM')) ?? acts[0]).ok, true);
    }
    throw new Error('Too many steps.');
  };
  // Frodo's power: the Ring tempts p1, and one of their Bears (2/2) becomes the Ring-bearer. Their Ring has one
  // ability, so they lose 1 (not the Bear's 2).
  const tempted = powerGame('frodo', 'riderInBlack');
  let s = usePower(tempted);
  assert.ok(s.players[0].ring.bearerId);
  assert.equal(s.players[0].ring.level, 1);
  assert.equal(endStepLoss(tempted), 1);
  // Tempted again on p1's next turn: two abilities, 2 life.
  for (let i = 0; i < 500 && !(tempted.getState().activePlayerId === 'p1' && tempted.getState().phase === 'precombatMain'
    && !tempted.getState().stack.length && tempted.getState().priorityPlayerId === 'p1'); i++) {
    tempted.dispatch(passPriority(tempted.getState().priorityPlayerId));
  }
  s = usePower(tempted);
  assert.equal(s.players[0].ring.level, 2);
  assert.equal(endStepLoss(tempted), 2);
  // No Ring-bearer, no life lost.
  assert.equal(endStepLoss(powerGame(null, 'riderInBlack')), 0);
  assert.equal(EMBLEMS.riderInBlack.text, 'At the beginning of your end step, each opponent who controls a Ring-bearer loses life equal to the number of abilities their Ring has.');
});

test("the Rider in Black's second power: 0: the Ring tempts you, once a turn, only as a sorcery", () => {
  const game = powerGame('riderInBlack', null);
  let s = usePower(game);
  assert.equal(s.players[0].ring.level, 1);
  assert.ok(s.players[0].ring.bearerId);
  assert.equal(activation(s, 'p1'), undefined, 'once a turn');
  assert.equal(EMBLEMS.riderInBlack.abilities[0].text, '0: The Ring tempts you. Activate only as a sorcery.');
  /** Passes (or makes the first choice of a decision), nobody casting or activating anything. */
  const step = () => {
    const st = game.getState();
    const actor = st.pendingDecision?.playerId ?? st.priorityPlayerId;
    const acts = st.validActions.filter((a) => a.playerId === actor);
    assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY || a.type.startsWith('CONFIRM')) ?? acts[0]).ok, true);
  };
  // Not on the opponent's turn.
  for (let i = 0; i < 500 && game.getState().activePlayerId === 'p1'; i++) step();
  let seen = false;
  for (let i = 0; i < 500 && game.getState().activePlayerId === 'p2'; i++) {
    seen ||= Boolean(activation(game.getState(), 'p1'));
    step();
  }
  assert.equal(seen, false, 'not on the opponent’s turn');
  // On their own next main phase, again.
  for (let i = 0; i < 500 && !activation(game.getState(), 'p1'); i++) step();
  s = game.getState();
  assert.equal(s.activePlayerId, 'p1');
  assert.equal(s.phase, 'precombatMain');
});

test("Strider's power can target any creature: an opponent's grows or shrinks to 4 power too", () => {
  const theirs = (st) => st.battlefield.find((p) => p.controllerId === 'p2');
  const game = powerGame('strider');
  const targets = game.getState().validActions.filter((a) => a.playerId === 'p1' && a.cardId === 'p1-emblem-1').map((a) => a.targets[0]);
  assert.ok(targets.includes(theirs(game.getState()).id), 'an opponent\'s creature is a legal target');
  const s = usePower(game, (st) => theirs(st).id);
  assert.equal(theirs(s).power, 4);
  // Fast forward: with nothing of our own, it can only shrink a creature of theirs bigger than 4.
  const ffState = (power) => ({
    players: [{ id: 'p1', hand: [], emblems: [{ emblemId: 'strider', activationsThisTurn: 0, activationsPerTurn: 1, abilities: EMBLEMS.strider.abilities }], exile: [], graveyard: [], ring: { level: 0 } },
      { id: 'p2', hand: [], emblems: [], exile: [], graveyard: [] }],
    battlefield: [{ id: 'x', controllerId: 'p2', types: ['Creature'], power, toughness: power, abilities: [] }],
  });
  assert.equal(outOfActions(ffState(2), 'p1'), true);
  assert.equal(outOfActions(ffState(9), 'p1'), false);
});

test("Radagast's power: creature spells can be cast as though they had flash (and only creatures)", () => {
  const make = (emblems) => {
    const game = new Game({
      players, decks: { p1: ['bear', 'hobbitsSting'], p2: ['bear'] }, cards: { ...CARDS, bear: BEAR }, shuffleLibraries: false, openingHandSize: 2,
      deckingLoss: false, infiniteMana: true, emblems: { p1: emblems, p2: [] }, startingPlayerId: 'p2',
    });
    game.start();
    // p2's upkeep: p1 gets priority on the opponent's turn.
    let s = game.getState();
    for (let i = 0; i < 20 && s.priorityPlayerId !== 'p1'; i++) {
      game.dispatch(passPriority(s.priorityPlayerId));
      s = game.getState();
    }
    assert.equal(s.activePlayerId, 'p2');
    return s;
  };
  const casts = (s) => s.validActions.filter((a) => a.playerId === 'p1' && a.type === ACTION.CAST_SPELL)
    .map((a) => s.players[0].hand.find((c) => c.id === a.cardId).cardId);
  assert.deepEqual(casts(make([])), []);
  const s = make(['radagast']);
  assert.deepEqual(casts(s), ['bear']);
  assert.deepEqual(s.players[0].emblems[0].rules, ['flashForCreatures']);
  assert.equal(activation(s, 'p1'), undefined, 'a passive power: nothing to activate');
});

test("Radagast's power: Birds and Beasts you control get +1/+1 (not other creatures, not the opponent's)", () => {
  const game = new Game({
    players, decks: { p1: ['gwaihirTheWindlord', 'bear'], p2: ['gwaihirTheWindlord'] }, cards: { ...CARDS, bear: BEAR }, shuffleLibraries: false,
    openingHandSize: 2, deckingLoss: false, infiniteMana: true, emblems: { p1: ['radagast'], p2: [] }, startingPlayerId: 'p1',
  });
  game.start();
  const settle = () => {
    for (let i = 0; i < 60; i++) {
      const s = game.getState();
      if (!s.pendingDecision && !s.stack.length && s.priorityPlayerId === 'p1' && s.phase === 'precombatMain') return;
      const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
      const acts = s.validActions.filter((a) => a.playerId === actor);
      game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY) ?? acts[0]);
    }
  };
  settle();
  for (let n = 0; n < 2; n++) {
    const s = game.getState();
    assert.equal(game.dispatch(s.validActions.find((a) => a.playerId === 'p1' && a.type === ACTION.CAST_SPELL)).ok, true);
    settle();
  }
  const mine = (cardId) => game.getState().battlefield.find((p) => p.cardId === cardId);
  assert.deepEqual([mine('gwaihirTheWindlord').power, mine('gwaihirTheWindlord').toughness], [5, 5]);
  assert.deepEqual([mine('bear').power, mine('bear').toughness], [2, 2]);
});
