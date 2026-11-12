/**
 * Moves with a reason. At each decision the Strategist considers only the plays that have a point
 * right now, so its search stays small:
 *
 * - **Its main phase:** creatures and other permanents come down at once (mana is free, so there's
 *   nothing to weigh); a free power with no target is used at once; sorceries, Auras, and powers
 *   that need a target or a payment are choices, each on its best targets. Instants and tricks
 *   wait, unless they win on the spot or have to come before blockers ("can't block", haste, menace).
 * - **After blockers, and when the opponent's spell or ability is on the stack:** anything at
 *   instant speed, but only if it *flips an outcome* (see probe): it kills a creature that would
 *   live, saves one that would die, wins, or stops a loss (a free power may also just save life).
 *   A pump that changes nothing is never a move.
 * - **Before its attack:** removal and "can't block" on a blocker. **When attacked:** a flash
 *   creature to block with, removal on an attacker. **The opponent's end step:** what's left that's
 *   worth doing at instant speed.
 * - **Attacks and blocks:** the heuristic plans (combat.js, attacking.js, blocking.js) and small
 *   variations of them.
 *
 * `candidates(state, me, game)` returns macros (macroActions.js), the likeliest first; one macro
 * means there's nothing to choose. `null` means the decision is left to the basic AI's rules
 * (dividing damage, the legend rule, scrying, ...).
 */
import { ACTION } from '../../engine/actions.js';
import { DECISION, GAME_STATUS } from '../../engine/Game.js';
import { PHASE, STEP } from '../../engine/turnStructure.js';
import {
  isCreature, isLand, isAura, isCurse, isPermanentCard, hasKeyword, cantAttack, KEYWORD, EFFECT, flattenEffects, isHarmfulEffect, castsAtInstantSpeed,
} from '../../cards/cards.js';
import {
  creatureValue, curseValue, chooseBlocks, damageThrough, resolveCombat, unblockedDamage,
} from '../combat.js';
import { scoreEffects, costScore, wastedDamage } from '../scoring.js';
import { listMacros, macroKey } from '../macroActions.js';
import { guardActivations } from '../manaPlanning.js';
import { BLOCK_PLAN, blockingPlans } from '../blocking.js';
import { BasicAIController } from '../BasicAIController.js';
import { actingPlayerId } from '../simulate.js';
import { winsNow } from '../timing.js';

/** How many targets of one spell or ability are worth a look. */
const TARGETS = 2;
/** The most attacks and blocks considered at one declaration. */
const MAX_ATTACKS = 9;
const MAX_BLOCKS = 7;
/** What a trick must gain (in creatureValue points, see material) to be a move: a card's worth, or anything at all for a free power. */
/** On a tie (in chance of winning), doing nothing beats doing something for no gain. */
const IDLE = 0.004;
const CARD_GAIN = 2.5;
const FREE_GAIN = 0.4;

const WINDOW = Object.freeze({ MAIN: 'main', BEGIN_COMBAT: 'beginCombat', ATTACKED: 'attacked', COMBAT: 'combat', RESPONSE: 'response', END: 'end' });

/**
 * The moment `me` has priority in, or null when it never acts (it just passes). It depends only on
 * what both players can see, so passing quickly outside these moments gives nothing away.
 */
export function windowOf(state, me) {
  const myTurn = state.activePlayerId === me;
  const top = state.stack[state.stack.length - 1];
  if (top) return top.controllerId !== me ? WINDOW.RESPONSE : null;
  if (myTurn && (state.phase === PHASE.PRECOMBAT_MAIN || state.phase === PHASE.POSTCOMBAT_MAIN)) return WINDOW.MAIN;
  if (myTurn && state.step === STEP.BEGINNING_OF_COMBAT) return WINDOW.BEGIN_COMBAT;
  if (state.step === STEP.DECLARE_BLOCKERS && state.combat.attackers.length) return WINDOW.COMBAT;
  if (!myTurn && state.step === STEP.DECLARE_ATTACKERS) return state.combat.attackers.length ? WINDOW.ATTACKED : null;
  if (!myTurn && state.step === STEP.END) return WINDOW.END;
  return null;
}

const raw = (action, extra = {}) => ({ kind: 'raw', action, key: macroKey({ kind: 'raw', action }), ...extra });

