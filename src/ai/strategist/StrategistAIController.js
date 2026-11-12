import { EventEmitter } from '../../engine/EventEmitter.js';
import { DECISION } from '../../engine/Game.js';
import { PHASE } from '../../engine/turnStructure.js';
import { seededRandom } from '../../engine/random.js';
import { BasicAIController } from '../BasicAIController.js';
import { nextAction } from '../macroActions.js';
import { actingPlayerId } from '../simulate.js';
import { blindView } from './beliefs.js';
import { windowOf } from './moves.js';
import { decide } from './policy.js';
import { profileFor } from './profiles.js';

/**
 * The Strategist as a game controller: it listens to the game's `state` events and emits `action`
 * events (and `thinking` events, `{ active }`), as SearchAIController does, so the app can use either.
 *
 * - It decides from a blind view of the game (beliefs.js): nothing about the opponent's hidden cards
 *   ever reaches it, or its worker.
 * - It thinks in a Web Worker when there is one, so the page stays responsive.
 * - Its timing gives little away: outside the moments it could ever act in (windowOf, which depends
 *   only on what both players see) it passes at once (`passMs`); inside them it answers after
 *   `responseMs` plus jitter, whatever it holds. At its own main phase and its declarations it's seen
 *   thinking, for at least `minThinkMs`.
 *
 * Options: `persona` (an opponent's id or a temperament, see profiles.js) or `profile`; `plan` (what its deck is
 * built to do, see profileFor); `budgetMs`
 * (thinking time for one decision), `search` (other search options, see SEARCH_DEFAULTS), `seed`,
 * `runner` (`{ decide(request) => Promise<result>, dispose() }`), `timers` (for tests).
 */
export class StrategistAIController extends EventEmitter {
  #game;
  #playerId;
  #profile;
  #options;
  #minThinkMs;
  #responseMs;
  #jitterMs;
  #passMs;
  #jitter;
  #random;
  #runner;
  #timers;
  #fallback;
  #unsubscribers;
  #current = null;
  #timer = null;
  #turnOf = 0;

  constructor({
    game, playerId, persona, profile, plan = null, budgetMs, search = {}, minThinkMs = 500, responseMs = 400, jitterMs = 200, passMs = 60,
    seed = Math.floor(Math.random() * 2 ** 32), runner = createStrategistRunner(), timers = {
      setTimeout: (...args) => setTimeout(...args),
      clearTimeout: (id) => clearTimeout(id),
      now: () => performance.now(),
    },
  }) {
    super();
    this.#game = game;
    this.#playerId = playerId;
    this.#profile = profileFor(profile ?? persona, plan);
    this.#options = { ...search, ...(budgetMs ? { budgetMs } : {}) };
    this.#minThinkMs = minThinkMs;
    this.#responseMs = responseMs;
    this.#jitterMs = jitterMs;
    this.#passMs = passMs;
    this.#jitter = seededRandom(seed);
    this.#random = seededRandom(seed ^ 0x5bd1e995);
    this.#runner = runner;
    this.#timers = timers;
    this.#fallback = new BasicAIController({ game: null, playerId });
    this.#unsubscribers = [
      game.on('state', (state) => this.#onState(state)),
      game.listenTo(this),
    ];
  }

  get playerId() { return this.#playerId; }

  detach() {
    this.#timers.clearTimeout(this.#timer);
    this.#turnOf += 1;
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#runner.dispose();
  }

  /** Act on the game's current state, e.g. right after taking control mid-game. */
  actNow() {
    this.#onState(this.#game.getState());
  }

  /** Moments when thinking visibly reveals nothing: its main phase and its declarations. */
  #isThinkingMoment(state) {
    const decision = state.pendingDecision;
    if (decision) return decision.type === DECISION.DECLARE_ATTACKERS || decision.type === DECISION.DECLARE_BLOCKERS;
    return state.activePlayerId === this.#playerId && state.stack.length === 0
      && (state.phase === PHASE.PRECOMBAT_MAIN || state.phase === PHASE.POSTCOMBAT_MAIN);
  }

  async #onState(state) {
    this.#timers.clearTimeout(this.#timer);
    const turn = ++this.#turnOf;
    const me = this.#playerId;
    if (actingPlayerId(state) !== me) {
      this.#current = null;
      return;
    }
    const started = this.#timers.now();
    const context = `${state.turn}:${state.segmentIndex}:${state.pendingDecision?.type ?? 'priority'}`;
    // Carrying on with a play that takes several actions (choosing attackers one by one).
    const step = this.#current?.context === context ? nextAction(state, me, this.#current.macro) : null;
    if (step) {
      if (step.done) this.#current = null;
      this.#act(turn, step.action, STEP_MS);
      return;
    }
    this.#current = null;
    // Outside its windows it always passes: that's public, so there's nothing to hide.
    if (!state.pendingDecision && windowOf(state, me) === null) {
      this.#act(turn, this.#fallback.chooseAction(state), this.#passMs);
      return;
    }
    const thinking = this.#isThinkingMoment(state);
    // The delay is decided from public information only, before anything private is looked at.
    const delay = thinking ? this.#minThinkMs : this.#responseMs + this.#jitter() * this.#jitterMs;
    if (thinking) this.emit('thinking', { active: true });
    const result = await this.#runner.decide({
      view: blindView(this.#game, me), me, profile: this.#profile, seed: Math.floor(this.#random() * 2 ** 32), options: this.#options,
    });
    if (turn !== this.#turnOf) return;
    const next = result?.macro && nextAction(state, me, result.macro);
    if (next && !next.done) this.#current = { macro: result.macro, context };
    const action = next?.action ?? this.#fallback.chooseAction(state);
    this.#act(turn, action, Math.max(0, started + delay - this.#timers.now()), thinking);
  }

  /** Emits `action` after `wait` ms, unless the game has moved on by then. */
  #act(turn, action, wait, thinking = false) {
    this.#timer = this.#timers.setTimeout(() => {
      if (turn !== this.#turnOf) return;
      if (thinking) this.emit('thinking', { active: false });
      if (action) this.emit('action', action);
    }, wait);
  }
}

/** The delay between the steps of one play, e.g. choosing attackers one by one. */
const STEP_MS = 150;

/** Decides on the current thread, a moment later (so the page can draw first). */
export class InlineStrategistRunner {
  #disposed = false;

  decide({ view, me, profile, seed, options }) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.#disposed) return resolve(null);
        try {
          resolve(decide(view, me, { profile, random: seededRandom(seed), ...options }));
        } catch {
          resolve({ macro: null });
        }
      }, 0);
    });
  }

  dispose() { this.#disposed = true; }
}

/** Decides in a module Web Worker. */
export class WorkerStrategistRunner {
  #worker;
  #latest = 0;
  #pending = new Map();

  constructor(url = new URL('./strategistWorker.js', import.meta.url)) {
    this.#worker = new Worker(url, { type: 'module' });
    this.#worker.onmessage = ({ data }) => {
      this.#pending.get(data.id)?.(data.result);
      this.#pending.delete(data.id);
    };
  }

  decide(request) {
    const id = ++this.#latest;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#worker.postMessage({ id, ...request });
    });
  }

  dispose() {
    this.#worker.terminate();
    for (const resolve of this.#pending.values()) resolve(null);
    this.#pending.clear();
  }
}

/** A Worker runner in browsers that support module workers, otherwise inline. */
export function createStrategistRunner() {
  if (typeof Worker !== 'undefined') {
    try {
      return new WorkerStrategistRunner();
    } catch {
      // Module workers unsupported: fall through.
    }
  }
  return new InlineStrategistRunner();
}
