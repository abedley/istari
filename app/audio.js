/**
 * Synthesized sound (Web Audio): effects, an ambient bed for each kind of place, and a short theme. No files to
 * download. The audio context starts on the first tap, as mobile browsers require.
 *
 * Effects go through `master`; ambience and the theme through `bed`, which has its own switch (the settings'
 * "Music and ambience") and the same volume.
 */
let context = null;
let master = null;
let noiseBuffer = null;
let enabled = true;
let musicEnabled = true;
/** Ambience and the theme. */
let bed = null;
/** The ambience playing: `{ kind, gain, stop }`, and the kind asked for (kept while sound can't play yet). */
let ambient = null;
let wantedAmbience = null;
/** Called once the context has started (the first tap). */
const ready = [];
let volume = 1;
/** The master gain at full volume. */
const FULL = 0.22;

export function setSoundEnabled(on) {
  enabled = on;
}

/** The volume, 0 to 1 (the settings' slider). */
export function setVolume(value) {
  volume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
  if (master) master.gain.value = FULL * volume;
  if (bed) bed.gain.value = musicEnabled ? FULL * volume : 0;
}

/** Call from a user gesture (the app does on the first pointerdown). */
export function unlockAudio() {
  if (context) {
    if (context.state === 'suspended') context.resume();
    return;
  }
  const AudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContext) return;
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = FULL * volume;
  const compressor = context.createDynamicsCompressor();
  master.connect(compressor).connect(context.destination);
  bed = context.createGain();
  bed.gain.value = musicEnabled ? FULL * volume : 0;
  bed.connect(compressor);
  noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  setAmbience(wantedAmbience);
  ready.splice(0).forEach((fn) => fn());
}

/** Runs `fn` once sound can play: now, or after the first tap. */
export function whenAudioReady(fn) {
  if (context) fn();
  else ready.push(fn);
}

/** Music and ambience on or off (the effects have their own switch, setSoundEnabled). */
export function setMusicEnabled(on) {
  musicEnabled = on;
  if (bed) bed.gain.setTargetAtTime(on ? FULL * volume : 0, context.currentTime, 0.2);
}

/** The page hidden or shown: sound stops while it's away. */
export function setAudioSuspended(suspended) {
  if (!context) return;
  if (suspended) context.suspend();
  else context.resume();
}

function tone({ freq = 440, to = freq, type = 'sine', duration = 0.15, gain = 1, delay = 0, attack = 0.005, out = master }) {
  const t = context.currentTime + delay;
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function noise({ duration = 0.15, gain = 0.6, freq = 2000, to = freq, q = 1, delay = 0 }) {
  const t = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, t);
  if (to !== freq) filter.frequency.exponentialRampToValueAtTime(to, t + duration);
  const env = context.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  source.connect(filter).connect(env).connect(master);
  source.start(t);
  source.stop(t + duration + 0.02);
}

