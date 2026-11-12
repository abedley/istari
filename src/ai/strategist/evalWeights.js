/**
 * The Strategist's evaluation weights (see evaluate.js), fitted by tools/tune-eval.js to 147898
 * positions from 24000 self-played rounds of Pai Gow.
 * Generated: don't edit by hand (run `node tools/tune-eval.js`).
 */
export const EVAL_WEIGHTS = Object.freeze({
  "bias": -0.169,
  "myLife": 0.497,
  "theirLife": -0.5,
  "myCreatures": 0.111,
  "theirCreatures": -0.087,
  "myCount": 0.221,
  "theirCount": -0.191,
  "myHand": 0.75,
  "theirHand": -0.679,
  "myCards": -0.123,
  "theirCards": 0.11,
  "myPermanents": 0.016,
  "theirPermanents": 0.001,
  "myClock": 1.716,
  "theirClock": -1.042,
  "raceWon": 1.192,
  "raceLost": -0.66,
  "raceScore": 0.255
});
