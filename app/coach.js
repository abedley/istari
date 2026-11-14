/**
 * Teaching the format: first-run coach marks (a few steps, each pointing at something on the screen), and the
 * "How Pai Gow plays" sheet. They teach Pai Gow and this app's gestures, not Magic.
 */
import { h } from './dom.js';
import { PAIGOW_RULES } from '../src/paigow/paigow.js';
import { CAMPAIGN_RULES } from '../src/paigow/campaign.js';

const SEEN_KEY = 'istari.seen';

const seen = (app) => {
  try {
    return JSON.parse(app.storage.getItem(SEEN_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
};

/** Whether the coach marks called `key` have been shown. */
export const coached = (app, key) => Boolean(seen(app)[key]);

/** Forgets every coach mark, so they show again (from the settings). */
export const resetCoach = (app) => app.storage.removeItem(SEEN_KEY);

/**
 * Shows the coach marks `key` once ever: `steps` are `{ target, text }`, `target` a selector within `root` (a step
 * whose target isn't on screen is skipped). Each step rings its target and says its piece; a tap anywhere moves on,
 * and "Skip" ends it. Resolves when it's over (at once when already seen). `stillValid()`: checked before each step,
 * to stop when the screen has moved on.
 */
export async function coach(app, key, steps, { root = app.root, stillValid = () => true } = {}) {
  if (coached(app, key)) return;
  const shown = steps.map((step) => ({ ...step, el: root.querySelector(step.target) })).filter((step) => step.el);
  if (!shown.length) return;
  app.storage.setItem(SEEN_KEY, JSON.stringify({ ...seen(app), [key]: true }));

  const ring = h('div.coach-ring');
  const text = h('p.coach-text');
  const count = h('span.coach-count');
  const next = h('button.btn.primary.small', { type: 'button' }, 'Next');
  const skip = h('button.btn.ghost.small', { type: 'button' }, 'Skip');
  const bubble = h('div.coach-bubble', { role: 'dialog', 'aria-live': 'polite' }, text, h('div.coach-foot', count, skip, next));
  const layer = h('div.coach', ring, bubble);
  app.root.append(layer);
  layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });

  for (let i = 0; i < shown.length; i += 1) {
    const step = shown[i];
    if (!stillValid() || !step.el.isConnected) break;
    const base = app.root.getBoundingClientRect();
    const box = step.el.getBoundingClientRect();
    const pad = 6;
    // The ring keeps to the screen (a hand card hangs off the bottom edge).
    const top = Math.max(4, box.top - base.top - pad);
    const bottom = Math.min(base.height - 4, box.bottom - base.top + pad);
    const left = Math.max(4, box.left - base.left - pad);
    const right = Math.min(base.width - 4, box.right - base.left + pad);
    Object.assign(ring.style, { top: `${top}px`, left: `${left}px`, width: `${right - left}px`, height: `${bottom - top}px` });
    text.textContent = step.text;
    count.textContent = `${i + 1} of ${shown.length}`;
    next.textContent = i === shown.length - 1 ? 'Got it' : 'Next';
    skip.hidden = i === shown.length - 1;
    // Under the target when it's in the top half of the screen, over it otherwise.
    const below = (top + bottom) / 2 < base.height / 2;
    Object.assign(bubble.style, below ? { top: `${bottom + 12}px`, bottom: 'auto' } : { top: 'auto', bottom: `${base.height - top + 12}px` });
    next.focus({ preventScroll: true });
    // eslint-disable-next-line no-await-in-loop
    const skipped = await new Promise((resolve) => {
      const done = (value) => (event) => {
        event.stopPropagation();
        layer.onclick = null;
        skip.onclick = null;
        resolve(value);
      };
      layer.onclick = done(false);
      skip.onclick = done(true);
    });
    if (skipped) break;
  }
  await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.catch(() => {});
  layer.remove();
}

/** The format's rules and the app's gestures, on a sheet. */
export function showHowToPlay(app) {
  const { decks, deckSize, startingLife, secondPlayerLife } = PAIGOW_RULES;
  const section = (title, lines) => h('section.how-section', h('h4', title), h('ul', lines.map((line) => h('li', line))));
  const body = h('div.how',
    section('The match', [
      `You open a booster and split it into ${decks} decks of ${deckSize}. Your opponent does the same, and you don't see how.`,
      'Deck 1 plays round 1, deck 2 plays round 2, deck 3 plays round 3. Win two rounds to take the match.',
      'A coin decides who goes first in round 1. After that, whoever lost the last round goes first.',
    ]),
    section('A round is a game of Magic, except', [
      `Your whole deck of ${deckSize} starts in your hand. There are no mulligans, and an empty library doesn't lose you the game.`,
      'Mana is unlimited: you can pay any mana cost, as often as you like.',
      `Whoever goes first starts on ${startingLife} life, the other player on ${secondPlayerLife}.`,
      'Each player has a Ring of Power: a planeswalker-style ability, once each turn.',
      'If a full turn cycle passes and nothing lasting has changed, the round is a draw. The board warns you the turn before.',
    ]),
    section('The campaign', [
      `You face each opponent in turn, with ${CAMPAIGN_RULES.lives} lives. Losing a match costs a life, and you face them again with new boosters.`,
      `Beat an opponent and you may take their Ring of Power (up to ${CAMPAIGN_RULES.maxRings}), for 1 less starting life each round, or add a common to every booster you open.`,
    ]),
    section('Playing', [
      'Tap a card in your hand to see it big, then Cast. Or drag it up to play it, and onto a target if it has one.',
      'Hold any card, ring or ability to read it.',
      'The main button says what passing priority does now: Combat, Attack, Resolve, End turn. Hold it for full control, to stop at every step.',
      'Tap your graveyard, exile or library count to see the cards there, and play the ones you can.',
      'Fast forward appears when a player has nothing left to do, and plays the round out.',
    ]));
  app.overlays.sheet({ title: 'How Pai Gow plays', body, options: [], cancel: 'Close' });
}
