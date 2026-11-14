import { h, onPress } from '../dom.js';
import { crest } from '../art.js';
import { fullCard, cardBack, manaPips } from '../cardView.js';
import { header, personInfo } from './common.js';
import { icon } from '../icons.js';
import {
  setDecks, score, outcome, nextRound, playerStartsRound, playerLife, spreadDecks,
  PAIGOW_RULES, ROUND_RESULT, MATCH_OUTCOME,
} from '../../src/paigow/paigow.js';
import { paigowOpponent, paigowHero, DEFAULT_HERO } from '../../src/paigow/personas.js';
import { powerBlock, ringBlock } from './heroes.js';
import { loadCampaign, saveCampaignMatch, finishCampaignMatch } from './campaign.js';
import { coach } from '../coach.js';

const RESULT_LABEL = { [ROUND_RESULT.WON]: 'Won', [ROUND_RESULT.LOST]: 'Lost', [ROUND_RESULT.DRAWN]: 'Draw' };

/**
 * Pai Gow (src/paigow/paigow.js): split 15 cards (or more, with a campaign's extra commons, leaving the
 * spare ones out) into three decks of five, then a best of three against
 * the CPU. `view`: 'build' (the decks), 'scoreboard' (between rounds) or 'final'. Every match is a campaign's
 * (see the campaign screen): it's saved after each round, and its outcome recorded in the campaign. Without a
 * `match`, the campaign's current one is shown, and with none going on, the campaign screen.
 */
export function paigowScreen(app, { match: given = null, view = null } = {}) {
  const match = given ?? loadCampaign(app)?.match ?? null;
  if (!match) {
    queueMicrotask(() => app.go('campaign'));
    return { el: h('div') };
  }
  const shown = view ?? (match.decks ? (outcome(match) ? 'final' : 'scoreboard') : 'build');
  return shown === 'build' ? buildView(app, match) : scoreView(app, match, shown === 'final');
}

/**
 * A card the size of a slot: tap for `onTap`, long-press (or tap, without `onTap`) to read it.
 * `full`: the printed card's whole image (when it has one), for the deck builder.
 */
function miniCard(app, cardId, { onTap = null, full = false } = {}) {
  const card = { ...app.definitions[cardId], cardId, id: cardId };
  const el = h(`button.pg-card${full ? '.full' : ''}`, { type: 'button', 'aria-label': card.name, dataset: { card: cardId } }, fullCard(card, app.definitions, { big: full }));
  const inspect = () => app.overlays.inspect(card);
  onPress(el, { onTap: onTap ?? inspect, onLong: onTap ? inspect : null });
  // A long press on a phone would otherwise open the browser's own menu.
  el.addEventListener('contextmenu', (event) => event.preventDefault());
  return el;
}

/** The match's hero, or the default for a match from before heroes. */
export const heroOf = (match) => paigowHero(match.heroId ?? DEFAULT_HERO);

/** Where Back goes: the campaign (the match is saved). */
const backTo = (app) => app.go('campaign');

/** The opponent, for the header: their portrait and name. Tap to read the Rings of Power. */
const opponentBadge = (app, match) => {
  const opponent = paigowOpponent(match.opponentId);
  return h('button.pg-head-opp', { type: 'button', onclick: () => showPowers(app, match) }, h('span', opponent.name), crest(personInfo(opponent), { size: 'sm' }));
};

/** Both sides' Rings of Power (planeswalker powers), on a sheet: yours are your hero's and any taken in a campaign. */
function showPowers(app, match) {
  const opponent = paigowOpponent(match.opponentId);
  const hero = heroOf(match);
  const side = (person, extra = []) => h('div.power-side', crest(personInfo(person), { size: 'sm' }),
    h('div.power-list', h('div.hero-name', person.name), powerBlock(person), extra.map((id) => ringBlock(id))));
  app.overlays.sheet({ title: 'Rings of Power', body: h('div.powers', side(opponent), side(hero, match.rings ?? [])), options: [], cancel: 'Close' });
}

/** A placed card, small: its art, name, mana cost and power/toughness. Tap for `onTap`, hold to read it. `picked`: chosen to move. */
function slotChip(app, cardId, { onTap, picked = false }) {
  const card = { ...app.definitions[cardId], cardId, id: cardId };
  const art = card.image?.art;
  const el = h(`button.pg-chip${picked ? '.picked' : ''}`, {
    type: 'button', 'aria-label': card.name, 'aria-pressed': picked ? 'true' : 'false', dataset: { card: cardId },
    style: art ? { backgroundImage: `url("${art}")` } : {},
  },
  manaPips(card.manaCost, 'pg-chip-cost'),
  card.types?.includes('Creature') ? h('span.pg-chip-pt', `${card.power}/${card.toughness}`) : null,
  h('span.pg-chip-name', card.name));
  onPress(el, { onTap, onLong: () => app.overlays.inspect(card) });
  el.addEventListener('contextmenu', (event) => event.preventDefault());
  return el;
}

