/**
 * What's earned on the road, worked out from the Red Book (src/paigow/book.js): three heroes are open from the
 * start and three are met along the way (each opens once you've beaten the opponent named), and a hero's second
 * portrait (its `altPortrait` in src/paigow/personas.js) opens once a campaign is won with them.
 */
import { PAIGOW_HEROES, PAIGOW_OPPONENTS } from './personas.js';

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
export const heroNeeds = (heroId) => (HERO_UNLOCKS[heroId] ? `Beat ${PAIGOW_OPPONENTS[HERO_UNLOCKS[heroId]].name} to travel with ${PAIGOW_HEROES[heroId].name}.` : null);

/** Whether a hero's second portrait can be chosen: they have one, and a campaign has been won with them. */
export const portraitOpen = (book, heroId) => Boolean(PAIGOW_HEROES[heroId]?.altPortrait) && (book?.heroes?.[heroId]?.won ?? 0) > 0;

/** Everything a book has unlocked, as names to tell the player ("Pippin", "A new portrait for Frodo"). */
export function unlocksOf(book) {
  return [
    ...Object.keys(HERO_UNLOCKS).filter((id) => HERO_UNLOCKS[id] && PAIGOW_HEROES[id] && heroOpen(book, id)).map((id) => PAIGOW_HEROES[id].name),
    ...Object.keys(PAIGOW_HEROES).filter((id) => portraitOpen(book, id)).map((id) => `A new portrait for ${PAIGOW_HEROES[id].name}`),
  ];
}
