# Complete Player Data Structure Reference

This document provides a comprehensive reference of **every single field** that is saved for each player.

## Top-Level Fields

### Core Stats
```javascript
{
  level: number,           // Player level
  xp: number,             // Current XP
  hp: number,             // Current HP
  maxHp: number,          // Maximum HP
  mana: number,           // Current mana
  maxMana: number,        // Maximum mana
  coins: number           // Currency
}
```

### Inventory & Equipment
```javascript
{
  inventory: {            // Item inventory
    [itemId]: quantity    // Item ID -> quantity
  },
  equipped: {
    weapon: string | null,
    helmet: string | null,
    chestplate: string | null,
    leggings: string | null,
    boots: string | null,
    accessories: string[], // Array of accessory IDs (max 3)
    tool: string          // Tool item ID
  }
}
```

### Progression
```javascript
{
  quests: number[],                    // Active quest IDs
  completedQuests: number[],           // Completed quest IDs
  questProgress: {                     // Quest progress tracking
    [questId]: progressData
  },
  tutorialStarted: boolean            // Tutorial completion flag
}
```

### Character Development
```javascript
{
  attributes: {
    power: number,        // Power attribute
    agility: number,      // Agility attribute
    resilience: number,   // Resilience attribute
    focus: number         // Focus attribute
  },
  stats: {
    kills: number,
    deaths: number,
    gamesPlayed: number,
    crafted: number,
    dungeonsCleared: number,
    questsStarted: number,
    questsCompleted: number,
    codexUnlocks: number,
    factionsAssisted: {},  // {factionId: count}
    eventsParticipated: number,
    brewsCrafted: number,
    brewsConsumed: number,
    pvpWins: number,
    pvpLosses: number,
    teamWins: number,
    teamLosses: number,
    contractsCompleted: number,
    maxSettlementPrestige: number,
    settlementsManaged: number,
    basesClaimed: number,
    baseRankUps: number,
    baseModulesUpgraded: number
  },
  codex: {
    factions: string[],    // Discovered faction IDs
    biomes: string[],      // Discovered biome IDs
    enemies: string[],     // Discovered enemy IDs
    items: string[],       // Discovered item IDs
    dungeons: string[],    // Discovered dungeon IDs
    structures: string[],  // Discovered structure IDs
    settlements: string[]  // Discovered settlement IDs
  },
  reputation: {            // Faction reputations
    [factionId]: number    // Faction ID -> reputation value
  },
  achievements: {
    claimed: string[],     // Claimed achievement IDs
    notified: string[]     // Notified achievement IDs
  }
}
```

### Game Systems
```javascript
{
  activeBuffs: {          // Active buffs
    [buffId]: {           // Buff ID -> buff data
      expiresAt: number,  // Timestamp when buff expires
      // ... other buff properties
    }
  },
  contracts: {            // Faction contracts
    [factionId]: {        // Faction ID -> contract data
      name: string,
      progress: number,
      quantity: number,
      completed: boolean,
      // ... other contract properties
    }
  },
  cosmetics: {
    titles: {
      owned: string[],    // Owned title IDs
      equipped: string | null  // Equipped title ID
    }
  },
  pets: {
    owned: string[],      // Owned pet IDs
    active: string | null, // Currently active pet ID
    stabled: string[],    // Stabled pet IDs
    taskQueue: []         // Pet task queue
  },
  spells: {
    known: string[],      // Known spell IDs
    equipped: string[],   // Equipped spell IDs (max 4)
    cooldowns: {          // Spell cooldowns
      [spellId]: number   // Spell ID -> cooldown timestamp
    }
  },
  skillTree: {
    class: string | null, // Selected class (warrior, mage, rogue)
    branches: {           // Branch progress
      [branchId]: {
        skills: string[], // Unlocked skill IDs
        points: number    // Points spent in branch
      }
    },
    totalPoints: number   // Total skill points spent
  },
  adventureMode: {
    currentChapter: string | null,  // Current chapter ID
    currentSection: string | null,  // Current section ID
    progress: {                     // Chapter progress
      [chapterId]: progressData
    },
    choices: []                     // Story choices made
  },
  dailyChallenges: {
    active: string[],     // Active challenge IDs
    completed: string[],  // Completed challenge IDs (today)
    streak: number,       // Consecutive days streak
    lastReset: number | null  // Timestamp of last reset
  },
  pvp: {
    rating: number,       // PvP rating
    wins: number,         // Win count
    losses: number,       // Loss count
    streak: number,       // Win streak
    rank: string          // Current rank (unranked, bronze, etc.)
  },
  worldBosses: {
    participated: string[],  // Boss IDs participated in
    lastDamage: {            // Last damage dealt
      [bossId]: number       // Boss ID -> damage amount
    },
    rewards: []              // Pending rewards
  },
  worldEvents: {
    active: string[],     // Active event IDs
    participation: {      // Participation tracking
      [eventId]: data     // Event ID -> participation data
    },
    rewards: []           // Pending rewards
  }
}
```

