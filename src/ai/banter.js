/**
 * What CPU opponents say: a line when the match starts, when it ends, and when the
 * game swings, from winning to losing or back. The lines are content (an
 * opponent's `banter`, by kind); this module decides when a swing happened and
 * picks the lines.
 */
import { evaluate } from './evaluate.js';

export const BANTER = Object.freeze({
  START: 'start',
  WIN: 'win',
  LOSE: 'lose',
  /** Was losing, now winning. */
  COMEBACK: 'comeback',
  /** Was winning, now losing. */
  COLLAPSE: 'collapse',
  /** A creature of the other player's died. */
  KILL: 'kill',
  /** A creature of its own that mattered died. */
  LOSS: 'loss',
  /** The other player used a Ring of Power that isn't their own character's: one taken on the road. */
  RING: 'ring',
});

export const BANTER_KINDS = Object.freeze(Object.values(BANTER));

/**
 * How the game looks from `me`'s side (evaluate's points, positive when ahead),
 * from what `me` could know: the other hands only as counts.
 */
export function outlook(state, me) {
  const players = state.players.map((p) => (p.id === me || !p.hand ? p : { ...p, hand: undefined, handSize: p.hand.length }));
  return evaluate({ ...state, players }, me);
}

/**
 * Watches one player's outlook, sampled once a turn, for swings. The outlook is
 * averaged over the last `window` samples (a turn each way, so it doesn't bounce
 * with whose turn it is); at `threshold` or more the player is winning, at
 * -`threshold` or less losing. A swing is reaching the opposite of the last
 * mood, however many turns that took.
 */
export class SwingWatch {
  #threshold;
  #window;
  #samples = [];
  #mood = null;

  constructor({ threshold = 15, window = 2 } = {}) {
    this.#threshold = threshold;
    this.#window = window;
  }

  get mood() { return this.#mood; }

  /** Adds a sample; returns BANTER.COMEBACK or BANTER.COLLAPSE on a swing, else null. */
  observe(score) {
    this.#samples.push(score);
    if (this.#samples.length > this.#window) this.#samples.shift();
    if (this.#samples.length < this.#window) return null;
    const average = this.#samples.reduce((sum, s) => sum + s, 0) / this.#samples.length;
    const mood = average >= this.#threshold ? 'winning' : average <= -this.#threshold ? 'losing' : null;
    if (!mood || mood === this.#mood) return null;
    const was = this.#mood;
    this.#mood = mood;
    if (!was) return null;
    return mood === 'winning' ? BANTER.COMEBACK : BANTER.COLLAPSE;
  }
}

/** A creature that mattered: a legend, or one whose power and toughness come to this much. */
const MATTERS_AT = 6;

/**
 * Watches what happens on the board for moments worth a word from `cpu` (a player id): a creature of the other
 * player's dying (BANTER.KILL), one of its own that mattered dying (BANTER.LOSS: a legend, or power plus toughness
 * of 6 or more; tokens never count), and the other player using a Ring of Power besides their own character's
 * (BANTER.RING; `ownEmblem` is that character's emblem id). It speaks at most once in `gap` turns (`spoke` records
 * a line said for any reason, a swing included), so it doesn't chatter.
 */
export class MomentWatch {
  #cpu;
  #ownEmblem;
  #gap;
  /** The battlefield as last seen: what died is looked up here, since it's gone from the new state. */
  #before = new Map();
  #lastSpoke = -Infinity;

  constructor({ cpu, ownEmblem = null, gap = 2 } = {}) {
    this.#cpu = cpu;
    this.#ownEmblem = ownEmblem;
    this.#gap = gap;
  }

  /** A line was said on `turn`. */
  spoke(turn) {
    this.#lastSpoke = turn;
  }

  /**
   * The events since the last state, and that state. Returns a moment's kind, or null. Asking doesn't count as
   * speaking: call `spoke` when the line is said.
   */
  observe(events, state) {
    const before = this.#before;
    this.#before = new Map((state.battlefield ?? []).map((permanent) => [permanent.id, permanent]));
    if (state.turn - this.#lastSpoke < this.#gap) return null;
    let kind = null;
    for (const { name, payload } of events) {
      if (name === 'abilityActivated' && payload.playerId !== this.#cpu) {
        const emblem = state.players.find((p) => p.id === payload.playerId)?.emblems?.find((e) => e.id === payload.cardId);
        if (emblem && emblem.emblemId !== this.#ownEmblem) kind = kind ?? BANTER.RING;
      }
      if (name !== 'creatureDied' && name !== 'permanentDestroyed') continue;
      const dead = before.get(payload.cardId);
      if (!dead || dead.token || !dead.types?.includes('Creature')) continue;
      if (dead.controllerId !== this.#cpu) kind = BANTER.KILL;
      else if (kind !== BANTER.KILL && (dead.supertypes?.includes('Legendary') || (dead.power ?? 0) + (dead.toughness ?? 0) >= MATTERS_AT)) kind = BANTER.LOSS;
    }
    return kind;
  }
}

/**
 * A line of `banter` (an opponent's `{ kind: [lines] }`) for `kind`, avoiding
 * those in `used` (a Set, which it adds to) until all have been said. Null when
 * there's none.
 */
export function pickLine(banter, kind, { random = Math.random, used = new Set() } = {}) {
  const lines = banter?.[kind] ?? [];
  if (lines.length === 0) return null;
  const fresh = lines.filter((line) => !used.has(line));
  const from = fresh.length > 0 ? fresh : lines;
  const line = from[Math.floor(random() * from.length)];
  used.add(line);
  return line;
}

/** Problems with an opponent's banter, as messages. */
export function banterProblems(where, banter) {
  if (banter === undefined) return [];
  if (!banter || typeof banter !== 'object') return [`${where}: banter isn't an object`];
  const problems = [];
  for (const [kind, lines] of Object.entries(banter)) {
    if (!BANTER_KINDS.includes(kind)) problems.push(`${where}: unknown banter kind "${kind}"`);
    else if (!Array.isArray(lines) || lines.length === 0 || !lines.every((l) => typeof l === 'string' && l.trim())) {
      problems.push(`${where}: banter "${kind}" needs lines`);
    }
  }
  return problems;
}