/** Life as points: each point matters more when there are few. */
const lifePoints = (life) => 9 * Math.log(1 + Math.max(0, life));

/**
 * What's on the table for `me`, in creatureValue points: creatures and other permanents, ours minus
 * theirs, and with `life`, life too; a finished game counts for far more than any of it. `worth`
 * (permanent id → value) fixes what each permanent counts for, so that a pump that's still on at the
 * moment of counting isn't mistaken for something gained.
 */
export function material(state, me, { life = true, worth = null } = {}) {
  if (state.status === GAME_STATUS.GAME_OVER) return state.winnerId === me ? 1000 : state.winnerId === null ? 0 : -1000;
  let total = 0;
  for (const p of state.battlefield) {
    if (isLand(p)) continue;
    const value = worth?.get(p.id) ?? (isCreature(p) ? 2 + creatureValue(p) : 2);
    total += p.controllerId === me ? value : -value;
  }
  if (life) for (const player of state.players) total += (player.id === me ? 1 : -1) * lifePoints(player.life);
  return total;
}

/**
 * Plays `action` (or nothing) on a copy and lets things take their course, everyone passing: the
 * stack empties and, if it's combat, damage is dealt. Returns material() for `me` then (`life`: counting
 * life), each permanent counted for what it's worth now, before any of it. The difference between an
 * action's probe and passing's is what the action really changes: who lives, who dies, who wins.
 */
export function probe(game, me, action, { life = true } = {}) {
  const copy = game.clone();
  const worth = new Map(copy.peekState().battlefield.map((p) => [p.id, isCreature(p) ? 2 + creatureValue(p) : 2]));
  if (action) copy.applyTrusted(action);
  const helpers = {};
  for (let step = 0; step < 80; step++) {
    const state = copy.peekState();
    if (state.status !== GAME_STATUS.IN_PROGRESS) break;
    const fighting = state.combat.attackers.length > 0
      && (state.step === STEP.DECLARE_ATTACKERS || state.step === STEP.DECLARE_BLOCKERS || state.step === STEP.FIRST_STRIKE_DAMAGE || state.step === STEP.COMBAT_DAMAGE);
    if (state.stack.length === 0 && !state.pendingDecision && !fighting) break;
    const actor = actingPlayerId(state);
    const mine = state.validActions.filter((a) => a.playerId === actor);
    let next = state.pendingDecision ? null : mine.find((a) => a.type === ACTION.PASS_PRIORITY);
    if (!next) {
      helpers[actor] ??= new BasicAIController({ game: null, playerId: actor, attacking: 'basic' });
      next = helpers[actor].chooseAction(state) ?? mine[0];
    }
    if (!next) break;
    copy.applyTrusted(next);
  }
  return material(copy.peekState(), me, { life, worth });
}

/** What a cast or activation does: its source, effects, and how it's timed. */
function describe(state, me, action) {
  const player = state.players.find((p) => p.id === me);
  if (action.type === ACTION.CAST_SPELL) {
    const card = player.hand.find((c) => c.id === action.cardId)
      ?? state.players.flatMap((p) => p.exile ?? []).find((c) => c.id === action.cardId) ?? player.library?.find((c) => c.id === action.cardId);
    if (!card) return null;
    const holder = card.spell?.modes && action.mode !== undefined && !Array.isArray(action.mode) ? card.spell.modes[action.mode] : card.spell;
    const effects = Array.isArray(action.mode) ? action.mode.flatMap((i) => card.spell.modes[i].effects ?? []) : holder?.effects ?? [];
    return {
      card, spell: true, permanent: isPermanentCard(card), effects, cost: card.additionalCost ?? {}, free: false,
      instant: castsAtInstantSpeed(card), sorcerySpeed: !castsAtInstantSpeed(card), group: `c:${card.id}:${JSON.stringify(action.mode ?? '')}`,
    };
  }
  const source = state.battlefield.find((p) => p.id === action.cardId) ?? player.emblems.find((e) => e.id === action.cardId)
    ?? player.hand.find((c) => c.id === action.cardId) ?? player.graveyard.find((c) => c.id === action.cardId);
  if (!source) return null;
  const ability = [...(source.abilities ?? []), ...(source.grantedAbilities ?? []), ...(source.handAbilities ?? []), ...(source.graveyardAbilities ?? [])]
    .find((a) => a.id === action.abilityId);
  if (!ability || ability.isManaAbility) return null;
  const cost = ability.cost ?? {};
  return {
    card: source, spell: false, permanent: false, effects: ability.effects ?? [], cost, ability,
    free: !cost.life && !cost.sacrifice && !cost.sacrificeSelf && !cost.discard && !cost.tap,
    instant: ability.timing !== 'sorcery', sorcerySpeed: ability.timing === 'sorcery', group: `a:${source.id}:${ability.id}`,
  };
}

