/**
 * The campaign simulator: the Strategist plays your side through whole campaigns of Book I, against the
 * opponents as they ship (each its own Strategist persona), to see how hard the road is. It keeps every rule of
 * src/match/campaign.js: three lives, a lost match costs one and is played again with a new booster, a tie is
 * played again for free, and a beaten opponent offers their ring or an extra common.
 *
 *   node tools/campaign-sim.js [--heroes frodo,strider,samwise] [--campaigns 20] [--from 1] [--jobs 4]
 *     [--rewards common|ring|smart|split] [--budget 100] [--every 50] [--verbose]
 *
 * `--rewards`: what your side takes after a win: always the extra common (the default), always the ring
 * (while there's room), `smart`: the ring while it costs at most one life (one ring), then commons, or `split`:
 * ring and common in turn, starting with the ring.
 * `--budget`: thinking time per decision (ms) for both sides; by default each side's profile decides (100 to 150 ms).
 * Your side builds its decks with buildDecks (src/match/deckBuilder.js), as the CPU does, playing as the hero's temperament.
 *
 * It reports, for each hero, how many campaigns were won (with a 95% interval), lives left when won, where the
 * lost ones fell, and each opponent's record: matches and rounds won against them. `--every`: also print the report so far
 * after every that many campaigns (default 50), so a long run shows its results even if it's cut short.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game, GAME_STATUS } from '../src/engine/Game.js';
import { seededRandom } from '../src/engine/random.js';
import {
  roundSetup, setDecks, recordRound, outcome, PLAYER_ID, CPU_ID, ROUND_RESULT, MATCH_OUTCOME,
} from '../src/match/match.js';
import {
  createCampaign, startMatch, recordMatch, campaignStatus, takeRing, takeCommon, canTakeRing, CAMPAIGN_STATUS,
} from '../src/match/campaign.js';
import { OPPONENTS } from '../src/match/personas.js';
import { buildDecks, deckPlan } from '../src/match/deckBuilder.js';
import { actingPlayerId } from '../src/ai/simulate.js';
import { strategistPolicy } from '../src/ai/strategist/policy.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((part) => {
  const [key, ...value] = part.trim().split(/\s+/);
  return [key, value.join(' ') || true];
}));

/** A safety net, far past any round's length (rounds end by the turn limit long before). */
const MAX_STEPS = 20000;
/** A safety net on a campaign's matches: three lives, but ties cost none. */
const MAX_MATCHES = 40;

/** One round of `match`: the Strategist on both sides. Returns `ROUND_RESULT` from your side, and the turns it took. */
function playRound(match, { seed, budget }) {
  const setup = roundSetup(match);
  const round = setup.encounter.round;
  const game = new Game({ ...setup.game, silent: true });
  game.start();
  const extra = budget ? { budgetMs: budget } : {};
  const policies = {
    [PLAYER_ID]: strategistPolicy(PLAYER_ID, { persona: match.heroId, plan: deckPlan(match.decks[round]), seed: seed * 2 + 1, ...extra }),
    [CPU_ID]: strategistPolicy(CPU_ID, { persona: setup.cpu.ai.persona, plan: setup.cpu.ai.plan, seed: seed * 2 + 2, ...extra }),
  };
  for (let step = 0; step < MAX_STEPS; step++) {
    const state = game.peekState();
    if (state.status !== GAME_STATUS.IN_PROGRESS) break;
    const actor = actingPlayerId(state);
    const action = policies[actor](state, game) ?? state.validActions.find((a) => a.playerId === actor);
    game.applyTrusted(action);
  }
  const end = game.peekState();
  const result = end.status === GAME_STATUS.GAME_OVER && end.winnerId
    ? (end.winnerId === PLAYER_ID ? ROUND_RESULT.WON : ROUND_RESULT.LOST)
    : ROUND_RESULT.DRAWN;
  return { result, turns: end.turn };
}

/** Your side's decks for a match, as buildDecks makes them (keeping a locked first deck, Tom Bombadil's ring). */
function chooseDecks(match, seed) {
  const locked = match.lockedDeck ? match.lockedDeck.map((n) => match.cards[n]) : null;
  return buildDecks(match.cards, seededRandom(seed), { persona: match.heroId, locked });
}

/** The reward after a win, by the `rewards` rule. */
function chooseReward(campaign, rewards) {
  const taken = campaign.history.filter((h) => h.outcome === MATCH_OUTCOME.WON).length - 1;
  const ring = rewards === 'ring' || (rewards === 'smart' && campaign.rings.length < 1) || (rewards === 'split' && taken % 2 === 0);
  return ring && canTakeRing(campaign) ? takeRing(campaign) : takeCommon(campaign);
}

/** A whole campaign for `heroId`. Returns what happened: the status, the lives left, and every match and round. */
function playCampaign(heroId, seed, { rewards, budget }) {
  let campaign = createCampaign({ heroId, seed });
  const matches = [];
  for (let m = 0; m < MAX_MATCHES && campaignStatus(campaign) === CAMPAIGN_STATUS.PLAYING; m++) {
    if (campaign.offer) campaign = chooseReward(campaign, rewards);
    campaign = startMatch(campaign);
    let match = setDecks(campaign.match, chooseDecks(campaign.match, (seed * 977 + m) >>> 0));
    const rounds = [];
    while (outcome(match) === null) {
      const { result, turns } = playRound(match, { seed: (seed * 7919 + m * 31 + match.rounds.length) >>> 0, budget });
      rounds.push({ result, turns });
      match = recordRound(match, result);
    }
    const result = outcome(match);
    matches.push({ opponentId: match.opponentId, outcome: result, rounds, rings: campaign.rings.length, lives: campaign.lives });
    campaign = recordMatch(campaign, result, match);
  }
  return { heroId, seed, status: campaignStatus(campaign), lives: campaign.lives, road: campaign.opponents, matches };
}

