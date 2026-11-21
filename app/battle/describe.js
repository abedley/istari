/** Words for things on the battlefield: names, choices, phases and prompts. */
import { DECISION, CHOICE, OPENING_HAND_SIZE } from '../../src/engine/Game.js';
import { PHASE, STEP } from '../../src/engine/turnStructure.js';
import { formatMana } from '../../src/engine/mana.js';
import {
  EFFECT, AFFECTED, COUNTER, effectAffects, targetList,
} from '../../src/cards/cards.js';


/** Finds a card anywhere in a state (battlefield, hands, graveyards, exile, stack). */
export function findCard(state, id) {
  const permanent = state.battlefield.find((p) => p.id === id);
  if (permanent) return permanent;
  for (const player of state.players) {
    for (const zone of ['hand', 'graveyard', 'exile']) {
      const card = player[zone]?.find((c) => c.id === id);
      if (card) return card;
    }
    const emblem = player.emblems.find((e) => e.id === id);
    if (emblem) return emblem;
  }
  const object = state.stack.find((o) => o.id === id || o.card?.id === id);
  return object?.card ?? object ?? null;
}

export function nameOf(state, id, me) {
  if (id === me) return 'you';
  const player = state.players.find((p) => p.id === id);
  if (player) return player.name;
  const card = findCard(state, id);
  return card?.name ?? card?.sourceName ?? card?.text ?? 'it';
}

/** How a variant of a play differs from the others: what it sacrifices, discards or makes. */
export function variantLabel(state, variant, me) {
  const parts = [];
  const { sacrifice = [], discard = [] } = variant.costChoices ?? {};
  const withStats = (id) => {
    const card = findCard(state, id);
    if (card?.power === undefined) return nameOf(state, id, me);
    const hurt = card.damage ? `, ${card.damage} damage` : '';
    return `${card.name} (${card.power}/${card.toughness}${card.tapped ? ', tapped' : ''}${hurt})`;
  };
  if (sacrifice.length) parts.push(`Sacrifice ${sacrifice.map(withStats).join(', ')}`);
  if (discard.length) parts.push(`Discard ${discard.map((id) => nameOf(state, id, me)).join(', ')}`);
  if (variant.manaColor) parts.push(`Add {${variant.manaColor}}`);
  return parts.join(' · ') || 'Play';
}

/** Choices made by tapping a permanent on the board. */
export const BOARD_CHOICES = new Set([CHOICE.RING_BEARER, CHOICE.ARMY, CHOICE.SACRIFICE]);
/** Choices made by tapping a card in your hand. */
export const HAND_CHOICES = new Set([CHOICE.DISCARD, CHOICE.BOTTOM_FROM_HAND]);

const capitalize = (text) => text[0].toUpperCase() + text.slice(1);

/** A cost as words, for "you may pay" choices: "Sacrifice a Food", "Pay {2}{W}", "Pay 2 life". */
function costWords(state, cost, ids, me) {
  const parts = [];
  if (ids.length) parts.push(`Sacrifice ${ids.map((id) => nameOf(state, id, me)).join(', ')}`);
  if (cost?.mana) parts.push(`Pay ${formatMana(cost.mana)}`);
  if (cost?.life) parts.push(`Pay ${cost.life} life`);
  return parts.join(', ') || 'Pay';
}