const SOUNDS = {
  tap: () => tone({ freq: 1400, duration: 0.03, gain: 0.25, type: 'triangle' }),
  select: () => tone({ freq: 880, to: 1200, duration: 0.06, gain: 0.25, type: 'triangle' }),
  draw: () => noise({ duration: 0.14, gain: 0.35, freq: 3000, to: 6000, q: 0.8 }),
  land: () => {
    tone({ freq: 120, to: 60, duration: 0.18, gain: 0.8 });
    noise({ duration: 0.08, gain: 0.3, freq: 800 });
  },
  cast: () => {
    tone({ freq: 420, to: 880, duration: 0.25, gain: 0.35, type: 'triangle' });
    tone({ freq: 630, to: 1320, duration: 0.3, gain: 0.2, type: 'sine', delay: 0.04 });
  },
  enter: () => {
    tone({ freq: 160, to: 70, duration: 0.2, gain: 0.9 });
    noise({ duration: 0.1, gain: 0.25, freq: 600 });
  },
  attack: () => noise({ duration: 0.25, gain: 0.5, freq: 400, to: 2400, q: 0.7 }),
  // A blow: a crack, a thud, and weight under it.
  hit: () => {
    noise({ duration: 0.12, gain: 0.7, freq: 1200, to: 300 });
    tone({ freq: 140, to: 60, duration: 0.15, gain: 0.6, type: 'square' });
    tone({ freq: 70, to: 34, duration: 0.3, gain: 0.9 });
  },
  die: () => {
    tone({ freq: 320, to: 50, duration: 0.45, gain: 0.35, type: 'sawtooth' });
    noise({ duration: 0.4, gain: 0.3, freq: 900, to: 150 });
    tone({ freq: 90, to: 30, duration: 0.7, gain: 0.7, delay: 0.05 });
    noise({ duration: 0.6, gain: 0.18, freq: 300, to: 80, q: 0.6, delay: 0.1 });
  },
  burn: () => noise({ duration: 0.35, gain: 0.45, freq: 5000, to: 900, q: 2 }),
  gain: () => {
    tone({ freq: 660, duration: 0.18, gain: 0.3 });
    tone({ freq: 990, duration: 0.25, gain: 0.25, delay: 0.08 });
  },
  lose: () => tone({ freq: 300, to: 180, duration: 0.25, gain: 0.35, type: 'triangle' }),
  turn: () => {
    tone({ freq: 523, duration: 0.6, gain: 0.25 });
    tone({ freq: 784, duration: 0.7, gain: 0.18, delay: 0.05 });
  },
  // A rising call over a held fifth, like a horn answered.
  victory: () => {
    [523, 659, 784, 1046].forEach((freq, i) => tone({ freq, duration: 0.5, gain: 0.3, delay: i * 0.12, type: 'triangle' }));
    tone({ freq: 261.6, duration: 1.3, gain: 0.3, attack: 0.05 });
    tone({ freq: 392, duration: 1.3, gain: 0.22, attack: 0.05, delay: 0.1 });
    noise({ duration: 0.5, gain: 0.12, freq: 4000, to: 7000, q: 0.8, delay: 0.36 });
  },
  defeat: () => {
    [392, 349, 311, 262].forEach((freq, i) => tone({ freq, duration: 0.55, gain: 0.3, delay: i * 0.16, type: 'triangle' }));
    tone({ freq: 65.4, to: 55, duration: 1.4, gain: 0.5, attack: 0.08 });
  },
  reward: () => [784, 988, 1175].forEach((freq, i) => tone({ freq, duration: 0.35, gain: 0.22, delay: i * 0.07 })),
};

/** Plays a named sound if sound is on and the context has started. */
export function play(name) {
  if (!enabled || !context || context.state !== 'running') return;
  SOUNDS[name]?.();
}

// ---------------------------------------------------------------------------
// Ambience: a quiet bed that loops under a screen, by kind of place (AMBIENCE in src/paigow/places.js).

/** Looping noise through a filter, its loudness swelling slowly like wind. Returns what to stop. */
function wind(out, { freq, q = 0.6, gain, swell = 0.12 }) {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const level = context.createGain();
  level.gain.value = gain;
  const lfo = context.createOscillator();
  lfo.frequency.value = swell;
  const depth = context.createGain();
  depth.gain.value = gain * 0.6;
  lfo.connect(depth).connect(level.gain);
  source.connect(filter).connect(level).connect(out);
  source.start();
  lfo.start();
  return [source, lfo];
}

/** A held note, for a drone. */
function hold(out, { freq, gain, type = 'sine', beat = 0 }) {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const level = context.createGain();
  level.gain.value = gain;
  const made = [osc];
  if (beat) {
    const lfo = context.createOscillator();
    lfo.frequency.value = beat;
    const depth = context.createGain();
    depth.gain.value = gain * 0.7;
    lfo.connect(depth).connect(level.gain);
    lfo.start();
    made.push(lfo);
  }
  osc.connect(level).connect(out);
  osc.start();
  return made;
}

/** Calls `make` now and then (every `min` to `max` seconds), until stopped. Returns `{ stop }` like a node. */
function nowAndThen(min, max, make) {
  let timer = null;
  const next = () => {
    timer = setTimeout(() => {
      if (context.state === 'running') make();
      next();
    }, (min + Math.random() * (max - min)) * 1000);
  };
  next();
  return { stop: () => clearTimeout(timer) };
}

/** A bird: two or three quick rising chirps. */
const chirp = (out, base) => {
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i += 1) tone({ freq: base * (1 + Math.random() * 0.15), to: base * 1.35, duration: 0.07, gain: 0.05, delay: i * 0.11, out });
};

