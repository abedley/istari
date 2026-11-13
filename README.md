# Istari

**Pai Gow** with the cards of *The Lord of the Rings: Tales of Middle-earth* (LTR): open a
booster, split its 15 cards into three decks of five, and play a best of three against one of the
Wise of Middle-earth. It runs on a subset of the Magic: The Gathering rules, written in plain
JavaScript (ES modules, no build step) and hosted on GitHub Pages.

Istari was split out of [Planeswalker](https://github.com/abedley/planeswalker), a roguelite on
the same engine. It keeps the engine, the AI, the battle screen, the LTR cards and the Scryfall
importer; Planeswalker's campaign, its other cards, the engine debugger and the AI arena and
tuning tools stay there.

- `index.html` + `app/`: **the game**, a single-page app for phones held upright (see *The app*)
- `src/engine/`: the rules engine; `src/cards/`: card definitions; `src/ai/`: the CPU players
- `src/paigow/`: Pai Gow's rules, opponents and fast forward
- `tools/`: the Scryfall card and token importers, and the CPU's arena and fitting tools (see *The Strategist*); all Node only, the site never loads them. `tools/title/make-layers.py`
  cuts the title screen's picture (`tools/title/source.jpg`) into the depth layers in `app/title/` for its
  parallax zoom (Python, with Pillow, numpy and OpenCV)
- `test/`: `npm test`; `test/fixtures/` has the made-up sample cards and the few non-LTR cards
  (with three 40-card decks of them) that engine and AI tests play with

## How Pai Gow plays

A match against the CPU in `src/paigow/paigow.js` (pure functions over a plain match object), with
its screens in `app/screens/heroes.js` (choosing your hero), `app/screens/paigow.js` (deck builder,
scoreboard) and `app/screens/battle.js` (a round), from *Quick match* on the title screen (or as a
campaign's match, see *The campaign*):
0. You choose your hero, Frodo, Strider, Samwise, Radagast, Merry or Pippin (`PAIGOW_HEROES` in `src/paigow/personas.js`), each
   with a Ring of Power of their own (see *Rings of Power*). The app remembers the last one.
1. Each side opens an LTR booster (`openBooster`), as the set's Draft Booster (LTR came before
   Play Boosters): 10 different commons, 3 different uncommons, a rare or mythic (each rare twice
   as likely as each mythic, so about one pack in seven has a mythic), and, in place of the basic
   land, any LTR card at all, each equally likely (it can repeat a card already in the pack).
   The pool (`PAIGOW_POOL`) is every LTR card in the game but the basic lands, the set's few
   nonbasic lands included; the 8 left out of the game can't be opened. No foils or special editions.
2. You split yours into three decks of five (in a campaign you may have more cards than that, and
   leave the spare ones out; tap a card to put it in the highlighted round,
   hold it to read it, or Auto-fill; pinch the booster's cards, ⌘/Ctrl + scroll, or tap −/+ to show 1 to 5
   in a row, 3 at first, kept in the settings as `trayColumns`). The CPU builds its three decks without a look at your cards
   (`buildDecks` in `src/paigow/deckBuilder.js`, see *The Strategist*), then shuffles their order.
3. Round N is your deck N against the CPU's deck N. Both players start with all five cards in
   hand, infinite mana and their character's Ring of Power, and can't lose by drawing from an empty library. The player
   who goes first starts at 5 life, the other at 8.
   A round is won, lost, or drawn when the board stalls (see *Variant rules*); 40 turns is a
   backstop. Who goes first is a coin flip in round 1; after that, the loser of the
   last round goes first (after a draw, whoever went second in it).
4. **Fast forward:** once a player is out of actions (no cards in hand, no creatures, and no
   abilities but mana abilities, `outOfActions` in `src/paigow/fastForward.js`), a *Fast forward*
   button plays the round out at once. `planFastForward` tries a few basic-AI lines for both sides
   on copies of the game (lookahead or basic attacks, swarming or not), keeps the one best for the
   side that still has actions (a win, then a draw, then a loss; sooner is better), and replays
   it on the real game, so the board shows how it ends. If you're the one with actions, the AI
   plays them for you.
5. The first to win two rounds takes the match. If three rounds pass without that, more round
   wins takes it, and otherwise it's a tie.

The CPU is one of Pai Gow's own opponents (`PAIGOW_OPPONENTS` in `src/paigow/personas.js`),
picked at random: Birthday Bilbo, Burglar Bilbo, Gandalf, Old Man Willow, Gildor, the Rider in Black, Tom Bombadil, Sauron, Saruman, Théoden, Denethor, Elrond and
Galadriel. Each has a portrait from a card's art (their LTR card's, but for the Bilbos: *Bilbo, Birthday
Celebrant* from the LTR Commander decks and *Bilbo Baggins, Burglar* from The Hobbit, and for Gildor, who has no card: *Chance-Met Elves*, his company), their own lines, and the Strategist
(`src/ai/strategist/`, see *The Strategist*) with their own temperament: Sauron, Théoden, the Rider in Black and
Burglar Bilbo are Raiders, Saruman, Denethor, Elrond and Old Man Willow are Wardens, the rest Tricksters. The match lives in memory: reloading the page starts a
new one. **The CPU knows nothing about your decks or your hand:** it sees your cards when you play
or reveal them, how many you hold, and what you did, as a person across the table would.

