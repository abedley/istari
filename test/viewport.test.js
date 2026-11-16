import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appHeight } from '../app/viewport.js';

test("an iOS home-screen app takes the whole screen's height, even when the window reports less", () => {
  // iPhone 13, upright: the page's box stopped 47pt short (the status bar's height).
  assert.equal(appHeight({ standalone: true, innerHeight: 797, screenWidth: 390, screenHeight: 844, portrait: true }), 844);
  // Already the whole screen: as it is.
  assert.equal(appHeight({ standalone: true, innerHeight: 844, screenWidth: 390, screenHeight: 844, portrait: true }), 844);
  // Sideways (an iPad): iOS still reports the upright size.
  assert.equal(appHeight({ standalone: true, innerHeight: 760, screenWidth: 820, screenHeight: 1180, portrait: false }), 820);
});

test('in a browser tab, the window is the app', () => {
  assert.equal(appHeight({ standalone: false, innerHeight: 664, screenWidth: 390, screenHeight: 844, portrait: true }), 664);
});
