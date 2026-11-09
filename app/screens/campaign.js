import { h } from '../dom.js';
import { crest } from '../art.js';
import { header, personInfo } from './common.js';
import { ringBlock } from './heroes.js';
import {
  createCampaign, campaignStatus, currentOpponent, startMatch, updateMatch, recordMatch, takeRing, leaveRing, canTakeRing,
  CAMPAIGN_RULES, CAMPAIGN_STATUS,
} from '../../src/paigow/campaign.js';
import { playerLife } from '../../src/paigow/paigow.js';
import { paigowOpponent, paigowHero } from '../../src/paigow/personas.js';

const CAMPAIGN_KEY = 'istari.campaign';

/** The saved campaign, or null when there's none going on. */
export function loadCampaign(app) {
  try {
    const campaign = JSON.parse(app.storage.getItem(CAMPAIGN_KEY) ?? 'null');
    return campaign && paigowHero(campaign.heroId) && campaign.opponents?.every(paigowOpponent) ? campaign : null;
  } catch {
    return null;
  }
}

/** Saves the campaign (or forgets it, for null). */
export function saveCampaign(app, campaign) {
  if (campaign) app.storage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
  else app.storage.removeItem(CAMPAIGN_KEY);
  return campaign;
}

/** Saves a campaign match's progress (after each round), so the match can be picked up again. */
export function saveCampaignMatch(app, match) {
  const campaign = loadCampaign(app);
  if (campaign && match?.campaign) saveCampaign(app, updateMatch(campaign, match));
}

/** Records a finished campaign match's outcome (once; again does nothing) and returns the campaign. */
export function finishCampaignMatch(app, match, outcome) {
  const campaign = loadCampaign(app);
  return campaign ? saveCampaign(app, recordMatch(campaign, outcome, match)) : null;
}

/** Your lives, as hearts: full ones left, empty ones lost. */
const hearts = (lives) => h('div.cp-lives', { 'aria-label': `${lives} ${lives === 1 ? 'life' : 'lives'} left` },
  Array.from({ length: CAMPAIGN_RULES.lives }, (_, i) => h(`span.cp-heart${i < lives ? '.full' : ''}`, i < lives ? '♥' : '♡')));

/** What a set of rings costs in starting life, in words. */
const lifeLine = (rings) => {
  const { first, second } = playerLife({ rings });
  return `You start each game on ${first} life going first, ${second} going second.`;
};

/**
 * The campaign (src/paigow/campaign.js): a line of opponents, three lives, and the Rings of Power you
 * take from those you beat. With `heroId`, a new campaign begins for that hero.
 */
export function campaignScreen(app, { heroId = null } = {}) {
  let campaign = heroId ? saveCampaign(app, createCampaign({ heroId })) : loadCampaign(app);
  if (!campaign) {
    queueMicrotask(() => app.go('heroes', { mode: 'campaign' }));
    return { el: h('div') };
  }
  if (campaign.offer) return offerView(app, campaign);
  if (campaignStatus(campaign) !== CAMPAIGN_STATUS.PLAYING) return overView(app, campaign);

  const hero = paigowHero(campaign.heroId);
  const opponentId = currentOpponent(campaign);
  const opponent = paigowOpponent(opponentId);

  const path = h('ol.cp-path', campaign.opponents.map((id, i) => {
    const person = paigowOpponent(id);
    const state = i < campaign.stage ? 'beaten' : i === campaign.stage ? 'next' : 'later';
    const losses = campaign.history.filter((m) => m.opponentId === id && m.outcome === 'lost').length;
    return h(`li.cp-stop.${state}`,
      h('span.cp-num', String(i + 1)),
      crest(state === 'later' ? { name: 'Unknown', color: 'black' } : personInfo(person), { size: 'sm' }),
      h('div.cp-who',
        h('div.cp-name', state === 'later' ? 'Unknown' : person.name),
        h('div.cp-state', state === 'beaten' ? 'Beaten' : state === 'next' ? (campaign.match ? 'Match in progress' : 'Next') : '')),
      losses ? h('span.cp-losses', `${losses} ${losses === 1 ? 'loss' : 'losses'}`) : null);
  }));

  const rings = [hero.emblem, ...campaign.rings];
  const play = () => {
    campaign = saveCampaign(app, startMatch(campaign));
    app.go('paigow', { match: campaign.match });
  };
  const abandon = async () => {
    if (await app.overlays.confirm({ title: 'Abandon the campaign?', text: 'Your lives and rings will be lost.', yes: 'Abandon', danger: true })) {
      saveCampaign(app, null);
      app.go('title');
    }
  };

  const el = h('div',
    header({ title: 'Campaign', onBack: () => app.go('title'), right: hearts(campaign.lives) }),
    h('div.cp-body',
      h('section.cp-section', h('h4', 'The road'), path),
      h('section.cp-section',
        h('h4', `Your Rings of Power · ${campaign.rings.length}/${CAMPAIGN_RULES.maxRings} taken`),
        h('div.cp-rings', rings.map((id) => ringBlock(id))),
        h('p.pg-help', lifeLine(campaign.rings))),
      h('p.pg-help', `Lose a match and you lose a life. ${campaign.lives === 1 ? 'This is your last.' : `You have ${campaign.lives}.`}`)),
    h('div.cta',
      h('button.btn.primary.big', { onclick: play }, campaign.match ? `Continue vs ${opponent.name}` : `Face ${opponent.name}`),
      h('button.btn.ghost', { onclick: abandon }, 'Abandon campaign')));
  return { el };
}

