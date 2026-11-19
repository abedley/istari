import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION, PHASE, KEYWORD } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { PAIGOW_OPPONENTS, opponentSetup } from '../src/paigow/personas.js';
import { createMatch } from '../src/paigow/paigow.js';
import { CAMPAIGN_OPPONENTS } from '../src/paigow/campaign.js';
import { placeOf } from '../src/paigow/places.js';
import {
  setup, state, ok, cast, advanceTo, byCard, player,
} from './helpers/ltrGame.js';

const glorfindelGame = (p1) => setup({ p1, options: { emblems: { p1: ['glorfindel'], p2: [] } } });
const powers = (game) => state(game).validActions.filter((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-1');

/** Passes priority until the stack is empty, answering a scry by keeping everything on top. */
function resolve(game) {
  let scried = 0;
  for (let i = 0; i < 20; i++) {
    const s = state(game);
    if (s.pendingDecision?.kind === 'scry') {
      scried += s.pendingDecision.options.length;
      for (const choice of s.pendingDecision.options) ok(game, { type: ACTION.TOGGLE_CHOICE, playerId: 'p1', choice });
      ok(game, { type: ACTION.CONFIRM_CHOICE, playerId: 'p1' });
    } else if (s.stack.length) ok(game, { type: ACTION.PASS_PRIORITY, playerId: s.priorityPlayerId });
    else return scried;
  }
  throw new Error('Did not resolve');
}

test('Glorfindel is an opponent whose packs always hold his own card', () => {
  assert.equal(PAIGOW_OPPONENTS.glorfindel.emblem, 'glorfindel');
  assert.ok(CAMPAIGN_OPPONENTS.includes('glorfindel'));
  assert.equal(placeOf('glorfindel').card, 'Horses of the Bruinen');
  assert.deepEqual(opponentSetup('glorfindel').pack, ['glorfindelDauntlessRescuer']);
  for (let seed = 1; seed <= 20; seed += 1) {
    assert.ok(createMatch({ seed, opponentId: 'glorfindel' }).cpuDecks.flat().includes('glorfindelDauntlessRescuer'), `seed ${seed}`);
  }
});

test('Glorfindel’s ring shuffles a Forest, a Rivendell and a Horses of the Bruinen into his library as the game starts', () => {
  assert.deepEqual(EMBLEMS.glorfindel.shufflesIn, ['forest', 'rivendell', 'horsesOfTheBruinen']);
  const without = setup({ p1: ['bear'] });
  const { game } = glorfindelGame(['bear']);
  const library = player(game, 'p1').library.map((c) => c.cardId);
  assert.equal(library.length, player(without.game, 'p1').library.length + 3);
  for (const id of ['rivendell', 'horsesOfTheBruinen']) assert.ok(library.includes(id), id);
});

test('Glorfindel’s power: a creature of his gains first strike until end of turn, then he scries 1, as a sorcery, once a turn', () => {
  const ability = EMBLEMS.glorfindel.abilities[0];
  assert.equal(ability.timing, 'sorcery');
  assert.equal(ability.target, 'creatureYouControl');
  const { game } = glorfindelGame(['bear']);
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  assert.equal(powers(game).length, 0, 'no creature, no power');
  cast(game, 'p1', 'bear');
  resolve(game);
  const bear = byCard(game, 'bear')[0];
  ok(game, powers(game).find((a) => a.targets?.[0] === bear.id));
  assert.equal(resolve(game), 1, 'scry 1');
  assert.ok(byCard(game, 'bear')[0].keywords.includes(KEYWORD.FIRST_STRIKE));
  assert.equal(powers(game).length, 0, 'once a turn');
  advanceTo(game, { turn: 2, phase: PHASE.PRECOMBAT_MAIN });
  assert.ok(!byCard(game, 'bear')[0].keywords.includes(KEYWORD.FIRST_STRIKE), 'until end of turn');
});
