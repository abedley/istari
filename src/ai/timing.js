/**
 * When the AIs act at instant speed. Instants and permanents with flash wait for the last moment
 * they're needed, never the AI's own main phase:
 * - removal on the opponent's creatures, and "can't block" effects: at the start of the AI's combat
 *   (clearing the way), or on attackers once the opponent attacks, or on combatants after blocks;
 * - combat tricks (pumps, "base 5/5", flash Auras that pump): after blockers are declared, and only if they
 *   kill an opponent's creature that would otherwise survive, or make the combat damage lethal, alone or with
 *   other tricks in hand (trickPays);
 * - creatures with flash: as surprise blockers when the opponent attacks, otherwise at the end of the
 *   opponent's turn, like the other instants (card draw, life gain, ...);
 * - counterspells: in response to the opponent's spell.
 * A spell that wins on the spot (burn for the opponent's last life points) is cast at any time.
 * The basic AI follows this (BasicAIController), and the search AI only considers instant-speed
 * casts that fit it (macroActions.js).
 */
import { STEP, PHASE } from '../engine/turnStructure.js';
import {
  isCreature, isLand, isHarmfulEffect, flattenEffects, manaValue, EFFECT, KEYWORD, AFFECTED, castsAtInstantSpeed, isAura, isCurse,
} from '../cards/cards.js';
import { resolveCombat } from './combat.js';

/** Moments when the AI considers acting (anything else it passes). */
export const WINDOW = Object.freeze({
  /** Its own main phase with an empty stack: lands, creatures, sorceries, abilities. */
  MAIN: 'main',
  /** Its own beginning of combat: removal and "can't block" on the opponent's creatures. */
  BEGIN_COMBAT: 'beginCombat',
  /** After blockers are declared, in anyone's combat: tricks and removal on combatants. */
  COMBAT: 'combat',
  /** The opponent has attacked: removal on attackers, flash blockers. */
  ATTACKED: 'attacked',
  /** The opponent's spell is on top of the stack: counterspells. */
  RESPONSE: 'response',
  /** The opponent's end step: instants held up for this. */
  END: 'end',
});

/** The window `me` is in, or null when the AI just passes. */
export function windowOf(state, me) {
  const myTurn = state.activePlayerId === me;
  const top = state.stack[state.stack.length - 1];
  if (top) return top.kind === 'spell' && top.controllerId !== me ? WINDOW.RESPONSE : null;
  if (myTurn && (state.phase === PHASE.PRECOMBAT_MAIN || state.phase === PHASE.POSTCOMBAT_MAIN)) return WINDOW.MAIN;
  if (myTurn && state.step === STEP.BEGINNING_OF_COMBAT) return WINDOW.BEGIN_COMBAT;
  if (state.step === STEP.DECLARE_BLOCKERS) return WINDOW.COMBAT;
  if (!myTurn && state.step === STEP.DECLARE_ATTACKERS) return state.combat.attackers.length ? WINDOW.ATTACKED : null;
  if (!myTurn && state.step === STEP.END) return WINDOW.END;
  return null;
}

/** Whether `id` is an opponent of `me`, or a permanent one controls. */
export const isTheirs = (state, me, id) => state.battlefield.some((p) => p.id === id && p.controllerId !== me)
  || (state.players.some((p) => p.id === id) && id !== me);

/** Whether these effects, aimed at `targetId`, win the game now: damage to an opponent at least their life. */
export function winsNow(given, targetId, state, me) {
  const player = state.players.find((p) => p.id === targetId && p.id !== me);
  if (!player) return false;
  const damage = flattenEffects(given).filter((e) => e.type === EFFECT.DEAL_DAMAGE && typeof e.amount === 'number')
    .reduce((sum, e) => sum + e.amount, 0);
  return damage >= player.life;
}

/** A pump that makes a creature bigger (+X/+X, or "has base power and toughness 5/5"): a combat trick. */
const isTrickPump = (e) => e.type === EFFECT.PUMP && (Boolean(e.setBase) || (e.power ?? 0) + (e.toughness ?? 0) > 0);

/** What a bonus Aura (not a curse) gives the creature it enchants, as pumps: Gift of Strands' +3/+3. */
export function auraPumps(card) {
  if (!isAura(card) || isCurse(card)) return [];
  return (card.staticAbilities ?? []).filter((e) => e.affected === AFFECTED.ATTACHED_PERMANENT && (e.power || e.toughness))
    .map((e) => ({ type: EFFECT.PUMP, power: e.power ?? 0, toughness: e.toughness ?? 0, keywords: e.keywords ?? [] }));
}

