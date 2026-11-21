/**
 * Istari: a best-of-three match against the CPU with tiny decks.
 *
 * Each side opens a booster of The Lord of the Rings: Tales of Middle-earth (see openBooster) and
 * splits its 15 cards into three decks of five (a campaign's player may have a few more cards, and leave
 * the spare ones out). Round N pits deck N against deck N: both players start with all
 * five cards in hand, infinite mana (5 life for the player who goes first, 8 for the one who goes second), their
 * character's Ring of Power (a planeswalker power: an emblem, see src/cards/emblems.js), and can't lose by drawing from an empty
 * library. Some opponents have a setup of their own (opponentSetup in src/match/personas.js): cards their
 * booster always holds, a library to draw from, a board to start with. A round is won, lost or drawn (a stalled board, see Game's `stallDraw`). The first to win
 * two rounds takes the match; if three rounds pass without that, the one with more wins does, and
 * otherwise it's a tie.
 *
 * Everything here is pure: a match is a plain object, and each function returns a new one.
 */
import { CARDS, isCreature, manaValue } from '../cards/cards.js';
import { EMBLEMS } from '../cards/emblems.js';
import { GAME_LIMITS } from '../engine/Game.js';
import { seededRandom, shuffle } from '../engine/random.js';
import {
  OPPONENTS, HEROES, DEFAULT_HERO, opponentById, heroById, opponentSetup,
} from './personas.js';
import { weightsFor } from '../ai/evaluate.js';
import { AI_KIND } from '../ai/cpu.js';
import { buildDecks, deckPlan } from './deckBuilder.js';

export const MATCH_RULES = Object.freeze({
  cardsDealt: 15,
  decks: 3,
  deckSize: 5,
  roundsToWin: 2,
  startingLife: 5,
  /** The player who goes second starts with more life, to make up for it. */
  secondPlayerLife: 8,
  /** A backstop for the stall rule: the round is a draw after this many turns. */
  turnLimit: 40,
});

/**
 * A booster, as LTR's Draft Booster (LTR came before Play Boosters): 10 different commons, 3 different
 * uncommons and a rare or mythic, and in place of the basic land, any LTR card at all.
 */
export const BOOSTER = Object.freeze({ commons: 10, uncommons: 3, rares: 1, wildcards: 1 });

export const PLAYER_ID = 'player';
export const CPU_ID = 'cpu';

export const ROUND_RESULT = Object.freeze({ WON: 'won', LOST: 'lost', DRAWN: 'drawn' });
export const MATCH_OUTCOME = Object.freeze({ WON: 'won', LOST: 'lost', TIE: 'tie' });

/**
 * Every card that can be opened: the LTR cards in the game (a few that need rules it lacks are left out),
 * but not the basic lands (a booster's land slot is a wildcard instead).
 */
export const CARD_POOL = Object.freeze(Object.keys(CARDS)
  .filter((id) => CARDS[id].set === 'ltr' && !(CARDS[id].supertypes ?? []).includes('Basic')).sort());

/** The pool by rarity: `common`, `uncommon`, `rare`, `mythic`. */
export const POOL_BY_RARITY = Object.freeze(Object.fromEntries(['common', 'uncommon', 'rare', 'mythic']
  .map((rarity) => [rarity, Object.freeze(CARD_POOL.filter((id) => CARDS[id].rarity === rarity))])));

const RARITY = { common: 1, uncommon: 2, rare: 3, mythic: 4 };

/** A rough strength for a card, to share the CPU's cards out evenly between its decks. */
export function cardStrength(cardId) {
  const card = CARDS[cardId];
  const stats = isCreature(card) ? ((card.power ?? 0) + (card.toughness ?? 0)) / 2 : 0;
  return 2 * (RARITY[card.rarity] ?? 1) + manaValue(card.manaCost ?? {}) + stats;
}

/**
 * A booster's 15 cards, in the order they'd be in the pack: the commons, the uncommons, the rare or
 * mythic (each rare twice as likely as each mythic, as on a print sheet, so a mythic is about one
 * pack in seven), and last the wildcard, every LTR card equally likely (it may repeat one already in
 * the pack). `extraCommons`: more different commons on top of the 10 (a campaign's reward, see
 * src/match/campaign.js), so the booster holds more than 15 cards.
 */
