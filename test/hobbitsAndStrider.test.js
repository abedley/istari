import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPPONENTS, HEROES, opponentSetup } from '../src/match/personas.js';
import { createMatch } from '../src/match/match.js';
import { CAMPAIGN_OPPONENTS, CAMPAIGN_BOOKS } from '../src/match/campaign.js';
import { placeOf } from '../src/match/places.js';
import { PERSONA_TEMPERAMENT } from '../src/ai/strategist/profiles.js';

const OWN_CARD = { merry: 'meriadocBrandybuck', pippin: 'peregrinTook', strider: 'striderRangerOfTheNorth' };

test('Merry, Pippin and Strider are Book I opponents, with their heroes’ rings and their own cards in every pack', () => {
  for (const [id, card] of Object.entries(OWN_CARD)) {
    const opponent = OPPONENTS[id];
    assert.equal(opponent.emblem, HEROES[id].emblem, id);
    assert.ok(CAMPAIGN_OPPONENTS.includes(id), id);
    assert.ok(CAMPAIGN_BOOKS[0].pool.includes(id), id);
    assert.ok(placeOf(id)?.art, `${id}'s place has art`);
    assert.ok(PERSONA_TEMPERAMENT[id], id);
    assert.deepEqual(opponentSetup(id).pack, [card]);
    for (let seed = 1; seed <= 10; seed += 1) {
      assert.ok(createMatch({ seed, heroId: 'frodo', opponentId: id }).cpuDecks.flat().includes(card), `${id}, seed ${seed}`);
    }
  }
});

test('a random match never pairs a hero with themselves', () => {
  for (const heroId of Object.keys(OWN_CARD)) {
    for (let seed = 1; seed <= 300; seed += 1) assert.notEqual(createMatch({ seed, heroId }).opponentId, heroId);
  }
});
