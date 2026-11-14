import { h } from '../dom.js';
import { icon } from '../icons.js';
import { rivendell } from './rivendell.js';
import { loadCampaign } from './campaign.js';
import { showHowToPlay } from '../coach.js';
import { loadBook, loadDaily } from '../book.js';
import { dayOf, dailyMatch } from '../../src/paigow/daily.js';
import { score } from '../../src/paigow/paigow.js';

/** Today's road, as the title offers it: to begin, to go on with, or (once played) how it went. */
function dailyEntry(app) {
  const day = dayOf();
  const saved = loadDaily(app, day);
  if (!saved) {
    return h('button.begin.minor', { onclick: () => app.go('paigow', { match: dailyMatch(day) }) }, h('span.begin-label', 'Today\'s road'));
  }
  const { won, lost } = score(saved.match);
  const label = saved.outcome ? `Today's road · ${won}–${lost}` : 'Today\'s road · go on';
  return h('button.begin.minor', { onclick: () => app.go('paigow', { match: saved.match, view: saved.outcome ? 'final' : null }) }, h('span.begin-label', label));
}

export function titleScreen(app) {
  // The Red Book catches up with a campaign saved before there was one.
  loadBook(app);
  const el = h('div',
    rivendell(h),
    h('div.title-main',
      // Fades in once the camera has settled (app.css, "title").
      h('p.tagline', 'Fifteen cards. Three decks. Best of three.'),
      h('div.menu',
        // The campaign is the game; today's road is one match a day beside it.
        loadCampaign(app)
          ? h('button.begin', { onclick: () => app.go('campaign') }, h('span.begin-label', 'Continue'))
          : h('button.begin', { onclick: () => app.go('heroes') }, h('span.begin-label', 'Begin')),
        dailyEntry(app),
        h('button.begin.minor', { onclick: () => app.go('book') }, h('span.begin-label', 'The Red Book')))),
    h('footer.title-foot',
      h('button.icon-btn', { onclick: () => app.overlays.settings(), 'aria-label': 'Settings' }, icon('gear')),
      h('button.btn.ghost.title-how', { onclick: () => showHowToPlay(app) }, 'How Pai Gow plays')));
  return { el, ambience: 'shire' };
}
