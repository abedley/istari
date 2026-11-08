import { h } from '../dom.js';
import { crest } from '../art.js';
import { header, personInfo } from './common.js';
import { PAIGOW_HEROES, DEFAULT_HERO } from '../../src/paigow/personas.js';
import { EMBLEMS } from '../../src/cards/emblems.js';

const HERO_KEY = 'istari.hero';

/** A character's planeswalker power: its name and rules text. */
export function powerOf(person) {
  const ability = EMBLEMS[person?.emblem]?.abilities[0];
  return ability ? { name: ability.name, text: ability.text } : null;
}

/** The power as a small block: its name, then what it does. */
export const powerBlock = (person) => {
  const power = powerOf(person);
  return power ? h('div.power', h('div.power-name', power.name), h('div.power-text', power.text)) : null;
};

/**
 * Choosing your character for a Pai Gow match (PAIGOW_HEROES in src/paigow/personas.js): each has a
 * portrait and a planeswalker power. The last one chosen is remembered.
 */
export function heroesScreen(app) {
  let chosen = app.storage.getItem(HERO_KEY);
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
    app.go('paigow', { heroId: chosen });
  };
  render();
  const el = h('div',
    header({ title: 'Choose your hero', onBack: () => app.go('title') }),
    h('div.heroes', cards.map(([, el]) => el)),
    h('div.cta', h('button.btn.primary.big', { onclick: begin }, 'Open your booster')));
  return { el };
}