**An opponent's own setup:** an opponent may have a `setup` in `src/paigow/personas.js` (read with
`opponentSetup`): `pack`, cards its booster always holds (each takes the place of the last card of its
rarity, so the pack stays 15 cards: `withCards` in `src/paigow/paigow.js`); `library`, cards shuffled into
its library at the start of every round, after its hand of five (the Game's `shufflesIn` option); and
`battlefield`, permanents it starts every round with (the Game's `startsWith` option, like Samwise's ring).
Old Man Willow and the Rider in Black have one. The Rider's packs always hold three *Nazgûl*. Old Man Willow's pack always holds *Old Man Willow*, and he starts every round
with 5 Forests on the battlefield and 5 more in his library, so he draws one each turn (and his card, whose
power and toughness are the lands he controls, starts at 5/5 and grows with each he plays).

**Rings of Power:** every hero and every opponent has one planeswalker power, shown in the app as
a Ring of Power: an emblem in `src/cards/emblems.js` (see *Emblems*) named by their `emblem` in
`src/paigow/personas.js`, with the ring's name as the emblem's `name` and the power's own name as its
`power`. Each bearer has their ring from the story where they had one (the Three, the Ring of Barahir,
and the One Ring under its names: *the magic ring* of The Hobbit, Gollum's *birthday
present*, Sauron's Ruling Ring); the rest are made up. A ring can be used once a turn, uses the stack,
and costs nothing or a little life (mana means nothing here). Samwise's is passive instead: the emblem's
`startsWith` cards are put onto the battlefield before the first turn, like a Leyline (so their "when this enters"
abilities don't trigger). Old Man Willow's and the Rider in Black's are passive too: the emblem's `triggeredAbilities` trigger like a permanent's,
from the command zone. So is Gildor's: the emblem's `shufflesIn` cards are shuffled into the library as the first
turn begins, after the opening hands. And Radagast's: the emblem's `staticAbilities` work as a card's do, from the command zone:
one changes the rules (`{ rule: 'flashForCreatures' }`), one is an anthem. They're placeholders to tune:

| Who | Ring | Power | What it does |
| --- | --- | --- | --- |
| Frodo | The One Ring | The Burden | 0: The Ring tempts you. Sorcery speed. |
| Strider | The Ring of Barahir | Ranger of the North | 0: Target creature's power becomes 4 until your next turn (yours or theirs). Sorcery speed. |
| Samwise | Field-Tested Frying Pan | (passive) | Start the game with Field-Tested Frying Pan on the battlefield. |
| Radagast | The Ring of Rhosgobel | Friend of Beasts | (passive) You may cast creature spells as though they had flash. Birds and Beasts you control get +1/+1. |
| Merry | The Ring of Buckland *(made up)* | Halflings of the Shire | Sacrifice a Food: Create two 1/1 white Halfling creature tokens. Sorcery speed. |
| Pippin | The Ring of the Tooks *(made up)* | Second Breakfast | 0: Create a Morsel token (a Food artifact with "{T}, Sacrifice this artifact: You gain 1 life"). Sorcery speed. |
| Birthday Bilbo | Gollum's Birthday Present | Eleventy-First Birthday | 0: You gain 1 life. Sorcery speed. |
| Burglar Bilbo | The Magic Ring | Burglar's Stealth | 0: Target creature you control gets +1/+0 and menace until end of turn. Sorcery speed. |
| Gandalf | Narya | You Shall Not Pass | 0: Tap target creature an opponent controls. Sorcery speed. |
| Old Man Willow | The Withywindle Ring *(made up)* | Roots of the Old Forest | (passive) At the beginning of each end step, if a creature you controlled died this turn, create a 2/2 green Treefolk creature token. |
| Gildor | The Starlit Ring *(made up)* | A Star Shines on Our Meeting | (passive) At the start of the game, shuffle two Forests and a Chance-Met Elves into your library. |
| Rider in Black | A Ring of the Nine | Hunting the Ring; Drawn to the Ring | (passive) At the beginning of your end step, each opponent who controls a Ring-bearer loses life equal to the number of abilities their Ring has. And a second power: 0: The Ring tempts you. Activate only as a sorcery. |
| Tom Bombadil | Goldberry's Ring *(made up)* | Hey Dol! Merry Dol! | 0: Untap target creature you control; it gets +0/+2 until end of turn. |
| Sauron | The Ruling Ring | Armies of Mordor | 0: Amass Orcs 1. Sorcery speed. |
| Saruman | The Ring of Many Colours *(made up: his own ring, unnamed in the story)* | The Voice | 0: Target creature an opponent controls gets −2/−0 until end of turn. |
| Théoden | The Ring of Eorl *(made up)* | Ride Now! | 0: Target creature you control gets +1/+0 and haste until end of turn. Sorcery speed. |
| Denethor | The Steward's Ring *(made up)* | Despair | Pay 1 life: Each opponent discards a card. Sorcery speed. |
| Elrond | Vilya | Ring of Air | 0: Target creature you control gains hexproof and indestructible until end of turn. |
| Galadriel | Nenya | Light of Eärendil | 0: Put a +1/+1 counter on target creature you control. Sorcery speed. |

Each is written with `power(id, ring, powerName, { text, cost, effects, target, timing })`: change the effects
(any card effect works), the cost (`{ life: n }`), the timing (`SORCERY`, or leave it out for any time),
and the `text` to match. Your power is a button beside your portrait in a round; the opponent's shows
its cost by theirs (hold it to read it). The *vs* screen before a round shows both, and so does tapping
the opponent on the deck builder or either side on the scoreboard. For fast forward, a power that
targets your own creature, or one that can do nothing more (no creature of theirs to target, none of
theirs bigger than Strider's 4 to shrink, no cards for them to discard, the Ring at its last level), doesn't
count as an action.

**The campaign** (`src/paigow/campaign.js`, its screen `app/screens/campaign.js`, from *Campaign* on
the title screen): you choose a hero, then play a Pai Gow match against each opponent in
`CAMPAIGN_OPPONENTS` in turn (for now Birthday Bilbo, Burglar Bilbo, Gandalf, Old Man Willow, Tom Bombadil, Gildor, the Rider in Black,
Elrond, Galadriel, Théoden, Saruman, Denethor, then Sauron; later they may be
drawn from buckets). You have 3 lives: losing a match costs one and you face the same opponent again,
with new boosters; a tied match costs nothing, but you face them again too. Beat an opponent and you
choose a reward: take their Ring of Power, to use alongside your hero's (the match's `rings`), at the cost of
starting every round with 1 less life (`playerLife` in `src/paigow/paigow.js`: 5 and 8, less one per
ring, at least 1), up to 4 rings; or add a common to every booster you open after (`takeCommon`; the
campaign's `extraCommons`, passed to `createMatch` and `openBooster`), so you have more than 15 cards
and leave the spare ones out of your three decks of five (Auto-fill places the strongest first, by
`cardStrength`). Beat them all to win; run out of lives and it's lost. The campaign
is saved in `localStorage` (`istari.campaign`) after every step, its current match with it after each
round, so a reload picks it up where it was (a round in progress starts over).

**Banter:** each opponent talks, in its own voice, in a speech bubble under its portrait.
Its `banter` lists lines (one picked at random, none repeated until all are said) for each
moment: `start` (the match begins, once both hands are kept), `win` and `lose` (the match ends, conceding included), and
the big swings, `comeback` (it was losing and now it's winning) and `collapse` (the other way).
Swings come from `src/ai/banter.js`: once a turn the app scores the board from the CPU's
side with `evaluate` (seeing the player's hand only as a count), averages the last two scores so
it doesn't bounce with whose turn it is, and calls it winning at +15 or more and losing at -15 or
less. A swing is reaching the opposite of the last such mood; in basic-AI games about one game
in five has one.

## The engine

So far the engine models the **turn structure** (phases and steps), **priority**, the **stack**,
**mana pools**, **life totals**, and **combat**. Two cards are hand-written: **Forest** and
**Llanowar Elves** (a 1/1 for {G} with "{T}: Add {G}."); a game with no decks given deals each
player 20 of each.

Players can mulligan their opening hand, pass priority, play a land, cast creatures, activate
abilities, declare attackers and blockers, divide combat damage, and discard when the cleanup step
asks them to.

**Artifacts, enchantments, Auras and Equipment** are implemented too, with targeting,
attachments and "enchanted/equipped creature gets +N/+N and has …" bonuses. The tests use an
*Artifacts & enchantments sampler* (`SAMPLE_PERMANENTS` in `test/fixtures/sampleCards.js`).

**Instants and sorceries** are implemented, with damage, destroy, "+N/+N until end of turn",
draw and gain-life effects. Instants can be cast in response to other spells. See the
*Instants & sorceries sampler* (`SAMPLE_SPELLS`, test fixture).

**Common costs and effects** work for spells, activated abilities and emblems alike:
- Costs: {T}, mana, paying life, "Sacrifice this", "Sacrifice a creature/artifact/…" and
  "Discard a card". Spells can have additional costs ("As an additional cost to cast this spell,
  sacrifice a creature.").
- Effects: damage, destroy, exile, return to hand, tap and untap, +N/+N until end of turn,
  +1/+1 counters, gain and lose life, draw, mill, tokens, counter target spell, and adding mana.
- Tokens: creature tokens, plus the predefined **Treasure**, **Food** and **Clue** artifact
  tokens (`{ type: 'createToken', count, token: 'treasure' }`, see `TOKEN` / `TOKENS`).
- Effects can apply to the target, to you, to each opponent, to each player, to each creature,
  to each creature you control, or to the ability's own source.

The *Costs & effects sampler* (`SAMPLE_EFFECTS`, test fixture) shows them off.

**Triggered abilities:** "When this permanent enters, …" and "When this creature dies, …", with
any of the effects above. See the *Triggered abilities sampler* (`SAMPLE_TRIGGERS`, test fixture).

**Planeswalker's Elf cards** (in the game this engine comes from) brought more:
- **Triggers:** "whenever another creature you control (or another Elf) enters", landfall,
  attacking, blocking, a green spell being cast, and an Aura going to the graveyard.
- **Choices on triggers:** "you may" and "choose one —".
- **Spells and abilities:** flash, cycling, lands that enter tapped, the legend rule, fights,
  returning a card from the graveyard, and "for each" / "where X is" amounts.
- **Evasion and blocks:** "can't be blocked except by creatures with flying" and the like, and
  blocking requirements ("must be blocked if able", "all creatures able to block it do so").
- **Details:** see *Rules implemented*.

**The Lord of the Rings: Tales of Middle-earth (LTR):** 253 of the 261 cards in its boosters are in
the card pool (`cards/ltr-cards.txt`): every common and uncommon, and 72 of the 80 rares and
mythics. They brought:
- **Set mechanics:** the Ring tempts you (the Ring-bearer and the Ring's four abilities), amass
  Orcs, scry, Food, Sagas (lore counters and chapters), and landcycling ("Plainscycling {1}").
- **Keywords:** indestructible, hexproof and ward, "can't be blocked except by three or more
  creatures", and crew for Vehicles.
- **Choices while a spell or ability resolves:** scry, the Ring-bearer, which Army to amass onto,
  discarding (loot), choosing from a revealed hand, searching a library, sacrificing ("each
  opponent sacrifices a creature"), "you may pay {2}", ward payments, and choosing a keyword or a
  creature type.
- **Spells and abilities:** {X} costs, "up to two targets", modal spells, cost reductions
  ("costs {1} less if it targets a legendary creature", "equip costs {1} less"), mana that can
  only be spent on legendary or instant and sorcery spells, abilities that work from the
  graveyard, "if you do" / "otherwise" / "When you do, …", and per-turn conditions ("if a creature
  died this turn", "your second card each turn").
- **Static and replacement effects:** conditional anthems and keyword grants, changing a
  permanent's types or base power and toughness, losing all abilities, control changes, flicker,
  "exile it instead" when it would die, and "that many plus one +1/+1 counters".
- **From the rares and mythics:**
  - **Counters:** keyword counters (Arwen's lifelink counter), stun counters (The Watcher in the
    Water), moving counters (Goldberry), and counters that only matter to their card (hope,
    verse, burden, influence).
  - **Protection** from colors and card types (Éowyn, Fearless Knight; Pippin, Guard of the
    Citadel), and protection from everything for a player (The One Ring).
  - **Turns:** extra turns (Lost Isle Calling) and extra combats (Éomer, Marshal of Rohan).
  - **Casting:** without paying, as an ability resolves (Glamdring, Press the Enemy); from exile
    (Moria Marauder, Shadow of the Enemy) and from the top of the library (Elven Chorus).
  - **Copies:** tokens that copy a card, with exceptions (Sauron, the Necromancer; Shelob).
  - **Mana:** hybrid costs ({W/B}, Frodo, Sauron's Bane), mana that makes a spell uncounterable
    (Delighted Halfling), green mana that stays (Fangorn).
  - **Smaller rules:** goad, ward with a sacrifice cost, "can't be countered", legendary
    instants that need a legendary creature, losing the game as an effect, two modes at once
    (Flame of Anor), draw and life-gain replacements (Phial of Galadriel), lands that enter
    tapped unless you control a legend.
- **Left out**, because they need rules this game doesn't model (each is listed with the reason in
  `cards/ltr-cards.txt`): spell copying (Display of Power, Storm of Saruman, Gandalf the Grey,
  Saruman of Many Colors), phasing (King of the Oathbreakers), triggers that trigger an
  additional time (Gandalf the White), gaining other permanents' activated abilities (Sharkey,
  Tyrant of the Shire), and an opponent splitting cards into face-up and face-down piles
  (Sauron's Ransom).

Two 40-card decks, *LTR: Fellowship* (G/W Hobbits, Food and the Ring) and *LTR: Mordor* (B/R
Orcs and amass), each with a few rares (`LTR_DECKS`, `src/cards/ltrDecks.js`), are used by the AI
tests.

**Where this engine differs from Magic:** players can have innate planeswalker-style
abilities, granted by **emblems** in the command zone (see *Emblems*). Pai Gow gives nobody any.

The combat keywords **haste, first strike, double strike, trample, menace, deathtouch, flying,
reach, lifelink, defender and vigilance** are implemented. The tests also use a
40-card **keyword sampler** deck (`SAMPLE_CARDS` / `SAMPLE_DECK`: 18 Forests and two each of
eleven {G} creatures, one per keyword).

## Running locally

ES modules have to be served over HTTP, so opening the files directly won't work:

```sh
npm run serve        # python3 -m http.server 8000
# open http://localhost:8000/
npm test             # node --test (Node 18+)
```

## The app

`index.html` and `app/` are the game: one page, no build step, aimed at phones held upright
(designed on an iPhone 13 Pro, 390×844, and down to 390×664 with Safari's toolbars showing).
Add it to the home screen to play full screen; the service worker (`sw.js`) caches the app and
card images, so it then works offline. It's registered only when not on localhost, so local
edits show up on reload.

**Screens:** title → choosing your hero → Pai Gow's deck builder (your 15 cards and three decks) → a round (the
battle) → the scoreboard → … → the final score. The title has a settings sheet (sound, animation
speed, auto-pass). The match lives in memory, so reloading starts a new one.

**Playing:**
- **Whose turn:** the badge in the middle lane reads *Your turn* (gold) or *Opponent's turn*
  (red), with the turn number. The active side's half of the board and portrait glow in the
  same color. The prompt says *N attacking* only once the opponent has declared attackers.
- **Tap** a card in hand to see it big, at any time, even while the opponent is thinking or
  playing. A **Play** button appears when it can be played, and the preview stays open, updating,
  until you tap anywhere else (or the card again). **Drag** it
  up to play it, or, for a spell with a target, drag out an arrow and release on the target: the
  arrow snaps to a valid target under your finger and turns red. While you choose a target,
  each valid one wears a reticle and everything else dims.
- **The hand** sits low, its cards' lower halves off the bottom edge, to leave the board more
  room: you see each card's name, cost and the top of its art. A card partly covered by the next
  one fits its name into the strip that shows (or, if it can't at a readable size, leaves it to
  the preview).
- **Mana is automatic:** a play is one tap. The app dry-runs it on a copy of the game, taps
  lands (and Elves, then Treasure) the way the AI would, and asks only about real choices: the
  target, or which creature to sacrifice. You can still tap a creature (or other permanent) for
  mana by hand: tap it and pick its mana ability, to float mana, say before untapping it to tap
  it again.
- **Mulligans:** before the first turn, a sheet shows your opening hand with *Keep 7* and
  *Mulligan to 6* (the London mulligan). After a mulligan, you keep the hand, then tap the cards
  to put on the bottom, one per mulligan. You can close the sheet to look at the board, and the
  main button brings it back.
- **Combat:** tap creatures to attack; to block, tap your creature, then an attacker.
- **Damage assignment** is a choice of which blockers die (`app/battle/damage.js`): splits
  with the same outcome are one choice (the one trampling over the most), and outcomes that
  kill less without dealing more are dropped. With one outcome left it just happens;
  otherwise each choice shows the blockers, the damage each takes, and a skull on those
  that die.
- **The main button** says what passing does: *End turn*, *Attack*, *Resolve*, *Pass*,
  *Attack (2)*, *No blocks*, *Deal damage*.
- **Auto-pass:** like MTG Arena's smart stops, the app passes priority for you unless you could
  act: your main phases, after blocks when you attack (to pump or remove a creature before
  damage), the opponent's spells, the start of their combat (when they have a creature that could
  attack, a last chance to tap or remove it), their attacks, after blocks, and their end step.
  Hold the main button for full control.
- **Long-press** any card to inspect it: real cards show their full Scryfall image, artist
  included. Tap anywhere to close it.
- **The opponent** thinks visibly (a ring around its portrait) only at moments that give nothing
  away, as described under *Search AI*. Its spells are shown big in the middle of the board on
  their way to the stack, so you see what it cast.
- **Weight:** a creature rises and slams down onto the battlefield (a big one shakes the board).
  In combat each attacker lunges at what it hits, blockers strike back, and the damage, life
  totals and deaths land with the blow. A spell's damage flies to its target as a bolt in the
  spell's color. Buffs and life gain sparkle. The board doesn't shake when the system asks for
  reduced motion.

**Screen limits:** rounds use `GAME_LIMITS` (7 cards in hand, 10 creatures, 8 other permanents)
so a whole board always fits. Lands are shown grouped
("Forest ×5, 3 ready"); a side with three creatures or fewer shows them bigger, and one with more
than five switches to two rows of smaller ones.

**No text is cut off:** names, type lines, rules text, ability labels and prompts that don't fit
their box are set smaller until they do (`app/fit.js`), rather than ending in "…".

**Art:** imported cards use Scryfall's images (`image.art` on the board and in hand, `image.card`
when inspecting). Tokens use the art of a matching printed Scryfall token (see *Importing token
art*). Cards without art, such as the samples, get generated art: a gradient in their color with
their type's emblem, and their name on the board. Opponents have a `portrait`:
a printed card's Scryfall art crop, framed on the face (`x`, `y`, `zoom`), with the card and
artist it comes from (see `src/paigow/personas.js`), and so do the heroes.

**Fonts** stand in for the ones printed on cards: Faustina for Beleren (names, type lines and the
interface) and Crimson Pro for MPlantin (rules text), both SIL OFL and vendored in `app/vendor/`
(Latin only, about 125 KB); Cinzel, from Google Fonts, is for titles and banners. Card faces have
light name and type plates with dark text, like a printed card's.

**Attacking and blocking restrictions:** a creature that can't attack, can't block, or can't be
blocked wears a badge on the board ("Can't attack" and "Can't block" in red; "Unblockable",
"Flyers only", "Power 3+ only" and "One blocker" in blue; "Block me" and "Lure", for blocking
requirements, in orange). One that has it only this turn, from a spell or ability, has a gold
outline; one that has it from its Aura or Equipment (Pacifism, Maniacal Rage, Aether Tunnel)
doesn't.

**Choices on sheets:** "choose one —" (the mode, then its target on the board), the legend rule
(which copy stays) and a card in your graveyard (Elvish Regrower) are chosen on a sheet. A "you
may" trigger turns the main button into *Don't*. A fight (Pounce) takes your creature, then
theirs. A card with cycling shows *Cycling {G}* beside *Play* in the hand preview.

**LTR choices:** scry, search and the like show the cards on a sheet: tap the ones to keep (for
scry, in order) and *Done*. The Ring-bearer, an Army or a permanent to sacrifice is picked on the
board, and a card to discard or put on the bottom in the hand. Modes, X, "you may pay" and ward
payments are sheets; "up to two targets" are picked in any order, with *Done* to stop. Tapping
your graveyard count opens your graveyard, with the abilities you can activate from it (it glows
when there are some). The Ring-bearer wears the Ring, and the Ring's level is next to its
player's card counts; a Saga shows its chapter; restricted mana shows as a wildcard pip.

**The rares' choices:** a kind of counter, a card type for protection, a spell to cast for free
(and its targets) are sheets; Mount Doom's "choose up to two creatures" and Mines of Moria's
"exile three cards from your graveyard" are card grids like scry's. Cards you may play from exile
light up your exile count (shown once anything is exiled), and a creature you may cast from the
top of your library lights up your library count: tap either to see them and play them. Stun,
hope, verse, burden and influence counters show as small badges, protection as *Pro* with the
color's or card type's symbol, a goaded creature as *Goaded*, and a player with protection from
everything has a gold ring around their portrait. Hybrid mana ({W/B}) is drawn as a split circle.

**Symbols:** mana costs, {T}, card types, keyword abilities and set symbols (in their rarity's
color) are drawn with the open-source [Mana](https://mana.andrewgioia.com) and
[Keyrune](https://keyrune.andrewgioia.com) fonts by Andrew Gioia, vendored in `app/vendor/`.
- **Size:** they're cut down to the glyphs the app uses, about 12 KB in all.
- **Rules text:** `app/symbols.js` turns "{T}: Add {G}." into symbols, and sets reminder text in
  italics.
- **Adding sets or glyphs:** run `npm run vendor-fonts` (`tools/vendor-fonts.js`), which needs
  fonttools: `pip install fonttools brotli`. `npm run vendor-fonts -- --text` fetches only the
  text fonts, and `-- --symbols` only the symbol fonts.

**Performance**, especially for older iPhones:
- **Animation:** everything animates only `transform` and `opacity` (Web Animations), and glows
  are pseudo-elements whose opacity changes.
- **Rendering:** each card keeps one element for its whole life and moves between zones with
  FLIP.
- **Updates:** each state is one render with one layout read; text fitting measures only the
  faces that were redrawn, in one batch on the next frame.
- **Effects** (impacts, sparks, bolts) are a handful of small elements each, removed when done.
- **The AI** thinks in a Web Worker.
- **Catching up:** the board plays the engine's events back as a queue, which speeds up when it
  falls behind and skips ahead when far behind.
- **Measured:** in Chromium emulating an iPhone 13 Pro with the CPU slowed 4× (roughly a phone's
  speed) and real card art:
  - typical renders take 10–35 ms, and the slowest about 100 ms, when the first board appears
  - a tap that plays a card takes about 60 ms, and a CPU move about 35 ms
  - image decoding totals about 0.2 s over a minute of play

**Code:**
- `app/main.js`: the router and settings
- `app/screens/`: the title, heroes, Pai Gow (deck builder and scoreboard) and battle screens
- `app/battle/`:
  - `Battle.js`: the game, input and the animation queue
  - `BoardView.js`: rendering and FLIP
  - `fx.js`: effects (moves, slams, lunges, bolts, impacts, banners)
  - `play.js`: one-tap plays
  - `autopass.js`: smart stops and the main button
- `app/cardView.js` and `app/art.js`: how cards look, and portraits
- `app/fit.js`: text that shrinks to fit its box
- `app/overlays.js`: sheets, inspect, deck viewer and settings
- `app/audio.js`: synthesized sound

`play.js` and `autopass.js` are plain logic and are tested in Node (`test/app.test.js`).
`tools/make-icons.js` renders the home-screen icons from `app/icons/icon.svg`.

## Importing cards from Scryfall

`tools/import-cards.js` is a Node command-line tool (Node 18+, no dependencies) that pulls card
definitions from the [Scryfall API](https://scryfall.com/docs/api) into
`src/cards/importedCards.js`. That file is merged into `CARDS`. The site never loads anything
from `tools/`.

```sh
npm run import-cards -- "Serra Angel" "Vampire Nighthawk"
npm run import-cards -- "Shock (M21)"                      # a particular printing (for its art)
npm run import-cards -- --file cards/ltr-cards.txt         # one card per line, # for comments
npm run import-cards -- --query "set:fdn t:creature c:g"   # any Scryfall search
npm run import-cards -- --dry-run "Birds of Paradise"      # report only, write nothing
```

### Importing token art

`tools/import-tokens.js` (`npm run import-tokens`) finds every token the cards and emblems can create, plus
Treasure, Food, Clue and Morsel, and writes the art of a matching Scryfall
token to `src/cards/tokenArt.js` (`TOKEN_PRESENTATION`, keyed by the card id the game gives the
token: `tokenCardId`).
- **Matching:** the Scryfall token must have the same name, type line, power/toughness, colors
  and keywords, and no other rules text.
- **Borrowed art:** a token with no exact printing names one with `artScryfallId`: Morsel (made up) uses
  LTR's breakfast-pan Food, Old Man Willow's 2/2 Treefolk the */* Treefolk of TLTC 13.
- **Which printing:** the token printed alongside a card that creates it (Scryfall's related
  cards), else the newest regular printing from a token set.
- **Re-running** keeps the tokens' current art and adds the new ones; `--refresh` picks every
  printing again, and `--dry-run` writes nothing. A test fails when a token has no art, so run it
  after adding a card that makes a new kind of token.

A card is only imported if the engine supports everything it does:
- It's a single-faced creature, land, artifact, enchantment, instant or sorcery, with no
  supertype other than Basic or Legendary (a legendary card may call itself by its short name,
  "Dwynen").
- Its mana cost uses only generic and {W}{U}{B}{R}{G}{C} symbols.
- Its power and toughness are fixed numbers.
- Its rules text is only:
  - supported keywords (flash on any spell), and "CARDNAME can't block." / "CARDNAME can't be
    blocked." / "… can't be blocked except by creatures with flying." / "… by creatures with
    power 2 or less." / "… by more than one creature." / "CARDNAME must be blocked if able." /
    "All creatures able to block CARDNAME do so."
  - "CARDNAME enters tapped.", "Cycling {G}" and "This spell costs {X} less to cast, where X is
    the total power of creatures you control." (Ghalta)
  - activated abilities, "<cost>: <effect>", optionally ending "Activate only as a sorcery."
  - triggered abilities, "When CARDNAME enters [the battlefield], <effect>" and "When CARDNAME
    dies, <effect>". Elvish Visionary, Wall of Omens, Flametongue Kavu and Doomed Traveler
    import; Blood Artist ("Whenever … another creature dies") doesn't. Also:
    - "When CARDNAME is put into a graveyard from the battlefield" (Audacity; Rancor's "return
      Rancor to its owner's hand" isn't supported)
    - "Whenever CARDNAME attacks [or blocks]"
    - "Whenever another creature you control enters" and "Whenever another Elf enters"
      (anyone's)
    - "[Landfall —] Whenever a land you control enters"
    - "Whenever a player casts a green spell"

    The effect may start "you may" (Reclamation Sage), or be "choose one —" followed by
    bullet lines, one per mode (Inspiring Bard, Elder Gargaroth).
  - for Auras and Equipment, "Enchant creature", "Enchanted/Equipped creature gets +N/+N and
    has …", optionally ending "… and can't block" ("can't attack or block", "can't attack",
    "can't be blocked"), and "Equip {N}". Pacifism, Maniacal Rage, Crippling Blight and Aether
    Tunnel import. "When this Aura enters, …" works like any other enters trigger (Divine Favor).
  - anthems and lords, on any permanent: "[Other] [white | <creature type>] creatures you control
    get +N/+N [and have …]." Glorious Anthem, Honor of the Pure, Benalish Marshal ("Other
    creatures …"), Captain of the Watch and Veteran Swordsmith ("Other Soldier creatures …")
    import. Crusade ("White creatures get +1/+1.", everyone's) doesn't. "Other Elves you control
    get +1/+1." (Canopy Tactician) imports too.
  - Alpha Status's "Enchanted creature gets +2/+2 for each other creature on the battlefield that
    shares a creature type with it."
- For instants and sorceries, every sentence must be a supported effect, with at most one
  target in total (a fight has two), plus optionally "As an additional cost to cast this spell,
  <cost>."

The grammar is in `tools/scryfall/rulesText.js`.
- **Costs:** {T}, mana symbols, "Pay N life", "Sacrifice CARDNAME", "Sacrifice a creature"
  (artifact, enchantment, land, permanent) and "Discard a card".
- **Effect sentences** (the card's own name or "this creature" can stand in for CARDNAME):
  - "CARDNAME deals N damage to any target / target creature / target player / each creature /
    each opponent / …"
  - "Destroy / Exile target creature / target artifact or enchantment / target nonland
    permanent / all creatures / …"
  - "Return target creature to its owner's hand."
  - "Tap / Untap target creature."
  - "Target Elf you control …" and "another target Elf you control …"
  - "Return target permanent card from your graveyard to your hand."
  - "Target creature you control fights target creature you don't control."
  - Creatures in combat can be targets: "target attacking creature" and "target attacking or
    blocking creature" (Divine Verdict, Gideon's Reproach).
  - "Target creature / Creatures your opponents control / … can't block this turn." and "…
    [gets +N/+N and] can't be blocked this turn."
  - "Target creature / Creatures you control / CARDNAME gets +N/+N [and gains …] until end of
    turn."
  - "Put a +1/+1 counter on …" and "Put a +1/+1 counter on each green creature that entered this
    turn." (Oran-Rief)
  - "Target creature gets +X/+X until end of turn, where X is the number of Elves on the
    battlefield."
  - "You / Target player / Each opponent gain(s) / lose(s) N life [for each attacking Elf you
    control]."
  - "[Target player] draws / mills N cards."
  - "Create N P/T <color> <type> creature tokens [with <keywords>]."
  - "Create N Treasure / Food / Clue tokens." and "Investigate."
  - "Counter target [creature / noncreature] spell."
  - "Add {B}{B}{B}.", "Add one mana of any color." and "Add {G} for each Elf you control / Elf on
    the battlefield / creature you control."
  - "<effect> and create <tokens>.", which is read as two sentences, e.g. "Draw two cards and
    create two Treasure tokens."
  - "<effect> and <effect>.", also read as two sentences.
    - Both may have subjects: "Target opponent loses 3 life and you gain 3 life."
    - The second may take the first's subject: "Target player draws two cards and loses 2 life."
      reads as "… draws two cards." and "Target player loses 2 life.", the same target, not a
      second one.

**Examples:**
- **Imports:** Prodigal Sorcerer, Mogg Fanatic, Mind Stone, Shivan Dragon, Greed, Counterspell,
  Unsummon, Naturalize, Dark Ritual, Raise the Alarm, Pyroclasm, Wrath of God, Overrun, Lava
  Spike, Thought Scour, Village Rites, Bone Splinters, Bake into a Pie, Big Score, Birds of
  Paradise, Sign in Blood, Vampire Sovereign, Phantom Warrior and Siegebreaker Giant.
- **Rejected:** Royal Assassin ("target tapped creature"), Fling ("damage equal to …") and
  Gilded Lotus ("three mana of any one color").

Every other card is skipped, and the report says what isn't supported, for example:

```
Not imported — uses things the game doesn't support yet (2):
  - Birds of Paradise
      Unsupported rules text: "{T}: Add one mana of any color."
  - Thalia, Guardian of Thraben
      Unsupported rules text: "Noncreature spells cost {1} more to cast."
```

Card names are looked up 75 at a time with Scryfall's collection endpoint. If Scryfall rate-limits
the importer, it waits and tries again. A line can pin a printing: `Shock (M21)`, `Shock|m21`, or
`4 Shock (M21)` (the count is ignored). Behind a proxy, run Node with `NODE_USE_ENV_PROXY=1`
(Node 22.21+), because Node's `fetch` ignores `HTTPS_PROXY` otherwise.

The card pool is the LTR cards in `cards/ltr-cards.txt`, plus the basic lands in their LTR
printings (`"Plains (LTR)"` and so on). Forest and Llanowar Elves are defined by hand, so for those
the importer records only their art, in `CARD_PRESENTATION`.

Each imported card also keeps what the app needs to show it: `image: { art, card }` (Scryfall's
art crop and full-card image URLs, loaded from Scryfall's image CDN), `artist`, `colors`, `rarity`, `set` and `collectorNumber`.

The exit code is 1 when anything was skipped or not found. Re-importing a card updates it. Cards
defined by hand in `src/cards/cards.js` (Forest, Llanowar Elves) aren't overwritten. The
importer's tests use hand-written card objects in Scryfall's format
(`test/fixtures/scryfallCards.js`), so they don't need network access.

### LTR and per-card overrides

```sh
NODE_USE_ENV_PROXY=1 npm run import-cards -- --file cards/ltr-cards.txt
npm run import-tokens    # Orc Army, Spirit, Human Soldier, Ballistic Boulder, …
```

LTR needed more grammar in `tools/scryfall/rulesText.js` and `convert.js`:
- **Sentences:** "Scry N.", "The Ring tempts you.", "Amass Orcs N.", "Draw a card, then discard a
  card.", "Search your library for a basic land card …", "put it into its owner's library second
  from the top", "Return target creature card from your graveyard to your hand.", "… deals
  damage equal to its power to …" (bite), and tokens that enter tapped.
- **Targets:** several targets in one spell ("up to two target creatures"), {X} in costs and
  amounts, and more kinds: nontoken creatures, legendary creatures you control, artifacts or
  lands, artifacts, enchantments and creatures with flying, historic nonland permanents, and
  "it" / "that creature" for the trigger's subject.
- **Triggers:** "At the beginning of your end step / your upkeep / combat on your turn",
  "Whenever the Ring tempts you", "Whenever you scry", "Whenever you draw your second card each
  turn", "Whenever you cast an instant or sorcery spell", "Whenever a creature an opponent
  controls dies", "Whenever CARDNAME attacks or blocks / becomes blocked / deals combat damage to
  a player", "When CARDNAME [enters or] leaves the battlefield", and "This ability triggers only
  once each turn."
- **Other lines:** "Ward {N}", typecycling and landcycling ("Plainscycling {1}"), Sagas.

Cards whose abilities are one of a kind get **per-card overrides** in
`tools/scryfall/overrides.js` (198 of the 253 LTR cards, every rare and mythic among them):
hand-written rules data, keyed by card name, in the format of `src/cards/cards.js`. The importer
takes everything else (types, cost, art, rarity) from Scryfall as usual, and uses the override
instead of parsing the rules text; fields it doesn't read itself (`entersTappedUnless`,
`entersWithCounters`, `cantBeCountered`, `chooseTwo`) are copied into the definition as they are.
Re-running the import keeps them. Token art matching allows a legendary token with abilities of
its own (Smaug).

## GitHub Pages

The site is served from the root of the `main` branch. To turn it on, go to
**Settings → Pages → Build and deployment**, pick **Deploy from a branch**, then choose
`main` and `/ (root)`. The `.nojekyll` file makes Pages serve the files as they are.

## Engine architecture

```
           action events                          state + transition events
 controller ───────────────▶  Game (EventEmitter)  ───────────────────────────▶ UI / AI / logs
 (UI, AI)   ◀───────────────────────────────────────────────────────────────── (listeners)
                          state.validActions tells each controller what it may do
```

The `Game` emits events and also listens for them:

- **Output:** a `state` event every time the game stops to wait for input. Its payload is a full
  snapshot (a deep copy) that includes `validActions`, so a client can be built entirely from
  `state` events: show a button for each valid action and send it back unchanged.
- **Input:** `game.dispatch(action)`, or `game.listenTo(emitter)`, which dispatches every `action`
  event the emitter emits. An action dispatched from inside a listener is queued and runs once
  the current action has finished, so listeners never re-enter the engine.

```js
import { Game, BasicAIController, passPriority, playLand, activateAbility, castSpell } from './src/index.js';

const game = new Game({
  players: [{ id: 'p1', name: 'You' }, { id: 'p2', name: 'Opponent' }],
  // decks: { p1: ['forest', ...] }, // optional; defaults to 20 Forests + 20 Llanowar Elves
  // seed: 42,                       // optional; makes shuffles reproducible
  // cards: { myCard: {...} },        // optional; extra card definitions (e.g. SAMPLE_CARDS)
  // shuffleLibraries: false,        // optional; keep decks in order (first 7 = opening hand)
  // emblems: { p1: ['planeswalker'] }, emblemDefinitions: {...}, // optional; see Emblems
  // startingLife: { p2: 25 },       // optional; per player, default 20
  // limits: GAME_LIMITS,            // optional; caps so a board fits on a phone (see Limits)
});

game.on('state', (state) => {
  console.log(state.turn, state.phase, state.step, state.priorityPlayerId, state.validActions);
});
new BasicAIController({ game, playerId: 'p2', delayMs: 300 }); // listens to state, emits action

game.start();
game.dispatch(passPriority('p1'));                 // upkeep → precombat main
game.dispatch(playLand('p1', 'p1-3'));             // card ids are `${ownerId}-${n}`
game.dispatch(activateAbility('p1', 'p1-3', 'tapForG'));
game.dispatch(castSpell('p1', 'p1-7'));            // a Llanowar Elves in hand
```

### Actions

| Action | Valid when |
| --- | --- |
| `{ type: 'PASS_PRIORITY', playerId }` | the player has priority |
| `{ type: 'PLAY_LAND', playerId, cardId }` | it's the player's main phase, they have priority, the stack is empty, and they haven't played a land this turn. There is one entry per land in their hand |
| `{ type: 'ACTIVATE_ABILITY', playerId, cardId, abilityId, targets?, costChoices? }` | the player has priority, controls the permanent or emblem (`cardId` is its id), and can pay the ability's cost (e.g. it's untapped for a {T} cost, and there's enough mana in their pool). Emblem abilities also respect their timing and per-turn limit. There is one entry per ability that can be activated, and one per legal target for abilities that target (e.g. equip). Cycling is activated the same way from the hand, with the card's id |
| `{ type: 'CAST_SPELL', playerId, cardId, targets?, costChoices? }` | the mana cost is already in the player's pool, and the timing fits: instants (and spells with flash) whenever the player has priority, everything else at sorcery timing (their main phase, with priority and an empty stack). There is one entry per castable card. A spell that targets (an Aura, a Shock, ...) has one entry per legal target, with `targets: [id]`, where the id is a permanent's, a player's, or (for counterspells) a spell's stack object id. A fight has one entry per pair, `targets: [yours, theirs]` |
| `{ type: 'TOGGLE_ATTACKER', playerId, cardId }` | declare attackers step (`pendingDecision.type === 'declareAttackers'`): adds the creature to, or removes it from, `pendingDecision.attackers`. There is one entry per creature that can attack |
| `{ type: 'CONFIRM_ATTACKERS', playerId }` | declare attackers step: locks in the attack, which can be empty |
| `{ type: 'SET_BLOCKER', playerId, cardId, attackerId }` | declare blockers step (`'declareBlockers'`): the creature blocks that attacker, or blocks nothing when `attackerId` is `null`. Updates `pendingDecision.blocks` |
| `{ type: 'CONFIRM_BLOCKERS', playerId }` | declare blockers step: locks in the blocks |
| `{ type: 'ASSIGN_COMBAT_DAMAGE', playerId, attackerId, assignment }` | a combat damage step (`'assignCombatDamage'`), when an attacker has more than one legal split: several blockers, or trample. `assignment` maps blocker ids (and, with trample, the defending player's id) to damage. There is one entry per legal split |
| `{ type: 'DISCARD', playerId, cardId }` | the cleanup step is waiting for the active player to discard down to 7 (`state.pendingDecision`). There is one entry per card in their hand |
| `{ type: 'CHOOSE_TARGETS', playerId, targets }` | a triggered ability with more than one legal target is being put on the stack (`'chooseTargets'`); its controller picks one. There is one entry per legal target, and for a "you may" ability (`optional`), even with one target, a decline: `targets: []` |
| `{ type: 'CHOOSE_MODE', playerId, mode, targets? }` | a "choose one —" ability is being put on the stack (`'chooseMode'`, with its `modes` and `options`): one entry per mode, and per legal target of a mode that targets |
| `{ type: 'KEEP_LEGEND', playerId, cardId }` | the legend rule (`'legendRule'`): the player controls legendary permanents with the same name (`cardIds`) and keeps one; the others go to the graveyard |
| `{ type: 'KEEP_HAND', playerId }` | before the first turn, in a game with `mulligans: true` (`'mulligan'`): keep the hand. With `pendingDecision.mulligans` taken, it's then `'putOnBottom'` with that `count` |
| `{ type: 'MULLIGAN', playerId }` | the same decision, with fewer than 7 mulligans taken: shuffle the hand into the library and draw a new 7 |
| `{ type: 'PUT_ON_BOTTOM', playerId, cardId }` | `'putOnBottom'`: put a card from the hand on the bottom of the library. There is one entry per card in their hand |

An action is accepted only if it equals one of `state.validActions`.

Costs that need a choice, like "sacrifice a creature" or "discard a card", work like targets:
there's one entry per option, with `costChoices: { sacrifice: [id] }` or
`costChoices: { discard: [id] }`. Likewise, "add one mana of any color" (a Treasure, Birds of
Paradise) has one entry per color, with `manaColor: 'W' | 'U' | 'B' | 'R' | 'G'`. Targets and cost choices combine, so Bone Splinters gets one
entry per (creature to destroy, creature to sacrifice) pair.

Attackers and blockers are declared one creature at a time and then confirmed, rather than in a
single action. That way every choice is a concrete entry in `validActions`: listing every
possible set of attackers or blocks up front could run to thousands of entries. The declaration
counts once it's confirmed.

### State

The `state` event payload includes `players[]`, each with `life`, `library`, `hand`, `graveyard`,
`exile`, `manaPool` (`{ W, U, B, R, G, C }`), `landsPlayedThisTurn` and `hasLost`. It also includes:
- `battlefield`: permanents carry `controllerId`, `tapped`, `summoningSick`, `damage`,
  `damagedByDeathtouch`, `counters` (e.g. `{ '+1/+1': 2 }`), `abilities` and `keywords`, and
  creatures also carry `power` and `toughness`. Tokens have `token: true` and `colors`
- `stack`: spells and abilities; the last element is the top
- `pendingTriggers`: abilities that have triggered but aren't on the stack yet
- `combat`: `declaredAttackers` (ids), and `attackers: [{ cardId, defendingPlayerId, blocked, blockerIds, damageAssignment }]`
- `pendingDecision` `status` (`notStarted` / `inProgress` /
`gameOver`), `winnerId`, and the turn and priority fields.

The state is deliberately not filtered per player: libraries (in order) and every hand are
included. The game is single-player and runs entirely in the browser, so there is no one to hide
information from, and the UI decides what to show.

### Events

Every payload carries a `seq` number that increases for each event the game emits.

| Event | Payload | When |
| --- | --- | --- |
| `gameStarted` | `players`, `startingPlayerId` | `start()` is called |
| `turnStarted` / `turnEnded` | `turn`, `activePlayerId` | turn boundaries |
| `phaseStarted` / `phaseEnded` | `phase`, `phaseName`, ... | phase boundaries |
| `stepStarted` / `stepEnded` | `step`, `stepName`, ... | step boundaries (main phases have no steps) |
| `stepSkipped` | `step`, `stepName`, ... | a step is skipped (see below) |
| `priorityGranted` | `playerId` | a player receives priority |
| `priorityPassed` | `playerId` | a player passes priority |
| `libraryShuffled` | `playerId` | at game start |
| `cardsDrawn` | `playerId`, `cardIds`, `librarySize` | opening hand, draw step |
| `landPlayed` | `playerId`, `card` | a land enters the battlefield |
| `spellCast` / `permanentEntered` | `playerId`, `cardId`, `manaPaid`, `stackObjectId` / `card` | a spell is cast / resolves onto the battlefield |
| `attackersDeclared` / `blockersDeclared` | `attackers`, `defendingPlayerId` / `blocks: [{ blockerId, attackerId }]` | a declaration is confirmed (or there was nothing to declare) |
| `combatDamageDealt` | `step`, `damage: [{ sourceId, targetPlayerId \| targetCardId, amount }]`, `lifeGained`, `life` | each combat damage step (first-strike and regular) |
| `creatureDied` | `cardId`, `cardName`, `controllerId`, `reason` (`lethalDamage` / `deathtouch` / `zeroToughness`) | a creature dies from a state-based action |
| `abilityActivated` | `playerId`, `cardId`, `abilityId`, `text`, `costPaid`, `usesStack`, `stackObjectId?` | an ability is activated and its cost is paid |
| `manaAdded` | `playerId`, `mana`, `manaPool` | mana is added to a pool |
| `stackObjectResolving` / `stackObjectResolved` | `stackObject` / `stackObjectId` | the top of the stack resolves |
| `manaPoolsEmptied` | `pools: [{ playerId, lost }]` | a step or phase ends with mana in a pool |
| `permanentsUntapped` | `playerId`, `cardIds` | untap step, if anything was tapped |
| `decisionRequired` | the new `pendingDecision` | a player must keep or mulligan, put cards on the bottom, declare attackers or blockers, divide damage, or discard |
| `cardDiscarded` | `playerId`, `cardId` | a card is discarded (to hand size, or as a cost) |
| `mulliganTaken` | `playerId`, `mulligans` | a player mulligans (then draws a new hand) |
| `handKept` | `playerId`, `mulligans` | a player keeps their hand |
| `cardPutOnBottom` | `playerId` | a kept hand's card goes to the bottom of the library (which card isn't said) |
| `damageDealt` | `sourceId`, `targetPlayerId \| targetCardId`, `amount` | a spell or ability deals damage |
| `permanentDestroyed` / `permanentExiled` / `permanentReturnedToHand` | `cardId`, `cardName`, `sourceId`, ... | a permanent is destroyed, exiled or bounced |
| `permanentSacrificed` | `cardId`, `cardName`, `controllerId` | a permanent is sacrificed to pay a cost |
| `permanentTapped` / `permanentUntapped` | `cardId`, `sourceId` | an effect taps or untaps a permanent |
| `temporaryEffectCreated` / `temporaryEffectsEnded` | the effect / `effectIds` | a pump starts / "until end of turn" effects end in cleanup |
| `countersAdded` | `cardId`, `counter`, `count`, `counters` | counters are put on a permanent |
| `tokenCreated` | `playerId`, `card`, `sourceId` | a token enters the battlefield |
| `spellCountered` | `stackObjectId`, `cardId`, `cardName`, `sourceId` | a spell is countered |
| `lifeGained` / `lifeLost` | `playerId`, `amount`, `life` | an effect changes a life total |
| `cardsMilled` | `playerId`, `cardIds`, `librarySize` | cards are milled |
| `stackObjectFizzled` | `stackObjectId`, `reason` | a spell or ability's targets are all illegal |
| `drawFromEmptyLibrary` / `playerLost` / `gameEnded` | `playerId` / `reason` / `winnerId` | a player decks out |
| `actionAccepted` / `actionRejected` | `action` (+ `reason`) | an action is processed |
| `abilityTriggered` | the trigger: `id`, `sourceId`, `sourceName`, `controllerId`, `trigger`, `text`, `effects`, `targetKind` | a triggered ability triggers |
| `triggeredAbilityPutOnStack` / `triggeredAbilityRemoved` | `triggerId`, `sourceId`, `stackObjectId`, `targets` / `reason` | it's put on the stack, or removed for lack of a legal target (or declined: `'Declined.'`) |
| `modeChosen` | `triggerId`, `sourceId`, `mode`, `text` | a "choose one —" ability's mode is chosen |
| `cardCycled` | `playerId`, `cardId`, `cardName` | a card is cycled (it's also discarded) |
| `fought` | `cardIds` | two creatures fight (the damage follows as `damageDealt`) |
| `cardReturnedFromGraveyard` | `cardId`, `cardName`, `ownerId`, `sourceId` | a card goes from a graveyard to its owner's hand |
| `permanentToGraveyard` | `cardId`, `cardName`, `controllerId`, `reason` (`auraNotLegallyAttached` / `legendRule`) | a state-based action puts a permanent into the graveyard |
| `state` | full snapshot incl. `validActions`, `version` | the game is waiting for input |

`game.onAny((name, payload) => ...)` receives every event.

### Emblems (this game's planeswalker abilities)

Emblems are defined in `src/cards/emblems.js` (Pai Gow's heroes and opponents have one each, see *Planeswalker
powers*) and given to players with the `emblems` option
(default: `DEFAULT_EMBLEMS`, i.e. `['planeswalker']` for everyone). Each emblem appears in
`state.players[].emblems` with its abilities, `activationsPerTurn` and `activationsThisTurn`.

- Emblems live in the command zone (114.1) and can't be removed. In Magic, emblems only have
  static or triggered abilities. Here they can also have **activated abilities**, which work like
  a planeswalker's loyalty abilities (606.3):
  - **Sorcery timing** (`timing: 'sorcery'`): the player's own main phase, with an empty stack.
    Leave `timing` out to allow activation whenever the player has priority.
  - **Once per turn per emblem** (`activationsPerTurn: 1`): an emblem with several abilities
    allows one of them each turn, the way a planeswalker does. The count resets at the start of
    every turn.
  - They **use the stack**, so the opponent can respond.
- Costs can be nothing (`{}`), life (`{ life: 2 }`, payable only with at least that much life,
  119.4), mana (`{ mana: { G: 1 } }`), or a combination.
- They're activated with the normal `ACTIVATE_ABILITY` action, with the emblem's id
  (e.g. `p1-emblem-1`) as `cardId`.
- Effects: anything an ability can do, plus `{ type: 'gainLife', amount }`, which emits a
  `lifeGained` event.

### Limits (this game's screen-size rules)

So that a whole board fits on a phone screen, a game can impose limits (the `limits` option;
`GAME_LIMITS` is `{ hand: 10, creatures: 10, permanents: 8 }`, and Pai Gow uses it). A game
has none unless asked:
- **Hand:** a card drawn into a full hand, or returned to one, is **burned**: it goes to the
  graveyard, with a `cardBurned { playerId, cardId, cardName, reason: 'draw' | 'returnToHand' }`
  event. A burned draw still appears in `cardsDrawn`.
- **Creatures:** creature spells can't be cast while the player controls that many creatures
  (their creature spells on the stack count too), and creature tokens beyond the cap aren't
  created (`tokensLimited { playerId, count, sourceId }`).
- **Other permanents:** the same for nonland, noncreature permanents (artifacts, enchantments,
  Treasure and other tokens). Lands are unlimited.

Limits survive `serialize()`, `clone()` and `getPlayerView()`, so the AI's simulations obey them.

### Variant rules (Pai Gow)

Options that change the rules, all off unless asked (Pai Gow uses them all):
- `openingHandSize`: cards in an opening hand (default 7).
- `deckingLoss: false`: drawing from an empty library doesn't lose the game (the
  `drawFromEmptyLibrary` event still happens).
- `infiniteMana: true`: every player can pay any mana cost, any number of times. The state's
  `infiniteMana` is true, and each player's `manaPool` shows it as `any: INFINITE_MANA` (mana of
  any color, see `mana.js`), so `canPayMana` agrees. {X} is offered up to `INFINITE_MANA_MAX_X` (20).
  Nothing limits activated abilities, but the AIs leave an ability alone once they've activated
  it `AI_ACTIVATIONS_PER_TURN` (5) times in a turn (`guardActivations` in
  `src/ai/manaPlanning.js`), so a free pump or equip can't keep them busy forever. The count is
  the turn tally's `activations`.
- `stallDraw: true`: the game is a **draw** when a full turn cycle passes with nothing lasting
  changed: at the end of each turn the engine takes a fingerprint of life totals, hands,
  graveyards, exile, library sizes, the Ring, and each permanent's controller, characteristics,
  counters and attachments (not whether it's tapped, nor damage, mana, or "this turn" effects),
  and if it matches the one from two turns before, the game ends. Life gained counts as no change
  (the fingerprint takes each life total less all the life that player has gained), so a free
  life-gain power used each turn doesn't keep a stalled game going; life lost still counts.
- `turnLimit`: the game is a draw when that turn ends.
- The state's `drawWarning` says when the current turn could end in a draw: `'stall'` when the
  last turn changed nothing lasting (so this one ending without a change too is a stall), and
  `'turnLimit'` on the last turn; otherwise null. The board shows it at the top right, under Fast forward.

A drawn game has `winnerId: null` and `gameEnded { winnerId: null, reason: 'stall' | 'turnLimit' }`;
the state's `endReason` says why a game ended (`'playerLost'` otherwise). The AI scores a draw
as 0, between a win and a loss, and since its simulations play by the same rules, it sees a
stall coming. The variant survives `serialize()` and `clone()`.

### Rules implemented

- The turn structure follows CR 500–514: beginning (untap, upkeep, draw), precombat main, combat
  (beginning of combat, declare attackers, declare blockers, combat damage, end of combat),
  postcombat main, and ending (end, cleanup).
- No player receives priority during untap or cleanup (502.4, 514.3).
- The active player receives priority at the start of every other step and main phase (117.3a).
  After a pass, the next player in turn order receives it (117.3d).
- When all players pass in succession with an empty stack, the step or phase ends (117.4, 500.2).
- The player who goes first skips the draw step of turn 1 (103.8a).
- Declare blockers and combat damage are skipped when no creatures attack (508.8).
- Setup: each player shuffles (103.3) and draws an opening hand of 7 (103.5).
- Mulligans (103.5, the London mulligan), when the game is created with `mulligans: true` (Pai Gow
  rounds aren't: every card starts in hand):
  - Each player in turn order, the starting player first, keeps the hand or mulligans.
  - A mulligan shuffles the hand into the library and draws a new 7.
  - On keeping, the player puts one card on the bottom of the library for each mulligan taken.
  - Each player decides in full before the next; in the rules, mulligans are taken together,
    round by round.
  - With `mulligans: false` (the default), everyone keeps the first 7, as before.
- Turn-based actions: the active player untaps their permanents (502.3), draws in the draw step
  (504.1), and discards down to the maximum hand size of 7 in cleanup (514.1, 402.2).
- Playing lands: a special action that doesn't use the stack (116.2a). The active player can do
  it in their main phase while they have priority and the stack is empty (305.1, 505.6b), once
  per turn (305.2). Afterwards the same player gets priority again (117.3c), and the run of
  passes starts over (117.4).
- Activated abilities (602): the player needs priority and must be able to pay the whole cost.
  The cost (tapping and/or mana) is paid automatically. **This differs from the rules:** in Magic
  you announce the ability, choose X, targets and the like, and only then activate mana abilities
  and pay (602.2b, following 601.2b–h). Here the mana must already be in the pool before the
  activation counts as a valid action: `validActions` and `#xValues` look only at the pool
  (plus infinite or restricted mana), never at untapped lands, and there's no step partway
  through activating in which to tap them. The app hides this by dry-running the play and
  tapping lands first (`prepare` and `perform` in `app/battle/play.js`, `payAndAct` in
  `src/ai/macroActions.js`), so a player sees the choices the rules would give, but the order
  isn't the rules' order. One consequence to watch for: when an ability's cost taps, sacrifices
  or exiles its own source, that source must not also be tapped for the mana (`sourcesPaying`
  in `src/ai/manaPlanning.js`), or the ability is never offered (Barad-dûr's
  "{X}{X}{B}, {T}: Amass Orcs X" was hidden this way). A non-mana ability goes on the stack, and
  the player who activated it gets priority (117.3c). When all players pass in succession with
  something on the stack, the top object resolves (117.4, 608). Then the active player gets
  priority (117.3b), and the step continues.
- Mana abilities (605): an ability that adds mana doesn't use the stack. It resolves as soon as
  it's activated (605.3b), and the player keeps priority. Forest's "{T}: Add {G}." works this
  way, so it never appears on the stack.
- Mana pools empty as each step and phase ends (500.4). When an ability's mana cost is paid,
  specific colors are used first; any generic part is then paid from colorless mana, then
  colored.
- Casting creatures: only with sorcery timing (302.1, 307.1). The card moves to the stack and
  its mana cost is paid from the pool (601.2). Mana has to be in the pool before casting:
  activating mana abilities partway through casting (601.2g) isn't modelled. When the spell
  resolves, the creature enters the battlefield (608.3).
- Flash (702.8): a spell with flash (`KEYWORD.FLASH`, `castsAtInstantSpeed`) is cast like an
  instant, creatures and Auras alike.
- Cost reductions (601.2f): `costReduction: { per }` takes the count (see *Counted amounts*) off
  the generic part of the cost. `spellCost` is what a card costs now, for the engine and the AI.
- Lands that enter tapped (`entersTapped`, 614.1c), and cycling (702.29): `handAbilities` are
  activated from the hand with `ACTIVATE_ABILITY`. Cycling's cost is mana plus `discardSelf`;
  it uses the stack and draws a card.
- Summoning sickness (302.6): a creature can't attack, or use abilities with {T} in the cost,
  until its controller has controlled it since the start of their most recent turn. It can
  still block.
- Combat (506–511):
  - In the declare attackers step, the active player chooses among untapped, non-sick creatures
    (508.1a). Attackers tap (508.1f), and in a two-player game they attack the other player.
  - The defending player blocks with untapped creatures (509.1a). Each blocker blocks one
    attacker, and an attacker can have several blockers.
  - An attacker blocked by more than one creature has its damage divided among them by the
    attacking player, in any split (510.1c, as of the Foundations rules update). All combat
    damage is dealt at once (510.2). Unblocked attackers damage the defending player, and a
    blocked attacker whose blockers are gone deals no damage.
  - If nobody attacks, the declare blockers and combat damage steps are skipped (508.8).
    Creatures leave combat as the end of combat step ends (511.3).
  - Keywords (702):
    - **Haste:** the creature can attack and use {T} abilities despite summoning sickness (702.10).
    - **Defender:** the creature can't attack (702.3).
    - **Vigilance:** attacking doesn't tap the creature (702.20).
    - **Flying:** only creatures with flying or reach can block it (702.9, 702.17).
    - **Can't block / can't be blocked:** blocking restrictions (509.1b), written as keywords
      (`KEYWORD.CANT_BLOCK`, `KEYWORD.CANT_BE_BLOCKED`). They're either printed ("This creature
      can't block.") or granted for a turn, like any keyword a pump grants ("Target creature
      can't block this turn.").
    - **Menace:** it can't be blocked by just one creature (702.111). Each `SET_BLOCKER` is offered
      on its own, but `CONFIRM_BLOCKERS` only appears once no menace attacker has exactly one
      blocker.
    - **First strike:** if any attacking or blocking creature has first strike or double strike,
      there's an extra first-strike damage step before the regular one. Players get priority in
      between (510.4).
    - **Double strike:** the creature deals damage in both the first-strike and regular damage
      steps (702.4). A blocked double striker whose blockers died in the first step deals no
      more damage, unless it has trample.
    - **Trample:** the attacker can assign damage to the player only after every blocker is
      assigned lethal damage. That counts damage already marked, and deathtouch makes 1 lethal
      (702.19). If all its blockers are gone, all its damage goes to the player.
    - **Deathtouch:** any damage it deals to a creature destroys it, as a state-based action
      (702.2, 704.5h).
    - **Lifelink:** damage it deals also gains its controller that much life (702.15).
  - Damage assignment: for each attacker, the engine works out every legal split. When there's
    more than one, the attacking player chooses (`ASSIGN_COMBAT_DAMAGE`); when there's exactly
    one, it's applied automatically. Splits are keyed by blocker id, plus the defending player's
    id for trample.
  - Restrictions on blocking (509.1b), written as keywords: `BLOCKED_ONLY_BY_FLYERS` (reach
    doesn't help), `CANT_BE_BLOCKED_BY_POWER_2_OR_LESS` and `MAX_ONE_BLOCKER` (no second
    `SET_BLOCKER` is offered). `canBlockCreature` is shared by the engine and the AI.
  - Requirements (509.1c): `MUST_BE_BLOCKED` ("must be blocked if able") and `LURE` ("all
    creatures able to block it do so"). The blocks must obey as many requirements as any legal
    blocks could, so `CONFIRM_BLOCKERS` appears only then (`blocksLegal` in
    `src/engine/blockRules.js`, an exact search over the creatures that could meet one).
    `legalizeBlocks` turns any plan into the nearest legal one, for the AIs.
  - Other keywords aren't implemented yet.
- Damage on creatures wears off in the cleanup step (514.2).
- Artifacts and enchantments (301, 303) are cast with sorcery timing and resolve onto the
  battlefield. Summoning sickness only affects creatures, so a noncreature artifact can use {T}
  abilities right away. An artifact creature is both types.
- Instants and sorceries (304, 307): instants can be cast whenever their owner has priority,
  including in response to other spells, during combat, and on the opponent's turn. Sorceries
  need sorcery timing. On resolution their `effects` happen in order (608.2c), then the card goes
  to its owner's graveyard (608.2n). Effects:
- Effects (`EFFECT` in `src/cards/cards.js`) are shared by spells, activated abilities and
  emblems. Each applies to what its `affected` field says (`target`, `you`, `eachOpponent`,
  `eachPlayer`, `eachCreature`, `eachCreatureYouControl`, or `source`, the ability's own
  permanent). Without it, targeted effect types apply to the target, and the rest to "you".
  - `dealDamage`: to a creature (marked damage, so state-based actions kill it) or to a player
    (life loss). If the source is a permanent with deathtouch or lifelink, those apply (702.2,
    702.15).
  - `destroy` (701.7), `exile` (701.5) and `returnToHand`: move a permanent to its owner's
    graveyard, exile zone or hand.
  - `tap` and `untap` (701.21).
  - `pump`: +N/+N (or -N/-N) and keywords until end of turn (611.2). It ends in the cleanup
    step at the same time damage wears off (514.2), or earlier if the creature leaves the
    battlefield. Active ones are in `state.temporaryEffects`.
  - `addCounters`: +1/+1 counters (122), which last until the permanent leaves the battlefield.
  - `drawCards`, `gainLife`, `loseLife`, `mill` (701.13) and `addMana`, for players.
    `addMana` takes either `mana` or `anyColor: n`, where the color comes from the action's
    `manaColor`.
  - `createToken`: tokens (111) owned by the player who creates them. A token that leaves the
    battlefield ceases to exist (111.7, 704.5d), so it never shows up in a graveyard, hand or
    exile. `token` is either a creature token's description
    (`{ colors, subtypes, power, toughness, keywords }`) or a predefined token (111.10):
    - `'treasure'`: "{T}, Sacrifice this artifact: Add one mana of any color." That's a mana
      ability, so it doesn't use the stack.
    - `'food'`: "{2}, {T}, Sacrifice this artifact: You gain 3 life."
    - `'morsel'` (made up, for Pippin's power): a Food with "{T}, Sacrifice this artifact: You gain 1 life."
    - `'clue'`: "{2}, Sacrifice this artifact: Draw a card."

    They're colorless artifacts, so they can use {T} abilities the turn they're created.
  - `counterSpell`: the countered spell goes to its owner's graveyard (701.6).
  - `fight` (701.14): a spell's first target and second each deal damage equal to their power
    to the other; if either is gone or no longer a legal target, neither does. A spell with
    several targets lists their kinds in `targets` instead of `target`; each is checked again on
    resolution, keeping its place.
  - `returnFromGraveyard`: the target card (`TARGET.PERMANENT_CARD_IN_YOUR_GRAVEYARD`) goes to
    its owner's hand.
  - Counted amounts (608.2h): `per: { of: 'creatures' | 'power', controller?, subtypes?,
    attacking?, other?, sharesTypeWith? }` on an effect multiplies its amounts (damage, life,
    cards, +N/+N, mana) by a count made as it happens: "Add {G} for each Elf you control",
    "where X is the number of Elves on the battlefield". `countOf` makes the count.
  - `filter: { colors?, subtypes?, enteredThisTurn? }` narrows the creatures an "each creature"
    effect affects: Oran-Rief's "each green creature that entered this turn".
- Costs (118, 601.2f–h, 602.2b): {T}, mana, life, `sacrificeSelf`, `sacrifice` (a permanent
  kind) and `discard` (a number of cards). A spell's `additionalCost` is paid after its mana
  cost. A sacrificed source is gone before the ability resolves, but the ability still
  resolves; effects on "this permanent" then do nothing.
- Targets (115): spells and abilities that target list one valid action per legal target. When
  one resolves, its targets are checked again, and if they're all illegal it doesn't resolve
  (608.2b). A spell that doesn't resolve goes to its owner's graveyard (`stackObjectFizzled`).
  Target kinds (`TARGET`):
  - creatures: `creature`, `creatureYouControl`, `creatureOpponentControls`, `elfYouControl`
  - other permanents: `artifact`, `enchantment`, `artifactOrEnchantment`, `land`,
    `nonlandPermanent`, `permanent`
  - players: `player`, `opponent`, and `any` (a creature or a player)
  - spells on the stack: `spell`, `creatureSpell`, `noncreatureSpell`
  - cards: `permanentCardInYourGraveyard`
  
  Abilities can target their own source, except Auras and Equipment attaching to themselves.
- Auras (303.4): "Enchant creature" Auras target a creature when cast and enter attached to it.
  An Aura that's attached to nothing, or to something it can't enchant, goes to its owner's
  graveyard (704.5m). "Enchanted creature can't attack or block." (Pacifism) grants the
  restrictions `KEYWORD.CANT_ATTACK` (508.1c: it isn't an eligible attacker, like defender) and
  `KEYWORD.CANT_BLOCK`. Card instances carry their `staticAbilities`, so the AI and the app can
  read them.
- Equipment (301.5): enters unattached. "Equip {N}" (702.6) is a sorcery-speed ability that
  targets a creature you control. It uses the stack and moves the Equipment if it's already
  attached. If the creature leaves, the Equipment stays on the battlefield, unattached (704.5n).
- Continuous effects (613): each permanent keeps its printed `base` power, toughness and
  keywords. The current values are recalculated whenever something enters, leaves, or is
  attached. The effects so far are:
  - static abilities on attached Auras and Equipment (`affected: 'attachedPermanent'`), with a
    `per` for Alpha Status ("+2/+2 for each other creature that shares a creature type with it")
  - anthems and lords (`affected: 'eachCreatureYouControl'`, optionally `other: true`,
    `colors: ['W']` or `subtypes: ['Soldier']`): every creature its controller controls that
    matches, including ones that arrive later. When the source leaves, the bonus goes, so a
    damaged creature can die with its lord (704.5g). Colors come from `colorsOf`: a card's
    `colors`, or its mana cost.
  - +1/+1 counters
  - "until end of turn" pumps

  These add power, toughness and keywords. Combat and keyword rules use the recalculated
  values.
- Triggered abilities (603): `triggeredAbilities: [{ id, text, trigger, effects, target? }]`,
  where `trigger` (`TRIGGER`) is:
  - `entersBattlefield` (603.6a)
  - `dies` (700.4: put into a graveyard from the battlefield, by any means, including tokens).
    Being exiled or returned to hand isn't dying.
  - `putIntoGraveyard`: the same for any permanent (Audacity)
  - `attacks` (508.3a) and `attacksOrBlocks` (509.3c)
  - `creatureEnters` and `landEnters`, for other permanents entering; and `spellCast`
    (601.2i), for a spell being cast. Each has a `filter`: `{ other?, controller?: 'you' |
    'any', subtypes?, colors? }`.

  More options on an ability:
  - `targetOther`: "another target", not its source.
  - `optional`: "you may". Its controller always chooses, even with one target, and can decline
    with `targets: []`. (In the rules the target is chosen first and the choice made on
    resolution.)
  - `modes`: "choose one —" (700.2), `[{ text, effects, target? }]`. The mode, and its target,
    are chosen as it goes on the stack (`chooseMode`). A mode with no legal target isn't
    offered, and with one option left it's chosen automatically.
  - When the event happens, the ability triggers (`abilityTriggered`, `state.pendingTriggers`).
    The next time a player would receive priority, after state-based actions, it goes on the
    stack (603.3). Its controller is the permanent's controller at the time.
  - Several at once go on in APNAP order (603.3b): the active player's first, so the other
    player's end up on top and resolve first. A player's own triggers go on in the order they
    triggered; choosing that order isn't modelled.
  - Targets are chosen as it goes on the stack (603.3d):
    - With no legal target, it's removed.
    - With one, that one is used.
    - With more, its controller gets a `chooseTargets` decision, and priority waits until
      they've chosen.
  - A dies ability works even though its source is gone (603.10a), but an effect on the source
    itself then does nothing.
  - During the cleanup step, abilities that trigger wait until a player next gets priority;
    the extra cleanup step of 514.3a isn't modelled.
- State-based actions are checked before a player receives priority (117.5), and repeated until
  there are none left (704.3). Creatures with lethal damage or 0 toughness die (704.5f, 704.5g).
  A player loses at 0 life (704.5a), or after trying to draw from an empty library (704.5b). The
  game ends as soon as any player loses, because multiplayer elimination isn't modelled.
  The legend rule (704.5j): a player who controls legendary permanents with the same name
  chooses one to keep (`legendRule`, `KEEP_LEGEND`), and the rest go to the graveyard. Priority
  waits until they've chosen.
- LTR rules:
  - Resolving can stop for a choice (`choose` / `chooseMany` decisions, `CHOICE` kinds) and
    pick up where it left off; the choice is part of snapshots.
  - The Ring tempts you (701.54): the Ring's level goes up (to at most 4) and its player chooses
    a creature as Ring-bearer, which is legendary and has the Ring's abilities so far.
  - Amass (701.47) puts +1/+1 counters on an Army you control, creating a 0/0 Orc Army first if
    you have none. Scry (701.22) puts the cards you choose back on top, in order, and the rest on
    the bottom.
  - Sagas (714): a lore counter as it enters and in your precombat main phase, each triggering
    its chapter; it's sacrificed once its last chapter has left the stack.
  - Indestructible (702.12), hexproof (702.11) and ward (702.21: countered unless its controller
    pays). Crew (702.122) taps creatures with enough total power to make the Vehicle a creature
    until end of turn.
  - Conditions on resolving (608.2c) and intervening "if" clauses (603.4); reflexive triggers
    ("When you do", 603.12); delayed triggers ("at end of combat", 603.7).
  - Continuous effects apply in layer order (613): control, then types, then abilities, then
    power and toughness (setting base values before pumps and counters).
  - Replacement effects (614) for dying (exile it instead) and for +1/+1 counters and tokens.
  - Protection (702.16): it can't be damaged, enchanted or equipped, blocked or targeted by
    anything with the quality; for a player (702.16j), damage is prevented and they can't be
    targeted.
  - Keyword counters (122.1b) give their keyword; a stun counter (122.1d) is removed instead of
    the permanent untapping.
  - Extra turns (500.7, the most recent first) and additional combat phases (500.8).
  - Goad (701.15): with two players, the creature attacks each combat if able until its goader's
    next turn (the declaration starts with it, and it can't be left out).
  - Casting from exile or a library's top with a permission, and without paying the mana cost
    as an ability resolves (X is 0), with timing restrictions waived only for the latter.
  - Copies (707.2): a token copying a card takes its definition, with the exceptions the effect
    names.
Cards are defined in `src/cards/cards.js` (by hand) and `src/cards/importedCards.js` (generated
from Scryfall, see above): a mana cost, types, power and toughness for creatures, and activated
abilities as data (`{ id, text, cost, effects, target?, timing? }`; the format is documented at
the top of `cards.js`). An ability that adds mana and doesn't target is a mana ability. Creatures
can list `keywords`. The tests add test-only cards through the `cards` option, including free (0-cost)
creatures for building combat scenarios.

**Snapshots and simulation** (for AI search and saving games):
- **Copying the game:** `game.serialize()` returns the whole game, including the random number
  generator's state, and `Game.deserialize(snapshot)` rebuilds it. `game.clone()` is a fast
  independent copy.
- **Hiding information:** `game.getPlayerView(playerId)` is a snapshot without what that player
  can't know: the opponent's hand, the order of every library, and the random state. The unknown
  cards are listed as a pool. `determinize(view, random)` (`src/ai/determinize.js`) deals that
  pool into a playable guess.
- **Simulating fast:** `silent: true` games emit no events, `applyTrusted(action)` skips
  re-validation, and `peekState()` reads the state without copying it.

The turn structure is defined as data in `src/engine/turnStructure.js`. Each step or main
phase records whether players get priority and can provide a `skip` rule.


## AI

There are three computer players, all in `src/ai/` (`createCpuController` in `src/ai/cpu.js` makes
one from an opponent's `ai`). Each listens to the game's `state` events and
emits `action` events. Pai Gow's opponents all use the Strategist; the search AI is kept to compare
it with, and the basic AI plays out both of their simulations, and Pai Gow's fast forward.

### The Strategist (`src/ai/strategist/`)

Pai Gow's CPU. It was written for Pai Gow's tiny games (five cards each, free mana, 5 or 8 life),
where the search AI below was written for 40-card Magic.

**What it knows** (`beliefs.js`): only what a person across the table would. `blindView(game, me)`
is `getPlayerView` with the opponent's deck list taken out, and it's all the Strategist, or its
worker, is ever given. A test swaps the player's hidden cards for others and checks its choices
stay the same.
- By default it **plays the board**: it searches the game as it stands, with the opponent's hidden
  cards left out, and its evaluation counts each of them as an average card. A hidden hand is five
  near-random cards from one booster, and in arena play guessing it six times over was no stronger
  than not guessing (51.0% ± 6.0 for no guesses), at twice the thinking.
- A profile's `foresight` makes it guess instead: each guess deals the hidden cards from what a
  booster holds (by rarity slot), and a card held through its owner's own turn is taken to be an
  instant or a trick more often than a plain creature (mana is free, so those come down at once).
  The Wardens do this, with two guesses.

**Moves with a reason** (`moves.js`): at each decision it considers only plays that have a point
right now, so there's little to search.
- Its main phase: creatures and other permanents come down at once, and a free power with no
  target is used at once (neither is a choice). Sorceries, Auras and powers with a target are
  choices, each on its best two targets. Instants wait, unless they win on the spot or must come
  before blockers (tapping a blocker, haste, menace).
- After blockers, and when the opponent's spell or ability is on the stack: anything at instant
  speed, but only if it **flips an outcome**. `probe` plays the action on a copy, lets combat and
  the stack run their course, and compares with doing nothing: a card must change who lives, who
  dies or who wins; a power that costs nothing may also just save life. So a pump is only ever
  used to kill a creature, save one, or finish the game, and Elrond's ring answers removal.
- Attacks and blocks: the heuristic plans (`combat.js`, `attacking.js`, `blocking.js`) and small
  changes to them. Lethal on the board is simply taken. A creature pumped this turn attacks.
- Guards: an attack that can lose a creature for nothing, and a chump block when the life isn't
  needed, must look clearly better than the alternatives to be chosen (`handicap`).

**Search** (`search.js`): each move is tried on a copy of the game, against an opponent who answers
well: the next few real choices of either side are searched in full (alpha-beta over the same
move generator), then the basic AI plays both sides to the start of its next turn. Steps with one
sensible move are just played. It deepens while there's time (100 ms a decision by default; six
times that bought nothing in arena play), dropping moves that fall clearly behind.

**Evaluation** (`evaluate.js`, weights in `evalWeights.js`): its chance of winning from a position
at the start of its turn, as a logistic model fitted by `tools/tune-eval.js` to who went on to win
in 24,000 self-played rounds: each side's life, creatures, cards in hand and other permanents, how
many turns each needs to kill the other, and the board played forward a few turns
(`planLookaheadAttack`). On positions held back from the fit it calls the winner right 80.4% of
the time; the search AI's evaluation, given its best scale, 76.6%.

**Personalities** (`profiles.js`): a profile is a few numbers. `aggression`, `caution` and
`patience` scale what its own clock, the opponent's clock and its cards in hand count for in the
evaluation; `foresight` is how many guesses it makes of the hidden hand; `tastes` are for building
decks. Raiders (Sauron, Théoden, the Rider in Black, Burglar Bilbo) race, Wardens (Saruman,
Denethor, Elrond, Old Man Willow) hold on and imagine what you might have, Tricksters (the rest)
sit between. Each deck also has a plan (`deckPlan`: race, grind or tempo, from what's in it) that
shifts the profile for that round, so a Warden handed a racing deck races a little more.

**Decks** (`src/paigow/deckBuilder.js`): `tools/rate-cards.js` rates every card for Pai Gow from
60,000 self-played rounds (a logistic regression on what was in each deck, with a bonus for the
number of creatures; mana costs don't come into it, since mana is free). `buildDecks` scores each
of the 3,003 possible decks, turns the score into a chance of beating a deck dealt at random, and
tries all 126,126 ways to split the fifteen cards, keeping the one most likely to win two rounds of
three. Among splits as good as the best, the opponent's tastes choose. It takes about 30 ms.
With the same pilot on both sides, the builder's decks won 57.3% ± 3.2 of 800 matches against
decks dealt out by strength (`arrangeCpuDecks`, how it used to be done).

**The controller** (`StrategistAIController`) has the search AI's interface and manners: a Web
Worker when there is one, quick passes outside the moments it could ever act in, the same delay
inside them whatever it holds, and visible thinking only at its main phase and its declarations.

**The arena** (`tools/arena.js`) plays AIs against each other in mirrors: the same decks and seats
played twice with the AIs swapped, so the luck of the cards cancels. About four mirrors in five are
decided by the decks or the seat whoever plays, so the telling number is the mirrors one AI won
from both seats. `tools/blunders.js` counts plays that look dumb whatever the position.

Measured on the final code (4 cores; ± is a 95% interval; the search AI at the thinking time it
shipped with for each opponent, 1 to 2.5 s a decision; the Strategist at its own, 100 to 150 ms):

| Comparison | Strategist's score | Mirrors won from both seats | Thinking |
| --- | --- | --- | --- |
| Whole matches: its play and its decks, against the search AI made blind with the old decks (220 matches) | 63.6% ± 6.1 | 32 to 6 | 1.4 s against 22.7 s a match |
| Rounds, same decks: against the search AI made blind (640 rounds) | 53.6% ± 3.7 | 45 to 24 | 0.58 s against 9.85 s a round |
| Rounds, same decks: against the search AI as it shipped, seeing the Strategist's hand (320 rounds) | 50.3% ± 5.2 | 11 to 9 | 0.70 s against 5.08 s a round |
| Rounds, same decks: against the basic AI (600 rounds) | 65.6% ± 3.6 | 78 to 1 | 0.85 s a round |

So with the same decks it's a little ahead of the search AI on a seventeenth of the thinking, level
with it when the search AI can see its hand, and well ahead once it also builds its own decks. A
decision takes 5 ms at the median, 112 ms at the 95th percentile and 0.3 s at most.

Blunders in the 640 rounds against the blind search AI (Strategist, then search AI): tricks that
changed nothing 0 and 193; a pump with no attack after it 1 and 92; lethal on the board not taken 0
and 16; an attacker lost for nothing 33 and 48 (some of these are a blocker or a trick it couldn't
have seen); needless chump blocks 4 and 7. Against the basic AI it missed lethal twice in 600 rounds.

To run them again: `node tools/arena.js --a strategist --b search-blind --seeds 160 --personas`,
`--b search` (seeing hands), `--adecks new --match` (whole matches), `--a basic --b basic --adecks new --match`
(the decks alone). `--aopts '{"worlds":6}'` and the like set a Strategist's options.

### Basic AI (`BasicAIController`)

A fast heuristic player, also used to play out the search AI's simulations (5–20 µs per decision).
- **Combat** (`combat.js`):
  - **Attacks:** by *Lookahead attacks* below: it plays out racing, attacking for value and
    holding back for a few turns, and picks the strategy whose worst case is best. It plans each
    declaration once, at its first step.
  - **The previous attacks** (`attacking: 'basic'`, `planAttack`):
    - It attacks with creatures the opponent can't block profitably, and with everything when
      that's lethal through the best possible blocks.
    - Then it adds any other attacker that makes the whole attack better against the
      defender's best blocks: each blocker stops only one attacker, so more attackers than
      they can block well get through ("swarming").
    - It keeps enough blockers home to survive the crack-back, and goes all in when it's
      losing the race to deck out.
    - It expects the defender to block as it does itself (`predictBlocking`).
  - **Blocks:** the `value` plan of *Blocking plans* below: the blocks worth the most, counting
    attacker value killed, blocker value lost, and life kept (worth more when life is low),
    solved exactly. It survives first, and chump-blocks only when the life is worth the creature.
    `blocking: 'greedy'` blocks as it used to (`planBlocks`: good blocks first, greedily).
  - **Predictions:** its combat predictions follow the engine's rules (first strike, double
    strike, deathtouch, trample, lifelink); a test checks them against real combats for every
    keyword pairing.
- **Mana:** in its main phase it picks the most valuable set of spells and abilities it can
  afford (a small knapsack over its hand). It keeps mana up for instants it would rather cast
  later, and taps lands and Elves before sacrificing Treasures. It counts what each source makes
  (Elvish Archdruid, Gaea's Cradle), and what a spell costs now (Ghalta).
- **Instants and flash** (`timing.js`, shared with the search AI): never in its own main phase,
  but at the last moment they're needed:
  - removal on the opponent's creatures and "can't block" effects at the start of its combat,
    clearing the way for its attack
  - removal on attackers, and creatures with flash as surprise blockers, once the opponent attacks
  - combat tricks once blockers are declared, when they win the fight
  - counterspells on spells worth countering
  - everything else (card draw, life gain, flash creatures nobody needed to block with) at the
    end of the opponent's turn
  - burn that wins the game, at once
  The search AI only considers instant-speed casts at those moments (`macroActions.js`).
- **Scoring** (`scoring.js`): spells and abilities are scored effect by effect, in the same points
  as creature values. Removal goes at the biggest threat, and burn goes to the face when it's
  lethal. A burn spell (one that only deals damage to its target, like Shock) is cast only
  where it kills, a creature or the player (`wastedDamage`), by both AIs. An anthem or lord counts for what it adds to its controller's creatures
  (`anthemValue`), both when casting it and when removing it, so removal can go at a lord before
  a bigger creature.
- **The Elves' mechanics:**
  - **Choices on triggers:** modes and optional targets are chosen by `scoreEffects`; declining
    scores 0, so it won't destroy its own artifact.
  - **Fights:** a fight is scored by which creatures die.
  - **The legend rule:** the copy it keeps is the one worth the most.
  - **Flash and cycling:** flash creatures can come down as surprise blockers or at the end of
    the opponent's turn, and it cycles a land once it has five.
  - **Lands:** it plays a land that enters tapped when it doesn't need the mana.
  - **Blocks:** every block plan is made legal with `legalizeBlocks` (blocking requirements,
    moving the cheapest blockers), so the AIs can always confirm.
- **Auras and Equipment:** a bonus Aura or Equipment goes on its best creature. A curse
  (`isCurse`: an Aura that shrinks its creature or stops it attacking, like Weakness or
  Pacifism) goes on the opponent's creature it takes the most from (`curseValue`: the drop in
  creatureValue, or all of it if the curse kills). "+2/+2 and can't block" (Maniacal Rage)
  counts as a bonus. The search AI picks its candidates the same way.

(Planeswalker also keeps `LegacyAIController`, the first version, as a baseline for its arena.)

### Blocking plans (`blocking.js`)

The first piece of a new AI. `blockingPlans(attackers, blockers, life)` makes five plans for
blocking an attack, each a different idea of the best blocks (`BLOCK_PLAN`):

| Plan | Puts first | Then |
| --- | --- | --- |
| `life` | the most life left | kills, then creatures kept |
| `creatures` | the least creature value lost | kills, then life |
| `kills` | the most attackers killed, then their value | life, then creatures kept |
| `optimal` | the most attackers killed, then their value | creatures kept, then life |
| `value` | attacker value killed − blocker value lost + life kept × `damageWeight(life)` | creatures kept, then life |

Every plan survives the combat first, if any blocks can. First-strike damage counts before
lifelink gains it back. Each plan gives its blocks, whether the defender survives, the life left,
and the attackers and blockers that die, so the plans can be compared or played out. On real
boards, the first four plans usually come to two different sets of blocks. `blockingPlansFor(state,
me, canBlockPair)` reads them from a game state. `optimalBlocks` and `planOptimalBlocks` make
just the `optimal` plan.

Each plan is exact, with up to 3 blockers on an attacker (`maxGroup`). It fights each attacker
against each useful group of blockers once, using a flat copy of `resolveCombat`'s rules, and the
plans share those fights. Then each plan searches the attackers, memoizing on how many of each
class of identical blockers are left.

- **Speed:** measured on 1,478 blocking decisions from basic-AI games on the real and sample
  decks.
  - With up to 4 creatures a side, all four plans take 11–18 µs (median); `optimal` alone takes
    5–8 µs, faster than `planBlocks`.
  - With 7–10 creatures a side, all four take 66–231 µs (median).
- **Budgets:** boards beyond `stateLimit` or `nodeLimit` get a best effort flagged
  `exact: false`. That only happens well past `GAME_LIMITS`' 10 creatures a side.
- **Tests:** `test/blocking.test.js` checks every plan against brute force on random boards.

`value` is `planBlocks`' own scoring, solved exactly instead of greedily, and it's how the basic
AI blocks. To try another plan, pass `blocking: '<plan>'` (arena: `basic:blocks=<plan>`;
`greedy` for `planBlocks`). Here is each plan, in place of `planBlocks`, against the basic AI as
it was (blocking with `planBlocks`), in mirror matches on every deck:

| Blocking plan | Games | Win rate vs basic (95% CI) |
| --- | --- | --- |
| `value` | 2640 | 54.2% (52.3–56.1%) |
| `creatures` | 2640 | 51.2% (49.3–53.1%) |
| `optimal` | 1320 | 50.0% (47.3–52.7%) |
| `kills` | 1320 | 43.2% (40.5–45.9%) |
| `life` | 1320 | 40.2% (37.6–42.9%) |

`value` also beats `creatures` head to head, 54.6% (52.7–56.5%) over 2640 games.

- **Chump blocks:** the plans that put life before creatures (`life`, and `kills` after its
  kills) chump-block attackers they can't kill, and lose for it.
- **Trades:** putting kills first (`optimal`) trades a big creature for a small one.
- **Weighing both:** weighing value killed against value lost, as `planBlocks` does, is what
  wins. Solving that exactly gains about 4 points.

With `value` as the default, the basic AI's attacks also expect the defender to block that way
(`predictBlocking`; arena: `basic:predict=greedy` for the old expectation). The search AI's
evaluation predicts the next combat the same way, and it offers both `value` and greedy blocks
as candidates.

| Match | Games | First AI's win rate (95% CI) |
| --- | --- | --- |
| basic (now) vs basic as it was (greedy blocks, greedy predictions) | 2640 | 53.0% (51.1–54.9%) |
| basic (now) vs the same with greedy predictions | 2640 | 50.9% (49.0–52.8%) |
| search (now) vs search as it was, 150 ms, real decks | 200 | 56.0% (49.1–62.7%) |

Predicting `value` blocks is neutral in the arena, where both sides block the same way, but it's
right, as each side expects the blocks it will actually meet. Playouts are up to 9% slower (the
benchmark's standard deck: 52 to 48 games/s).

### Lookahead attacks (`attacking.js`)

The second piece of the new AI. `planLookaheadAttack(state, me, candidates)` picks one of three
strategies (`ATTACK_STRATEGY`) by playing each out a few turns:

| Strategy | Attacks with |
| --- | --- |
| `aggressive` | everything that can attack, to race |
| `value` | attackers added one at a time while the trade improves against the defender's blocks: creature value killed minus value lost, plus a little for chip damage (more when the defender is low), but only when it loses no more than it kills |
| `hold` | the `value` attack, minus the creatures it will want as blockers when the opponent attacks with everything next turn |

- **Lookahead:** each of our strategies plays out for 3 of our turns, and theirs after each,
  against each of the opponent's strategies. It uses only the creatures in play (nobody casts
  another), and defenders block with the `value` plan. So a crack-back that would kill us shows
  up, and so does a race we'd win.
- **Choice:** it takes the strategy whose worst case is best. A win scores more the sooner it
  comes; otherwise the score is board value plus life, which counts for more when it's low.
- **Default:** it's how the basic AI attacks (`attacking: 'basic'` for `planAttack`; arena:
  `basic:attack=basic`).
- **Speed:**
  - It copies only what combat needs of each creature, with its value and keyword flags
    worked out once.
  - It caches the combats it predicts and each strategy's attacks, under small integer keys.
  - The later turns of its playouts use a quick guess at the blocks (`quickBlocks`; `quick:
    false` blocks exactly; arena `quick=0`). Each attacker, the biggest threat first, meets the
    free blocker that gains the defender most; then chump blocks follow while the damage would
    be lethal.
  - Its exact block predictions get smaller budgets, and at most two blockers on an attacker.
  - Its `value` attacks only try attackers that gain alone.

  On 1217 attack decisions from basic-AI games it takes 1.8 ms on average (it took 11 ms
  before these), and 0.3 ms on boards of up to 8 creatures. `planAttack` takes 1.0–1.3 ms and
  0.09 ms there.
- **In the search AI:** `attacking: 'lookahead'` (`searchPolicy`, `SearchAIController`; arena:
  `search:at=lookahead`) makes the lookahead's attack the search's default, and offers each
  strategy's attack as a candidate. Its simulations keep the basic AI's attacks.
- **Thinking time:** with `budgetMs` (`attackBudgetMs`; arena: `think=<ms>`), it thinks for
  about that long. It looks 1, 2, 3, ... turns ahead (up to 8), each time trying more plans:
  - the strategies
  - each strategy's first attack followed by another (hold now, race later)
  - other first attacks (every subset of the attackers on small boards)

  It answers from the deepest look it finished.

| Match | Games | First AI's win rate (95% CI) |
| --- | --- | --- |
| basic with lookahead attacks vs basic | 2640 | 52.1% (50.2–54.0%) |
| the same, with the speed-ups above | 2640 | 51.2% (49.3–53.1%) |
| quick blocks in playouts vs exact blocks | 2640 | 49.3% (47.4–51.2%) |
| lookahead attacks thinking up to 50 ms vs without a budget | 1320 | 50.7% (48.0–53.4%) |
| search with lookahead attacks vs search, 150 ms, real decks | 400 | 51.2% (46.4–56.1%) |

It wins or ties on 9 of the 11 decks. Its games run longer, as it holds back more: green's go from
22 to 31 turns. In the arena, the basic AI's decisions now take 1.2–1.5 times as long on average
as with `planAttack`. But longer games build bigger boards, so whole games between basic AIs run
several times slower on the white and green decks.

The chip damage rule and the cache changed none of those 2640 games.

More thinking time doesn't help yet, as with the search AI. The lookahead's own model is the
limit:
- no cards are cast
- each side follows one of three strategies
- it plans for the opponent's best reply

### Search AI (`SearchAIController`)

At each real decision, the search AI chooses among *macro actions* (`macroActions.js`), whole
decisions rather than the engine's raw actions:
- "cast this at that, tapping mana as needed"
- "attack with these creatures"
- "these blocks"
- "pass"

It simulates each one many times (`search.js`):
1. **Guess the hidden cards.** Each simulation starts from `determinize(game.getPlayerView(me))`.
   The player view hides the opponent's hand, the order of every library and the random number
   generator's state. The guess deals the unknown cards at random and reseeds the generator, so
   the AI never relies on anything it couldn't know, including its own next draws. A test checks
   that its choices don't change when the hidden cards, the library orders or the seed change.
2. **Play the macro**, then let the basic AI play both sides up to the AI's next turn.
3. **Score the result** with `evaluate.js`: a weighted sum of life (concave), creature values,
   lands, other permanents, spells in hand, lands in hand (weighted apart, so the AI never
   prefers keeping a land in hand to playing it), each side's clock, and deck-out danger.
4. **Race the candidates:** each round deals one new guess and simulates every remaining
   candidate on it, so candidates are compared pair by pair on identical situations. After 6
   rounds, a candidate 2.5 standard errors behind the leader drops out, and the time goes to the
   close contenders. The basic AI's own choice is the default, and another candidate has to beat
   it by a margin of 1 point.

It runs in a module Web Worker (`aiWorker.js`, with an inline time-sliced fallback), so the page
stays responsive.

It never wastes the player's time, or its own work:
- **Quick passes where it never acts.** It only ever acts in its windows (`windowOf`): its own
  main phases, after blocks, when attacked, at the opponent's end step, and in response to an
  opponent's spell. Elsewhere (upkeep, draw, beginning of combat, ...) it always passes, so it
  passes at once (`passMs`, 60 ms). The windows depend only on public information, so this gives
  nothing away.
- **Searches are kept by position** (`searchPool.js`). The worker keeps recent searches by a hash
  of the AI's view. When a position comes up that it already searched, or pondered, it carries
  on from where it got to instead of starting over. A search stops as soon as its race is
  decided (one candidate left), or once it has had its budget, pondering included.
- **Pondering** (`ponder.js`). Whenever it isn't deciding, it plays a private copy of the game
  forward along the likeliest line, and searches the next three decisions it meets there.
  - **The line:**
    - The opponent passes, and confirms the attackers or blocks they've picked so far.
    - The AI carries on with the play it's making, and otherwise does what the basic AI would.
  - **So while you take your turn**, it's already thinking about its next main phase. While you
    choose attackers, it's thinking about its blocks against exactly those attackers. If you
    then do what it predicted, its answer is ready.
  - **What the search sees:** it only ever gets the AI's view of each position. The result is
    only used once the AI really reaches that position.

Measured over whole games (a basic AI standing in for the player and answering at once), this
took the Pyromancer's games from 223 s to 81 s, and the Dragonlord's from 203 s to 56 s. Its
average think at its own main phase fell from 1.6 s to 0.6 s.

It gives little away:
- **Uniform timing in its windows:** there it answers after the same delay (`responseMs`,
  400 ms), plus random jitter. That holds whether it passes or acts, and whether or not it holds
  an instant; a test checks the delays are identical with and without one.
- **Visible thinking only at public moments:** it shows "Thinking…" only at its own main phases
  and declarations, which happen every turn whatever its hand. It thinks for at least
  `minThinkMs` (600 ms, or its budget if that's less) and at most its budget. It can answer sooner than the budget when the
  choice is clear, or was pondered, so how long it thinks can hint at how hard the choice was.
  That trade buys a lot of speed.

### Weights for each CPU deck

Each CPU deck can weigh things its own way. An aggro deck cares about its clock, while a control
deck cares about cards and life. `weightsFor(profile)` (`evaluate.js`) picks a deck's weights:
1. **Its own tuned weights:** `DECK_WEIGHTS[deckName]` in `src/ai/weights.js`.
2. **An archetype's:** `aggro`, `control` or `midrange` (`ARCHETYPE_WEIGHTS`), adjustments of the
   defaults.
3. **The defaults.**

Pass the profile to the search AI: `new SearchAIController({ game, playerId, weights: 'aggro' })`,
or a deck name, or a weights object. Pai Gow's opponents use an archetype or the defaults
(`src/paigow/personas.js`).

The weights in `src/ai/weights.js` were fitted, and the results below measured, with
Planeswalker's AI arena and tuning tools (`tools/ai-arena.js` and `tools/tune-ai.js` there), on
its sample and campaign decks.

The arena plays each seed twice with the seats swapped and reports win rates with 95% confidence
intervals. `tools/tune-ai.js` fits the evaluation weights to the results of basic-AI games
(logistic regression on positions from games decided by life totals) and writes
`src/ai/weights.js`.

Results:

| Match | Games | First AI's win rate (95% CI) |
| --- | --- | --- |
| basic vs legacy | 600, all six decks | 70.3% (66.6–73.8%) |
| greedy (8 guesses, 2-turn horizon) vs basic | 100, five decks* | 64.0% (54.2–72.7%) |
| search (250 ms) vs basic | 100, five decks* | 62.0% (52.2–70.9%) |
| search (250 ms) vs greedy | 100, five decks* | 50.0% (40.4–59.6%) |
| search (1 s) vs greedy | 100, five decks* | 48.0% (38.5–57.7%) |
| greedy, 3-turn vs 2-turn horizon | 100, five decks* | 54.0% (44.3–63.4%) |
| greedy, tuned vs hand-picked weights | 100, five decks* | 52.0% (42.3–61.5%) |

\* Every deck except the Forest + Elves mirror, where games are 1/1s trading evenly until someone
decks out, so the seat decides them. The search AI's lead comes from its simulations, which the
time budget doesn't change much: given enough simulations, greedy and search agree, so a better
rollout policy or evaluation, not more time, is what would make it stronger.

On the real decks (mirror matches of the five colors, 200 games each, search at 150 ms):

| Match | First AI's win rate (95% CI) |
| --- | --- |
| search vs basic (before the changes below) | 63.5% (56.6–69.9%) |
| search vs the previous basic AI (after them) | 66.0% (59.2–72.2%) |
| basic (swarming) vs the previous basic AI | 52.3% (49.6–55.0%), 1320 games, all eleven decks |
| general weights refit on all decks vs current | 49.5% (42.6–56.4%) |
| 3-turn vs 2-turn horizon | 50.5% (43.6–57.4%) |
| margin 0 vs 1 | 43.0% (36.3–49.9%) |
| margin 2 vs 1 | 50.0% (43.1–56.9%) |
| lands in hand weighed apart vs as spells | 49.0% (42.2–55.9%) |

The search still gains nothing from more time, a deeper horizon or refit weights, and does worse
when it trusts its simulations over the basic AI's choice (margin 0). What it does gain from is
a better basic AI, which both plays the outskirts' CPUs and plays out every simulation.

#### Heuristics from Magic strategy

Well-known rules of thumb, from Forge's AI (`AiAttackController`, `AiBlockController`,
`ComputerUtilCombat`) and from Limited strategy, are in the code as opt-in options. They're
measured as `basic:h=<name>[@value]` against the basic AI in mirror matches on every deck
(1320 games each).

| Heuristic | Rule | Win rate vs current basic |
| --- | --- | --- |
| `attrition` | Forge's attritional attack: all in if attacking every turn kills them even when each blocker stops one of our biggest attackers | 50.1% |
| `beatdown` | "Who's the beatdown?": when we'd win the race, accept even trades (`@2`, `@4`: worse trades) | 49.7% (48.7–49.6% stronger) |
| `danger` | Forge's "life in danger": trade-block, then chump-block, while the damage getting through would leave us below 4 life (`@7`, `@10`) | 49.9% (49.2–49.5%) |
| `home` | Forge's blockers kept home: don't attack with a creature whose absence costs more on the crack-back than it deals | 48.6% |
| `reinforce` | Add a blocker to a block that doesn't kill its attacker | 50.9% |
| `postCombat` | Cast creatures after combat unless they matter in it (haste, an enters-the-battlefield effect), when lands alone pay for them | 49.5% (on by default) |
| `saveRemoval` | Removal in the main phase only on creatures worth 6+ unless at 8 life or less (`@4.5`, `@8`) | 50.0% (49.7–50.7%) |
| all of attrition, beatdown@2, danger@7, reinforce | | 50.2% |

Offering their attack and block plans to the search as extra candidates (`search:hp=1`,
`HEURISTIC_PLANS`) scored 50.0% (43.1–56.9%) against the search without them.

None of them helps, and the reason shows when counting how often each changes a decision.
Over 80,000 decisions in basic-AI games, `attrition`, `beatdown`, `danger` and `reinforce`
changed between 13 and 53. The basic AI already follows the rules they encode: it attacks
where no block is profitable, swarms, trades up, double-blocks, and chump-blocks when the
attack is lethal.

`postCombat` first scored 47.4%, almost all of it in green (79–121). The cause was mana, not
blockers. Waiting until after combat left Llanowar Elves free to attack, so they were tapped
when the creature came to be cast, which then slipped a turn. With the rule limited to
creatures that lands alone pay for, it's neutral against the AI. It's on by default because it
plays better against a person: the hand stays hidden and mana stays up through combat. `home`
still scores 48.6%.

Measuring these also turned up two mistakes in how positions were judged, both fixed:
- **Creatures still to be cast.** Deciding whether attacking leaves it dead to the crack-back,
  the AI counted only the creatures in play. Those it would cast after combat block just as
  well on the opponent's turn. They now count (`plannedCreatures`; 50.0% against leaving them
  out).
- **Tapped blockers in the clock.** The evaluation's race clock treated every creature as able
  to block the next attack. A creature that attacked on its own turn stays tapped through the
  opponent's, so the active player's next attack now meets blockers as they are (50.5%).

Both were neutral in the arena, where the opponent is the same AI, but they're right.

#### Tiered evaluation and pruned lookahead

Two search options, both off by default, measured against the default search on the real
decks (200 games each):
- **`evaluation: 'tiered'`** (`evaluateTiered`, arena `e=tiered`). It ranks winning, then not
  losing (lethal on board either way, the race, life), then creatures and who wins the next
  combat (the active player's planned attack against the planned blocks), then cards in hand,
  then other permanents. `TIERS` sets the gaps; `weights.tiers` overrides them.
- **`lookahead: { depth, beam, branchOpponent }`** with **`rootBeam`** (`lookahead.js`, arena
  `la=`, `bw=`, `bo=`, `rb=`). Instead of one basic-AI playout per candidate, it branches at key
  decisions: our main-phase plays and both sides' attacks and blocks. Every option is scored
  where it leads and only the best `beam` go deeper. `rootBeam` keeps only the best few
  candidates before the search starts.

| Setting | Budget | Win rate vs default search |
| --- | --- | --- |
| tiered, wide gaps (lethal 3000, clock 12/turn) | 150 ms | 43.5% (36.8–50.4%) |
| tiered, moderate gaps (lethal 150/60, clock 3) | 150 ms | 48.0% (41.2–54.9%) |
| lookahead depth 2, beam 2, 4 candidates | 150 ms | 52.0% (45.1–58.8%) |
| lookahead depth 3 + tiered (moderate), opponent branching | 300 ms | 38.5% (32.0–45.4%) |
| lookahead depth 3, opponent not branching | 150 ms | 46.0% (39.2–52.9%) |

What the results say:
- **Gap sizes:** with wide gaps, rare lethal swings in a few noisy simulations swamp the
  average, and the search can't tell its options apart. Moderate gaps keep the order without
  that.
- **Opponent branching:** in a guessed game the opponent sees the AI's hand. Branching on its
  worst-for-us replies makes it dodge every trick, so every plan looks bad, and more so the
  deeper the search goes.
- **Depth:** a deeper lookahead costs two to four times as much per simulation. Within the same
  time it gets fewer guesses of the hidden cards, and so far that has cost as much as the depth
  gained.

#### Creatures that will die anyway (`doomed.js`)

Forge's `AVOID_TARGETING_CREATS_THAT_WILL_DIE`, on by default (`basic:h=doomed@0` turns it off). A
creature is doomed when one of these will kill it:
- **The stack:** a spell or ability on the stack destroys or exiles it, or deals it lethal
  damage.
- **Combat:** after blocks, the fight will kill it. While the AI is being attacked, it judges
  this by the blocks it plans to make.

Removal on a doomed creature of the opponent's isn't worth that creature's death, which was
coming anyway. It's worth only what removing it first saves: in a trade, our blocker, or the
damage it would have dealt.

At first it hardly ever came up. The basic AI casts its removal in its own main phase, at the
biggest threat, where nothing is about to die. Of 643 removal spells in basic-AI games on the
real and sample spell decks, 468 came in the main phase and 9 in combat. Over 259,000 decisions it
changed one, and it scored 50.0% (47.3–52.7%) over 1320 games.

So the decks got cards that act in combat:
- **White:** Gideon's Reproach (4 damage to target attacking or blocking creature) and Divine
  Verdict (destroy one). They can only be cast in combat, and the AI holds mana for them as it
  does for other instants, judging them by the opponent's creatures. Gideon's Reproach replaces
  Revitalize in the lighter white deck. In the full white deck, it and Divine Verdict replace a
  Cavalry Drillmaster, a Raise the Alarm and Inspired Charge.
- **Red:** Prodigal Pyromancer ("{T}: 1 damage to any target"), for Boltwave and Lava Axe in Red
  Burn, and for Thrill of Possibility in the other red decks.

The cut cards are still offered as rewards. With these cards, combat removal went from 9 to 85 of
the casts, and the rule changed 31 decisions, all on white.

| Match | Games | Win rate (95% CI) |
| --- | --- | --- |
| basic vs basic without `doomed`, white | 600 | 52.0% |
| the same, red | 600 | 50.2% |
| both decks | 1200 | 51.1% (48.3–53.9%) |

(Divine Verdict has since left the white deck for Pacifism; it's offered as a reward.)

**Sacrificing doomed creatures** (`cashIn`, off by default; `basic:h=cashIn` turns it on): a
creature of ours that's doomed costs nothing to sacrifice. One dying in combat costs only what the
rest of the combat loses without it (`doomedSacrificeCost`). With "sacrifice a creature" costs
(Witch's Cauldron, Vampiric Rites, Village Rites, Bone Splinters), the AI then uses them in
response to removal, or in combat, so the removal fizzles and it gets something for the creature.
Without it, the basic AI never activated Witch's Cauldron or Vampiric Rites in 162 games.

The plays looked right, nearly all in response to Murder, Hero's Downfall or Bone Splinters, but
they lost. Black Removal's mirror is a stall, about 39 turns a game, and over 80 games decking
losses went from 21 to 29–30. The extra cards drawn early ran the libraries out. Valuing draws
less as the library runs low (from 10 or 15 cards left) didn't help, and neither did cashing in
only in response:

| Match (black mirror) | Games | Win rate (95% CI) |
| --- | --- | --- |
| basic with `cashIn` vs without | 600 | 45.7% (41.7–49.7%) |
| the same, other seeds | 600 | 45.0% (41.1–49.0%) |
| with draws worth less near the end of the library | 600 | 46.5% (42.5–50.5%) |
| only in response, not in combat | 600 | 45.8% (41.9–49.8%) |

So the decks have no sacrifice outlets of this kind, and the rule stays off until the AI can tell
a race from a stall.

#### Mulligans (`mulligan.js`)

With mulligans in the game (see *Rules implemented*), the basic AI decides by rules of thumb from
Limited (Frank Karsten's land counts) and Forge (`MULLIGAN_THRESHOLD`):
- **Keep:** seven cards with 2–5 lands; at six or five, a hand it can cut to 2–4 (or 1–4)
  lands by what it bottoms; four cards or fewer, whatever they hold. A deck without lands keeps
  anything.
- **Bottom:** extra lands first (beyond its deck's share of lands for the hand size), then its
  most expensive spells.
- **Search AI:** doesn't search these decisions, as a few turns' play can't judge them.

Measured against the basic AI keeping every hand (`basic:mull=0`, arena `--mulligans 1`, all
eleven decks): 51.1% (48.4–53.8%) over 1320 games. Most of the decks have 16 to 20 lands in 40
cards, so few hands are bad enough to need it.

#### Combat tricks (`tricks.js`)

Two of Forge's rules about pump instants, as heuristics of the basic AI's attacks. What the
defender might hold is judged from their deck list (their hand and library together, as the
player view allows), not from their hand.
- **`bait`** (on by default; `basic:h=bait@0` turns it off). Forge's
  `TRY_TO_HOLD_COMBAT_TRICKS_UNTIL_BLOCK`. The basic AI already holds its tricks until blockers
  are declared. Now it also attacks with them: it adds one creature a turn that the defender
  would block well, when a trick in its hand that it can pay for wins every such block. The
  likeliest block is worth the most.
- **`tricks`** (opt-in, `basic:h=tricks@<chance>`). Forge's
  `CHANCE_TO_ATKTRADE_WHEN_OPP_HAS_MANA`. It doesn't attack with a creature that a single
  blocker would kill and survive, given the biggest trick the defender can pay for. It does so
  only when the chance they hold one (hypergeometric, from their deck list and hand size) is at
  least the threshold, and the attack isn't lethal anyway.

| Heuristic | Games | Win rate vs basic (95% CI) |
| --- | --- | --- |
| `bait` | 1320, all decks | 51.0% (48.3–53.7%) |
| `bait`, green only (two seeds) | 320 | 57.5% |
| `bait`, green, effects and spells (new seed) | 600 | 52.2% (48.2–56.1%) |
| `tricks@0.1` | 1320 | 49.5% (46.8–52.2%) |
| `tricks@0.2` | 1320 | 49.8% (47.2–52.5%) |
| `tricks@0.1` and `bait` | 1320 | 50.5% (47.8–53.2%) |

- **Bait:** it wins on green, the deck with real pump tricks (Titanic Growth), and changes
  nothing elsewhere.
- **Tricks:** decks hold one or two tricks, so a defender rarely holds one: over 3480 attacks the
  chance reached 30% only 45 times. Played around more often, it costs a little on green,
  where giving up an attack gives the race away.


#### Lessons from other MTG AIs

Ideas from other Magic AIs and the research on them, with what applies here:
- **Cowling, Ward & Powley (2012)**, [*Ensemble Determinization in Monte Carlo Tree Search for
  Magic: The Gathering*](https://eprints.whiterose.ac.uk/75050/) (IEEE TCIAIG). Their setup is
  close to ours: guessed deals, then rule-based rollouts.
  - Rollouts played by their deterministic expert player did about 10% worse than rollouts by a
    weaker, noisy one.
  - More guesses beat deeper searches of each guess.
  - Smaller gains came from yes/no trees for choosing subsets, pruning dominated moves, and
    "interesting" deals.
- **Forge** (`res/ai/Default.ai`) has a flat Monte Carlo layer: 5 candidates, 4 rollouts each,
  and a bonus for the heuristic's own choice, much like `DEFAULT_MARGIN`. Its profiles add rules
  we didn't have:
  - attacking into open mana (now `tricks`)
  - holding combat tricks until blocks (now `bait`)
  - mulligans (now in the engine and the AI)
  - not targeting creatures that will die anyway (now `doomed`)
- **XMage** has two AIs: alpha-beta minimax with a node cap, and MCTS that keeps its tree from
  one decision to the next, as `searchPool.js` does.
- **Hearthstone agents** treat the hidden hand as search's main weakness. They guess hands that
  fit what the opponent has done.

Two of these are search options here, both off by default:
- **`rolloutNoise`** (arena `rn=`). The basic AI plays the rollouts less predictably (its
  `noise` option):
  - Each main-phase or instant idea's score is scaled by up to ±`rn`.
  - With probability `rn`, an attack follows another strategy, or blocks follow another
    `BLOCK_PLAN`.
  - The noise is seeded from the guess, so every candidate on a guess meets the same noise.
- **`inference`** (arena `inf=1`). The engine notes what everyone saw of each card kept in
  hand: whether its owner ended a turn holding it without playing a land, and how many lands
  they left untapped. A card returned to hand from the battlefield is simply known. The view
  shows these facts as `handInfo` (see `getPlayerView`). `determinize` then deals each hidden
  slot with `INFERENCE_WEIGHTS`:
  - lands are far less likely in a slot held through a turn without a land drop
  - spells they could have cast with the lands they left untapped are less likely

Measured against the default search on the real decks (200 games each, 150 ms):

| Setting | Win rate (95% CI) |
| --- | --- |
| `rn=0.1` | 51.5% (44.6–58.3%) |
| `rn=0.2` | 50.5% (43.6–57.4%) |
| `rn=0.3` | 48.5% (41.7–55.4%) |
| `inf=1` (two seeds, 400 games) | 51.0% (46.1–55.9%) |
| `rn=0.1` and `inf=1` | 47.0% (40.2–53.9%) |
| `rn=0.1` at 500 ms vs `rn=0.1` at 150 ms | 47.5% (40.7–54.4%) |

Neither helps yet:
- **Noise and time:** with noise, more time still doesn't help. The search uses 10–20 ms of its
  150 ms on average, because the race between candidates is usually decided early, so the noise
  mostly adds variance to a short race. In the paper, noise mattered because each candidate got
  thousands of rollouts.
- **Inference:** costs nothing in speed. But in the arena the opponent is the same AI, whose
  hands rarely hold what the inference rules out. It should matter more against a person who
  holds tricks.
