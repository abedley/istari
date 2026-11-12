/**
 * The arena: CPU players against each other at Pai Gow, in mirrored rounds, so the luck of the
 * cards cancels. Each seed deals two boosters, a hero's ring to one seat and an opponent's to the
 * other. A "mirror" is one round (the same decks, the same seat going first) played twice with the
 * two AIs swapped; each seed plays two mirrors, one for each seat going first.
 *
 *   node tools/arena.js --a strategist --b search-blind --seeds 100 [--from 1] [--budget 1000] [--jobs 4]
 *     [--adecks old|new] [--bdecks old|new] [--match] [--personas] [--verbose] [--aopts '{...}'] [--bopts '{...}']
 *
 * AIs: `basic`, `search` (the search AI as shipped: it knows the other side's deck list, so in Pai Gow
 * its hand), `search-blind` (the same, given only a blind view), `strategist`.
 * `--budget`: the search AI's thinking time per decision in ms (default: as it shipped for each opponent,
 * 1000 to 2500). The Strategist's is in its options: `--aopts '{"budgetMs":400}'`.
 * `--adecks`, `--bdecks`: how each AI's decks are built: `old` (arrangeCpuDecks, the default) or `new`
 * (deckBuilder.js). With the same AI on both sides, that's a test of the decks alone.
 * `--aopts`, `--bopts`: options for a Strategist on that side, as JSON (SEARCH_DEFAULTS in src/ai/strategist/search.js).
 * `--match`: whole best-of-three matches instead of single rounds (each seed is one mirror of two
 * matches, each AI playing each booster once).
 *
 * It reports the round score of `a` (a draw counts half) with a 95% interval, the mirrors where the
 * pilot decided the result (one AI won from both seats), thinking time, and blunders (tools/blunders.js).
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game, GAME_STATUS } from '../src/engine/Game.js';
import { seededRandom } from '../src/engine/random.js';
import {
  createMatch, setDecks, roundSetup, arrangeCpuDecks, PLAYER_ID, CPU_ID, PAIGOW_RULES,
} from '../src/paigow/paigow.js';
import { PAIGOW_HEROES } from '../src/paigow/personas.js';
import { BasicAIController } from '../src/ai/BasicAIController.js';
import { searchPolicy } from '../src/ai/search.js';
import { weightsFor } from '../src/ai/evaluate.js';
import { actingPlayerId } from '../src/ai/simulate.js';
import { blindView, blindDeterminizer } from '../src/ai/strategist/beliefs.js';
import { deckPlan } from '../src/paigow/deckBuilder.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((part) => {
  const [key, ...value] = part.trim().split(/\s+/);
  return [key, value.join(' ') || true];
}));

const SEATS = [PLAYER_ID, CPU_ID];

/** The search AI's settings for each opponent as they shipped before the Strategist: thinking time (ms) and evaluation weights. */
const SHIPPED_SEARCH = Object.freeze({
  birthdayBilbo: [1000, 'aggro'], burglarBilbo: [1500, 'aggro'], gandalf: [2000], oldManWillow: [2000, 'control'], gildor: [1500],
  riderInBlack: [1500, 'aggro'], tomBombadil: [1000], sauron: [2500, 'aggro'], saruman: [2000, 'control'], theoden: [1500, 'aggro'],
  denethor: [1000, 'control'], elrond: [1500, 'control'], galadriel: [2500],
});

/** A policy `(state, game) => action` for an AI by name, playing `me` with `persona`'s ring. */
async function makePolicy(name, me, { persona, seed, budget, opts }) {
  const [shippedBudget = 1000, shippedWeights] = SHIPPED_SEARCH[persona] ?? [];
  switch (name) {
    case 'basic': {
      const ai = new BasicAIController({ game: null, playerId: me });
      return (state) => ai.chooseAction(state);
    }
    case 'search':
    case 'search-blind': {
      const blind = name === 'search-blind';
      const policy = searchPolicy(me, {
        algorithm: 'ismcts', seed, budgetMs: budget ?? shippedBudget,
        weights: { ...weightsFor(shippedWeights), library: 0 },
        ...(blind ? { determinizer: blindDeterminizer } : {}),
      });
      if (!blind) return policy;
      return (state, game) => policy(state, { getPlayerView: (id) => blindView(game, id) });
    }
    case 'strategist': {
      const { strategistPolicy } = await import('../src/ai/strategist/policy.js');
      return strategistPolicy(me, { seed, persona, ...(opts ?? {}) });
    }
    default:
      throw new Error(`Unknown AI: ${name}`);
  }
}