/** What one option of a DECISION.CHOOSE reads as. */
export function choiceLabel(state, decision, choice, me) {
  if (choice === 'decline') return decision.kind === CHOICE.OPTIONAL_COST ? 'Don\'t pay' : 'Don\'t';
  switch (decision.kind) {
    case CHOICE.MAY: return choice === 'yes' ? 'Yes' : 'No';
    case CHOICE.PAY:
      // Ward—sacrifice a legend (Sauron, the Dark Lord): '0:<id>'.
      if (String(choice).includes(':')) return costWords(state, decision.cost, String(choice).split(':')[1].split(','), me);
      return choice === 'pay' ? costWords(state, decision.cost, [], me) : decision.counterId ? 'Don\'t pay (it\'s countered)' : 'Don\'t pay';
    case CHOICE.OPTIONAL_COST: {
      const [index, ids] = String(choice).split(':');
      return costWords(state, decision.costs[Number(index)], ids ? ids.split(',') : [], me);
    }
    case CHOICE.KEYWORD: return capitalize(choice);
    case CHOICE.COUNTER: return `${capitalize(choice)} counter`;
    case CHOICE.REMOVE_COUNTER: return `${capitalize(choice)} counter`;
    case CHOICE.CARD_TYPE: return `Protection from ${choice === 'Sorcery' ? 'sorceries' : `${choice.toLowerCase()}s`}`;
    case CHOICE.CREATURE_TYPE: return choice;
    case CHOICE.CAST_FREE_VARIANT: {
      // How the free spell is cast: its targets.
      const variant = decision.variants[Number(choice)];
      const targets = (variant.targets ?? []).filter(Boolean).map((id) => nameOf(state, id, me));
      return targets.length ? `Target ${targets.join(', ')}` : 'Cast it';
    }
    default: {
      const card = decision.cards?.find((c) => c.id === choice) ?? findCard(state, choice);
      return card?.name ?? String(choice);
    }
  }
}

/** The steps shown as pips in the middle of the board. */
export const TURN_PIPS = [
  { id: 'begin', label: 'Begin', match: (s) => s.phase === PHASE.BEGINNING },
  { id: 'main1', label: 'Main', match: (s) => s.phase === PHASE.PRECOMBAT_MAIN },
  { id: 'combat', label: 'Combat', match: (s) => s.phase === PHASE.COMBAT },
  { id: 'main2', label: 'Main 2', match: (s) => s.phase === PHASE.POSTCOMBAT_MAIN },
  { id: 'end', label: 'End', match: (s) => s.phase === PHASE.ENDING },
];

/** The steps of combat, shown on the combat pip while it's the current phase. */
export const COMBAT_STEPS = [
  { label: 'Begin combat', steps: [STEP.BEGINNING_OF_COMBAT] },
  { label: 'Attackers', steps: [STEP.DECLARE_ATTACKERS] },
  { label: 'Blockers', steps: [STEP.DECLARE_BLOCKERS] },
  { label: 'Damage', steps: [STEP.FIRST_STRIKE_DAMAGE, STEP.COMBAT_DAMAGE, STEP.END_OF_COMBAT] },
];

/** The index into COMBAT_STEPS of the current step (-1 outside combat). */
export const combatStepIndex = (state) => (state.phase === PHASE.COMBAT ? COMBAT_STEPS.findIndex((c) => c.steps.includes(state.step)) : -1);

/** A short line saying what the game is waiting for. */
export function promptFor(state, me) {
  const decision = state.pendingDecision;
  if (decision?.playerId === me) {
    switch (decision.type) {
      case DECISION.DECLARE_ATTACKERS: return 'Tap creatures to attack';
      case DECISION.DECLARE_BLOCKERS: return 'Tap your creature, then an attacker';
      case DECISION.DISCARD_TO_HAND_SIZE: return `Discard ${decision.count} card${decision.count > 1 ? 's' : ''}`;
      case DECISION.ASSIGN_COMBAT_DAMAGE: return 'Assign combat damage';
      case DECISION.CHOOSE_TARGETS:
        return `${decision.optional ? 'You may choose' : 'Choose'} a target: ${decision.sourceName}`;
      case DECISION.CHOOSE_MODE: return `Choose one: ${decision.sourceName}`;
      case DECISION.LEGEND_RULE: return `Keep one ${decision.name}`;
      case DECISION.MULLIGAN: return 'Keep this hand?';
      case DECISION.PUT_ON_BOTTOM: return `Tap ${decision.count} card${decision.count > 1 ? 's' : ''} to put on the bottom`;
      case DECISION.CHOOSE: return choosePrompt(decision);
      case DECISION.CHOOSE_MANY:
        switch (decision.kind) {
          case CHOICE.SCRY: return `Scry ${decision.options.length}: tap the cards to keep on top, in order`;
          case CHOICE.SEARCH: return `Search your library: choose up to ${decision.max}`;
          case CHOICE.LOOK:
            return decision.destination === 'battlefield' ? 'Choose any artifacts and lands to put onto the battlefield'
              : `Look at the top ${decision.looked.length}: you may take ${decision.max === 1 ? 'a card' : `up to ${decision.max}`}`;
          case CHOICE.EXILE_FROM_HAND: return `Exile ${decision.min} card${decision.min > 1 ? 's' : ''} from your hand`;
          case CHOICE.EXILE_COST: return `Exile ${decision.min} cards from your graveyard`;
          case CHOICE.KEEP: return `Choose up to ${decision.max} creatures to keep: the rest are destroyed`;
          case CHOICE.HAND_CARDS: return 'Put any creature cards onto the battlefield';
          case CHOICE.COUNTERS: return 'Choose counters to move';
          case CHOICE.SACRIFICE_ANY: return 'Sacrifice any number of lands';
          default: return 'Choose any number of cards';
        }
      default: return '';
    }
  }
  if (decision?.type === DECISION.MULLIGAN || decision?.type === DECISION.PUT_ON_BOTTOM) {
    return decision.mulligans ? `Opponent mulligans to ${OPENING_HAND_SIZE - decision.mulligans}…` : 'Opponent is looking at their hand…';
  }
  if (decision) return decision.type === DECISION.DECLARE_BLOCKERS ? 'Opponent is blocking…' : 'Thinking…';
  // Only once the opponent has actually declared attackers (combat.attackers).
  const attackers = state.combat?.attackers ?? [];
  if (state.activePlayerId !== me && state.phase === PHASE.COMBAT && attackers.length) {
    return `${attackers.length} attacking`;
  }
  return '';
}