### Exploration & World
```javascript
{
  exploration: {
    currentBiome: string,           // Current biome ID
    targetBiome: string | null,     // Target biome ID (when traveling)
    status: string,                 // Exploration status (idle, traveling, etc.)
    action: string | null,          // Current action
    discoveredBiomes: string[],     // Array of discovered biome IDs
    unlockedZones: string[],        // Array of unlocked zone IDs
    lastTick: number,               // Timestamp of last tick
    gathering: {                    // Current gathering activity
      type: string,                 // Gathering type (mine, forage, etc.)
      startedAt: number,            // Start timestamp
      endsAt: number,               // End timestamp
      biomeId: string               // Biome where gathering
    } | null,
    consecutiveActionsSinceCombat: number,  // Consecutive actions counter
    lastCombatAt: number,           // Timestamp of last combat
    pendingChain: object | null     // Pending chain event
  },
  bases: {                         // Player bases
    [biomeId]: {                   // Biome ID -> base data
      biomeId: string,
      rank: number,
      name: string,
      upgrades: {                  // Module upgrades
        [moduleId]: number         // Module ID -> level
      },
      storage: {                   // Base storage
        [itemId]: number           // Item ID -> quantity
      },
      capacity: number,            // Storage capacity
      lastProcessed: number,       // Timestamp of last processing
      bonuses: {                   // Computed bonuses
        storageBonus: number,
        extractorRate: number,
        travelModifier: number,
        xpRate: number,
        coinRate: number,
        incidentDefense: number,
        surveyBoost: number,
        settlementDefenseBonus: number,
        settlementWealthBonus: number,
        contractRewardBonus: number,
        brewSuccessBonus: number
      },
      logs: [],                    // Base activity logs
      progress: {                  // Module progress tracking
        [moduleId]: {              // Module ID -> progress data
          [slot]: number           // Progress amount for automation
        }
      },
      unreadLogs: number           // Count of unread logs
    }
  },
  settlements: {                   // Player settlements
    [settlementId]: {              // Settlement ID -> settlement data
      id: string,
      name: string,
      faction: string,
      templateId: string,
      buildings: {                 // Building levels
        [buildingId]: number       // Building ID -> level
      },
      availableBuildings: string[], // Available building IDs
      population: number,          // Settlement population
      happiness: number,           // Happiness (0-100)
      wealth: number,              // Settlement wealth
      garrison: number,            // Garrison size
      prestige: number,            // Prestige points
      prestigeTier: string,        // Prestige tier ID
      traits: string[],            // Settlement traits
      decisions: [],               // Decisions made
      nextDecisionAt: number,      // Timestamp for next decision
      expeditions: [{              // Expeditions array
        id: string,                // Expedition ID
        type: string,              // Expedition type
        villagers: number,         // Villagers sent
        status: string,            // Status (active, completed, etc.)
        startedAt: number,         // Start timestamp
        endsAt: number,            // End timestamp
        success: boolean | null,   // Success status (if completed)
        rewards: object | null,    // Rewards (if completed)
        returning: number          // Villagers returning (if completed)
      }],
      bonuses: {                   // Settlement bonuses
        [bonusKey]: number         // Bonus type -> value
      },
      production: {                // Production rates
        [itemId]: number           // Item ID -> production rate
      },
      stockpile: {                 // Settlement stockpile
        [itemId]: number           // Item ID -> quantity
      },
      lastUpdated: number,         // Timestamp of last update
      lastPrestigeTierChange: number | undefined  // Timestamp of last prestige tier change
    }
  },
  travelHistory: []                // Travel history array
}
```

