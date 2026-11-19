/**
 * What happened in a round, counted from the game's events, for the recap after a match and the Red Book
 * (src/match/book.js): damage dealt to the opponent and taken from them, creatures felled and lost, spells cast,
 * turns, and the hardest single blow you struck (the card, and how much).
 */

/** A round's stats with nothing counted. */
export const emptyStats = () => ({ dealt: 0, taken: 0, felled: 0, lost: 0, spells: 0, turns: 0, blow: null });

/**
 * Counts a round for the player `me`. Feed it each batch of events with the state that follows (as the battle gets
 * them, see app/battle/Battle.js); `stats` is the count so far.
 */
export class RoundStats {
  #me;
  #stats = emptyStats();
  /** Every card seen on the battlefield or the stack: who controlled it and its name (what dealt a blow may be gone by the next state). */
  #known = new Map();
  /** The creatures already counted as dead (one may be both destroyed and reported dead). */
  #dead = new Set();

  constructor({ me }) {
    this.#me = me;
  }

  get stats() { return { ...this.#stats, blow: this.#stats.blow ? { ...this.#stats.blow } : null }; }

  observe(events, state) {
    const stats = this.#stats;
    const blow = (sourceId, amount) => {
      const source = this.#known.get(sourceId);
      if (!source || source.controllerId !== this.#me || amount <= (stats.blow?.amount ?? 0)) return;
      stats.blow = { name: source.name, amount };
    };
    const damage = ({ sourceId, targetPlayerId, amount }) => {
      if (!(amount > 0)) return;
      if (targetPlayerId === this.#me) stats.taken += amount;
      else if (targetPlayerId) stats.dealt += amount;
      blow(sourceId, amount);
    };
    for (const { name, payload } of events) {
      if (name === 'combatDamageDealt') (payload.damage ?? []).forEach(damage);
      else if (name === 'damageDealt') damage(payload);
      else if (name === 'spellCast' && payload.playerId === this.#me) stats.spells += 1;
      else if (name === 'creatureDied' || name === 'permanentDestroyed') {
        const dead = this.#known.get(payload.cardId);
        if (!dead?.creature || this.#dead.has(payload.cardId)) continue;
        this.#dead.add(payload.cardId);
        if (dead.controllerId === this.#me) stats.lost += 1;
        else stats.felled += 1;
      }
    }
    for (const permanent of state.battlefield ?? []) {
      this.#known.set(permanent.id, { name: permanent.name, controllerId: permanent.controllerId, creature: Boolean(permanent.types?.includes('Creature')) });
      // Back on the battlefield (flickered, returned): it can die again.
      this.#dead.delete(permanent.id);
    }
    for (const object of state.stack ?? []) {
      if (object.card) this.#known.set(object.card.id, { name: object.card.name, controllerId: object.controllerId, creature: false });
    }
    stats.turns = state.turn ?? stats.turns;
  }
}

/** A match's rounds' stats added up (rounds without stats count nothing): the totals, and the hardest blow of them all. */
export function matchStats(match) {
  const total = emptyStats();
  for (const round of match.rounds ?? []) {
    const stats = round.stats;
    if (!stats) continue;
    for (const key of ['dealt', 'taken', 'felled', 'lost', 'spells', 'turns']) total[key] += stats[key] ?? 0;
    if (stats.blow && stats.blow.amount > (total.blow?.amount ?? 0)) total.blow = { ...stats.blow };
  }
  return total;
}