/** How many of the booster's cards fit in a row of the deck builder's tray: pinch (or ⌘/Ctrl + wheel, or −/+) to change it. */
export const TRAY_COLUMNS = Object.freeze({ min: 1, max: 5, default: 3 });

/** The tray's columns from the settings, kept between TRAY_COLUMNS.min and .max. */
export const trayColumns = (settings) => {
  const n = Math.round(Number(settings?.trayColumns));
  return Number.isFinite(n) ? Math.min(TRAY_COLUMNS.max, Math.max(TRAY_COLUMNS.min, n)) : TRAY_COLUMNS.default;
};

/**
 * Zooming the tray: `tray`'s columns set from the settings, and changed (and saved) by a pinch, a ⌘/Ctrl + wheel (a
 * trackpad's pinch too) or the buttons. Zooming in shows fewer, bigger cards; out, more and smaller.
 * Returns the − and + buttons, and `update` to call once the tray is filled.
 */
function trayZoom(app, tray) {
  let columns = trayColumns(app.settings);
  const zoomOut = h('button.icon-btn.pg-zoom', { type: 'button', 'aria-label': 'Smaller cards: more in a row', onclick: () => set(columns + 1) }, icon('gridSmall'));
  const zoomIn = h('button.icon-btn.pg-zoom', { type: 'button', 'aria-label': 'Bigger cards: fewer in a row', onclick: () => set(columns - 1) }, icon('gridLarge'));
  const update = () => {
    tray.style.setProperty('--tray-cols', String(columns));
    tray.dataset.columns = String(columns);
    zoomOut.disabled = columns >= TRAY_COLUMNS.max;
    zoomIn.disabled = columns <= TRAY_COLUMNS.min;
  };
  const set = (next) => {
    const n = Math.min(TRAY_COLUMNS.max, Math.max(TRAY_COLUMNS.min, next));
    if (n === columns) return;
    // Keep the same part of the booster in view.
    const at = tray.scrollHeight > tray.clientHeight ? tray.scrollTop / (tray.scrollHeight - tray.clientHeight) : 0;
    columns = n;
    update();
    tray.scrollTop = at * Math.max(0, tray.scrollHeight - tray.clientHeight);
    app.updateSettings({ trayColumns: columns });
  };

  // A pinch: each time the fingers spread (or close) by a quarter of where they were, one column fewer (or more).
  const STEP = 1.25;
  let base = null;
  const spread = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  tray.addEventListener('touchstart', (event) => { if (event.touches.length === 2) base = spread(event.touches); }, { passive: true });
  tray.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 2 || !base) return;
    event.preventDefault();
    const now = spread(event.touches);
    if (now > base * STEP) { set(columns - 1); base = now; }
    else if (now < base / STEP) { set(columns + 1); base = now; }
  }, { passive: false });
  tray.addEventListener('touchend', (event) => { if (event.touches.length < 2) base = null; });
  tray.addEventListener('touchcancel', () => { base = null; });
  // Safari's own pinch gesture would zoom the page.
  for (const type of ['gesturestart', 'gesturechange']) tray.addEventListener(type, (event) => event.preventDefault());

  // ⌘/Ctrl + wheel, and a trackpad's pinch (which the browser sends as a wheel with ctrlKey).
  let wheel = 0;
  tray.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    wheel += event.deltaY;
    if (Math.abs(wheel) >= 40) { set(columns + Math.sign(wheel)); wheel = 0; }
  }, { passive: false });

  update();
  return { zoomOut, zoomIn, update };
}