### Additional Fields
```javascript
{
  baseBonuses: {                   // Computed bonuses from bases
    contractRewardBonus: number,
    settlementWealthBonus: number,
    settlementDefenseBonus: number,
    brewSuccessBonus: number
  },
  gatheringGear: {
    current: {                     // Current gathering gear
      [type]: string               // Type (mining, foraging, etc.) -> tier ID
    },
    unlocked: {                    // Unlocked gathering gear
      [type]: {                    // Type -> unlocked tiers
        [tierId]: boolean          // Tier ID -> unlocked status
      }
    }
  },
  settings: {
    gatherNotifications: boolean   // Gather notification setting
  },
  tutorials: {
    gathering: {
      intro: boolean,              // Intro tutorial completed
      completionHint: boolean      // Completion hint shown
    },
    onboarding: object | null      // Onboarding state
  }
}
```

## Complete Field List

### All Top-Level Fields (30+ fields)
1. `level`
2. `xp`
3. `hp`
4. `maxHp`
5. `mana`
6. `maxMana`
7. `coins`
8. `inventory`
9. `equipped`
10. `quests`
11. `completedQuests`
12. `questProgress`
13. `tutorialStarted`
14. `achievements`
15. `attributes`
16. `stats`
17. `codex`
18. `reputation`
19. `activeBuffs`
20. `contracts`
21. `cosmetics`
22. `pets`
23. `spells`
24. `skillTree`
25. `adventureMode`
26. `dailyChallenges`
27. `pvp`
28. `worldBosses`
29. `worldEvents`
30. `exploration`
31. `bases`
32. `settlements`
33. `travelHistory`
34. `baseBonuses`
35. `gatheringGear`
36. `settings`
37. `tutorials`

## Nested Structure Validation

The save function validates and ensures all nested structures are complete:

### Bases (11+ fields per base)
- `biomeId`, `rank`, `name`
- `upgrades` (object)
- `storage` (object)
- `capacity`, `lastProcessed`
- `bonuses` (object)
- `logs` (array)
- `progress` (object)
- `unreadLogs`

### Settlements (20+ fields per settlement)
- `id`, `name`, `faction`, `templateId`
- `buildings` (object)
- `availableBuildings` (array)
- `population`, `happiness`, `wealth`, `garrison`
- `prestige`, `prestigeTier`
- `traits` (array)
- `decisions` (array)
- `nextDecisionAt`
- `expeditions` (array with 9+ fields each)
- `bonuses` (object)
- `production` (object)
- `stockpile` (object)
- `lastUpdated`
- `lastPrestigeTierChange` (optional)

### Expeditions (9+ fields per expedition)
- `id`, `type`, `villagers`
- `status`, `startedAt`, `endsAt`
- `success`, `rewards`, `returning`

## Data Validation

Before saving, the system:
1. ✅ Validates all 37 top-level fields
2. ✅ Validates all nested structures
3. ✅ Ensures arrays are arrays
4. ✅ Ensures objects are objects
5. ✅ Adds missing fields with defaults
6. ✅ Validates base structures (11+ fields each)
7. ✅ Validates settlement structures (20+ fields each)
8. ✅ Validates expedition structures (9+ fields each)
9. ✅ Validates contract structures
10. ✅ Validates codex categories (7 categories)
11. ✅ Validates all game system structures

## Summary

**Total Fields Saved:**
- **37 top-level fields**
- **11+ fields per base** (multiplied by number of bases)
- **20+ fields per settlement** (multiplied by number of settlements)
- **9+ fields per expedition** (multiplied by number of expeditions)
- **All nested structures validated and saved**

**Nothing is left behind!** Every piece of player data is validated, saved, and preserved.

