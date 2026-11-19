/**
 * What's earned on the road, worked out from the Red Book (src/match/book.js). Only Frodo is open from the start;
 * every campaign won opens one more hero (`book.unlocked`): one of the opponents beaten on that road, at random, or,
 * once all of those are open, any hero still closed. A hero's second portrait (its `altPortrait` in
 * src/match/personas.js) opens once a campaign is won with them.
 */
import { HEROES } from './personas.js';
import { seededRandom } from '../engine/random.js';

/** The one hero open from the start. */
export const STARTING_HERO = 'frodo';

/**
 * Whether a hero can be chosen: Frodo, one opened by a campaign won, or one already set out with (a campaign begun
 * before heroes were opened this way).
 */
export function heroOpen(book, heroId) {
  if (heroId === STARTING_HERO) return true;
  if (book?.unlocked?.includes(heroId)) return true;
  return (book?.heroes?.[heroId]?.begun ?? 0) > 0;
}

/** What opening a hero takes, in words, or null for one open from the start. */
export const heroNeeds = (heroId) => (heroId === STARTING_HERO ? null
  : 'Win a campaign to open a new hero: one of those you beat on the road.');

/**
 * The hero a won `campaign` opens: one still closed, at random (the same for the same campaign), from the
 * opponents beaten on its road, or else from every hero; null when every hero is open.
 */
export function heroToUnlock(book, campaign) {
  const closed = (id) => HEROES[id] && !heroOpen(book, id);
  const beaten = [...new Set((campaign.history ?? []).filter((m) => m.outcome === 'won').map((m) => m.opponentId))]
    .filter(closed).sort();
  const pool = beaten.length ? beaten : Object.keys(HEROES).filter(closed);
  if (!pool.length) return null;
  const random = seededRandom(((campaign.seed ?? 0) ^ 0x5eed1e55) >>> 0);
  return pool[Math.floor(random() * pool.length)];
}

/** Whether a hero's second portrait can be chosen: they have one, and a campaign has been won with them. */
export const portraitOpen = (book, heroId) => Boolean(HEROES[heroId]?.altPortrait) && (book?.heroes?.[heroId]?.won ?? 0) > 0;

/** Everything a book has unlocked, as names to tell the player ("Pippin", "A new portrait for Frodo"). */
export function unlocksOf(book) {
  return [
    ...Object.keys(HEROES).filter((id) => id !== STARTING_HERO && heroOpen(book, id)).map((id) => HEROES[id].name),
    ...Object.keys(HEROES).filter((id) => portraitOpen(book, id)).map((id) => `A new portrait for ${HEROES[id].name}`),
  ];
}