/** A seed's deal: two boosters, the rings, and each seat's decks, built the way of the AI sitting there. */
async function dealt(seed, builders) {
  const heroes = Object.keys(PAIGOW_HEROES);
  const random = seededRandom(seed ^ 0x9e3779b9);
  const heroId = heroes[Math.floor(random() * heroes.length)];
  const match = createMatch({ seed, heroId });
  const cards = { [PLAYER_ID]: match.cards, [CPU_ID]: match.cpuDecks.flat() };
  const decks = {};
  for (const seat of SEATS) {
    const deckRandom = seededRandom((seed * 2654435761 + (seat === CPU_ID ? 17 : 5)) >>> 0);
    if (builders[seat] === 'new') {
      const { buildDecks } = await import('../src/paigow/deckBuilder.js');
      decks[seat] = buildDecks(cards[seat], deckRandom, { persona: seat === CPU_ID ? match.opponentId : null });
    } else decks[seat] = arrangeCpuDecks(cards[seat], deckRandom);
  }
  return { match: setDecks({ ...match, cpuDecks: decks[CPU_ID] }, decks[PLAYER_ID]) };
}

/** One round: `ais[seat]` plays that seat; `first` goes first. Returns the result and each seat's thinking. */
async function playRound({ seed, match, round, first, ais, budget }) {
  const sideOpts = { a: globalThis.arenaOpts?.aopts, b: globalThis.arenaOpts?.bopts };
  const setup = roundSetup({ ...match, rounds: [] });
  const playerFirst = first === PLAYER_ID;
  const game = new Game({
    ...setup.game,
    decks: { [PLAYER_ID]: [...match.decks[round]], [CPU_ID]: [...match.cpuDecks[round]] },
    seed: (seed * 31 + round) >>> 0,
    startingPlayerId: first,
    startingLife: {
      [PLAYER_ID]: playerFirst ? PAIGOW_RULES.startingLife : PAIGOW_RULES.secondPlayerLife,
      [CPU_ID]: playerFirst ? PAIGOW_RULES.secondPlayerLife : PAIGOW_RULES.startingLife,
    },
    silent: true,
  });
  game.start();
  const policies = {};
  for (const seat of SEATS) policies[seat] = await makePolicy(ais[seat].name, seat, {
    persona: match.opponentId, seed: seed * 7 + round * 2 + (seat === CPU_ID ? 1 : 0), budget,
    opts: { plan: deckPlan((seat === CPU_ID ? match.cpuDecks : match.decks)[round]), ...sideOpts[ais[seat].side] },
  });
  const think = { [PLAYER_ID]: [], [CPU_ID]: [] };
  const { watchBlunders } = await import('./blunders.js');
  const blunders = watchBlunders(game, SEATS);
  for (let step = 0; step < 20000; step++) {
    const state = game.peekState();
    if (state.status !== GAME_STATUS.IN_PROGRESS) break;
    const actor = actingPlayerId(state);
    const started = performance.now();
    const action = policies[actor](state, game) ?? state.validActions.find((a) => a.playerId === actor);
    const ms = performance.now() - started;
    if (ms >= 1) think[actor].push(ms);
    blunders.before(state, actor, action);
    game.applyTrusted(action);
  }
  const end = game.peekState();
  return { winner: end.status === GAME_STATUS.GAME_OVER ? end.winnerId : null, reason: end.endReason, turns: end.turn, think, blunders: blunders.counts(), persona: match.opponentId };
}

