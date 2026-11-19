import { h } from '../dom.js';
import { icon } from '../icons.js';
import { shire } from './shire.js';
import { loadCampaign } from './campaign.js';
import { loadBook } from '../book.js';

export function titleScreen(app) {
  // The Red Book catches up with a campaign saved before there was one.
  loadBook(app);
  const el = h('div',
    shire(h),
    h('div.title-main',
      h('div.menu',
        loadCampaign(app)
          ? h('button.begin', { onclick: () => app.go('campaign') }, h('span.begin-label', 'Continue'))
          : h('button.begin', { onclick: () => app.go('heroes') }, h('span.begin-label', 'Begin')))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear')),
      h('button.icon-btn', { onclick: () => app.go('book'), 'aria-label': 'The Red Book' }, icon('book'))));
  return { el, ambience: 'shire' };
}