export function openBooster(random, { extraCommons = 0 } = {}) {
  const { common, uncommon, rare, mythic } = POOL_BY_RARITY;
  const rareSlot = [...rare, ...rare, ...mythic];
  return [
    ...shuffle([...common], random).slice(0, BOOSTER.commons + extraCommons),
    ...shuffle([...uncommon], random).slice(0, BOOSTER.uncommons),
    rareSlot[Math.floor(random() * rareSlot.length)],
    CARD_POOL[Math.floor(random() * CARD_POOL.length)],
  ];
}

/**
 * A booster of only rares and mythics (Tom Bombadil's ring): `size` different cards, each rare twice as likely as
 * each mythic, as in a booster's rare slot.
 */
export function openRareBooster(random, { size = MATCH_RULES.cardsDealt } = {}) {
  const { rare, mythic } = POOL_BY_RARITY;
  let slots = [...rare, ...rare, ...mythic];
  const booster = [];
  while (booster.length < size && slots.length) {
    const cardId = slots[Math.floor(random() * slots.length)];
    booster.push(cardId);
    slots = slots.filter((id) => id !== cardId);
  }
  return booster;
}

/**
 * The match rules a side's Rings of Power make (an emblem's `match`, see src/cards/emblems.js): `rareBooster`, an
 * all-rare booster; `lockedFirstDeck`, a first deck of five of its cards picked at random.
 */
export function matchRules(emblemIds) {
  const rules = (emblemIds ?? []).map((id) => EMBLEMS[id]?.match ?? {});
  return { rareBooster: rules.some((r) => r.rareBooster), lockedFirstDeck: rules.some((r) => r.lockedFirstDeck) };
}

/** Five places in `cards`, picked at random: a locked first deck. */
const pickLocked = (cards, random) => shuffle([...cards.keys()], random).slice(0, MATCH_RULES.deckSize).sort((a, b) => a - b);

/**
 * A booster with `cards` in it (an opponent's `pack`, see opponentSetup): each one not already there takes the
 * place of the last card of its rarity (a rare or mythic the rare's, a common or uncommon the last of those), or of
 * the wildcard when there's none, so the booster keeps its size. Takes no random draws.
 */
export function withCards(booster, cards) {
  const result = [...booster];
  const fixed = new Set();
  const rank = (id) => (['rare', 'mythic'].includes(CARDS[id].rarity) ? 'rare' : CARDS[id].rarity);
  for (const cardId of cards) {
    if (!CARDS[cardId]) throw new Error(`Unknown card: ${cardId}`);
    const present = result.findIndex((id, i) => id === cardId && !fixed.has(i));
    if (present >= 0) { fixed.add(present); continue; }
    // The wildcard (the last card) only when no card of the same rarity is left to replace.
    let slot = -1;
    for (let i = result.length - 2; i >= 0; i -= 1) if (!fixed.has(i) && rank(result[i]) === rank(cardId)) { slot = i; break; }
    if (slot < 0) slot = [...result.keys()].reverse().find((i) => !fixed.has(i)) ?? -1;
    if (slot < 0) throw new Error('The booster has no room for its cards.');
    result[slot] = cardId;
    fixed.add(slot);
  }
  return result;
}

/**
 * `decks` with the cards in `placed` (an opponent's setup `decks`: card ids each deck must hold, in round order)
 * moved into their decks. A card a deck lacks is swapped in from a deck that has a copy it doesn't need, for that
 * deck's weakest card (`cardStrength`) it doesn't need either. Takes no random draws.
 */
export function placeInDecks(decks, placed = []) {
  const result = decks.map((deck) => [...deck]);
  const needed = result.map((deck) => deck.map(() => false));
  const missing = [];
  placed.forEach((cards, i) => {
    for (const cardId of cards) {
      const at = result[i].findIndex((id, n) => id === cardId && !needed[i][n]);
      if (at >= 0) needed[i][at] = true;
      else missing.push([i, cardId]);
    }
  });
  for (const [i, cardId] of missing) {
    const j = result.findIndex((deck, k) => k !== i && deck.some((id, n) => id === cardId && !needed[k][n]));
    if (j < 0) throw new Error(`No ${cardId} to place in deck ${i + 1}.`);
    const from = result[j].findIndex((id, n) => id === cardId && !needed[j][n]);
    const spare = result[i].map((id, n) => n).filter((n) => !needed[i][n]);
    if (!spare.length) throw new Error(`Deck ${i + 1} has no room for ${cardId}.`);
    const out = spare.reduce((a, b) => (cardStrength(result[i][b]) < cardStrength(result[i][a]) ? b : a));
    [result[i][out], result[j][from]] = [result[j][from], result[i][out]];
    needed[i][out] = true;
  }
  return result;
}