/** A creature with pumps applied: "base 5/5" first, then the +X/+X ones. */
const pumped = (creature, pumps) => [...pumps].sort((a, b) => Boolean(b.setBase) - Boolean(a.setBase)).reduce((c, e) => ({
  ...c,
  power: e.setBase?.power ?? c.power + (e.power ?? 0),
  toughness: e.setBase?.toughness ?? c.toughness + (e.toughness ?? 0),
  keywords: [...new Set([...(c.keywords ?? []), ...(e.keywords ?? [])])],
}), creature);

/** A card's combat-trick pumps: an instant-speed spell's, or a flash Aura's bonus; [] if it isn't a trick. */
const trickPumpsOf = (card) => (!castsAtInstantSpeed(card) ? []
  : card.spell ? flattenEffects(card.spell.effects ?? []).filter(isTrickPump) : auraPumps(card));

/** How many other tricks (besides the one being cast) a combination may use: up to three cards in all. */
const MAX_PARTNERS = 2;

/**
 * Whether a combat trick (these pumps on `targetId`, or on each creature `me` controls) is worth casting in this
 * combat: it kills a creature of the opponent's that would survive without it, or it makes the combat damage to the
 * opponent lethal. Saving our own creature, or more damage that doesn't kill, isn't enough.
 *
 * When it can't on its own, it still pays as the first of a few tricks from the hand that together do (the fewest,
 * up to MAX_PARTNERS more, with the mana for all of them); once it has resolved, the next one pays on its own against
 * the pumped creature. `sourceId` is the card being cast (so it isn't counted twice). Not when another trick in hand
 * does the job alone: that one is cast instead.
 */
export function trickPays(state, me, given, targetId, { sourceId = null, combine = true } = {}) {
  if (!state.combat?.attackers.length) return false;
  const pumps = flattenEffects(given).filter(isTrickPump);
  if (!pumps.length) return false;
  const byId = (id) => state.battlefield.find((p) => p.id === id);
  const mine = (p) => p && p.controllerId === me && isCreature(p);
  const myCreatures = state.battlefield.filter(mine).map((p) => p.id);
  // Whom pumps go on: everything we control ("creatures you control get +1/+1"), or the target if it's ours.
  const onto = (effects, id) => new Set(effects.some((e) => e.affected === AFFECTED.EACH_CREATURE_YOU_CONTROL)
    ? myCreatures : mine(byId(id)) ? [id] : []);
  const first = { pumps, ids: onto(pumps, targetId) };
  if (!first.ids.size) return false;
  /** What combat does with these tricks: the opponent's creatures that die, and the damage dealt to them. */
  const outcome = (tricks) => {
    const modify = (c) => {
      const on = tricks.filter((t) => t.ids.has(c.id)).flatMap((t) => t.pumps);
      return on.length ? pumped(c, on) : c;
    };
    const killed = new Set();
    let damage = 0;
    for (const { cardId, blockerIds, blocked } of state.combat.attackers) {
      const attacker = byId(cardId);
      if (!attacker) continue;
      const blockers = blockerIds.map(byId).filter(Boolean);
      const result = resolveCombat(modify(attacker), blockers.map(modify), { blocked: blocked ?? blockers.length > 0 });
      if (result.attackerDies && attacker.controllerId !== me) killed.add(attacker.id);
      for (const id of result.deadBlockers) if (byId(id)?.controllerId !== me) killed.add(id);
      if (attacker.controllerId === me) damage += result.playerDamage;
    }
    return { killed, damage };
  };
  const before = outcome([]);
  const opponent = state.players.find((p) => p.id !== me && !p.hasLost);
  const pays = (tricks) => {
    const after = outcome(tricks);
    if (opponent && after.damage >= opponent.life && before.damage < opponent.life) return true;
    return [...after.killed].some((id) => !before.killed.has(id));
  };
  if (pays([first])) return true;
  if (!combine) return false;

  // The other tricks in hand, each on any of our creatures in this combat.
  const player = state.players.find((p) => p.id === me);
  const fighting = new Set(state.combat.attackers.flatMap((a) => [a.cardId, ...a.blockerIds]).filter((id) => mine(byId(id))));
  const others = (player?.hand ?? []).filter((c) => c.id !== sourceId).flatMap((card) => {
    const cardPumps = trickPumpsOf(card);
    if (!cardPumps.length) return [];
    if (cardPumps.some((e) => e.affected === AFFECTED.EACH_CREATURE_YOU_CONTROL)) return [{ card, pumps: cardPumps, ids: new Set(myCreatures) }];
    return [...fighting].map((id) => ({ card, pumps: cardPumps, ids: new Set([id]) }));
  });
  // Another trick that does it alone goes first, rather than spending several cards.
  if (others.some((o) => pays([o]))) return false;
  // The mana for this card and its partners (any amount with infinite mana).
  const pool = Object.values(player?.manaPool ?? {}).reduce((sum, n) => sum + n, 0);
  const lands = state.battlefield.filter((p) => p.controllerId === me && isLand(p) && !p.tapped).length;
  const available = state.infiniteMana ? Infinity : pool + lands;
  const cost = (card) => manaValue(card?.manaCost ?? {});
  const own = cost(player?.hand?.find((c) => c.id === sourceId));
  // The fewest partners first: one, then two (each card once).
  const search = (chosen, from, size) => {
    if (chosen.length === size) {
      return own + chosen.reduce((sum, o) => sum + cost(o.card), 0) <= available && pays([first, ...chosen]);
    }
    for (let i = from; i < others.length; i++) {
      if (chosen.some((o) => o.card.id === others[i].card.id)) continue;
      if (search([...chosen, others[i]], i + 1, size)) return true;
    }
    return false;
  };
  for (let size = 1; size <= MAX_PARTNERS; size++) if (search([], 0, size)) return true;
  return false;
}

