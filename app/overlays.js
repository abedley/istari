/**
 * Things shown over a screen: card inspection, choice sheets, the deck viewer,
 * settings and confirmations. One at a time; tapping the backdrop closes them.
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { fullCard } from './cardView.js';
import { manaValue } from '../src/cards/cards.js';
import { symbolText } from './symbols.js';
import { fit } from './fit.js';
import { setVolume } from './audio.js';
import { showHowToPlay, resetCoach } from './coach.js';
import { PAIGOW_HEROES, PAIGOW_OPPONENTS } from '../src/paigow/personas.js';

export function createOverlays(app) {
  let open = null;

  function close() {
    if (!open) return;
    const { el, onClose, onKey, returnTo } = open;
    open = null;
    document.removeEventListener('keydown', onKey);
    // Focus goes back to what opened it, when that's still there.
    if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    el.style.pointerEvents = 'none';
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished
      .catch(() => {}).then(() => el.remove());
    onClose?.();
  }

  function show(content, { onClose, kind = 'sheet', dismissable = true } = {}) {
    // What had focus before any overlay opened: where focus returns when the last one closes.
    const returnTo = open?.returnTo ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
    if (open) open.returnTo = null;
    close();
    const el = h(`div.overlay.overlay-${kind}`, h('div.backdrop'), content);
    // A dialog, to assistive technology: modal, named by its heading, and holding the focus.
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    content.setAttribute('tabindex', '-1');
    const heading = content.querySelector('h3');
    if (heading) content.setAttribute('aria-label', heading.textContent);
    const onKey = (event) => {
      if (event.key === 'Escape' && dismissable) close();
    };
    document.addEventListener('keydown', onKey);
    // A tap that opened this overlay (on pointerup) still sends its click, which lands
    // here, on the backdrop or on whatever option is under the finger. Only clicks whose
    // press (or key) also started here count.
    let pressed = false;
    el.addEventListener('pointerdown', () => { pressed = true; });
    el.addEventListener('keydown', () => { pressed = true; });
    el.addEventListener('click', (event) => {
      if (!pressed) {
        event.stopPropagation();
        event.preventDefault();
      }
    }, { capture: true });
    if (dismissable) {
      el.addEventListener('click', (event) => {
        if (event.target === el || event.target.classList.contains('backdrop')) close();
      });
    }
    app.root.append(el);
    fit(el);
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    content.animate([{ transform: 'translateY(24px) scale(.97)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    open = { el, onClose, onKey, returnTo };
    content.focus({ preventScroll: true });
    return el;
  }

  /**
   * A big view of a card (real cards show their full image, artist included). Tap anywhere to close it.
   * `onClose` runs when it closes, whether by a tap or an action. `face` shows instead of the card (an ability).
   */
  function inspect(card, { actions = [], onClose, face = null } = {}) {
    app.sound('select');
    const view = h('div.inspect',
      face ?? fullCard(card, app.definitions, { big: true }),
      actions.length ? h('div.inspect-actions', actions.map((a) => h('button.btn', {
        class: a.primary ? 'primary' : '',
        disabled: a.disabled,
        onclick: () => { close(); a.onPick(); },
      }, a.label))) : null);
    view.addEventListener('click', (event) => {
      if (!event.target.closest('button')) close();
    });
    show(view, { kind: 'inspect', onClose });
  }

  /**
   * A list of choices. `options`: `[{ label, sub?, onPick, disabled?, primary? }]`.
   * `onCancel` runs when it closes without a pick (Cancel, or tapping the backdrop).
   */
  function sheet({ title, text, body = null, options, cancel = 'Cancel', onCancel }) {
    let picked = false;
    show(h('div.sheet',
      h('div.sheet-grip'),
      title ? h('h3', title) : null,
      text ? h('div.sheet-text', symbolText(text)) : null,
      body,
      h('div.sheet-options', options.map((o) => h('button.btn.option', {
        class: o.primary ? 'primary' : '',
        disabled: o.disabled,
        onclick: () => { picked = true; close(); o.onPick(); },
      }, h('span.label', o.label), o.sub ? h('span.sub', o.sub) : null))),
      cancel ? h('button.btn.ghost', { onclick: close }, cancel) : null), { onClose: () => { if (!picked) onCancel?.(); } });
  }

  /** Yes or no. */
  function confirm({ title, text, yes = 'Yes', no = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      const answer = (value) => {
        if (answered) return;
        answered = true;
        close();
        resolve(value);
      };
      show(h('div.sheet',
        h('h3', title),
        text ? h('p.sheet-text', text) : null,
        h('div.row', h('button.btn.ghost', { onclick: () => answer(false) }, no),
          h('button.btn', { class: danger ? 'danger' : 'primary', onclick: () => answer(true) }, yes))), { onClose: () => answer(false) });
    });
  }

  /**
   * A deck as a grid of cards, sorted by mana value. With `onPick`, tapping a card
   * picks it (e.g. to remove it); otherwise it inspects it, and closing the card
   * comes back to the deck where it was.
   */
  function deck(cardIds, { title = 'Deck', onPick, pickLabel, scrollTop = 0 } = {}) {
    const counts = new Map();
    for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const entries = [...counts].map(([cardId, n]) => ({ card: { ...app.definitions[cardId], cardId, id: cardId }, n }))
      .sort((a, b) => manaValue(a.card.manaCost ?? {}) - manaValue(b.card.manaCost ?? {}) || a.card.name.localeCompare(b.card.name));
    const grid = h('div.deck-grid', entries.map(({ card, n }) => h('button.deck-card', {
      onclick: () => {
        if (onPick) {
          close();
          onPick(card.cardId);
          return;
        }
        const back = { title, scrollTop: grid.scrollTop };
        // Unless something else opened in its place.
        inspect(card, { onClose: () => queueMicrotask(() => { if (!open) deck(cardIds, back); }) });
      },
    }, fullCard(card, app.definitions), n > 1 ? h('span.qty', `×${n}`) : null)));
    show(h('div.deck-view',
      h('div.deck-head', h('h3', title), h('span.count', `${cardIds.length} cards`),
        h('button.icon-btn', { onclick: close, 'aria-label': 'Close' }, icon('close'))),
      pickLabel ? h('p.sheet-text', pickLabel) : null,
      grid), { kind: 'deck' });
    grid.scrollTop = scrollTop;
  }

  /** Who made what: the fonts, the symbols, the cards, and the art each portrait comes from. */
  function credits() {
    const people = [...Object.values(PAIGOW_HEROES), ...Object.values(PAIGOW_OPPONENTS)].filter((person) => person.portrait?.artist);
    const body = h('div.how',
      h('section.how-section', h('h4', 'Cards'),
        h('p', 'The cards are from Magic: The Gathering\'s The Lord of the Rings: Tales of Middle-earth, © Wizards of the Coast. Their images come from Scryfall. Hold a card to see it in full, with its artist.')),
      h('section.how-section', h('h4', 'Portraits'),
        h('ul', people.map((person) => h('li', h('b', person.name), `: ${person.portrait.card}, art by ${person.portrait.artist}`)))),
      h('section.how-section', h('h4', 'Type and symbols'),
        h('p', 'Faustina, Crimson Pro and Cinzel, under the SIL Open Font License. Mana and Keyrune symbol fonts by Andrew Gioia.')));
    sheet({ title: 'Credits', body, options: [], cancel: 'Close' });
  }

  /** Sound, volume, haptics, speed and auto-pass; help and credits; plus `extra` buttons (e.g. concede). */
  function settings({ extra = [] } = {}) {
    const s = app.settings;
    // A switch: its position is the setting's state, not what tapping it would do.
    const switchRow = (label, key, note = null) => {
      const id = `setting-${key}`;
      return h('div.setting',
        h('span.setting-label', { id }, label, note ? h('small', note) : null),
        h('button.switch', {
          type: 'button', role: 'switch', 'aria-checked': String(Boolean(s[key])), 'aria-labelledby': id,
          onclick: (event) => {
            app.updateSettings({ [key]: !app.settings[key] });
            event.currentTarget.setAttribute('aria-checked', String(Boolean(app.settings[key])));
            if (key === 'sound' && app.settings.sound) app.sound('select');
          },
        }, h('span.switch-knob')));
    };
    show(h('div.sheet.settings',
      h('h3', 'Settings'),
      switchRow('Sound', 'sound'),
      h('label.setting', h('span.setting-label', 'Volume'), h('input.volume', {
        type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume ?? 1), 'aria-label': 'Volume',
        oninput: (event) => {
          app.updateSettings({ volume: Number(event.currentTarget.value) });
          setVolume(app.settings.volume);
        },
        onchange: () => app.sound('select'),
      })),
      navigator.vibrate ? switchRow('Vibration', 'haptics') : null,
      h('div.setting', h('span.setting-label', 'Animation speed'), h('div.seg', { role: 'group', 'aria-label': 'Animation speed' }, [['Normal', 1], ['Fast', 0.6], ['Turbo', 0.35]].map(([label, value]) => h('button.btn.small', {
        class: s.speed === value ? 'primary' : '',
        'aria-pressed': String(s.speed === value),
        onclick: (event) => {
          app.updateSettings({ speed: value });
          for (const b of event.currentTarget.parentElement.children) {
            b.classList.toggle('primary', b === event.currentTarget);
            b.setAttribute('aria-pressed', String(b === event.currentTarget));
          }
        },
      }, label)))),
      switchRow('Auto-pass priority', 'autoPass', 'Off is full control: you stop at every step.'),
      extra.map((e) => h('button.btn', { class: e.danger ? 'danger' : '', onclick: () => { close(); e.onPick(); } }, e.label)),
      h('div.row.settings-links',
        h('button.btn.small', { onclick: () => showHowToPlay(app) }, 'How Pai Gow plays'),
        h('button.btn.small', { onclick: () => { resetCoach(app); close(); } }, 'Show tips again'),
        h('button.btn.small', { onclick: credits }, 'Credits')),
      h('button.btn.ghost', { onclick: close }, 'Done')), {});
  }

  return { inspect, sheet, confirm, deck, settings, close, get isOpen() { return Boolean(open); } };
}
