/**
 * Blunder detectors for the arena: plays that look dumb whatever the position, counted per seat.
 * They only use rules of thumb, not either AI's judgment, and look at the real game:
 * - `wastedTrick`: a pump, shrink or protection used in combat or in response to something, that
 *   changed nothing (the same creatures live and die, nobody wins or loses by it, and for a power that costs
 *   nothing, no life is saved either; see probe in moves.js).
 * - `pumpNoAttack`: an until-end-of-turn pump put on its own creature in its main phase, and that
 *   creature didn't attack that turn.
 * - `missedLethal`: it attacked with less than everything when everything was lethal through any blocks.
 * - `thrownAway`: its attack lost a creature and got nothing for it: no creature killed, no damage dealt.
 * - `chump`: a block that lost the blocker without killing the attacker, when the whole attack unblocked
 *   would have taken less than half its life.
 */
import { ACTION } from '../src/engine/actions.js';
import { STEP } from '../src/engine/turnStructure.js';
import { isCreature, EFFECT, flattenEffects } from '../src/cards/cards.js';
import { damageThrough, resolveCombat, unblockedDamage } from '../src/ai/combat.js';
import { probe } from '../src/ai/strategist/moves.js';

function effectsOf(state, action) {
  const player = state.players.find((p) => p.id === action.playerId);
  if (action.type === ACTION.CAST_SPELL) {
    const card = player.hand.find((c) => c.id === action.cardId);
    if (!card?.spell) return null;
    const holder = card.spell.modes && action.mode !== undefined && !Array.isArray(action.mode) ? card.spell.modes[action.mode] : card.spell;
    return holder?.effects ?? [];
  }
  if (action.type !== ACTION.ACTIVATE_ABILITY) return null;
  const source = state.battlefield.find((p) => p.id === action.cardId) ?? player.emblems.find((e) => e.id === action.cardId);
  const ability = source?.abilities?.find((a) => a.id === action.abilityId);
  return ability && !ability.isManaAbility ? ability.effects ?? [] : null;
}

const isTrick = (effects) => {
  const flat = flattenEffects(effects);
  return flat.length > 0 && flat.every((e) => e.type === EFFECT.PUMP || e.type === EFFECT.UNTAP) && flat.some((e) => e.type === EFFECT.PUMP && !e.untilYourNextTurn);
};

export function watchBlunders(game, seats) {
  const counts = Object.fromEntries(seats.map((seat) => [seat, {}]));
  const add = (seat, kind) => { counts[seat][kind] = (counts[seat][kind] ?? 0) + 1; };
  /** Main-phase pumps this turn: `{ seat, targetId }`, and who attacked. */
  let pumped = [];
  let attacked = new Set();
  let turn = 0;
  /** The attack being fought: who attacked, and what was there before. */
  let fight = null;
  const creaturesOf = (state, id) => state.battlefield.filter((p) => p.controllerId === id && isCreature(p));
  const settle = (state) => {
    if (!fight) return;
    const alive = new Set(state.battlefield.map((p) => p.id));
    const lost = fight.mine.filter((id) => !alive.has(id)).length;
    const killed = fight.theirs.filter((id) => !alive.has(id)).length;
    const defender = state.players.find((p) => p.id === fight.defender);
    if (lost > 0 && killed === 0 && defender.life >= fight.life && state.status === 'inProgress') add(fight.attacker, 'thrownAway');
    fight = null;
  };
  return {
    before(state, actor, action) {
      if (state.turn !== turn) {
        for (const { seat, targetId } of pumped) if (!attacked.has(targetId)) add(seat, 'pumpNoAttack');
        pumped = [];
        attacked = new Set();
        turn = state.turn;
      }
      for (const a of state.combat.attackers) attacked.add(a.cardId);
      if (fight && (state.turn !== fight.turn || (state.step !== STEP.DECLARE_ATTACKERS && state.step !== STEP.DECLARE_BLOCKERS
        && state.step !== STEP.FIRST_STRIKE_DAMAGE && state.step !== STEP.COMBAT_DAMAGE))) settle(state);
      if (!action) return;
      const opponent = state.players.find((p) => p.id !== actor);
      const effects = effectsOf(state, action);
      if (effects && isTrick(effects)) {
        const inFight = state.step === STEP.DECLARE_BLOCKERS || state.stack.length > 0;
        if (inFight) {
          // A card has to change who lives, dies or wins; a power that costs nothing may also just save life.
          const life = action.type !== ACTION.CAST_SPELL;
          if (probe(game, actor, action, { life }) - probe(game, actor, null, { life }) <= 0.01) add(actor, 'wastedTrick');
        } else if (state.activePlayerId === actor) {
          const target = state.battlefield.find((p) => p.id === action.targets?.[0]);
          if (target?.controllerId === actor) pumped.push({ seat: actor, targetId: target.id });
        }
      }
      if (action.type === ACTION.CONFIRM_ATTACKERS) {
        const chosen = state.pendingDecision.attackers.map((id) => state.battlefield.find((p) => p.id === id));
        // Who may attack is the engine's call: the attackers chosen, and those it offers to add.
        const ids = new Set([...state.pendingDecision.attackers, ...state.validActions.filter((a) => a.type === ACTION.TOGGLE_ATTACKER).map((a) => a.cardId)]);
        const able = creaturesOf(state, actor).filter((c) => ids.has(c.id));
        const blockers = creaturesOf(state, opponent.id);
        if (damageThrough(able, blockers) >= opponent.life && damageThrough(chosen, blockers) < opponent.life) add(actor, 'missedLethal');
        if (chosen.length) {
          fight = { attacker: actor, defender: opponent.id, turn: state.turn, life: opponent.life, mine: chosen.map((c) => c.id), theirs: blockers.map((c) => c.id) };
        }
      }
      if (action.type === ACTION.CONFIRM_BLOCKERS) {
        const me = state.players.find((p) => p.id === actor);
        const byId = (id) => state.battlefield.find((p) => p.id === id);
        const incoming = state.combat.attackers.reduce((sum, a) => sum + unblockedDamage(byId(a.cardId)), 0);
        if (incoming * 2 < me.life) {
          const blocks = state.pendingDecision.blocks;
          for (const { cardId } of state.combat.attackers) {
            const group = Object.entries(blocks).filter(([, a]) => a === cardId).map(([b]) => byId(b));
            if (group.length !== 1) continue;
            const result = resolveCombat(byId(cardId), group);
            if (!result.attackerDies && result.deadBlockers.length === 1) add(actor, 'chump');
          }
        }
      }
    },
    counts: () => counts,
  };
}
