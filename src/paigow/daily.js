/**
 * Today's road: one match a day, the same for everyone who plays that day. The day ("YYYY-MM-DD", by the player's
 * own calendar) seeds everything: the hero you're given (any of them, open to you or not), the opponent, both
 * boosters and the opponent's decks. Nothing of the campaign is at stake in it.
 */
import { createMatch, score, ROUND_RESULT } from './paigow.js';
import { PAIGOW_HEROES, PAIGOW_OPPONENTS } from './personas.js';
import { PLACES } from './places.js';
import { seededRandom } from '../engine/random.js';

/** A date's day, in its own time zone: "2026-11-14". */
export function dayOf(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A day's seed: a 32-bit hash of its text (FNV-1a). */
export function daySeed(day) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < day.length; i += 1) {
    hash ^= day.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The day's match, not yet begun: `daily` is its day. */
export function dailyMatch(day) {
  const seed = daySeed(day);
  const random = seededRandom(seed);
  const pick = (ids) => ids[Math.floor(random() * ids.length)];
  const heroId = pick(Object.keys(PAIGOW_HEROES));
  // Never yourself: not the opponent who bears your hero's ring.
  const opponentId = pick(Object.keys(PAIGOW_OPPONENTS).filter((id) => PAIGOW_OPPONENTS[id].emblem !== PAIGOW_HEROES[heroId].emblem));
  return { ...createMatch({ seed, heroId, opponentId }), daily: day };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day in a few words: "14 Nov". */
export function dayLabel(day) {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const MARK = { [ROUND_RESULT.WON]: '✅', [ROUND_RESULT.LOST]: '❌', [ROUND_RESULT.DRAWN]: '➖' };

/** A finished daily match, as a line to share: "Istari · 14 Nov · Saruman at Orthanc · ✅❌✅ 2–1". It gives away no cards. */
export function shareText(match) {
  const { won, lost } = score(match);
  const opponent = PAIGOW_OPPONENTS[match.opponentId];
  const place = PLACES[match.opponentId];
  return `Istari · ${dayLabel(match.daily)} · ${opponent.name}${place ? ` at ${place.name}` : ''} · ${match.rounds.map((r) => MARK[r.result] ?? '').join('')} ${won}–${lost}`;
}
