/**
 * The Red Book: what a player has done across every campaign, kept on the device. Pure functions
 * over a plain object (the app loads and saves it: app/book.js); each returns a new book.
 *
 * - `cards`: cards opened in your boosters, by id, with how many times; `seen`: cards met in opponents' decks.
 * - `people`: by opponent id, `{ won, lost, tied }` matches.
 * - `rings`: Rings of Power borne (emblem ids). `heroes`: by hero id, `{ begun, won, furthest }` campaigns
 *   (`furthest`: the most opponents beaten in one).
 * - `totals`: matches (and how they went), rounds, damage dealt, creatures felled; `blow`: the hardest blow ever
 *   (`{ name, amount }`); `mostDamage`: the most damage dealt in a round.
 * - `fresh`: what the match going on has added (`seed`, `cards` newly found, `firstWin`, `unlocks`), for its recap.
 * - `counted`: keys of what has been recorded, so nothing counts twice (a reload shows the same screen again).
 */
import { MATCH_OUTCOME } from './match.js';
import { matchStats } from './roundStats.js';
import { OPPONENTS } from './personas.js';

export const BOOK_VERSION = 1;

/** How many keys of things already counted are kept: far more than can be in play at once. */
const COUNTED_KEPT = 200;

export const emptyBook = () => ({
  version: BOOK_VERSION,
  cards: {},
  seen: {},
  people: {},
  rings: [],
  heroes: {},
  totals: { matches: 0, won: 0, lost: 0, tied: 0, rounds: 0, damage: 0, felled: 0 },
  blow: null,
  mostDamage: 0,
  fresh: null,
  counted: [],
});

/** A book read from storage, with anything missing filled in (null for one that can't be used). */
export function readBook(value) {
  if (!value || typeof value !== 'object' || value.version !== BOOK_VERSION) return null;
  const blank = emptyBook();
  return {
    ...blank, ...value, totals: { ...blank.totals, ...value.totals },
    counted: Array.isArray(value.counted) ? value.counted : [], rings: Array.isArray(value.rings) ? value.rings : [],
  };
}

/** `book` after `change(book)`, unless `key` was counted already. */
function once(book, key, change) {
  if (book.counted.includes(key)) return book;
  const next = change(book);
  return { ...next, counted: [...next.counted, key].slice(-COUNTED_KEPT) };
}

const bump = (counts, ids) => {
  const next = { ...counts };
  for (const id of ids) next[id] = (next[id] ?? 0) + 1;
  return next;
};

/** What the match `seed` has added so far (empty for a new match). */
const freshFor = (book, seed) => (book.fresh?.seed === seed ? book.fresh : { seed, cards: [], firstWin: false, unlocks: [] });

/** Whether a card is in the book at all, opened or met. */
export const knows = (book, cardId) => Boolean(book.cards[cardId] || book.seen[cardId]);

/** A match's booster opened: its cards are found. */
export function recordBooster(book, match) {
  return once(book, `booster:${match.seed}`, (b) => {
    const found = [...new Set(match.cards)].filter((id) => !knows(b, id));
    const fresh = freshFor(b, match.seed);
    return { ...b, cards: bump(b.cards, match.cards), fresh: { ...fresh, cards: [...fresh.cards, ...found] } };
  });
}

/** Round `round` (0-based) of a match played: the opponent's deck for it is seen, and its stats (if kept) counted. */
export function recordRoundPlayed(book, match, round) {
  if (!match.rounds?.[round]) return book;
  return once(book, `round:${match.seed}:${round}`, (b) => {
    const theirs = match.cpuDecks?.[round] ?? [];
    const found = [...new Set(theirs)].filter((id) => !knows(b, id));
    const fresh = freshFor(b, match.seed);
    const stats = match.rounds[round].stats ?? null;
    const blow = stats?.blow && stats.blow.amount > (b.blow?.amount ?? 0) ? { ...stats.blow } : b.blow;
    return {
      ...b,
      seen: bump(b.seen, theirs),
      totals: { ...b.totals, rounds: b.totals.rounds + 1, damage: b.totals.damage + (stats?.dealt ?? 0), felled: b.totals.felled + (stats?.felled ?? 0) },
      blow,
      mostDamage: Math.max(b.mostDamage, stats?.dealt ?? 0),
      fresh: { ...fresh, cards: [...fresh.cards, ...found] },
    };
  });
}

/**
 * A match over, with its `outcome` (MATCH_OUTCOME). `unlocksOf(book)`: the names of everything unlocked by a book
 * (src/match/unlocks.js), so what this match unlocked can be told in its recap.
 */