/** Effects that have to be in place before blockers are declared to matter: evasion, haste, tapping a blocker. */
function enables(effects) {
  return flattenEffects(effects).some((e) => e.type === EFFECT.TAP
    || (e.type === EFFECT.PUMP && (e.keywords ?? []).some((k) => [KEYWORD.CANT_BLOCK, KEYWORD.CANT_BE_BLOCKED, KEYWORD.MENACE, KEYWORD.FLYING, KEYWORD.HASTE].includes(k))));
}

/** A pump or protection that only lasts the turn: a trick, wasted outside a fight. */
const isTrick = (effects) => flattenEffects(effects).some((e) => e.type === EFFECT.PUMP && !e.untilYourNextTurn) && !flattenEffects(effects).some(isHarmfulEffect);

function priorityCandidates(state, me, game) {
  const mine = guardActivations(state, state.validActions.filter((a) => a.playerId === me));
  const pass = mine.find((a) => a.type === ACTION.PASS_PRIORITY);
  const passMacro = pass ? [raw(pass, { intent: 'pass' })] : [];
  const window = windowOf(state, me);
  if (!window || mine.length <= 1) return passMacro;
  const preCombat = state.phase === PHASE.PRECOMBAT_MAIN || window === WINDOW.BEGIN_COMBAT;
  const byId = (id) => state.battlefield.find((p) => p.id === id);
  const isMine = (id) => id === me || byId(id)?.controllerId === me;

  // A land is free: play it (some have abilities worth having).
  if (window === WINDOW.MAIN) {
    const land = mine.find((a) => a.type === ACTION.PLAY_LAND);
    if (land) return [raw(land, { intent: 'deploy' })];
  }

  // Each spell or ability once, on its best targets.
  const groups = new Map();
  for (const action of mine) {
    if (action.type !== ACTION.CAST_SPELL && action.type !== ACTION.ACTIVATE_ABILITY) continue;
    const what = describe(state, me, action);
    if (!what) continue;
    const targets = (action.targets ?? []).filter(Boolean);
    let score;
    if (what.spell && what.permanent) {
      if (isAura(what.card)) {
        const host = byId(targets[0]);
        if (!host || !isCreature(host)) continue;
        if (isCurse(what.card)) score = isMine(host.id) ? -1 : curseValue(host, what.card);
        else score = isMine(host.id) ? creatureValue(host) : -1;
      } else score = 1;
    } else if (flattenEffects(what.effects).some((e) => e.type === EFFECT.ATTACH)) {
      // Equip: onto our best creature, and only to move up.
      const host = byId(targets[0]);
      const current = byId(what.card.attachedTo);
      score = host && isMine(host.id) && host.id !== what.card.attachedTo && (!current || creatureValue(host) > creatureValue(current) + 0.5)
        ? creatureValue(host) : -1;
    } else {
      try {
        score = scoreEffects(state, me, what.effects, action.targets ?? [], what.card.id, { x: action.x, preCombat })
          + costScore(state, me, what.cost, action.costChoices ?? {}, what.card.id);
      } catch {
        // A target the scoring doesn't know (a card in a graveyard, a spell): not a play it can judge.
        continue;
      }
      if (wastedDamage(state, me, what.effects, targets, what.card.id)) score = -1;
    }
    if (!(score > 0)) continue;
    const entry = { action, what, score, targets };
    const list = groups.get(what.group) ?? [];
    // One entry per set of targets: the best way to pay, the biggest X.
    const same = list.findIndex((e) => e.targets.join() === targets.join());
    if (same < 0) list.push(entry);
    else if (score > list[same].score || (score === list[same].score && (action.x ?? 0) > (list[same].action.x ?? 0))) list[same] = entry;
    groups.set(what.group, list);
  }
  const options = [...groups.values()].flatMap((list) => list.sort((a, b) => b.score - a.score).slice(0, TARGETS));
  if (options.length === 0) return passMacro;

  const forced = [];
  const choices = [];
  let probes = [];
  for (const option of options) {
    const { what, action, targets } = option;
    const effects = flattenEffects(what.effects);
    const wins = winsNow(effects, targets[0], state, me);
    const harmful = effects.some(isHarmfulEffect);
    const onTheirCreature = targets.some((id) => byId(id) && isCreature(byId(id)) && !isMine(id));
    const trick = isTrick(what.effects);
    const move = raw(action, { intent: harmful ? 'remove' : what.permanent ? 'deploy' : 'use', score: option.score });
    switch (window) {
      case WINDOW.MAIN: {
        if (wins) return [move];
        if (what.spell && what.permanent) {
          // Flash: holding it for their turn is a real choice. Everything else comes down.
          if (hasKeyword(what.card, KEYWORD.FLASH) || isAura(what.card)) choices.push(move);
          else forced.push(move);
          break;
        }
        if (what.instant) {
          // Only what has to happen before blockers, on a turn with something to attack with.
          if (what.spell || !preCombat) break;
          if (trick && !enables(what.effects)) break;
          if (what.ability?.cost?.tap && isCreature(what.card) && !cantAttack(what.card)) break;
          choices.push(move);
          break;
        }
        // Sorcery speed. A pump that ends with the turn only before combat.
        if (trick && !preCombat) break;
        if (!what.spell && what.free && targets.length === 0) forced.push(move);
        else choices.push(move);
        break;
      }
      case WINDOW.BEGIN_COMBAT:
        if ((harmful && onTheirCreature) || (enables(what.effects) && !trick)) choices.push(move);
        break;
      case WINDOW.ATTACKED:
        if (what.spell && what.permanent ? isCreature(what.card) : harmful && targets.some((id) => state.combat.attackers.some((a) => a.cardId === id))) choices.push(move);
        break;
      case WINDOW.COMBAT:
      case WINDOW.RESPONSE:
        // Tricks, removal, counterspells and powers: not a permanent, but for an Aura with flash.
        if (what.spell && what.permanent && !isAura(what.card)) break;
        probes.push({ option, move });
        break;
      case WINDOW.END:
        if (trick || (harmful && onTheirCreature)) break;
        if (what.spell && what.permanent) forced.push(move);
        else if (what.spell || what.free) choices.push(move);
        break;
      default:
    }
  }
  if (forced.length) return [forced.sort((a, b) => b.score - a.score)[0]];
  if (probes.length && game) {
    // Only what flips an outcome: compare with letting things take their course.
    probes = probes.sort((a, b) => b.option.score - a.option.score).slice(0, 6);
    // A card has to change who lives and dies (or who wins); a free power may also just save life.
    const baseline = { true: probe(game, me, null), false: probe(game, me, null, { life: false }) };
    for (const { option, move } of probes) {
      const life = !option.what.spell;
      const gain = probe(game, me, option.action, { life }) - baseline[life];
      if (gain >= (option.what.spell ? CARD_GAIN : FREE_GAIN)) choices.push({ ...move, intent: 'trick', score: 10 + gain });
    }
  }
  choices.sort((a, b) => b.score - a.score);
  // On a tie, doing nothing wins.
  return [...choices.slice(0, 5).map((move) => ({ ...move, handicap: IDLE })), ...passMacro];
}

