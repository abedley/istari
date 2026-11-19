/**
 * Where each campaign opponent is met: a place on the road from Bag End to Barad-dûr, with a line that sets the
 * scene, a picture (a card's art: `cardId`, with the point to keep in view, `x` and `y` in percent), and the kind
 * of ambience heard there (app/audio.js). The app draws the road map from these (app/screens/roadMap.js) and
 * sets each round on its place's picture (app/battle/Battle.js). No new art: every picture is a card's.
 */
import { CARDS } from '../cards/cards.js';

export const AMBIENCE = Object.freeze({ SHIRE: 'shire', FOREST: 'forest', HALL: 'hall', SHADOW: 'shadow' });

const place = (name, line, cardId, x, y, ambience) => Object.freeze({ name, line, cardId, x, y, ambience });

/** The place each opponent is met, by opponent id (PAIGOW_OPPONENTS). */
export const PLACES = Object.freeze({
  birthdayBilbo: place('The Party Field', 'Lanterns in the tree, and a hundred and forty-four guests.', 'theShire', 50, 40, AMBIENCE.SHIRE),
  burglarBilbo: place('Bag End', 'A round green door, and a hobbit who has been there and back again.', 'shireTerrace', 30, 35, AMBIENCE.SHIRE),
  lobelia: place('Sackville', 'A smart hole across the Water, and a drawer full of other people\'s spoons.', 'lobeliaSackvilleBaggins', 50, 30, AMBIENCE.SHIRE),
  gandalf: place('The Bridge of Khazad-dûm', 'Deep under the mountains, where the drums have stopped.', 'minesOfMoria', 55, 45, AMBIENCE.HALL),
  oldManWillow: place('The Old Forest', 'The trees do not like strangers, and the paths move.', 'oldManWillow', 60, 50, AMBIENCE.FOREST),
  goldberry: place('The House of Tom Bombadil', 'Water-lilies in bowls, candles on the table, and a song like a river.', 'goldberryRiverDaughter', 56, 25, AMBIENCE.FOREST),
  tomBombadil: place('The Barrow-downs', 'Cold fog on the green mounds, and a song coming over the hill.', 'fogOnTheBarrowDowns', 50, 45, AMBIENCE.SHADOW),
  gildor: place('Woody End', 'Starlight between the trees, and voices singing in the Fair tongue.', 'chanceMetElves', 50, 30, AMBIENCE.FOREST),
  riderInBlack: place('The Road to Bree', 'Hoofbeats behind you on the empty road.', 'nazgul', 45, 35, AMBIENCE.SHADOW),
  butterbur: place('The Prancing Pony', 'A fire in the common-room, beer in the mugs, and a landlord who forgets things.', 'butterburBreeInnkeeper', 50, 30, AMBIENCE.HALL),
  billFerny: place('Bree', 'A dark house on the Greenway, and a squint-eyed face at the window.', 'billFernyBreeSwindler', 50, 30, AMBIENCE.SHADOW),
  ringwraiths: place('Weathertop', 'A ring of broken stones on the hilltop, a small fire, and five shapes climbing in the dark.', 'morgulKnifeWound', 50, 40, AMBIENCE.SHADOW),
  glorfindel: place('The Ford of Bruinen', 'White horses in the flood, and a rider shining in the dusk.', 'horsesOfTheBruinen', 50, 40, AMBIENCE.FOREST),
  elrond: place('Rivendell', 'The Last Homely House east of the Sea.', 'rivendell', 45, 45, AMBIENCE.HALL),
  galadriel: place('Lothlórien', 'The Golden Wood, where no leaf falls and no shadow lies.', 'lothlorienLookout', 70, 35, AMBIENCE.FOREST),
  theoden: place('The Hornburg', 'The horn of Helm sounds in the Deep.', 'rallyAtTheHornburg', 50, 30, AMBIENCE.HALL),
  saruman: place('Orthanc', 'A tower of black stone, and a voice you would like to believe.', 'isolationAtOrthanc', 40, 60, AMBIENCE.SHADOW),
  denethor: place('Minas Tirith', 'The White City, and a Steward who has looked too long into the East.', 'minasTirith', 55, 55, AMBIENCE.HALL),
  sauron: place('Barad-dûr', 'The Dark Tower. The Eye is on you.', 'baradDur', 50, 35, AMBIENCE.SHADOW),
});

/** Where a campaign that is won comes to rest. */
export const JOURNEYS_END = place('The Grey Havens', 'A white ship, and the Sea.', 'theGreyHavens', 50, 50, AMBIENCE.HALL);

/** An opponent's place (null for one that has none), with its picture's address and artist. */
export function placeOf(opponentId) {
  return withArt(PLACES[opponentId] ?? null);
}

/** A place with its picture: `art` (the address), `card` (the card's name) and `artist`. */
export function withArt(spot) {
  if (!spot) return null;
  const card = CARDS[spot.cardId];
  return { ...spot, art: card?.image?.art ?? null, card: card?.name ?? null, artist: card?.artist ?? null };
}
