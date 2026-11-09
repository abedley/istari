/**
 * The Istari app: one page, a few screens (title, choosing a hero, Pai Gow's deck
 * builder and scoreboard, the campaign, battle), for phones held upright.
 */
import { CARDS } from '../src/cards/cards.js';
import { CARD_PRESENTATION } from '../src/cards/importedCards.js';
import { TOKEN_PRESENTATION } from '../src/cards/tokenArt.js';
import { h, wait } from './dom.js';
import { installIcons } from './icons.js';
import { fit } from './fit.js';
import { unlockAudio, setSoundEnabled, play } from './audio.js';
import { createOverlays } from './overlays.js';
import { titleScreen } from './screens/title.js';
import { battleScreen } from './screens/battle.js';
import { paigowScreen } from './screens/paigow.js';
import { heroesScreen } from './screens/heroes.js';
import { campaignScreen } from './screens/campaign.js';

const SETTINGS_KEY = 'istari.settings';
const DEFAULT_SETTINGS = { sound: true, speed: 1, autoPass: true };

const SCREENS = {
  title: titleScreen,
  heroes: heroesScreen,
  campaign: campaignScreen,
  paigow: paigowScreen,
  battle: battleScreen,
};

/** localStorage, or a stand-in when it's unavailable (private mode, blocked). */
function safeStorage() {
  try {
    const probe = '__istari';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const items = new Map();
    return {
      getItem: (k) => (items.has(k) ? items.get(k) : null),
      setItem: (k, v) => items.set(k, String(v)),
      removeItem: (k) => items.delete(k),
    };
  }
}

function createApp(root) {
  const storage = safeStorage();
  let settings = DEFAULT_SETTINGS;
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch { /* defaults */ }
  setSoundEnabled(settings.sound);

  const stage = h('div.stage');
  root.append(stage);
  let current = null;

  const app = {
    root,
    /**
     * Every card definition, for art and text lookups by `cardId` (with art for the
     * hand-written ones), and Scryfall art for tokens, by the id the game gives them.
     */
    definitions: {
      ...CARDS,
      ...Object.fromEntries(Object.entries(CARD_PRESENTATION).map(([id, look]) => [id, { ...CARDS[id], ...look }])),
      ...TOKEN_PRESENTATION,
    },
    storage,
    get settings() { return settings; },
    updateSettings(changes) {
      settings = { ...settings, ...changes };
      storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      setSoundEnabled(settings.sound);
    },
    sound: play,
    /** Shows a screen; the old one fades out as the new one fades in. */
    async go(name, params = {}) {
      performance.mark(`go:${name}`);
      app.overlays?.close();
      const previous = current;
      const next = SCREENS[name](app, params);
      current = next;
      next.name = name;
      next.el.classList.add('screen', `screen-${name}`);
      stage.append(next.el);
      fit(next.el);
      next.el.animate([{ opacity: 0, transform: 'scale(1.02)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
      if (previous) {
        previous.destroy?.();
        previous.el.style.pointerEvents = 'none';
        await previous.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.catch(() => {});
        previous.el.remove();
      }
      if (current === next) next.enter?.();
    },
  };
  app.overlays = createOverlays(app);
  return app;
}

function boot() {
  installIcons();
  const root = document.getElementById('app');
  const app = createApp(root);
  window.istari = app;
  // Sound needs a user gesture to start (iOS counts touchend and click, not pointerdown).
  for (const type of ['pointerdown', 'touchend', 'click']) window.addEventListener(type, unlockAudio, { capture: true, passive: true });
  // No pinch or double-tap zoom on iOS.
  document.addEventListener('gesturestart', (event) => event.preventDefault());
  document.addEventListener('dblclick', (event) => event.preventDefault());
  app.go('title');
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    wait(2000).then(() => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

boot();
