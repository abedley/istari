/**
 * Web Worker entry for the Strategist (see StrategistAIController). Receives
 * `{ id, view, me, profile, seed, options }`, where `view` is a blind view (beliefs.js), and
 * replies `{ id, result }` with decide()'s result.
 */
import { seededRandom } from '../../engine/random.js';
import { decide } from './policy.js';

self.onmessage = ({ data }) => {
  const { id, view, me, profile, seed, options } = data;
  let result = { macro: null };
  try {
    result = decide(view, me, { profile, random: seededRandom(seed), ...options });
  } catch (error) {
    result = { macro: null, error: String(error?.stack ?? error) };
  }
  self.postMessage({ id, result });
};
