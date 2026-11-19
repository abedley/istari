/**
 * The Red Book (src/match/book.js), to read: the cards you've found, the people you've met on the road, the Rings
 * of Power you've borne, and the tale so far in numbers.
 */
import { h } from '../dom.js';
import { crest } from '../art.js';
import { header, personInfo } from './common.js';
import { ringBlock } from './heroes.js';
import { loadBook, heroLook } from '../book.js';
import { CARD_POOL } from '../../src/match/match.js';
import { CAMPAIGN_OPPONENTS, CAMPAIGN_BOOKS } from '../../src/match/campaign.js';
import { HEROES, OPPONENTS } from '../../src/match/personas.js';
import { placeOf } from '../../src/match/places.js';
import { heroOpen, heroNeeds } from '../../src/match/unlocks.js';

const TABS = ['Cards', 'People', 'Rings', 'Tale'];
const RARITIES = [['mythic', 'Mythic rares'], ['rare', 'Rares'], ['uncommon', 'Uncommons'], ['common', 'Commons']];

/** The cards: every card that can be opened, by rarity. Found ones show their art (tap to read); the rest are blank. */
function cardsTab(app, book) {
  const defs = app.definitions;
  const found = (id) => (book.cards[id] ?? 0) + (book.seen[id] ?? 0) > 0;
  const total = CARD_POOL.filter(found).length;
  const tile = (id) => {
    const card = { ...defs[id], cardId: id, id };
    if (!found(id)) return h('div.bk-card.unfound', { 'aria-label': 'Not yet found' }, h('span', '?'));
    const opened = book.cards[id] ?? 0;
    // `loading` before `src`: a picture far down the page isn't fetched until it's scrolled to.
    return h('button.bk-card', { type: 'button', 'aria-label': card.name, onclick: () => app.overlays.inspect(card) },
      card.image?.art ? h('img', { loading: 'lazy', decoding: 'async', alt: '', draggable: 'false', src: card.image.art }) : null,
      h('span.bk-card-name', card.name),
      opened ? (opened > 1 ? h('span.bk-card-n', `×${opened}`) : null) : h('span.bk-card-n.met', 'Met'));
  };
  return h('div.bk-tab',
    h('p.bk-lead', h('b', `${total} of ${CARD_POOL.length}`), ' cards found: opened in your boosters, or met in an opponent\'s deck.'),
    RARITIES.map(([rarity, label]) => {
      const ids = CARD_POOL.filter((id) => defs[id]?.rarity === rarity).sort((a, b) => defs[a].name.localeCompare(defs[b].name));
      return h('section.bk-section', h('h4', `${label} · ${ids.filter(found).length}/${ids.length}`), h('div.bk-grid', ids.map(tile)));
    }));
}

/** The people: each opponent, at their place, with your record against them; a stranger until you've played them. */
function peopleTab(app, book) {
  const others = Object.keys(OPPONENTS).filter((id) => !CAMPAIGN_OPPONENTS.includes(id));
  return h('div.bk-tab',
    h('p.bk-lead', 'Those you have met on the road, and how it went.'),
    h('div.bk-list', [...CAMPAIGN_OPPONENTS, ...others].map((id) => {
      const person = OPPONENTS[id];
      const record = book.people[id];
      const spot = placeOf(id);
      if (!record) {
        return h('div.bk-row.unmet', crest({ name: 'Unknown', color: 'black' }, { size: 'sm' }),
          h('div.bk-row-text', h('b', spot?.name ?? 'Somewhere on the road'), h('span', 'Not yet met')));
      }
      const parts = [record.won ? `${record.won} won` : null, record.lost ? `${record.lost} lost` : null, record.tied ? `${record.tied} tied` : null].filter(Boolean);
      return h('div.bk-row', crest(personInfo(person), { size: 'sm' }),
        h('div.bk-row-text', h('b', person.name), h('span', `${spot?.name ?? ''} · ${parts.join(', ')}`)),
        record.won ? h('span.bk-badge', 'Beaten') : null);
    })));
}

/** The rings: your heroes' own (once you've set out with them) and those taken from opponents. */
function ringsTab(app, book) {
  const own = Object.entries(HEROES).filter(([id]) => (book.heroes[id]?.begun ?? 0) > 0).map(([, hero]) => hero.emblem);
  const all = [...new Set([...Object.values(HEROES), ...Object.values(OPPONENTS)].map((person) => person.emblem))];
  const borne = all.filter((id) => own.includes(id) || book.rings.includes(id));
  return h('div.bk-tab',
    h('p.bk-lead', h('b', `${borne.length} of ${all.length}`), ' Rings of Power borne.'),
    borne.length ? h('div.cp-rings', borne.map((id) => ringBlock(id))) : h('p.pg-help', 'Set out on the road, and your hero\'s ring is the first.'),
    all.length > borne.length ? h('p.pg-help', `${all.length - borne.length} more are borne by others. Beat them, and you may take theirs.`) : null);
}

/** The tale so far: totals, the best moments, and each hero's campaigns. */
function taleTab(app, book) {
  const { totals } = book;
  const stat = (label, value) => h('div.bk-stat', h('b', String(value)), h('span', label));
  const stops = CAMPAIGN_BOOKS[0].draw + 1;
  return h('div.bk-tab',
    h('div.bk-stats',
      stat('Matches won', totals.won), stat('Matches lost', totals.lost), stat('Rounds played', totals.rounds),
      stat('Damage dealt', totals.damage), stat('Creatures felled', totals.felled), stat('Most damage in a round', book.mostDamage)),
    book.blow ? h('p.bk-lead', 'Hardest blow: ', h('b', `${book.blow.name}, for ${book.blow.amount}`)) : null,
    h('section.bk-section', h('h4', 'Your heroes'),
      h('div.bk-list', Object.entries(HEROES).map(([id, hero]) => {
        const open = heroOpen(book, id);
        const record = book.heroes[id] ?? { begun: 0, won: 0, furthest: 0 };
        const line = !open ? heroNeeds(id)
          : record.begun ? `${record.begun} ${record.begun === 1 ? 'campaign' : 'campaigns'}, ${record.won} won · furthest: ${record.furthest} of ${stops} beaten`
            : 'Not yet set out';
        return h(`div.bk-row${open ? '' : '.unmet'}`, crest(personInfo(heroLook(app, hero, id)), { size: 'sm' }),
          h('div.bk-row-text', h('b', hero.name), h('span', line)),
          record.won ? h('span.bk-badge', 'Road walked') : null);
      }))));
}

const RENDER = { Cards: cardsTab, People: peopleTab, Rings: ringsTab, Tale: taleTab };

export function bookScreen(app, { tab = 'Cards' } = {}) {
  const book = loadBook(app);
  let shown = TABS.includes(tab) ? tab : TABS[0];
  const body = h('div.bk-body');
  const tabs = h('div.bk-tabs', { role: 'tablist' }, TABS.map((name) => h('button.bk-tabbtn', {
    type: 'button', role: 'tab', dataset: { tab: name }, onclick: () => { shown = name; render(); },
  }, name)));
  const render = () => {
    for (const button of tabs.children) {
      const on = button.dataset.tab === shown;
      button.classList.toggle('on', on);
      button.setAttribute('aria-selected', String(on));
    }
    body.replaceChildren(RENDER[shown](app, book));
    body.scrollTop = 0;
  };
  render();
  const el = h('div', header({ title: 'The Red Book', onBack: () => app.go('title') }), tabs, body);
  return { el, ambience: 'shire' };
}
