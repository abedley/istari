import { h } from '../dom.js';
import { icon } from '../icons.js';
import { rivendell } from './rivendell.js';
import { loadCampaign } from './campaign.js';

export function titleScreen(app) {
  const el = h('div',
    rivendell(h),
    h('div.title-main',
      // Fades in once the camera has settled (app.css, "title").
      h('p.tagline', 'Fifteen cards. Three decks. Best of three.'),
      h('div.menu',
        loadCampaign(app)
          ? h('button.begin', { onclick: () => app.go('campaign') }, h('span.begin-label', 'Continue campaign'))
          : h('button.begin', { onclick: () => app.go('heroes', { mode: 'campaign' }) }, h('span.begin-label', 'Campaign')),
        h('button.begin.quick', { onclick: () => app.go('heroes') }, h('span.begin-label', 'Quick match')))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear'))));
  return { el };
}