/** After a win: the beaten opponent's ring, to take (for a life each game) or leave. */
function offerView(app, campaign) {
  const opponent = paigowOpponent(campaign.offer);
  const able = canTakeRing(campaign);
  const after = [...campaign.rings, opponent.emblem];
  const decide = (take) => {
    app.sound('select');
    saveCampaign(app, take ? takeRing(campaign) : leaveRing(campaign));
    app.go('campaign');
  };
  const el = h('div',
    header({ title: '', right: hearts(campaign.lives) }),
    h('div.cp-body.cp-offer',
      h('div.result-title.victory', 'Victory'),
      crest(personInfo(opponent), { size: 'lg' }),
      h('p.cp-offer-lead', `${opponent.name} is beaten, and leaves behind a Ring of Power.`),
      ringBlock(opponent.emblem),
      h('p.pg-help', able
        ? `Take it, and you start every game with 1 less life. ${lifeLine(after)}`
        : `You already bear ${CAMPAIGN_RULES.maxRings} rings. You can bear no more.`)),
    h('div.cta',
      able ? h('button.btn.primary.big', { onclick: () => decide(true) }, 'Take the ring') : null,
      h(`button.btn${able ? '.ghost' : '.primary.big'}`, { onclick: () => decide(false) }, able ? 'Leave it' : 'Move on')));
  return { el };
}

/** The campaign won or lost. */
function overView(app, campaign) {
  const won = campaignStatus(campaign) === CAMPAIGN_STATUS.WON;
  const hero = paigowHero(campaign.heroId);
  const again = () => {
    saveCampaign(app, null);
    app.go('heroes', { mode: 'campaign' });
  };
  const home = () => {
    saveCampaign(app, null);
    app.go('title');
  };
  const wins = campaign.history.filter((m) => m.outcome === 'won').length;
  const el = h('div',
    header({ title: '' }),
    h('div.cp-body.cp-offer',
      h(`div.result-title.${won ? 'victory' : 'defeat'}`, won ? 'Victory' : 'Defeat'),
      crest(personInfo(hero), { size: 'lg' }),
      h('p.cp-offer-lead', won
        ? `${hero.name} has beaten every opponent on the road, with ${campaign.lives} ${campaign.lives === 1 ? 'life' : 'lives'} to spare.`
        : `${hero.name} is out of lives, after beating ${wins} of ${campaign.opponents.length} opponents.`),
      campaign.rings.length ? h('div.cp-rings', campaign.rings.map((id) => ringBlock(id))) : null,
      h('p.pg-help', `${campaign.history.length} ${campaign.history.length === 1 ? 'match' : 'matches'} played.`)),
    h('div.cta',
      h('button.btn.primary.big', { onclick: again }, 'New campaign'),
      h('button.btn.ghost', { onclick: home }, 'Title')));
  return { el };
}
