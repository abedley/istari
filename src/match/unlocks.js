/**
 * What's earned on the road, worked out from the Red Book (src/match/book.js): three heroes are open from the
 * start and three are met along the way (each opens once you've beaten the opponent named), and a hero's second
 * portrait (its `altPortrait` in src/match/personas.js) opens once a campaign is won with them.
 */
import { HEROES, OPPONENTS } from './personas.js';

/** By hero id: the opponent to beat (in any match) to open them, or null for one open from the start. */
export const HERO_UNLOCKS = Object.freeze({
  frodo: null,
  samwise: null,
  merry: null,
  legolas: null,
  pippin: 'birthdayBilbo',
  radagast: 'oldManWillow',
  strider: 'riderInBlack',
});

/** Whether a hero can be chosen. */
export function heroOpen(book, heroId) {
  const beat = HERO_UNLOCKS[heroId];
  return !beat || (book?.people?.[beat]?.won ?? 0) > 0;
}

/** What opening a hero takes, in words, or null for one open from the start. */
export const heroNeeds = (heroId) => (HERO_UNLOCKS[heroId] ? `Beat ${OPPONENTS[HERO_UNLOCKS[heroId]].name} to travel with ${HEROES[heroId].name}.` : null);

/** Whether a hero's second portrait can be chosen: they have one, and a campaign has been won with them. */
export const portraitOpen = (book, heroId) => Boolean(HEROES[heroId]?.altPortrait) && (book?.heroes?.[heroId]?.won ?? 0) > 0;

/** Everything a book has unlocked, as names to tell the player ("Pippin", "A new portrait for Frodo"). */
export function unlocksOf(book) {
  return [
    ...Object.keys(HERO_UNLOCKS).filter((id) => HERO_UNLOCKS[id] && HEROES[id] && heroOpen(book, id)).map((id) => HEROES[id].name),
    ...Object.keys(HEROES).filter((id) => portraitOpen(book, id)).map((id) => `A new portrait for ${HEROES[id].name}`),
  ];
}
