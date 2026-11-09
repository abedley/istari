import { h, onPress } from '../dom.js';
import { crest } from '../art.js';
import { fullCard, cardBack } from '../cardView.js';
import { header, personInfo } from './common.js';
import {
  createMatch, setDecks, score, outcome, nextRound, playerStartsRound, playerLife,
  PAIGOW_RULES, ROUND_RESULT, MATCH_OUTCOME,
} from '../../src/paigow/paigow.js';
import { paigowOpponent, paigowHero, DEFAULT_HERO } from '../../src/paigow/personas.js';
import { powerBlock, ringBlock } from './heroes.js';
import { saveCampaignMatch, finishCampaignMatch } from './campaign.js';

const RESULT_LABEL = { [ROUND_RESULT.WON]: 'Won', [ROUND_RESULT.LOST]: 'Lost', [ROUND_RESULT.DRAWN]: 'Draw' };

/**
 * Pai Gow (src/paigow/paigow.js): split 15 cards into three decks of five, then a best of three against
 * the CPU. `view`: 'build' (the decks), 'scoreboard' (between rounds) or 'final'. Without a `match`, a
 * new one is dealt, for the hero `heroId` (see the heroes screen). A campaign's match (`match.campaign`,
 * see the campaign screen) is saved after each round, and its outcome recorded in the campaign.
 */
export function paigowScreen(app, { match: given = null, view = null, heroId = DEFAULT_HERO } = {}) {
  const match = given ?? createMatch({ heroId });
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

/** Where Back goes: a campaign's match back to the campaign (it's saved), any other to the title. */
const backTo = (app, match) => app.go(match.campaign ? 'campaign' : 'title');

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

/** A placed card, small: its art and name. Tap for `onTap`, hold to read it. */
function slotChip(app, cardId, { onTap }) {
  const card = { ...app.definitions[cardId], cardId, id: cardId };
  const art = card.image?.art;
  const el = h('button.pg-chip', {
    type: 'button', 'aria-label': card.name, dataset: { card: cardId },
    style: art ? { backgroundImage: `url("${art}")` } : {},
  }, h('span', card.name));
  onPress(el, { onTap, onLong: () => app.overlays.inspect(card) });
  el.addEventListener('contextmenu', (event) => event.preventDefault());
  return el;
}

function buildView(app, match) {
  const { decks: count, deckSize } = PAIGOW_RULES;
  /** Each card's deck (0–2), by its place in `match.cards` (a booster can hold two of a card), or none while it's in the tray. */
  const placed = new Map();
  let selected = 0;
  const indexes = match.cards.map((_, n) => n);

  const deckOf = (i) => indexes.filter((n) => placed.get(n) === i);
  const free = (i) => deckOf(i).length < deckSize;
  const board = h('div.pg-board');
  const tray = h('div.pg-tray');
  const trayTitle = h('h4');
  const start = h('button.btn.primary.pg-start', { onclick: () => play() }, 'Start match');
  const autoFill = h('button.btn', { onclick: () => fill() }, 'Auto-fill');
  const clear = h('button.btn.ghost', { onclick: () => { placed.clear(); selected = 0; render(); } }, 'Clear');

  const place = (n) => {
    const target = free(selected) ? selected : [...Array(count).keys()].find(free);
    if (target === undefined) return;
    placed.set(n, target);
    app.sound('select');
    // Keep filling the same deck until it's full, then move on to the next one with room.
    if (!free(target)) selected = [...Array(count).keys()].find(free) ?? target;
    render();
  };
  const unplace = (n) => {
    selected = placed.get(n);
    placed.delete(n);
    render();
  };
  const fill = () => {
    for (const n of indexes) {
      if (placed.has(n)) continue;
      const target = [...Array(count).keys()].find(free);
      if (target === undefined) break;
      placed.set(n, target);
    }
    render();
  };
  const play = () => {
    const decks = [...Array(count).keys()].map((i) => deckOf(i).map((n) => match.cards[n]));
    const ready = setDecks(match, decks);
    saveCampaignMatch(app, ready);
    app.go('battle', { match: ready });
  };

  const render = () => {
    // The three decks side by side, the selected one (where a tapped card goes) highlighted.
    board.replaceChildren(...[...Array(count).keys()].map((i) => {
      const cards = deckOf(i);
      return h('div.pg-col', { class: i === selected ? 'selected' : '', onclick: (event) => {
        if (event.target.closest('.pg-chip:not(.empty)')) return;
        selected = i;
        render();
      } },
      h('div.pg-col-label', `Round ${i + 1}`),
      ...cards.map((n) => slotChip(app, match.cards[n], { onTap: () => unplace(n) })),
      ...Array.from({ length: deckSize - cards.length }, () => h('div.pg-chip.empty')));
    }));
    const left = indexes.filter((n) => !placed.has(n));
    trayTitle.textContent = left.length ? `Your booster · ${left.length} left` : 'All cards placed';
    tray.replaceChildren(...left.map((n) => miniCard(app, match.cards[n], { onTap: () => place(n), full: true })));
    start.disabled = left.length > 0;
    autoFill.disabled = left.length === 0;
    clear.disabled = placed.size === 0;
  };
  render();

  const el = h('div',
    header({ title: '', onBack: () => backTo(app, match), right: opponentBadge(app, match) }),
    h('div.pg-builder', board, h('section.pg-tray-wrap', trayTitle, tray)),
    h('div.cta.pg-build-cta', h('div.row', clear, autoFill, start)));
  return { el };
}

function scoreView(app, match, final) {
  const { won, lost, drawn } = score(match);
  const round = nextRound(match);
  const result = outcome(match);
  const opponent = paigowOpponent(match.opponentId);
  const hero = heroOf(match);
  const life = playerLife(match);
  // A campaign's match: saved as it goes, and its outcome counted once it's over.
  const campaign = !match.campaign ? null : final ? finishCampaignMatch(app, match, result) : (saveCampaignMatch(app, match), null);

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
    ? h(`div.result-title.${result === MATCH_OUTCOME.WON ? 'victory' : 'defeat'}`, { WON: 'Victory', LOST: 'Defeat', TIE: 'Tie' }[result.toUpperCase()])
    : null;
  const leave = async () => {
    if (match.campaign) backTo(app, match);
    else if (final || await app.overlays.confirm({ title: 'Leave the match?', text: 'This match will be lost.', yes: 'Leave', danger: true })) app.go('title');
  };
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
    h('div.cta', final && match.campaign
      ? h('button.btn.primary.big', { onclick: () => app.go('campaign') }, 'Continue')
      : final
      ? [h('button.btn.primary.big', { onclick: () => app.go('paigow', { heroId: match.heroId ?? DEFAULT_HERO }) }, 'New match'), h('button.btn.ghost', { onclick: () => app.go('title') }, 'Title')]
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
