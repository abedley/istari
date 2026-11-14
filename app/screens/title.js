import { h } from '../dom.js';
import { icon } from '../icons.js';
import { rivendell } from './rivendell.js';
import { loadCampaign } from './campaign.js';
import { showHowToPlay } from '../coach.js';

export function titleScreen(app) {
  const el = h('div',
    rivendell(h),
    h('div.title-main',
      // Fades in once the camera has settled (app.css, "title").
      h('p.tagline', 'Fifteen cards. Three decks. Best of three.'),
      h('div.menu',
        // The campaign is the game: one way in.
        loadCampaign(app)
          ? h('button.begin', { onclick: () => app.go('campaign') }, h('span.begin-label', 'Continue'))
          : h('button.begin', { onclick: () => app.go('heroes') }, h('span.begin-label', 'Begin')))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear')),
      h('button.btn.ghost.title-how', { onclick: () => showHowToPlay(app) }, 'How Pai Gow plays')));
  return { el };
}