if (args.worker) {
  process.on('message', ({ heroId, seed, options }) => {
    try {
      process.send({ result: playCampaign(heroId, seed, options) });
    } catch (error) {
      process.send({ error: `${heroId} ${seed}: ${error?.stack ?? error}` });
    }
  });
} else {
  const heroes = String(args.heroes ?? 'frodo,strider,samwise').split(',');
  const count = Number(args.campaigns ?? 20);
  const from = Number(args.from ?? 1);
  const options = { rewards: args.rewards ?? 'common', budget: args.budget ? Number(args.budget) : undefined };
  // Heroes in turn, so a report part way through has them all alike.
  const tasks = Array.from({ length: count }, (_, i) => heroes.map((heroId) => ({ heroId, seed: from + i }))).flat();
  const jobs = Math.min(Number(args.jobs ?? 4), tasks.length);
  const started = performance.now();
  const results = [];
  const errors = [];
  await new Promise((resolve) => {
    let next = 0;
    let running = 0;
    for (let j = 0; j < jobs; j++) {
      const child = fork(fileURLToPath(import.meta.url), ['--worker']);
      const give = () => {
        if (next >= tasks.length) {
          child.kill();
          if (running === 0) resolve();
          return;
        }
        running += 1;
        child.send({ ...tasks[next++], options });
      };
      child.on('message', (message) => {
        running -= 1;
        if (message.error) errors.push(message.error);
        else {
          results.push(message.result);
          if (args.verbose) {
            const r = message.result;
            console.log(`${r.heroId} #${r.seed}: ${r.status}, ${r.lives} lives left; ${r.matches.map((x) => `${x.opponentId} ${x.outcome[0].toUpperCase()}`).join(', ')}`);
          }
        }
        const every = Number(args.every ?? 50);
        if (every > 0 && results.length % every === 0 && results.length < tasks.length) {
          console.log(`\n--- so far: ${results.length} of ${tasks.length} ---`);
          report(heroes, options, results, errors, (performance.now() - started) / 1000);
        }
        give();
      });
      give();
    }
  });
  report(heroes, options, results, errors, (performance.now() - started) / 1000);
}

function report(heroes, options, results, errors, seconds) {
  const pct = (x) => `${(100 * x).toFixed(0)}%`;
  const interval = (k, n) => {
    // Wilson 95% interval.
    if (!n) return '';
    const z = 1.96;
    const p = k / n;
    const centre = (p + z * z / (2 * n)) / (1 + z * z / n);
    const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n);
    return `${pct(Math.max(0, centre - half))}–${pct(Math.min(1, centre + half))}`;
  };
  console.log(`\nBook I, ${results.length} campaigns in ${seconds.toFixed(0)} s (rewards: ${options.rewards}${options.budget ? `, budget ${options.budget} ms` : ''})`);
  const groups = [...heroes.map((h) => [h, results.filter((r) => r.heroId === h)]), ['all', results]];
  for (const [hero, list] of groups) {
    if (!list.length) continue;
    const won = list.filter((r) => r.status === CAMPAIGN_STATUS.WON);
    const lost = list.filter((r) => r.status === CAMPAIGN_STATUS.LOST);
    const livesLeft = won.reduce((s, r) => s + r.lives, 0) / Math.max(1, won.length);
    const flawless = won.filter((r) => r.lives === 3).length;
    const reachedBoss = list.filter((r) => r.matches.some((m) => m.opponentId === 'ringwraiths')).length;
    console.log(`\n${hero}: won ${won.length} of ${list.length} (${pct(won.length / list.length)}, 95% ${interval(won.length, list.length)})`);
    console.log(`  reached the Ringwraiths ${reachedBoss}; won with ${livesLeft.toFixed(1)} lives left on average, ${flawless} without losing one`);
    if (lost.length) {
      const fell = {};
      for (const r of lost) {
        const last = r.matches.at(-1).opponentId;
        fell[last] = (fell[last] ?? 0) + 1;
      }
      console.log(`  lost ones fell to: ${Object.entries(fell).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${OPPONENTS[id].name} ${n}`).join(', ')}`);
    }
  }
  console.log('\nOpponents (all heroes): matches won / played, rounds won / played');
  const by = {};
  for (const r of results) {
    for (const m of r.matches) {
      const o = (by[m.opponentId] ??= { won: 0, played: 0, tie: 0, rw: 0, rp: 0, rd: 0, turns: 0 });
      o.played += 1;
      if (m.outcome === MATCH_OUTCOME.WON) o.won += 1;
      if (m.outcome === MATCH_OUTCOME.TIE) o.tie += 1;
      for (const round of m.rounds) {
        o.rp += 1;
        o.turns += round.turns;
        if (round.result === ROUND_RESULT.WON) o.rw += 1;
        if (round.result === ROUND_RESULT.DRAWN) o.rd += 1;
      }
    }
  }
  const rows = Object.entries(by).sort((a, b) => a[1].won / a[1].played - b[1].won / b[1].played);
  for (const [id, o] of rows) {
    console.log(`  ${OPPONENTS[id].name.padEnd(26)} matches ${pct(o.won / o.played).padStart(4)} (${o.won}/${o.played}${o.tie ? `, ${o.tie} tied` : ''})   rounds ${pct(o.rw / o.rp).padStart(4)} (${o.rw}/${o.rp}${o.rd ? `, ${o.rd} drawn` : ''})   ${(o.turns / o.rp).toFixed(1)} turns a round`);
  }
  if (errors.length) console.log(`\n${errors.length} campaigns failed:`, errors.slice(0, 3));
}
