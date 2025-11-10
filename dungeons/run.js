'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');

// Load dungeon definitions
let dungeonDefinitions = [];
try {
  const fs = require('fs');
  const dataPath = path.join(__dirname, '..', 'data', 'dungeons.json');
  if (fs.existsSync(dataPath)) {
    dungeonDefinitions = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch (error) {
  console.error('[DUNGEON RUN] Failed to load dungeon definitions:', error.message);
  dungeonDefinitions = [];
}

const ACTIVE_RUNS = new Map(); // runId -> run state
const PLAYER_RUN_INDEX = new Map(); // userId -> runId
const RUN_MESSAGE_INDEX = new Map(); // messageId -> runId

let runSerial = 0;

// Room types
const ROOM_TYPES = {
  COMBAT: 'combat',
  PUZZLE: 'puzzle',
  TREASURE: 'treasure',
  EVENT: 'event',
  PRE_BOSS: 'pre_boss',
  BOSS: 'boss'
};

// Generate a procedural dungeon run from a template
function generateDungeonRun(dungeonTemplate, partyMembers, options = {}) {
  if (!dungeonTemplate || !partyMembers || partyMembers.length === 0) {
    return null;
  }

  const runId = `run_${Date.now()}_${++runSerial}`;
  const avgLevel = Math.round(partyMembers.reduce((sum, p) => sum + (p.level || 1), 0) / partyMembers.length);
  
  // Build room sequence: start with 2-4 regular rooms, then pre-boss, then boss
  const rooms = [];
  const regularRoomCount = 2 + Math.floor(Math.random() * 3); // 2-4 rooms
  
  // Regular rooms (mix of combat, puzzle, treasure, event)
  for (let i = 0; i < regularRoomCount; i++) {
    const roomType = weightedRandomRoomType(i, regularRoomCount);
    rooms.push(generateRoom(roomType, dungeonTemplate, avgLevel, i + 1));
  }
  
  // Pre-boss room (required before boss)
  rooms.push(generateRoom(ROOM_TYPES.PRE_BOSS, dungeonTemplate, avgLevel, rooms.length + 1));
  
  // Boss room
  const bossFloor = dungeonTemplate.floors?.find(f => f.boss) || dungeonTemplate.floors?.[dungeonTemplate.floors.length - 1];
  if (bossFloor) {
    rooms.push(generateBossRoom(bossFloor, dungeonTemplate, avgLevel, rooms.length + 1));
  }

  const run = {
    id: runId,
    dungeonId: dungeonTemplate.id,
    dungeonName: dungeonTemplate.name,
    theme: dungeonTemplate.theme,
    biome: dungeonTemplate.biome,
    environment: dungeonTemplate.environment,
    party: new Map(partyMembers.map(p => [p.userId, {
      userId: p.userId,
      username: p.username || `Player ${p.userId}`,
      level: p.level || 1,
      hp: p.hp || p.maxHp || 100,
      maxHp: p.maxHp || 100,
      mana: p.mana || p.maxMana || 50,
      maxMana: p.maxMana || 50,
      damageDealt: 0,
      actionsTaken: 0
    }])),
    rooms,
    currentRoomIndex: 0,
    completedRooms: [],
    teamBuffs: [],
    startTime: Date.now(),
    channelId: options.channelId,
    messageId: null,
    status: 'active' // active, completed, failed
  };

  ACTIVE_RUNS.set(runId, run);
  partyMembers.forEach(p => {
    PLAYER_RUN_INDEX.set(p.userId, runId);
  });

  return run;
}

function weightedRandomRoomType(index, total) {
  const rand = Math.random();
  // Early rooms: more combat/treasure, later rooms: more puzzles/events
  if (index < total / 2) {
    if (rand < 0.4) return ROOM_TYPES.COMBAT;
    if (rand < 0.65) return ROOM_TYPES.TREASURE;
    if (rand < 0.85) return ROOM_TYPES.PUZZLE;
    return ROOM_TYPES.EVENT;
  } else {
    if (rand < 0.35) return ROOM_TYPES.COMBAT;
    if (rand < 0.55) return ROOM_TYPES.PUZZLE;
    if (rand < 0.75) return ROOM_TYPES.EVENT;
    return ROOM_TYPES.TREASURE;
  }
}

function generateRoom(type, dungeonTemplate, avgLevel, roomNumber) {
  const room = {
    id: `room_${roomNumber}`,
    number: roomNumber,
    type,
    completed: false,
    rewards: [],
    difficulty: Math.min(5, Math.max(1, Math.floor(avgLevel / 2) + Math.floor(roomNumber / 2))) // Scale difficulty
  };

  // Room name variations based on dungeon theme
  const theme = dungeonTemplate.theme || 'unknown';
  const themeNames = {
    varyn: { combat: ['Shadow Chamber', 'Void Hall', 'Dark Passage'], puzzle: ['Void Lock', 'Shadow Mechanism'], treasure: ['Void Cache', 'Shadow Vault'], event: ['Void Anomaly', 'Shadow Event'] },
    kweebec: { combat: ['Root Chamber', 'Grove Hall', 'Nature Passage'], puzzle: ['Ancient Lock', 'Grove Mechanism'], treasure: ['Nature Cache', 'Grove Vault'], event: ['Grove Blessing', 'Nature Event'] },
    human: { combat: ['Stone Chamber', 'Fortress Hall', 'Military Passage'], puzzle: ['Ancient Lock', 'Fortress Mechanism'], treasure: ['Military Cache', 'Fortress Vault'], event: ['Military Aid', 'Fortress Event'] }
  };
  
  const names = themeNames[theme] || themeNames.varyn;
  const namePool = names[type] || names.combat;

  switch (type) {
    case ROOM_TYPES.COMBAT:
      room.name = namePool[Math.floor(Math.random() * namePool.length)] || `Combat Chamber ${roomNumber}`;
      room.emoji = '⚔️';
      room.description = getCombatDescription(theme, room.difficulty);
      room.enemies = generateEnemies(dungeonTemplate, avgLevel, roomNumber, room.difficulty);
      break;
    case ROOM_TYPES.PUZZLE:
      room.name = namePool[Math.floor(Math.random() * namePool.length)] || `Puzzle Room ${roomNumber}`;
      room.emoji = '🧩';
      room.description = getPuzzleDescription(theme, room.difficulty);
      room.puzzle = generatePuzzle(dungeonTemplate, roomNumber, room.difficulty);
      break;
    case ROOM_TYPES.TREASURE:
      room.name = namePool[Math.floor(Math.random() * namePool.length)] || `Treasure Vault ${roomNumber}`;
      room.emoji = '💎';
      room.description = getTreasureDescription(theme, room.difficulty);
      room.loot = generateTreasureLoot(dungeonTemplate, avgLevel, room.difficulty);
      break;
    case ROOM_TYPES.EVENT:
      room.name = namePool[Math.floor(Math.random() * namePool.length)] || `Event Chamber ${roomNumber}`;
      room.emoji = '✨';
      room.description = getEventDescription(theme, room.difficulty);
      room.event = generateEvent(dungeonTemplate, roomNumber, room.difficulty);
      break;
    case ROOM_TYPES.PRE_BOSS:
      room.name = 'Pre-Boss Chamber';
      room.emoji = '🔥';
      room.description = 'The final guardian awaits beyond. Complete this challenge to proceed.';
      room.challenge = generatePreBossChallenge(dungeonTemplate, avgLevel);
      break;
    default:
      room.name = `Chamber ${roomNumber}`;
      room.emoji = '🏛️';
      room.description = 'An empty chamber.';
  }

  return room;
}

function getCombatDescription(theme, difficulty) {
  const descriptions = {
    varyn: ['Void creatures lurk in the shadows.', 'Dark entities guard this passage.', 'Shadow beasts block your path.'],
    kweebec: ['Nature guardians protect this grove.', 'Root-bound creatures defend this chamber.', 'Wildlife blocks your path.'],
    human: ['Military constructs guard this area.', 'Fortress defenders block your path.', 'Automated defenses activate.']
  };
  const pool = descriptions[theme] || descriptions.varyn;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getPuzzleDescription(theme, difficulty) {
  const descriptions = {
    varyn: ['Ancient void mechanisms block your path.', 'Shadow locks require solving.', 'Dark puzzles guard this chamber.'],
    kweebec: ['Nature puzzles block your path.', 'Ancient grove mechanisms require solving.', 'Root-bound puzzles guard this chamber.'],
    human: ['Ancient fortress mechanisms block your path.', 'Military locks require solving.', 'Automated puzzles guard this chamber.']
  };
  const pool = descriptions[theme] || descriptions.varyn;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getTreasureDescription(theme, difficulty) {
  const descriptions = {
    varyn: ['A void cache awaits discovery.', 'Shadow treasures lie hidden here.', 'Dark riches await the brave.'],
    kweebec: ['Nature treasures await discovery.', 'Grove riches lie hidden here.', 'Wild treasures await the brave.'],
    human: ['Military supplies await discovery.', 'Fortress riches lie hidden here.', 'Ancient treasures await the brave.']
  };
  const pool = descriptions[theme] || descriptions.varyn;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getEventDescription(theme, difficulty) {
  const descriptions = {
    varyn: ['A void anomaly pulses here.', 'Shadow energy swirls in this chamber.', 'Dark forces gather.'],
    kweebec: ['Nature energy flows here.', 'Grove blessings await.', 'Wild magic gathers.'],
    human: ['Ancient mechanisms activate.', 'Fortress systems come online.', 'Military aid arrives.']
  };
  const pool = descriptions[theme] || descriptions.varyn;
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateBossRoom(bossFloor, dungeonTemplate, avgLevel, roomNumber) {
  return {
    id: `boss_room`,
    number: roomNumber,
    type: ROOM_TYPES.BOSS,
    name: bossFloor.name || 'Boss Chamber',
    emoji: bossFloor.emoji || '🐉',
    description: bossFloor.description || 'The final guardian awaits.',
    boss: {
      name: bossFloor.name,
      emoji: bossFloor.emoji,
      hp: Math.round((bossFloor.baseHp || 200) + (bossFloor.hpPerLevel || 20) * avgLevel),
      maxHp: Math.round((bossFloor.baseHp || 200) + (bossFloor.hpPerLevel || 20) * avgLevel),
      damage: Math.round((bossFloor.baseDamage || 20) + (bossFloor.damagePerLevel || 2.8) * avgLevel),
      xp: Math.round((bossFloor.baseXp || 200) + (bossFloor.xpPerLevel || 18) * avgLevel),
      coins: Math.round((bossFloor.baseCoins || 200) + (bossFloor.coinsPerLevel || 10) * avgLevel),
      loot: bossFloor.loot || [],
      relic: bossFloor.relic || null
    },
    completed: false,
    rewards: []
  };
}

function generateEnemies(dungeonTemplate, avgLevel, roomNumber, difficulty = 1) {
  // Use a random floor from the dungeon template as enemy template
  const floors = dungeonTemplate.floors?.filter(f => !f.boss) || [];
  if (floors.length === 0) {
    const difficultyMultiplier = 1 + (difficulty - 1) * 0.2;
    return [{
      name: 'Dungeon Guardian',
      hp: Math.round((50 + avgLevel * 5) * difficultyMultiplier),
      maxHp: Math.round((50 + avgLevel * 5) * difficultyMultiplier),
      damage: Math.round((5 + avgLevel) * difficultyMultiplier),
      xp: Math.round((30 + avgLevel * 5) * difficultyMultiplier),
      coins: Math.round((20 + avgLevel * 3) * difficultyMultiplier)
    }];
  }
  
  const template = floors[Math.floor(Math.random() * floors.length)];
  const difficultyMultiplier = 1 + (difficulty - 1) * 0.2;
  const enemyCount = Math.min(3, 1 + Math.floor(Math.random() * 2) + Math.floor(difficulty / 2)); // 1-3 enemies, scales with difficulty
  
  return Array.from({ length: enemyCount }, () => ({
    name: template.name || 'Dungeon Guardian',
    emoji: template.emoji || '👹',
    hp: Math.round(((template.baseHp || 80) + (template.hpPerLevel || 10) * avgLevel) * difficultyMultiplier),
    maxHp: Math.round(((template.baseHp || 80) + (template.hpPerLevel || 10) * avgLevel) * difficultyMultiplier),
    damage: Math.round(((template.baseDamage || 10) + (template.damagePerLevel || 1.5) * avgLevel) * difficultyMultiplier),
    xp: Math.round(((template.baseXp || 50) + (template.xpPerLevel || 8) * avgLevel) * difficultyMultiplier),
    coins: Math.round(((template.baseCoins || 40) + (template.coinsPerLevel || 4) * avgLevel) * difficultyMultiplier),
    loot: template.loot || [],
    statusEffects: [] // For future status effect system
  }));
}

function generatePuzzle(dungeonTemplate, roomNumber, difficulty = 1) {
  const puzzles = [
    {
      type: 'sequence',
      question: 'Press the buttons in the correct order: Red, Blue, Green, Yellow',
      solution: ['red', 'blue', 'green', 'yellow'],
      hint: 'Follow the colors of the rainbow.',
      difficulty: 1
    },
    {
      type: 'sequence',
      question: 'Press the buttons in the correct order: Fire, Water, Earth, Air, Void',
      solution: ['fire', 'water', 'earth', 'air', 'void'],
      hint: 'Follow the elemental cycle.',
      difficulty: 2
    },
    {
      type: 'riddle',
      question: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?',
      solution: ['echo'],
      hint: 'Think of something that repeats sounds.',
      difficulty: 1
    },
    {
      type: 'riddle',
      question: 'The more you take, the more you leave behind. What am I?',
      solution: ['footsteps'],
      hint: 'Think about walking.',
      difficulty: 2
    },
    {
      type: 'riddle',
      question: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',
      solution: ['map'],
      hint: 'Think about navigation.',
      difficulty: 3
    },
    {
      type: 'math',
      question: 'Solve: (5 × 3) + (10 ÷ 2) = ?',
      solution: ['20'],
      hint: 'Remember order of operations: multiplication and division first.',
      difficulty: 1
    },
    {
      type: 'math',
      question: 'Solve: (12 × 4) - (8 ÷ 2) + 5 = ?',
      solution: ['49'],
      hint: 'Order of operations: parentheses, multiplication/division, then addition/subtraction.',
      difficulty: 2
    },
    {
      type: 'math',
      question: 'Solve: (15 × 3) + (20 ÷ 4) - (6 × 2) = ?',
      solution: ['38'],
      hint: 'Work from left to right after handling parentheses.',
      difficulty: 3
    },
    {
      type: 'pattern',
      question: 'What comes next in the sequence: 2, 4, 8, 16, ?',
      solution: ['32'],
      hint: 'Each number doubles the previous one.',
      difficulty: 2
    },
    {
      type: 'pattern',
      question: 'What comes next in the sequence: 1, 4, 9, 16, ?',
      solution: ['25'],
      hint: 'Think about squares.',
      difficulty: 3
    }
  ];
  
  // Filter puzzles by difficulty
  const availablePuzzles = puzzles.filter(p => p.difficulty <= difficulty);
  const selectedPuzzles = availablePuzzles.length > 0 ? availablePuzzles : puzzles;
  
  return selectedPuzzles[Math.floor(Math.random() * selectedPuzzles.length)];
}

function generateTreasureLoot(dungeonTemplate, avgLevel, difficulty = 1) {
  // Generate random loot based on dungeon theme and difficulty
  const difficultyMultiplier = 1 + (difficulty - 1) * 0.3;
  const baseCoins = Math.round((50 + avgLevel * 10 + Math.floor(Math.random() * 50)) * difficultyMultiplier);
  
  // Chance for items based on difficulty
  const items = [];
  if (Math.random() < 0.3 * difficulty) {
    // Add random items from dungeon loot tables
    const floors = dungeonTemplate.floors || [];
    floors.forEach(floor => {
      if (floor.loot && Array.isArray(floor.loot)) {
        floor.loot.forEach(lootEntry => {
          if (Math.random() < (lootEntry.chance || 0.3) * difficulty * 0.5) {
            const quantity = Math.floor(Math.random() * ((lootEntry.max || 1) - (lootEntry.min || 1) + 1)) + (lootEntry.min || 1);
            items.push({ itemId: lootEntry.item, quantity });
          }
        });
      }
    });
  }
  
  return {
    coins: baseCoins,
    items: items.slice(0, Math.min(3, difficulty)) // Limit items based on difficulty
  };
}

function generateEvent(dungeonTemplate, roomNumber, difficulty = 1) {
  const events = [
    {
      type: 'buff',
      name: 'Ancient Blessing',
      description: 'A mystical aura grants your team a temporary power boost!',
      buff: { power: 10 + difficulty * 2, duration: 'dungeon' },
      difficulty: 1
    },
    {
      type: 'buff',
      name: 'Elemental Empowerment',
      description: 'Elemental energy surges through your party, enhancing all abilities!',
      buff: { power: 15 + difficulty * 3, defense: 5 + difficulty, duration: 'dungeon' },
      difficulty: 2
    },
    {
      type: 'heal',
      name: 'Healing Spring',
      description: 'A restorative spring restores your party\'s health.',
      healPercent: 0.3 + difficulty * 0.05,
      difficulty: 1
    },
    {
      type: 'heal',
      name: 'Restorative Fountain',
      description: 'A powerful fountain fully restores your party\'s health and mana!',
      healPercent: 1.0,
      restoreMana: true,
      difficulty: 3
    },
    {
      type: 'choice',
      name: 'Mysterious Altar',
      description: 'An altar offers a choice: take coins or a random item.',
      choices: ['coins', 'item'],
      difficulty: 1
    },
    {
      type: 'choice',
      name: 'Ancient Shrine',
      description: 'A shrine offers multiple rewards. Choose wisely.',
      choices: ['coins', 'item', 'buff'],
      difficulty: 2
    },
    {
      type: 'combat_bonus',
      name: 'Combat Training Ground',
      description: 'A training area that grants combat experience and temporary bonuses.',
      xpBonus: 50 + difficulty * 20,
      buff: { critChance: 0.1, duration: 'dungeon' },
      difficulty: 2
    },
    {
      type: 'loot_bonus',
      name: 'Treasure Finder\'s Blessing',
      description: 'A blessing that increases loot discovery for the rest of the dungeon.',
      buff: { lootBonus: 0.2, duration: 'dungeon' },
      difficulty: 3
    }
  ];
  
  // Filter events by difficulty
  const availableEvents = events.filter(e => e.difficulty <= difficulty);
  const selectedEvents = availableEvents.length > 0 ? availableEvents : events;
  
  return selectedEvents[Math.floor(Math.random() * selectedEvents.length)];
}

function generatePreBossChallenge(dungeonTemplate, avgLevel) {
  return {
    type: 'elite_combat',
    name: 'Elite Guardian',
    description: 'A powerful guardian blocks the path to the boss chamber.',
    enemy: {
      name: 'Elite Guardian',
      hp: Math.round(150 + avgLevel * 15),
      maxHp: Math.round(150 + avgLevel * 15),
      damage: Math.round(15 + avgLevel * 2),
      xp: Math.round(100 + avgLevel * 12),
      coins: Math.round(80 + avgLevel * 8)
    }
  };
}

function getRun(runId) {
  return ACTIVE_RUNS.get(runId);
}

function getRunByPlayer(userId) {
  const runId = PLAYER_RUN_INDEX.get(userId);
  return runId ? ACTIVE_RUNS.get(runId) : null;
}

function getRunByMessage(messageId) {
  const runId = RUN_MESSAGE_INDEX.get(messageId);
  return runId ? ACTIVE_RUNS.get(runId) : null;
}

function buildRunEmbed(run, options = {}) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (!currentRoom) {
    return buildCompletionEmbed(run);
  }

  const embed = new EmbedBuilder()
    .setColor('#8E44AD')
    .setTitle(`🏰 ${run.dungeonName} — Room ${run.currentRoomIndex + 1}/${run.rooms.length}`)
    .setDescription(`${currentRoom.emoji} **${currentRoom.name}**\n${currentRoom.description}`)
    .addFields(
      { name: 'Party', value: formatPartyStatus(run), inline: false }
    );

  if (currentRoom.type === ROOM_TYPES.COMBAT && currentRoom.enemies) {
    const enemyStatus = currentRoom.enemies.map(e => 
      `${e.emoji || '👹'} **${e.name}** — HP: ${e.hp}/${e.maxHp}`
    ).join('\n');
    embed.addFields({ name: 'Enemies', value: enemyStatus || 'None', inline: false });
  }

  if (currentRoom.type === ROOM_TYPES.PUZZLE && currentRoom.puzzle) {
    embed.addFields({ name: 'Puzzle', value: currentRoom.puzzle.question, inline: false });
  }

  if (run.teamBuffs.length > 0) {
    const buffList = run.teamBuffs.map(b => `• ${b.name}: ${b.description}`).join('\n');
    embed.addFields({ name: 'Team Buffs', value: buffList, inline: false });
  }

  embed.setFooter({ text: `Room ${run.currentRoomIndex + 1} of ${run.rooms.length}` });

  return embed;
}

function buildCompletionEmbed(run) {
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('🎉 Dungeon Cleared!')
    .setDescription(`Your party successfully completed **${run.dungeonName}**!`)
    .addFields(
      { name: 'Party', value: formatPartyStatus(run), inline: false }
    )
    .setFooter({ text: 'Rewards will be distributed shortly.' });

  return embed;
}

function formatPartyStatus(run) {
  return Array.from(run.party.values())
    .map(p => `<@${p.userId}> — HP: ${p.hp}/${p.maxHp} | Level ${p.level}`)
    .join('\n');
}

function buildRoomActionComponents(run) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (!currentRoom) return [];

  const components = [];

  switch (currentRoom.type) {
    case ROOM_TYPES.COMBAT:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon|attack|${run.id}`)
            .setLabel('⚔️ Attack')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`dungeon|defend|${run.id}`)
            .setLabel('🛡️ Defend')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`dungeon|ability|${run.id}`)
            .setLabel('✨ Ability')
            .setStyle(ButtonStyle.Secondary)
        )
      );
      break;
    case ROOM_TYPES.PUZZLE:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon|solve|${run.id}`)
            .setLabel('🧩 Attempt Puzzle')
            .setStyle(ButtonStyle.Primary)
        )
      );
      break;
    case ROOM_TYPES.TREASURE:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon|claim|${run.id}`)
            .setLabel('💎 Claim Treasure')
            .setStyle(ButtonStyle.Success)
        )
      );
      break;
    case ROOM_TYPES.EVENT:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon|interact|${run.id}`)
            .setLabel('✨ Interact')
            .setStyle(ButtonStyle.Primary)
        )
      );
      break;
    case ROOM_TYPES.PRE_BOSS:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon|challenge|${run.id}`)
            .setLabel('🔥 Begin Challenge')
            .setStyle(ButtonStyle.Danger)
        )
      );
      break;
    case ROOM_TYPES.BOSS:
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`dungeon|attack|${run.id}`)
            .setLabel('⚔️ Attack Boss')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`dungeon|defend|${run.id}`)
            .setLabel('🛡️ Defend')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`dungeon|ability|${run.id}`)
            .setLabel('✨ Ability')
            .setStyle(ButtonStyle.Secondary)
        )
      );
      break;
  }

  // Navigation buttons
  if (run.currentRoomIndex < run.rooms.length - 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`dungeon|next|${run.id}`)
          .setLabel('➡️ Next Room')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!currentRoom.completed),
        new ButtonBuilder()
          .setCustomId(`dungeon|leave|${run.id}`)
          .setLabel('🚪 Leave Dungeon')
          .setStyle(ButtonStyle.Danger)
      )
    );
  } else if (currentRoom.completed) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`dungeon|complete|${run.id}`)
          .setLabel('🎉 Complete Dungeon')
          .setStyle(ButtonStyle.Success)
      )
    );
  }

  return components;
}

module.exports = {
  generateDungeonRun,
  getRun,
  getRunByPlayer,
  getRunByMessage,
  buildRunEmbed,
  buildRoomActionComponents,
  ROOM_TYPES,
  ACTIVE_RUNS,
  PLAYER_RUN_INDEX,
  RUN_MESSAGE_INDEX
};

