import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION, PHASE, TOKEN, EFFECT, KEYWORD } from '../src/index.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { PAIGOW_OPPONENTS, opponentSetup } from '../src/paigow/personas.js';
import { createMatch, PAIGOW_RULES } from '../src/paigow/paigow.js';
import { CAMPAIGN_OPPONENTS } from '../src/paigow/campaign.js';
import { placeOf } from '../src/paigow/places.js';
import { TOKEN_PRESENTATION } from '../src/cards/tokenArt.js';
import {
  setup, state, ok, cast, advanceTo, named,
} from './helpers/ltrGame.js';

const HOARD = { id: 'hoard', name: 'Hoard', manaCost: {}, types: ['Sorcery'], effects: [{ type: EFFECT.CREATE_TOKEN, count: 2, token: TOKEN.TREASURE }] };

const fernyGame = () => setup({ p1: ['hoard'], extra: { hoard: HOARD }, options: { emblems: { p1: ['billFerny'], p2: [] } } });

const powers = (game) => state(game).validActions.filter((a) => a.type === ACTION.ACTIVATE_ABILITY && a.cardId === 'p1-emblem-1');
const resolve = (game) => {
  for (let i = 0; i < 10 && state(game).stack.length; i++) ok(game, { type: ACTION.PASS_PRIORITY, playerId: state(game).priorityPlayerId });
};

test('Bill Ferny is an opponent whose power sacrifices a Treasure for a Nazgûl', () => {
  assert.equal(PAIGOW_OPPONENTS.billFerny.emblem, 'billFerny');
  assert.ok(CAMPAIGN_OPPONENTS.includes('billFerny'));
  assert.equal(placeOf('billFerny').card, 'Bill Ferny, Bree Swindler');
  assert.equal(EMBLEMS.billFerny.abilities[0].timing, 'sorcery');

  const { game } = fernyGame();
  advanceTo(game, { turn: 1, phase: PHASE.PRECOMBAT_MAIN });
  assert.equal(powers(game).length, 0, 'no Treasure, no power');
  cast(game, 'p1', 'hoard');
  resolve(game);
  const [action] = powers(game);
  assert.ok(action, 'a Treasure to sacrifice');
  ok(game, action);
  resolve(game);
  assert.equal(named(game, 'Treasure').length, 1, 'one Treasure sacrificed');
  const [nazgul] = named(game, 'Nazgûl');
  assert.ok(nazgul?.token, 'a Nazgûl token');
  assert.ok(nazgul.keywords.includes(KEYWORD.DEATHTOUCH));
  assert.deepEqual(nazgul.subtypes, ['Wraith', 'Knight']);
  // It entered, so the Ring tempted him, and so it got a +1/+1 counter, as the card's would.
  assert.equal(state(game).players.find((p) => p.id === 'p1').ring.level, 1);
  assert.deepEqual([nazgul.power, nazgul.toughness], [2, 3]);
  assert.equal(powers(game).length, 0, 'once a turn');
  assert.ok(Object.keys(TOKEN_PRESENTATION).some((id) => id.startsWith('token:Nazgûl:1/2:black:deathtouch')), 'the token has art');
});

test('Bill Ferny’s packs always hold two of himself and two Bill the Ponys', () => {
  assert.deepEqual(opponentSetup('billFerny').pack, ['billFernyBreeSwindler', 'billFernyBreeSwindler', 'billThePony', 'billThePony']);
  for (let seed = 1; seed <= 20; seed += 1) {
    const cards = createMatch({ seed, opponentId: 'billFerny' }).cpuDecks.flat();
    assert.equal(cards.filter((id) => id === 'billFernyBreeSwindler').length, 2, `seed ${seed}`);
    assert.equal(cards.filter((id) => id === 'billThePony').length, 2, `seed ${seed}`);
    assert.equal(cards.length, PAIGOW_RULES.cardsDealt);
  }
});
