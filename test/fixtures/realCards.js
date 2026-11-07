// Real cards from outside LTR that some engine and AI tests use, and three 40-card decks of them
// (copied from Planeswalker's card pool and campaign decks, without art): Istari's own pool is only LTR.
// Games that use them pass `cards: REAL_CARDS`.
export const REAL_CARDS = Object.freeze({
  "aegisTurtle": {
    "id": "aegisTurtle",
    "name": "Aegis Turtle",
    "manaCost": {
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Turtle"
    ],
    "power": 0,
    "toughness": 5,
    "text": "",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "fdn",
    "typeLine": "Creature — Turtle",
    "oracleText": ""
  },
  "aetherTunnel": {
    "id": "aetherTunnel",
    "name": "Aether Tunnel",
    "manaCost": {
      "generic": 1,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Enchantment"
    ],
    "subtypes": [
      "Aura"
    ],
    "enchant": "creature",
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 1,
        "keywords": [
          "can't be blocked"
        ]
      }
    ],
    "text": "Enchant creature\nEnchanted creature gets +1/+0 and can't be blocked.",
    "colors": [
      "U"
    ],
    "rarity": "uncommon",
    "set": "m19",
    "typeLine": "Enchantment — Aura",
    "oracleText": "Enchant creature\nEnchanted creature gets +1/+0 and can't be blocked."
  },
  "airElemental": {
    "id": "airElemental",
    "name": "Air Elemental",
    "manaCost": {
      "generic": 3,
      "U": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Elemental"
    ],
    "power": 4,
    "toughness": 4,
    "keywords": [
      "flying"
    ],
    "text": "Flying",
    "colors": [
      "U"
    ],
    "rarity": "uncommon",
    "set": "m20",
    "typeLine": "Creature — Elemental",
    "oracleText": "Flying"
  },
  "arcaneEncyclopedia": {
    "id": "arcaneEncyclopedia",
    "name": "Arcane Encyclopedia",
    "manaCost": {
      "generic": 3
    },
    "supertypes": [],
    "types": [
      "Artifact"
    ],
    "subtypes": [
      "Book"
    ],
    "abilities": [
      {
        "id": "ability1",
        "text": "{3}, {T}: Draw a card.",
        "cost": {
          "mana": {
            "generic": 3
          },
          "tap": true
        },
        "effect": {
          "type": "drawCards",
          "count": 1
        }
      }
    ],
    "text": "{3}, {T}: Draw a card.",
    "colors": [],
    "rarity": "uncommon",
    "set": "m19",
    "typeLine": "Artifact — Book",
    "oracleText": "{3}, {T}: Draw a card."
  },
  "bewitchingLeechcraft": {
    "id": "bewitchingLeechcraft",
    "name": "Bewitching Leechcraft",
    "manaCost": {
      "generic": 1,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Enchantment"
    ],
    "subtypes": [
      "Aura"
    ],
    "triggeredAbilities": [
      {
        "id": "entersBattlefield1",
        "trigger": "entersBattlefield",
        "text": "When this Aura enters, tap enchanted creature.",
        "effects": [
          {
            "type": "tap",
            "affected": "attachedPermanent"
          }
        ]
      }
    ],
    "enchant": "creature",
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "keywords": [
          "untaps only by removing a +1/+1 counter"
        ]
      }
    ],
    "text": "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature has \"If this creature would untap during your untap step, remove a +1/+1 counter from it instead. If you do, untap it.\" (Otherwise, it doesn't untap.)",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "ltr",
    "typeLine": "Enchantment — Aura",
    "oracleText": "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature has \"If this creature would untap during your untap step, remove a +1/+1 counter from it instead. If you do, untap it.\" (Otherwise, it doesn't untap.)"
  },
  "bigfinBouncer": {
    "id": "bigfinBouncer",
    "name": "Bigfin Bouncer",
    "manaCost": {
      "generic": 3,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Shark",
      "Pirate"
    ],
    "power": 3,
    "toughness": 2,
    "triggeredAbilities": [
      {
        "id": "entersBattlefield",
        "text": "When this creature enters, return target creature an opponent controls to its owner's hand.",
        "trigger": "entersBattlefield",
        "effect": {
          "type": "returnToHand"
        },
        "target": "creatureOpponentControls"
      }
    ],
    "text": "When this creature enters, return target creature an opponent controls to its owner's hand.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "fdn",
    "typeLine": "Creature — Shark Pirate",
    "oracleText": "When this creature enters, return target creature an opponent controls to its owner's hand."
  },
  "boggartBrute": {
    "id": "boggartBrute",
    "name": "Boggart Brute",
    "manaCost": {
      "generic": 2,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Goblin",
      "Warrior"
    ],
    "power": 3,
    "toughness": 2,
    "keywords": [
      "menace"
    ],
    "text": "Menace (This creature can't be blocked except by two or more creatures.)",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Goblin Warrior",
    "oracleText": "Menace (This creature can't be blocked except by two or more creatures.)"
  },
  "brawlersPlate": {
    "id": "brawlersPlate",
    "name": "Brawler's Plate",
    "manaCost": {
      "generic": 3
    },
    "supertypes": [],
    "types": [
      "Artifact"
    ],
    "subtypes": [
      "Equipment"
    ],
    "abilities": [
      {
        "id": "equip",
        "text": "Equip {4}",
        "cost": {
          "mana": {
            "generic": 4
          }
        },
        "timing": "sorcery",
        "target": "creatureYouControl",
        "effect": {
          "type": "attach"
        }
      }
    ],
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 2,
        "toughness": 2,
        "keywords": [
          "trample"
        ]
      }
    ],
    "text": "Equipped creature gets +2/+2 and has trample. (It can deal excess combat damage to the player or planeswalker it's attacking.)\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)",
    "colors": [],
    "rarity": "uncommon",
    "set": "ori",
    "typeLine": "Artifact — Equipment",
    "oracleText": "Equipped creature gets +2/+2 and has trample. (It can deal excess combat damage to the player or planeswalker it's attacking.)\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)"
  },
  "burnBright": {
    "id": "burnBright",
    "name": "Burn Bright",
    "manaCost": {
      "generic": 2,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Instant"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "pump",
        "power": 2,
        "toughness": 0,
        "affected": "eachCreatureYouControl"
      }
    ],
    "text": "Creatures you control get +2/+0 until end of turn.",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "m21",
    "typeLine": "Instant",
    "oracleText": "Creatures you control get +2/+0 until end of turn."
  },
  "centaurCourser": {
    "id": "centaurCourser",
    "name": "Centaur Courser",
    "manaCost": {
      "generic": 2,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Centaur",
      "Warrior"
    ],
    "power": 3,
    "toughness": 3,
    "text": "",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Centaur Warrior",
    "oracleText": ""
  },
  "cloudkinSeer": {
    "id": "cloudkinSeer",
    "name": "Cloudkin Seer",
    "manaCost": {
      "generic": 2,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Elemental",
      "Wizard"
    ],
    "power": 2,
    "toughness": 1,
    "keywords": [
      "flying"
    ],
    "triggeredAbilities": [
      {
        "id": "entersBattlefield",
        "text": "When this creature enters, draw a card.",
        "trigger": "entersBattlefield",
        "effect": {
          "type": "drawCards",
          "count": 1
        }
      }
    ],
    "text": "Flying\nWhen this creature enters, draw a card.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m20",
    "typeLine": "Creature — Elemental Wizard",
    "oracleText": "Flying\nWhen this creature enters, draw a card."
  },
  "colossalDreadmaw": {
    "id": "colossalDreadmaw",
    "name": "Colossal Dreadmaw",
    "manaCost": {
      "generic": 4,
      "G": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Dinosaur"
    ],
    "power": 6,
    "toughness": 6,
    "keywords": [
      "trample"
    ],
    "text": "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Dinosaur",
    "oracleText": "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)"
  },
  "divination": {
    "id": "divination",
    "name": "Divination",
    "manaCost": {
      "generic": 2,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Sorcery"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "drawCards",
        "count": 2
      }
    ],
    "text": "Draw two cards.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Sorcery",
    "oracleText": "Draw two cards."
  },
  "druidOfTheCowl": {
    "id": "druidOfTheCowl",
    "name": "Druid of the Cowl",
    "manaCost": {
      "generic": 1,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Elf",
      "Druid"
    ],
    "power": 1,
    "toughness": 3,
    "abilities": [
      {
        "id": "tapForG",
        "text": "{T}: Add {G}.",
        "cost": {
          "tap": true
        },
        "effect": {
          "type": "addMana",
          "mana": {
            "G": 1
          }
        }
      }
    ],
    "text": "{T}: Add {G}.",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Elf Druid",
    "oracleText": "{T}: Add {G}."
  },
  "emberHauler": {
    "id": "emberHauler",
    "name": "Ember Hauler",
    "manaCost": {
      "R": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Goblin"
    ],
    "power": 2,
    "toughness": 2,
    "abilities": [
      {
        "id": "ability1",
        "text": "{1}, Sacrifice this creature: It deals 2 damage to any target.",
        "cost": {
          "mana": {
            "generic": 1
          },
          "sacrificeSelf": true
        },
        "effect": {
          "type": "dealDamage",
          "amount": 2
        },
        "target": "any"
      }
    ],
    "text": "{1}, Sacrifice this creature: It deals 2 damage to any target.",
    "colors": [
      "R"
    ],
    "rarity": "uncommon",
    "set": "m20",
    "typeLine": "Creature — Goblin",
    "oracleText": "{1}, Sacrifice this creature: It deals 2 damage to any target."
  },
  "essenceScatter": {
    "id": "essenceScatter",
    "name": "Essence Scatter",
    "manaCost": {
      "generic": 1,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Instant"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "counterSpell"
      }
    ],
    "target": "creatureSpell",
    "text": "Counter target creature spell.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Instant",
    "oracleText": "Counter target creature spell."
  },
  "explosiveApparatus": {
    "id": "explosiveApparatus",
    "name": "Explosive Apparatus",
    "manaCost": {
      "generic": 1
    },
    "supertypes": [],
    "types": [
      "Artifact"
    ],
    "subtypes": [],
    "abilities": [
      {
        "id": "ability1",
        "text": "{3}, {T}, Sacrifice this artifact: It deals 2 damage to any target.",
        "cost": {
          "mana": {
            "generic": 3
          },
          "tap": true,
          "sacrificeSelf": true
        },
        "effect": {
          "type": "dealDamage",
          "amount": 2
        },
        "target": "any"
      }
    ],
    "text": "{3}, {T}, Sacrifice this artifact: It deals 2 damage to any target.",
    "colors": [],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Artifact",
    "oracleText": "{3}, {T}, Sacrifice this artifact: It deals 2 damage to any target."
  },
  "fanaticalFirebrand": {
    "id": "fanaticalFirebrand",
    "name": "Fanatical Firebrand",
    "manaCost": {
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Goblin",
      "Pirate"
    ],
    "power": 1,
    "toughness": 1,
    "keywords": [
      "haste"
    ],
    "abilities": [
      {
        "id": "ability1",
        "text": "{T}, Sacrifice this creature: It deals 1 damage to any target.",
        "cost": {
          "tap": true,
          "sacrificeSelf": true
        },
        "effect": {
          "type": "dealDamage",
          "amount": 1
        },
        "target": "any"
      }
    ],
    "text": "Haste (This creature can attack and {T} as soon as it comes under your control.)\n{T}, Sacrifice this creature: It deals 1 damage to any target.",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "fdn",
    "typeLine": "Creature — Goblin Pirate",
    "oracleText": "Haste (This creature can attack and {T} as soon as it comes under your control.)\n{T}, Sacrifice this creature: It deals 1 damage to any target."
  },
  "goblinWarPaint": {
    "id": "goblinWarPaint",
    "name": "Goblin War Paint",
    "manaCost": {
      "generic": 1,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Enchantment"
    ],
    "subtypes": [
      "Aura"
    ],
    "enchant": "creature",
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 2,
        "toughness": 2,
        "keywords": [
          "haste"
        ]
      }
    ],
    "text": "Enchant creature\nEnchanted creature gets +2/+2 and has haste.",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "m12",
    "typeLine": "Enchantment — Aura",
    "oracleText": "Enchant creature\nEnchanted creature gets +2/+2 and has haste."
  },
  "greenwoodSentinel": {
    "id": "greenwoodSentinel",
    "name": "Greenwood Sentinel",
    "manaCost": {
      "generic": 1,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Elf",
      "Scout"
    ],
    "power": 2,
    "toughness": 2,
    "keywords": [
      "vigilance"
    ],
    "text": "Vigilance (Attacking doesn't cause this creature to tap.)",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Elf Scout",
    "oracleText": "Vigilance (Attacking doesn't cause this creature to tap.)"
  },
  "hostileMinotaur": {
    "id": "hostileMinotaur",
    "name": "Hostile Minotaur",
    "manaCost": {
      "generic": 3,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Minotaur"
    ],
    "power": 3,
    "toughness": 3,
    "keywords": [
      "haste"
    ],
    "text": "Haste (This creature can attack and {T} as soon as it comes under your control.)",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Minotaur",
    "oracleText": "Haste (This creature can attack and {T} as soon as it comes under your control.)"
  },
  "island": {
    "id": "island",
    "name": "Island",
    "supertypes": [
      "Basic"
    ],
    "types": [
      "Land"
    ],
    "subtypes": [
      "Island"
    ],
    "abilities": [
      {
        "id": "tapForU",
        "text": "{T}: Add {U}.",
        "cost": {
          "tap": true
        },
        "effect": {
          "type": "addMana",
          "mana": {
            "U": 1
          }
        }
      }
    ],
    "text": "({T}: Add {U}.)",
    "colors": [],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Basic Land — Island",
    "oracleText": "({T}: Add {U}.)"
  },
  "kitesail": {
    "id": "kitesail",
    "name": "Kitesail",
    "manaCost": {
      "generic": 2
    },
    "supertypes": [],
    "types": [
      "Artifact"
    ],
    "subtypes": [
      "Equipment"
    ],
    "abilities": [
      {
        "id": "equip",
        "text": "Equip {2}",
        "cost": {
          "mana": {
            "generic": 2
          }
        },
        "timing": "sorcery",
        "target": "creatureYouControl",
        "effect": {
          "type": "attach"
        }
      }
    ],
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 1,
        "keywords": [
          "flying"
        ]
      }
    ],
    "text": "Equipped creature gets +1/+0 and has flying.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)",
    "colors": [],
    "rarity": "uncommon",
    "set": "m13",
    "typeLine": "Artifact — Equipment",
    "oracleText": "Equipped creature gets +1/+0 and has flying.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"
  },
  "lightningStrike": {
    "id": "lightningStrike",
    "name": "Lightning Strike",
    "manaCost": {
      "generic": 1,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Instant"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "dealDamage",
        "amount": 3
      }
    ],
    "target": "any",
    "text": "Lightning Strike deals 3 damage to any target.",
    "colors": [
      "R"
    ],
    "rarity": "uncommon",
    "set": "m19",
    "typeLine": "Instant",
    "oracleText": "Lightning Strike deals 3 damage to any target."
  },
  "mantleOfWebs": {
    "id": "mantleOfWebs",
    "name": "Mantle of Webs",
    "manaCost": {
      "generic": 1,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Enchantment"
    ],
    "subtypes": [
      "Aura"
    ],
    "enchant": "creature",
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 1,
        "toughness": 3,
        "keywords": [
          "reach"
        ]
      }
    ],
    "text": "Enchant creature\nEnchanted creature gets +1/+3 and has reach. (It can block creatures with flying.)",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "ori",
    "typeLine": "Enchantment — Aura",
    "oracleText": "Enchant creature\nEnchanted creature gets +1/+3 and has reach. (It can block creatures with flying.)"
  },
  "mountain": {
    "id": "mountain",
    "name": "Mountain",
    "supertypes": [
      "Basic"
    ],
    "types": [
      "Land"
    ],
    "subtypes": [
      "Mountain"
    ],
    "abilities": [
      {
        "id": "tapForR",
        "text": "{T}: Add {R}.",
        "cost": {
          "tap": true
        },
        "effect": {
          "type": "addMana",
          "mana": {
            "R": 1
          }
        }
      }
    ],
    "text": "({T}: Add {R}.)",
    "colors": [],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Basic Land — Mountain",
    "oracleText": "({T}: Add {R}.)"
  },
  "oakenform": {
    "id": "oakenform",
    "name": "Oakenform",
    "manaCost": {
      "generic": 2,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Enchantment"
    ],
    "subtypes": [
      "Aura"
    ],
    "enchant": "creature",
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 3,
        "toughness": 3
      }
    ],
    "text": "Enchant creature\nEnchanted creature gets +3/+3.",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m20",
    "typeLine": "Enchantment — Aura",
    "oracleText": "Enchant creature\nEnchanted creature gets +3/+3."
  },
  "overcome": {
    "id": "overcome",
    "name": "Overcome",
    "manaCost": {
      "generic": 3,
      "G": 2
    },
    "supertypes": [],
    "types": [
      "Sorcery"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "pump",
        "power": 2,
        "toughness": 2,
        "keywords": [
          "trample"
        ],
        "affected": "eachCreatureYouControl"
      }
    ],
    "text": "Creatures you control get +2/+2 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)",
    "colors": [
      "G"
    ],
    "rarity": "uncommon",
    "set": "m20",
    "typeLine": "Sorcery",
    "oracleText": "Creatures you control get +2/+2 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)"
  },
  "overrun": {
    "id": "overrun",
    "name": "Overrun",
    "manaCost": {
      "generic": 2,
      "G": 3
    },
    "supertypes": [],
    "types": [
      "Sorcery"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "pump",
        "power": 3,
        "toughness": 3,
        "keywords": [
          "trample"
        ],
        "affected": "eachCreatureYouControl"
      }
    ],
    "text": "Creatures you control get +3/+3 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)",
    "colors": [
      "G"
    ],
    "rarity": "uncommon",
    "set": "fdn",
    "typeLine": "Sorcery",
    "oracleText": "Creatures you control get +3/+3 and gain trample until end of turn. (Each of those creatures can deal excess combat damage to the player or planeswalker it's attacking.)"
  },
  "phantomWarrior": {
    "id": "phantomWarrior",
    "name": "Phantom Warrior",
    "manaCost": {
      "generic": 1,
      "U": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Illusion",
      "Warrior"
    ],
    "power": 2,
    "toughness": 2,
    "keywords": [
      "can't be blocked"
    ],
    "text": "This creature can't be blocked.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m20",
    "typeLine": "Creature — Illusion Warrior",
    "oracleText": "This creature can't be blocked."
  },
  "prodigalPyromancer": {
    "id": "prodigalPyromancer",
    "name": "Prodigal Pyromancer",
    "manaCost": {
      "generic": 2,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Human",
      "Wizard"
    ],
    "power": 1,
    "toughness": 1,
    "abilities": [
      {
        "id": "ability1",
        "text": "{T}: This creature deals 1 damage to any target.",
        "cost": {
          "tap": true
        },
        "effect": {
          "type": "dealDamage",
          "amount": 1
        },
        "target": "any"
      }
    ],
    "text": "{T}: This creature deals 1 damage to any target.",
    "colors": [
      "R"
    ],
    "rarity": "uncommon",
    "set": "m11",
    "typeLine": "Creature — Human Wizard",
    "oracleText": "{T}: This creature deals 1 damage to any target."
  },
  "sensoryDeprivation": {
    "id": "sensoryDeprivation",
    "name": "Sensory Deprivation",
    "manaCost": {
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Enchantment"
    ],
    "subtypes": [
      "Aura"
    ],
    "enchant": "creature",
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": -3
      }
    ],
    "text": "Enchant creature\nEnchanted creature gets -3/-0.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m14",
    "typeLine": "Enchantment — Aura",
    "oracleText": "Enchant creature\nEnchanted creature gets -3/-0."
  },
  "shireBounder": {
    "id": "shireBounder",
    "name": "Shire Bounder",
    "manaCost": {
      "W": 1
    },
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Halfling",
      "Soldier"
    ],
    "power": 1,
    "toughness": 1,
    "staticAbilities": [
      {
        "affected": "source",
        "condition": {
          "sourceEquipped": true
        },
        "power": 1,
        "toughness": 1,
        "keywords": [
          "first strike"
        ]
      }
    ],
    "text": "As long as Shire Bounder is equipped, it gets +1/+1 and has first strike.",
    "colors": [
      "W"
    ],
    "rarity": "common"
  },
  "shivanDragon": {
    "id": "shivanDragon",
    "name": "Shivan Dragon",
    "manaCost": {
      "generic": 4,
      "R": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Dragon"
    ],
    "power": 5,
    "toughness": 5,
    "keywords": [
      "flying"
    ],
    "abilities": [
      {
        "id": "ability1",
        "text": "{R}: This creature gets +1/+0 until end of turn.",
        "cost": {
          "mana": {
            "R": 1
          }
        },
        "effect": {
          "type": "pump",
          "power": 1,
          "toughness": 0,
          "affected": "source"
        }
      }
    ],
    "text": "Flying\n{R}: This creature gets +1/+0 until end of turn.",
    "colors": [
      "R"
    ],
    "rarity": "uncommon",
    "set": "fdn",
    "typeLine": "Creature — Dragon",
    "oracleText": "Flying\n{R}: This creature gets +1/+0 until end of turn."
  },
  "shock": {
    "id": "shock",
    "name": "Shock",
    "manaCost": {
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Instant"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "dealDamage",
        "amount": 2
      }
    ],
    "target": "any",
    "text": "Shock deals 2 damage to any target.",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "m21",
    "typeLine": "Instant",
    "oracleText": "Shock deals 2 damage to any target."
  },
  "siegebreakerGiant": {
    "id": "siegebreakerGiant",
    "name": "Siegebreaker Giant",
    "manaCost": {
      "generic": 3,
      "R": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Giant",
      "Warrior"
    ],
    "power": 6,
    "toughness": 3,
    "keywords": [
      "trample"
    ],
    "abilities": [
      {
        "id": "ability1",
        "text": "{3}{R}: Target creature can't block this turn.",
        "cost": {
          "mana": {
            "generic": 3,
            "R": 1
          }
        },
        "effect": {
          "type": "pump",
          "keywords": [
            "can't block"
          ]
        },
        "target": "creature"
      }
    ],
    "text": "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\n{3}{R}: Target creature can't block this turn.",
    "colors": [
      "R"
    ],
    "rarity": "uncommon",
    "set": "m19",
    "typeLine": "Creature — Giant Warrior",
    "oracleText": "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\n{3}{R}: Target creature can't block this turn."
  },
  "skyscanner": {
    "id": "skyscanner",
    "name": "Skyscanner",
    "manaCost": {
      "generic": 3
    },
    "supertypes": [],
    "types": [
      "Artifact",
      "Creature"
    ],
    "subtypes": [
      "Thopter"
    ],
    "power": 1,
    "toughness": 1,
    "keywords": [
      "flying"
    ],
    "triggeredAbilities": [
      {
        "id": "entersBattlefield",
        "text": "When this creature enters, draw a card.",
        "trigger": "entersBattlefield",
        "effect": {
          "type": "drawCards",
          "count": 1
        }
      }
    ],
    "text": "Flying\nWhen this creature enters, draw a card.",
    "colors": [],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Artifact Creature — Thopter",
    "oracleText": "Flying\nWhen this creature enters, draw a card."
  },
  "snappingDrake": {
    "id": "snappingDrake",
    "name": "Snapping Drake",
    "manaCost": {
      "generic": 3,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Drake"
    ],
    "power": 3,
    "toughness": 2,
    "keywords": [
      "flying"
    ],
    "text": "Flying (This creature can't be blocked except by creatures with flying or reach.)",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Drake",
    "oracleText": "Flying (This creature can't be blocked except by creatures with flying or reach.)"
  },
  "swordOfVengeance": {
    "id": "swordOfVengeance",
    "name": "Sword of Vengeance",
    "manaCost": {
      "generic": 3
    },
    "supertypes": [],
    "types": [
      "Artifact"
    ],
    "subtypes": [
      "Equipment"
    ],
    "abilities": [
      {
        "id": "equip",
        "text": "Equip {3}",
        "cost": {
          "mana": {
            "generic": 3
          }
        },
        "timing": "sorcery",
        "target": "creatureYouControl",
        "effect": {
          "type": "attach"
        }
      }
    ],
    "staticAbilities": [
      {
        "affected": "attachedPermanent",
        "power": 2,
        "keywords": [
          "first strike",
          "vigilance",
          "trample",
          "haste"
        ]
      }
    ],
    "text": "Equipped creature gets +2/+0 and has first strike, vigilance, trample, and haste.\nEquip {3}",
    "colors": [],
    "rarity": "rare",
    "set": "m11",
    "typeLine": "Artifact — Equipment",
    "oracleText": "Equipped creature gets +2/+0 and has first strike, vigilance, trample, and haste.\nEquip {3}"
  },
  "thornhideWolves": {
    "id": "thornhideWolves",
    "name": "Thornhide Wolves",
    "manaCost": {
      "generic": 4,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Wolf"
    ],
    "power": 4,
    "toughness": 5,
    "text": "",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Wolf",
    "oracleText": ""
  },
  "thrashingBrontodon": {
    "id": "thrashingBrontodon",
    "name": "Thrashing Brontodon",
    "manaCost": {
      "generic": 1,
      "G": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Dinosaur"
    ],
    "power": 3,
    "toughness": 4,
    "abilities": [
      {
        "id": "ability1",
        "text": "{1}, Sacrifice this creature: Destroy target artifact or enchantment.",
        "cost": {
          "mana": {
            "generic": 1
          },
          "sacrificeSelf": true
        },
        "effect": {
          "type": "destroy"
        },
        "target": "artifactOrEnchantment"
      }
    ],
    "text": "{1}, Sacrifice this creature: Destroy target artifact or enchantment.",
    "colors": [
      "G"
    ],
    "rarity": "uncommon",
    "set": "m20",
    "typeLine": "Creature — Dinosaur",
    "oracleText": "{1}, Sacrifice this creature: Destroy target artifact or enchantment."
  },
  "titanicGrowth": {
    "id": "titanicGrowth",
    "name": "Titanic Growth",
    "manaCost": {
      "generic": 1,
      "G": 1
    },
    "supertypes": [],
    "types": [
      "Instant"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "pump",
        "power": 4,
        "toughness": 4
      }
    ],
    "target": "creature",
    "text": "Target creature gets +4/+4 until end of turn.",
    "colors": [
      "G"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Instant",
    "oracleText": "Target creature gets +4/+4 until end of turn."
  },
  "unsummon": {
    "id": "unsummon",
    "name": "Unsummon",
    "manaCost": {
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Instant"
    ],
    "subtypes": [],
    "effects": [
      {
        "type": "returnToHand"
      }
    ],
    "target": "creature",
    "text": "Return target creature to its owner's hand.",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m20",
    "typeLine": "Instant",
    "oracleText": "Return target creature to its owner's hand."
  },
  "viashinoPyromancer": {
    "id": "viashinoPyromancer",
    "name": "Viashino Pyromancer",
    "manaCost": {
      "generic": 1,
      "R": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Lizard",
      "Wizard"
    ],
    "power": 2,
    "toughness": 1,
    "triggeredAbilities": [
      {
        "id": "entersBattlefield",
        "text": "When this creature enters, it deals 2 damage to target player or planeswalker.",
        "trigger": "entersBattlefield",
        "effect": {
          "type": "dealDamage",
          "amount": 2
        },
        "target": "player"
      }
    ],
    "text": "When this creature enters, it deals 2 damage to target player or planeswalker.",
    "colors": [
      "R"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Lizard Wizard",
    "oracleText": "When this creature enters, it deals 2 damage to target player or planeswalker."
  },
  "vigilantBaloth": {
    "id": "vigilantBaloth",
    "name": "Vigilant Baloth",
    "manaCost": {
      "generic": 3,
      "G": 2
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Beast"
    ],
    "power": 5,
    "toughness": 5,
    "keywords": [
      "vigilance"
    ],
    "text": "Vigilance (Attacking doesn't cause this creature to tap.)",
    "colors": [
      "G"
    ],
    "rarity": "uncommon",
    "set": "m19",
    "typeLine": "Creature — Beast",
    "oracleText": "Vigilance (Attacking doesn't cause this creature to tap.)"
  },
  "wallOfMist": {
    "id": "wallOfMist",
    "name": "Wall of Mist",
    "manaCost": {
      "generic": 1,
      "U": 1
    },
    "supertypes": [],
    "types": [
      "Creature"
    ],
    "subtypes": [
      "Wall"
    ],
    "power": 0,
    "toughness": 5,
    "keywords": [
      "defender"
    ],
    "text": "Defender",
    "colors": [
      "U"
    ],
    "rarity": "common",
    "set": "m19",
    "typeLine": "Creature — Wall",
    "oracleText": "Defender"
  }
});