/**
 * How the CPU's decks used to be made (now buildDecks in deckBuilder.js; kept for the arena to compare with):
 * its cards from strongest to weakest, dealt out snake-wise (1→3, 3→1, 1→3, …) so
 * each deck gets a fair share, and then the decks in a random order (so its best isn't always first).
 */
export function arrangeCpuDecks(cards, random, { decks = MATCH_RULES.decks } = {}) {
  const sorted = [...cards].sort((a, b) => cardStrength(b) - cardStrength(a) || (a < b ? -1 : 1));
  const result = Array.from({ length: decks }, () => []);
  sorted.forEach((cardId, i) => {
    const lap = Math.floor(i / decks);
    const slot = i % decks;
    result[lap % 2 === 0 ? slot : decks - 1 - slot].push(cardId);
  });
  return shuffle(result, random);
}

/**
 * Auto-fill for the deck builder: which deck each loose card goes in. `cards`: the booster; `placed`: a Map from a
 * card's place in `cards` to its deck (0-based), for the ones already placed. The loose cards go in from strongest
 * to weakest (cardStrength), each into the deck with room whose cards so far are weakest in all (the lowest-numbered
 * on a tie), so the three decks come out about as strong as each other. Cards left over when the decks are full stay out.
 * Returns a new Map with every placement.
 */
export function spreadDecks(cards, placed = new Map(), { decks = MATCH_RULES.decks, deckSize = MATCH_RULES.deckSize } = {}) {
  const result = new Map(placed);
  const size = Array(decks).fill(0);
  const total = Array(decks).fill(0);
  for (const [n, deck] of result) { size[deck] += 1; total[deck] += cardStrength(cards[n]); }
  const loose = cards.map((_, n) => n).filter((n) => !result.has(n))
    .sort((a, b) => cardStrength(cards[b]) - cardStrength(cards[a]) || a - b);
  for (const n of loose) {
    let target = -1;
    for (let deck = 0; deck < decks; deck += 1) {
      if (size[deck] < deckSize && (target < 0 || total[deck] < total[target])) target = deck;
    }
    if (target < 0) break;
    result.set(n, target);
    size[target] += 1;
    total[target] += cardStrength(cards[n]);
  }
  return result;
}

/**
 * A new match: a booster opened for each side, the CPU's decks built (buildDecks in deckBuilder.js, to its opponent's tastes,
 * without a look at the player's cards) and put in a random order, its opponent picked from
 * OPPONENTS (src/match/personas.js), and who goes first in round 1 decided (after that, the loser of the last round goes first).
 * `heroId`: the player's character, from HEROES. `opponentId`: the opponent, when not left to chance.
 * `rings`: Rings of Power (emblem ids) the player has besides their hero's, as a campaign's (see
 * src/match/campaign.js); each costs them a life at the start of every round. `extraCommons`: more
 * commons in the player's booster (a campaign's reward), so they have more cards than their decks need.
 * `campaign`: whether the match is a campaign's.
 */
