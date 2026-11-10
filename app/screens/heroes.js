import { h } from '../dom.js';
import { crest } from '../art.js';
import { powerIcon } from '../icons.js';
import { header, personInfo } from './common.js';
import { PAIGOW_HEROES, DEFAULT_HERO, currentHeroId } from '../../src/paigow/personas.js';
import { EMBLEMS } from '../../src/cards/emblems.js';

const HERO_KEY = 'istari.hero';

/** A Ring of Power (an emblem id): its name, its power's name, and its rules text. */
export function ringOf(emblemId) {
  const emblem = EMBLEMS[emblemId];
  const ability = emblem?.abilities[0];
  // A passive power has no ability, just its text.
  if (emblem?.passive) return { name: emblem.name, power: emblem.power ?? null, text: emblem.text };
  // A power that costs nothing doesn't show its "0: ".
  return ability ? { name: emblem.name, power: emblem.power ?? null, text: ability.text.replace(/^0:\s*/, '') } : null;
}

/** A character's Ring of Power (their planeswalker power): see ringOf. */
export const powerOf = (person) => ringOf(person?.emblem);

/** A ring as a small block: its name, then its power's name and what it does. `note`: a line under it. */
export const ringBlock = (emblemId, { note = null } = {}) => {
  const ring = ringOf(emblemId);
  return ring ? h('div.power',
    h('div.power-name', powerIcon(emblemId, 'power-sym') ?? h('span.ring-mark', { 'aria-hidden': 'true' }), ring.name),
    h('div.power-text', ring.power ? h('i', `${ring.power}. `) : null, ring.text),
    note ? h('div.power-note', note) : null) : null;
};

/** A character's ring as a block. */
export const powerBlock = (person) => ringBlock(person?.emblem);

/**
 * Choosing your character for a Pai Gow match or a campaign (`mode` 'campaign'; PAIGOW_HEROES in
 * src/paigow/personas.js): each has a portrait and a Ring of Power. The last one chosen is remembered.
 */
export function heroesScreen(app, { mode = 'match' } = {}) {
  let chosen = currentHeroId(app.storage.getItem(HERO_KEY));
  if (!PAIGOW_HEROES[chosen]) chosen = DEFAULT_HERO;
  const cards = Object.entries(PAIGOW_HEROES).map(([id, hero]) => {
    const el = h('button.hero', { type: 'button', dataset: { hero: id }, onclick: () => pick(id) },
      crest(personInfo(hero), { size: 'lg' }),
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
    if (mode === 'campaign') app.go('campaign', { heroId: chosen });
    else app.go('paigow', { heroId: chosen });
  };
  render();
  const el = h('div',
    header({ title: 'Choose your hero', onBack: () => app.go('title') }),
    h('div.heroes', cards.map(([, el]) => el)),
    h('div.cta', h('button.btn.primary.big', { onclick: begin }, mode === 'campaign' ? 'Begin the campaign' : 'Open your booster')));
  return { el };
}
