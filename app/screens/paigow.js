import { h, onPress, wait, reducedMotion } from '../dom.js';
import { crest } from '../art.js';
import { fullCard, cardBack, manaPips } from '../cardView.js';
import { header, personInfo } from './common.js';
import { icon } from '../icons.js';
import {
  setDecks, score, outcome, nextRound, playerStartsRound, playerLife, spreadDecks,
  decidingRound, PAIGOW_RULES, ROUND_RESULT, MATCH_OUTCOME,
} from '../../src/paigow/paigow.js';
import { paigowOpponent, paigowHero, currentHeroId, DEFAULT_HERO } from '../../src/paigow/personas.js';
import { powerBlock, ringBlock } from './heroes.js';
import { loadCampaign, saveCampaignMatch, finishCampaignMatch, cakesLeft } from './campaign.js';
import { coach } from '../coach.js';
import { placeOf } from '../../src/paigow/places.js';
import { recordBooster, recordMatchEnd, recordCampaignProgress, recap } from '../../src/paigow/book.js';
import { unlocksOf } from '../../src/paigow/unlocks.js';
import { dayLabel, shareText } from '../../src/paigow/daily.js';
import { loadBook, updateBook, saveDaily, heroLook } from '../book.js';

const RESULT_LABEL = { [ROUND_RESULT.WON]: 'Won', [ROUND_RESULT.LOST]: 'Lost', [ROUND_RESULT.DRAWN]: 'Draw' };

/**
 * Pai Gow (src/paigow/paigow.js): split 15 cards (or more, with a campaign's extra commons, leaving the
 * spare ones out) into three decks of five, then a best of three against
 * the CPU. `view`: 'build' (the decks), 'scoreboard' (between rounds) or 'final'. Every match is a campaign's
 * (see the campaign screen): it's saved after each round, and its outcome recorded in the campaign. Without a
 * `match`, the campaign's current one is shown, and with none going on, the campaign screen. `played`: the round
 * just played (0-based), whose cards the scoreboard turns over.
 */
export function paigowScreen(app, { match: given = null, view = null, played = null } = {}) {
  const match = given ?? loadCampaign(app)?.match ?? null;
  if (!match) {
    queueMicrotask(() => app.go('campaign'));
    return { el: h('div') };
  }
  const shown = view ?? (match.decks ? (outcome(match) ? 'final' : 'scoreboard') : 'build');
  const screen = shown === 'build' ? buildView(app, match) : scoreView(app, match, shown === 'final', played);
  return { ...screen, ambience: placeOf(match.opponentId)?.ambience };
}

/**
 * A card the size of a slot: tap for `onTap`, long-press (or tap, without `onTap`) to read it.
 * `full`: the printed card's whole image (when it has one), for the deck builder.
 */
function miniCard(app, cardId, { onTap = null, full = false } = {}) {
  const card = { ...app.definitions[cardId], cardId, id: cardId };
  const el = h(`button.pg-card${full ? '.full' : ''}`, { type: 'button', 'aria-label': card.name, dataset: { card: cardId } }, fullCard(card, app.definitions, { big: full }));
  const inspect = () => app.overlays.inspect(card);
  onPress(el, { onTap: onTap ?? inspect, onLong: onTap ? inspect : null });
  // A long press on a phone would otherwise open the browser's own menu.
  el.addEventListener('contextmenu', (event) => event.preventDefault());
  return el;
}

/** The match's hero, or the default for a match from before heroes. */
export const heroOf = (match) => paigowHero(match.heroId ?? DEFAULT_HERO);

/** The match's hero as they're to be shown (with their second portrait, when they wear it). */
const lookOf = (app, match) => heroLook(app, heroOf(match), currentHeroId(match.heroId ?? DEFAULT_HERO));

/** Where Back goes: the campaign, or for today's road (a match with `daily`) the title. Either way the match is saved. */
const backTo = (app, match) => app.go(match.daily ? 'title' : 'campaign');