export function createMatch({
  seed = Math.floor(Math.random() * 2 ** 32), heroId = DEFAULT_HERO, opponentId: chosen = null, rings = [], extraCommons = 0,
  campaign = false,
} = {}) {
  if (!HEROES[heroId]) throw new Error(`Unknown hero: ${heroId}`);
  if (chosen && !OPPONENTS[chosen]) throw new Error(`Unknown opponent: ${chosen}`);
  const random = seededRandom(seed);
  let cards = openBooster(random, { extraCommons });
  let cpuCards = openBooster(random);
  // The order of the CPU's decks, then its opponent (the random draws come in the order they always did).
  const order = shuffle([...Array(MATCH_RULES.decks).keys()], random);
  // Never yourself: not the opponent who bears your hero's ring.
  const candidates = Object.keys(OPPONENTS).filter((id) => OPPONENTS[id].emblem !== HEROES[heroId].emblem);
  const drawn = candidates[Math.floor(random() * candidates.length)];
  const opponentId = chosen ?? drawn;
  // Rings that change the match (Tom Bombadil's): drawn from a random of their own, so other matches stay as they were.
  const extra = seededRandom((seed ^ 0x7b0b5ad1) >>> 0);
  const mine = matchRules([heroId, ...rings]);
  const theirs = matchRules([OPPONENTS[opponentId].emblem]);
  if (mine.rareBooster) cards = openRareBooster(extra, { size: cards.length });
  if (theirs.rareBooster) cpuCards = openRareBooster(extra, { size: cpuCards.length });
  const lockedDeck = mine.lockedFirstDeck ? pickLocked(cards, extra) : null;
  cpuCards = withCards(cpuCards, opponentSetup(opponentId).pack);
  const cpuLocked = theirs.lockedFirstDeck ? pickLocked(cpuCards, extra).map((n) => cpuCards[n]) : null;
  const built = buildDecks(cpuCards, null, { persona: opponentId, locked: cpuLocked });
  // A locked deck stays first; the others go in a random order.
  const cpuOrder = cpuLocked ? [0, ...order.filter((i) => i !== 0)] : order;
  const cpuDecks = placeInDecks(cpuOrder.map((i) => built[i]), opponentSetup(opponentId).decks);
  return {
    seed,
    heroId,
    opponentId,
    rings: [...rings],
    ...(campaign ? { campaign: true } : {}),
    cards,
    // Places in `cards` that must make up the first deck (Tom Bombadil's ring), or none.
    ...(lockedDeck ? { lockedDeck } : {}),
    decks: null,
    cpuDecks,
    playerStarts: random() < 0.5,
    rounds: [],
  };
}

/**
 * Whether `decks` is a legal split of the match's cards: three decks of five, using each card (each copy)
 * at most once. With 15 cards that's every card; with more (a campaign's extra commons), some are left out.
 */
export function validDecks(match, decks) {
  if (!Array.isArray(decks) || decks.length !== MATCH_RULES.decks) return false;
  if (decks.some((deck) => !Array.isArray(deck) || deck.length !== MATCH_RULES.deckSize)) return false;
  const left = new Map();
  for (const id of match.cards) left.set(id, (left.get(id) ?? 0) + 1);
  for (const id of decks.flat()) {
    if (!left.get(id)) return false;
    left.set(id, left.get(id) - 1);
  }
  // A locked first deck (Tom Bombadil's ring) is just those cards.
  if (match.lockedDeck) {
    const sorted = (ids) => [...ids].sort().join();
    if (sorted(decks[0]) !== sorted(match.lockedDeck.map((n) => match.cards[n]))) return false;
  }
  return true;
}

/** The match with the player's decks set. */
export function setDecks(match, decks) {
  if (match.decks) throw new Error('The decks are already set.');
  if (!validDecks(match, decks)) {
    throw new Error(match.lockedDeck ? 'Make three decks of five cards from your cards, the first one the locked cards.' : 'Make three decks of five cards from your cards.');
  }
  return { ...match, decks: decks.map((deck) => [...deck]) };
}

/** The player's starting life in each round, going first and going second: one less for each extra ring. */
export function playerLife(match) {
  const penalty = match.rings?.length ?? 0;
  return {
    first: Math.max(1, MATCH_RULES.startingLife - penalty),
    second: Math.max(1, MATCH_RULES.secondPlayerLife - penalty),
  };
}

/** Wins, losses and draws so far. */
export function score(match) {
  const count = (result) => match.rounds.filter((r) => r.result === result).length;
  return { won: count(ROUND_RESULT.WON), lost: count(ROUND_RESULT.LOST), drawn: count(ROUND_RESULT.DRAWN) };
}

/** The match's result once it's over (`MATCH_OUTCOME`), otherwise null. */
export function outcome(match) {
  const { won, lost } = score(match);
  if (won >= MATCH_RULES.roundsToWin) return MATCH_OUTCOME.WON;
  if (lost >= MATCH_RULES.roundsToWin) return MATCH_OUTCOME.LOST;
  if (match.rounds.length < MATCH_RULES.decks) return null;
  return won > lost ? MATCH_OUTCOME.WON : lost > won ? MATCH_OUTCOME.LOST : MATCH_OUTCOME.TIE;
}

/** The index of the round to play next (0–2), or null once the match is over. */
export function nextRound(match) {
  return match.decks && outcome(match) === null ? match.rounds.length : null;
}

