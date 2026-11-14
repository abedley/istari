import { h } from '../dom.js';
import { Battle } from '../battle/Battle.js';
import { personInfo } from './common.js';
import { heroOf } from './paigow.js';
import { powerOf, ringOf } from './heroes.js';
import {
  roundSetup, recordRound, outcome, score, ROUND_RESULT, MATCH_OUTCOME,
} from '../../src/paigow/paigow.js';
import { paigowOpponent } from '../../src/paigow/personas.js';
import { placeOf } from '../../src/paigow/places.js';
import { recordRoundPlayed } from '../../src/paigow/book.js';
import { updateBook, heroLook } from '../book.js';
import { currentHeroId, DEFAULT_HERO } from '../../src/paigow/personas.js';

/** A round of a Pai Gow match (src/paigow/paigow.js): `match` is the match so far, with the decks set. */
export function battleScreen(app, { match = null } = {}) {
  if (!match?.decks) {
    queueMicrotask(() => app.go('campaign'));
    return { el: h('div') };
  }
  const setup = roundSetup(match);
  const opponent = paigowOpponent(match.opponentId);
  const { won, lost } = score(match);
  const resultOf = ({ won: roundWon, drawn }) => (drawn ? ROUND_RESULT.DRAWN : roundWon ? ROUND_RESULT.WON : ROUND_RESULT.LOST);
  // "Victory" and "Defeat" are for the match; a round that doesn't decide it is only "Round won" and the like.
  const resultText = (end) => {
    const result = resultOf(end);
    const decided = outcome(recordRound(match, result));
    if (decided) return { [MATCH_OUTCOME.WON]: 'Victory', [MATCH_OUTCOME.LOST]: 'Defeat', [MATCH_OUTCOME.TIE]: 'Tie' }[decided];
    return { [ROUND_RESULT.WON]: 'Round won', [ROUND_RESULT.LOST]: 'Round lost', [ROUND_RESULT.DRAWN]: 'Round drawn' }[result];
  };
  const onEnd = (end) => {
    const next = recordRound(match, resultOf(end), end.stats ?? null);
    updateBook(app, (book) => recordRoundPlayed(book, next, setup.encounter.round));
    app.go('paigow', { match: next, view: outcome(next) ? 'final' : 'scoreboard', played: setup.encounter.round });
  };
  const battle = new Battle(app, {
    setup,
    meInfo: { ...personInfo(heroLook(app, heroOf(match), currentHeroId(match.heroId ?? DEFAULT_HERO))), powers: [heroOf(match).emblem, ...(match.rings ?? [])].map(ringOf) },
    oppInfo: { ...personInfo(opponent), power: powerOf(opponent) },
    subtitle: `Round ${setup.encounter.round + 1} · ${won}–${lost}`,
    place: placeOf(match.opponentId),
    onEnd,
    fastForward: true,
    resultText,
  });
  window.istari.battle = battle;
  return {
    el: battle.el,
    ambience: placeOf(match.opponentId)?.ambience,
    enter: () => battle.start(),
    destroy: () => battle.destroy(),
  };
}
