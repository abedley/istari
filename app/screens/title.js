import { h } from '../dom.js';
import { icon } from '../icons.js';

export function titleScreen(app) {
  const el = h('div',
    h('div.title-sky', h('div.title-glow'), h('div.title-motes')),
    h('div.title-main',
      h('div.logo', h('span.logo-big', 'Istari')),
      h('p.tagline', 'Fifteen cards. Three decks. Best of three.'),
      h('div.menu',
        h('button.btn.primary.big', { onclick: () => app.go('paigow') }, 'New match'))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear'))));
  return { el };
}