export function recordMatchEnd(book, match, outcome, { unlocksOf = () => [] } = {}) {
  if (!Object.values(MATCH_OUTCOME).includes(outcome)) return book;
  return once(book, `match:${match.seed}`, (b) => {
    const before = b.people[match.opponentId] ?? { won: 0, lost: 0, tied: 0 };
    const key = { [MATCH_OUTCOME.WON]: 'won', [MATCH_OUTCOME.LOST]: 'lost', [MATCH_OUTCOME.TIE]: 'tied' }[outcome];
    const fresh = freshFor(b, match.seed);
    const next = {
      ...b,
      people: { ...b.people, [match.opponentId]: { ...before, [key]: before[key] + 1 } },
      totals: { ...b.totals, matches: b.totals.matches + 1, [key]: b.totals[key] + 1 },
    };
    const had = new Set(unlocksOf(b));
    return { ...next, fresh: { ...fresh, firstWin: outcome === MATCH_OUTCOME.WON && before.won === 0, unlocks: unlocksOf(next).filter((name) => !had.has(name)) } };
  });
}

/** A Ring of Power taken. */
export function recordRing(book, emblemId) {
  return book.rings.includes(emblemId) ? book : { ...book, rings: [...book.rings, emblemId] };
}

const heroOf = (book, heroId) => book.heroes[heroId] ?? { begun: 0, won: 0, furthest: 0 };

/** A campaign begun. */
export function recordCampaignBegun(book, campaign) {
  return once(book, `begun:${campaign.seed}`, (b) => {
    const hero = heroOf(b, campaign.heroId);
    return { ...b, heroes: { ...b.heroes, [campaign.heroId]: { ...hero, begun: hero.begun + 1 } } };
  });
}

/** How far a campaign has got (its `stage`: opponents beaten), and, once it's `won`, that it was. `unlocksOf`: as for recordMatchEnd. */
export function recordCampaignProgress(book, campaign, { won = false, unlocksOf = () => [] } = {}) {
  const begun = recordCampaignBegun(book, campaign);
  const hero = heroOf(begun, campaign.heroId);
  const further = { ...begun, heroes: { ...begun.heroes, [campaign.heroId]: { ...hero, furthest: Math.max(hero.furthest, campaign.stage) } } };
  if (!won) return further;
  return once(further, `won:${campaign.seed}`, (b) => {
    const h = heroOf(b, campaign.heroId);
    const next = { ...b, heroes: { ...b.heroes, [campaign.heroId]: { ...h, won: h.won + 1 } } };
    const had = new Set(unlocksOf(b));
    const fresh = b.fresh ?? { seed: null, cards: [], firstWin: false, unlocks: [] };
    return { ...next, fresh: { ...fresh, unlocks: [...fresh.unlocks, ...unlocksOf(next).filter((name) => !had.has(name) && !fresh.unlocks.includes(name))] } };
  });
}

/**
 * A book that has caught up with a campaign begun before there was one: its matches so far (each opponent's record),
 * its rings, and how far it has got. Counted once for a campaign.
 */
export function catchUp(book, campaign) {
  if (!campaign) return book;
  return once(book, `caughtUp:${campaign.seed}`, (b) => {
    let next = b;
    const people = { ...next.people };
    const totals = { ...next.totals };
    for (const { opponentId, outcome } of campaign.history ?? []) {
      if (!OPPONENTS[opponentId]) continue;
      const key = { [MATCH_OUTCOME.WON]: 'won', [MATCH_OUTCOME.LOST]: 'lost', [MATCH_OUTCOME.TIE]: 'tied' }[outcome];
      if (!key) continue;
      const record = people[opponentId] ?? { won: 0, lost: 0, tied: 0 };
      people[opponentId] = { ...record, [key]: record[key] + 1 };
      totals.matches += 1;
      totals[key] += 1;
    }
    next = { ...next, people, totals };
    for (const ring of campaign.rings ?? []) next = recordRing(next, ring);
    return recordCampaignProgress(next, campaign);
  });
}

/** For a finished match's recap: the match's own totals (matchStats), and what it added to the book. */
export function recap(book, match) {
  const fresh = book.fresh?.seed === match.seed ? book.fresh : { cards: [], firstWin: false, unlocks: [] };
  return { stats: matchStats(match), newCards: fresh.cards.length, firstWin: fresh.firstWin, unlocks: [...fresh.unlocks] };
}