const BEDS = {
  // The Shire: a soft breeze and birdsong.
  shire: (out) => [
    ...wind(out, { freq: 520, gain: 0.1 }),
    nowAndThen(2.5, 7, () => chirp(out, 2400 + Math.random() * 900)),
  ],
  // Woods: lower wind in the leaves, a bough creaking, a bird far off.
  forest: (out) => [
    ...wind(out, { freq: 320, gain: 0.13, swell: 0.08 }),
    ...wind(out, { freq: 2600, q: 1.2, gain: 0.025, swell: 0.21 }),
    nowAndThen(6, 14, () => tone({ freq: 96, to: 74, type: 'sawtooth', duration: 0.5, gain: 0.03, attack: 0.1, out })),
    nowAndThen(5, 12, () => chirp(out, 1700 + Math.random() * 500)),
  ],
  // Halls of stone: a held fifth, slowly beating, and air.
  hall: (out) => [
    ...hold(out, { freq: 110, gain: 0.07 }),
    ...hold(out, { freq: 110.5, gain: 0.05 }),
    ...hold(out, { freq: 164.8, gain: 0.035, beat: 0.07 }),
    ...wind(out, { freq: 900, q: 0.4, gain: 0.02, swell: 0.05 }),
  ],
  // Under the Shadow: a low pulse and a hiss.
  shadow: (out) => [
    ...hold(out, { freq: 55, gain: 0.11, beat: 0.23 }),
    ...hold(out, { freq: 58.3, gain: 0.05, type: 'triangle' }),
    ...wind(out, { freq: 3200, q: 1.5, gain: 0.018, swell: 0.3 }),
    ...wind(out, { freq: 180, gain: 0.08, swell: 0.06 }),
  ],
};

/** The kinds of ambience there are. */
export const AMBIENCE_KINDS = Object.freeze(Object.keys(BEDS));

/**
 * Plays the ambience `kind` (one of AMBIENCE_KINDS), fading out whatever was playing; null for none. Before the
 * first tap it's only remembered, and starts when sound can.
 */
export function setAmbience(kind) {
  wantedAmbience = BEDS[kind] ? kind : null;
  if (!context || !bed) return;
  if (ambient?.kind === wantedAmbience) return;
  const now = context.currentTime;
  if (ambient) {
    const old = ambient;
    old.gain.gain.setTargetAtTime(0, now, 0.35);
    setTimeout(() => {
      old.nodes.forEach((node) => { try { node.stop(); } catch { /* already stopped */ } });
      old.gain.disconnect();
    }, 1800);
    ambient = null;
  }
  if (!wantedAmbience) return;
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(1, now + 0.2, 0.8);
  gain.connect(bed);
  ambient = { kind: wantedAmbience, gain, nodes: BEDS[wantedAmbience](gain) };
}

/** The ambience playing or asked for (for tests and debugging). */
export const currentAmbience = () => ({ wanted: wantedAmbience, playing: ambient?.kind ?? null });

/**
 * The theme: a short walking tune, plucked, over a drone on its home note and fifth. D major with a flat seventh
 * (a folk mode), there and back again.
 */
export function playTheme() {
  // Scheduled on the context's clock, so it still plays if the context is a moment from running.
  if (!context || !musicEnabled) return;
  const D = 293.66;
  const step = (n) => D * 2 ** (n / 12);
  // Semitones from D, and how long each note is (in beats).
  const tune = [[0, 1], [4, 1], [7, 1], [9, 0.5], [7, 0.5], [4, 1], [2, 1], [0, 2], [7, 1], [10, 1], [9, 1], [7, 0.5], [4, 0.5], [2, 1], [4, 1], [0, 3]];
  const beat = 0.34;
  let at = 0.1;
  for (const [n, beats] of tune) {
    // A pluck: a bright start that dies away, with a softer octave under it.
    tone({ freq: step(n), type: 'triangle', duration: beat * beats + 0.5, gain: 0.5, delay: at, attack: 0.004, out: bed });
    tone({ freq: step(n) / 2, duration: beat * beats + 0.3, gain: 0.2, delay: at, attack: 0.004, out: bed });
    at += beat * beats;
  }
  tone({ freq: D / 2, duration: at + 1, gain: 0.16, attack: 0.6, out: bed });
  tone({ freq: (D / 2) * 1.5, duration: at + 1, gain: 0.1, attack: 0.8, out: bed });
}