export const manaText = (mana) => formatMana(mana);

/** The prompt for a choice made while something resolves (DECISION.CHOOSE). */
function choosePrompt(decision) {
  const from = decision.sourceName ? `: ${decision.sourceName}` : '';
  switch (decision.kind) {
    case CHOICE.RING_BEARER: return 'The Ring tempts you: choose your Ring-bearer';
    case CHOICE.ARMY: return `Choose the Army to amass onto${from}`;
    case CHOICE.SACRIFICE: return `Choose a permanent to sacrifice${from}`;
    case CHOICE.DISCARD: return `Tap a card to discard${from}`;
    case CHOICE.BOTTOM_FROM_HAND: return `Tap a card to put on the bottom${from}`;
    case CHOICE.REVEALED_CARD: return 'Choose a card for them to discard';
    case CHOICE.KEYWORD: return `Choose the ability it gains${from}`;
    case CHOICE.MAY: return decision.text ?? `Do it?${from}`;
    case CHOICE.COUNTER: return `Choose a counter${from}`;
    case CHOICE.REMOVE_COUNTER: return `Choose a counter to remove${from}`;
    case CHOICE.CARD_TYPE: return `Choose a card type to gain protection from${from}`;
    case CHOICE.CAST_FREE: return `You may cast a spell without paying its mana cost${from}`;
    case CHOICE.CAST_FREE_VARIANT: return `Choose its targets${from}`;
    case CHOICE.OPTIONAL_COST: return `Pay the cost?${from}`;
    case CHOICE.PAY: return decision.counterId ? `Pay for ward, or your spell is countered${from}` : `Pay, or else${from}`;
    case CHOICE.CREATURE_TYPE: return `Note a creature type${from}`;
    case CHOICE.GRAVEYARD_CARD: return `Choose a card from your graveyard${from}`;
    case CHOICE.HAND_CARD: return `Choose a card from your hand${from}`;
    default: return `Choose${from}`;
  }
}

/**
 * The effects and target kinds of a stack object: a spell's from its card (its chosen
 * modes, their targets numbered one after another), an ability's from the object itself.
 */
function stackHolder(object, definitions) {
  if (object.kind !== 'spell') return { effects: object.effects ?? [] };
  const definition = definitions?.[object.card?.cardId];
  if (!definition) return { effects: [] };
  if (!definition.modes || object.mode === undefined) return { effects: definition.effects ?? [] };
  if (!Array.isArray(object.mode)) return { effects: definition.modes[object.mode]?.effects ?? [] };
  const effects = [];
  let offset = 0;
  for (const index of object.mode) {
    const mode = definition.modes[index];
    const aimed = (effect) => [AFFECTED.TARGET, AFFECTED.TARGET_CONTROLLER].includes(effectAffects(effect));
    effects.push(...(mode.effects ?? []).map((e) => (aimed(e) ? { ...e, targetIndex: (e.targetIndex ?? 0) + offset } : e)));
    offset += targetList(mode).length;
  }
  return { effects };
}