/**
 * Whether the player goes first in round `round` (0-based): round 1 by coin flip, then the loser of the
 * round before. After a drawn round, whoever went second in it goes first. Needs the rounds before
 * `round` to have been played.
 */
export function playerStartsRound(match, round) {
  let playerFirst = match.playerStarts;
  for (let i = 0; i < round; i += 1) {
    const result = match.rounds[i]?.result;
    if (result === undefined) throw new Error(`Round ${i + 1} hasn't been played.`);
    playerFirst = result === ROUND_RESULT.LOST ? true : result === ROUND_RESULT.WON ? false : !playerFirst;
  }
  return playerFirst;
}

/** The match with the next round's result recorded: `ROUND_RESULT`. `stats`: what happened in it (src/match/roundStats.js), kept with it. */
export function recordRound(match, result, stats = null) {
  const round = nextRound(match);
  if (round === null) throw new Error('No round to play.');
  if (!Object.values(ROUND_RESULT).includes(result)) throw new Error(`Unknown result: ${result}`);
  return { ...match, rounds: [...match.rounds, stats ? { result, stats } : { result }] };
}

/**
 * The round that decided a finished match (0-based): the one in which the winner took their second round, or the
 * last one played when nobody did. Null while the match is going on.
 */
export function decidingRound(match) {
  if (!outcome(match)) return null;
  const tally = { [ROUND_RESULT.WON]: 0, [ROUND_RESULT.LOST]: 0 };
  for (let i = 0; i < match.rounds.length; i += 1) {
    const { result } = match.rounds[i];
    if (result in tally && (tally[result] += 1) >= MATCH_RULES.roundsToWin) return i;
  }
  return match.rounds.length - 1;
}

/**
 * The next round's setup: `game` (Game options), `cpu` (for createCpuController in src/ai/cpu.js)
 * and `encounter`.
 */
export function roundSetup(match, { playerName = 'You' } = {}) {
  const round = nextRound(match);
  if (round === null) throw new Error('No round to play.');
  const opponent = opponentById(match.opponentId);
  const hero = heroById(match.heroId ?? DEFAULT_HERO);
  const players = [{ id: PLAYER_ID, name: playerName }, { id: CPU_ID, name: opponent.name }];
  const playerFirst = playerStartsRound(match, round);
  const { startingLife: first, secondPlayerLife: second } = MATCH_RULES;
  const mine = playerLife(match);
  const setup = opponentSetup(match.opponentId);
  return {
    game: {
      players,
      startingPlayerId: playerFirst ? PLAYER_ID : CPU_ID,
      seed: (match.seed + round * 7919) >>> 0,
      decks: { [PLAYER_ID]: [...match.decks[round]], [CPU_ID]: [...match.cpuDecks[round]] },
      emblems: { [PLAYER_ID]: [hero.emblem, ...(match.rings ?? [])], [CPU_ID]: [opponent.emblem] },
      // The opponent's own setup (opponentSetup in personas.js): a library to draw from, a board to start with.
      shufflesIn: { [CPU_ID]: [...setup.library] },
      startsWith: { [CPU_ID]: [...setup.battlefield] },
      startsInGraveyard: { [CPU_ID]: [...setup.graveyard] },
      startingLife: { [PLAYER_ID]: playerFirst ? mine.first : mine.second, [CPU_ID]: playerFirst ? second : first },
      limits: { ...GAME_LIMITS },
      mulligans: false,
      openingHandSize: MATCH_RULES.deckSize,
      deckingLoss: false,
      infiniteMana: true,
      stallDraw: true,
      turnLimit: MATCH_RULES.turnLimit,
    },
    cpu: {
      playerId: CPU_ID,
      opponentId: match.opponentId,
      name: opponent.name,
      ai: opponent.ai.kind === AI_KIND.STRATEGIST ? { ...opponent.ai, persona: match.opponentId, plan: deckPlan(match.cpuDecks[round]) } : {
        ...opponent.ai,
        budgetMs: Math.max(opponent.ai.budgetMs ?? 0, 1000),
        // Libraries are empty here, or hold an opponent's own cards; running out is no danger.
        weights: { ...weightsFor(opponent.ai.weights), library: 0 },
      },
      banter: opponent.banter ?? null,
    },
    encounter: { round, opponentId: match.opponentId, opponentName: opponent.name, heroId: match.heroId ?? DEFAULT_HERO },
  };
}
