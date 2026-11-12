/**
 * The Strategist's search. For a decision with several moves worth considering (moves.js):
 *
 * 1. **Guess the hidden cards** a few times (beliefs.js): each guess is a "world", a complete game.
 * 2. **Try each move in each world**, against an opponent who answers well: the next few real
 *   choices, either side's, are searched in full (alpha-beta over moves.js's candidates), and from
 *   there on the basic AI plays both sides to the start of our next turn, where evaluate.js gives our
 *   chance of winning.
 *   Steps with only one sensible move are just played, so they cost nothing.
 * 3. **Deepen while there's time,** dropping the moves that are clearly behind after each pass.
 *   The move with the best average over the worlds wins (a cautious profile weighs the bad worlds more).
 *
 * Every move is tried in the same worlds, so they're compared like for like.
 */
import { Game, GAME_STATUS } from '../../engine/Game.js';
import { PHASE } from '../../engine/turnStructure.js';
import { BasicAIController } from '../BasicAIController.js';
import { applyMacro } from '../macroActions.js';
import { actingPlayerId, playout } from '../simulate.js';
import { candidates } from './moves.js';
import { evaluate } from './evaluate.js';
import { sampleWorld, unseenCards } from './beliefs.js';

export const SEARCH_DEFAULTS = Object.freeze({
  /**
   * Guesses of the opponent's hidden cards. 0 (the default) plays the board as it stands, with no guess at
   * all: a hidden hand is five near-random cards from one booster, and in arena play six guesses of it
   * were no stronger than none, at twice the thinking. A profile's `foresight` sets it.
   */
  worlds: 0,
  /**
   * Thinking time for one decision, in ms: no new pass starts after it, and a pass under way stops at twice
   * it. More than this bought nothing in arena play (600 ms and two more choices deep: 50.9% against this).
   */
  budgetMs: 100,
  /** Real choices searched in full after the move itself, at most. */
  maxDepth: 3,
  /** Moves kept after each pass, and how far behind the best (in chance of winning) a kept move may be. */
  keep: 3,
  margin: 0.1,
  /** Moves tried at each choice inside the search. */
  width: 4,
  /** How many of our turns ahead positions are scored at (1: the start of our next turn). */
  horizonTurns: 1,
});

const basicFor = (id) => new BasicAIController({ game: null, playerId: id });

/**
 * Where positions are scored: the first main phase of `me`'s turn, `turns` of its turns from now
 * (1: its next turn). Turns alternate, so that's a turn number.
 */
const horizon = (view, me, turns) => {
  const target = view.turn + (view.activePlayerId === me ? 2 : 1) + 2 * (turns - 1);
  return (state) => state.turn >= target && state.activePlayerId === me
    && state.phase === PHASE.PRECOMBAT_MAIN && state.stack.length === 0 && !state.pendingDecision;
};

export class Search {
  #me;
  #profile;
  #options;
  #deadline = Infinity;
  #now;
  /** In a board-only search: how many cards the opponent holds that the worlds leave out. */
  #unseen = 0;
  nodes = 0;