function buildView(app, match) {
  const { decks: count, deckSize } = PAIGOW_RULES;
  /** Each card's deck (0–2), by its place in `match.cards` (a booster can hold two of a card), or none while it's in the tray. */
  let placed = new Map();
  let selected = 0;
  /** A placed card chosen to move (its place in `match.cards`), or null. */
  let picked = null;
  /** What Undo goes back to: each earlier `placed` and `selected`. */
  const history = [];
  const indexes = match.cards.map((_, n) => n);
  const deckIds = [...Array(count).keys()];

  const deckOf = (i) => indexes.filter((n) => placed.get(n) === i);
  const free = (i) => deckOf(i).length < deckSize;
  const board = h('div.pg-board');
  const hint = h('p.pg-hint', { 'aria-live': 'polite' });
  const tray = h('div.pg-tray');
  const trayTitle = h('h4');
  const zoom = trayZoom(app, tray);
  const start = h('button.btn.primary.pg-start', { onclick: () => play() });
  const autoFill = h('button.btn', { onclick: () => fill() }, 'Auto-fill');
  const undo = h('button.btn.ghost', { onclick: () => back() }, 'Undo');
  const clear = h('button.btn.ghost.small.pg-clear', { onclick: () => change(() => { placed = new Map(); selected = 0; }) }, 'Clear');

  /** Makes a change that Undo can take back. */
  const change = (make) => {
    history.push({ placed: new Map(placed), selected });
    picked = null;
    make();
    render();
  };
  const back = () => {
    const last = history.pop();
    if (!last) return;
    ({ placed, selected } = last);
    picked = null;
    render();
  };
  const place = (n) => {
    const target = free(selected) ? selected : deckIds.find(free);
    if (target === undefined) return;
    app.sound('select');
    change(() => {
      placed.set(n, target);
      // Keep filling the same deck until it's full, then move on to the next one with room.
      if (!free(target)) selected = deckIds.find(free) ?? target;
    });
  };
  /** A placed card tapped: pick it up to move; with one picked up already, swap the two; tapped again, back to the booster. */
  const tapPlaced = (n) => {
    if (picked === n) {
      change(() => { selected = placed.get(n); placed.delete(n); });
    } else if (picked !== null && placed.get(picked) !== placed.get(n)) {
      const other = picked;
      app.sound('select');
      change(() => {
        const deck = placed.get(n);
        placed.set(n, placed.get(other));
        placed.set(other, deck);
      });
    } else {
      picked = n;
      app.sound('tap');
      render();
    }
  };
  /** A deck tapped: the picked card moves there (when there's room), and it becomes the deck that tapped cards go to. */
  const tapDeck = (i) => {
    if (picked !== null && placed.get(picked) !== i && free(i)) {
      const n = picked;
      app.sound('select');
      change(() => { placed.set(n, i); selected = i; });
      return;
    }
    picked = null;
    selected = i;
    render();
  };
  const fill = () => {
    // With more cards than the decks hold, the strongest go in first; the decks come out about even.
    app.sound('select');
    change(() => { placed = spreadDecks(match.cards, placed); });
  };
  const play = () => {
    const decks = deckIds.map((i) => deckOf(i).map((n) => match.cards[n]));
    const ready = setDecks(match, decks);
    saveCampaignMatch(app, ready);
    app.go('battle', { match: ready });
  };

  const render = () => {
    // The three decks side by side, the selected one (where a tapped card goes) highlighted.
    board.replaceChildren(...deckIds.map((i) => {
      const cards = deckOf(i);
      return h('div.pg-col', { class: i === selected ? 'selected' : '', onclick: (event) => {
        if (event.target.closest('.pg-chip:not(.empty)')) return;
        tapDeck(i);
      } },
      h('div.pg-col-label', `Round ${i + 1} · ${cards.length}/${deckSize}`),
      ...cards.map((n) => slotChip(app, match.cards[n], { onTap: () => tapPlaced(n), picked: n === picked })),
      ...Array.from({ length: deckSize - cards.length }, () => h('div.pg-chip.empty')));
    }));
    const left = indexes.filter((n) => !placed.has(n));
    const toPlace = count * deckSize - placed.size;
    const full = toPlace === 0;
    hint.textContent = picked !== null
      ? 'Tap another deck to move it there, a card in another deck to swap them, or tap it again to take it out.'
      : full ? 'Tap a placed card to move it or swap it. Hold any card to read it.'
        : 'Tap a card to add it to the highlighted deck. Hold any card to read it.';
    trayTitle.textContent = full
      ? (left.length ? `All decks full · ${left.length} left out` : 'All cards placed')
      : `Your booster · ${left.length} left${left.length > toPlace ? ` · ${toPlace} to place` : ''}`;
    tray.replaceChildren(...(left.length
      ? left.map((n) => miniCard(app, match.cards[n], { onTap: () => place(n), full: true }))
      : [h('p.pg-tray-empty', `Deck 1 plays round 1, deck 2 round 2, deck 3 round 3. Your opponent's ${count} decks are set the same way, unseen. Win two rounds to take the match.`)]));
    start.textContent = full ? 'Start match' : `Place ${toPlace} more`;
    start.disabled = !full;
    autoFill.disabled = full;
    undo.disabled = history.length === 0;
    clear.hidden = placed.size === 0;
  };
  render();

  const el = h('div',
    header({ title: 'Three decks', onBack: () => backTo(app), right: opponentBadge(app, match) }),
    h('div.pg-builder', board, hint, h('section.pg-tray-wrap', h('div.pg-tray-head', trayTitle, h('div.pg-zooms', clear, zoom.zoomOut, zoom.zoomIn)), tray)),
    h('div.cta.pg-build-cta', h('div.row', undo, autoFill, start)));
  return {
    el,
    enter: () => coach(app, 'builder', [
      { target: '.pg-tray .pg-card', text: 'This is your booster. Tap a card to put it in the highlighted deck. Hold a card to read it.' },
      { target: '.pg-board', text: 'Three decks of five: deck 1 plays round 1, deck 2 round 2, deck 3 round 3. Your opponent splits theirs the same way, and you don\'t see how. Tap a deck to fill that one.' },
      { target: '.pg-head-opp', text: 'Who you\'re facing. Tap to read both sides\' Rings of Power before you split your cards.' },
    ], { root: el, stillValid: () => el.isConnected }),
  };
}