const other = (seat) => (seat === PLAYER_ID ? CPU_ID : PLAYER_ID);

/** A seed's games, as mirrors (pairs of games with the AIs swapped): rounds, or whole matches with `match`. */
async function playSeed(seed, { a, b, adecks, bdecks, budget, match: wholeMatch }) {
  const out = [];
  const entry = (result, aSeat, score) => ({
    score, aThink: result.think[aSeat], bThink: result.think[other(aSeat)], aBlunders: result.blunders[aSeat], bBlunders: result.blunders[other(aSeat)],
    turns: result.turns, reason: result.reason, persona: result.persona, aSeat,
  });
  const seated = (aSeat) => ({
    ais: { [aSeat]: { name: a, side: 'a' }, [other(aSeat)]: { name: b, side: 'b' } },
    builders: { [aSeat]: adecks, [other(aSeat)]: bdecks },
  });
  if (wholeMatch) {
    // A best of three, as the game plays it: the loser of a round goes first in the next.
    const mirror = [];
    for (const aSeat of SEATS) {
      const { ais, builders } = seated(aSeat);
      const { match } = await dealt(seed, builders);
      let first = seed % 2 ? PLAYER_ID : CPU_ID;
      const wins = { [PLAYER_ID]: 0, [CPU_ID]: 0 };
      const merged = { think: { [PLAYER_ID]: [], [CPU_ID]: [] }, blunders: { [PLAYER_ID]: {}, [CPU_ID]: {} }, turns: 0, reason: '', persona: match.opponentId };
      for (let round = 0; round < PAIGOW_RULES.decks && Math.max(...Object.values(wins)) < PAIGOW_RULES.roundsToWin; round++) {
        const result = await playRound({ seed, match, round, first, ais, budget });
        if (result.winner) wins[result.winner] += 1;
        first = result.winner ? other(result.winner) : other(first);
        for (const seat of SEATS) {
          merged.think[seat].push(...result.think[seat]);
          for (const [k, v] of Object.entries(result.blunders[seat])) merged.blunders[seat][k] = (merged.blunders[seat][k] ?? 0) + v;
        }
        merged.turns += result.turns;
      }
      mirror.push(entry(merged, aSeat, wins[aSeat] > wins[other(aSeat)] ? 1 : wins[aSeat] < wins[other(aSeat)] ? 0 : 0.5));
    }
    return [mirror];
  }
  const round = seed % PAIGOW_RULES.decks;
  for (const first of SEATS) {
    const mirror = [];
    for (const aSeat of SEATS) {
      const { ais, builders } = seated(aSeat);
      const { match } = await dealt(seed, builders);
      const result = await playRound({ seed, match, round, first, ais, budget });
      mirror.push(entry(result, aSeat, result.winner === aSeat ? 1 : result.winner === null ? 0.5 : 0));
    }
    out.push(mirror);
  }
  return out;
}

if (args.worker) {
  process.on('message', async ({ seed, options }) => {
    globalThis.arenaOpts = options;
    try {
      process.send({ seed, mirrors: await playSeed(seed, options) });
    } catch (error) {
      process.send({ seed, error: String(error?.stack ?? error) });
    }
  });
} else {
  const options = {
    a: args.a ?? 'strategist', b: args.b ?? 'search-blind', budget: args.budget ? Number(args.budget) : undefined,
    adecks: args.adecks ?? 'old', bdecks: args.bdecks ?? 'old', match: Boolean(args.match),
    aopts: args.aopts ? JSON.parse(args.aopts) : undefined, bopts: args.bopts ? JSON.parse(args.bopts) : undefined,
  };
  const from = Number(args.from ?? 1);
  const seeds = Array.from({ length: Number(args.seeds ?? 20) }, (_, i) => from + i);
  const jobs = Math.min(Number(args.jobs ?? 4), seeds.length);
  const started = performance.now();
  const mirrors = [];
  const errors = [];
  await new Promise((resolve) => {
    let next = 0;
    let running = 0;
    for (let j = 0; j < jobs; j++) {
      const child = fork(fileURLToPath(import.meta.url), ['--worker']);
      const give = () => {
        if (next >= seeds.length) {
          child.kill();
          if (running === 0) resolve();
          return;
        }
        running += 1;
        child.send({ seed: seeds[next++], options });
      };
      child.on('message', (message) => {
        running -= 1;
        if (message.error) errors.push(message);
        else mirrors.push(...message.mirrors.map((m) => ({ seed: message.seed, games: m })));
        if (args.verbose) console.log(message.seed, message.error ?? message.mirrors.map((m) => m.map((g) => g.score).join('/')).join(' '));
        give();
      });
      give();
    }
  });
  report(options, mirrors, errors, (performance.now() - started) / 1000);
}