  constructor(me, profile, options = {}) {
    this.#me = me;
    this.#profile = profile;
    this.#options = {
      ...SEARCH_DEFAULTS, ...(profile?.foresight !== undefined ? { worlds: profile.foresight } : {}),
      ...(profile?.budgetMs ? { budgetMs: profile.budgetMs } : {}), ...options,
    };
    this.#now = options.now ?? (() => performance.now());
  }

  /**
   * Plays on while there's nothing to choose. Returns `{ done: true }` at the end of the game or the
   * horizon, or `{ actor, moves }` at a real choice.
   */
  #advance(game, reached, helpers) {
    for (let step = 0; step < 400; step++) {
      const state = game.peekState();
      if (state.status !== GAME_STATUS.IN_PROGRESS || reached(state)) return { done: true };
      const actor = actingPlayerId(state);
      const moves = candidates(state, actor, game);
      if (moves && moves.length > 1) return { actor, moves };
      if (moves?.length === 1 && applyMacro(game, actor, moves[0])) continue;
      helpers[actor] ??= basicFor(actor);
      const action = helpers[actor].chooseAction(state) ?? state.validActions.find((a) => a.playerId === actor);
      if (!action) return { done: true };
      game.applyTrusted(action);
    }
    return { done: true };
  }

  /** The basic AI plays both sides to the horizon; the position there, scored. */
  #rollout(game, reached) {
    const policies = Object.fromEntries(game.peekState().players.map(({ id }) => {
      const ai = basicFor(id);
      return [id, (state) => ai.chooseAction(state)];
    }));
    const end = playout(game, policies, { until: reached, maxSteps: 1500 });
    const value = evaluate(end, this.#me, this.#profile, this.#unseen);
    this.#options.trace?.(end, value);
    return value;
  }

  /** The value for us of `game` (which it plays on), searching `depth` more real choices in full. */
  #value(game, depth, alpha, beta, reached) {
    this.nodes += 1;
    if (depth <= 0) return this.#rollout(game, reached);
    const node = this.#advance(game, reached, {});
    if (node.done) return evaluate(game.peekState(), this.#me, this.#profile, this.#unseen);
    if (this.#now() > this.#deadline) throw new OutOfTime();
    const ours = node.actor === this.#me;
    let best = ours ? -Infinity : Infinity;
    for (const move of node.moves.slice(0, this.#options.width)) {
      const child = game.clone();
      if (!applyMacro(child, node.actor, move)) continue;
      const value = this.#value(child, depth - 1, alpha, beta, reached);
      if (ours) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, best);
      }
      if (alpha >= beta) break;
    }
    return Number.isFinite(best) ? best : evaluate(game.peekState(), this.#me, this.#profile, this.#unseen);
  }

  /** A move's score over the worlds: the average, pulled towards the worst by the profile's `risk`. */
  #score(values) {
    const known = values.filter((v) => v !== null);
    if (known.length === 0) return -Infinity;
    const mean = known.reduce((sum, v) => sum + v, 0) / known.length;
    return mean - (this.#profile.risk ?? 0) * 0.5 * (mean - Math.min(...known));
  }

  /**
   * The best of `moves` for us in the position `view` shows (a blind view). Returns
   * `{ best, ranked: [{ move, score }], depth, nodes, worlds }`.
   */
  choose(view, moves, random, firstWorld = null) {
    const { worlds: count, budgetMs, maxDepth, keep, margin } = this.#options;
    const started = this.#now();
    // No guesses (`worlds: 0`): one world, the board as it stands, with the hidden cards left out.
    const boardOnly = count === 0;
    this.#unseen = boardOnly ? unseenCards(view) : 0;
    const snapshots = Array.from({ length: Math.max(1, count) }, (_, i) => (i === 0 && firstWorld ? firstWorld : sampleWorld(view, random, { deal: !boardOnly })));
    const worlds = snapshots.map((snapshot) => Game.deserialize(snapshot, { silent: true }));
    const reached = horizon(view, this.#me, this.#options.horizonTurns);
    let alive = moves.map((move) => ({ move, values: [], score: 0 }));
    let depth = 0;
    for (; depth <= maxDepth && alive.length > 1; depth++) {
      // The first pass always finishes; later ones give up at the deadline and keep the last full pass.
      this.#deadline = depth === 0 ? Infinity : started + 2 * budgetMs;
      if (depth > 0 && this.#now() - started > budgetMs * (alive.length > 2 ? 0.35 : 0.5)) break;
      const pass = alive.map((entry) => ({ entry, values: [] }));
      try {
        for (const world of worlds) {
          for (const { entry, values } of pass) {
            const child = world.clone();
            values.push(applyMacro(child, this.#me, entry.move) ? this.#value(child, depth, -Infinity, Infinity, reached) : null);
          }
        }
      } catch (error) {
        if (!(error instanceof OutOfTime)) throw error;
        break;
      }
      for (const { entry, values } of pass) {
        entry.values = values;
        // A move that looks like a blunder (moves.js's `handicap`) has to be that much better.
        entry.score = this.#score(values) - (entry.move.handicap ?? 0);
      }
      alive.sort((a, b) => b.score - a.score);
      alive = alive.filter((entry, i) => i === 0 || (i < keep && entry.score >= alive[0].score - margin));
    }
    return { best: alive[0].move, ranked: alive.map(({ move, score, values }) => ({ move, score, values })), depth, nodes: this.nodes, worlds: count };
  }
}

class OutOfTime extends Error {}
