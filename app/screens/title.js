import { h } from '../dom.js';
import { icon } from '../icons.js';
import { rivendell } from './rivendell.js';
import { loadCampaign } from './campaign.js';
import { showHowToPlay } from '../coach.js';
import { loadBook } from '../book.js';

export function titleScreen(app) {
  // The Red Book catches up with a campaign saved before there was one.
  loadBook(app);
  const el = h('div',
    rivendell(h),
    h('div.title-main',
      h('div.menu',
        loadCampaign(app)
          ? h('button.begin', { onclick: () => app.go('campaign') }, h('span.begin-label', 'Continue'))
          : h('button.begin', { onclick: () => app.go('heroes') }, h('span.begin-label', 'Begin')),
        h('button.begin.minor', { onclick: () => app.go('book') }, h('span.begin-label', 'The Red Book')))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear')),
      h('button.btn.ghost.title-how', { onclick: () => showHowToPlay(app) }, 'How to play')));
  return { el, ambience: 'shire' };
}
