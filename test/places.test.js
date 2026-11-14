import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/cards/cards.js';
import { CAMPAIGN_OPPONENTS } from '../src/paigow/campaign.js';
import { PAIGOW_OPPONENTS } from '../src/paigow/personas.js';
import {
  PLACES, JOURNEYS_END, AMBIENCE, placeOf, withArt,
} from '../src/paigow/places.js';

test('every opponent is met at a place of its own, with a card\'s art', () => {
  const names = new Set();
  for (const id of Object.keys(PAIGOW_OPPONENTS)) {
    const spot = placeOf(id);
    assert.ok(spot, `${id} has no place`);
    assert.ok(spot.name && spot.line, `${id}: a name and a line`);
    assert.ok(CARDS[spot.cardId], `${id}: no card ${spot.cardId}`);
    assert.match(spot.art ?? '', /^https:\/\/cards\.scryfall\.io\/art_crop\//, `${id}: ${spot.cardId} has no art`);
    assert.ok(spot.artist, `${id}: no artist`);
    assert.ok(Object.values(AMBIENCE).includes(spot.ambience), `${id}: ambience ${spot.ambience}`);
    for (const axis of [spot.x, spot.y]) assert.ok(axis >= 0 && axis <= 100);
    assert.ok(!names.has(spot.name), `${spot.name} is used twice`);
    names.add(spot.name);
  }
  assert.deepEqual(Object.keys(PLACES).sort(), Object.keys(PAIGOW_OPPONENTS).sort());
  for (const id of CAMPAIGN_OPPONENTS) assert.ok(PLACES[id], id);
});

test('the journey\'s end has art too, and an unknown opponent has no place', () => {
  assert.match(withArt(JOURNEYS_END).art, /^https:\/\/cards\.scryfall\.io\/art_crop\//);
  assert.equal(placeOf('nobody'), null);
});
