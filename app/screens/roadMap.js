/**
 * The campaign's road, as a map: Bag End at the foot, Barad-dûr at the head, a winding dotted road between,
 * and a stop for each opponent at the place they're met (src/match/places.js). Beaten stops are marked, the next
 * one is the biggest and shows who waits there, and those ahead show the place but not the opponent. Your hero
 * stands at the next stop. The more Rings of Power you bear, the darker the map (`burden`, 0 to 4: app.css, "road map").
 */
import { h, reducedMotion } from '../dom.js';
import { crest } from '../art.js';
import { icon } from '../icons.js';
import { personInfo } from './common.js';
import { placeOf } from '../../src/match/places.js';
import { opponentById } from '../../src/match/personas.js';

/** The road's shape: how far apart the stops are (px), and how far it swings to each side (percent of the width). */
const STEP = 118;
const FOOT = 104;
const HEAD = 120;
const SWING = 24;

/** Where stop `i` is: `x` in percent of the map's width, `y` in px up from its foot. */
export const stopAt = (i) => ({ x: 50 + SWING * Math.sin(i * 1.9 + 0.6), y: FOOT + i * STEP });

/** How tall a map of `count` stops is, in px. */
export const mapHeight = (count) => FOOT + Math.max(0, count - 1) * STEP + HEAD;

/** The road through the stops, as an SVG path in a box 100 wide and `height` tall: a smooth curve from each to the next. */
function roadPath(count, height) {
  const points = Array.from({ length: count }, (_, i) => stopAt(i)).map(({ x, y }) => ({ x, y: height - y }));
  return points.map((p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const before = points[i - 1];
    const mid = (before.y + p.y) / 2;
    return `C${before.x} ${mid} ${p.x} ${mid} ${p.x} ${p.y}`;
  }).join(' ');
}

/**
 * The map for `campaign`. `hero`: the player's character, for the marker. `onStop(i)`: a stop was tapped.
 * `walkFrom`: the stop the hero has just left (after a win), to walk from. Returns `{ el, enter }`: call `enter`
 * once it's on screen, to bring the next stop into view and start the walk.
 */
export function roadMap(campaign, { hero, onStop, walkFrom = null }) {
  const count = campaign.opponents.length;
  const height = mapHeight(count);
  const stage = Math.min(campaign.stage, count - 1);
  const over = campaign.stage >= count;
  const burden = Math.min(4, campaign.rings.length);

  const stops = campaign.opponents.map((id, i) => {
    const spot = placeOf(id);
    const person = opponentById(id);
    const state = i < campaign.stage ? 'beaten' : i === campaign.stage ? 'next' : 'later';
    // A book ends with its boss: the last stop on the road.
    const boss = Number.isInteger(campaign.book) && i === count - 1;
    const { x, y } = stopAt(i);
    const losses = campaign.history.filter((m) => m.opponentId === id && m.outcome === 'lost').length;
    const who = state === 'later' ? 'Who waits here?' : person.name;
    return h(`button.rm-stop.${state}.${x < 50 ? 'left' : 'right'}${boss ? '.boss' : ''}`, {
      type: 'button',
      style: { left: `${x}%`, bottom: `${y}px` },
      'aria-label': `${i + 1}. ${spot.name}: ${state === 'later' ? 'not reached' : `${person.name}, ${state === 'beaten' ? 'beaten' : 'next'}`}`,
      onclick: () => onStop(i),
    },
    h('span.rm-vignette', { style: spot.art ? { backgroundImage: `url("${spot.art}")`, backgroundPosition: `${spot.x}% ${spot.y}%` } : {} },
      state === 'beaten' ? h('span.rm-mark', icon('check')) : null),
    state === 'next' ? h('span.rm-face', crest(personInfo(person), { size: 'sm' })) : null,
    h('span.rm-label',
      boss ? h('span.rm-boss', 'Boss') : null,
      h('span.rm-place', spot.name),
      h('span.rm-who', who),
      state === 'next' && campaign.match ? h('span.rm-note', 'Match in progress') : null,
      losses ? h('span.rm-note.lost', `${losses} ${losses === 1 ? 'loss' : 'losses'}`) : null));
  });

  const at = stopAt(stage);
  const marker = over ? null : h('div.rm-hero', { style: { left: `${at.x}%`, bottom: `${at.y}px` }, 'aria-hidden': 'true' }, crest(personInfo(hero), { size: 'sm' }));
  const road = h('div.rm-road', { html: `<svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">`
    + `<path class="rm-road-edge" d="${roadPath(count, height)}"/><path class="rm-road-line" d="${roadPath(count, height)}"/>`
    // The part already walked.
    + `<path class="rm-road-done" d="${roadPath(Math.min(count, campaign.stage + 1), height)}"/></svg>` });
  const inner = h('div.rm-inner', { style: { height: `${height}px` } },
    road,
    h('div.rm-region.rm-region-head', 'Mordor'),
    h('div.rm-region.rm-region-foot', 'The Shire'),
    // The Eye over the Dark Tower: wider open with every ring you bear.
    h('div.rm-eye', { 'aria-hidden': 'true' }, icon('eye')),
    stops, marker);
  const el = h(`div.rm.burden-${burden}`, { dataset: { burden: String(burden) } }, inner);

  const enter = () => {
    // The next stop a little below the middle, so the road ahead shows.
    el.scrollTop = Math.max(0, height - at.y - el.clientHeight * 0.58);
    if (!marker || walkFrom === null || walkFrom === stage || reducedMotion()) return;
    const from = stopAt(walkFrom);
    const dx = ((from.x - at.x) / 100) * inner.clientWidth;
    const dy = at.y - from.y;
    marker.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 1400, delay: 350, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'backwards' });
  };
  return { el, enter };
}
