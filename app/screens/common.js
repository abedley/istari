/** Bits shared by the screens. */
import { h } from '../dom.js';
import { icon } from '../icons.js';

/** Name, color and portrait for a player or opponent (for crests). */
export const personInfo = (person, fallbackName) => ({
  name: person?.name ?? fallbackName, color: person?.color, art: person?.art, portrait: person?.portrait,
});

/** A header bar with an optional back button and right-side content. */
export function header({ title, onBack, right }) {
  return h('header.top',
    onBack ? h('button.icon-btn', { onclick: onBack, 'aria-label': 'Back' }, icon('back')) : h('span.spacer'),
    h('h2', title),
    right ?? h('span.spacer'));
}