function scoreView(app, match, final) {
  const { won, lost, drawn } = score(match);
  const round = nextRound(match);
  const result = outcome(match);
  const opponent = paigowOpponent(match.opponentId);
  const hero = heroOf(match);
  const life = playerLife(match);
  // Saved as it goes, and its outcome counted once it's over.
  const campaign = final ? finishCampaignMatch(app, match, result) : (saveCampaignMatch(app, match), null);

  const roundRows = h('div.pg-rounds', match.decks.map((deck, i) => {
    const played = match.rounds[i];
    const revealed = played || final;
    const status = played ? RESULT_LABEL[played.result] : i === round ? 'Next' : '—';
    return h('div.pg-round', { class: played ? `r-${played.result}` : i === round ? 'r-next' : 'r-later' },
      h('div.pg-round-head', h('span', `Round ${i + 1}`), h('span.pg-status', status)),
      h('div.pg-match',
        h('div.pg-side', deck.map((id) => miniCard(app, id))),
        h('span.pg-vs', 'vs'),
        h('div.pg-side', match.cpuDecks[i].map((id) => (revealed ? miniCard(app, id) : h('div.pg-card.back', cardBack()))))));
  }));

  const title = final
    ? h(`div.result-title.${{ [MATCH_OUTCOME.WON]: 'victory', [MATCH_OUTCOME.LOST]: 'defeat' }[result] ?? 'tie'}`,
      { [MATCH_OUTCOME.WON]: 'Victory', [MATCH_OUTCOME.LOST]: 'Defeat' }[result] ?? 'Tie')
    : null;
  const leave = () => backTo(app);
  const el = h('div',
    header({ title: '', onBack: leave }),
    h('div.pg-body',
      title,
      h('div.pg-score',
        h('button.pg-score-side', { type: 'button', onclick: () => showPowers(app, match) }, crest(personInfo(hero), { size: 'sm' }), h('span', hero.name)),
        h('div.pg-score-num', `${won} – ${lost}`, drawn ? h('small', `${drawn} ${drawn === 1 ? 'draw' : 'draws'}`) : null),
        h('button.pg-score-side', { type: 'button', onclick: () => showPowers(app, match) }, crest(personInfo(opponent), { size: 'sm' }), h('span', opponent.name))),
      round !== null ? h('p.pg-help', playerStartsRound(match, round)
        ? `You go first, on ${life.first} life; ${opponent.name} starts on ${PAIGOW_RULES.secondPlayerLife}.`
        : `${opponent.name} goes first, on ${PAIGOW_RULES.startingLife} life; you start on ${life.second}.`) : null,
      final && campaign ? h('p.pg-help', campaignNote(result, campaign)) : null,
      roundRows),
    h('div.cta', final
      ? h('button.btn.primary.big', { onclick: () => app.go('campaign') }, 'Continue')
      : h('button.btn.primary.big', { onclick: () => app.go('battle', { match }) }, `Play round ${round + 1}`)));
  return {
    el,
    enter() {
      el.querySelector('.result-title')?.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    },
  };
}

/** What a campaign match's outcome meant for the campaign. */
function campaignNote(result, campaign) {
  if (result === MATCH_OUTCOME.LOST) {
    return campaign.lives > 0 ? `You lose a life: ${campaign.lives} left. Try again.` : 'You have no lives left.';
  }
  if (result === MATCH_OUTCOME.TIE) return 'A tie costs no life, but you must face them again.';
  return 'On to the next.';
}