/**
 * Whether these effects (of a spell, or an ability with `instantSpeed`) are worth using in this
 * window, rather than waiting for a better one. `ability`: an activated ability, which costs no card,
 * so a pump of it (firebreathing) is fine whenever it helps in combat; a trick spell has to pay.
 */
export function windowAllows(window, given, instantSpeed, targetId, state, me, { ability = false, sourceId = null } = {}) {
  const effects = flattenEffects(given);
  const counters = effects.some((e) => e.type === EFFECT.COUNTER_SPELL);
  if (window === WINDOW.RESPONSE) return counters;
  if (counters) return false;
  if (winsNow(effects, targetId, state, me)) return true;
  const harmful = effects.some(isHarmfulEffect);
  const trick = effects.some(isTrickPump);
  const onCreature = targetId && state.battlefield.some((p) => p.id === targetId && isCreature(p));
  const onTheirCreature = onCreature && isTheirs(state, me, targetId);
  // Blocking restrictions only matter if they're in place before blockers are declared.
  const restricts = effects.some((e) => e.type === EFFECT.PUMP
    && (e.keywords ?? []).some((k) => k === KEYWORD.CANT_BLOCK || k === KEYWORD.CANT_BE_BLOCKED));
  switch (window) {
    case WINDOW.MAIN:
      // Sorcery-speed things now; instant-speed ones wait for when they're needed.
      return !instantSpeed;
    case WINDOW.BEGIN_COMBAT:
      // Clearing the way for the attack: removal on their creatures, blocking restrictions.
      return restricts || (harmful && onTheirCreature);
    case WINDOW.COMBAT:
      // A trick only when it kills one of theirs or wins the game (trickPays).
      return trick ? ability || trickPays(state, me, effects, targetId, { sourceId }) : harmful && onCreature;
    case WINDOW.ATTACKED:
      return harmful && onCreature && state.combat.attackers.some((a) => a.cardId === targetId);
    case WINDOW.END:
      // The last moment before our turn: anything but tricks, and removal on their creatures (which
      // waits for our attack or theirs).
      return !trick && !(harmful && onTheirCreature);
    default:
      return false;
  }
}

/**
 * When a permanent spell with flash is worth casting: as a blocker once the opponent attacks (a
 * creature), or at the end of the opponent's turn. Sorcery-speed permanents only in the main phase.
 * A bonus Aura with flash is a combat trick: after blocks, on the creature it makes pay (trickPays);
 * without a `targetId` (and `state`), whether its window has come at all.
 */
export function permanentWindowAllows(window, card, targetId = null, state = null, me = null) {
  if (!castsAtInstantSpeed(card)) return window === WINDOW.MAIN;
  const pumps = auraPumps(card);
  if (pumps.length) return window === WINDOW.COMBAT && (!state || trickPays(state, me, pumps, targetId, { sourceId: card.id }));
  if (window === WINDOW.ATTACKED) return isCreature(card);
  return window === WINDOW.END;
}