/** The opponent, for the header: their portrait and name. Tap to read the Rings of Power. */
const opponentBadge = (app, match) => {
  const opponent = paigowOpponent(match.opponentId);
  return h('button.pg-head-opp', { type: 'button', onclick: () => showPowers(app, match) }, h('span', opponent.name), crest(personInfo(opponent), { size: 'sm' }));
};

/** Both sides' Rings of Power (planeswalker powers), on a sheet: yours are your hero's and any taken in a campaign. */
function showPowers(app, match) {
  const opponent = paigowOpponent(match.opponentId);
  const hero = lookOf(app, match);
  const side = (person, extra = []) => h('div.power-side', crest(personInfo(person), { size: 'sm' }),
    h('div.power-list', h('div.hero-name', person.name), powerBlock(person), extra.map((id) => ringBlock(id))));
  app.overlays.sheet({ title: 'Rings of Power', body: h('div.powers', side(opponent), side(hero, match.rings ?? [])), options: [], cancel: 'Close' });
}

/** A placed card, small: its art, name, mana cost and power/toughness. Tap for `onTap`, hold to read it. `picked`: chosen to move. */
function slotChip(app, cardId, { onTap, picked = false }) {
  const card = { ...app.definitions[cardId], cardId, id: cardId };
  const art = card.image?.art;
  const el = h(`button.pg-chip${picked ? '.picked' : ''}`, {
    type: 'button', 'aria-label': card.name, 'aria-pressed': picked ? 'true' : 'false', dataset: { card: cardId },
    style: art ? { backgroundImage: `url("${art}")` } : {},
  },
  manaPips(card.manaCost, 'pg-chip-cost'),
  card.types?.includes('Creature') ? h('span.pg-chip-pt', `${card.power}/${card.toughness}`) : null,
  h('span.pg-chip-name', card.name));
  onPress(el, { onTap, onLong: () => app.overlays.inspect(card) });
  el.addEventListener('contextmenu', (event) => event.preventDefault());
  return el;
}

/** How many of the booster's cards fit in a row of the deck builder's tray: pinch (or ⌘/Ctrl + wheel, or −/+) to change it. */
export const TRAY_COLUMNS = Object.freeze({ min: 1, max: 5, default: 3 });

/** The tray's columns from the settings, kept between TRAY_COLUMNS.min and .max. */
export const trayColumns = (settings) => {
  const n = Math.round(Number(settings?.trayColumns));
  return Number.isFinite(n) ? Math.min(TRAY_COLUMNS.max, Math.max(TRAY_COLUMNS.min, n)) : TRAY_COLUMNS.default;
};

/**
 * Zooming the tray: `tray`'s columns set from the settings, and changed (and saved) by a pinch, a ⌘/Ctrl + wheel (a
 * trackpad's pinch too) or the buttons. Zooming in shows fewer, bigger cards; out, more and smaller.
 * Returns the − and + buttons, and `update` to call once the tray is filled.
 */
