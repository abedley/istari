import { h } from '../dom.js';
import { crest } from '../art.js';
import { header, personInfo } from './common.js';
import { icon, powerIcon } from '../icons.js';
import { roadMap } from './roadMap.js';
import { ringBlock } from './heroes.js';
import {
  createCampaign, campaignStatus, currentOpponent, startMatch, updateMatch, recordMatch, takeRing, takeCommon, canTakeRing,
  CAMPAIGN_RULES, CAMPAIGN_STATUS, CAMPAIGN_BOOKS,
} from '../../src/match/campaign.js';
import { playerLife, BOOSTER } from '../../src/match/match.js';
import { opponentById, heroById, currentHeroId } from '../../src/match/personas.js';
import { placeOf, withArt, JOURNEYS_END } from '../../src/match/places.js';
import { recordRing, recordCampaignBegun, recordCampaignProgress } from '../../src/match/book.js';
import { unlocksOf } from '../../src/match/unlocks.js';
import { updateBook, loadBook, heroLook } from '../book.js';

const CAMPAIGN_KEY = 'istari.campaign';

/** The saved campaign, or null when there's none going on. */
export function loadCampaign(app) {
  try {
    const campaign = JSON.parse(app.storage.getItem(CAMPAIGN_KEY) ?? 'null');
    // A hero that has been renamed since (Bilbo became Samwise, Aragorn became Strider).
    if (campaign?.heroId) campaign.heroId = currentHeroId(campaign.heroId);
    if (campaign?.match?.heroId) campaign.match.heroId = currentHeroId(campaign.match.heroId);
    return campaign && heroById(campaign.heroId) && campaign.opponents?.every(opponentById) ? campaign : null;
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

/** The book a campaign is walking, or null for one begun before there were books. */
const bookOf = (campaign) => (Number.isInteger(campaign.book) ? CAMPAIGN_BOOKS[campaign.book] ?? null : null);

/**
 * Your lives, drawn as seed-cakes for the road: whole ones left, crumbs where one was eaten. A lost match costs one.
 */
export const cakes = (lives) => h('div.cp-lives', { role: 'img', 'aria-label': livesLeft(lives) },
  Array.from({ length: CAMPAIGN_RULES.lives }, (_, i) => h(`span.cp-cake${i < lives ? '.full' : ''}`, icon(i < lives ? 'seedCake' : 'crumbs'))));

/** "3 lives left", "1 life left". */
export const livesLeft = (lives) => `${lives} ${lives === 1 ? 'life' : 'lives'} left`;

/** What a set of rings costs in starting life, in words. */
const lifeLine = (rings) => {
  const { first, second } = playerLife({ rings });
  return `You start each round on ${first} life going first, ${second} going second.`;
};

/** How many commons your boosters hold with `extra` more, in words. */
const commonsLine = (extra, lead = 'Your') => `${lead} boosters hold ${BOOSTER.commons + extra} commons, ${BOOSTER.commons + BOOSTER.uncommons + BOOSTER.rares + BOOSTER.wildcards + extra} cards in all: make three decks of five and leave the rest out.`;

/**
 * The campaign (src/match/campaign.js): a road of opponents (drawn as a map, roadMap.js), three lives, and the rewards you take
 * from those you beat (Rings of Power, or extra commons). With `heroId`, a new campaign begins for that hero.
 * `walkFrom`: the stop just left, after a win, so the hero walks up the road from it (see roadMap).
 */
export function campaignScreen(app, { heroId = null, walkFrom = null } = {}) {
  let campaign = heroId ? saveCampaign(app, createCampaign({ heroId })) : loadCampaign(app);
  if (campaign) updateBook(app, (book) => recordCampaignBegun(book, campaign));
  if (!campaign) {
    queueMicrotask(() => app.go('heroes'));
    return { el: h('div') };
  }
  if (campaign.offer) return offerView(app, campaign);
  if (campaignStatus(campaign) !== CAMPAIGN_STATUS.PLAYING) return overView(app, campaign);

  const hero = heroLook(app, heroById(campaign.heroId), campaign.heroId);
  const opponentId = currentOpponent(campaign);
  const opponent = opponentById(opponentId);
  const spot = placeOf(opponentId);

  const rings = [hero.emblem, ...campaign.rings];
  const play = () => {
    campaign = saveCampaign(app, startMatch(campaign));
    app.go('match', { match: campaign.match });
  };
  const abandon = async () => {
    if (await app.overlays.confirm({ title: 'Turn back for home?', text: 'The campaign ends here. Your lives and rings will be lost.', yes: 'Turn back', danger: true })) {
      saveCampaign(app, null);
      app.go('title');
    }
  };
  /** A stop tapped: its place, and who is met there (for those not yet reached, only the place). */
  const showStop = (i) => {
    const id = campaign.opponents[i];
    const person = opponentById(id);
    const there = placeOf(id);
    const reached = i <= campaign.stage;
    app.overlays.sheet({
      title: there.name,
      body: h('div.stop-sheet',
        there.art ? h('div.stop-art', { role: 'img', 'aria-label': there.name, style: { backgroundImage: `url("${there.art}")`, backgroundPosition: `${there.x}% ${there.y}%` } }) : null,
        h('p.stop-line', there.line),
        reached
          ? h('div.power-side', crest(personInfo(person), { size: 'sm' }),
            h('div.power-list', h('div.hero-name', person.name), h('div.stop-state', i < campaign.stage ? 'Beaten' : 'Waiting for you'), ringBlock(person.emblem)))
          : h('p.pg-help', 'Who waits here? You will know when the road brings you to it.'),
        there.artist ? h('p.stop-credit', `Art: ${there.card}, by ${there.artist}`) : null),
      options: [],
      cancel: 'Close',
    });
  };
  /** Your rings, in full: what each does, and what bearing them costs. */
  const showRings = () => app.overlays.sheet({
    title: 'Your Rings of Power',
    body: h('div.cp-rings', rings.map((id) => ringBlock(id)),
      h('p.pg-help', lifeLine(campaign.rings)),
      campaign.rings.length ? h('p.pg-help', 'Every ring you take darkens the road, and draws the Eye.') : null,
      campaign.extraCommons ? h('p.pg-help', commonsLine(campaign.extraCommons)) : null),
    options: [],
    cancel: 'Close',
  });

  const map = roadMap(campaign, { hero, onStop: showStop, walkFrom });
  const el = h('div',
    header({ title: bookOf(campaign)?.name ?? 'The Road', onBack: () => app.go('title'), right: cakes(campaign.lives) }),
    map.el,
    h('button.cp-ringsbar', { type: 'button', onclick: showRings },
      h('span.cp-ringsbar-icons', rings.map((id) => powerIcon(id, 'power-sym') ?? h('span.ring-mark'))),
      h('span.cp-ringsbar-text',
        h('b', `Rings of Power · ${campaign.rings.length}/${CAMPAIGN_RULES.maxRings} taken`))),
    h('div.cta',
      h('button.btn.primary.big', { onclick: play }, campaign.match ? `Continue at ${spot.name}` : `Face ${opponent.name}`),
      h('button.btn.ghost', { onclick: abandon }, 'Turn back for home')));
  return { el, enter: map.enter, ambience: spot.ambience };
}

/**
 * After a win, the reward: the beaten opponent's ring (for a life each game), or an extra common in
 * every booster from now on.
 */
function offerView(app, campaign) {
  const opponent = opponentById(campaign.offer);
  const able = canTakeRing(campaign);
  const after = [...campaign.rings, opponent.emblem];
  const onward = placeOf(currentOpponent(campaign));
  const decide = (ring) => {
    app.sound(ring ? 'reward' : 'select');
    saveCampaign(app, ring ? takeRing(campaign) : takeCommon(campaign));
    if (ring) updateBook(app, (book) => recordRing(book, opponent.emblem));
    app.go('campaign', { walkFrom: campaign.stage - 1 });
  };
  const extra = (campaign.extraCommons ?? 0) + 1;
  const el = h('div',
    header({ title: '', right: cakes(campaign.lives) }),
    h('div.cp-body.cp-offer',
      h('div.result-title.victory', 'Victory'),
      crest(personInfo(opponent), { size: 'lg' }),
      h('p.cp-offer-lead', `${opponent.name} is beaten, and the road goes on${onward ? ` to ${onward.name}` : ''}. One thing may come with you: their Ring of Power, or a common more in every booster.`),
      ringBlock(opponent.emblem),
      h('p.pg-help', able
        ? `Take the ring, if you dare: it weighs a life each round, and the road grows darker. ${lifeLine(after)}`
        : `You already bear ${CAMPAIGN_RULES.maxRings} rings. You can bear no more.`),
      h('p.pg-help', `Or add a common: from now on ${commonsLine(extra, 'your')}`)),
    h('div.cta',
      able ? h('button.btn.primary.big', { onclick: () => decide(true) }, 'Take the ring') : null,
      h(`button.btn${able ? '' : '.primary.big'}`, { onclick: () => decide(false) }, 'Add a common to my boosters')));
  return { el, ambience: onward?.ambience };
}

/** The campaign won (where the book's boss fell, or at the Grey Havens for a road begun before books) or lost (at the place where the last life was lost). */
function overView(app, campaign) {
  const won = campaignStatus(campaign) === CAMPAIGN_STATUS.WON;
  const hero = heroLook(app, heroById(campaign.heroId), campaign.heroId);
  // The end goes in the Red Book (once): a campaign won may open the hero's second portrait.
  const before = unlocksOf(loadBook(app));
  const book = updateBook(app, (b) => recordCampaignProgress(b, campaign, { won, unlocksOf }));
  const opened = won ? unlocksOf(book).filter((name) => name === `A new portrait for ${hero.name}`) : [];
  const news = opened.filter((name) => !before.includes(name));
  const again = () => {
    saveCampaign(app, null);
    app.go('heroes');
  };
  const home = () => {
    saveCampaign(app, null);
    app.go('title');
  };
  const wins = campaign.history.filter((m) => m.outcome === 'won').length;
  const fell = placeOf(campaign.opponents[Math.min(campaign.stage, campaign.opponents.length - 1)]);
  // A book won ends where its boss was beaten; the whole road, at the Grey Havens.
  const spot = won ? (bookOf(campaign) ? placeOf(bookOf(campaign).boss) : withArt(JOURNEYS_END)) : fell;
  const el = h('div.cp-over',
    header({ title: '' }),
    h('div.cp-body.cp-offer',
      h('div.cp-over-place', spot.name),
      h(`div.result-title.${won ? 'victory' : 'defeat'}`, won ? 'Victory' : 'Defeat'),
      crest(personInfo(hero), { size: 'lg' }),
      h('p.cp-offer-lead', won && bookOf(campaign)
        ? `${hero.name} has beaten ${opponentById(bookOf(campaign).boss).name} and finished ${bookOf(campaign).name}, with ${livesLeft(campaign.lives).replace(' left', '')} to spare.`
        : won
        ? `The road ends at the Grey Havens. ${hero.name} has beaten every opponent on it, with ${livesLeft(campaign.lives).replace(' left', '')} to spare.`
        : `The last life is lost at ${fell.name}. ${hero.name} beat ${wins} of ${campaign.opponents.length} opponents on the road.`),
      news.map((name) => h('p.recap-unlock', `Unlocked: ${name}. Choose it when you next set out.`)),
      campaign.rings.length ? h('div.cp-rings', campaign.rings.map((id) => ringBlock(id))) : null,
      h('p.pg-help', `${campaign.history.length} ${campaign.history.length === 1 ? 'match' : 'matches'} played.`)),
    h('div.cta',
      h('button.btn.primary.big', { onclick: again }, 'Set out again'),
      h('button.btn.ghost', { onclick: home }, 'Back to the title')));
  if (spot?.art) {
    el.style.setProperty('--place-art', `url("${spot.art}")`);
    el.style.setProperty('--place-at', `${spot.x}% ${spot.y}%`);
  }
  return { el, enter: () => { if (won) app.theme?.(); }, ambience: spot.ambience };
}