/** How far ahead (in chance of winning) a move that looks like a blunder must be before it's chosen (see Search). */
const SUSPECT = 0.08;
const CHUMP = 0.05;

/** Ours, pumped until end of turn by something of ours (Théoden's haste, Burglar Bilbo's menace): it was pumped to attack. */
function pumpedToAttack(state, me) {
  const player = state.players.find((p) => p.id === me);
  const ours = (id) => player.emblems.some((e) => e.id === id) || state.battlefield.some((p) => p.id === id && p.controllerId === me)
    || player.graveyard.some((c) => c.id === id);
  return new Set((state.temporaryEffects ?? [])
    .filter((e) => (e.duration ?? 'endOfTurn') === 'endOfTurn' && ((e.power ?? 0) > 0 || (e.keywords ?? []).length > 0) && ours(e.sourceId))
    .map((e) => e.targetId));
}

function attackCandidates(state, me) {
  let macros = listMacros(state, me, { attacking: 'lookahead' });
  const byId = (id) => state.battlefield.find((p) => p.id === id);
  const opponent = state.players.find((p) => p.id !== me);
  const blockers = state.battlefield.filter((p) => p.controllerId === opponent.id && isCreature(p) && !p.tapped);
  const everything = macros.reduce((a, b) => (b.attackers.length > a.attackers.length ? b : a));
  // Lethal on the board through any blocks: attack with everything.
  if (everything.attackers.length && damageThrough(everything.attackers.map(byId), blockers) >= opponent.life) return [everything];
  // A creature pumped this turn was pumped to attack.
  const pumped = [...pumpedToAttack(state, me)].filter((id) => everything.attackers.includes(id));
  if (pumped.length) {
    const kept = macros.filter((m) => pumped.every((id) => m.attackers.includes(id)));
    if (kept.length) macros = kept;
  }
  macros = macros.slice(0, MAX_ATTACKS);
  // An attack that can lose a creature and get nothing for it has to be clearly better to be made.
  return macros.map((macro) => {
    if (macro.attackers.length === 0 || blockers.length === 0) return macro;
    const plan = blockingPlans(macro.attackers.map(byId), blockers, opponent.life, { plans: [BLOCK_PLAN.KILLS] })[BLOCK_PLAN.KILLS];
    const forNothing = plan && plan.deadAttackers.length > 0 && plan.deadBlockers.length === 0 && plan.lifeAfter >= opponent.life;
    return forNothing ? { ...macro, handicap: SUSPECT } : macro;
  });
}

