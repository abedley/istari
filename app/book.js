/**
 * The Red Book (src/paigow/book.js) and today's road (src/paigow/daily.js), kept in the device's storage, and
 * which portrait each hero wears (src/paigow/unlocks.js).
 */
import { emptyBook, readBook, catchUp } from '../src/paigow/book.js';
import { portraitOpen } from '../src/paigow/unlocks.js';
import { dayOf } from '../src/paigow/daily.js';
import { paigowHero } from '../src/paigow/personas.js';

const BOOK_KEY = 'istari.book';
const DAILY_KEY = 'istari.daily';
const PORTRAITS_KEY = 'istari.portraits';

const read = (app, key) => {
  try {
    return JSON.parse(app.storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

/** The book, caught up with a campaign saved before there was one (so what was already beaten counts). */
export function loadBook(app) {
  const book = readBook(read(app, BOOK_KEY)) ?? emptyBook();
  const caught = catchUp(book, read(app, 'istari.campaign'));
  if (caught !== book) app.storage.setItem(BOOK_KEY, JSON.stringify(caught));
  return caught;
}

/** The book after `change(book)`, saved when it changed. */
export function updateBook(app, change) {
  const book = loadBook(app);
  const next = change(book);
  if (next !== book) app.storage.setItem(BOOK_KEY, JSON.stringify(next));
  return next;
}

/** Forgets the book (from the settings). */
export const eraseBook = (app) => app.storage.removeItem(BOOK_KEY);

/** Today's match as saved (`{ day, match, outcome }`, `outcome` null while it's going on), or null when today's hasn't begun. */
export function loadDaily(app, day = dayOf()) {
  const saved = read(app, DAILY_KEY);
  return saved?.day === day && saved.match?.daily === day && paigowHero(saved.match.heroId) ? saved : null;
}

/** Saves a daily match's progress, and its outcome once it's over. */
export function saveDaily(app, match, outcome = null) {
  if (!match?.daily) return;
  app.storage.setItem(DAILY_KEY, JSON.stringify({ day: match.daily, match, outcome }));
}

/** Which portrait each hero wears: `{ heroId: 'alt' }` for those on their second. */
const portraits = (app) => read(app, PORTRAITS_KEY) ?? {};

/** Whether a hero is wearing their second portrait (chosen, and still open to them). */
export const wearsAlt = (app, heroId) => portraits(app)[heroId] === 'alt' && portraitOpen(loadBook(app), heroId);

/** Chooses a hero's portrait: their second (`alt` true) or their first. */
export function choosePortrait(app, heroId, alt) {
  const next = { ...portraits(app) };
  if (alt) next[heroId] = 'alt';
  else delete next[heroId];
  app.storage.setItem(PORTRAITS_KEY, JSON.stringify(next));
}

/** A hero as they are to be shown: with their second portrait when they wear it. */
export function heroLook(app, hero, heroId) {
  return hero?.altPortrait && wearsAlt(app, heroId) ? { ...hero, portrait: hero.altPortrait } : hero;
}
