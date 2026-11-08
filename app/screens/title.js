import { h } from '../dom.js';
import { icon } from '../icons.js';
import { rivendell } from './rivendell.js';

export function titleScreen(app) {
  const el = h('div',
    rivendell(h),
    h('div.title-main',
      // Fades in once the camera has settled (app.css, "title").
      h('p.tagline', 'Fifteen cards. Three decks. Best of three.'),
      h('div.menu',
        h('button.begin', { onclick: () => app.go('paigow') }, h('span.begin-label', 'New match')))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear'))));
  return { el };
}
