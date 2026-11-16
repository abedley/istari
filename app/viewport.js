/**
 * The app's height, as `--app-height`. Opened from the home screen on iOS (with the status bar drawn over the app,
 * black-translucent), the page's full-screen box can come out short of the screen by the status bar's height, leaving
 * a band of nothing at the bottom; there the app is the whole screen, so it takes the screen's height. Elsewhere
 * it's the window's.
 */
export function appHeight({ standalone, innerHeight, screenWidth, screenHeight, portrait }) {
  if (!standalone) return innerHeight;
  // iOS reports the screen's size as if held upright, whichever way it is.
  const screenTall = portrait ? Math.max(screenWidth, screenHeight) : Math.min(screenWidth, screenHeight);
  return Math.max(innerHeight, screenTall);
}

/** Sets `--app-height` on the page, for the CSS (the body's height). */
export function sizeApp() {
  const height = appHeight({
    standalone: navigator.standalone === true,
    innerHeight: window.innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    portrait: matchMedia('(orientation: portrait)').matches,
  });
  document.documentElement.style.setProperty('--app-height', `${height}px`);
}