function trayZoom(app, tray) {
  let columns = trayColumns(app.settings);
  const zoomOut = h('button.icon-btn.pg-zoom', { type: 'button', 'aria-label': 'Smaller cards: more in a row', onclick: () => set(columns + 1) }, icon('gridSmall'));
  const zoomIn = h('button.icon-btn.pg-zoom', { type: 'button', 'aria-label': 'Bigger cards: fewer in a row', onclick: () => set(columns - 1) }, icon('gridLarge'));
  const update = () => {
    tray.style.setProperty('--tray-cols', String(columns));
    tray.dataset.columns = String(columns);
    zoomOut.disabled = columns >= TRAY_COLUMNS.max;
    zoomIn.disabled = columns <= TRAY_COLUMNS.min;
  };
  const set = (next) => {
    const n = Math.min(TRAY_COLUMNS.max, Math.max(TRAY_COLUMNS.min, next));
    if (n === columns) return;
    // Keep the same part of the booster in view.
    const at = tray.scrollHeight > tray.clientHeight ? tray.scrollTop / (tray.scrollHeight - tray.clientHeight) : 0;
    columns = n;
    update();
    tray.scrollTop = at * Math.max(0, tray.scrollHeight - tray.clientHeight);
    app.updateSettings({ trayColumns: columns });
  };

  // A pinch: each time the fingers spread (or close) by a quarter of where they were, one column fewer (or more).
  const STEP = 1.25;
  let base = null;
  const spread = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  tray.addEventListener('touchstart', (event) => { if (event.touches.length === 2) base = spread(event.touches); }, { passive: true });
  tray.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 2 || !base) return;
    event.preventDefault();
    const now = spread(event.touches);
    if (now > base * STEP) { set(columns - 1); base = now; }
    else if (now < base / STEP) { set(columns + 1); base = now; }
  }, { passive: false });
  tray.addEventListener('touchend', (event) => { if (event.touches.length < 2) base = null; });
  tray.addEventListener('touchcancel', () => { base = null; });
  // Safari's own pinch gesture would zoom the page.
  for (const type of ['gesturestart', 'gesturechange']) tray.addEventListener(type, (event) => event.preventDefault());

  // ⌘/Ctrl + wheel, and a trackpad's pinch (which the browser sends as a wheel with ctrlKey).
  let wheel = 0;
  tray.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    wheel += event.deltaY;
    if (Math.abs(wheel) >= 40) { set(columns + Math.sign(wheel)); wheel = 0; }
  }, { passive: false });

  update();
  return { zoomOut, zoomIn, update };
}

/** A deck's name: deck 1 plays round 1, deck 2 round 2, deck 3 round 3. */
const deckName = (i) => `Deck ${i + 1}`;

/** The boosters already unwrapped (by match seed), so the present is opened once a match. */
const OPENED_KEY = 'istari.opened';

/**
 * The booster as a present: a foil booster pack, swaying slowly in the air as the light runs over it. A tap and it
 * rumbles, its top strip tears off and it bursts like one of Gandalf's fireworks; then the cards arrive in the tray.
 * Shown once for a match (its seed is remembered), and not at all when the system asks for less motion.
 * Built with the screen, over it, so the screen comes in already covered: nothing behind it shows until it's opened.
 * Returns `{ layer, opened }` (`opened` resolves once it's open and the last spark has fallen), or null when there's nothing to show.
 */
