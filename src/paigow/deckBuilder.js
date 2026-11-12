/**
 * How the CPU splits its cards into three decks of five.
 *
 * It never sees the player's cards. Each possible deck (3,003 of them from 15 cards) gets a score:
 * its cards' ratings for Pai Gow (cardRatings.js, fitted from self-play) plus a bonus for how many
 * creatures it holds, and from that score a chance of beating a deck dealt at random (FIELD_SCORES).
 * Then every way of splitting the cards into three decks (126,126) is tried, and the one most likely
 * to win two rounds of three is kept. That settles by itself whether three even decks or two strong
 * ones and a weak one is better for these cards.
 *
 * A personality's tastes (src/ai/strategist/profiles.js) choose among the splits that are as good
 * as the best, give or take a hair: it likes its favourite kinds of card together in its strong decks.
 * The decks come back in a random order, so the strongest isn't always first.
 */
import {
  CARDS, isCreature, isInstant, hasKeyword, KEYWORD, EFFECT, flattenEffects, isHarmfulEffect,
} from '../cards/cards.js';
import { shuffle } from '../engine/random.js';
import { CARD_RATINGS, CREATURE_COUNT_BONUS, FIELD_SCORES } from './cardRatings.js';
import { profileFor } from '../ai/strategist/profiles.js';

const DECKS = 3;
const SIZE = 5;
/** Splits within this much (in the chance of winning the match) of the best are as good as the best. */
const NEAR = 0.004;

const effectsOf = (card) => flattenEffects([...(card.effects ?? []), ...(card.modes ?? []).flatMap((m) => m.effects ?? [])]);

/** What kinds of card this is, for a personality's tastes: `evasion`, `power`, `toughness`, `removal`, `tricks`. */
export function cardTags(cardId) {
  const card = CARDS[cardId];
  const tags = [];
  if (isCreature(card)) {
    if ([KEYWORD.FLYING, KEYWORD.MENACE, KEYWORD.HASTE, KEYWORD.TRAMPLE].some((k) => hasKeyword(card, k))) tags.push('evasion');
    if ((card.power ?? 0) >= 3) tags.push('power');
    if ((card.toughness ?? 0) >= 4) tags.push('toughness');
    return tags;
  }
  const effects = effectsOf(card);
  if (effects.some(isHarmfulEffect)) tags.push('removal');
  else if (isInstant(card) && effects.some((e) => e.type === EFFECT.PUMP)) tags.push('tricks');
  return tags;
}

/** A deck's score: the log-odds it adds to winning a round. */
export function deckScore(deck) {
  const creatures = deck.filter((id) => isCreature(CARDS[id])).length;
  return deck.reduce((sum, id) => sum + (CARD_RATINGS[id] ?? 0), 0) + (CREATURE_COUNT_BONUS[Math.min(creatures, CREATURE_COUNT_BONUS.length - 1)] ?? 0);
}

/** The chance a deck with this score beats a deck dealt at random. */
export function winChance(score) {
  let total = 0;
  for (const other of FIELD_SCORES) total += 1 / (1 + Math.exp(other - score));
  return total / FIELD_SCORES.length;
}

/** The chance of winning at least two rounds of three, each deck against a random one. */
export const matchChance = (p1, p2, p3) => p1 * p2 + p1 * p3 + p2 * p3 - 2 * p1 * p2 * p3;

/** What a deck is built to do: `race` (cheap damage), `grind` (answers and big bodies) or `tempo`. */
export function deckPlan(deck) {
  let race = 0;
  let grind = 0;
  for (const id of deck) {
    const tags = cardTags(id);
    const card = CARDS[id];
    if (tags.includes('evasion') || (isCreature(card) && (card.power ?? 0) > (card.toughness ?? 0))) race += 1;
    if (tags.includes('removal') || tags.includes('toughness')) grind += 1;
  }
  return race >= grind + 2 ? 'race' : grind >= race + 2 ? 'grind' : 'tempo';
}

/**
 * Three decks of five from `cards` (15, or more: the lowest rated are left out), in a random order
 * (with no `random`, as they come).
 * `persona`: an opponent's id or a temperament, for its tastes.
 */
export function buildDecks(cards, random, { persona = null } = {}) {
  const pool = [...cards].sort((a, b) => (CARD_RATINGS[b] ?? 0) - (CARD_RATINGS[a] ?? 0) || (a < b ? -1 : 1)).slice(0, DECKS * SIZE);
  const n = pool.length;
  const { tastes = {} } = profileFor(persona);
  const liking = pool.map((id) => cardTags(id).reduce((sum, tag) => sum + ((tastes[tag] ?? 1) - 1), 0));

  // Every deck of five, as a bitmask of the pool.
  const chance = new Map();
  const liked = new Map();
  const cardsOf = (mask) => pool.filter((_, i) => mask & (1 << i));
  const subsets = (from, left, mask, out) => {
    if (left === 0) {
      out.push(mask);
      return out;
    }
    for (let i = from; i <= n - left; i++) subsets(i + 1, left - 1, mask | (1 << i), out);
    return out;
  };
  for (const mask of subsets(0, SIZE, 0, [])) {
    chance.set(mask, winChance(deckScore(cardsOf(mask))));
    let like = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) like += liking[i];
    liked.set(mask, like);
  }

  // Every split: the first deck holds the first card, the second the first card left.
  const all = (1 << n) - 1;
  let best = null;
  const near = [];
  const lowest = (mask) => 31 - Math.clz32(mask & -mask);
  const pick = (mask, available, left, from, out) => {
    if (left === 0) {
      out.push(mask);
      return out;
    }
    for (let i = from; i < n; i++) if (available & (1 << i)) pick(mask | (1 << i), available, left - 1, i + 1, out);
    return out;
  };
  for (const first of pick(1, all & ~1, SIZE - 1, 1, [])) {
    const rest = all & ~first;
    const low = lowest(rest);
    for (const second of pick(1 << low, rest & ~(1 << low), SIZE - 1, low + 1, [])) {
      const third = rest & ~second;
      const [p1, p2, p3] = [chance.get(first), chance.get(second), chance.get(third)];
      const value = matchChance(p1, p2, p3);
      if (!best || value > best.value) best = { value };
      if (value >= best.value - NEAR) near.push({ value, masks: [first, second, third], taste: p1 * liked.get(first) + p2 * liked.get(second) + p3 * liked.get(third) });
    }
  }
  const chosen = near.filter((s) => s.value >= best.value - NEAR)
    .reduce((a, b) => (b.taste > a.taste + 1e-9 || (Math.abs(b.taste - a.taste) <= 1e-9 && b.value > a.value) ? b : a));
  const decks = chosen.masks.map(cardsOf);
  return random ? shuffle(decks, random) : decks;
}