function report(options, mirrors, errors, seconds) {
  const games = mirrors.flatMap((m) => m.games);
  const n = games.length;
  const score = games.reduce((sum, g) => sum + g.score, 0);
  const p = score / n;
  // 95% interval (normal approximation on per-game scores).
  const sd = Math.sqrt(games.reduce((sum, g) => sum + (g.score - p) ** 2, 0) / Math.max(1, n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  const pair = { a: 0, b: 0, split: 0 };
  for (const { games: [x, y] } of mirrors) {
    const total = x.score + y.score;
    if (total === 2) pair.a += 1;
    else if (total === 0) pair.b += 1;
    else pair.split += 1;
  }
  const per = options.match ? 'match' : 'round';
  const stats = (lists) => {
    const all = lists.flat().sort((x, y) => x - y);
    const perRound = lists.map((l) => l.reduce((s, x) => s + x, 0));
    const at = (q) => all[Math.min(all.length - 1, Math.floor(q * all.length))] ?? 0;
    return `decisions over 1 ms: ${(all.length / lists.length).toFixed(1)} a ${per}; median ${at(0.5).toFixed(0)} ms, p95 ${at(0.95).toFixed(0)} ms, max ${(all.at(-1) ?? 0).toFixed(0)} ms; ${(perRound.reduce((s, x) => s + x, 0) / lists.length / 1000).toFixed(2)} s a ${per}`;
  };
  const sum = (key) => {
    const total = {};
    for (const g of games) for (const [k, v] of Object.entries(g[key] ?? {})) total[k] = (total[k] ?? 0) + v;
    return JSON.stringify(total);
  };
  const unit = options.match ? 'match' : 'round';
  console.log(`\n${options.a} with ${options.adecks} decks (a) vs ${options.b} with ${options.bdecks} decks (b): ${mirrors.length} mirrors, ${n} ${unit}${n === 1 ? '' : unit === 'match' ? 'es' : 's'}, ${seconds.toFixed(0)} s`);
  console.log(`  a's ${unit} score: ${pct(p)} ± ${pct(half)}  (won ${games.filter((g) => g.score === 1).length}, drawn ${games.filter((g) => g.score === 0.5).length}, lost ${games.filter((g) => g.score === 0).length})`);
  console.log(`  mirrors decided by the pilot: a ${pair.a}, b ${pair.b}  (the decks or the seat decided ${pair.split})`);
  console.log(`  a thinking: ${stats(games.map((g) => g.aThink))}`);
  console.log(`  b thinking: ${stats(games.map((g) => g.bThink))}`);
  console.log(`  a blunders: ${sum('aBlunders')}`);
  console.log(`  b blunders: ${sum('bBlunders')}`);
  if (args.personas) {
    const by = {};
    for (const g of games) (by[g.persona] ??= []).push(g.score);
    for (const [name, scores] of Object.entries(by).sort()) console.log(`    ${name.padEnd(14)} ${pct(scores.reduce((s, x) => s + x, 0) / scores.length)} of ${scores.length}`);
  }
  if (errors.length) console.log(`  ${errors.length} seeds failed:`, errors.slice(0, 3));
}
