import { BasicAIController } from './BasicAIController.js';
import { SearchAIController } from './SearchAIController.js';
import { StrategistAIController } from './strategist/StrategistAIController.js';

/** CPU opponents' AIs (opponent.ai.kind). */
export const AI_KIND = Object.freeze({ BASIC: 'basic', SEARCH: 'search', STRATEGIST: 'strategist' });

/**
 * The controller for a CPU opponent (`roundSetup(...).cpu`), so a UI needs
 * no knowledge of the AI classes. `delayMs` paces the basic AI; `responseMs` and
 * `jitterMs` pace the search AI and the Strategist in their acting windows (defaults: the
 * controllers'), and they think for up to `ai.budgetMs` at a decision. The Strategist plays as
 * `ai.persona` (src/ai/strategist/profiles.js), and is never given the other player's hidden cards.
 * Call `.detach()` on it when the fight ends.
 */
export function createCpuController(game, cpu, { delayMs = 300, responseMs, jitterMs, seed } = {}) {
  const { playerId, ai } = cpu;
  switch (ai.kind) {
    case AI_KIND.BASIC:
      return new BasicAIController({ game, playerId, delayMs });
    case AI_KIND.SEARCH: {
      const options = Object.fromEntries(Object.entries({ responseMs, jitterMs, seed, budgetMs: ai.budgetMs })
        .filter(([, value]) => value !== undefined));
      return new SearchAIController({ game, playerId, weights: ai.weights, ...options });
    }
    case AI_KIND.STRATEGIST: {
      const options = Object.fromEntries(Object.entries({ responseMs, jitterMs, seed, budgetMs: ai.budgetMs })
        .filter(([, value]) => value !== undefined));
      return new StrategistAIController({ game, playerId, persona: ai.persona, ...options });
    }
    default:
      throw new Error(`Unknown AI kind: ${ai.kind}`);
  }
}
