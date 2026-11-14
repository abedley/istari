import { h } from '../dom.js';
import { crest } from '../art.js';
import { powerIcon } from '../icons.js';
import { header, personInfo } from './common.js';
import { PAIGOW_HEROES, DEFAULT_HERO, currentHeroId } from '../../src/paigow/personas.js';
import { EMBLEMS } from '../../src/cards/emblems.js';
import { heroOpen, heroNeeds, portraitOpen } from '../../src/paigow/unlocks.js';
import { loadBook, heroLook, wearsAlt, choosePortrait } from '../book.js';

const HERO_KEY = 'istari.hero';

/**
 * A Ring of Power (an emblem id): its name, its power's name, and its rules text (`power`, `text`); with more than
 * one power (a passive one and one to activate, as the Rider in Black's), each in `powers` (`{ power, text }`).
 */
export function ringOf(emblemId) {
  const emblem = EMBLEMS[emblemId];
  if (!emblem) return null;
  // A power that costs nothing doesn't show its "0: ".
  const textOf = (ability) => ability.text.replace(/^0:\s*/, '');
  // A passive power is just its text; any ability besides is a power of its own, under the ability's name.
  const powers = emblem.passive
    ? [{ power: emblem.power ?? null, text: emblem.text }, ...emblem.abilities.map((a) => ({ power: a.name ?? null, text: textOf(a) }))]
    : emblem.abilities.slice(0, 1).map((a) => ({ power: emblem.power ?? null, text: textOf(a) }));
  return powers.length ? { name: emblem.name, ...powers[0], powers } : null;
}

/** A character's Ring of Power (their planeswalker power): see ringOf. */
export const powerOf = (person) => ringOf(person?.emblem);

/** A ring as a small block: its name, then its power's name and what it does. `note`: a line under it. */
export const ringBlock = (emblemId, { note = null } = {}) => {
  const ring = ringOf(emblemId);
  return ring ? h('div.power',
    h('div.power-name', powerIcon(emblemId, 'power-sym') ?? h('span.ring-mark', { 'aria-hidden': 'true' }), ring.name),
    ring.powers.map((p) => h('div.power-text', p.power ? h('i', `${p.power}. `) : null, p.text)),
    note ? h('div.power-note', note) : null) : null;
};

/** A character's ring as a block. */
export const powerBlock = (person) => ringBlock(person?.emblem);

/**
 * Choosing your character for a campaign (PAIGOW_HEROES in src/paigow/personas.js): each has a portrait and a
 * Ring of Power. The last one chosen is remembered.
 */
export function heroesScreen(app) {
  const book = loadBook(app);
  const open = (id) => heroOpen(book, id);
  let chosen = currentHeroId(app.storage.getItem(HERO_KEY));
  if (!PAIGOW_HEROES[chosen] || !open(chosen)) chosen = DEFAULT_HERO;
  const cards = Object.entries(PAIGOW_HEROES).map(([id, hero]) => {
    if (!open(id)) {
      // Not yet met: who they are stays hidden, and what it takes is said.
      const el = h('div.hero.locked', { dataset: { hero: id }, 'aria-disabled': 'true' },
        crest({ name: 'Unknown', color: 'black' }, { size: 'lg' }),
        h('div.hero-body', h('div.hero-name', hero.name), h('div.hero-blurb', heroNeeds(id))));
      return [id, el];
    }
    const face = h('div.hero-face');
    const draw = () => face.replaceChildren(crest(personInfo(heroLook(app, hero, id)), { size: 'lg' }));
    draw();
    // A second portrait, once a campaign is won with them: a tap swaps it.
    const swap = portraitOpen(book, id) ? h('span.hero-swap', {
      role: 'button', tabindex: '0', 'aria-label': `Change ${hero.name}'s portrait`,
      onclick: (event) => {
        event.stopPropagation();
        choosePortrait(app, id, !wearsAlt(app, id));
        app.sound('select');
        draw();
      },
    }, 'Change portrait') : null;
    const el = h('button.hero', { type: 'button', dataset: { hero: id }, onclick: () => pick(id) },
      h('div.hero-side', face, swap),
      h('div.hero-body', h('div.hero-name', hero.name), h('div.hero-blurb', hero.blurb), powerBlock(hero)));
    return [id, el];
  });
  const render = () => cards.forEach(([id, el]) => el.classList.toggle('selected', id === chosen));
  const pick = (id) => {
    chosen = id;
    app.sound('select');
    render();
  };
  const begin = () => {
    app.storage.setItem(HERO_KEY, chosen);
    app.go('campaign', { heroId: chosen });
  };
  render();
  const el = h('div',
    header({ title: 'Choose your hero', onBack: () => app.go('title') }),
    h('div.heroes', cards.map(([, el]) => el)),
    h('div.cta', h('button.btn.primary.big', { onclick: begin }, 'Set out')));
  return { el, ambience: 'shire' };
}
