// How the CPU splits its cards into three decks (src/paigow/deckBuilder.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../src/engine/random.js';
import { CARDS, isCreature } from '../src/cards/cards.js';
import {
  openBooster, arrangeCpuDecks, createMatch, PAIGOW_POOL, PAIGOW_RULES,
} from '../src/paigow/paigow.js';
import {
  buildDecks, deckScore, winChance, matchChance, deckPlan, cardTags,
} from '../src/paigow/deckBuilder.js';
import { CARD_RATINGS, CREATURE_COUNT_BONUS, FIELD_SCORES } from '../src/paigow/cardRatings.js';

const chanceOf = (decks) => matchChance(...decks.map((deck) => winChance(deckScore(deck))));

test('every card in the pool has a rating, and creatures are what decks need', () => {
  for (const id of PAIGOW_POOL) assert.equal(typeof CARD_RATINGS[id], 'number', id);
  assert.equal(CREATURE_COUNT_BONUS.length, 6);
  assert.ok(CREATURE_COUNT_BONUS[0] < CREATURE_COUNT_BONUS[3], 'no creatures is worse than three');
  assert.ok(FIELD_SCORES.every((score, i) => i === 0 || score >= FIELD_SCORES[i - 1]), 'quantiles in order');
});

test('a split uses each of the fifteen cards once, in three decks of five', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cards = openBooster(seededRandom(seed));
    const decks = buildDecks(cards, seededRandom(seed), { persona: 'sauron' });
    assert.equal(decks.length, PAIGOW_RULES.decks);
    assert.ok(decks.every((deck) => deck.length === PAIGOW_RULES.deckSize));
    assert.deepEqual(decks.flat().sort(), [...cards].sort());
  }
});

test('the split is the same for the same cards, and the order of the decks is the random part', () => {
  const cards = openBooster(seededRandom(5));
  const key = (decks) => decks.map((deck) => [...deck].sort().join()).sort().join('|');
  assert.deepEqual(buildDecks(cards, seededRandom(1)), buildDecks(cards, seededRandom(1)));
  assert.equal(key(buildDecks(cards, seededRandom(1))), key(buildDecks(cards, seededRandom(2))));
  assert.equal(key(buildDecks(cards, null)), key(buildDecks([...cards].reverse(), null)));
});

test('it never does worse by its own measure than dealing the cards out by strength', () => {
  let better = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const cards = openBooster(seededRandom(seed));
    const built = chanceOf(buildDecks(cards, null));
    const dealt = chanceOf(arrangeCpuDecks(cards, seededRandom(seed)));
    assert.ok(built >= dealt - 1e-9, `seed ${seed}: ${built} against ${dealt}`);
    if (built > dealt + 0.01) better += 1;
  }
  assert.ok(better >= 20, `clearly better in ${better} of 30`);
});

test('a personality\'s tastes cost next to nothing', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const cards = openBooster(seededRandom(seed));
    const best = chanceOf(buildDecks(cards, null));
    for (const persona of ['sauron', 'saruman', 'gandalf']) {
      assert.ok(chanceOf(buildDecks(cards, null, { persona })) >= best - 0.0041, `seed ${seed}, ${persona}`);
    }
  }
});

test('with more than fifteen cards, the lowest rated are left out', () => {
  const cards = openBooster(seededRandom(9), { extraCommons: 3 });
  const decks = buildDecks(cards, seededRandom(1));
  assert.equal(decks.flat().length, 15);
  const left = cards.filter((id) => !decks.flat().includes(id));
  assert.ok(Math.max(...left.map((id) => CARD_RATINGS[id])) <= Math.min(...decks.flat().map((id) => CARD_RATINGS[id])) + 1e-9);
});

test('building is quick', () => {
  const cards = openBooster(seededRandom(3));
  buildDecks(cards, null);
  const started = performance.now();
  for (let i = 0; i < 5; i++) buildDecks(cards, null);
  assert.ok((performance.now() - started) / 5 < 250, 'well under a quarter of a second');
});

test('a deck has a plan, and cards have tags', () => {
  const creatures = PAIGOW_POOL.filter((id) => isCreature(CARDS[id]));
  assert.ok(['race', 'grind', 'tempo'].includes(deckPlan(creatures.slice(0, 5))));
  assert.ok(PAIGOW_POOL.some((id) => cardTags(id).includes('removal')));
  assert.ok(PAIGOW_POOL.some((id) => cardTags(id).includes('evasion')));
  assert.ok(PAIGOW_POOL.some((id) => cardTags(id).includes('tricks')));
});

test('a match\'s CPU decks come from the builder, whatever the opponent, and the match is the same for the same seed', () => {
  const match = createMatch({ seed: 77 });
  assert.equal(match.cpuDecks.flat().length, 15);
  assert.deepEqual(createMatch({ seed: 77 }), match);
  const key = (decks) => decks.map((deck) => [...deck].sort().join()).sort().join('|');
  assert.equal(key(match.cpuDecks), key(buildDecks(match.cpuDecks.flat(), null, { persona: match.opponentId })));
});