/** What an effect does to what it affects, in a word or two ("destroyed", "+2/+2"). */
function effectVerb(effect, amount) {
  switch (effect.type) {
    case EFFECT.DEAL_DAMAGE: return amount !== null ? `takes ${amount}` : 'takes damage';
    case EFFECT.DESTROY: return 'destroyed';
    case EFFECT.EXILE: case EFFECT.EXILE_UNTIL_SOURCE_LEAVES: case EFFECT.EXILE_FROM_GRAVEYARD: return 'exiled';
    case EFFECT.RETURN_TO_HAND: case EFFECT.RETURN_SPELL_TO_HAND: return 'to hand';
    case EFFECT.TAP: return 'tapped';
    case EFFECT.UNTAP: return 'untapped';
    case EFFECT.GAIN_CONTROL: return 'stolen';
    case EFFECT.FIGHT: return 'fights';
    case EFFECT.FLICKER: return 'flickered';
    case EFFECT.GOAD: return 'goaded';
    case EFFECT.SACRIFICE: return 'sacrifices';
    case EFFECT.COUNTER_SPELL: case EFFECT.COUNTER_UNLESS_PAID: return 'countered';
    case EFFECT.RETURN_FROM_GRAVEYARD: return 'returns';
    case EFFECT.PUT_INTO_LIBRARY: return 'to library';
    case EFFECT.ADD_COUNTERS:
      if (effect.counter === COUNTER.STUN) return 'stunned';
      return effect.counter === COUNTER.PLUS_ONE ? `+${effect.count ?? 1} counter` : `${effect.counter} counter`;
    case EFFECT.PUMP: {
      const { power = 0, toughness = 0, keywords = [] } = effect;
      if (power || toughness) {
        const sign = (n) => (n < 0 ? `${n}` : `+${n}`);
        return `${sign(power)}/${sign(toughness)}`;
      }
      if (keywords.length) return `gains ${keywords.join(', ')}`;
      return effect.grantTriggers?.length ? 'gains ability' : null;
    }
    default: return null;
  }
}

/**
 * Words for each target of a spell or ability with more than one, by target number,
 * so its arrows say what happens to each: Breaking of the Fellowship's "deals 3" and
 * "takes 3". A target nothing names a role for is numbered instead ("#2").
 */
export function targetRoles(state, object, definitions) {
  const targets = object?.targets ?? [];
  if (targets.length < 2) return null;
  const roles = targets.map(() => []);
  const add = (index, word) => {
    if (word && roles[index] && !roles[index].includes(word)) roles[index].push(word);
  };
  const powerOf = (index) => findCard(state, targets[index])?.power ?? null;
  const visit = (effect) => {
    if (effect.type === EFFECT.IF) {
      [...(effect.then ?? []), ...(effect.else ?? [])].forEach(visit);
      return;
    }
    if (effect.type === EFFECT.FIGHT) {
      if (effect.withSource) add(effect.targetIndex ?? 0, 'fights');
      else (effect.targetIndexes ?? [0, 1]).forEach((i) => add(i, 'fights'));
      return;
    }
    let amount = effect.amount ?? null;
    if (effect.per) amount = effect.per.of === 'powerOf' ? (powerOf(effect.per.index ?? 0) ?? null) : null;
    if (amount !== null && effect.per?.of === 'powerOf') amount *= effect.amount ?? 1;
    if (effect.type === EFFECT.DEAL_DAMAGE && effect.from?.target !== undefined) {
      add(effect.from.target, amount !== null ? `deals ${amount}` : 'deals damage');
    }
    if (effect.type === EFFECT.GAIN_CONTROL && effect.toTarget !== undefined) add(effect.toTarget, 'gains control');
    if (effectAffects(effect) !== AFFECTED.TARGET && effectAffects(effect) !== AFFECTED.YOU_AND_TARGET) return;
    const word = effectVerb(effect, amount);
    if (effect.targetIndex !== undefined) add(effect.targetIndex, word);
    else targets.forEach((_, i) => add(i, word));
  };
  stackHolder(object, definitions).effects.forEach(visit);
  return roles.map((words, i) => (words.length ? words.join(', ') : `#${i + 1}`));
}
