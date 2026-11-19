import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAIGOW_OPPONENTS, PAIGOW_HEROES, opponentSetup } from '../src/paigow/personas.js';
import { createMatch } from '../src/paigow/paigow.js';
import { dailyMatch } from '../src/paigow/daily.js';
import { CAMPAIGN_OPPONENTS, CAMPAIGN_BOOKS } from '../src/paigow/campaign.js';
import { placeOf } from '../src/paigow/places.js';
import { PERSONA_TEMPERAMENT } from '../src/ai/strategist/profiles.js';

const OWN_CARD = { merry: 'meriadocBrandybuck', pippin: 'peregrinTook', strider: 'striderRangerOfTheNorth' };

test('Merry, Pippin and Strider are Book I opponents, with their heroes’ rings and their own cards in every pack', () => {
  for (const [id, card] of Object.entries(OWN_CARD)) {
    const opponent = PAIGOW_OPPONENTS[id];
    assert.equal(opponent.emblem, PAIGOW_HEROES[id].emblem, id);
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

test('a random or daily match never pairs a hero with themselves', () => {
  for (const heroId of Object.keys(OWN_CARD)) {
    for (let seed = 1; seed <= 300; seed += 1) assert.notEqual(createMatch({ seed, heroId }).opponentId, heroId);
  }
  for (let day = 0; day < 400; day += 1) {
    const match = dailyMatch(new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10));
    assert.notEqual(PAIGOW_OPPONENTS[match.opponentId].emblem, PAIGOW_HEROES[match.heroId].emblem);
  }
});
