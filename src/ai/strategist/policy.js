/**
 * The Strategist as a policy `(state, game) => action`, for arenas and tests (the app uses
 * StrategistAIController). It decides from `blindView(game, me)` alone: `state` is only used for
 * its own valid actions.
 */
import { Game } from '../../engine/Game.js';
import { seededRandom } from '../../engine/random.js';
import { BasicAIController } from '../BasicAIController.js';
import { nextAction } from '../macroActions.js';
import { blindView, sampleWorld } from './beliefs.js';
import { candidates } from './moves.js';
import { Search, SEARCH_DEFAULTS } from './search.js';
import { profileFor } from './profiles.js';

/**
 * What to do in the position `view` shows (a blind view, with `me` to act): `{ macro, ranked?, depth?, nodes? }`,
 * a macro for nextAction(), or `{ macro: null }` to leave it to the basic AI's rules.
 */
export function decide(view, me, { profile, random, ...options } = {}) {
  // One guess of the hidden cards to read our own options from: they don't depend on the guess.
  // (A board-only search, `worlds: 0`, guesses nothing: the hidden cards are left out.)
  const worlds = options.worlds ?? profile?.foresight ?? SEARCH_DEFAULTS.worlds;
  const first = sampleWorld(view, random, { deal: worlds > 0 });
  const world = Game.deserialize(first, { silent: true });
  const moves = candidates(world.peekState(), me, world);
  if (!moves) return { macro: null };
  if (moves.length <= 1) return { macro: moves[0] ?? null };
  const search = new Search(me, profile, options);
  const result = search.choose(view, moves, random, first);
  return { macro: result.best, ranked: result.ranked, depth: result.depth, nodes: result.nodes };
}

/**
 * @param {string} me
 * @param {object} options `{ persona, profile, seed, budgetMs, worlds, maxDepth, onDecision }`: `persona` an opponent's id or
 *   a temperament's name (profiles.js), or `profile` the numbers themselves.
 */
export function strategistPolicy(me, { persona, profile, seed = 1, onDecision, ...options } = {}) {
  const chosen = profileFor(profile ?? persona);
  const random = seededRandom(seed);
  const fallback = new BasicAIController({ game: null, playerId: me });
  let current = null;
  return (state, game) => {
    const mine = state.validActions.filter((a) => a.playerId === me);
    if (mine.length <= 1) return mine[0] ?? null;
    const context = `${state.turn}:${state.segmentIndex}:${state.pendingDecision?.type ?? 'priority'}`;
    if (current?.context === context) {
      const step = nextAction(state, me, current.macro);
      if (step) {
        if (step.done) current = null;
        return step.action;
      }
    }
    current = null;
    const decision = decide(blindView(game, me), me, { profile: chosen, random, ...options });
    onDecision?.(decision, state);
    const step = decision.macro && nextAction(state, me, decision.macro);
    if (!step) return fallback.chooseAction(state);
    if (!step.done) current = { macro: decision.macro, context };
    return step.action;
  };
}
