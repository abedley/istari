/**
 * Rates every card for Pai Gow by self-play, and writes src/paigow/cardRatings.js.
 *
 *   node tools/rate-cards.js [--games 40000] [--jobs 4]
 *
 * Each game deals both seats five cards out of a booster of their own, gives nobody a ring, and lets
 * the basic AI play both. A logistic regression then explains who won from what was in each deck:
 * a rating per card, a bonus for how many creatures a deck holds, and what going first is worth
 * (5 life against 8). Mana costs don't come into it: mana is free in Pai Gow.
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game, GAME_STATUS, GAME_LIMITS } from '../src/engine/Game.js';
import { seededRandom, shuffle } from '../src/engine/random.js';
import { CARDS, isCreature } from '../src/cards/cards.js';
import { openBooster, PAIGOW_POOL, PAIGOW_RULES } from '../src/paigow/paigow.js';
import { BasicAIController } from '../src/ai/BasicAIController.js';
import { playout } from '../src/ai/simulate.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((part) => {
  const [key, ...value] = part.trim().split(/\s+/);
  return [key, value.join(' ') || true];
}));

function playGame(seed) {
  const random = seededRandom(seed);
  const decks = { a: shuffle(openBooster(random), random).slice(0, 5), b: shuffle(openBooster(random), random).slice(0, 5) };
  const first = random() < 0.5 ? 'a' : 'b';
  const game = new Game({
    players: [{ id: 'a' }, { id: 'b' }], startingPlayerId: first, seed, decks, emblems: { a: [], b: [] },
    startingLife: { a: first === 'a' ? PAIGOW_RULES.startingLife : PAIGOW_RULES.secondPlayerLife, b: first === 'b' ? PAIGOW_RULES.startingLife : PAIGOW_RULES.secondPlayerLife },
    limits: { ...GAME_LIMITS }, mulligans: false, openingHandSize: 5, deckingLoss: false, infiniteMana: true, stallDraw: true,
    turnLimit: PAIGOW_RULES.turnLimit, silent: true,
  });
  game.start();
  const ais = { a: new BasicAIController({ game: null, playerId: 'a' }), b: new BasicAIController({ game: null, playerId: 'b' }) };
  const end = playout(game, { a: (s) => ais.a.chooseAction(s), b: (s) => ais.b.chooseAction(s) }, { maxSteps: 6000 });
  const result = end.status !== GAME_STATUS.GAME_OVER || end.winnerId === null ? 0.5 : end.winnerId === 'a' ? 1 : 0;
  return { a: decks.a, b: decks.b, first, result };
}

if (args.worker) {
  process.on('message', ({ from, to }) => {
    const games = [];
    for (let seed = from; seed < to; seed++) {
      try { games.push(playGame(seed)); } catch { /* a game the engine can't finish: skipped */ }
    }
    process.send(games);
  });
} else {
  const total = Number(args.games ?? 40000);
  const jobs = Number(args.jobs ?? 4);
  const games = [];
  await Promise.all(Array.from({ length: jobs }, (_, j) => new Promise((resolve) => {
    const child = fork(fileURLToPath(import.meta.url), ['--worker']);
    child.on('message', (batch) => {
      games.push(...batch);
      child.kill();
      resolve();
    });
    child.send({ from: 1 + Math.floor((j * total) / jobs), to: 1 + Math.floor(((j + 1) * total) / jobs) });
  })));
  console.log(`${games.length} games; first player's score ${(games.reduce((s, g) => s + (g.first === 'a' ? g.result : 1 - g.result), 0) / games.length).toFixed(3)}`);

  // P(a wins) = sigmoid(sum of a's ratings - sum of b's + creature-count bonuses + first-player bias).
  const index = Object.fromEntries(PAIGOW_POOL.map((id, i) => [id, i]));
  const n = PAIGOW_POOL.length;
  const FIRST = n + 6;
  const weights = new Float64Array(n + 7);
  const creatures = (deck) => deck.filter((id) => isCreature(CARDS[id])).length;
  const featuresOf = (g) => {
    const x = new Map();
    const bump = (i, v) => x.set(i, (x.get(i) ?? 0) + v);
    for (const id of g.a) bump(index[id], 1);
    for (const id of g.b) bump(index[id], -1);
    bump(n + creatures(g.a), 1);
    bump(n + creatures(g.b), -1);
    bump(FIRST, g.first === 'a' ? 1 : -1);
    return x;
  };
  const rows = games.map((g) => ({ x: featuresOf(g), y: g.result }));
  const l2 = 2e-4;
  for (let epoch = 0; epoch < 60; epoch++) {
    const rate = 0.05 / (1 + epoch / 20);
    for (const { x, y } of shuffle([...rows], seededRandom(epoch + 1))) {
      let z = 0;
      for (const [i, v] of x) z += weights[i] * v;
      const error = y - 1 / (1 + Math.exp(-z));
      for (const [i, v] of x) weights[i] += rate * (error * v - l2 * weights[i]);
    }
  }
  const round = (v) => Math.round(v * 1000) / 1000;
  const ratings = Object.fromEntries(PAIGOW_POOL.map((id) => [id, round(weights[index[id]])]));
  const bonus = Array.from({ length: 6 }, (_, k) => round(weights[n + k]));
  // What a deck dealt at random scores: the field a deck is measured against.
  const random = seededRandom(7);
  const field = Array.from({ length: 2000 }, () => {
    const deck = shuffle(openBooster(random), random).slice(0, 5);
    return deck.reduce((s, id) => s + ratings[id], 0) + bonus[creatures(deck)];
  }).sort((x, y) => x - y);
  const quantiles = Array.from({ length: 41 }, (_, i) => round(field[Math.min(field.length - 1, Math.floor((i / 40) * field.length))]));
  const sorted = Object.entries(ratings).sort((x, y) => y[1] - x[1]);
  console.log('best:', sorted.slice(0, 12).map(([id, r]) => `${id} ${r}`).join(', '));
  console.log('worst:', sorted.slice(-12).map(([id, r]) => `${id} ${r}`).join(', '));
  console.log('creatures bonus:', bonus, 'first:', round(weights[FIRST]));
  const file = `/**
 * Card ratings for Pai Gow, fitted by tools/rate-cards.js from ${games.length} self-played rounds.
 * Generated: don't edit by hand (run \`node tools/rate-cards.js\`).
 *
 * A deck's score is the sum of its cards' ratings plus CREATURE_COUNT_BONUS[its number of creatures];
 * the chance it beats another deck is sigmoid(its score - the other's), give or take who goes first.
 */

/** Each card's rating, in log-odds of winning the round. */
export const CARD_RATINGS = Object.freeze(${JSON.stringify(ratings, null, 1).replace(/\n /g, '\n  ')});

/** A deck's bonus by how many creatures it holds (0 to 5). */
export const CREATURE_COUNT_BONUS = Object.freeze(${JSON.stringify(bonus)});

/** The log-odds of going first (5 life against 8). */
export const FIRST_PLAYER_EDGE = ${round(weights[FIRST])};

/** The scores of decks dealt at random, as 41 quantiles: the field a deck is measured against. */
export const FIELD_SCORES = Object.freeze(${JSON.stringify(quantiles)});
`;
  writeFileSync(new URL('../src/paigow/cardRatings.js', import.meta.url), file);
  console.log('wrote src/paigow/cardRatings.js');
}
