/**
 * Fits the Strategist's evaluation to Pai Gow, and writes src/ai/strategist/evalWeights.js.
 *
 *   node tools/tune-eval.js [--games 20000] [--jobs 4]
 *
 * It plays rounds between basic AIs (decks of five dealt from boosters, a ring each, 5 life against 8),
 * and at the start of each turn notes the position's features (positionFeatures in
 * src/ai/strategist/evaluate.js) for the player whose turn it is, and later whether that player won.
 * A logistic regression then gives each feature its weight. It reports how well the model predicts
 * the winner on games held back from the fit (log loss; 0.693 is a coin flip), next to the search
 * AI's evaluation (src/ai/evaluate.js) on the same positions.
 */
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game, GAME_STATUS, GAME_LIMITS } from '../src/engine/Game.js';
import { PHASE } from '../src/engine/turnStructure.js';
import { seededRandom, shuffle } from '../src/engine/random.js';
import { EMBLEMS } from '../src/cards/emblems.js';
import { openBooster, PAIGOW_RULES } from '../src/paigow/paigow.js';
import { BasicAIController } from '../src/ai/BasicAIController.js';
import { actingPlayerId } from '../src/ai/simulate.js';
import { evaluate as searchEvaluate, weightsFor } from '../src/ai/evaluate.js';
import { positionFeatures, FEATURES } from '../src/ai/strategist/evaluate.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((part) => {
  const [key, ...value] = part.trim().split(/\s+/);
  return [key, value.join(' ') || true];
}));

const RINGS = Object.keys(EMBLEMS).filter((id) => EMBLEMS[id].ring);

function playGame(seed) {
  const random = seededRandom(seed);
  const decks = { a: shuffle(openBooster(random), random).slice(0, 5), b: shuffle(openBooster(random), random).slice(0, 5) };
  const first = random() < 0.5 ? 'a' : 'b';
  const ring = () => [RINGS[Math.floor(random() * RINGS.length)]];
  const game = new Game({
    players: [{ id: 'a' }, { id: 'b' }], startingPlayerId: first, seed, decks, emblems: { a: ring(), b: ring() },
    startingLife: { a: first === 'a' ? PAIGOW_RULES.startingLife : PAIGOW_RULES.secondPlayerLife, b: first === 'b' ? PAIGOW_RULES.startingLife : PAIGOW_RULES.secondPlayerLife },
    limits: { ...GAME_LIMITS }, mulligans: false, openingHandSize: 5, deckingLoss: false, infiniteMana: true, stallDraw: true,
    turnLimit: PAIGOW_RULES.turnLimit, silent: true,
  });
  game.start();
  const ais = { a: new BasicAIController({ game: null, playerId: 'a' }), b: new BasicAIController({ game: null, playerId: 'b' }) };
  const weights = { ...weightsFor(undefined), library: 0 };
  const rows = [];
  let noted = 0;
  for (let step = 0; step < 6000; step++) {
    const state = game.peekState();
    if (state.status !== GAME_STATUS.IN_PROGRESS) break;
    const me = state.activePlayerId;
    // The start of a turn: its first main phase, before anything is done.
    if (state.turn !== noted && state.phase === PHASE.PRECOMBAT_MAIN && state.stack.length === 0 && !state.pendingDecision && state.priorityPlayerId === me) {
      noted = state.turn;
      const features = positionFeatures(state, me);
      rows.push({ me, x: FEATURES.map((name) => features[name]), old: searchEvaluate(state, me, weights) });
    }
    const actor = actingPlayerId(state);
    game.applyTrusted(ais[actor].chooseAction(state) ?? state.validActions.find((a) => a.playerId === actor));
  }
  const end = game.peekState();
  const winner = end.status === GAME_STATUS.GAME_OVER ? end.winnerId : null;
  return rows.map(({ me, x, old }) => ({ x, old, y: winner === null ? 0.5 : winner === me ? 1 : 0 }));
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
  const total = Number(args.games ?? 20000);
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
  // The last tenth of the games is held back to test on.
  const cut = Math.floor(games.length * 0.9);
  const train = games.slice(0, cut).flat();
  const test = games.slice(cut).flat();
  console.log(`${games.length} games, ${train.length} positions to fit, ${test.length} to test`);
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  const loss = (rows, predict) => -rows.reduce((sum, r) => {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, predict(r)));
    return sum + r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p);
  }, 0) / rows.length;
  const fit = (rows, inputs, epochs = 40, start = 0.02) => {
    const w = new Float64Array(inputs(rows[0]).length);
    for (let epoch = 0; epoch < epochs; epoch++) {
      const rate = start / (1 + epoch / 10);
      for (const row of shuffle([...rows], seededRandom(epoch + 1))) {
        const x = inputs(row);
        let z = 0;
        for (let i = 0; i < x.length; i++) z += w[i] * x[i];
        const error = row.y - sigmoid(z);
        for (let i = 0; i < x.length; i++) w[i] += rate * error * x[i];
      }
    }
    return w;
  };
  const dot = (w, x) => x.reduce((z, v, i) => z + w[i] * v, 0);
  const w = fit(train, (r) => r.x);
  // The search AI's evaluation, given its best scale and offset.
  const oldInputs = (r) => [1, Math.max(-5, Math.min(5, r.old / 20))];
  const wOld = fit(train, oldInputs);
  console.log(`log loss on the held-back games: this model ${loss(test, (r) => sigmoid(dot(w, r.x))).toFixed(4)}, `
    + `the search AI's evaluation ${loss(test, (r) => sigmoid(dot(wOld, oldInputs(r)))).toFixed(4)}, a coin ${Math.log(2).toFixed(4)}`);
  const accuracy = (rows, predict) => rows.filter((r) => r.y !== 0.5 && (predict(r) > 0.5) === (r.y === 1)).length / rows.filter((r) => r.y !== 0.5).length;
  console.log(`winner called right: this model ${(100 * accuracy(test, (r) => sigmoid(dot(w, r.x)))).toFixed(1)}%, the search AI's ${(100 * accuracy(test, (r) => sigmoid(dot(wOld, oldInputs(r))))).toFixed(1)}%`);
  const weights = Object.fromEntries(FEATURES.map((name, i) => [name, Math.round(w[i] * 1000) / 1000]));
  console.log(weights);
  writeFileSync(new URL('../src/ai/strategist/evalWeights.js', import.meta.url), `/**
 * The Strategist's evaluation weights (see evaluate.js), fitted by tools/tune-eval.js to ${train.length}
 * positions from ${games.length} self-played rounds of Pai Gow.
 * Generated: don't edit by hand (run \`node tools/tune-eval.js\`).
 */
export const EVAL_WEIGHTS = Object.freeze(${JSON.stringify(weights, null, 2)});
`);
  console.log('wrote src/ai/strategist/evalWeights.js');
}