function blockCandidates(state, me) {
  const macros = listMacros(state, me);
  const decision = state.pendingDecision;
  const mine = state.validActions.filter((a) => a.playerId === me);
  const canBlockPair = (blockerId, attackerId) => decision.blocks[blockerId] === attackerId
    || mine.some((a) => a.type === ACTION.SET_BLOCKER && a.cardId === blockerId && a.attackerId === attackerId);
  const seen = new Set(macros.map((m) => m.key));
  const extra = [];
  for (const plan of Object.values(BLOCK_PLAN)) {
    const blocks = chooseBlocks(state, me, canBlockPair, { blocking: plan });
    const macro = { kind: 'block', blocks };
    macro.key = macroKey(macro);
    if (!seen.has(macro.key)) {
      seen.add(macro.key);
      extra.push(macro);
    }
  }
  // The value plan, no blocks, then the other plans, then one-blocker changes.
  const all = [...macros.slice(0, 3), ...extra, ...macros.slice(3)].slice(0, MAX_BLOCKS);
  // A chump block (the blocker dies, the attacker doesn't) when the life isn't needed has to be clearly better.
  const byId = (id) => state.battlefield.find((p) => p.id === id);
  const life = state.players.find((p) => p.id === me).life;
  const incoming = state.combat.attackers.reduce((sum, a) => sum + unblockedDamage(byId(a.cardId)), 0);
  if (incoming * 2 >= life) return all;
  return all.map((macro) => {
    const chump = state.combat.attackers.some(({ cardId }) => {
      const group = Object.entries(macro.blocks).filter(([, a]) => a === cardId).map(([b]) => byId(b));
      if (group.length !== 1) return false;
      const result = resolveCombat(byId(cardId), group);
      return !result.attackerDies && result.deadBlockers.length === 1;
    });
    return chump ? { ...macro, handicap: CHUMP } : macro;
  });
}

/**
 * The moves worth considering for `me` now, likeliest first. `game`: the game `state` is of, for
 * probes (without it, tricks aren't offered). Null: not a decision the Strategist reasons about.
 */
export function candidates(state, me, game = null) {
  const decision = state.pendingDecision;
  if (!decision) return priorityCandidates(state, me, game);
  if (decision.playerId !== me) return [];
  switch (decision.type) {
    case DECISION.DECLARE_ATTACKERS: return attackCandidates(state, me);
    case DECISION.DECLARE_BLOCKERS: return blockCandidates(state, me);
    case DECISION.CHOOSE_TARGETS:
    case DECISION.CHOOSE_MODE: return listMacros(state, me).slice(0, 4);
    default: return null;
  }
}