/** Green creatures, red burn and blue flyers. */
export const REAL_DECKS = Object.freeze({"greenStompy":["forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","forest","llanowarElves","llanowarElves","llanowarElves","greenwoodSentinel","greenwoodSentinel","druidOfTheCowl","centaurCourser","centaurCourser","centaurCourser","thornhideWolves","vigilantBaloth","vigilantBaloth","thrashingBrontodon","colossalDreadmaw","colossalDreadmaw","titanicGrowth","titanicGrowth","overrun","overrun","overcome","oakenform","mantleOfWebs","brawlersPlate"],"redBurn":["mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","mountain","fanaticalFirebrand","fanaticalFirebrand","fanaticalFirebrand","prodigalPyromancer","prodigalPyromancer","viashinoPyromancer","viashinoPyromancer","boggartBrute","boggartBrute","emberHauler","emberHauler","hostileMinotaur","siegebreakerGiant","shivanDragon","shock","shock","shock","lightningStrike","lightningStrike","burnBright","goblinWarPaint","swordOfVengeance","explosiveApparatus"],"blueSkies":["island","island","island","island","island","island","island","island","island","island","island","island","island","island","island","island","island","aegisTurtle","wallOfMist","phantomWarrior","phantomWarrior","cloudkinSeer","cloudkinSeer","cloudkinSeer","skyscanner","skyscanner","snappingDrake","snappingDrake","snappingDrake","bigfinBouncer","airElemental","airElemental","essenceScatter","essenceScatter","unsummon","divination","aetherTunnel","sensoryDeprivation","kitesail","arcaneEncyclopedia"]});
