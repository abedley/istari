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
    players, decks: { p1, p2 }, cards: { bear: BEAR }, shuffleLibraries: false, openingHandSize: 5,
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

/** Activates p1's power (on its first legal target), lets it resolve, and returns the state. */
function usePower(game) {
  const action = activation(game.getState(), 'p1');
  assert.ok(action, 'the power can be activated');
  assert.equal(game.dispatch(action).ok, true);
  for (let i = 0; i < 50; i++) {
    const s = game.getState();
    if (s.stack.length === 0 && !s.pendingDecision) return s;
    const actor = s.pendingDecision?.playerId ?? s.priorityPlayerId;
    const acts = s.validActions.filter((a) => a.playerId === actor);
    assert.equal(game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY) ?? acts[0]).ok, true);
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
      assert.equal(emblem.abilities.length, 0);
      assert.ok(emblem.text && [...(emblem.startsWith ?? []), ...(emblem.shufflesIn ?? [])].every((id) => CARDS[id]));
      assert.ok(emblem.startsWith?.length || emblem.triggeredAbilities?.length || emblem.shufflesIn?.length, `${person.name}'s passive power does something`);
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
  assert.deepEqual(Object.values(PAIGOW_HEROES).map((h) => h.name), ['Frodo', 'Strider', 'Samwise']);
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
  s = usePower(powerGame('strider'));
  assert.equal(p1Bear(s).power, 4);
  assert.equal(p1Bear(s).toughness, 2);
  s = usePower(powerGame('gandalf'));
  assert.equal(p2Bears(s).filter((p) => p.tapped).length, 1);
  s = usePower(powerGame('sauron'));
  assert.ok(s.battlefield.some((p) => p.controllerId === 'p1' && p.subtypes?.includes('Army') && p.power === 1));
  s = usePower(powerGame('saruman'));
  assert.ok(p2Bears(s).some((p) => p.power === 0));
  s = usePower(powerGame('theoden'));
  assert.equal(p1Bear(s).power, 3);
  assert.ok(p1Bear(s).keywords.includes('haste'));
  s = usePower(powerGame('denethor', null, { p2: ['bear', 'bear', 'bear', 'bear', 'bear', 'bear', 'bear'] }));
  assert.equal(s.players[0].life, 19);
  assert.equal(s.players[1].graveyard.length, 1);
  s = usePower(powerGame('elrond'));
  assert.ok(p1Bear(s).keywords.includes('hexproof') && p1Bear(s).keywords.includes('indestructible'));
  s = usePower(powerGame('galadriel'));
  assert.equal(p1Bear(s).power, 3);
  s = usePower(powerGame('tomBombadil'));
  assert.equal(p1Bear(s).toughness, 4);
  s = usePower(powerGame('birthdayBilbo'));
  assert.equal(s.players[0].life, 21);
  s = usePower(powerGame('burglarBilbo'));
  assert.equal(p1Bear(s).power, 3);
  assert.ok(p1Bear(s).keywords.includes('menace'));
});

test('a power can be used once a turn', () => {
  const game = powerGame('galadriel');
  usePower(game);
  assert.equal(activation(game.getState(), 'p1'), undefined);
});

test('fast forward ignores powers that could do nothing more', () => {
  // Nothing in hand and no creatures: a power on your own creature is no action, one on theirs is.
  const empty = { p1: [], p2: ['bear'] };
  assert.equal(outOfActions(powerGame('galadriel', null, empty).getState(), 'p1'), true);
  assert.equal(outOfActions(powerGame('gandalf', null, empty).getState(), 'p1'), false);
  assert.equal(outOfActions(powerGame('gandalf', null, { p1: [], p2: [] }).getState(), 'p1'), true);
  assert.equal(outOfActions(powerGame('sauron', null, empty).getState(), 'p1'), false);
  assert.equal(outOfActions(powerGame('denethor', null, empty).getState(), 'p1'), true);
  assert.equal(outOfActions(powerGame('frodo', null, empty).getState(), 'p1'), false);
  assert.equal(outOfActions(powerGame('birthdayBilbo', null, empty).getState(), 'p1'), true);
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

test("Strider's power: sorcery speed, and the creature's power becomes 4 until end of turn", () => {
  const game = powerGame('strider');
  const s = usePower(game);
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
  // Gone by the opponent's turn.
  for (let i = 0; i < 500 && game.getState().activePlayerId === 'p1'; i++) {
    const now = game.getState();
    const actor = now.pendingDecision?.playerId ?? now.priorityPlayerId;
    const acts = now.validActions.filter((a) => a.playerId === actor);
    game.dispatch(acts.find((a) => a.type === ACTION.PASS_PRIORITY) ?? acts[0]);
  }
  assert.equal(game.getState().activePlayerId, 'p2');
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

test("Old Man Willow's power: at your end step, if a creature you controlled died this turn, create a 2/2 green Treefolk", () => {
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
