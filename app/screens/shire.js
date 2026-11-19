/**
 * The title screen's backdrop: a picture of the Shire at dawn, cut into depth layers
 * (app/title/layer-N.webp, made by tools/title/make-layers.py), far to near: the sky, the misty
 * hills, the fields and river with their trees, the far smial's hill, the near hill and the path.
 *
 * The game's name is a layer of its own, set in the sky above the hills: the logo
 * (app/title/logo.webp, made by tools/title/make-logo.py), gold letters with the black cut away.
 *
 * Once the layers have loaded, the camera pulls back from close in, each layer by its depth (`--d`,
 * 0 far to 1 near), so near layers move and shrink more than far ones: a parallax zoom. Then it
 * drifts slowly. The motion is transform only (app.css, "title").
 */
const LAYERS = [0, 0.22, 0.5, 0.82, 1];
const TITLE_DEPTH = 0.4;

/** Whether the camera's pull-back has played since the page loaded: it plays once, not on every return to the title. */
let introPlayed = false;

const layer = (el, depth) => {
  el.style.setProperty('--d', depth);
  return el;
};

export function shire(h) {
  const images = LAYERS.map((depth, i) => layer(h('img.rv-layer', { src: `app/title/layer-${i}.webp`, alt: '', decoding: 'async', draggable: 'false' }), depth));
  const title = layer(h('div.rv-layer.rv-title', h('h1.logo-big', h('img.logo-img', { src: 'app/title/logo.webp', alt: 'Istari', decoding: 'async', draggable: 'false' }))), TITLE_DEPTH);
  // Far to near: the sky and hills, shade for the words, the name, then the fields, the smials and the path.
  const el = h(`div.rv${introPlayed ? '.settled' : ''}`, images[0], images[1], h('div.rv-scrim-top', { 'aria-hidden': 'true' }), title,
    ...images.slice(2), h('div.rv-motes', { 'aria-hidden': 'true' }), h('div.rv-scrim', { 'aria-hidden': 'true' }));
  // Start the move only when every layer can be shown, so it never begins on a half-drawn scene.
  const ready = () => {
    el.classList.add('ready');
    introPlayed = true;
  };
  Promise.all(images.map((img) => img.decode().catch(() => {}))).then(ready);
  setTimeout(ready, 4000);
  return el;
}
