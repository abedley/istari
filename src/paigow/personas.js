/**
 * Pai Gow's CPU opponents: figures of Middle-earth, each with a portrait from their LTR card's art,
 * what they say (see src/ai/banter.js), and how they play: the Strategist (src/ai/strategist/) with their
 * own thinking time and temperament (PERSONA_TEMPERAMENT in src/ai/strategist/profiles.js), and their Ring of Power
 * (`emblem`, an id in EMBLEMS, src/cards/emblems.js: a planeswalker power). PAIGOW_HEROES are the player's
 * characters to choose from, each with a portrait and a ring of their own.
 *
 * An opponent may also have a `setup` of its own (see opponentSetup): `pack`, cards its booster always holds;
 * `library`, cards shuffled into its library at the start of every round (after its hand, which is still its
 * deck of five); `battlefield`, permanents it starts every round with; and `graveyard`, cards already in its
 * graveyard as every round begins.
 */
import { AI_KIND } from '../ai/cpu.js';

const deepFreeze = (value) => {
  if (value && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

/**
 * A portrait: a card's art crop on Scryfall's CDN (`path` after art_crop/front/), where the face is
 * (`x`, `y`: background-position percentages), how far to zoom in (`zoom`: background-size
 * percentage), and the card and artist it comes from. `set`: the card's set, when it isn't an LTR card in the game.
 */
const portrait = (path, x, y, zoom, card, artist, set = null) => ({
  art: `https://cards.scryfall.io/art_crop/front/${path}`, x, y, zoom, card, artist, ...(set ? { set } : {}),
});

/** The Strategist (src/ai/strategist/): its temperament, and with it its thinking time, come from the opponent's id. */
const strategist = () => ({ kind: AI_KIND.STRATEGIST });

export const PAIGOW_OPPONENTS = deepFreeze({
  birthdayBilbo: {
    name: 'Birthday Bilbo', color: 'gold', emblem: 'birthdayBilbo', ai: strategist(),
    portrait: portrait('3/8/38d39cac-e6df-4b3a-826b-b040d80a5fde.jpg?1783915984', 50, 6, 300, 'Bilbo, Birthday Celebrant', 'Billy Christian', 'ltc'),
    banter: {
      start: ['A game! At my party! Splendid. Have some cake first.', 'I am eleventy-one today, and I mean to win at least one thing.', 'Sit, sit! There are presents for everyone. Even you.'],
      win: ['Ha! A birthday win. The best kind.', 'Another round of cake for the winner. That is me.'],
      lose: ['I like less than half of you half as well as you deserve. Well played.', 'Well! I shall have to make a speech about that.'],
      comeback: ['The party is not over yet!', 'Fireworks! I knew I had some left.'],
      collapse: ['Oh dear. Too much cake.', 'Somebody has eaten my good cards.'],
    },
  },
  burglarBilbo: {
    name: 'Burglar Bilbo', color: 'gold', emblem: 'burglarBilbo', ai: strategist(),
    portrait: portrait('6/a/6a109b3e-9f5b-4625-abb7-6b992c10530b.jpg?1785323194', 48, 0, 300, 'Bilbo Baggins, Burglar', 'Kieran Yanner', 'hob'),
    banter: {
      start: ['What have I got in my pocket? You will find out.', 'A burglar is hired for his quiet hands. Watch them.', 'Riddles first? No? Cards, then.'],
      win: ['Burgled! Fair and square. Well, mostly square.', 'In and out, and nobody the wiser.'],
      lose: ['Caught red-handed. It does happen.', 'You would make a fine burglar yourself.'],
      comeback: ['Now you see me...', 'A lucky number, that one.'],
      collapse: ['Oh, bother. I was spotted.', 'Thorin would never let me hear the end of this.'],
    },
  },
  gandalf: {
    name: 'Gandalf', color: 'blue', emblem: 'gandalf', ai: strategist(),
    // His sword in every pack, and his spells already spent: five Gandalf's Sanctions in his graveyard each round.
    setup: { pack: ['glamdring'], graveyard: Array(5).fill('gandalfsSanction') },
    portrait: portrait('c/c/cc9cfcc7-be64-4871-8d52-851e43fe3305.jpg?1783916321', 68, 0, 300, 'Gandalf, Friend of the Shire', 'Dmitry Burmak'),
    banter: {
      start: ['Five cards each? A small game. Small things have a way of mattering.', 'Shall we? I have fireworks to see to afterwards.', 'Mind your hand. A wizard notices things.'],
      win: ['Well played, but not well enough. Off you go.', 'There. Even a grey old wanderer can win a round.'],
      lose: ['Ha! You surprised me. That happens less often than you might think.', 'Splendid. I shall think about that one on the road.'],
      comeback: ['Do not count the wizard out just yet.', 'Ah, there is the light I was looking for.'],
      collapse: ['Hm. I seem to have walked into that.', 'No, no. That one was my own doing.'],
    },
  },
  oldManWillow: {
    name: 'Old Man Willow', color: 'green', emblem: 'oldManWillow', ai: strategist(),
    // The Old Forest is all around him: Forests in play and more to draw, and his own card in every pack.
    setup: { pack: ['oldManWillow'], battlefield: Array(5).fill('forest'), library: Array(5).fill('forest') },
    portrait: portrait('0/3/0362b7c4-fff5-4bc2-b32d-913f85c23cc4.jpg?1783916248', 86, 38, 300, 'Old Man Willow', 'Miklós Ligeti'),
    banter: {
      start: ['Sit down, little one. Rest by the river. There is no hurry.', 'Sleepy, are you? Lie down among my roots, and we shall play.', 'The Old Forest remembers every footstep. Yours too.'],
      win: ['Down you go, into the roots. Sleep now.', 'The river sings, and you stay. That is how it goes here.'],
      lose: ['Go, then. Go, before the branches close.', 'Hmm. You found the path out. Few do.'],
      comeback: ['What falls feeds the roots. And the roots grow.', 'Every fallen thing makes the forest stronger.'],
      collapse: ['Creak... crack... no, no, that is not how it goes.', 'You have woken the old tree. Unwise.'],
    },
  },
  gildor: {
    name: 'Gildor', color: 'green', emblem: 'gildor', ai: strategist(),
    // No card shows Gildor himself: his company of wandering Elves.
    portrait: portrait('0/a/0aa57431-39e2-4152-8a30-1c1e8faef153.jpg?1783916273', 75, 4, 300, 'Chance-Met Elves', 'Irvin Rodriguez'),
    banter: {
      start: ['Elen síla lúmenn’ omentielvo. A star shines on the hour of our meeting.', 'Well met, wanderer. Will you play a while under the stars?', 'My kin are never far. You may meet some of them before we are done.'],
      win: ['The road goes ever on, and so must you. Farewell.', 'Do not be troubled. Even the wise lose to the Elves.'],
      lose: ['Well played. The Elves will remember it in song.', 'You have more courage than you know, and more skill.'],
      comeback: ['Here come my companions, out of the trees.', 'The Elves are never so few as they seem.'],
      collapse: ['The shadow lengthens. We must be going.', 'Even the Firstborn may be caught on the road.'],
    },
  },
  riderInBlack: {
    name: 'Rider in Black', color: 'black', emblem: 'riderInBlack', ai: strategist(),
    // The Nine ride together: three Nazgûl in every pack.
    setup: { pack: ['nazgul', 'nazgul', 'nazgul'] },
    portrait: portrait('4/0/4023a6de-3ac7-488a-b1a9-b1e26681d9bc.jpg?1783916195', 45, 0, 300, 'Nazgûl', 'Lorenzo Mastroianni'),
    banter: {
      start: ['Shire... Baggins...', 'Where is the one you hide? I smell it on you.', 'Give it to me. Then you may go.'],
      win: ['The hunt ends here.', 'You cannot hide from the Nine.'],
      lose: ['Ssss... this is not finished.', 'Run, then. We will follow.'],
      comeback: ['I can feel it. It calls to me.', 'Closer now. Much closer.'],
      collapse: ['The light... it burns.', 'Fire, and Elves. We withdraw. For now.'],
    },
  },
  tomBombadil: {
    name: 'Tom Bombadil', color: 'gold', emblem: 'tomBombadil', ai: strategist(),
    portrait: portrait('2/a/2ab04c49-76a1-4896-8dca-8cb4c615f489.jpg?1783916244', 56, 0, 300, 'Tom Bombadil', 'Dmitry Burmak'),
    banter: {
      start: ['Hop along, come along! Tom will play a merry game!', 'Cards, is it? Tom has time. Tom always has time.', 'Hey dol! Sit you down, and deal them merry!'],
      win: ['Ho! Tom wins, and none the worse for it. Sing with me!', 'Down you tumble, light as a leaf! No harm done.'],
      lose: ['Well, well! You beat old Tom. The river laughs at both of us.', 'Ho ho! A clever game. Tom will hum about it.'],
      comeback: ['Up again, up again, Tom is dancing!', 'The willow lets go, and Tom is merry!'],
      collapse: ['Oho, a puddle where Tom meant to step!', 'Never mind, never mind. The sun still shines.'],
    },
  },
  sauron: {
    name: 'Sauron', color: 'black', emblem: 'sauron', ai: strategist(),
    portrait: portrait('0/3/034e0929-b2c7-4b5f-94f2-8eaf4fb1a2a1.jpg?1783916249', 50, 0, 320, 'Sauron, the Dark Lord', 'Kieran Yanner'),
    banter: {
      start: ['You play against me? Then you have already lost.', 'Every card you hold, I see.', 'Kneel, or be broken. The choice is the only one you have.'],
      win: ['As it was always going to be.', 'Your hope burns out. Mine never did.'],
      lose: ['A spark. Nothing more. I will find you again.', 'You have won nothing but my attention.'],
      comeback: ['The shadow returns. It always returns.', 'Did you think the Eye had closed?'],
      collapse: ['Insolence. You will regret it.', 'This changes nothing. Nothing!'],
    },
  },
  saruman: {
    name: 'Saruman', color: 'white', emblem: 'saruman', ai: strategist(),
    portrait: portrait('1/b/1bfccbab-29fa-4e92-8919-6cd4815fb655.jpg?1783916311', 52, 16, 300, 'Saruman the White', 'Matt Stewart'),
    banter: {
      start: ['Come, let us be reasonable. You cannot win, but you may learn something.', 'I have studied every card in this game. Have you?', 'Sit. My patience is greater than your deck.'],
      win: ['Knowledge, my friend. It wins in the end.', 'You were outplayed by a better mind. There is no shame in it. Much.'],
      lose: ['A mere accident of the draw.', 'Hm. I shall have to revise my calculations.'],
      comeback: ['As I foresaw. Every turn of it.', 'The plan holds. It always held.'],
      collapse: ['That was not in the palantír.', 'You are cleverer than you look. Irritating.'],
    },
  },
  theoden: {
    name: 'Théoden', color: 'red', emblem: 'theoden', ai: strategist(),
    portrait: portrait('f/6/f6dcd1ca-4943-46e4-bb5d-c14949e21e23.jpg?1783916242', 27, 0, 300, 'Théoden, King of Rohan', 'Kieran Yanner'),
    banter: {
      start: ['Ride with me, or ride against me! Either way, we ride!', 'A king does not hide behind his cards.', 'Sound the horns. Let this be a game worth singing of.'],
      win: ['The field is ours! A fine charge, if I say so myself.', 'For the Mark! Well fought, friend.'],
      lose: ['Well struck. Rohan bows to a worthy foe.', 'Fall back and regroup. We shall meet again.'],
      comeback: ['To me, riders! The day is not lost!', 'Now the tide turns. Charge!'],
      collapse: ['Hold the line! Hold it!', 'The enemy is stronger than the scouts said.'],
    },
  },
  denethor: {
    name: 'Denethor', color: 'black', emblem: 'denethor', ai: strategist(),
    portrait: portrait('f/a/fa8654cf-431c-427b-b78f-0e48f6007e9e.jpg?1783916256', 34, 4, 320, 'Denethor, Ruling Steward', 'Campbell White'),
    banter: {
      start: ['You come before the Steward of Gondor. Play carefully.', 'I have seen how this ends. Shall we pretend otherwise?', 'Sit. I rule here, and I do not lose lightly.'],
      win: ['As I said. Hope is a fool\'s comfort.', 'Gondor stands. You do not.'],
      lose: ['So the city falls. I always knew it would.', 'Go, then. Take your victory and leave me.'],
      comeback: ['Perhaps there is strength in the old blood yet.', 'You see? The Steward does not break.'],
      collapse: ['All is lost. All of it.', 'I was betrayed by my own cards.'],
    },
  },
  elrond: {
    name: 'Elrond', color: 'blue', emblem: 'elrond', ai: strategist(),
    portrait: portrait('a/6/a62a5e55-fa1b-4c70-9293-740dd513d52e.jpg?1783916319', 52, 0, 320, 'Elrond, Lord of Rivendell', 'Ryan Yee'),
    banter: {
      start: ['Welcome to Rivendell. Let us play, and let the game be fair.', 'I have watched long ages. One more game is no burden.', 'Take your time. Here, time is something we have.'],
      win: ['The wise do not boast. But I did play that well.', 'Rest now. You have earned it, even in defeat.'],
      lose: ['Well done. The young surprise me still.', 'A worthy victory. Remember how you won it.'],
      comeback: ['The river rises in my favor.', 'Patience. The tide always returns.'],
      collapse: ['I did not foresee that.', 'Even the long-lived can be caught unawares.'],
    },
  },
  galadriel: {
    name: 'Galadriel', color: 'green', emblem: 'galadriel', ai: strategist(),
    portrait: portrait('a/6/a6e5c3b3-9a70-4a1c-bfb3-db27e51c4b8d.jpg?1783916254', 34, 0, 320, 'Galadriel of Lothlórien', 'Magali Villeneuve'),
    banter: {
      start: ['I know what is in your hand. And what is in your heart.', 'Look into the mirror, and play what you see.', 'Welcome to the Golden Wood. Tread softly.'],
      win: ['You were tested. The test is over.', 'The light of the Eldar does not fade so easily.'],
      lose: ['You have passed the test. Go in peace.', 'I see now why the Ring was given to small hands.'],
      comeback: ['The light returns to Lothlórien.', 'You thought the wood had gone dark. It never does.'],
      collapse: ['The mirror showed many things. Not this.', 'Even the Lady of the Wood can stumble.'],
    },
  },
});

/** The player's characters: one is chosen for the whole match. `blurb` is a line for the picker. */
export const PAIGOW_HEROES = deepFreeze({
  frodo: {
    name: 'Frodo', color: 'gold', emblem: 'frodo',
    blurb: 'The Ring-bearer. Carries the burden, and it carries him.',
    portrait: portrait('d/e/de1c0399-9db8-4901-b72e-0010eb9b92b0.jpg?1783916257', 50, 10, 260, 'Frodo Baggins', 'Ekaterina Burmak'),
  },
  strider: {
    name: 'Strider', color: 'gold', emblem: 'strider',
    blurb: 'A Ranger of the North, grim and weathered, who knows the wild paths.',
    portrait: portrait('5/4/54461d61-a745-467f-9fbe-b5e7a8edbdbf.jpg?1783916244', 5, 39, 300, 'Strider, Ranger of the North', 'Jarel Threat'),
  },
  samwise: {
    name: 'Samwise', color: 'gold', emblem: 'samwise',
    blurb: 'A gardener of the Shire, and a pan that has seen some use.',
    portrait: portrait('a/1/a1b6f13e-63d0-46bf-aa57-23c2dbdf62dd.jpg?1783916249', 36, 8, 300, 'Samwise Gamgee', 'Ekaterina Burmak'),
  },
  radagast: {
    name: 'Radagast', color: 'gold', emblem: 'radagast',
    blurb: 'The Brown Wizard of Rhosgobel, who calls the beasts and birds to his side in an instant.',
    portrait: portrait('b/3/b3988120-ebbe-4d24-9bb4-8c5331a14034.jpg?1783916261', 46, 4, 320, 'Radagast the Brown', 'Alexander Mokhov'),
  },
  merry: {
    name: 'Merry', color: 'gold', emblem: 'merry',
    blurb: 'A Brandybuck of Buckland, who brings his friends along and the provisions too.',
    portrait: portrait('8/8/885a3277-ef10-4dcf-ac63-eb8971cd627c.jpg?1783916264', 44, 18, 300, 'Meriadoc Brandybuck', 'Marie Magny'),
  },
  pippin: {
    name: 'Pippin', color: 'gold', emblem: 'pippin',
    blurb: 'A Took of the Shire, who has never once skipped second breakfast.',
    portrait: portrait('f/5/f5baee8d-88e7-4468-94a9-66ca8e2caf15.jpg?1783916263', 48, 18, 300, 'Peregrin Took', 'Campbell White'),
  },
});

/** The hero a match starts with when none is chosen. */
export const DEFAULT_HERO = 'frodo';

/** Heroes that were renamed, by their old id: a saved choice or campaign still finds them. */
export const RENAMED_HEROES = Object.freeze({ bilbo: 'samwise', aragorn: 'strider' });

/** A hero id, as it is now (see RENAMED_HEROES). */
export const currentHeroId = (id) => RENAMED_HEROES[id] ?? id;

/** A Pai Gow hero by id. */
export const paigowHero = (id) => PAIGOW_HEROES[currentHeroId(id)];

/** A Pai Gow opponent by id. */
export const paigowOpponent = (id) => PAIGOW_OPPONENTS[id];

/**
 * What an opponent starts with besides a booster's cards (its `setup`, every part empty when it has none):
 * `pack` (card ids its booster always holds), `library` (card ids shuffled into its library each round)
 * and `battlefield` (card ids it begins each round with on the battlefield).
 */
export function opponentSetup(id) {
  const setup = PAIGOW_OPPONENTS[id]?.setup ?? {};
  return {
    pack: setup.pack ?? [], library: setup.library ?? [], battlefield: setup.battlefield ?? [], graveyard: setup.graveyard ?? [],
  };
}