function present(app, match, root) {
  if (reducedMotion() || app.storage.getItem(OPENED_KEY) === String(match.seed)) return null;
  // A foil booster pack, crimped top and bottom; the top strip is torn off to open it.
  const crimp = (side) => h(`div.pack-crimp.${side}`);
  const lid = crimp('top');
  const box = h('div.pack', lid,
    h('div.pack-body',
      h('div.pack-art', h('span.pack-star', '✦')),
      h('div.pack-title', 'Istari'),
      h('div.pack-sub', 'Booster')),
    crimp('bottom'));
  const stage = h('div.present-stage', box);
  const hint = h('div.present-hint', 'Tap to open');
  const sky = h('canvas.present-sky', { 'aria-hidden': 'true' });
  const layer = h('button.present', { type: 'button', 'aria-label': 'Open your booster' }, stage, hint, sky);
  root.append(layer);
  stage.animate([{ transform: 'translateY(40px) scale(.75)' }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.3)' });

  const opened = new Promise((resolve) => {
    layer.addEventListener('click', async () => {
      app.storage.setItem(OPENED_KEY, String(match.seed));
      layer.disabled = true;
      app.sound('select');
      const fade = { opacity: 0, transform: 'translateY(-10px)' };
      hint.animate([{}, fade], { duration: 200, fill: 'forwards' });
      // It rumbles, brighter and brighter, as the magic inside gets out of hand.
      box.classList.add('stirring');
      await stage.animate([
        { transform: 'none' }, { transform: 'translate(-3px, 1px) rotate(-2deg)' }, { transform: 'translate(3px, -2px) rotate(2deg) scale(1.03)' },
        { transform: 'translate(-5px, 0) rotate(-4deg) scale(1.05)' }, { transform: 'translate(5px, -3px) rotate(4deg) scale(1.08)' },
        { transform: 'translate(-6px, 2px) rotate(-5deg) scale(1.1)' }, { transform: 'translateY(6px) scale(1.14, .92)' },
      ], { duration: 650, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      app.sound('reward');
      // Bang: the top strip tears off, the pack is gone in a flash, and the sky fills with sparks.
      const rect = layer.getBoundingClientRect();
      const at = box.getBoundingClientRect();
      const fireworks = fireworksIn(sky, rect);
      fireworks.burst(at.left + at.width / 2 - rect.left, at.top + at.height / 2 - rect.top, { count: 140, power: 1.25 });
      lid.animate([{}, { transform: 'translate(140px, -220px) rotate(38deg)', opacity: 0 }],
        { duration: 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
      stage.animate([{ transform: 'translateY(6px) scale(1.14, .92)', opacity: 1, filter: 'brightness(1)' },
        { transform: 'scale(1.45)', opacity: 0, filter: 'brightness(3)' }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
      layer.classList.add('flash');
      // More rockets go up around it, one after another.
      const shots = [[0.22, 0.24], [0.78, 0.2], [0.5, 0.12], [0.3, 0.42], [0.72, 0.4]];
      shots.forEach(([x, y], i) => setTimeout(() => fireworks.rocket(rect.width * x, rect.height * y), 160 + i * 150));
      await wait(700);
      // The night clears to the decks, the last sparks still falling over them, and the cards arrive in the tray.
      layer.style.pointerEvents = 'none';
      layer.classList.add('clearing');
      [...root.querySelectorAll('.pg-tray .pg-card')].forEach((card, i) => {
        card.animate([{ opacity: 0, transform: 'translateY(-40px) scale(.7) rotate(-6deg)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 150 + i * 45, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
      });
      await fireworks.done;
      layer.remove();
      resolve();
    }, { once: true });
  });
  return { layer, opened };
}

/** Gandalf's colours: gold, green, red, blue, violet and white. */
const SPARK_COLORS = ['#ffd36b', '#fff1c2', '#7dffa7', '#ff6b5a', '#7ab8ff', '#d79bff', '#ffffff'];

/**
 * Fireworks on a canvas laid over `rect`: `burst(x, y)` throws a ring of sparks out from a point (with crackling
 * glitter as they fall), and `rocket(x, y)` sends one up from the bottom to burst there. `done` resolves once the sky is dark again.
 */
function fireworksIn(canvas, rect) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  const sparks = [];
  const rockets = [];
  let pending = 0;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const burst = (x, y, { count = 80, power = 1 } = {}) => {
    const colors = [pick(SPARK_COLORS), pick(SPARK_COLORS), '#fff1c2'];
    const ring = Math.random() < 0.5;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
      const speed = (ring ? 0.85 + Math.random() * 0.15 : 0.25 + Math.random() * 0.75) * 7.5 * power;
      sparks.push({
        x, y, px: x, py: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, decay: 0.012 + Math.random() * 0.014, color: pick(colors), size: 1.4 + Math.random() * 1.6,
        glitter: Math.random() < 0.35,
      });
    }
  };
  const rocket = (x, y) => {
    pending += 1;
    const from = { x: x + (Math.random() - 0.5) * 60, y: rect.height + 10 };
    rockets.push({ x: from.x, y: from.y, tx: x, ty: y, t: 0, sx: from.x, sy: from.y });
  };

  let last = performance.now();
  const frame = (now) => {
    const step = Math.min((now - last) / 16.7, 3);
    last = now;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
      const r = rockets[i];
      r.t = Math.min(1, r.t + 0.045 * step);
      const ease = 1 - (1 - r.t) ** 2;
      const px = r.x;
      const py = r.y;
      r.x = r.sx + (r.tx - r.sx) * ease;
      r.y = r.sy + (r.ty - r.sy) * ease;
      ctx.strokeStyle = 'rgba(255, 230, 170, .9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py + 14);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      if (r.t >= 1) {
        rockets.splice(i, 1);
        pending -= 1;
        burst(r.x, r.y, { count: 60 + Math.floor(Math.random() * 40) });
      }
    }
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.px = s.x;
      s.py = s.y;
      s.vx *= 0.955 ** step;
      s.vy = s.vy * 0.955 ** step + 0.07 * step;
      s.x += s.vx * step;
      s.y += s.vy * step;
      s.life -= s.decay * step;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      // Glittering sparks twinkle as they fade.
      const alpha = s.glitter && s.life < 0.6 ? (Math.random() < 0.5 ? s.life : 0.1) : s.life;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.px - s.vx * 1.5, s.py - s.vy * 1.5);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (sparks.length || rockets.length || pending) requestAnimationFrame(frame);
    else finish();
  };
  requestAnimationFrame(frame);
  return { burst, rocket, done };
}

function buildView(app, match) {
  const { decks: count, deckSize } = PAIGOW_RULES;
  // The booster's cards go in the Red Book (once for a match).
  updateBook(app, (book) => recordBooster(book, match));
  saveDaily(app, match);
  /** Each card's deck (0–2), by its place in `match.cards` (a booster can hold two of a card), or none while it's in the tray. */
  let placed = new Map();
  let selected = 0;
  /** A placed card chosen to move (its place in `match.cards`), or null. */
  let picked = null;
  const indexes = match.cards.map((_, n) => n);
  const deckIds = [...Array(count).keys()];

  /** Where each placed card sits in its deck: a card keeps its spot, a new one goes at the end, and a swap trades spots. */
  let slot = new Map();
  let nextSlot = 0;
  const deckOf = (i) => indexes.filter((n) => placed.get(n) === i).sort((a, b) => slot.get(a) - slot.get(b));
  const free = (i) => deckOf(i).length < deckSize;
  const board = h('div.pg-board');
  const tray = h('div.pg-tray');
  const trayTitle = h('h4');
  const zoom = trayZoom(app, tray);
  const start = h('button.btn.primary.pg-start', { onclick: () => play() });
  const autoFill = h('button.btn', { onclick: () => fill() }, 'Auto-fill');
  const clear = h('button.btn.ghost.small.pg-clear', { onclick: () => change(() => { placed = new Map(); selected = 0; }) }, 'Clear');

  /** Makes a change to the decks, dropping any card picked up to move. */
  const change = (make) => {
    picked = null;
    make();
    for (const n of [...slot.keys()]) if (!placed.has(n)) slot.delete(n);
    for (const n of placed.keys()) if (!slot.has(n)) slot.set(n, nextSlot++);
    render();
  };
  const place = (n) => {
    const target = free(selected) ? selected : deckIds.find(free);
    if (target === undefined) return;
    app.sound('select');
    change(() => {
      placed.set(n, target);
      // Keep filling the same deck until it's full, then move on to the next one with room.
      if (!free(target)) selected = deckIds.find(free) ?? target;
    });
  };
  /** A placed card tapped: pick it up to move; with one picked up already, swap the two; tapped again, back to the booster. */
  const tapPlaced = (n) => {
    if (picked === n) {
      change(() => { selected = placed.get(n); placed.delete(n); });
    } else if (picked !== null && placed.get(picked) !== placed.get(n)) {
      const other = picked;
      app.sound('select');
      change(() => {
        const deck = placed.get(n);
        placed.set(n, placed.get(other));
        placed.set(other, deck);
        const spot = slot.get(n);
        slot.set(n, slot.get(other));
        slot.set(other, spot);
      });
    } else {
      picked = n;
      app.sound('tap');
      render();
    }
  };
  /** A deck tapped: the picked card moves there (when there's room), and it becomes the deck that tapped cards go to. */
  const tapDeck = (i) => {
    if (picked !== null && placed.get(picked) !== i && free(i)) {
      const n = picked;
      app.sound('select');
      change(() => { placed.set(n, i); slot.set(n, nextSlot++); selected = i; });
      return;
    }
    picked = null;
    selected = i;
    render();
  };
  const fill = () => {
    // With more cards than the decks hold, the strongest go in first; the decks come out about even.
    app.sound('select');
    change(() => { placed = spreadDecks(match.cards, placed); });
  };
  const play = async () => {
    const decks = deckIds.map((i) => deckOf(i).map((n) => match.cards[n]));
    const ready = setDecks(match, decks);
    saveCampaignMatch(app, ready);
    saveDaily(app, ready);
    start.disabled = true;
    await part();
    app.go('battle', { match: ready });
  };
  /** The Fellowship divides: the three decks go their ways, under a banner that says so. */
  const part = async () => {
    if (reducedMotion()) return;
    const speed = app.settings.speed;
    const banner = h('div.pg-parting', h('span', 'The Fellowship divides'));
    el.append(banner);
    app.sound('turn');
    const ways = [{ x: -70, r: -9 }, { x: 0, r: 0 }, { x: 70, r: 9 }];
    [...board.children].forEach((col, i) => {
      const way = ways[i] ?? ways[1];
      col.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${way.x}px, -46px) rotate(${way.r}deg)`, opacity: 0 }],
        { duration: 700 * speed + 200, delay: 250 * speed, easing: 'cubic-bezier(.5, 0, .8, .4)', fill: 'forwards' });
    });
    banner.animate([{ opacity: 0, transform: 'scale(1.3)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
    await wait(950 * speed + 250);
  };

  const render = () => {
    // The three decks side by side, the selected one (where a tapped card goes) highlighted.
    board.replaceChildren(...deckIds.map((i) => {
      const cards = deckOf(i);
      return h('div.pg-col', { class: i === selected ? 'selected' : '', onclick: (event) => {
        if (event.target.closest('.pg-chip:not(.empty)')) return;
        tapDeck(i);
      } },
      h('div.pg-col-label', { 'aria-label': `${deckName(i)}, round ${i + 1}, ${cards.length} of ${deckSize}` }, h('b', deckName(i)), h('span', `${cards.length}/${deckSize}`)),
      ...cards.map((n) => slotChip(app, match.cards[n], { onTap: () => tapPlaced(n), picked: n === picked })),
      ...Array.from({ length: deckSize - cards.length }, () => h('div.pg-chip.empty')));
    }));
    const left = indexes.filter((n) => !placed.has(n));
    const toPlace = count * deckSize - placed.size;
    const full = toPlace === 0;
    trayTitle.textContent = full
      ? (left.length ? `All decks full · ${left.length} left out` : 'All cards placed')
      : `Your booster · ${left.length} left${left.length > toPlace ? ` · ${toPlace} to place` : ''}`;
    tray.replaceChildren(...(left.length
      ? left.map((n) => miniCard(app, match.cards[n], { onTap: () => place(n), full: true }))
      : [h('p.pg-tray-empty', `Your decks are ready. Deck 1 plays round 1, deck 2 round 2, deck 3 round 3. Your opponent's ${count} decks are set the same way, unseen. Win two rounds to take the match.`)]));
    start.textContent = full ? 'Start match' : `Place ${toPlace} more`;
    start.disabled = !full;
    autoFill.disabled = full;
    clear.hidden = placed.size === 0;
  };
  render();

  const el = h('div',
    header({ title: 'Build your decks', onBack: () => backTo(app, match), right: opponentBadge(app, match) }),
    h('div.pg-builder', board, h('section.pg-tray-wrap', h('div.pg-tray-head', trayTitle, h('div.pg-zooms', clear, zoom.zoomOut, zoom.zoomIn)), tray)),
    h('div.cta.pg-build-cta', h('div.row', autoFill, start)));
  // The booster, still wrapped, covers the screen from the start.
  const parcel = present(app, match, el);
  return {
    el,
    enter: async () => {
      if (parcel) await parcel.opened;
      if (!el.isConnected) return;
      coach(app, 'builder', [
        { target: '.pg-tray .pg-card', text: 'This is your booster. Tap a card to put it in the highlighted deck. Hold a card to read it.' },
        { target: '.pg-board', text: 'Three decks of five, one for each round: deck 1 plays round 1, deck 2 round 2, deck 3 round 3. Your opponent splits theirs the same way, and you don\'t see how. Tap a deck to fill that one.' },
        { target: '.pg-head-opp', text: 'Who you\'re facing. Tap to read both sides\' Rings of Power before you split your cards.' },
      ], { root: el, stillValid: () => el.isConnected });
    },
  };
}

function scoreView(app, match, final, justPlayed = null) {
  const { won, lost, drawn } = score(match);
  const round = nextRound(match);
  const result = outcome(match);
  const opponent = paigowOpponent(match.opponentId);
  const hero = lookOf(app, match);
  const life = playerLife(match);
  // Saved as it goes, and its outcome counted once it's over: in the campaign (unless it's today's road), and in the Red Book.
  // The book first catches up with the campaign as it was (loadBook), so this match isn't counted from its history too.
  loadBook(app);
  const campaign = match.daily ? null : final ? finishCampaignMatch(app, match, result) : (saveCampaignMatch(app, match), null);
  saveDaily(app, match, final ? result : null);
  const book = final ? updateBook(app, (b) => {
    const ended = recordMatchEnd(b, match, result, { unlocksOf });
    return campaign ? recordCampaignProgress(ended, campaign) : ended;
  }) : null;
  // Coming from a round: its cards are turned over one by one, then (at the match's end) those of any round not played.
  const turning = justPlayed !== null && !reducedMotion();
  const turns = (i) => turning && (i === justPlayed || (final && !match.rounds[i]));
  /** The rows to turn over, in order: `{ slots: [{ el, cardId }], status, label }`. */
  const toTurn = [];

  const roundRows = h('div.pg-rounds', match.decks.map((deck, i) => {
    const played = match.rounds[i];
    const revealed = played || final;
    const label = played ? RESULT_LABEL[played.result] : i === round ? 'Next' : final ? 'Not played' : '—';
    const status = h('span.pg-status', turns(i) && played ? '' : label);
    const theirs = match.cpuDecks[i].map((id) => {
      if (!revealed || turns(i)) return { el: h('div.pg-card.back', cardBack()), cardId: id };
      return { el: miniCard(app, id), cardId: id };
    });
    if (turns(i)) toTurn.push({ slots: theirs, status, label, played: Boolean(played) });
    return h('div.pg-round', { class: played ? `r-${played.result}` : i === round ? 'r-next' : 'r-later' },
      h('div.pg-round-head', h('span', `${deckName(i)} · Round ${i + 1}`), status),
      h('div.pg-match',
        h('div.pg-side', deck.map((id) => miniCard(app, id))),
        h('span.pg-vs', 'vs'),
        h('div.pg-side', theirs.map((slot) => slot.el))));
  }));

  const title = final
    ? h(`div.result-title.${{ [MATCH_OUTCOME.WON]: 'victory', [MATCH_OUTCOME.LOST]: 'defeat' }[result] ?? 'tie'}`,
      { [MATCH_OUTCOME.WON]: 'Victory', [MATCH_OUTCOME.LOST]: 'Defeat' }[result] ?? 'Tie')
    : null;
  const leave = () => backTo(app, match);
  const el = h('div',
    header({ title: match.daily ? `Today's road · ${dayLabel(match.daily)}` : '', onBack: leave }),
    h('div.pg-body',
      title,
      h('div.pg-score',
        h('button.pg-score-side', { type: 'button', onclick: () => showPowers(app, match) }, crest(personInfo(hero), { size: 'sm' }), h('span', hero.name)),
        h('div.pg-score-num', `${won} – ${lost}`, drawn ? h('small', `${drawn} ${drawn === 1 ? 'draw' : 'draws'}`) : null),
        h('button.pg-score-side', { type: 'button', onclick: () => showPowers(app, match) }, crest(personInfo(opponent), { size: 'sm' }), h('span', opponent.name))),
      round !== null ? h('p.pg-help', playerStartsRound(match, round)
        ? `You go first, on ${life.first} life; ${opponent.name} starts on ${PAIGOW_RULES.secondPlayerLife}.`
        : `${opponent.name} goes first, on ${PAIGOW_RULES.startingLife} life; you start on ${life.second}.`) : null,
      final && campaign ? h('p.pg-help', campaignNote(result, campaign)) : null,
      final && match.daily ? h('p.pg-help', 'One road a day. A new one tomorrow.') : null,
      book ? recapBlock(match, recap(book, match), opponent) : null,
      roundRows),
    h('div.cta', final && match.daily
      ? [h('button.btn.primary.big', { onclick: (event) => share(app, shareText(match), event.currentTarget) }, 'Share'),
        h('button.btn.ghost', { onclick: () => app.go('title') }, 'Back to the title')]
      : final
      ? h('button.btn.primary.big', { onclick: () => app.go('campaign') }, 'Continue')
      : h('button.btn.primary.big', { onclick: () => app.go('battle', { match }) }, `Play round ${round + 1}`)));

  /** Turns a card over: the back closes edge-on, the face opens. */
  const turnOver = async (slot) => {
    const face = miniCard(app, slot.cardId);
    await slot.el.animate([{ transform: 'none' }, { transform: 'rotateY(90deg)' }], { duration: 110, easing: 'ease-in' }).finished.catch(() => {});
    if (!slot.el.isConnected) return;
    slot.el.replaceWith(face);
    app.sound('draw');
    face.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'none' }], { duration: 130, easing: 'ease-out' });
  };
  return {
    el,
    async enter() {
      el.querySelector('.result-title')?.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      for (const row of toTurn) {
        await wait(260);
        for (const slot of row.slots) {
          if (!el.isConnected) return;
          await turnOver(slot);
        }
        // The result, stamped on once the cards are up.
        if (row.played) {
          row.status.textContent = row.label;
          row.status.animate([{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
          app.sound('select');
        }
      }
    },
  };
}

/**
 * The tale of a finished match: the round that decided it, the hardest blow, what was dealt and taken, and what it
 * added to the Red Book (new cards, a first win, anything unlocked).
 */
function recapBlock(match, { stats, newCards, firstWin, unlocks }, opponent) {
  const decided = decidingRound(match);
  const fought = stats.dealt + stats.taken + stats.felled + stats.lost > 0;
  const lines = [
    decided !== null ? `Decided in round ${decided + 1}.` : null,
    stats.blow ? `Hardest blow: ${stats.blow.name}, for ${stats.blow.amount}.` : null,
    fought ? `Damage dealt ${stats.dealt}, taken ${stats.taken}.` : null,
    fought ? `Creatures felled ${stats.felled}, lost ${stats.lost}.` : null,
    newCards ? `${newCards} new ${newCards === 1 ? 'card' : 'cards'} for the Red Book.` : null,
    firstWin ? `Your first win against ${opponent.name}.` : null,
  ].filter(Boolean);
  if (!lines.length && !unlocks.length) return null;
  return h('section.recap', h('h4', 'The tale of the match'),
    h('ul', lines.map((line) => h('li', line))),
    unlocks.map((name) => h('p.recap-unlock', `Unlocked: ${name}`)));
}

/** Shares a line of text: the system's share sheet where there is one, otherwise the clipboard. `button` says what happened. */
async function share(app, text, button) {
  const say = (label) => {
    const was = 'Share';
    button.textContent = label;
    setTimeout(() => { if (button.isConnected) button.textContent = was; }, 1800);
  };
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    say('Copied');
  } catch (error) {
    // Closing the share sheet isn't a failure; anything else, show the text to copy by hand.
    if (error?.name === 'AbortError') return;
    app.overlays.sheet({ title: 'Share', text, options: [], cancel: 'Close' });
  }
}

/** What a campaign match's outcome meant for the campaign. */
function campaignNote(result, campaign) {
  if (result === MATCH_OUTCOME.LOST) {
    return campaign.lives > 0 ? `That costs a seed-cake: ${cakesLeft(campaign.lives)}. Try again.` : 'That was your last seed-cake.';
  }
  if (result === MATCH_OUTCOME.TIE) return 'A tie costs no seed-cake, but you must face them again.';
  return 'The road goes on.';
}
