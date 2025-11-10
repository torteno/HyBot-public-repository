// Hytale Discord Bot - Comprehensive RPG & Mini-Games Bot
// Required dependencies: discord.js, axios, node-cron
// Install: npm install discord.js axios node-cron

require('dotenv').config();
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) throw new Error('DISCORD_TOKEN missing');

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags
} = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = '!hy';

// ==================== DATA STORAGE ====================
const playerData = new Map(); // userId -> player data
const activeGames = new Map(); // channelId -> game data
const lastTweetId = new Map(); // guildId -> last tweet ID

const DATA_DIR = path.join(__dirname, 'data');

function loadDataFile(fileName, fallback) {
  try {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      console.warn(`[DATA] Missing ${fileName}, using fallback.`);
      return JSON.parse(JSON.stringify(fallback));
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[DATA] Failed to load ${fileName}:`, error.message);
    return JSON.parse(JSON.stringify(fallback));
  }
}

const fallbackItemDefinitions = [
  { id: 'wooden_sword', type: 'weapon', damage: 5, value: 10, emoji: '🗡️', description: 'A simple Kweebec-crafted blade.' },
  { id: 'iron_sword', type: 'weapon', damage: 12, value: 50, emoji: '⚔️', description: 'Standard iron blade forged in Borea.' },
  { id: 'diamond_sword', type: 'weapon', damage: 25, value: 150, emoji: '💎', description: 'A rare luminite-hued sword.' },
  { id: 'leather_armor', type: 'armor', defense: 3, value: 15, emoji: '🛡️', description: 'Forager leathers for fledgling adventurers.' },
  { id: 'iron_armor', type: 'armor', defense: 8, value: 60, emoji: '🛡️', description: 'Iron mail issued to Borea defenders.' },
  { id: 'health_potion', type: 'consumable', heal: 30, value: 20, emoji: '🧪', description: 'Restores a portion of vitality.' },
  { id: 'mana_potion', type: 'consumable', mana: 20, value: 15, emoji: '✨', description: 'Restores a portion of mana.' },
  { id: 'ancient_bark', type: 'material', value: 6, emoji: '🌿', description: 'Resonant bark harvested from the Emerald Grove.' },
  { id: 'grove_tonic', type: 'consumable', heal: 45, value: 35, emoji: '🍃', description: 'A refreshing tonic that pulses with forest energy.' },
  { id: 'sunstone_shard', type: 'material', value: 18, emoji: '🌞', description: 'A shard of crystallised sunlight used in Hytale for advanced crafting.' },
  { id: 'stormcore_shard', type: 'material', value: 32, emoji: '⚡', description: 'Compressed storm energy harvested from Gale Cliffs conduits.' },
  { id: 'stormguard_plate', type: 'armor', defense: 28, value: 1100, emoji: '🛡️', description: 'Heavy plate etched with storm sigils that deflect brutal strikes.' },
  { id: 'stormlens_scope', type: 'material', value: 120, emoji: '🔭', description: 'Precision-crafted lens that bends lightning into focus.' },
  { id: 'stormbreaker_hammer', type: 'weapon', damage: 40, value: 950, emoji: '🔨', description: 'A hammer that can shatter thunderheads on impact.' },
  { id: 'forestwarden_staff', type: 'weapon', damage: 18, value: 280, emoji: '🌲', description: 'A staff imbued with grove magic.' },
  { id: 'sunset_herbs', type: 'material', value: 22, emoji: '🌺', description: 'Iridescent herbs that bloom under sunset skies.' },
  { id: 'suncrown_seed', type: 'material', value: 26, emoji: '🌼', description: 'A rare seed that sprouts radiant petals.' },
  { id: 'amber_glass', type: 'material', value: 34, emoji: '🧊', description: 'Translucent amber shaped by desert winds.' },
  { id: 'sandstrider_spear', type: 'weapon', damage: 28, value: 420, emoji: '🏹', description: 'A spear balanced for combat atop dunes.' },
  { id: 'shadow_spore', type: 'material', value: 30, emoji: '🍄', description: 'Bioluminescent spores gathered from the Shadow Depths.' },
  { id: 'darksteel_ore', type: 'material', value: 38, emoji: '⛏️', description: 'Dense ore thrumming with abyssal resonance.' },
  { id: 'abyssal_relic', type: 'material', value: 160, emoji: '🕳️', description: 'An artefact leaking whispers from beyond the veil.' },
  { id: 'aurora_lantern', type: 'material', value: 90, emoji: '🏮', description: 'Lantern infused with trapped aurora light.' },
  { id: 'frostblossom_petals', type: 'material', value: 24, emoji: '❄️', description: 'Crystalline petals that never melt.' }
];

const ITEM_FILES = [
  { file: 'items.json', fallback: fallbackItemDefinitions },
  { file: 'items_gathering.json', fallback: [] }
];
const ITEMS = {};
const ITEM_LIST = [];

function registerItemDefinition(def) {
  if (!def || !def.id) return;
  const baseDamage = Number.isFinite(def.damage) ? def.damage : Number(def.damage || def.stats?.damage || 0);
  const damageMin = Number.isFinite(def.damageMin) ? def.damageMin : (baseDamage ? Math.max(1, baseDamage - 2) : 0);
  const damageMax = Number.isFinite(def.damageMax) ? def.damageMax : (baseDamage ? Math.max(damageMin, baseDamage + 2) : 0);
  const baseDefense = Number.isFinite(def.defense) ? def.defense : Number(def.defense || def.stats?.defense || 0);
  const critChance = Number(def.critChance ?? def.stats?.critChance ?? (def.type === 'weapon' ? 0.05 : 0));
  const critMultiplier = Number(def.critMultiplier ?? def.stats?.critMultiplier ?? 1.5);
  const blockChance = Number(def.blockChance ?? def.stats?.blockChance ?? 0);
  const dodgeChance = Number(def.dodgeChance ?? def.stats?.dodgeChance ?? 0);
  const accuracy = Number(def.accuracy ?? def.stats?.accuracy ?? 0.9);
  const armorType = def.armorType || def.stats?.armorType || (def.type === 'armor' ? 'light' : null);
  const resistances = {};
  const rawResistances = def.resistances || def.stats?.resistances;
  if (rawResistances && typeof rawResistances === 'object') {
    Object.entries(rawResistances).forEach(([key, value]) => {
      if (value == null) return;
      resistances[key.toLowerCase()] = Math.min(0.9, Math.max(0, Number(value)));
    });
  }
  const damageType = (def.damageType || def.stats?.damageType || (Array.isArray(def.tags) && def.tags.includes('fire') ? 'fire' : null) || 'physical').toLowerCase();

  const normalized = {
    id: def.id,
    name: def.name || def.id,
    type: def.type || 'material',
    rarity: def.rarity || 'common',
    value: Number.isFinite(def.value) ? def.value : Number(def.value || 0),
    emoji: def.emoji || '❔',
    damage: baseDamage,
    damageMin,
    damageMax,
    damageType,
    critChance: Math.max(0, critChance),
    critMultiplier: Math.max(1.1, critMultiplier),
    accuracy: Math.min(0.99, Math.max(0.1, accuracy)),
    defense: baseDefense,
    blockChance: Math.max(0, blockChance),
    dodgeChance: Math.max(0, dodgeChance),
    resistances,
    armorType,
    heal: Number.isFinite(def.heal) ? def.heal : Number(def.heal || def.effects?.heal || 0),
    mana: Number.isFinite(def.mana) ? def.mana : Number(def.mana || def.effects?.mana || 0),
    luck: Number.isFinite(def.luck) ? def.luck : Number(def.luck || def.stats?.luck || 0),
    description: def.description || '',
    tags: Array.isArray(def.tags) ? def.tags : []
  };
  ITEMS[normalized.id] = normalized;
  ITEM_LIST.push(normalized);
}

ITEM_FILES.forEach(({ file, fallback }) => {
  const definitions = loadDataFile(file, fallback);
  if (Array.isArray(definitions)) {
    definitions.forEach(def => registerItemDefinition(def));
  }
});
const ITEM_SET_DEFINITIONS = loadDataFile('item_sets.json', []);
const ITEM_SET_LOOKUP = {};
ITEM_SET_DEFINITIONS.forEach(set => {
  if (set?.id) ITEM_SET_LOOKUP[set.id.toLowerCase()] = set;
});
const GATHERING_SET_DEFINITIONS = loadDataFile('gathering_sets.json', []);
const GATHERING_SET_TYPES = ['mining', 'foraging', 'farming', 'fishing'];
const GATHERING_SET_LOOKUP = new Map();
GATHERING_SET_DEFINITIONS.forEach(def => {
  if (!def?.type || !Array.isArray(def.tiers)) return;
  const key = def.type.toLowerCase();
  const tiers = def.tiers
    .filter(tier => tier && tier.id)
    .map((tier, index) => ({
      ...tier,
      id: String(tier.id),
      tier: Number.isFinite(tier.tier) ? tier.tier : index,
      bonuses: {
        speed: Number(tier.bonuses?.speed || 0),
        quantity: Number(tier.bonuses?.quantity || 0),
        rarity: Number(tier.bonuses?.rarity || 0),
        extraRolls: Number(tier.bonuses?.extraRolls || tier.extraRolls || 0)
      },
      requirements: tier.requirements ? JSON.parse(JSON.stringify(tier.requirements)) : null,
      perks: Array.isArray(tier.perks) ? tier.perks.map(String) : []
    }))
    .sort((a, b) => a.tier - b.tier);
  GATHERING_SET_LOOKUP.set(key, { ...def, tiers });
});
const GATHERING_RESOURCE_CONFIG = loadDataFile('gathering_resources.json', { defaults: {}, biomes: [], dungeons: [] });
const GATHERING_RESOURCE_DEFAULTS = GATHERING_RESOURCE_CONFIG.defaults || {};
const GATHERING_RESOURCE_BIOMES = new Map();
const GATHERING_RESOURCE_DUNGEONS = new Map();
(Array.isArray(GATHERING_RESOURCE_CONFIG.biomes) ? GATHERING_RESOURCE_CONFIG.biomes : []).forEach(entry => {
  if (!entry?.id) return;
  GATHERING_RESOURCE_BIOMES.set(entry.id.toLowerCase(), JSON.parse(JSON.stringify(entry)));
});
(Array.isArray(GATHERING_RESOURCE_CONFIG.dungeons) ? GATHERING_RESOURCE_CONFIG.dungeons : []).forEach(entry => {
  if (!entry?.id) return;
  GATHERING_RESOURCE_DUNGEONS.set(entry.id.toLowerCase(), JSON.parse(JSON.stringify(entry)));
});
const GATHERING_TYPE_LABELS = {
  mining: 'Mining',
  foraging: 'Foraging',
  farming: 'Farming',
  fishing: 'Fishing'
};
const GATHERING_BASELINE_SECONDS = {
  mining: 12,
  foraging: 11,
  farming: 15,
  fishing: 30
};
const GATHERING_BASE_ROLLS = {
  mining: 2,
  foraging: 3,
  farming: 2,
  fishing: 1
};
const GATHERING_PROGRESS_UPDATE_MS = 2000;
const GATHERING_RARITY_WEIGHTS = {
  common: 6,
  uncommon: 4,
  rare: 2.4,
  epic: 1.2,
  legendary: 0.6,
  mythic: 0.35
};
const GATHERING_RARITY_INDEX = {
  common: 1,
  uncommon: 1.2,
  rare: 1.6,
  epic: 2.1,
  legendary: 2.6,
  mythic: 3.1
};
const GATHERING_RESOURCE_KEYS = {
  mining: ['mining', 'mine'],
  foraging: ['foraging', 'forage'],
  farming: ['farming', 'harvest'],
  fishing: ['fishing']
};
const ACTIVE_GATHER_SESSIONS = new Map();
const GATHERING_SLASH_CHOICES = GATHERING_SET_TYPES.map(type => ({
  name: GATHERING_TYPE_LABELS[type],
  value: type
}));

const fallbackShopItems = [
  { id: 'health_potion', name: 'Health Potion', price: 50, emoji: '🧪', description: 'Restores 30 HP on use.' },
  { id: 'mana_potion', name: 'Mana Potion', price: 45, emoji: '🔮', description: 'Restores 20 Mana on use.' },
  { id: 'iron_sword', name: 'Iron Sword', price: 200, emoji: '⚔️', description: 'Sturdy blade favored by Borea guards.' },
  { id: 'leather_armor', name: 'Leather Armor', price: 150, emoji: '🛡️', description: 'Basic armor offering modest protection.' },
  { id: 'focus_elixir', name: 'Focus Elixir', price: 120, emoji: '✨', description: 'Temporarily boosts spellcasting efficiency.' }
];
const SHOP_ITEMS = loadDataFile('shop.json', fallbackShopItems);

function createEmptySetBonus() {
  return {
    attributes: { power: 0, agility: 0, resilience: 0, focus: 0 },
    resistances: {},
    damageBonus: 0,
    damageMultiplier: 0,
    defenseBonus: 0,
    accuracyBonus: 0,
    dodgeChance: 0,
    blockChance: 0,
    critChance: 0,
    critMultiplier: 0,
    flatDamageReduction: 0,
    gathering: createEmptyGatheringBonuses()
  };
}

function createEmptyGatheringBonuses() {
  const template = { speed: 0, quantity: 0, rarity: 0, extraRolls: 0 };
  const bonuses = { global: { ...template } };
  GATHERING_SET_TYPES.forEach(type => {
    bonuses[type] = { ...template };
  });
  return bonuses;
}

function mergeResistances(target = {}, source = {}) {
  if (!source || typeof source !== 'object') return target;
  Object.entries(source).forEach(([key, value]) => {
    if (value == null) return;
    const normalizedKey = key.toLowerCase();
    const current = Number(target[normalizedKey] || 0);
    target[normalizedKey] = current + (Number(value) || 0);
  });
  return target;
}

function getEquippedItemIds(player) {
  if (!player?.equipped) return [];
  return Object.values(player.equipped)
    .filter(Boolean)
    .map(itemId => itemId.toLowerCase());
}

function getActiveItemSetData(player) {
  const equippedItems = new Set(getEquippedItemIds(player));
  const bonuses = createEmptySetBonus();
  const activeSets = [];

  if (!equippedItems.size) {
    return { sets: activeSets, bonuses };
  }

  ITEM_SET_DEFINITIONS.forEach(set => {
    if (!set?.pieces || !set.pieces.length) return;
    const hasAllPieces = set.pieces.every(piece => piece && equippedItems.has(piece.toLowerCase()));
    if (!hasAllPieces) return;

    activeSets.push({
      id: set.id,
      name: set.name || set.id,
      pieces: [...set.pieces]
    });

    const setBonuses = set.bonuses || {};
    if (setBonuses.attributes && typeof setBonuses.attributes === 'object') {
      Object.entries(setBonuses.attributes).forEach(([attribute, value]) => {
        const key = attribute.toLowerCase();
        bonuses.attributes[key] = (bonuses.attributes[key] || 0) + (Number(value) || 0);
      });
    }

    mergeResistances(bonuses.resistances, setBonuses.resistances);

    const numericKeys = [
      'damageBonus',
      'damageMultiplier',
      'defenseBonus',
      'accuracyBonus',
      'dodgeChance',
      'blockChance',
      'critChance',
      'critMultiplier',
      'flatDamageReduction'
    ];
    numericKeys.forEach(key => {
      if (setBonuses[key] != null) {
        bonuses[key] = (bonuses[key] || 0) + (Number(setBonuses[key]) || 0);
      }
    });

    if (setBonuses.gathering) {
      mergeGatheringBonuses(bonuses.gathering, setBonuses.gathering);
    }
  });

  return { sets: activeSets, bonuses };
}

function applyGatheringBonusBucket(targetBucket, enhancements) {
  if (!enhancements || typeof enhancements !== 'object') return;
  Object.entries(enhancements).forEach(([bonusKey, value]) => {
    if (value == null) return;
    if (bonusKey === 'extraRolls') {
      targetBucket.extraRolls = (targetBucket.extraRolls || 0) + Number(value || 0);
    } else if (bonusKey in targetBucket) {
      targetBucket[bonusKey] = (targetBucket[bonusKey] || 0) + Number(value || 0);
    }
  });
}

function mergeGatheringBonuses(target, source) {
  if (!source || typeof source !== 'object') return;
  Object.entries(source).forEach(([scope, bonuses]) => {
    if (!bonuses || typeof bonuses !== 'object') return;
    const key = scope.toLowerCase();
    if (key === 'global') {
      applyGatheringBonusBucket(target.global, bonuses);
    } else if (GATHERING_SET_TYPES.includes(key)) {
      applyGatheringBonusBucket(target[key], bonuses);
    }
  });
}

function ensureGatheringGear(player) {
  if (!player.gatheringGear) {
    player.gatheringGear = { current: {}, unlocked: {} };
  }
  if (!player.gatheringGear.current) player.gatheringGear.current = {};
  if (!player.gatheringGear.unlocked) player.gatheringGear.unlocked = {};

  GATHERING_SET_TYPES.forEach(type => {
    const definition = GATHERING_SET_LOOKUP.get(type);
    if (!definition || !definition.tiers.length) return;
    const defaultTier = definition.tiers[0];
    const unlocked = player.gatheringGear.unlocked[type] || (player.gatheringGear.unlocked[type] = {});
    if (defaultTier) {
      if (!unlocked[defaultTier.id]) unlocked[defaultTier.id] = true;
      if (!player.gatheringGear.current[type]) {
        player.gatheringGear.current[type] = defaultTier.id;
      }
    }
  });

  return player.gatheringGear;
}

function getGatheringTierDefinition(type, tierId) {
  if (!type) return null;
  const definition = GATHERING_SET_LOOKUP.get(type.toLowerCase());
  if (!definition) return null;
  if (!tierId) return definition.tiers[0] || null;
  return definition.tiers.find(tier => tier.id === tierId) || definition.tiers[0] || null;
}

function getGatheringTierIndex(type, tierId) {
  const definition = GATHERING_SET_LOOKUP.get(type.toLowerCase());
  if (!definition) return 0;
  return Math.max(0, definition.tiers.findIndex(tier => tier.id === tierId));
}

function buildGatheringBonusSummary() {
  return createEmptyGatheringBonuses();
}

function aggregateGatheringBonuses(target, additions, scope) {
  if (!additions) return;
  if (scope && GATHERING_SET_TYPES.includes(scope)) {
    applyGatheringBonusBucket(target[scope], additions);
  } else {
    applyGatheringBonusBucket(target.global, additions);
  }
}

function getGatheringBonuses(player) {
  ensureGatheringGear(player);
  const totals = buildGatheringBonusSummary();
  const gear = player.gatheringGear || { current: {}, unlocked: {} };
  const activeSets = getActiveItemSetData(player);
  if (activeSets?.bonuses?.gathering) {
    mergeGatheringBonuses(totals, activeSets.bonuses.gathering);
  }

  GATHERING_SET_TYPES.forEach(type => {
    const currentTierId = gear.current?.[type];
    const tier = getGatheringTierDefinition(type, currentTierId);
    if (tier?.bonuses) {
      aggregateGatheringBonuses(totals, tier.bonuses, type);
    }
    if (tier?.globalBonuses) {
      aggregateGatheringBonuses(totals, tier.globalBonuses, 'global');
    }
  });

  return { totals, gear, itemSets: activeSets };
}

function cloneGatheringBonuses(bonuses = createEmptyGatheringBonuses()) {
  const clone = { global: { ...bonuses.global } };
  GATHERING_SET_TYPES.forEach(type => {
    clone[type] = { ...bonuses[type] };
  });
  return clone;
}

function getEquippedGatheringTool(player, gatherType) {
  const toolId = player?.equipped?.tool;
  if (!toolId) return null;
  const definition = ITEMS[toolId];
  if (!definition?.type || definition.type !== 'tool') return null;
  const gather = definition.gathering || {};
  const supportedTypes = Array.isArray(gather.types)
    ? gather.types.map(type => String(type).toLowerCase())
    : gather.type
      ? [String(gather.type).toLowerCase()]
      : ['all'];
  if (!supportedTypes.includes('all') && !supportedTypes.includes(gatherType)) return null;
  return {
    id: toolId,
    definition,
    bonuses: { ...(gather.bonuses || {}) },
    types: supportedTypes
  };
}

function applyToolBonusesToTotals(totals, tool, gatherType) {
  if (!tool?.bonuses || !totals) return totals;
  const scopes = tool.types?.includes('all') ? [...GATHERING_SET_TYPES] : tool.types || [];
  applyGatheringBonusBucket(totals.global, tool.bonuses);
  scopes.forEach(type => {
    if (totals[type]) applyGatheringBonusBucket(totals[type], tool.bonuses);
  });
  if (totals[gatherType]) applyGatheringBonusBucket(totals[gatherType], tool.bonuses);
  return totals;
}

function shouldSendGatherNotifications(player) {
  return player?.settings?.gatherNotifications !== false;
}

function setGatherNotifications(player, enabled) {
  player.settings = player.settings || {};
  player.settings.gatherNotifications = !!enabled;
}

function buildGatheringTutorialEmbed(biomeName) {
  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('🌱 Gathering Tutorial')
    .setDescription('Harvesting actions run on short timers, roll for biome-specific loot, and can trigger events or ambushes.')
    .addFields(
      {
        name: 'How It Works',
        value: [
          '• Pick a category (Mine, Forage, Farm, Fish) to begin.',
          '• Progress bars update every few seconds until the haul completes.',
          '• Gear sets and tools stack bonuses to speed, yield, rare finds, and extra rolls.'
        ].join('\n'),
        inline: false
      },
      {
        name: 'Tips',
        value: [
          '• Upgrade gathering gear and craft advanced tools for huge boosts.',
          '• Bases can automate gathering with extractor modules — don’t let storage fill!',
          '• Watch the completion notification for combat encounters and chained events.'
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ text: `Current biome: ${biomeName || 'Unknown'}` });
  return embed;
}

function sendGatheringTutorial(target, biomeName, options = {}) {
  const embed = buildGatheringTutorialEmbed(biomeName);
  if (target?.reply) {
    return target.reply({ embeds: [embed], ephemeral: options.ephemeral });
  }
  if (target?.deferred || target?.replied) {
    return target.followUp({ embeds: [embed], ephemeral: true });
  }
  if (target?.reply) {
    return target.reply({ embeds: [embed], ephemeral: true });
  }
  return Promise.resolve();
}

async function showTutorial(message) {
  const player = getPlayer(message.author.id);
  const exploration = ensureExplorationState(player);
  const biome = getBiomeDefinition(exploration.currentBiome);
  const biomeName = biome?.name || exploration.currentBiome || 'Unknown Biome';

  const onboardingEmbed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('🧭 Welcome to HyBot')
    .setDescription('Follow these quick steps to get geared up, explore the world, and start progressing.')
    .addFields(
      {
        name: '1️⃣ Know Your Hero',
        value: `Use \`${PREFIX} profile\` and \`${PREFIX} stats\` to review your loadout, attributes, and advancement.`,
        inline: false
      },
      {
        name: '2️⃣ Explore & Travel',
        value: `Check \`${PREFIX} explore status\` to see your current biome, then \`${PREFIX} travel <biome>\` to discover new regions.`,
        inline: false
      },
      {
        name: '3️⃣ Gather Resources',
        value: `Run \`${PREFIX} gather status\` or press the buttons to harvest materials based on your biome. Upgrade gear and tools for big bonuses.`,
        inline: false
      },
      {
        name: '4️⃣ Fight & Quest',
        value: `Start encounters with \`${PREFIX} hunt\`, clear dungeons with \`${PREFIX} dungeon <id>\`, and manage quests via \`${PREFIX} quests\`.`,
        inline: false
      },
      {
        name: '5️⃣ Craft & Brew',
        value: `Transform loot with \`${PREFIX} craft <item>\`, check recipes using \`${PREFIX} recipes\`, and mix tonics through \`${PREFIX} brews\`.`,
        inline: false
      }
    )
    .setFooter({ text: 'Use buttons below to jump straight into key systems.' });

  const systemsEmbed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle('🌟 Progression Checklist')
    .addFields(
      {
        name: 'Reputation & Factions',
        value: `Raise standing with \`${PREFIX} reputation\` and unlock vendors via \`${PREFIX} vendor\`.`,
        inline: false
      },
      {
        name: 'Bases & Settlements',
        value: `Automate gathering with base modules (\`${PREFIX} base status\`) and invest in settlements (\`${PREFIX} settlement list\`).`,
        inline: false
      },
      {
        name: 'Codex & Lore',
        value: `Log discoveries with \`${PREFIX} codex <category>\` and dive into story bits via \`${PREFIX} lore <topic>\`.`,
        inline: false
      },
      {
        name: 'Events & Social',
        value: `Stay informed with \`${PREFIX} eventstatus\`, earn rewards from contracts via \`${PREFIX} contracts\`, and compare rankings using \`${PREFIX} leaderboard\`.`,
        inline: false
      }
    )
    .setFooter({ text: 'Unlock more tutorials by exploring, battling, and crafting.' });

  const payload = buildStyledPayload(onboardingEmbed, 'tutorial');
  payload.embeds.push(applyVisualStyle(systemsEmbed, 'tutorial'));
  payload.embeds.push(buildGatheringTutorialEmbed(biomeName));

  await message.reply(payload);

  player.tutorials = player.tutorials || {};
  const onboardingState = typeof player.tutorials.onboarding === 'object' && player.tutorials.onboarding !== null
    ? player.tutorials.onboarding
    : {};
  onboardingState.lastShown = Date.now();
  onboardingState.timesShown = (onboardingState.timesShown || 0) + 1;
  onboardingState.lastBiome = biome?.id || exploration.currentBiome;
  player.tutorials.onboarding = onboardingState;
}

function buildGatheringNotificationEmbed(user, biome, type, drops, durationSeconds, tool) {
  const emojiMap = { mining: '⛏️', foraging: '🌿', farming: '🌾', fishing: '🎣' };
  const emoji = emojiMap[type] || '✨';
  const actorName = user?.username || user?.globalName || 'Adventurer';
  const embed = new EmbedBuilder()
    .setColor('#27AE60')
    .setTitle(`${emoji} Harvest Complete`)
    .setDescription(`**${actorName}** finished gathering in **${biome?.name || biome || 'Unknown Biome'}**.`)
    .addFields(
      {
        name: 'Rewards',
        value: drops.length
          ? drops.map(drop => `• ${formatItemName(drop.item)} x${drop.quantity}`).join('\n')
          : 'No notable loot this time.',
        inline: false
      }
    )
    .setFooter({ text: `Elapsed: ${durationSeconds}s${tool ? ` | Tool: ${tool.definition.name}` : ''}` });
  return embed;
}

function formatGatheringToolSummary(toolDef) {
  if (!toolDef) {
    return 'None equipped. Craft or loot gathering tools to gain powerful harvest bonuses.';
  }
  const gather = toolDef.gathering || {};
  const types = Array.isArray(gather.types)
    ? gather.types.map(type => GATHERING_TYPE_LABELS[type.toLowerCase?.()] || type).join(', ')
    : gather.type
      ? GATHERING_TYPE_LABELS[gather.type.toLowerCase?.()] || gather.type
      : 'All Gathering';
  const bonuses = gather.bonuses || {};
  const segments = [];
  if (bonuses.speed) segments.push(`Speed +${Math.round(bonuses.speed * 100)}%`);
  if (bonuses.quantity) segments.push(`Yield +${Math.round(bonuses.quantity * 100)}%`);
  if (bonuses.rarity) segments.push(`Rare +${Math.round(bonuses.rarity * 100)}%`);
  if (bonuses.extraRolls) segments.push(`Extra Rolls +${bonuses.extraRolls}`);
  const bonusText = segments.length ? segments.join(', ') : 'No bonuses listed.';
  return `${formatItemName(toolDef.id)} (${types}) — ${bonusText}`;
}

function buildGatherStatusEmbed(player, biome, exploration, options = {}) {
  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('🌾 Harvest Overview')
    .setDescription(`Current biome: **${biome?.name || exploration.currentBiome}**`)
    .setThumbnail(BIOME_ARTWORK[biome?.id?.toLowerCase?.()] || EMBED_VISUALS.exploration)
    .setImage(EMBED_VISUALS.exploration);

  const gearSummary = buildGatheringGearSummary(player) || 'Gathering gear not yet unlocked.';
  embed.addFields({ name: 'Gear Loadout', value: gearSummary, inline: false });

  const toolDef = player.equipped?.tool ? ITEMS[player.equipped.tool] : null;
  embed.addFields({ name: 'Equipped Tool', value: formatGatheringToolSummary(toolDef), inline: false });

  const notificationsEnabled = shouldSendGatherNotifications(player);
  embed.addFields({
    name: 'Notifications',
    value: notificationsEnabled
      ? '🔔 Enabled — you will receive channel updates when a harvest finishes.\nUse `!hy gather notifications off` to disable.'
      : '🔕 Disabled — toggle back on with `!hy gather notifications on`.',
    inline: false
  });

  if (exploration?.gathering) {
    const remaining = Math.max(0, exploration.gathering.endsAt - Date.now());
    embed.addFields({
      name: 'Active Session',
      value: `Gathering **${formatActionName(exploration.gathering.type)}** — ${formatDuration(remaining)} remaining`,
      inline: false
    });
  } else {
    embed.addFields({
      name: 'Active Session',
      value: 'None. Use the buttons below or `!hy gather <type>` to begin harvesting.',
      inline: false
    });
  }

  if (options.includeTutorial) {
    embed.addFields({
      name: 'Tutorial Tips',
      value: [
        '• Harvesting rolls for biome-specific loot and can trigger bonus events or ambushes.',
        '• Upgrade gathering gear and craft tools to stack speed, yield, rare find, and extra-roll bonuses.',
        '• Bases with extractor modules automate resource collection — keep storage clear!'
      ].join('\n'),
      inline: false
    });
  }

  return embed;
}

function getNextGatheringTier(type, currentTierId) {
  const definition = GATHERING_SET_LOOKUP.get(type.toLowerCase());
  if (!definition || !definition.tiers.length) return null;
  const currentIndex = Math.max(0, definition.tiers.findIndex(tier => tier.id === currentTierId));
  if (currentIndex < 0) return definition.tiers[0];
  return definition.tiers[currentIndex + 1] || null;
}

function convertGatheringRequirements(tier) {
  if (!tier?.requirements) return null;
  const requirements = tier.requirements;
  const cost = {};
  if (Number.isFinite(requirements.coins)) cost.coins = requirements.coins;
  if (requirements.items && typeof requirements.items === 'object') {
    cost.materials = { ...requirements.items };
  }
  return cost;
}

function canAffordGatheringTier(player, tier) {
  const cost = convertGatheringRequirements(tier);
  if (!cost) return true;
  return canAffordCost(player, cost);
}

function applyGatheringTierCost(player, tier) {
  const cost = convertGatheringRequirements(tier);
  if (!cost) return;
  deductCost(player, cost);
}

function formatGatheringRequirements(tier) {
  if (!tier) return 'Unavailable';
  const cost = convertGatheringRequirements(tier);
  if (!cost) return 'No cost';
  const parts = [];
  if (cost.coins) parts.push(`${cost.coins} coins`);
  if (cost.materials) {
    Object.entries(cost.materials).forEach(([item, qty]) => {
      parts.push(`${formatItemName(item)} x${qty}`);
    });
  }
  return parts.join(' • ') || 'No cost';
}

function normalizeResourceEntry(entry = {}) {
  if (!entry.item) return null;
  const rarity = (entry.rarity || 'common').toLowerCase();
  const weight = Number(entry.weight || entry.chance || GATHERING_RARITY_WEIGHTS[rarity] || 1);
  const min = Math.max(1, Number(entry.min || entry.quantityMin || 1));
  const max = Math.max(min, Number(entry.max || entry.quantityMax || min));
  return {
    item: entry.item,
    rarity,
    tier: Number(entry.tier || entry.level || 1),
    chance: weight,
    min,
    max,
    source: entry.source || 'default'
  };
}

function convertMaterialsToResources(materials = []) {
  const pool = [];
  materials.forEach(material => {
    if (!material?.item) return;
    const rarity = (material.rarity || 'common').toLowerCase();
    const tier = Number(material.tier || 1);
    const min = Math.max(1, Number(material.min || Math.max(1, Math.round(tier / 1.5))));
    const max = Math.max(min, Number(material.max || Math.max(min, Math.round(min + Math.max(1, tier)))));
    const baseWeight = Number(material.weight || GATHERING_RARITY_WEIGHTS[rarity] || 1);
    pool.push({
      item: material.item,
      rarity,
      tier,
      min,
      max,
      chance: baseWeight,
      source: material.source || 'materials'
    });
  });
  return pool;
}

function buildGatheringPoolFromConfig(configEntries = [], source = 'config') {
  const pool = [];
  if (!Array.isArray(configEntries)) return pool;
  configEntries.forEach(entry => {
    const normalized = normalizeResourceEntry({ ...entry, source });
    if (normalized) pool.push(normalized);
  });
  return pool;
}

function buildGatheringPoolFromResources(entries = [], source = 'biome') {
  const pool = [];
  if (!Array.isArray(entries)) return pool;
  entries.forEach(entry => {
    if (!entry?.item) return;
    const rarity = (entry.rarity || 'common').toLowerCase();
    const min = Math.max(1, Number(entry.min || entry.quantityMin || 1));
    const max = Math.max(min, Number(entry.max || entry.quantityMax || min));
    const weight = Number(entry.chance || entry.weight || GATHERING_RARITY_WEIGHTS[rarity] || 1);
    pool.push({
      item: entry.item,
      rarity,
      tier: Number(entry.tier || 1),
      min,
      max,
      chance: weight,
      source
    });
  });
  return pool;
}

function buildGatheringResourcePool(biome, type, options = {}) {
  const pool = [];
  const typeKey = type?.toLowerCase();
  if (!typeKey) return pool;
  const biomeId = biome?.id?.toLowerCase?.() || options?.biomeId?.toLowerCase?.();

  const defaults = buildGatheringPoolFromConfig(GATHERING_RESOURCE_DEFAULTS[typeKey], 'defaults');
  pool.push(...defaults);

  if (biomeId && GATHERING_RESOURCE_BIOMES.has(biomeId)) {
    const configBiome = GATHERING_RESOURCE_BIOMES.get(biomeId);
    if (configBiome?.[typeKey]) {
      pool.push(...buildGatheringPoolFromConfig(configBiome[typeKey], `biome:${biomeId}`));
    }
  }

  const resourceKeys = GATHERING_RESOURCE_KEYS[typeKey] || [typeKey];
  resourceKeys.forEach(key => {
    const entries = biome?.resources?.[key];
    if (Array.isArray(entries) && entries.length) {
      pool.push(...buildGatheringPoolFromResources(entries, `resources:${key}`));
    }
  });

  if (biome?.materials?.[typeKey]) {
    pool.push(...convertMaterialsToResources(biome.materials[typeKey]));
  }

  if (typeKey !== 'fishing' && biome?.materials?.special) {
    pool.push(...convertMaterialsToResources(biome.materials.special));
  }

  if (options?.dungeonId) {
    const dungeonKey = options.dungeonId.toLowerCase();
    const dungeonConfig = GATHERING_RESOURCE_DUNGEONS.get(dungeonKey);
    if (dungeonConfig?.[typeKey]) {
      pool.push(...buildGatheringPoolFromConfig(dungeonConfig[typeKey], `dungeon:${dungeonKey}`));
    }
  }

  if (!pool.length && defaults.length) {
    return defaults;
  }
  return pool;
}

function resolveGatheringRewards(player, pool, type, modifiers, options = {}) {
  const drops = [];
  const logs = [];
  if (!Array.isArray(pool) || pool.length === 0) {
    return { drops, logs };
  }

  const totals = modifiers?.totals || createEmptyGatheringBonuses();
  const globalBonus = totals.global || { speed: 0, quantity: 0, rarity: 0, extraRolls: 0 };
  const typeBonus = totals[type] || { speed: 0, quantity: 0, rarity: 0, extraRolls: 0 };
  const quantityBonus = (globalBonus.quantity || 0) + (typeBonus.quantity || 0);
  const rarityBonus = (globalBonus.rarity || 0) + (typeBonus.rarity || 0);
  const extraRolls = (globalBonus.extraRolls || 0) + (typeBonus.extraRolls || 0);
  const baseRolls = GATHERING_BASE_ROLLS[type] || 1;
  let totalRolls = baseRolls + Math.max(0, Math.floor(extraRolls));
  const fractional = extraRolls % 1;
  if (fractional > 0 && Math.random() < fractional) {
    totalRolls += 1;
  }

  const adjustedPool = pool.map(entry => {
    const rarityIndex = GATHERING_RARITY_INDEX[entry.rarity] || 1;
    const adjustedChance = Math.max(0.0001, entry.chance * (1 + rarityBonus * rarityIndex));
    return { ...entry, chance: adjustedChance };
  });

  for (let i = 0; i < totalRolls; i++) {
    const entry = weightedChoice(adjustedPool, 'chance');
    if (!entry) continue;
    const baseQty = randomBetween(entry.min, entry.max);
    const quantity = Math.max(1, Math.round(baseQty * (1 + quantityBonus)));
    drops.push({ item: entry.item, quantity, rarity: entry.rarity, source: entry.source || type });
    addItemToInventory(player, entry.item, quantity);
    processQuestEvent(null, player, { type: 'gather', itemId: entry.item, count: quantity });
  }

  if (!drops.length && pool.length) {
    // pity roll ensures something
    const pityEntry = weightedChoice(adjustedPool, 'chance');
    if (pityEntry) {
      const qty = Math.max(1, randomBetween(pityEntry.min, pityEntry.max));
      drops.push({ item: pityEntry.item, quantity: qty, rarity: pityEntry.rarity, source: pityEntry.source || type, pity: true });
      addItemToInventory(player, pityEntry.item, qty);
      processQuestEvent(null, player, { type: 'gather', itemId: pityEntry.item, count: qty });
    }
  }

  return { drops, logs };
}

function buildProgressBar(percent, length = 18) {
  const normalized = Math.min(1, Math.max(0, percent));
  const filled = Math.round(normalized * length);
  const empty = Math.max(0, length - filled);
  return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
}

async function startGatheringSession(player, type, context = {}) {
  const userId = context.userId || context.interaction?.user?.id || context.message?.author?.id;
  if (!userId) {
    return { error: 'Unable to determine user for gathering session.' };
  }
  if (!GATHERING_SET_TYPES.includes(type)) {
    return { error: `Unsupported gathering type "${type}".` };
  }
  if (ACTIVE_GATHER_SESSIONS.has(userId)) {
    return { error: 'You already have an active gathering session.' };
  }

  const exploration = ensureExplorationState(player);
  if (exploration.action) {
    return { error: 'Finish or resolve your current exploration action before gathering.' };
  }
  if (exploration.gathering) {
    return { error: 'Gathering already in progress. Please wait for it to finish.' };
  }

  const biome = context.biome || getBiomeDefinition(exploration.currentBiome);
  if (!biome) {
    return { error: 'Unable to determine your current biome.' };
  }

  const modifiers = getGatheringBonuses(player);
  const pool = buildGatheringResourcePool(biome, type, { biomeId: exploration.currentBiome, dungeonId: context.dungeonId });
  if (!pool.length) {
    return { error: 'No harvestable resources found here for that gathering type.' };
  }

  const baseTotals = modifiers.totals || createEmptyGatheringBonuses();
  const sessionTotals = cloneGatheringBonuses(baseTotals);
  const equippedTool = getEquippedGatheringTool(player, type);
  applyToolBonusesToTotals(sessionTotals, equippedTool, type);
  const speedBonus = (sessionTotals.global?.speed || 0) + (sessionTotals[type]?.speed || 0);
  const baseSeconds = GATHERING_BASELINE_SECONDS[type] || 15;
  const adjustedSeconds = Math.max(5, Math.round(baseSeconds * Math.max(0.25, 1 - speedBonus)));
  const durationMs = adjustedSeconds * 1000;
  const startedAt = Date.now();
  const endsAt = startedAt + durationMs;

  const gear = modifiers.gear || ensureGatheringGear(player);
  const tierId = gear.current?.[type];
  const tier = getGatheringTierDefinition(type, tierId);

  const yieldBonus = ((sessionTotals.global?.quantity || 0) + (sessionTotals[type]?.quantity || 0)) * 100;
  const rareBonus = ((sessionTotals.global?.rarity || 0) + (sessionTotals[type]?.rarity || 0)) * 100;
  const extraRolls = (sessionTotals.global?.extraRolls || 0) + (sessionTotals[type]?.extraRolls || 0);

  const emojiMap = { mining: '⛏️', foraging: '🌿', farming: '🌾', fishing: '🎣' };
  const emoji = emojiMap[type] || '✨';

  const buildProgressPayload = (percent, remainingMs) => {
    const bar = buildProgressBar(percent);
    const remainingSeconds = Math.max(0, remainingMs / 1000);
    const lines = [
      `${emoji} Gathering — **${GATHERING_TYPE_LABELS[type]}** in **${biome.name || exploration.currentBiome}**`,
      `Gear: ${tier?.name || 'Standard Kit'}${equippedTool ? ` | Tool: ${equippedTool.definition.name}` : ''}`,
      `Bonuses: Yield +${yieldBonus.toFixed(0)}% | Rare +${rareBonus.toFixed(0)}% | Extra Rolls +${extraRolls.toFixed(2)}`,
      `Progress: \`${bar}\` ${(percent * 100).toFixed(0)}% (${remainingSeconds.toFixed(1)}s remaining)`
    ];
    return { content: lines.join('\n') };
  };

  if (context.message && !player.tutorials.gathering?.intro) {
    player.tutorials.gathering.intro = true;
    sendGatheringTutorial(context.message, biome.name).catch(() => {});
  }

  const sendInitialResponse = async () => {
    if (context.interaction) {
      const flags = context.ephemeral ? { flags: MessageFlags.Ephemeral } : {};
      if (!context.interaction.deferred && !context.interaction.replied) {
        await context.interaction.deferReply(flags);
      }
      await context.interaction.editReply(buildProgressPayload(0, durationMs));
      return null;
    }
    return context.message.reply(buildProgressPayload(0, durationMs));
  };

  let progressMessage = null;
  try {
    progressMessage = await sendInitialResponse();
  } catch (error) {
    console.error('Failed to send gathering progress message:', error);
    return { error: 'Could not send progress update. Try again later.' };
  }

  const updateReply = payload => {
    if (context.interaction) {
      return context.interaction.editReply(payload);
    }
    if (progressMessage) {
      return progressMessage.edit(payload);
    }
    return Promise.resolve();
  };

  const session = {
    userId,
    type,
    startedAt,
    endsAt,
    durationMs,
    active: true,
    biomeId: exploration.currentBiome,
    cancel() {
      this.active = false;
      if (this.timeout) clearTimeout(this.timeout);
      if (this.updateTimer) clearTimeout(this.updateTimer);
      ACTIVE_GATHER_SESSIONS.delete(userId);
      exploration.gathering = null;
      if (!exploration.action) exploration.status = 'idle';
    }
  };

  ACTIVE_GATHER_SESSIONS.set(userId, session);
  exploration.gathering = { type, startedAt, endsAt, biomeId: exploration.currentBiome };
  exploration.status = 'gathering';

  const scheduleUpdate = () => {
    if (!session.active) return;
    const now = Date.now();
    const percent = Math.min(1, (now - startedAt) / durationMs);
    const remaining = Math.max(0, endsAt - now);
    updateReply(buildProgressPayload(percent, remaining)).catch(error => {
      console.error('Gathering progress update failed:', error);
    });
    if (percent < 1) {
      session.updateTimer = setTimeout(scheduleUpdate, GATHERING_PROGRESS_UPDATE_MS);
    }
  };
  session.updateTimer = setTimeout(scheduleUpdate, GATHERING_PROGRESS_UPDATE_MS);

  session.timeout = setTimeout(async () => {
    session.active = false;
    ACTIVE_GATHER_SESSIONS.delete(userId);
    if (session.updateTimer) clearTimeout(session.updateTimer);

    const sessionModifiers = { ...modifiers, totals: sessionTotals, tool: equippedTool };
    const results = resolveGatheringRewards(player, pool, type, sessionModifiers);
    const drops = results.drops || [];
    let summaryLines = [
      `${emoji} **${GATHERING_TYPE_LABELS[type]} Complete** — ${biome.name || exploration.currentBiome}`,
      `Gear: ${tier?.name || 'Standard Kit'}`
    ];
    if (equippedTool) {
      summaryLines.push(`Tool: ${equippedTool.definition.name}`);
    }

    if (drops.length) {
      const dropLines = drops.map(drop => `${formatItemName(drop.item)} x${drop.quantity}${drop.pity ? ' (pity)' : ''}`);
      summaryLines.push('', 'Rewards:', dropLines.map(line => `• ${line}`).join('\n'));
    } else {
      summaryLines.push('', 'No notable materials were recovered this time.');
    }

    const explorationEventFields = [];
    let combatTriggered = false;
    const biomeData = biome;
    const eventEntries = Array.isArray(biomeData?.encounters?.events) ? biomeData.encounters.events : null;
    if (eventEntries && eventEntries.length && Math.random() < 0.2) {
      const event = weightedChoice(eventEntries, 'chance');
      if (event) {
        const outcome = triggerExplorationEvent(player, biomeData, event, null);
        if (outcome?.text) explorationEventFields.push(outcome.text);
      }
    }
    if (Array.isArray(biomeData?.encounters?.combat) && biomeData.encounters.combat.length && shouldTriggerSuddenCombat(exploration)) {
      const encounter = weightedChoice(biomeData.encounters.combat, 'chance');
      if (encounter?.enemy) {
        const combatOutcome = resolveExplorationCombat(player, encounter.enemy);
        explorationEventFields.push(combatOutcome.description);
        combatTriggered = true;
      }
    }

    if (!combatTriggered) {
      exploration.consecutiveActionsSinceCombat = (exploration.consecutiveActionsSinceCombat || 0) + 1;
    }

    exploration.gathering = null;
    if (!exploration.action) exploration.status = 'idle';

    if (explorationEventFields.length) {
      summaryLines.push('', 'Events:', explorationEventFields.map(line => `• ${line}`).join('\n'));
    }

    summaryLines.push('', `⏱️ Elapsed: ${adjustedSeconds}s`);
    if (!player.tutorials.gathering?.completionHint) {
      summaryLines.push('', '💡 Tip: Toggle harvest notifications with `!hy gather notifications off`.');
      player.tutorials.gathering.completionHint = true;
    }

    await updateReply({ content: summaryLines.join('\n') }).catch(error => console.error('Failed to send gathering completion message:', error));
    const notifyChannel = context.message?.channel || context.interaction?.channel || null;
    const notifyUser = context.message?.author || context.interaction?.user || null;
    if (notifyChannel && shouldSendGatherNotifications(player)) {
      const notificationEmbed = buildGatheringNotificationEmbed(
        notifyUser,
        biomeData,
        type,
        drops,
        adjustedSeconds,
        equippedTool
      );
      sendStyledChannelMessage(notifyChannel, notificationEmbed, 'gather').catch(() => {});
    }
    checkCosmeticUnlocks(null, player);
    const achievementTarget = context.message
      ? context.message
      : context.interaction
        ? createMessageAdapterFromInteraction(context.interaction, { ephemeral: context.ephemeral })
        : null;
    await handleAchievementCheck(achievementTarget, player);
  }, durationMs);

  return { success: true, durationMs };
}

const STARTUP_COMMAND_TESTS = [
  { name: 'profile', command: 'profile', args: () => [] },
  { name: 'inventory', command: 'inventory', args: () => [] },
  { name: 'stats', command: 'stats', args: () => [] },
  { name: 'explore status', command: 'explore', args: () => ['status'] },
  { name: 'travel status', command: 'travel', args: () => ['status'] },
  { name: 'gather status', command: 'gather', args: () => ['status'] },
  { name: 'base list', command: 'base', args: () => ['list'] },
  { name: 'settlement list', command: 'settlement', args: () => ['list'] },
  { name: 'daily reward', command: 'daily', args: () => [] },
  { name: 'tutorial', command: 'tutorial', args: () => [] },
  { name: 'quests list', command: 'quests', args: () => [] },
  { name: 'achievements list', command: 'achievements', args: () => [] },
  { name: 'shop browse', command: 'shop', args: () => [] },
  { name: 'codex factions', command: 'codex', args: () => ['factions'] },
  { name: 'lore kweebec', command: 'lore', args: () => ['kweebec'] },
  { name: 'help overview', command: 'help', args: () => [] },
  { name: 'info panel', command: 'info', args: () => [] },
  { name: 'reputation summary', command: 'reputation', args: () => [] },
  { name: 'vendor overview', command: 'vendor', args: () => [] },
  { name: 'contracts overview', command: 'contracts', args: () => [] },
  { name: 'brews list', command: 'brews', args: () => [] },
  { name: 'recipes list', command: 'recipes', args: () => [] },
  { name: 'event status', command: 'eventstatus', args: () => [] }
];

function createSelfTestMessage(userId = `SELF_TEST_${Date.now()}_${Math.floor(Math.random() * 1e6)}`) {
  const outputs = [];
  const message = {
    author: { id: userId, username: 'SelfTestUser', bot: false },
    guild: { id: 'SELF_TEST_GUILD', name: 'Self Test Guild' },
    channel: {
      id: 'SELF_TEST_CHANNEL',
      send: payload => {
        outputs.push(payload);
        return Promise.resolve(payload);
      }
    },
    member: { user: { id: userId } },
    mentions: {
      users: {
        first: () => null
      }
    },
    reply: payload => {
      outputs.push(payload);
      return Promise.resolve(payload);
    },
    selfTestOutputs: outputs
  };
  return message;
}

async function runStartupSelfTest() {
  if (process.env.DISABLE_STARTUP_SELF_TEST) {
    console.log('🧪 Startup self-test skipped (DISABLE_STARTUP_SELF_TEST set).');
    return;
  }

  console.log('🧪 Running startup self-test...');
  const results = [];

  const selfTestUserId = client?.user?.id || '0';
  for (const test of STARTUP_COMMAND_TESTS) {
    const message = createSelfTestMessage(selfTestUserId);
    try {
      const argsFactory = typeof test.args === 'function' ? test.args : () => test.args || [];
      const args = argsFactory();
      await executeCommand(message, test.command, Array.isArray(args) ? args : []);
      results.push({ name: test.name, ok: true });
    } catch (error) {
      results.push({ name: test.name, ok: false, error });
    } finally {
      playerData.delete(message.author.id);
    }
  }

  const failures = results.filter(result => !result.ok);
  results.forEach(result => {
    if (result.ok) {
      console.log(`   ✅ ${result.name}`);
    } else {
      console.error(`   ❌ ${result.name}: ${result.error?.message || result.error}`);
    }
  });

  if (failures.length === 0) {
    console.log('🧪 Startup self-test completed successfully.');
  } else {
    console.error(`🧪 Startup self-test completed with ${failures.length} failure(s).`);
  }
}

const fallbackRecipeDefinitions = [
  {
    id: 'steel_upgrade',
    result: 'steel_sword',
    level: 3,
    coins: 75,
    ingredients: {
      'wooden_sword': 1,
      'iron_ingot': 4,
      'ancient_bark': 6
    },
    description: 'Upgrade a wooden sword into a balanced steel blade.'
  },
  {
    id: 'greater_health_potion',
    result: 'greater_health_potion',
    level: 2,
    coins: 35,
    ingredients: {
      'health_potion': 1,
      'ancient_bark': 2,
      'sunstone_shard': 1
    },
    description: 'Brew a more potent healing potion.'
  }
];

const RECIPE_DEFINITIONS = loadDataFile('recipes.json', fallbackRecipeDefinitions);
const RECIPES = {};
RECIPE_DEFINITIONS.forEach(recipe => {
  const normalized = {
    ...recipe,
    name: recipe.name || recipe.result,
    station: recipe.station || 'forge',
    level: recipe.level || 1,
    coins: recipe.coins || 0,
    ingredients: recipe.ingredients || {}
  };
  RECIPES[normalized.result] = normalized;
});

const fallbackEnemyDefinitions = [
  { id: 'feral_trork', name: 'Feral Trork', emoji: '🐗', hp: 30, damage: 5, xp: 20, coins: 10 },
  { id: 'shadow_crawler', name: 'Shadow Crawler', emoji: '🕷️', hp: 50, damage: 8, xp: 35, coins: 20 },
  { id: 'void_knight', name: 'Void Knight', emoji: '⚔️', hp: 80, damage: 12, xp: 60, coins: 40 },
  { id: 'ancient_golem', name: 'Ancient Golem', emoji: '🗿', hp: 120, damage: 15, xp: 100, coins: 75 },
  { id: 'varyn_warlord', name: 'Varyn Warlord', emoji: '👹', hp: 200, damage: 25, xp: 200, coins: 150 }
];

const ENEMY_DEFINITIONS = loadDataFile('enemies.json', fallbackEnemyDefinitions);
const ENEMIES = ENEMY_DEFINITIONS.map(enemy => ({ ...enemy }));
const ENEMY_MAP = {};
ENEMIES.forEach(enemy => {
  const key = enemy.id || enemy.name?.toLowerCase().replace(/\s+/g, '_');
  if (key) ENEMY_MAP[key] = enemy;
});

const fallbackQuestDefinitions = [
  {
    id: 1,
    slug: 'kweebec-helper',
    name: 'Kweebec Helper',
    description: 'Help the Kweebecs gather 5 resources',
    req: { level: 1 },
    reward: { xp: 50, coins: 30 }
  },
  {
    id: 2,
    slug: 'trork-hunter',
    name: 'Trork Hunter',
    description: 'Defeat 3 Feral Trorks',
    req: { level: 3 },
    reward: { xp: 100, coins: 60 }
  },
  {
    id: 3,
    slug: 'crystal-seeker',
    name: 'Crystal Seeker',
    description: 'Find an Orbis Crystal',
    req: { level: 5 },
    reward: { xp: 150, coins: 100, items: [{ item: 'orbis_crystal', quantity: 1 }] }
  }
];
const QUEST_DEFINITIONS = loadDataFile('quests.json', fallbackQuestDefinitions).map(raw => {
  const rewardItems = Array.isArray(raw.reward?.items)
    ? raw.reward.items.map(entry => ({
        item: entry.item,
        quantity: entry.quantity || entry.count || 1
      })).filter(entry => entry.item)
    : raw.reward?.item
      ? [{ item: raw.reward.item, quantity: raw.reward.itemAmount || raw.reward.quantity || 1 }]
      : [];

  const objectives = Array.isArray(raw.objectives)
    ? raw.objectives.map(obj => ({
        type: obj.type || 'gather',
        item: obj.item || obj.target || null,
        enemy: obj.enemy || obj.target || null,
        dungeon: obj.dungeon || null,
        quantity: obj.quantity || obj.count || 1,
        description: obj.description || ''
      }))
    : [];

  return {
    ...raw,
    desc: raw.description || raw.desc || '',
    reward: {
      xp: raw.reward?.xp || 0,
      coins: raw.reward?.coins || 0,
      items: rewardItems
    },
    req: raw.req || { level: raw.requirement?.level || 1 },
    objectives,
    prerequisites: Array.isArray(raw.prerequisites) ? raw.prerequisites : []
  };
});

const QUESTS = QUEST_DEFINITIONS;
const QUEST_MAP = {};
const QUEST_SLUG_MAP = {};
QUESTS.forEach(quest => {
  if (quest.id != null) {
    QUEST_MAP[quest.id] = quest;
  }
  if (quest.slug) {
    QUEST_SLUG_MAP[quest.slug.toLowerCase()] = quest;
  }
});

const MAX_ACTIVE_QUESTS = 3;

function formatObjectiveLabel(objective) {
  if (!objective) return '';
  if (objective.description) return objective.description;
  switch (objective.type) {
    case 'defeat':
      return `Defeat ${objective.quantity}x ${objective.enemy}`;
    case 'gather':
      return `Gather ${objective.quantity}x ${objective.item}`;
    case 'craft':
      return `Craft ${objective.quantity}x ${objective.item}`;
    case 'dungeon':
      return `Complete ${objective.quantity}x ${objective.dungeon} dungeon`; 
    default:
      return `${objective.quantity}x objective`;
  }
}

function formatObjectiveSummary(quest) {
  if (!quest || !Array.isArray(quest.objectives)) return 'Objectives unknown';
  return quest.objectives.map(obj => formatObjectiveLabel(obj)).join(' • ');
}

function formatRewardSummary(reward) {
  if (!reward) return 'No rewards';
  const parts = [];
  if (reward.xp) parts.push(`XP ${reward.xp}`);
  if (reward.coins) parts.push(`Coins ${reward.coins}`);
  if (Array.isArray(reward.items) && reward.items.length > 0) {
    const items = reward.items.map(entry => {
      const data = ITEMS[entry.item];
      return `${data ? data.emoji + ' ' : ''}${entry.item} x${entry.quantity || entry.amount || 1}`;
    }).join(', ');
    parts.push(items);
  }
  return parts.join(' • ') || 'No rewards';
}

function addQuestField(embed, title, lines) {
  if (!lines || lines.length === 0) return;
  let buffer = '';
  let part = 0;
  lines.forEach(line => {
    const addition = buffer ? `\n${line}` : line;
    if ((buffer + addition).length > 1024) {
      embed.addFields({ name: part === 0 ? title : `${title} (cont. ${part})`, value: buffer });
      buffer = line;
      part++;
    } else {
      buffer = buffer ? `${buffer}\n${line}` : line;
    }
  });
  if (buffer) {
    embed.addFields({ name: part === 0 ? title : `${title} (cont. ${part})`, value: buffer });
  }
}

function getQuestAvailability(player, quest) {
  if (!quest) return { status: 'unknown', reason: 'Quest not found' };
  if (player.completedQuests?.includes(quest.id)) {
    return { status: 'completed', reason: 'Already completed' };
  }
  if (player.quests?.includes(quest.id)) {
    return { status: 'active', reason: 'Already active' };
  }
  const levelRequirement = quest.req?.level || 1;
  if ((player.level || 1) < levelRequirement) {
    return { status: 'locked', reason: `Requires level ${levelRequirement}` };
  }
  const missingPrereqs = (quest.prerequisites || []).filter(id => !player.completedQuests?.includes(id));
  if (missingPrereqs.length > 0) {
    const names = missingPrereqs.map(id => QUEST_MAP[id]?.name || `Quest ${id}`);
    return { status: 'locked', reason: `Complete ${names.join(', ')}` };
  }
  return { status: 'available' };
}

function formatActiveQuestLine(player, quest) {
  const progress = refreshQuestProgress(player, quest) || { objectives: [], ready: false };
  const status = progress.ready ? '✅ Ready to turn in' : '⏳ In progress';
  const objectiveLines = quest.objectives.length > 0
    ? quest.objectives.map((obj, idx) => {
        const current = progress.objectives[idx] || 0;
        const label = formatObjectiveLabel(obj);
        return `• ${label} (${current}/${obj.quantity})`;
      }).join('\n')
    : 'No objectives listed.';
  return `**${quest.name}** (\`${quest.id}\`) — ${status}\n${objectiveLines}`;
}

const fallbackDungeons = [
  {
    id: 'shadow_depths',
    name: 'Shadow Depths',
    minLevel: 4,
    floors: [
      {
        name: 'Shadow Scout',
        emoji: '🦇',
        description: 'A swift scout of the Varyn lurking in the upper halls.',
        baseHp: 90,
        hpPerLevel: 12,
        baseDamage: 10,
        damagePerLevel: 1.8,
        baseXp: 65,
        xpPerLevel: 10,
        baseCoins: 60,
        coinsPerLevel: 5,
        healPercent: 0.2
      },
      {
        name: 'Crystal Sentinel',
        emoji: '🛕',
        description: 'A construct empowered by Orbis crystals guarding the lower chambers.',
        relic: { item: 'orbis_crystal', chance: 0.4, amount: 1 },
        baseHp: 140,
        hpPerLevel: 15,
        baseDamage: 14,
        damagePerLevel: 2.2,
        baseXp: 110,
        xpPerLevel: 12,
        baseCoins: 90,
        coinsPerLevel: 6,
        healPercent: 0.25
      },
      {
        name: 'Depth Tyrant',
        emoji: '🐉',
        description: 'The ruler of the depths wielding ancient void magic.',
        relic: { item: 'luminite_core', chance: 0.6, amount: 1 },
        baseHp: 220,
        hpPerLevel: 20,
        baseDamage: 20,
        damagePerLevel: 2.8,
        baseXp: 200,
        xpPerLevel: 18,
        baseCoins: 200,
        coinsPerLevel: 10,
        healPercent: 1
      }
    ],
    completionReward: {
      coins: { base: 200, perLevel: 12 },
      xp: { base: 220, perLevel: 15 }
    }
  }
];
const DUNGEON_DEFINITIONS = loadDataFile('dungeons.json', fallbackDungeons);
const DUNGEON_LOOKUP = {};
DUNGEON_DEFINITIONS.forEach(def => {
  if (def && def.id) {
    DUNGEON_LOOKUP[def.id.toLowerCase()] = def;
  }
});
const STRUCTURE_DEFINITIONS = loadDataFile('structures.json', []);
const fallbackFactions = [
  {
    id: 'kweebec',
    name: 'Kweebec Council',
    alignment: 'friendly',
    description: 'Tree-dwelling artisans who balance harmony and defense in the Emerald Grove.',
    homeBiome: 'Emerald Grove',
    leaders: ['Elder Elmroot'],
    signatureItems: ['kweebec_charm', 'grove_tonic'],
    allies: ['skysong'],
    rivals: ['trork'],
    notableLocations: ['Emerald Village'],
    tiers: {
      friendly: {
        vendor: [
          { item: 'kweebec_charm', price: 120 },
          { item: 'grove_tonic', price: 80 }
        ],
        contracts: [
          {
            id: 'kweebec_daily_harvest',
            name: 'Daily Harvest',
            type: 'gather',
            item: 'ancient_bark',
            quantity: 6,
            description: 'Collect bark to reinforce treetop dwellings.',
            reward: { coins: 180, reputation: 6 }
          }
        ]
      },
      honored: {
        vendor: [
          { item: 'ember_ale', price: 150 },
          { item: 'forestwarden_staff', price: 520 }
        ],
        contracts: [
          {
            id: 'kweebec_grove_guard',
            name: 'Grove Guard',
            type: 'defeat',
            enemy: 'feral_trork',
            quantity: 8,
            description: 'Defeat marauding Trorks before they torch the groves.',
            reward: { coins: 260, reputation: 10, items: [{ item: 'ancient_bark', quantity: 4 }] }
          }
        ]
      },
      exalted: {
        vendor: [
          { item: 'forest_guardian_helm', price: 950 },
          { item: 'wyrmroot_salve', price: 240 }
        ],
        contracts: [
          {
            id: 'kweebec_relic_patrol',
            name: 'Relic Patrol',
            type: 'dungeon',
            dungeon: 'shadow_depths',
            quantity: 1,
            description: 'Escort a relic team into the depths and return safely.',
            reward: { coins: 420, reputation: 18, items: [{ item: 'forestwarden_staff', quantity: 1 }] }
          }
        ]
      }
    }
  },
  {
    id: 'skysong',
    name: 'Skysong Circle',
    alignment: 'mystic',
    description: 'Scholars of wind and light who archive Orbis lore across the Gale Cliffs.',
    homeBiome: 'Gale Cliffs',
    leaders: ['Archivist Liora'],
    signatureItems: ['focus_elixir', 'skyflare_pendant'],
    allies: ['kweebec'],
    rivals: ['varyn'],
    notableLocations: ['Aurora Library'],
    tiers: {
      friendly: {
        vendor: [
          { item: 'skysong_draught', price: 200 },
          { item: 'focus_elixir', price: 160 }
        ],
        contracts: [
          {
            id: 'skysong_resonance',
            name: 'Aurora Resonance',
            type: 'gather',
            item: 'aurora_fragment',
            quantity: 3,
            description: 'Collect aurora fragments for the archivists.',
            reward: { coins: 240, reputation: 8 }
          }
        ]
      },
      honored: {
        vendor: [
          { item: 'frostglow_ring', price: 540 },
          { item: 'aurora_tea', price: 210 }
        ],
        contracts: [
          {
            id: 'skysong_void_watch',
            name: 'Void Watch',
            type: 'defeat',
            enemy: 'void_knight',
            quantity: 6,
            description: 'Repel void incursions near the cliffs.',
            reward: { coins: 320, reputation: 12, items: [{ item: 'focus_elixir', quantity: 1 }] }
          }
        ]
      },
      exalted: {
        vendor: [
          { item: 'skyflare_pendant', price: 980 },
          { item: 'siren_tear_elixir', price: 360 }
        ],
        contracts: [
          {
            id: 'skysong_arcane_trial',
            name: 'Arcane Trial',
            type: 'pvp',
            result: 'win',
            quantity: 1,
            description: 'Prove your mastery in sanctioned duels.',
            reward: { coins: 500, reputation: 20, items: [{ item: 'skyflare_pendant', quantity: 1 }] }
          }
        ]
      }
    }
  },
  {
    id: 'human',
    name: 'Stormguard',
    alignment: 'military',
    description: 'Disciplined defenders of Stormguard Keep who harness lightning-forged arms.',
    homeBiome: 'Stormguard Keep',
    leaders: ['Commander Risa'],
    signatureItems: ['stormguard_plate', 'stormbreaker_hammer'],
    allies: ['skysong'],
    rivals: ['varyn'],
    notableLocations: ['Stormguard Keep'],
    tiers: {
      friendly: {
        vendor: [
          { item: 'steel_sword', price: 320 },
          { item: 'stormbrew_tonic', price: 190 }
        ],
        contracts: [
          {
            id: 'stormguard_patrol',
            name: 'Rampart Patrol',
            type: 'defeat',
            enemy: 'shadow_crawler',
            quantity: 5,
            description: 'Patrol the outer ramparts for crawling threats.',
            reward: { coins: 280, reputation: 8 }
          }
        ]
      },
      honored: {
        vendor: [
          { item: 'iron_armor', price: 480 },
          { item: 'stormfront_blade', price: 720 }
        ],
        contracts: [
          {
            id: 'stormguard_emergency_supply',
            name: 'Emergency Supply Run',
            type: 'gather',
            item: 'stormcore_shard',
            quantity: 4,
            description: 'Gather stormcore shards to reinforce the keep.',
            reward: { coins: 360, reputation: 12, items: [{ item: 'stormbrew_tonic', quantity: 1 }] }
          }
        ]
      },
      exalted: {
        vendor: [
          { item: 'stormguard_plate', price: 1100 },
          { item: 'stormbreaker_hammer', price: 1350 }
        ],
        contracts: [
          {
            id: 'stormguard_champion',
            name: 'Champion of the Keep',
            type: 'dungeon',
            dungeon: 'stormguard_keep',
            quantity: 1,
            description: 'Lead a squad into the Stormguard Keep and return with trophies.',
            reward: { coins: 520, reputation: 22, items: [{ item: 'stormguard_plate', quantity: 1 }] }
          }
        ]
      }
    }
  }
];

const fallbackBiomes = [
  { id: 'emerald_grove', name: 'Emerald Grove', climate: 'temperate' },
  { id: 'borea', name: 'Borea', climate: 'tundra' }
];
const fallbackBrews = [
  {
    id: 'ember_ale',
    name: 'Ember Ale',
    ingredients: { ancient_bark: 1, sunstone_shard: 1, mana_potion: 1 },
    effects: { heal: 15 }
  }
];

const FACTIONS = loadDataFile('factions.json', fallbackFactions);
const BIOMES = loadDataFile('biomes.json', fallbackBiomes);
const BREW_DEFINITIONS = loadDataFile('brews.json', fallbackBrews);
const BREW_LIST = BREW_DEFINITIONS.map(def => {
  const normalized = {
    id: def.id,
    name: def.name || def.id,
    rarity: def.rarity || 'common',
    station: def.station || 'brewery',
    ingredients: def.ingredients || {},
    effects: {
      heal: Number(def.effects?.heal || 0),
      mana: Number(def.effects?.mana || 0),
      buff: def.effects?.buff || null
    },
    durationSeconds: Number(def.durationSeconds || def.duration || 120),
    description: def.description || ''
  };
  return normalized;
});
const BREW_MAP = {};
BREW_LIST.forEach(brew => {
  if (brew?.id) BREW_MAP[brew.id.toLowerCase()] = brew;
});
const fallbackEventDefinitions = [
  {
    id: 'shadow_breach',
    name: 'Shadow Breach',
    faction: 'varyn',
    durationMinutes: 30,
    description: 'Void portals flicker open across Orbis.',
    participation: `Fight shadow foes and run \`${PREFIX} participate shadow_breach\` to secure rewards.`,
    reward: { xp: 200, coins: 160, reputation: { skysong: 10 }, items: [{ item: 'void_essence', quantity: 1 }] }
  }
];

const EVENT_DEFINITIONS = loadDataFile('events.json', fallbackEventDefinitions);
const EVENT_LOOKUP = {};
EVENT_DEFINITIONS.forEach(event => {
  if (event?.id) EVENT_LOOKUP[event.id.toLowerCase()] = event;
});
const EVENT_SUBSCRIPTIONS = new Map(); // guildId -> { channelId, preferredEvent? }
const ACTIVE_WORLD_EVENTS = new Map(); // guildId -> event state
const ACTIVE_DUELS = new Map(); // channelId -> duel state
const TEAM_QUEUE = new Map(); // channelId -> array of userIds waiting for team duel
const DUEL_TIMEOUT_MS = 120000;
const TEAM_DUEL_SIZE = 2;

function extractUserId(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const mentionMatch = raw.match(/^<@!?(\d+)>$/);
    if (mentionMatch) return mentionMatch[1];
    if (/^\d+$/.test(raw)) return raw;
  }
  return null;
}

async function resolveUserFromInput(message, input) {
  const id = extractUserId(input);
  if (id) {
    try {
      return await client.users.fetch(id);
    } catch {
      return null;
    }
  }
  if (!input && message?.mentions?.users?.first?.()) {
    return message.mentions.users.first();
  }
  return null;
}

const EMBED_VISUALS = {
  dashboard: 'https://hytale.com/static/media/community.4f8e76e3.png',
  exploration: 'https://hytale.com/static/media/worlds.2184141f.png',
  travel: 'https://hytale.com/static/media/worlds-map.5fc5a8a1.png',
  baseSummary: 'https://hytale.com/static/media/building.1b2fa699.png',
  baseDetail: 'https://hytale.com/static/media/housing.9d1f0d4b.png',
  settlementSummary: 'https://hytale.com/static/media/community-hub.6048b86c.png',
  settlementDetail: 'https://hytale.com/static/media/settlement.8f08dcd4.png',
  modules: 'https://hytale.com/static/media/workshop.4a6d0c9e.png',
  expeditions: 'https://hytale.com/static/media/adventure.9a44b763.png',
  profile: 'https://hytale.com/static/media/community.4f8e76e3.png',
  inventory: 'https://hytale.com/static/media/building.1b2fa699.png',
  stats: 'https://hytale.com/static/media/workshop.4a6d0c9e.png',
  combat: 'https://hytale.com/static/media/worlds.2184141f.png',
  economy: 'https://hytale.com/static/media/community-hub.6048b86c.png',
  quests: 'https://hytale.com/static/media/community-hub.6048b86c.png',
  achievements: 'https://hytale.com/static/media/housing.9d1f0d4b.png',
  minigames: 'https://hytale.com/static/media/adventure.9a44b763.png',
  info: 'https://hytale.com/static/media/community.4f8e76e3.png',
  tutorial: 'https://hytale.com/static/media/header-hero.84f38cf2.png',
  events: 'https://hytale.com/static/media/worlds-map.5fc5a8a1.png',
  vendor: 'https://hytale.com/static/media/building.1b2fa699.png',
  contracts: 'https://hytale.com/static/media/settlement.8f08dcd4.png',
  pvp: 'https://hytale.com/static/media/workshop.4a6d0c9e.png',
  brew: 'https://hytale.com/static/media/workshop.4a6d0c9e.png',
  lore: 'https://hytale.com/static/media/world-emerald-grove.30e9f5d7.jpg',
  codex: 'https://hytale.com/static/media/community-hub.6048b86c.png',
  leaderboard: 'https://hytale.com/static/media/community.4f8e76e3.png',
  reputation: 'https://hytale.com/static/media/community.4f8e76e3.png',
  fallback: 'https://hytale.com/static/media/header-hero.84f38cf2.png'
};

const BIOME_ARTWORK = {
  emerald_grove: 'https://hytale.com/static/media/world-emerald-grove.30e9f5d7.jpg',
  deep_ocean: 'https://hytale.com/static/media/world-deep-ocean.8fb4da45.jpg',
  ashen_alps: 'https://hytale.com/static/media/world-ashen-alps.c0231fd5.jpg',
  gale_cliffs: 'https://hytale.com/static/media/world-gale-cliffs.03a1c2d0.jpg',
  desert: 'https://hytale.com/static/media/world-scorched-desert.f2a0a4c0.jpg',
  borea: 'https://hytale.com/static/media/world-borea.e8a9d2a1.jpg',
  wasteland: 'https://hytale.com/static/media/world-firelands.5a04f5bb.jpg',
  howling_peaks: 'https://hytale.com/static/media/world-ashen-alps.c0231fd5.jpg',
  ember_depths: 'https://hytale.com/static/media/world-firelands.5a04f5bb.jpg',
  gloomwild_thicket: 'https://hytale.com/static/media/world-emerald-grove.30e9f5d7.jpg'
};

const FACTION_ARTWORK = {
  kweebec: 'https://hytale.com/static/media/faction-kweebec.9980a871.png',
  trork: 'https://hytale.com/static/media/faction-trork.8b0df13f.png',
  outlander: 'https://hytale.com/static/media/faction-outlander.c9be6d50.png',
  feran: 'https://hytale.com/static/media/faction-feran.9e6dcc94.png',
  human: 'https://hytale.com/static/media/faction-human.5ae5b9d7.png',
  varyn: 'https://hytale.com/static/media/faction-varyn.8948bd8d.png'
};
const SLASH_COMMAND_DEFINITIONS = [
  {
    name: 'dashboard',
    description: 'Show an overview of your current progress and active systems.',
    options: [
      {
        type: 3,
        name: 'scope',
        description: 'Choose which system to display.',
        required: false,
        choices: [
          { name: 'All Systems', value: 'all' },
          { name: 'Exploration', value: 'explore' },
          { name: 'Bases', value: 'base' },
          { name: 'Settlements', value: 'settlement' }
        ]
      }
    ]
  },
  {
    name: 'explore',
    description: 'Manage biome exploration.',
    options: [
      { type: 1, name: 'status', description: 'View your exploration status.' },
      { type: 1, name: 'resolve', description: 'Resolve the active exploration action.' },
      {
        type: 1,
        name: 'activity',
        description: 'Start a biome-specific activity.',
        options: [
          { type: 3, name: 'activity_id', description: 'Activity identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'chain',
        description: 'Start an exploration chain.',
        options: [
          { type: 3, name: 'chain_id', description: 'Chain identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'action',
        description: 'Perform a standard exploration action.',
        options: [
          { type: 3, name: 'action_id', description: 'Action identifier', required: true, autocomplete: true }
        ]
      }
    ]
  },
  {
    name: 'gather',
    description: 'Harvest resources using specialized gear.',
    options: [
      { type: 1, name: 'status', description: 'View harvesting bonuses and nearby resource highlights.' },
      {
        type: 1,
        name: 'start',
        description: 'Begin gathering a resource type.',
        options: [
          { type: 3, name: 'type', description: 'Gathering type', required: true, choices: GATHERING_SLASH_CHOICES }
        ]
      },
      {
        type: 1,
        name: 'gear',
        description: 'Inspect or upgrade your gathering gear.',
        options: [
          {
            type: 3,
            name: 'action',
            description: 'Choose to view status or upgrade gear.',
            required: true,
            choices: [
              { name: 'Status', value: 'status' },
              { name: 'Upgrade', value: 'upgrade' }
            ]
          },
          {
            type: 3,
            name: 'type',
            description: 'Gathering type to target when upgrading.',
            required: false,
            choices: GATHERING_SLASH_CHOICES
          }
        ]
      },
      {
        type: 1,
        name: 'notifications',
        description: 'Toggle harvest completion notifications.',
        options: [
          { type: 5, name: 'enabled', description: 'Enable notifications?', required: true }
        ]
      }
    ]
  },
  {
    name: 'travel',
    description: 'Manage travel between biomes.',
    options: [
      { type: 1, name: 'status', description: 'View your travel status.' },
      { type: 1, name: 'resolve', description: 'Resolve your active travel timer.' },
      {
        type: 1,
        name: 'start',
        description: 'Travel to another biome.',
        options: [
          { type: 3, name: 'biome', description: 'Destination biome', required: true, autocomplete: true }
        ]
      }
    ]
  },
  {
    name: 'base',
    description: 'Review and upgrade your bases.',
    options: [
      { type: 1, name: 'list', description: 'List all bases.' },
      {
        type: 1,
        name: 'info',
        description: 'Show details for a base.',
        options: [
          { type: 3, name: 'biome', description: 'Biome identifier', required: false, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'modules',
        description: 'List module upgrades for a base.',
        options: [
          { type: 3, name: 'biome', description: 'Biome identifier', required: false, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'claim',
        description: 'Establish a base in the selected biome.',
        options: [
          { type: 3, name: 'biome', description: 'Biome identifier', required: false, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'rankup',
        description: 'Rank up a base.',
        options: [
          { type: 3, name: 'biome', description: 'Biome identifier', required: false, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'upgrade',
        description: 'Upgrade a base module.',
        options: [
          { type: 3, name: 'module', description: 'Module identifier', required: true, autocomplete: true },
          { type: 3, name: 'biome', description: 'Biome identifier', required: false, autocomplete: true }
        ]
      }
    ]
  },
  {
    name: 'settlement',
    description: 'Manage your settlements.',
    options: [
      { type: 1, name: 'list', description: 'List all settlements.' },
      {
        type: 1,
        name: 'info',
        description: 'Show details for a settlement.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'stockpile',
        description: 'Show stockpile information.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'decisions',
        description: 'Resolve a pending decision.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true },
          { type: 3, name: 'decision', description: 'Decision identifier', required: true, autocomplete: true },
          { type: 3, name: 'option', description: 'Decision option identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'expeditions',
        description: 'List available expedition templates.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'expedition',
        description: 'Launch an expedition.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true },
          { type: 3, name: 'expedition', description: 'Expedition identifier', required: true, autocomplete: true },
          { type: 4, name: 'villagers', description: 'Number of villagers', required: false }
        ]
      },
      {
        type: 1,
        name: 'cancel',
        description: 'Cancel an active expedition.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true },
          { type: 3, name: 'expedition', description: 'Expedition instance identifier', required: true, autocomplete: true }
        ]
      },
      {
        type: 1,
        name: 'expedite',
        description: 'Expedite an active expedition.',
        options: [
          { type: 3, name: 'settlement', description: 'Settlement identifier', required: true, autocomplete: true },
          { type: 3, name: 'expedition', description: 'Expedition instance identifier', required: true, autocomplete: true }
        ]
      }
    ]
  }
];

const LEGACY_SLASH_COMMANDS = [
  { name: 'profile', description: 'Show a player profile.', options: [{ type: 6, name: 'user', description: 'Player to inspect', required: false }] },
  { name: 'inventory', description: 'View your inventory.' },
  { name: 'equip', description: 'Equip an item from your inventory.', options: [{ type: 3, name: 'item', description: 'Item identifier', required: true }] },
  { name: 'use', description: 'Use a consumable item.', options: [{ type: 3, name: 'item', description: 'Item identifier', required: true }] },
  {
    name: 'gather',
    description: 'Harvest resources or manage gathering gear.',
    options: [
      { type: 3, name: 'action', description: 'status | gear | notifications | mining | foraging | farming | fishing', required: false },
      { type: 3, name: 'target', description: 'Optional secondary argument (module, biome, etc.)', required: false }
    ]
  },
  { name: 'stats', description: 'Show your combat statistics.' },
  { name: 'hunt', description: 'Start a battle against a random enemy.' },
  { name: 'raid', description: 'Start a raid encounter.' },
  { name: 'heal', description: 'Restore HP and Mana for a coin fee.' },
  { name: 'dungeon', description: 'Begin a dungeon run.', options: [{ type: 3, name: 'id', description: 'Dungeon identifier', required: true }] },
  { name: 'dungeons', description: 'View the dungeon atlas.' },
  { name: 'descend', description: 'Descend to the next dungeon floor.' },
  { name: 'retreat', description: 'Retreat from your current dungeon run.' },
  { name: 'shop', description: 'Browse the adventure shop.', options: [{ type: 3, name: 'category', description: 'Item category', required: false }] },
  { name: 'buy', description: 'Purchase an item from the shop.', options: [{ type: 3, name: 'item', description: 'Item identifier', required: true }, { type: 4, name: 'amount', description: 'Quantity to buy', required: false }] },
  { name: 'sell', description: 'Sell an item from your inventory.', options: [{ type: 3, name: 'item', description: 'Item identifier', required: true }, { type: 4, name: 'amount', description: 'Quantity to sell', required: false }] },
  { name: 'recipes', description: 'Show crafting recipes.', options: [{ type: 3, name: 'item', description: 'Item identifier', required: false }] },
  { name: 'craft', description: 'Craft an item.', options: [{ type: 3, name: 'item', description: 'Item identifier', required: true }, { type: 4, name: 'amount', description: 'Quantity to craft', required: false }] },
  { name: 'brews', description: 'List available brews.', options: [{ type: 3, name: 'station', description: 'Brewing station', required: false }] },
  { name: 'brew', description: 'Brew a consumable.', options: [{ type: 3, name: 'id', description: 'Brew identifier', required: true }, { type: 4, name: 'amount', description: 'Quantity to brew', required: false }] },
  { name: 'drink', description: 'Drink a brew from your inventory.', options: [{ type: 3, name: 'id', description: 'Brew identifier', required: true }] },
  { name: 'buffs', description: 'Display your active buffs.' },
  { name: 'daily', description: 'Claim your daily coin reward.' },
  { name: 'give', description: 'Give coins to another player.', options: [{ type: 6, name: 'user', description: 'Recipient', required: true }, { type: 4, name: 'amount', description: 'Amount of coins', required: true }] },
  { name: 'vendor', description: 'Browse a faction vendor.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: false }] },
  { name: 'tutorial', description: 'Walk through the getting-started tutorial.' },
  { name: 'buyrep', description: 'Purchase an item from a faction vendor.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: true }, { type: 3, name: 'item', description: 'Item identifier', required: true }, { type: 4, name: 'amount', description: 'Quantity to buy', required: false }] },
  { name: 'contracts', description: 'View available contracts.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: false }] },
  { name: 'acceptcontract', description: 'Accept a faction contract.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: true }, { type: 3, name: 'id', description: 'Contract identifier', required: true }] },
  { name: 'turnincontract', description: 'Turn in a completed faction contract.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: true }] },
  { name: 'abandoncontract', description: 'Abandon your active contract.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: true }] },
  { name: 'quests', description: 'View your quest log and available quests.' },
  { name: 'startquest', description: 'Start a quest.', options: [{ type: 3, name: 'id', description: 'Quest identifier', required: true }] },
  { name: 'completequest', description: 'Complete a finished quest.', options: [{ type: 3, name: 'id', description: 'Quest identifier', required: true }] },
  { name: 'achievements', description: 'Show your achievement progress.' },
  { name: 'claimachievement', description: 'Claim an unlocked achievement reward.', options: [{ type: 3, name: 'id', description: 'Achievement identifier', required: true }] },
  { name: 'scramble', description: 'Start a letter scramble minigame.' },
  { name: 'trivia', description: 'Start a Hytale trivia quiz.' },
  { name: 'guess', description: 'Start the number guessing game.' },
  { name: 'rps', description: 'Play rock-paper-scissors against the bot.', options: [{ type: 3, name: 'choice', description: 'Your choice', required: true, choices: [{ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' }] }] },
  { name: 'coinflip', description: 'Flip a coin.', options: [{ type: 3, name: 'call', description: 'Heads or tails', required: false, choices: [{ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }] }] },
  { name: 'leaderboard', description: 'View global leaderboards.', options: [{ type: 3, name: 'category', description: 'Leaderboard category', required: false }] },
  { name: 'trade', description: 'Initiate a trade with another player.', options: [{ type: 6, name: 'user', description: 'Trade partner', required: true }, { type: 3, name: 'item', description: 'Item identifier', required: true }] },
  { name: 'help', description: 'Show bot help categories.', options: [{ type: 3, name: 'category', description: 'Help category', required: false }] },
  { name: 'info', description: 'Show bot information.' },
  { name: 'lore', description: 'Read a lore entry.', options: [{ type: 3, name: 'topic', description: 'Lore topic', required: true, choices: [{ name: 'Kweebec', value: 'kweebec' }, { name: 'Trork', value: 'trork' }, { name: 'Varyn', value: 'varyn' }, { name: 'Orbis', value: 'orbis' }] }] },
  { name: 'codex', description: 'Browse the Orbis codex.', options: [
    {
      type: 3,
      name: 'category',
      description: 'Codex category',
      required: true,
      choices: [
        { name: 'Items', value: 'items' },
        { name: 'Enemies', value: 'enemies' },
        { name: 'Factions', value: 'factions' },
        { name: 'Biomes', value: 'biomes' },
        { name: 'Dungeons', value: 'dungeons' }
      ]
    },
    { type: 3, name: 'entry', description: 'Entry identifier', required: false }
  ] },
  { name: 'reputation', description: 'Check faction reputation.', options: [{ type: 3, name: 'faction', description: 'Faction identifier', required: false }] },
  { name: 'eventsub', description: 'Subscribe the current channel to world events.', options: [{ type: 3, name: 'event', description: 'Event identifier or "off"', required: false }] },
  { name: 'eventstatus', description: 'Show the active world event.' },
  { name: 'participate', description: 'Participate in the active event.', options: [{ type: 3, name: 'event', description: 'Event identifier', required: true }] },
  { name: 'setuptweets', description: 'Configure tweet tracking for this channel.', options: [{ type: 7, name: 'channel', description: 'Channel for tweet tracking', required: false }] },
  { name: 'checktweets', description: 'Fetch the latest Hytale tweets.' },
  { name: 'reset', description: 'Reset a player profile.', options: [{ type: 6, name: 'user', description: 'Player to reset', required: true }] },
  { name: 'addcoins', description: 'Grant coins to a player.', options: [{ type: 6, name: 'user', description: 'Player to reward', required: true }, { type: 4, name: 'amount', description: 'Amount of coins', required: true }] },
  { name: 'duel', description: 'Challenge another player to a duel.', options: [{ type: 6, name: 'user', description: 'Opponent', required: true }, { type: 4, name: 'wager', description: 'Optional wager', required: false }] },
  { name: 'accept', description: 'Accept the pending duel challenge.' },
  { name: 'decline', description: 'Decline the pending duel challenge.' },
  { name: 'teamqueue', description: 'Join the team duel queue.' },
  { name: 'leaveteam', description: 'Leave the team duel queue.' }
];

SLASH_COMMAND_DEFINITIONS.push(...LEGACY_SLASH_COMMANDS);
const SLASH_COMMAND_DEDUP = new Map();
SLASH_COMMAND_DEFINITIONS.forEach(def => {
  if (!SLASH_COMMAND_DEDUP.has(def.name)) {
    SLASH_COMMAND_DEDUP.set(def.name, def);
  }
});
SLASH_COMMAND_DEFINITIONS.length = 0;
SLASH_COMMAND_DEFINITIONS.push(...SLASH_COMMAND_DEDUP.values());

const HY_SLASH_SUBCOMMAND_SET = new Set([
  'inventory','equip','use','stats','shop','buy','sell','recipes','craft','brews','brew','drink','buffs','daily','give','vendor','tutorial','buyrep','contracts','acceptcontract','turnincontract','abandoncontract','quests','startquest','completequest','claimachievement','gather'
]);
const HY_SLASH_OPTIONS = [];

LEGACY_SLASH_COMMANDS.forEach(def => {
  if (HY_SLASH_SUBCOMMAND_SET.has(def.name) && HY_SLASH_OPTIONS.length < 25) {
    HY_SLASH_OPTIONS.push({
      type: 1,
      name: def.name,
      description: def.description,
      options: def.options || []
    });
  }
});

if (HY_SLASH_OPTIONS.length && !SLASH_COMMAND_DEDUP.has('hy')) {
  SLASH_COMMAND_DEFINITIONS.push({
    name: 'hy',
    description: 'Access legacy commands via subcommands.',
    options: HY_SLASH_OPTIONS
  });
}

function applyVisualStyle(embed, key) {
  const image = EMBED_VISUALS[key] || EMBED_VISUALS.fallback;
  if (image) {
    embed.setThumbnail(image);
    embed.setImage(image);
  }
  return embed;
}
const SYSTEM_COMPONENTS = {
  profile: [
    { command: 'inventory', label: 'Inventory', emoji: '🎒', style: ButtonStyle.Primary },
    { command: 'stats', label: 'Stats', emoji: '📊', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Success }
  ],
  inventory: [
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Primary },
    { command: 'shop', label: 'Shop', emoji: '🛒', style: ButtonStyle.Secondary },
    { command: 'daily', label: 'Daily Reward', emoji: '🎁', style: ButtonStyle.Success }
  ],
  stats: [
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Primary },
    { command: 'leaderboard', label: 'Leaderboard', emoji: '🏆', style: ButtonStyle.Secondary },
    { command: 'achievements', label: 'Achievements', emoji: '🎖️', style: ButtonStyle.Success }
  ],
  shop: [
    { command: 'inventory', label: 'Inventory', emoji: '🎒', style: ButtonStyle.Primary },
    { command: 'vendor', label: 'Faction Vendor', emoji: '🛍️', style: ButtonStyle.Secondary },
    { command: 'daily', label: 'Daily Reward', emoji: '🎁', style: ButtonStyle.Success }
  ],
  economy: [
    { command: 'shop', label: 'Shop', emoji: '🛒', style: ButtonStyle.Primary },
    { command: 'vendor', label: 'Faction Vendor', emoji: '🛍️', style: ButtonStyle.Secondary },
    { command: 'give', label: 'Gift Coins', emoji: '💰', style: ButtonStyle.Success }
  ],
  quests: [
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Primary },
    { command: 'achievements', label: 'Achievements', emoji: '🎖️', style: ButtonStyle.Secondary },
    { command: 'contracts', label: 'Contracts', emoji: '📜', style: ButtonStyle.Success }
  ],
  achievements: [
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Primary },
    { command: 'quests', label: 'Quests', emoji: '📜', style: ButtonStyle.Secondary },
    { command: 'leaderboard', label: 'Leaderboard', emoji: '🏆', style: ButtonStyle.Success }
  ],
  minigames: [
    { command: 'scramble', label: 'Scramble', emoji: '🔤', style: ButtonStyle.Primary },
    { command: 'trivia', label: 'Trivia', emoji: '❓', style: ButtonStyle.Secondary },
    { command: 'guess', label: 'Guess', emoji: '🎯', style: ButtonStyle.Success }
  ],
  info: [
    { command: 'help', label: 'Help', emoji: '🆘', style: ButtonStyle.Primary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Secondary },
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Success }
  ],
  tutorial: [
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Primary },
    { command: 'explore', label: 'Explore Status', emoji: '🧭', style: ButtonStyle.Secondary },
    { command: 'gather', label: 'Gather Status', emoji: '🌿', style: ButtonStyle.Success }
  ],
  events: [
    { command: 'eventstatus', label: 'Active Event', emoji: '🎇', style: ButtonStyle.Primary },
    { command: 'eventsub', label: 'Subscribe', emoji: '🔔', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Success }
  ],
  vendor: [
    { command: 'contracts', label: 'Contracts', emoji: '📜', style: ButtonStyle.Primary },
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Secondary },
    { command: 'daily', label: 'Daily Reward', emoji: '🎁', style: ButtonStyle.Success }
  ],
  contracts: [
    { command: 'contracts', label: 'Refresh', emoji: '🔄', style: ButtonStyle.Primary },
    { command: 'quests', label: 'Quests', emoji: '📜', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Success }
  ],
  pvp: [
    { command: 'duel', label: 'Duel', emoji: '⚔️', style: ButtonStyle.Primary },
    { command: 'teamqueue', label: 'Team Queue', emoji: '👥', style: ButtonStyle.Secondary },
    { command: 'leaderboard', label: 'Leaderboard', emoji: '🏆', style: ButtonStyle.Success }
  ],
  brew: [
    { command: 'brews', label: 'All Brews', emoji: '🧪', style: ButtonStyle.Primary },
    { command: 'inventory', label: 'Inventory', emoji: '🎒', style: ButtonStyle.Secondary },
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Success }
  ],
  exploration: [
    { command: 'explore', label: 'Explore', emoji: '🧭', style: ButtonStyle.Primary },
    { command: 'travel', label: 'Travel', emoji: '🚶', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🗺️', style: ButtonStyle.Success }
  ],
  combat: [
    { command: 'hunt', label: 'Hunt', emoji: '⚔️', style: ButtonStyle.Primary },
    { command: 'heal', label: 'Heal', emoji: '❤️', style: ButtonStyle.Secondary },
    { command: 'dungeons', label: 'Dungeons', emoji: '🏰', style: ButtonStyle.Success }
  ],
  base: [
    { command: 'base', label: 'Base List', emoji: '🏕️', style: ButtonStyle.Primary },
    { command: 'settlement', label: 'Settlements', emoji: '🏘️', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Success }
  ],
  reputation: [
    { command: 'vendor', label: 'Vendors', emoji: '🏪', style: ButtonStyle.Primary },
    { command: 'contracts', label: 'Contracts', emoji: '📜', style: ButtonStyle.Secondary },
    { command: 'profile', label: 'Profile', emoji: '🧙', style: ButtonStyle.Success }
  ],
  codex: [
    { command: 'lore', label: 'Lore', emoji: '📖', style: ButtonStyle.Primary },
    { command: 'quests', label: 'Quests', emoji: '📜', style: ButtonStyle.Secondary },
    { command: 'info', label: 'Bot Info', emoji: 'ℹ️', style: ButtonStyle.Success }
  ],
  lore: [
    { command: 'codex', label: 'Codex', emoji: '📘', style: ButtonStyle.Primary },
    { command: 'info', label: 'Bot Info', emoji: 'ℹ️', style: ButtonStyle.Secondary },
    { command: 'quests', label: 'Quests', emoji: '📜', style: ButtonStyle.Success }
  ],
  leaderboard: [
    { command: 'stats', label: 'Stats', emoji: '📊', style: ButtonStyle.Primary },
    { command: 'pvp', label: 'PvP', emoji: '⚔️', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Success }
  ],
  settlement: [
    { command: 'settlement', label: 'Settlement List', emoji: '🏘️', style: ButtonStyle.Primary },
    { command: 'contracts', label: 'Contracts', emoji: '📜', style: ButtonStyle.Secondary },
    { command: 'dashboard', label: 'Dashboard', emoji: '🧭', style: ButtonStyle.Success }
  ]
};

function buildSystemComponents(key) {
  const config = SYSTEM_COMPONENTS[key];
  if (!config || !config.length) return [];
  const row = new ActionRowBuilder();
  config.forEach(({ command, label, emoji, style }) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(['command', command].join('|'))
        .setLabel(label)
        .setStyle(style || ButtonStyle.Secondary)
        .setEmoji(emoji || '✨')
    );
  });
  return row.components.length ? [row] : [];
}

function buildStyledPayload(embed, key, options = {}) {
  applyVisualStyle(embed, key);
  const extraComponents = options.components ? [...options.components] : [];
  const systemComponents = buildSystemComponents(key);
  const components = [...extraComponents, ...systemComponents];
  const payload = { ...options, embeds: [embed] };
  if (components.length) payload.components = components;
  return payload;
}

function sendStyledChannelMessage(channel, embed, key, options = {}) {
  return channel.send(buildStyledPayload(embed, key, options));
}

function sendStyledEmbed(message, embed, key, options = {}) {
  return message.reply(buildStyledPayload(embed, key, options));
}
const SIMPLE_SLASH_EXECUTORS = {
  profile: interaction => {
    const user = interaction.options.getUser('user');
    return { command: 'profile', args: user ? [user.id] : [] };
  },
  inventory: () => ({ command: 'inventory', args: [] }),
  equip: interaction => ({ command: 'equip', args: [interaction.options.getString('item', true)] }),
  use: interaction => ({ command: 'use', args: [interaction.options.getString('item', true)] }),
  stats: () => ({ command: 'stats', args: [] }),
  hunt: () => ({ command: 'hunt', args: [] }),
  raid: () => ({ command: 'raid', args: [] }),
  heal: () => ({ command: 'heal', args: [] }),
  dungeon: interaction => ({ command: 'dungeon', args: [interaction.options.getString('id', true)] }),
  dungeons: () => ({ command: 'dungeons', args: [] }),
  descend: () => ({ command: 'descend', args: [] }),
  retreat: () => ({ command: 'retreat', args: [] }),
  shop: interaction => {
    const category = interaction.options.getString('category');
    return { command: 'shop', args: category ? [category] : [] };
  },
  buy: interaction => {
    const args = [interaction.options.getString('item', true)];
    const amount = interaction.options.getInteger('amount');
    if (amount != null) args.push(String(amount));
    return { command: 'buy', args };
  },
  sell: interaction => {
    const args = [interaction.options.getString('item', true)];
    const amount = interaction.options.getInteger('amount');
    if (amount != null) args.push(String(amount));
    return { command: 'sell', args };
  },
  recipes: interaction => {
    const item = interaction.options.getString('item');
    return { command: 'recipes', args: item ? [item] : [] };
  },
  craft: interaction => {
    const args = [interaction.options.getString('item', true)];
    const amount = interaction.options.getInteger('amount');
    if (amount != null) args.push(String(amount));
    return { command: 'craft', args };
  },
  brews: interaction => {
    const station = interaction.options.getString('station');
    return { command: 'brews', args: station ? [station] : [] };
  },
  brew: interaction => {
    const args = [interaction.options.getString('id', true)];
    const amount = interaction.options.getInteger('amount');
    if (amount != null) args.push(String(amount));
    return { command: 'brew', args };
  },
  drink: interaction => ({ command: 'drink', args: [interaction.options.getString('id', true)] }),
  buffs: () => ({ command: 'buffs', args: [] }),
  daily: () => ({ command: 'daily', args: [] }),
  give: interaction => {
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    return { command: 'give', args: [user.id, String(amount)] };
  },
  gather: interaction => {
    const action = interaction.options.getString('action');
    const target = interaction.options.getString('target');
    const args = [];
    if (action) args.push(action);
    if (target) args.push(target);
    return { command: 'gather', args };
  },
  vendor: interaction => {
    const faction = interaction.options.getString('faction');
    return { command: 'vendor', args: faction ? [faction] : [] };
  },
  tutorial: () => ({ command: 'tutorial', args: [] }),
  buyrep: interaction => {
    const args = [interaction.options.getString('faction', true), interaction.options.getString('item', true)];
    const amount = interaction.options.getInteger('amount');
    if (amount != null) args.push(String(amount));
    return { command: 'buyrep', args };
  },
  contracts: interaction => {
    const faction = interaction.options.getString('faction');
    return { command: 'contracts', args: faction ? [faction] : [] };
  },
  acceptcontract: interaction => ({ command: 'acceptcontract', args: [interaction.options.getString('faction', true), interaction.options.getString('id', true)] }),
  turnincontract: interaction => ({ command: 'turnincontract', args: [interaction.options.getString('faction', true)] }),
  abandoncontract: interaction => ({ command: 'abandoncontract', args: [interaction.options.getString('faction', true)] }),
  quests: () => ({ command: 'quests', args: [] }),
  startquest: interaction => ({ command: 'startquest', args: [interaction.options.getString('id', true)] }),
  completequest: interaction => ({ command: 'completequest', args: [interaction.options.getString('id', true)] }),
  achievements: () => ({ command: 'achievements', args: [] }),
  claimachievement: interaction => ({ command: 'claimachievement', args: [interaction.options.getString('id', true)] }),
  scramble: () => ({ command: 'scramble', args: [] }),
  trivia: () => ({ command: 'trivia', args: [] }),
  guess: () => ({ command: 'guess', args: [] }),
  rps: interaction => ({ command: 'rps', args: [interaction.options.getString('choice', true)] }),
  coinflip: interaction => {
    const call = interaction.options.getString('call');
    return { command: 'coinflip', args: call ? [call] : [] };
  },
  leaderboard: interaction => {
    const category = interaction.options.getString('category');
    return { command: 'leaderboard', args: category ? [category] : [] };
  },
  trade: interaction => {
    const user = interaction.options.getUser('user', true);
    const item = interaction.options.getString('item', true);
    return { command: 'trade', args: [user.id, item] };
  },
  help: interaction => {
    const category = interaction.options.getString('category');
    return { command: 'help', args: category ? [category] : [] };
  },
  info: () => ({ command: 'info', args: [] }),
  lore: interaction => ({ command: 'lore', args: [interaction.options.getString('topic', true)] }),
  codex: interaction => {
    const args = [interaction.options.getString('category', true)];
    const entry = interaction.options.getString('entry');
    if (entry) args.push(entry);
    return { command: 'codex', args };
  },
  reputation: interaction => {
    const faction = interaction.options.getString('faction');
    return { command: 'reputation', args: faction ? [faction] : [] };
  },
  eventsub: interaction => {
    const eventId = interaction.options.getString('event');
    return { command: 'eventsub', args: eventId ? [eventId] : [] };
  },
  eventstatus: () => ({ command: 'eventstatus', args: [] }),
  participate: interaction => ({ command: 'participate', args: [interaction.options.getString('event', true)] }),
  setuptweets: interaction => {
    const channel = interaction.options.getChannel('channel');
    return { command: 'setuptweets', args: [], overrides: channel ? { channel } : {} };
  },
  checktweets: () => ({ command: 'checktweets', args: [] }),
  reset: interaction => {
    const user = interaction.options.getUser('user', true);
    return { command: 'reset', args: [user.id] };
  },
  addcoins: interaction => {
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    return { command: 'addcoins', args: [user.id, String(amount)] };
  },
  duel: interaction => {
    const user = interaction.options.getUser('user', true);
    const wager = interaction.options.getInteger('wager');
    const args = [user.id];
    if (wager != null) args.push(String(wager));
    return { command: 'duel', args };
  },
  accept: () => ({ command: 'accept', args: [] }),
  decline: () => ({ command: 'decline', args: [] }),
  teamqueue: () => ({ command: 'teamqueue', args: [] }),
  leaveteam: () => ({ command: 'leaveteam', args: [] })
};

async function runLegacySlashCommand(interaction, command, args = [], overrides = {}) {
  const ephemeral = Boolean(overrides.ephemeral);
  if (!interaction.deferred && !interaction.replied) {
    const deferOptions = ephemeral ? { flags: MessageFlags.Ephemeral } : {};
    await interaction.deferReply(deferOptions);
  }
  const message = createMessageAdapterFromInteraction(interaction, { ...overrides, ephemeral });
  try {
    await executeCommand(message, command, args);
  } catch (error) {
    console.error('Command error:', error);
    if (!interaction.replied) {
      await interaction.followUp({
        content: '❌ An error occurred while executing that command.',
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
  }
}

const FACTION_TIERS = [
  { id: 'friendly', name: 'Friendly', minRep: 0 },
  { id: 'honored', name: 'Honored', minRep: 50 },
  { id: 'exalted', name: 'Exalted', minRep: 150 }
];
const FACTION_TIER_LOOKUP = Object.fromEntries(FACTION_TIERS.map(tier => [tier.id, tier]));
const MAX_ACTIVE_CONTRACTS = 3;

function getHighestSettlementPrestige(player) {
  if (!player?.settlements) return 0;
  let highest = 0;
  Object.values(player.settlements).forEach(settlement => {
    if (settlement?.prestige && settlement.prestige > highest) highest = settlement.prestige;
  });
  return highest;
}
const COSMETIC_UNLOCKS = [
  {
    id: 'title_duelist',
    type: 'title',
    name: 'Title: Duelist',
    description: 'Unlocks after 5 duel victories.',
    condition: player => (player.stats.pvpWins || 0) >= 5
  },
  {
    id: 'title_gladiator',
    type: 'title',
    name: 'Title: Gladiator',
    description: 'Unlocks after 3 team duel victories.',
    condition: player => (player.stats.teamWins || 0) >= 3
  },
  {
    id: 'title_contract_master',
    type: 'title',
    name: 'Title: Contract Master',
    description: 'Unlocks after completing 10 faction contracts.',
    condition: player => (player.stats.contractsCompleted || 0) >= 10
  },
  {
    id: 'title_mayor',
    type: 'title',
    name: 'Title: Mayor of Orbis',
    description: 'Reach 25 prestige in any settlement.',
    condition: player => getHighestSettlementPrestige(player) >= 25
  },
  {
    id: 'title_high_steward',
    type: 'title',
    name: 'Title: High Steward',
    description: 'Reach 60 prestige in any settlement.',
    condition: player => getHighestSettlementPrestige(player) >= 60
  }
];
const fallbackBaseUpgradeData = {
  ranks: [
    {
      level: 1,
      name: 'Frontier Outpost',
      storageBonus: 0,
      incidentDefense: 0.05,
      unlocks: ['storage', 'extractor']
    },
    {
      level: 2,
      name: 'Settled Camp',
      storageBonus: 40,
      incidentDefense: 0.08,
      unlocks: ['workshop', 'farm', 'portal'],
      cost: { coins: 350, materials: { ancient_bark: 12, aurora_fragment: 8 } }
    }
  ],
  modules: [
    {
      id: 'storage',
      name: 'Staging Warehouse',
      category: 'infrastructure',
      startLevel: 1,
      maxLevel: 3,
      levels: {
        '1': { capacity: 160, summary: 'Base storage capacity 160.' },
        '2': { capacity: 220, summary: 'Capacity 220.', cost: { coins: 220 } },
        '3': { capacity: 280, summary: 'Capacity 280.', cost: { coins: 320 } }
      }
    },
    {
      id: 'extractor',
      name: 'Resource Extractor',
      category: 'automation',
      startLevel: 0,
      maxLevel: 3,
      levels: {
        '1': { rate: 1, summary: 'One automated gather roll per minute.', cost: { coins: 260 } },
        '2': { rate: 2, summary: 'Two rolls per minute.', cost: { coins: 420 } },
        '3': { rate: 3, summary: 'Three rolls per minute.', cost: { coins: 620 } }
      }
    }
  ]
};

const BASE_UPGRADE_DATA = loadDataFile('base_upgrades.json', fallbackBaseUpgradeData);
const {
  ranks: BASE_RANKS,
  rankMap: BASE_RANK_MAP,
  moduleDefaults: BASE_MODULE_DEFAULTS,
  modules: BASE_UPGRADE_DEFINITIONS
} = normalizeBaseUpgrades(BASE_UPGRADE_DATA);

const DEFAULT_SETTLEMENT_BUILDINGS = {
  hearth: { id: 'hearth', name: 'Village Hearth', effects: { happiness: 6 } },
  storeroom: { id: 'storeroom', name: 'Storeroom', effects: { bonuses: { storageBonus: 0.25 } } },
  market: { id: 'market', name: 'Market Square', effects: { wealth: 40, bonuses: { wealthBonus: 0.05 } } },
  watchtower: { id: 'watchtower', name: 'Watchtower', effects: { garrison: 6, bonuses: { combatBonus: 0.05 } } },
  workshop: { id: 'workshop', name: 'Workshop', effects: { bonuses: { contractRewardBonus: 0.04 } } },
  ritual_grove: { id: 'ritual_grove', name: 'Ritual Grove', effects: { happiness: 4, bonuses: { knowledgeBoost: 0.06 } } },
  farm: { id: 'farm', name: 'Farm Plots', effects: { production: { verdant_pollen: 1, fen_root: 1 } } },
  portal_circle: { id: 'portal_circle', name: 'Portal Circle', effects: { bonuses: { fastTravel: 0.1, expeditionBonus: 0.04 } } },
  barracks: { id: 'barracks', name: 'Barracks', effects: { garrison: 10, bonuses: { combatBonus: 0.08 } } },
  forge: { id: 'forge', name: 'Forge', effects: { production: { skybreaker_alloy: 1 }, bonuses: { wealthBonus: 0.04 } } },
  embassy: { id: 'embassy', name: 'Embassy', effects: { bonuses: { diplomacyBonus: 0.08 } } },
  ritual_vault: { id: 'ritual_vault', name: 'Ritual Vault', effects: { bonuses: { knowledgeBoost: 0.08, expeditionBonus: 0.05 } } },
  armory: { id: 'armory', name: 'Armory', effects: { garrison: 8, bonuses: { combatBonus: 0.06, defenseBonus: 0.05 } } },
  hospital: { id: 'hospital', name: 'Field Hospital', effects: { happiness: 5, bonuses: { recoveryBonus: 0.06 } } },
  brewery: { id: 'brewery', name: 'Brewery', effects: { production: { grove_tonic: 1 }, happiness: 3 } },
  observatory: { id: 'observatory', name: 'Observatory', effects: { bonuses: { knowledgeBoost: 0.08 } } },
  farmland: { id: 'farmland', name: 'Terraced Farmland', effects: { production: { wildvine_bloom: 1, verdant_pollen: 1 } } },
  songgrove_stage: { id: 'songgrove_stage', name: 'Songgrove Stage', effects: { happiness: 8, bonuses: { expeditionBonus: 0.04 } } },
  sapling_nursery: { id: 'sapling_nursery', name: 'Sapling Nursery', effects: { population: 2, production: { ancient_bark: 1 } } },
  aetheric_laboratory: { id: 'aetheric_laboratory', name: 'Aetheric Laboratory', effects: { bonuses: { knowledgeBoost: 0.1 } } },
  skysong_auditorium: { id: 'skysong_auditorium', name: 'Skysong Auditorium', effects: { happiness: 7, bonuses: { diplomacyBonus: 0.06 } } },
  stormkeep_bastion: { id: 'stormkeep_bastion', name: 'Stormkeep Bastion', effects: { garrison: 12, bonuses: { defenseBonus: 0.08, combatBonus: 0.06 } } },
  thunderhead_foundry: { id: 'thunderhead_foundry', name: 'Thunderhead Foundry', effects: { production: { stormcore_shard: 1 }, bonuses: { wealthBonus: 0.05 } } },
  sandship_dock: { id: 'sandship_dock', name: 'Sandship Dock', effects: { wealth: 50, bonuses: { expeditionBonus: 0.06 } } },
  mirage_atelier: { id: 'mirage_atelier', name: 'Mirage Atelier', effects: { happiness: 5, bonuses: { wealthBonus: 0.04, knowledgeBoost: 0.04 } } },
  glacier_sanctum: { id: 'glacier_sanctum', name: 'Glacier Sanctum', effects: { bonuses: { knowledgeBoost: 0.1, expeditionBonus: 0.05 } } },
  aurora_observatory: { id: 'aurora_observatory', name: 'Aurora Observatory', effects: { bonuses: { knowledgeBoost: 0.08, diplomacyBonus: 0.04 } } }
};
const DEFAULT_SETTLEMENT_DECISIONS = {
  welcome_trader: {
    id: 'welcome_trader',
    name: 'Welcome Traders',
    description: 'Itinerant traders seek entry. How should the settlement respond?',
    options: [
      { id: 'welcome', label: 'Welcome them warmly', effect: { wealth: 80, happiness: 4, bonuses: { wealthBonus: 0.02 } } },
      { id: 'screen', label: 'Screen and tax the caravans', effect: { wealth: 120, happiness: -4, garrison: 2 } }
    ]
  },
  festival_plans: {
    id: 'festival_plans',
    name: 'Festival Plans',
    description: 'Villagers want to host a celebration.',
    options: [
      { id: 'sponsor', label: 'Sponsor the celebration', cost: { coins: 120 }, effect: { happiness: 10, prestige: 3 } },
      { id: 'delay', label: 'Delay until supplies improve', effect: { happiness: -4, wealth: 60 } }
    ]
  },
  trork_raiders: {
    id: 'trork_raiders',
    name: 'Trork Raiders',
    description: 'Scouts spot Trork raiders near the grove.',
    options: [
      { id: 'mobilise', label: 'Mobilise defenders', effect: { garrison: 6, prestige: 2 } },
      { id: 'bribe', label: 'Bribe them to leave', cost: { coins: 90 }, effect: { wealth: -90, happiness: 3 } }
    ]
  },
  celebration_boon: {
    id: 'celebration_boon',
    name: 'Celebration Boon',
    description: 'A visiting troupe offers blessings during a celebration.',
    options: [
      { id: 'accept', label: 'Accept the blessing', effect: { happiness: 6, bonuses: { expeditionBonus: 0.03 } } },
      { id: 'decline', label: 'Decline politely', effect: { prestige: 1 } }
    ]
  },
  scribe_request: {
    id: 'scribe_request',
    name: 'Scribe Request',
    description: 'Scribes petition for additional resources.',
    options: [
      { id: 'fund', label: 'Fund the effort', cost: { coins: 150 }, effect: { knowledge: 16, prestige: 2 } },
      { id: 'deny', label: 'Deny for now', effect: { happiness: -3, wealth: 70 } }
    ]
  },
  storm_front: {
    id: 'storm_front',
    name: 'Storm Front',
    description: 'A brewing storm could be harnessed or weathered.',
    options: [
      { id: 'harness', label: 'Harness the storm', effect: { bonuses: { knowledgeBoost: 0.05 }, wealth: 80 } },
      { id: 'fortify', label: 'Fortify defenses', effect: { garrison: 8, bonuses: { defenseBonus: 0.05 } } }
    ]
  },
  lost_archive: {
    id: 'lost_archive',
    name: 'Lost Archive',
    description: 'Recovered archive fragments need decisions.',
    options: [
      { id: 'study', label: 'Study the fragments', effect: { knowledge: 18, prestige: 4 } },
      { id: 'trade', label: 'Trade to allies', effect: { wealth: 140, reputation: { skysong: 4 } } }
    ]
  },
  war_council: {
    id: 'war_council',
    name: 'War Council',
    description: 'Commanders debate launching an offensive.',
    options: [
      { id: 'strike', label: 'Approve the strike', effect: { prestige: 5, garrison: -6, bonuses: { combatBonus: 0.04 } } },
      { id: 'hold', label: 'Hold position', effect: { defenseBonus: 0.05, happiness: 2 } }
    ]
  },
  supply_shortage: {
    id: 'supply_shortage',
    name: 'Supply Shortage',
    description: 'Supplies run low after recent patrols.',
    options: [
      { id: 'ration', label: 'Ration supplies', effect: { happiness: -4, garrison: 4 } },
      { id: 'import', label: 'Import goods', cost: { coins: 160 }, effect: { happiness: 6 } }
    ]
  },
  recruitment_drive: {
    id: 'recruitment_drive',
    name: 'Recruitment Drive',
    description: 'Stormguard asks for fresh recruits.',
    options: [
      { id: 'enlist', label: 'Enlist volunteers', effect: { garrison: 10, prestige: 3 } },
      { id: 'decline', label: 'Decline politely', effect: { happiness: 3 } }
    ]
  },
  defense_drill: {
    id: 'defense_drill',
    name: 'Defense Drill',
    description: 'Regular drills keep defenses sharp.',
    options: [
      { id: 'intensive', label: 'Run intensive drills', effect: { garrison: 6, happiness: -3, bonuses: { defenseBonus: 0.04 } } },
      { id: 'light', label: 'Light exercises', effect: { happiness: 2 } }
    ]
  }
};

const fallbackSettlementTemplates = [
  {
    id: 'kweebec_village',
    name: 'Kweebec Village',
    faction: 'kweebec',
    baseBuildings: ['hearth', 'storeroom'],
    possibleBuildings: ['workshop', 'ritual_grove', 'market', 'watchtower'],
    population: { min: 10, max: 20 },
    decisionTable: ['welcome_trader', 'festival_plans'],
    traits: ['agrarian']
  }
];
const SETTLEMENT_SOURCE_DATA = loadDataFile('settlements.json', fallbackSettlementTemplates);
const {
  templates: SETTLEMENT_TEMPLATES,
  templateLookup: SETTLEMENT_TEMPLATE_LOOKUP,
  decisions: TEMPLATE_DECISIONS,
  expeditionProfiles: TEMPLATE_EXPEDITION_PROFILES
} = normalizeSettlementsData(SETTLEMENT_SOURCE_DATA, DEFAULT_SETTLEMENT_DECISIONS);

const SETTLEMENT_DECISIONS = { ...DEFAULT_SETTLEMENT_DECISIONS, ...TEMPLATE_DECISIONS };
const SETTLEMENT_BUILDINGS = DEFAULT_SETTLEMENT_BUILDINGS;
const PENDING_SETTLEMENT_EXPEDITION_PROFILES = TEMPLATE_EXPEDITION_PROFILES;

const fallbackExplorationMeta = {
  globalDefaults: {
    actionDurations: {
      travel_minor: 5,
      travel_major: 10,
      forage: 4,
      mine: 5,
      scavenge: 5,
      survey: 4
    },
    suddenCombat: {
      baseChance: 0.18,
      escalateAfterMinutes: 20,
      escalationBonus: 0.05,
      maximumChance: 0.45
    }
  }
};
const EXPLORATION_META = loadDataFile('exploration_overhaul.json', fallbackExplorationMeta);
const EXPLORATION_GLOBAL_DEFAULTS = EXPLORATION_META.globalDefaults || {};
const EXPLORATION_ACTION_DURATIONS = buildActionDurationMap(EXPLORATION_GLOBAL_DEFAULTS.actionDurations);
const EXPLORATION_SUDDEN_COMBAT_RULES = buildSuddenCombatRules(EXPLORATION_GLOBAL_DEFAULTS.suddenCombat);
const EXPLORATION_EVENT_WEIGHTS = { ...(EXPLORATION_GLOBAL_DEFAULTS.eventWeights || {}) };
const EXPLORATION_ACTION_CHAINS = buildActionChains(
  Array.isArray(EXPLORATION_META.actionChains) ? EXPLORATION_META.actionChains : (EXPLORATION_GLOBAL_DEFAULTS.actionChains || [])
);
const EXPLORATION_META_BIOME_LOOKUP = {};

function normalizeBaseUpgrades(raw = {}) {
  const ranks = Array.isArray(raw.ranks)
    ? raw.ranks.map(rank => ({
        level: Number(rank.level ?? 0) || 1,
        name: rank.name || `Rank ${rank.level || 1}`,
        description: rank.description || '',
        storageBonus: Number(rank.storageBonus || 0),
        incidentDefense: Number(rank.incidentDefense || 0),
        unlocks: Array.isArray(rank.unlocks) ? [...rank.unlocks] : [],
        cost: normalizeCost(rank.cost)
      }))
    : [];
  const rankMap = {};
  ranks.forEach(rank => {
    rankMap[rank.level] = rank;
  });

  const moduleDefaults = {};
  const modules = {};
  if (Array.isArray(raw.modules)) {
    raw.modules.forEach(module => {
      const normalized = createModuleDefinition(module);
      modules[normalized.id] = normalized;
      moduleDefaults[normalized.id] = normalized.startLevel;
    });
  }

  return { ranks, rankMap, moduleDefaults, modules };
}
function createModuleDefinition(module = {}) {
  const id = module.id || (module.name ? module.name.toLowerCase().replace(/\s+/g, '_') : undefined);
  if (!id) {
    throw new Error('Base module definition is missing an id.');
  }
  const levelEntries = {};
  Object.entries(module.levels || {}).forEach(([levelKey, levelValue]) => {
    const level = Number(levelKey);
    if (!Number.isFinite(level)) return;
    const normalized = {
      level,
      summary: levelValue.summary || '',
      capacity: Number(levelValue.capacity || levelValue.storage || 0),
      rate: Number(levelValue.rate || 0),
      bonuses: { ...(levelValue.bonuses || {}) },
      outputs: Array.isArray(levelValue.outputs) ? levelValue.outputs.map(entry => ({ ...entry })) : [],
      conversions: Array.isArray(levelValue.conversions) ? levelValue.conversions.map(entry => ({ ...entry })) : [],
      cost: normalizeCost(levelValue.cost),
      requires: normalizeModuleRequirement(levelValue.requires)
    };
    levelEntries[level] = normalized;
  });

  const startLevel = Number.isFinite(module.startLevel) ? module.startLevel : 0;
  const maxLevel = Number.isFinite(module.maxLevel) ? module.maxLevel : Math.max(...Object.keys(levelEntries).map(Number), startLevel);

  return {
    id,
    name: module.name || id,
    category: module.category || 'general',
    description: module.description || '',
    startLevel,
    maxLevel,
    levels: levelEntries,
    getLevel(level) {
      return levelEntries[Number(level)] || null;
    },
    capacity(level) {
      const data = this.getLevel(level);
      return data ? Number(data.capacity || 0) : 0;
    },
    rate(level) {
      const data = this.getLevel(level);
      return data ? Number(data.rate || 0) : 0;
    }
  };
}
function normalizeModuleRequirement(requires) {
  if (!requires || typeof requires !== 'object') return null;
  const normalized = {};
  if (requires.baseRank != null) normalized.baseRank = Number(requires.baseRank);
  if (requires.modules && typeof requires.modules === 'object') {
    normalized.modules = {};
    Object.entries(requires.modules).forEach(([moduleId, level]) => {
      if (!moduleId) return;
      normalized.modules[moduleId] = Number(level || 0);
    });
  }
  return normalized;
}
function normalizeCost(cost) {
  if (!cost || typeof cost !== 'object') return null;
  const normalized = {};
  if (cost.coins != null) normalized.coins = Math.max(0, Math.floor(Number(cost.coins)));
  if (cost.materials && typeof cost.materials === 'object') {
    const materials = {};
    Object.entries(cost.materials).forEach(([item, amount]) => {
      if (!item) return;
      const qty = Math.max(0, Math.floor(Number(amount)));
      if (qty > 0) materials[item] = qty;
    });
    if (Object.keys(materials).length > 0) normalized.materials = materials;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}
function normalizeSettlementsData(rawTemplates, defaultDecisions = {}) {
  const templates = [];
  const templateLookup = {};
  const decisionMap = {};
  const expeditionProfiles = {};

  if (!Array.isArray(rawTemplates)) {
    return { templates, templateLookup, decisions: decisionMap, expeditionProfiles };
  }

  rawTemplates.forEach(template => {
    if (!template?.id) return;
    const id = template.id;
    const baseBuildings = cloneStringArray(template.baseBuildings);
    const possibleBuildings = cloneStringArray(template.possibleBuildings);
    const traits = cloneStringArray(template.traits);
    const decisionTable = cloneStringArray(template.decisionTable);
    const population = template.population ? { ...template.population } : {};
    const buildQueues = {
      core: cloneStringArray(template.buildQueues?.core),
      optional: cloneStringArray(template.buildQueues?.optional),
      factionExclusive: cloneStringArray(template.buildQueues?.factionExclusive)
    };

    const governance = template.governance
      ? {
          ...template.governance,
          defaultPolicies: Array.isArray(template.governance.defaultPolicies)
            ? template.governance.defaultPolicies.map(policy => ({
                ...policy,
                cost: normalizeCost(policy.cost),
                effect: policy.effect ? JSON.parse(JSON.stringify(policy.effect)) : undefined
              }))
            : [],
          storyMoments: Array.isArray(template.governance.storyMoments)
            ? template.governance.storyMoments.map(moment => {
                if (moment?.id) {
                  decisionMap[moment.id] = {
                    ...moment,
                    options: Array.isArray(moment.options)
                      ? moment.options.map(option => ({
                          ...option,
                          cost: normalizeCost(option.cost),
                          effect: option.effect ? JSON.parse(JSON.stringify(option.effect)) : undefined
                        }))
                      : []
                  };
                }
                return { ...moment };
              })
            : []
        }
      : undefined;

    const expeditionProfileList = Array.isArray(template.expeditionProfiles)
      ? template.expeditionProfiles.map(profile => {
          if (profile?.id) {
            const normalizedProfile = {
              ...profile,
              durationRangeMinutes: cloneNumericRange(profile.durationRangeMinutes),
              recommendedVillagers: cloneStringArray(profile.recommendedVillagers),
              successModifiers: profile.successModifiers ? JSON.parse(JSON.stringify(profile.successModifiers)) : undefined,
              rewardPreview: profile.rewardPreview ? JSON.parse(JSON.stringify(profile.rewardPreview)) : undefined,
              rareOutcome: profile.rareOutcome ? JSON.parse(JSON.stringify(profile.rareOutcome)) : undefined
            };
            expeditionProfiles[profile.id] = normalizedProfile;
            return normalizedProfile;
          }
          return { ...profile };
        })
      : [];

    const templateCopy = {
      ...template,
      id,
      baseBuildings,
      possibleBuildings,
      traits,
      decisionTable,
      population,
      buildQueues,
      governance,
      expeditionProfiles: expeditionProfileList
    };

    templates.push(templateCopy);
    templateLookup[id.toLowerCase()] = templateCopy;

    const referencedBuildings = new Set([
      ...baseBuildings,
      ...possibleBuildings,
      ...buildQueues.core,
      ...buildQueues.optional,
      ...buildQueues.factionExclusive
    ]);
    referencedBuildings.forEach(ensureSettlementBuildingPlaceholder);

    decisionTable.forEach(decisionId => {
      if (!decisionId) return;
      if (!defaultDecisions[decisionId] && !decisionMap[decisionId]) {
        decisionMap[decisionId] = {
          id: decisionId,
          name: decisionId.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
          description: '',
          options: []
        };
      }
    });
  });

  return { templates, templateLookup, decisions: decisionMap, expeditionProfiles };
}
function mergeExpeditionProfiles(profileMap = {}) {
  if (!profileMap || typeof profileMap !== 'object') return;
  Object.entries(profileMap).forEach(([expeditionId, profile]) => {
    if (!expeditionId) return;
    const target = SETTLEMENT_EXPEDITIONS[expeditionId] || (SETTLEMENT_EXPEDITIONS[expeditionId] = { id: expeditionId, name: expeditionId });
    if (profile.name && !target.name) target.name = profile.name;
    if (profile.type) target.type = profile.type;
    if (Array.isArray(profile.durationRangeMinutes)) target.durationRangeMinutes = profile.durationRangeMinutes.map(Number);
    if (Array.isArray(profile.recommendedVillagers)) target.recommendedVillagers = [...profile.recommendedVillagers];
    if (profile.successModifiers) target.successModifiers = JSON.parse(JSON.stringify(profile.successModifiers));
    if (profile.rewardPreview) target.rewardPreview = JSON.parse(JSON.stringify(profile.rewardPreview));
    if (profile.rareOutcome) target.rareOutcome = JSON.parse(JSON.stringify(profile.rareOutcome));
  });
}
function buildActionDurationMap(rawDurations = {}) {
  const defaults = {
    travel_minor: 5,
    travel_major: 11,
    forage: 4,
    mine: 5,
    scavenge: 6,
    survey: 4,
    camp_assault: 8,
    den_scavenge: 7,
    ritual: 9,
    harvest: 6,
    farming: 10,
    artifact_run: 12,
    boss_hunt: 18
  };
  Object.entries(rawDurations || {}).forEach(([action, minutes]) => {
    const value = Number(minutes);
    if (Number.isFinite(value) && value > 0) defaults[action] = value;
  });
  return defaults;
}
function buildSuddenCombatRules(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { baseChance: 0.18, escalateAfterMinutes: 20, escalationBonus: 0.05, maximumChance: 0.45 };
  }
  return {
    baseChance: Number(raw.baseChance || 0.18),
    escalateAfterMinutes: Number(raw.escalateAfterMinutes || 20),
    escalationBonus: Number(raw.escalationBonus || 0.05),
    maximumChance: Number(raw.maximumChance || 0.45)
  };
}
function buildActionChains(rawChains = []) {
  const chains = new Map();
  rawChains.forEach(chain => {
    if (!chain?.id || !Array.isArray(chain.steps)) return;
    const key = chain.id.toLowerCase();
    chains.set(key, chain.steps.map(step => ({
      action: step.action,
      durationMinutes: Number(step.durationMinutes || EXPLORATION_ACTION_DURATIONS[step.action] || 5),
      metadata: step.metadata ? { ...step.metadata } : undefined
    })));
  });
  return chains;
}
function applyExplorationMetaToBiomes(metaBiomes = []) {
  metaBiomes.forEach(meta => {
    if (!meta || !meta.id) return;
    const key = meta.id.toLowerCase();
    EXPLORATION_META_BIOME_LOOKUP[key] = meta;
    let biome = BIOME_LOOKUP?.[key];
    if (!biome) {
      biome = {
        id: meta.id,
        name: meta.name || meta.id,
        description: meta.description || '',
        travel: { baseMinutes: EXPLORATION_GLOBAL_DEFAULTS.travelMinutes || 5, neighbors: [] },
        resources: {},
        encounters: { combat: [], events: [] }
      };
      if (typeof EXPLORATION_BIOMES?.push === 'function') {
        EXPLORATION_BIOMES.push(biome);
      }
      if (BIOME_LOOKUP) {
        BIOME_LOOKUP[key] = biome;
      }
    }

    if (meta.actionDurations) biome.actionDurations = { ...meta.actionDurations };
    if (Number.isFinite(meta.travelDifficulty)) {
      biome.travel = biome.travel || {};
      biome.travel.difficulty = Number(meta.travelDifficulty);
    }
    if (Array.isArray(meta.activities)) {
      biome.activities = meta.activities.map(activity => ({ ...activity }));
    }
    if (meta.materials) {
      biome.materials = JSON.parse(JSON.stringify(meta.materials));
    }
    if (Array.isArray(meta.oneOffMoments)) {
      biome.oneOffMoments = meta.oneOffMoments.map(moment => ({ ...moment }));
    }

    biome.encounters = biome.encounters || {};
    biome.encounters.combat = Array.isArray(biome.encounters.combat) ? biome.encounters.combat : [];
    biome.encounters.events = Array.isArray(biome.encounters.events) ? biome.encounters.events : [];

    if (Array.isArray(meta.enemyCamps)) {
      biome.enemyCamps = meta.enemyCamps.map(camp => ({ ...camp }));
      meta.enemyCamps.forEach((camp, index) => {
        const campId = camp.id || `${meta.id}_camp_${index}`;
        if (!biome.encounters.events.some(evt => evt.id === campId)) {
          biome.encounters.events.push({
            id: campId,
            type: 'camp',
            camp,
            chance: Number(camp.chance ?? EXPLORATION_EVENT_WEIGHTS.camp ?? 0.16)
          });
        }
        if (Array.isArray(camp.encounters)) {
          camp.encounters.forEach(enemyId => {
            if (!enemyId) return;
            if (!biome.encounters.combat.some(entry => entry.enemy === enemyId)) {
              biome.encounters.combat.push({ enemy: enemyId, chance: 0.2 });
            }
          });
        }
      });
    }

    if (Array.isArray(meta.uniqueStructures)) {
      biome.uniqueStructures = meta.uniqueStructures.map(structure => ({ ...structure }));
      meta.uniqueStructures.forEach((structure, index) => {
        const structureId = structure.id || `${meta.id}_unique_${index}`;
        if (biome.encounters.events.some(evt => evt.id === structureId)) return;
        const eventType = structure.category === 'puzzle'
          ? 'puzzle'
          : structure.category === 'rare_unique'
            ? 'rare_unique'
            : 'structure';
        biome.encounters.events.push({
          id: structureId,
          type: eventType,
          structure: structure.id,
          reward: structure.reward,
          metadata: { unique: true, rewardTags: structure.rewardTags, cooldownHours: structure.cooldownHours },
          chance: Number(structure.chance ?? EXPLORATION_EVENT_WEIGHTS[eventType] ?? 0.14)
        });
      });
    }
  });
}
function cloneStringArray(list) {
  return Array.isArray(list) ? list.filter(entry => entry != null).map(entry => String(entry)) : [];
}

function cloneNumericRange(range) {
  if (!Array.isArray(range) || range.length === 0) return undefined;
  return range.map(value => Number(value));
}
function ensureSettlementBuildingPlaceholder(buildingId) {
  if (!buildingId || DEFAULT_SETTLEMENT_BUILDINGS[buildingId]) return;
  const label = buildingId
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  DEFAULT_SETTLEMENT_BUILDINGS[buildingId] = { id: buildingId, name: label, effects: {} };
}
function applySettlementEffects(player, settlement, effects = {}) {
  if (!settlement || !effects || typeof effects !== 'object') return;
  settlement.happiness = clampNumber((settlement.happiness ?? 0) + Number(effects.happiness || 0), 0, 100);
  settlement.wealth = Math.max(0, (settlement.wealth ?? 0) + Number(effects.wealth || 0));
  settlement.garrison = Math.max(0, (settlement.garrison ?? 0) + Number(effects.garrison || 0));

  if (effects.population != null) {
    const template = settlement.templateId ? SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()] : null;
    const maxPopulation = template?.population?.max;
    settlement.population = Math.max(0, (settlement.population ?? 0) + Number(effects.population));
    if (Number.isFinite(maxPopulation)) {
      settlement.population = Math.min(maxPopulation, settlement.population);
    }
  }

  if (effects.production && typeof effects.production === 'object') {
    settlement.production = settlement.production || {};
    Object.entries(effects.production).forEach(([item, amount]) => {
      if (!item) return;
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0) return;
      settlement.production[item] = (settlement.production[item] || 0) + value;
    });
  }

  if (effects.stockpile && typeof effects.stockpile === 'object') {
    settlement.stockpile = settlement.stockpile || {};
    Object.entries(effects.stockpile).forEach(([item, amount]) => {
      if (!item) return;
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0) return;
      settlement.stockpile[item] = (settlement.stockpile[item] || 0) + value;
    });
  }

  if (effects.bonuses && typeof effects.bonuses === 'object') {
    settlement.bonuses = settlement.bonuses || {};
    Object.entries(effects.bonuses).forEach(([bonusKey, amount]) => {
      if (amount == null) return;
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0) return;
      settlement.bonuses[bonusKey] = (settlement.bonuses[bonusKey] || 0) + value;
    });
  }

  if (effects.prestige != null) {
    adjustSettlementPrestige(settlement, Number(effects.prestige), player);
  }

  if (effects.reputation && player) {
    Object.entries(effects.reputation).forEach(([factionId, amount]) => {
      if (!factionId) return;
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0) return;
      adjustFactionReputation(player, factionId, value);
    });
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
}

function getSuddenCombatChance(exploration) {
  const rules = EXPLORATION_SUDDEN_COMBAT_RULES || {};
  const base = Number.isFinite(rules.baseChance) ? rules.baseChance : 0.18;
  const escalationBonus = Number.isFinite(rules.escalationBonus) ? rules.escalationBonus : 0.05;
  const max = Number.isFinite(rules.maximumChance) ? rules.maximumChance : 0.5;
  const streak = Math.max(0, exploration?.consecutiveActionsSinceCombat || 0);
  const escalateAfter = Number.isFinite(rules.escalateAfterMinutes) ? rules.escalateAfterMinutes : 0;
  let timeFactor = 0;
  if (!exploration?.lastCombatAt) {
    timeFactor = 1;
  } else if (escalateAfter > 0) {
    const elapsedMinutes = (Date.now() - exploration.lastCombatAt) / 60_000;
    if (elapsedMinutes > escalateAfter) {
      timeFactor = Math.floor((elapsedMinutes - escalateAfter) / escalateAfter) + 1;
    }
  }
  const chance = base + (streak + timeFactor) * escalationBonus;
  return Math.min(max, Math.max(0, chance));
}

function shouldTriggerSuddenCombat(exploration) {
  return Math.random() < getSuddenCombatChance(exploration);
}

function recalcPlayerBaseBonuses(player) {
  const totals = {
    contractRewardBonus: 0,
    settlementWealthBonus: 0,
    settlementDefenseBonus: 0,
    brewSuccessBonus: 0
  };
  Object.values(player?.bases || {}).forEach(base => {
    recalcBaseBonuses(base);
    const bonus = base.bonuses || {};
    totals.contractRewardBonus += bonus.contractRewardBonus || 0;
    totals.settlementWealthBonus += bonus.settlementWealthBonus || 0;
    totals.settlementDefenseBonus += bonus.settlementDefenseBonus || 0;
    totals.brewSuccessBonus += bonus.brewSuccessBonus || 0;
  });
  player.baseBonuses = totals;
  return totals;
}
const SETTLEMENT_PRESTIGE_TIERS = [
  { id: 'nascent', name: 'Nascent', min: 0, bonus: null },
  { id: 'notable', name: 'Notable', min: 10, bonus: { wealthMultiplier: 1.05 } },
  { id: 'renowned', name: 'Renowned', min: 30, bonus: { successChance: 0.03 } },
  { id: 'illustrious', name: 'Illustrious', min: 60, bonus: { successChance: 0.05, wealthMultiplier: 1.1 } },
  { id: 'legendary', name: 'Legendary', min: 100, bonus: { successChance: 0.08, wealthMultiplier: 1.15 } }
];

function getSettlementPrestigeTier(prestige) {
  let current = SETTLEMENT_PRESTIGE_TIERS[0];
  for (const tier of SETTLEMENT_PRESTIGE_TIERS) {
    if (prestige >= tier.min) current = tier;
    else break;
  }
  return current;
}

function adjustSettlementPrestige(settlement, amount, player) {
  if (!settlement || !Number.isFinite(amount) || amount === 0) return;
  const previousPrestige = settlement.prestige || 0;
  const previousTier = settlement.prestigeTier || getSettlementPrestigeTier(previousPrestige).id;
  settlement.prestige = Math.max(0, Math.round(previousPrestige + amount));
  const tier = getSettlementPrestigeTier(settlement.prestige);
  settlement.prestigeTier = tier.id;
  if (tier.id !== previousTier) {
    settlement.lastPrestigeTierChange = Date.now();
  }
  if (player) {
    player.stats.maxSettlementPrestige = Math.max(player.stats.maxSettlementPrestige || 0, settlement.prestige);
  }
}
// ==================== HELPER FUNCTIONS ====================
function getPlayer(userId) {
  if (!playerData.has(userId)) {
    playerData.set(userId, {
      level: 1,
      xp: 0,
      hp: 100,
      maxHp: 100,
      mana: 50,
      maxMana: 50,
      coins: 100,
      inventory: { 'wooden_sword': 1, 'health_potion': 2, 'rusty_multi_tool': 1 },
      equipped: { weapon: 'wooden_sword', armor: null, accessory: null },
      quests: [],
      completedQuests: [],
      questProgress: {},
      achievements: { claimed: [], notified: [] },
      attributes: { power: 10, agility: 8, resilience: 8, focus: 6 },
      stats: {
        kills: 0,
        deaths: 0,
        gamesPlayed: 0,
        crafted: 0,
        dungeonsCleared: 0,
        questsStarted: 0,
        questsCompleted: 0,
        codexUnlocks: 0,
        factionsAssisted: {},
        eventsParticipated: 0,
        brewsCrafted: 0,
        brewsConsumed: 0,
        pvpWins: 0,
        pvpLosses: 0,
        teamWins: 0,
        teamLosses: 0,
        contractsCompleted: 0,
        maxSettlementPrestige: 0,
        settlementsManaged: 0,
        basesClaimed: 0,
        baseRankUps: 0,
        baseModulesUpgraded: 0
      },
      codex: { factions: [], biomes: [], enemies: [], items: [], dungeons: [], structures: [], settlements: [] },
      reputation: {},
      activeBuffs: {},
      contracts: {},
      cosmetics: { titles: { owned: [], equipped: null } },
      exploration: {
        currentBiome: 'emerald_grove',
        targetBiome: null,
        status: 'idle',
        action: null,
        discoveredBiomes: ['emerald_grove'],
        lastTick: Date.now()
      },
      bases: {},
      settlements: {},
      travelHistory: []
    });
  }
  const player = playerData.get(userId);
  if (!player.achievements) player.achievements = { claimed: [], notified: [] };
  if (!player.attributes) player.attributes = { power: 10, agility: 8, resilience: 8, focus: 6 };
  if (!player.stats) player.stats = {
    kills: 0,
    deaths: 0,
    gamesPlayed: 0,
    crafted: 0,
    dungeonsCleared: 0,
    questsStarted: 0,
    questsCompleted: 0,
    codexUnlocks: 0,
    factionsAssisted: {},
    eventsParticipated: 0,
    brewsCrafted: 0,
    brewsConsumed: 0,
    pvpWins: 0,
    pvpLosses: 0,
    teamWins: 0,
    teamLosses: 0,
    contractsCompleted: 0,
    maxSettlementPrestige: 0,
    settlementsManaged: 0,
    basesClaimed: 0,
    baseRankUps: 0,
    baseModulesUpgraded: 0
  };
  player.stats.kills = player.stats.kills || 0;
  player.stats.deaths = player.stats.deaths || 0;
  player.stats.gamesPlayed = player.stats.gamesPlayed || 0;
  player.stats.crafted = player.stats.crafted || 0;
  player.stats.dungeonsCleared = player.stats.dungeonsCleared || 0;
  player.stats.questsStarted = player.stats.questsStarted || 0;
  player.stats.questsCompleted = player.stats.questsCompleted || 0;
  player.stats.codexUnlocks = player.stats.codexUnlocks || 0;
  player.stats.factionsAssisted = player.stats.factionsAssisted || {};
  player.stats.eventsParticipated = player.stats.eventsParticipated || 0;
  player.stats.brewsCrafted = player.stats.brewsCrafted || 0;
  player.stats.brewsConsumed = player.stats.brewsConsumed || 0;
  player.stats.pvpWins = player.stats.pvpWins || 0;
  player.stats.pvpLosses = player.stats.pvpLosses || 0;
  player.stats.teamWins = player.stats.teamWins || 0;
  player.stats.teamLosses = player.stats.teamLosses || 0;
  player.stats.contractsCompleted = player.stats.contractsCompleted || 0;
  player.stats.maxSettlementPrestige = player.stats.maxSettlementPrestige || 0;
  player.stats.settlementsManaged = player.stats.settlementsManaged || 0;
  player.stats.basesClaimed = player.stats.basesClaimed || 0;
  player.stats.baseRankUps = player.stats.baseRankUps || 0;
  player.stats.baseModulesUpgraded = player.stats.baseModulesUpgraded || 0;
  if (!player.questProgress) player.questProgress = {};
  if (!player.codex) player.codex = { factions: [], biomes: [], enemies: [], items: [], dungeons: [], structures: [], settlements: [] };
  if (!player.reputation) player.reputation = {};
  if (!player.activeBuffs) player.activeBuffs = {};
  if (!player.contracts) player.contracts = {};
  if (!player.cosmetics) player.cosmetics = { titles: { owned: [], equipped: null } };
  if (!player.cosmetics.titles) player.cosmetics.titles = { owned: [], equipped: null };
  if (!player.exploration) player.exploration = {
    currentBiome: 'emerald_grove',
    targetBiome: null,
    status: 'idle',
    action: null,
    discoveredBiomes: ['emerald_grove'],
    lastTick: Date.now()
  };
  if (!player.exploration.discoveredBiomes) player.exploration.discoveredBiomes = ['emerald_grove'];
  if (player.exploration.gathering === undefined) player.exploration.gathering = null;
  if (!player.bases) player.bases = {};
  if (!player.settlements) player.settlements = {};
  if (!player.travelHistory) player.travelHistory = [];
  if (!player.equipped) player.equipped = { weapon: 'wooden_sword', armor: null, accessory: null };
  if (player.equipped.weapon === undefined) player.equipped.weapon = 'wooden_sword';
  if (player.equipped.armor === undefined) player.equipped.armor = null;
  if (player.equipped.accessory === undefined) player.equipped.accessory = null;
  if (player.equipped.tool === undefined) player.equipped.tool = 'rusty_multi_tool';
  if (!player.settings) player.settings = {};
  if (player.settings.gatherNotifications === undefined) player.settings.gatherNotifications = true;
  if (!player.tutorials) player.tutorials = {};
  if (!player.tutorials.gathering) player.tutorials.gathering = { intro: false, completionHint: false };
  cleanupExpiredBuffs(player);
  ensureGatheringGear(player);
  return player;
}
function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function addXp(player, amount) {
  player.xp += amount;
  let leveled = false;
  while (player.xp >= xpForLevel(player.level + 1)) {
    player.xp -= xpForLevel(player.level + 1);
    player.level++;
    player.maxHp += 20;
    player.maxMana += 10;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    leveled = true;
  }
  return leveled;
}

function getItemDamage(player) {
  const weaponId = player.equipped.weapon;
  const weapon = weaponId && ITEMS[weaponId] ? ITEMS[weaponId] : null;
  if (!weapon) return 5;
  const min = weapon.damageMin || weapon.damage || 5;
  const max = weapon.damageMax || weapon.damage || min;
  return Math.round((min + max) / 2);
}
function getItemDefense(player) {
  const armorId = player.equipped.armor;
  const armor = armorId && ITEMS[armorId] ? ITEMS[armorId] : null;
  if (!armor) return 0;
  return armor.defense || 0;
}

function addItemToInventory(player, itemName, amount = 1) {
  if (!ITEMS[itemName]) return false;
  player.inventory[itemName] = (player.inventory[itemName] || 0) + amount;
  return true;
}

function removeItemFromInventory(player, itemName, amount = 1) {
  if (!player.inventory[itemName] || player.inventory[itemName] < amount) return false;
  player.inventory[itemName] -= amount;
  if (player.inventory[itemName] <= 0) delete player.inventory[itemName];
  return true;
}

function hasRequiredIngredients(player, ingredients) {
  const missing = [];
  for (const [item, quantity] of Object.entries(ingredients)) {
    if (!player.inventory[item] || player.inventory[item] < quantity) {
      missing.push({ item, required: quantity, have: player.inventory[item] || 0 });
    }
  }
  return missing;
}
function rollMaterialDrops(player) {
  const lootRewards = [];
  const modifiers = getBrewModifiers(player);
  const lootBonus = modifiers.lootBonus || 0;
  MATERIAL_DROPS.forEach(drop => {
    const adjustedChance = Math.min(0.95, drop.chance + (player.level * 0.01) + lootBonus);
    if (Math.random() < adjustedChance) {
      const quantity = Math.floor(Math.random() * (drop.max - drop.min + 1)) + drop.min;
      addItemToInventory(player, drop.item, quantity);
      const itemData = ITEMS[drop.item];
      const label = `${itemData ? itemData.emoji + ' ' : ''}${drop.item} x${quantity}`;
      lootRewards.push({ itemId: drop.item, quantity, label });
    }
  });
  return lootRewards;
}
function rollCustomLoot(player, lootTable = []) {
  const rewards = [];
  lootTable.forEach(entry => {
    if (!entry?.item) return;
    const chance = Number(entry.chance || 0);
    if (Math.random() < chance) {
      const min = Math.max(1, entry.min || entry.amount || 1);
      const max = entry.max || min;
      const quantity = Math.floor(Math.random() * (max - min + 1)) + min;
      addItemToInventory(player, entry.item, quantity);
      const itemData = ITEMS[entry.item];
      const label = `${itemData ? itemData.emoji + ' ' : ''}${entry.item} x${quantity}`;
      rewards.push({ itemId: entry.item, quantity, label });
    }
  });
  return rewards;
}
function generateDungeonRun(player, dungeonId) {
  const playerLevel = Math.max(1, player.level || 1);
  const eligible = DUNGEON_DEFINITIONS.filter(def => !def.minLevel || playerLevel >= def.minLevel);
  const template = dungeonId ? resolveDungeon(dungeonId) : eligible[Math.floor(Math.random() * Math.max(eligible.length, 1))];
  if (!template) return null;

  const runFloors = (template.floors || []).map((floor, index) => {
    const baseHp = floor.baseHp || 120;
    const hpPerLevel = floor.hpPerLevel || 15;
    const baseDamage = floor.baseDamage || 18;
    const damagePerLevel = floor.damagePerLevel || 2.5;
    const baseXp = floor.baseXp || 150;
    const xpPerLevel = floor.xpPerLevel || 15;
    const baseCoins = floor.baseCoins || 140;
    const coinsPerLevel = floor.coinsPerLevel || 10;

    const hp = Math.round(baseHp + hpPerLevel * playerLevel);
    const damage = Math.round(baseDamage + damagePerLevel * playerLevel);
    const xp = Math.round(baseXp + xpPerLevel * playerLevel);
    const coins = Math.round(baseCoins + coinsPerLevel * playerLevel);

    return {
      index,
      name: floor.name || `Floor ${index + 1}`,
      emoji: floor.emoji || '❔',
      description: floor.description || '',
      ability: floor.ability || null,
      boss: !!floor.boss,
      relic: floor.relic || null,
      lootTable: Array.isArray(floor.loot) ? floor.loot : [],
      hp,
      maxHp: hp,
      damage,
      xp,
      coins,
      healOnWin: Number.isFinite(floor.healPercent) ? floor.healPercent : 0
    };
  });

  return {
    id: template.id || 'unknown_dungeon',
    name: template.name || 'Unknown Dungeon',
    theme: template.theme || 'unknown',
    biome: template.biome || 'unknown',
    recommendedPower: template.recommendedPower || null,
    environment: template.environment || '',
    timeLimitSeconds: template.timeLimitSeconds || null,
    completionReward: template.completionReward || {
      coins: { base: 200, perLevel: 12 },
      xp: { base: 220, perLevel: 15 }
    },
    floors: runFloors
  };
}
function runDungeonEncounter(player, floor) {
  const enemy = { ...floor };
  if (enemy.hp == null) enemy.hp = enemy.maxHp || enemy.baseHp || 60;
  const modifiers = getBrewModifiers(player);
  const playerProfile = buildPlayerCombatProfile(player, { label: 'You', modifiers });
  const enemyProfile = buildEnemyCombatProfile(enemy);
  const battleLog = [`⚔️ **Floor Encounter:** ${enemy.emoji} ${enemy.name}`, floor.description ? `_${floor.description}_` : '' , ''];
  
  while (player.hp > 0 && enemy.hp > 0) {
    const playerStrike = resolveAttack(playerProfile, enemyProfile);
    battleLog.push(formatAttackResult('You', enemy.name, playerStrike, enemy.hp, enemyProfile.maxHp));
    if (enemy.hp <= 0) break;
  
    const enemyStrike = resolveAttack(enemyProfile, playerProfile);
    battleLog.push(formatAttackResult(enemy.name, 'You', enemyStrike, player.hp, player.maxHp));
  }
  
  const result = {
    victory: player.hp > 0,
    battleLog,
    leveled: false,
    loot: [],
    relicReward: null,
    coins: 0,
    xp: 0
  };
  
  if (result.victory) {
    result.coins = enemy.coins;
    result.xp = Math.max(10, Math.round(enemy.xp * (1 + modifiers.xpBonus)));
    player.coins += enemy.coins;
    player.stats.kills++;
    result.leveled = addXp(player, result.xp);
    result.loot = rollMaterialDrops(player);
    const customLoot = rollCustomLoot(player, floor.lootTable);
    if (customLoot.length > 0) {
      result.loot.push(...customLoot);
    }
  
    if (floor.relic && Math.random() < floor.relic.chance) {
      const amount = floor.relic.amount || 1;
      addItemToInventory(player, floor.relic.item, amount);
      const itemData = ITEMS[floor.relic.item];
      const label = `${itemData ? itemData.emoji + ' ' : ''}${floor.relic.item} x${amount}`;
      result.relicReward = label;
      result.relic = { itemId: floor.relic.item, quantity: amount, label };
    }
  
    if (floor.healOnWin) {
      const heal = Math.floor(player.maxHp * floor.healOnWin);
      player.hp = Math.min(player.maxHp, player.hp + heal);
      battleLog.push(`✨ You catch your breath and recover ${heal} HP. (${player.hp}/${player.maxHp})`);
    }
  } else {
    battleLog.push(`\n💀 **You were defeated by ${enemy.name}!**`);
    player.stats.deaths++;
    player.hp = Math.max(1, Math.floor(player.maxHp * 0.4));
    const penalty = Math.min(player.coins, 50);
    player.coins -= penalty;
    battleLog.push(`Lost ${penalty} coins. HP restored to ${player.hp}/${player.maxHp}.`);
  }
  
  applyPostBattleBuffs(player, battleLog);
  
  return result;
}
function resolveQuest(identifier) {
  if (identifier == null) return null;
  if (typeof identifier === 'number') return QUEST_MAP[identifier] || null;
  if (typeof identifier === 'string') {
    const numeric = Number(identifier);
    if (!Number.isNaN(numeric)) {
      const byId = QUEST_MAP[numeric];
      if (byId) return byId;
    }
    const lower = identifier.toLowerCase();
    return QUEST_SLUG_MAP[lower] || QUESTS.find(q => q.name?.toLowerCase() === lower) || null;
  }
  return null;
}
function initializeQuestProgress(player, quest) {
  if (!player.questProgress) player.questProgress = {};
  const objectives = quest.objectives.map(obj => {
    if (obj.type === 'gather') {
      const current = player.inventory?.[obj.item] || 0;
      return Math.min(obj.quantity, current);
    }
    if (obj.type === 'codex') {
      const category = obj.category?.toLowerCase();
      const current = Array.isArray(player.codex?.[category]) ? player.codex[category].includes(obj.entry) ? obj.quantity : 0 : 0;
      return Math.min(obj.quantity, current);
    }
    if (obj.type === 'faction') {
      const current = player.stats?.factionsAssisted?.[obj.faction] || 0;
      return Math.min(obj.quantity, current);
    }
    if (obj.type === 'brew') {
      return 0;
    }
    if (obj.type === 'pvp') {
      return 0;
    }
    return 0;
  });
  player.questProgress[quest.id] = {
    objectives,
    ready: objectives.length === 0,
    completed: false,
    startedAt: Date.now()
  };
}
function refreshQuestProgress(player, quest) {
  if (!player.questProgress) return null;
  if (!player.questProgress[quest.id]) {
    initializeQuestProgress(player, quest);
  }
  const progress = player.questProgress[quest.id];
  if (!progress) return null;
  quest.objectives.forEach((obj, idx) => {
    if (obj.type === 'gather') {
      const inventoryCount = player.inventory?.[obj.item] || 0;
      progress.objectives[idx] = Math.min(obj.quantity, Math.max(progress.objectives[idx] || 0, inventoryCount));
    }
    if (obj.type === 'codex') {
      const category = obj.category?.toLowerCase();
      const unlocked = Array.isArray(player.codex?.[category]) ? player.codex[category].includes(obj.entry) : false;
      progress.objectives[idx] = unlocked ? obj.quantity : 0;
    }
    if (obj.type === 'faction') {
      const assisted = player.stats?.factionsAssisted?.[obj.faction] || 0;
      progress.objectives[idx] = Math.min(obj.quantity, Math.max(progress.objectives[idx] || 0, assisted));
    }
  });
  const complete = quest.objectives.every((obj, idx) => (progress.objectives[idx] || 0) >= obj.quantity);
  if (complete) {
    progress.ready = true;
  }
  return progress;
}
function updateQuestProgress(player, event) {
  if (!player.questProgress || !player.quests || player.quests.length === 0) return [];
  const readyQuests = [];
  const count = event.count || 1;
  for (const questId of player.quests) {
    const quest = QUEST_MAP[questId];
    if (!quest) continue;
    const progress = player.questProgress[questId];
    if (!progress || progress.completed) continue;
    let updated = false;
    quest.objectives.forEach((objective, index) => {
      const current = progress.objectives[index] || 0;
      if (current >= objective.quantity) return;
      switch (objective.type) {
        case 'defeat': {
          if (event.type === 'defeat' && objective.enemy && objective.enemy === event.enemyId) {
            progress.objectives[index] = Math.min(objective.quantity, current + count);
            updated = true;
          }
          break;
        }
        case 'gather': {
          if (event.type === 'gather' && objective.item && objective.item === event.itemId) {
            progress.objectives[index] = Math.min(objective.quantity, current + count);
            updated = true;
          }
          break;
        }
        case 'craft': {
          if (event.type === 'craft' && objective.item && objective.item === event.itemId) {
            progress.objectives[index] = Math.min(objective.quantity, current + count);
            updated = true;
          }
          break;
        }
        case 'dungeon': {
          if (event.type === 'dungeon' && objective.dungeon && objective.dungeon === event.dungeonId) {
            progress.objectives[index] = Math.min(objective.quantity, current + count);
            updated = true;
          }
          break;
        }
        case 'codex': {
          if (event.type === 'codex' && objective.category && event.category === objective.category && event.entry === objective.entry) {
            progress.objectives[index] = Math.min(objective.quantity, current + count);
            updated = true;
          }
          break;
        }
        case 'faction': {
          if (event.type === 'faction' && objective.faction && event.faction === objective.faction) {
            progress.objectives[index] = Math.min(objective.quantity, current + count);
            updated = true;
          }
          break;
        }
        case 'brew': {
          if (event.type === 'brew') {
            const matchesBrew = objective.brew ? objective.brew === event.brewId : true;
            const matchesAction = objective.action ? objective.action === event.action : true;
            if (matchesBrew && matchesAction) {
              progress.objectives[index] = Math.min(objective.quantity, current + count);
              updated = true;
            }
          }
          break;
        }
        case 'pvp': {
          if (event.type === 'pvp') {
            const matchesResult = objective.result ? objective.result === event.result : true;
            if (matchesResult) {
              progress.objectives[index] = Math.min(objective.quantity, current + count);
              updated = true;
            }
          }
          break;
        }
        default:
          break;
      }
    });
    if (updated) {
      const complete = quest.objectives.every((obj, idx) => (progress.objectives[idx] || 0) >= obj.quantity);
      if (complete && !progress.ready) {
        progress.ready = true;
        readyQuests.push(quest);
      }
    }
  }
  return readyQuests;
}
function notifyQuestReady(message, quests) {
  if (!message || !quests || quests.length === 0) return;
  const unique = [];
  const seen = new Set();
  quests.forEach(quest => {
    if (quest && !seen.has(quest.id)) {
      seen.add(quest.id);
      unique.push(quest);
    }
  });
  if (unique.length === 0) return;
  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle('📜 Quest Update')
    .setDescription(unique.map(q => `✅ **${q.name}** is ready to turn in!`).join('\n'))
    .setFooter({ text: `Use ${PREFIX} completequest <id> to claim rewards.` });
  const payload = buildStyledPayload(embed, 'quests', { components: buildSystemComponents('quests') });
  message.channel.send(payload).catch(() => {});
}
function processQuestEvent(message, player, event) {
  const ready = updateQuestProgress(player, event) || [];
  if (ready.length > 0) {
    notifyQuestReady(message, ready);
  }
  const readyContracts = updateContractProgress(player, event) || [];
  if (readyContracts.length > 0) {
    notifyContractsReady(message, readyContracts);
  }
}
function isAchievementComplete(player, achievement) {
  const { requirement } = achievement;
  if (!requirement) return false;
  switch (requirement.type) {
    case 'stat':
      return (player.stats[requirement.key] || 0) >= requirement.value;
    case 'coins':
      return player.coins >= requirement.value;
    case 'level':
      return player.level >= requirement.value;
    case 'inventorySize':
      return Object.keys(player.inventory).length >= requirement.value;
    default:
      return false;
  }
}
function getAchievementProgress(player, achievement) {
  const { requirement } = achievement;
  switch (requirement.type) {
    case 'stat':
      return { current: player.stats[requirement.key] || 0, target: requirement.value };
    case 'coins':
      return { current: player.coins, target: requirement.value };
    case 'level':
      return { current: player.level, target: requirement.value };
    case 'inventorySize':
      return { current: Object.keys(player.inventory).length, target: requirement.value };
    default:
      return { current: 0, target: 0 };
  }
}
function formatAchievementReward(reward) {
  if (!reward) return 'No reward';
  const parts = [];
  if (reward.coins) parts.push(`+${reward.coins} coins`);
  if (reward.xp) parts.push(`+${reward.xp} XP`);
  if (reward.item) {
    const data = ITEMS[reward.item];
    const amount = reward.itemAmount || 1;
    parts.push(`${data ? data.emoji + ' ' : ''}${reward.item} x${amount}`);
  }
  return parts.join(' | ') || 'Bragging rights';
}
async function handleAchievementCheck(message, player) {
  if (!message || !player || !player.achievements) return;
  const newlyUnlocked = [];
  for (const achievement of ACHIEVEMENTS) {
    if (player.achievements.claimed.includes(achievement.id)) continue;
    if (player.achievements.notified.includes(achievement.id)) continue;
    if (isAchievementComplete(player, achievement)) {
      newlyUnlocked.push(achievement);
      player.achievements.notified.push(achievement.id);
    }
  }
  if (newlyUnlocked.length === 0) return;

  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle('🏆 Achievement Unlocked!')
    .setDescription(newlyUnlocked.map(a => `${a.emoji} **${a.name}** — ${a.description}`).join('\n'))
    .setFooter({ text: `Use ${PREFIX} achievements to review and claim rewards.` });

  const payload = buildStyledPayload(embed, 'achievements');
  await message.channel.send(payload);
}
async function executeCommand(message, command, args) {
  // Profile & Stats Commands
  if (command === 'profile' || command === 'p') {
    const targetId = extractUserId(args[0]) || args[0];
    await showProfile(message, targetId || message.author.id);
  }
  else if (command === 'inventory' || command === 'inv') {
    await showInventory(message);
  }
  else if (command === 'equip') {
    await equipItem(message, args[0]);
  }
  else if (command === 'use') {
    await useItem(message, args[0]);
  }
  else if (command === 'stats') {
    await showStats(message);
  }
  
  // Combat Commands
  else if (command === 'hunt' || command === 'battle') {
    await startBattle(message);
  }
  else if (command === 'raid') {
    await startRaid(message);
  }
  else if (command === 'heal') {
    await healPlayer(message);
  }
  else if (command === 'dungeon') {
    await startDungeon(message, args[0]);
  }
  else if (command === 'dungeons') {
    await showDungeons(message);
  }
  else if (command === 'descend') {
    await continueDungeon(message);
  }
  else if (command === 'retreat') {
    await retreatDungeon(message);
  }
  
  // Economy Commands
  else if (command === 'shop') {
    await showShop(message);
  }
  else if (command === 'buy') {
    await buyItem(message, args[0], parseInt(args[1]) || 1);
  }
  else if (command === 'sell') {
    await sellItem(message, args[0], parseInt(args[1]) || 1);
  }
  else if (command === 'recipes' || command === 'recipe') {
    await showRecipes(message, args[0]);
  }
  else if (command === 'craft') {
    const amount = parseInt(args[1], 10);
    await craftItem(message, args[0], isNaN(amount) ? 1 : amount);
  }
  else if (command === 'brews') {
    await showBrews(message, args[0]);
  }
  else if (command === 'brew') {
    const amount = parseInt(args[1], 10);
    await brewItem(message, args[0], isNaN(amount) ? 1 : amount);
  }
  else if (command === 'drink') {
    await drinkBrew(message, args[0]);
  }
  else if (command === 'buffs') {
    await showActiveBuffs(message);
  }
  else if (command === 'daily') {
    await claimDaily(message);
  }
  else if (command === 'tutorial') {
    await showTutorial(message);
  }
  else if (command === 'give') {
    await giveCoins(message, args[0], args[1]);
  }
  else if (command === 'vendor') {
    await showFactionVendors(message, args[0]);
  }
  else if (command === 'buyrep' || command === 'buyfaction') {
    await buyFactionVendorItem(message, args[0], args[1], args[2]);
  }
  else if (command === 'contracts' || command === 'contract') {
    await showContracts(message, args[0]);
  }
  else if (command === 'acceptcontract') {
    await acceptContract(message, args[0], args[1]);
  }
  else if (command === 'turnincontract') {
    await turnInContract(message, args[0]);
  }
  else if (command === 'abandoncontract') {
    await abandonContract(message, args[0]);
  }
  
  // Quest Commands
  else if (command === 'quests' || command === 'q') {
    await showQuests(message);
  }
  else if (command === 'startquest' || command === 'sq') {
    await startQuest(message, args[0]);
  }
  else if (command === 'completequest' || command === 'cq') {
    await completeQuest(message, args[0]);
  }
  else if (command === 'achievements' || command === 'achs') {
    await showAchievements(message);
  }
  else if (command === 'claimachievement' || command === 'claimach') {
    await claimAchievement(message, args[0]);
  }
  
  // Mini-Games
  else if (command === 'scramble') {
    await startScramble(message);
  }
  else if (command === 'trivia') {
    await startTrivia(message);
  }
  else if (command === 'guess') {
    await startGuess(message);
  }
  else if (command === 'rps') {
    await playRPS(message, args[0]);
  }
  else if (command === 'coinflip' || command === 'cf') {
    await coinFlip(message, args[0]);
  }
  
  // Social Commands
  else if (command === 'leaderboard' || command === 'lb') {
    await showLeaderboard(message, args[0]);
  }
  else if (command === 'trade') {
    await initiateTrade(message, args[0], args[1]);
  }
  
  // Info Commands
  else if (command === 'help' || command === 'h') {
    await showHelp(message, args[0]);
  }
  else if (command === 'info') {
    await showInfo(message);
  }
  else if (command === 'lore') {
    await showLore(message, args[0]);
  }
  else if (command === 'codex') {
    await showCodex(message, args[0], args[1]);
  }
  else if (command === 'reputation' || command === 'rep') {
    await showReputation(message, args[0]);
  }
  else if (command === 'eventsub') {
    await subscribeEvents(message, args[0]);
  }
  else if (command === 'eventstatus' || command === 'event') {
    await showEventStatus(message);
  }
  else if (command === 'participate') {
    await participateInEvent(message, args[0]);
  }
  
  // Tweet Tracker Commands
  else if (command === 'setuptweets') {
    if (!message.member?.permissions?.has?.('Administrator')) {
      return message.reply('❌ You need Administrator permissions to set up tweet tracking!');
    }
    await setupTweetTracker(message);
  }
  else if (command === 'checktweets') {
    await checkTweets(message, true);
  }
  
  // Admin & PvP Commands
  else if (command === 'reset') {
    if (message.author.id !== message.guild?.ownerId) {
      return message.reply('❌ Only the server owner can use this command!');
    }
    await resetPlayer(message, args[0]);
  }
  else if (command === 'addcoins') {
    if (!message.member?.permissions?.has?.('Administrator')) {
      return message.reply('❌ You need Administrator permissions!');
    }
    await addCoinsAdmin(message, args[0], args[1]);
  }
  else if (command === 'duel') {
    await startDuel(message, args[0], args[1]);
  }
  else if (command === 'accept') {
    await acceptDuel(message);
  }
  else if (command === 'decline') {
    await declineDuel(message);
  }
  else if (command === 'teamqueue') {
    await joinTeamQueue(message);
  }
  else if (command === 'leaveteam') {
    await leaveTeamQueue(message);
  }
  else if (command === 'dashboard') {
    const player = getPlayer(message.author.id);
    const exploration = ensureExplorationState(player);
    const embeds = [
      buildPlayerOverviewEmbed(player, exploration),
      buildExplorationStatusEmbed(player, getBiomeDefinition(exploration.currentBiome), exploration),
      buildBaseSummaryEmbed(player, exploration),
      buildSettlementSummaryEmbed(player)
    ];
    await message.reply({ embeds: embeds.slice(0, 4), components: buildDashboardComponents() });
  }
  else if (command === 'travel') {
    await handleTravelCommand(message, args);
  }
  else if (command === 'explore') {
    await handleExploreCommand(message, args);
  }
  else if (command === 'gather') {
    await handleGatherCommand(message, args);
  }
  else if (command === 'base') {
    await handleBaseCommand(message, args);
  }
  else if (command === 'settlement') {
    await handleSettlementCommand(message, args);
  }
  else if (command === 'hy') {
    await handleHyCommand(message, args);
  }
}
// ==================== COMMAND HANDLER ====================
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    await executeCommand(message, command, args);
    return;
    // Legacy fallback block (kept temporarily for reference)
    // Profile & Stats Commands
    if (command === 'profile' || command === 'p') {
      await showProfile(message, args[0] ? message.mentions.users.first()?.id : message.author.id);
    }
    else if (command === 'inventory' || command === 'inv') {
      await showInventory(message);
    }
    else if (command === 'equip') {
      await equipItem(message, args[0]);
    }
    else if (command === 'use') {
      await useItem(message, args[0]);
    }
    else if (command === 'stats') {
      await showStats(message);
    }
    
    // Combat Commands
    else if (command === 'hunt' || command === 'battle') {
      await startBattle(message);
    }
    else if (command === 'raid') {
      await startRaid(message);
    }
    else if (command === 'heal') {
      await healPlayer(message);
    }
    else if (command === 'dungeon') {
      await startDungeon(message, args[0]);
    }
    else if (command === 'dungeons') {
      await showDungeons(message);
    }
    else if (command === 'descend') {
      await continueDungeon(message);
    }
    else if (command === 'retreat') {
      await retreatDungeon(message);
    }
    
    // Economy Commands
    else if (command === 'shop') {
      await showShop(message);
    }
    else if (command === 'buy') {
      await buyItem(message, args[0], parseInt(args[1]) || 1);
    }
    else if (command === 'sell') {
      await sellItem(message, args[0], parseInt(args[1]) || 1);
    }
    else if (command === 'recipes' || command === 'recipe') {
      await showRecipes(message, args[0]);
    }
    else if (command === 'craft') {
      const amount = parseInt(args[1], 10);
      await craftItem(message, args[0], isNaN(amount) ? 1 : amount);
    }
    else if (command === 'brews') {
      await showBrews(message, args[0]);
    }
    else if (command === 'brew') {
      const amount = parseInt(args[1], 10);
      await brewItem(message, args[0], isNaN(amount) ? 1 : amount);
    }
    else if (command === 'drink') {
      await drinkBrew(message, args[0]);
    }
    else if (command === 'buffs') {
      await showActiveBuffs(message);
    }
    else if (command === 'daily') {
      await claimDaily(message);
    }
    else if (command === 'give') {
      await giveCoins(message, args[0], parseInt(args[1]));
    }
    else if (command === 'vendor') {
      await showFactionVendors(message, args[0]);
    }
    else if (command === 'buyrep' || command === 'buyfaction') {
      await buyFactionVendorItem(message, args[0], args[1], args[2]);
    }
    else if (command === 'contracts' || command === 'contract') {
      await showContracts(message, args[0]);
    }
    else if (command === 'acceptcontract') {
      await acceptContract(message, args[0], args[1]);
    }
    else if (command === 'turnincontract') {
      await turnInContract(message, args[0]);
    }
    else if (command === 'abandoncontract') {
      await abandonContract(message, args[0]);
    }
    
    // Quest Commands
    else if (command === 'quests' || command === 'q') {
      await showQuests(message);
    }
    else if (command === 'startquest' || command === 'sq') {
      await startQuest(message, args[0]);
    }
    else if (command === 'completequest' || command === 'cq') {
      await completeQuest(message, args[0]);
    }
    else if (command === 'achievements' || command === 'achs') {
      await showAchievements(message);
    }
    else if (command === 'claimachievement' || command === 'claimach') {
      await claimAchievement(message, args[0]);
    }
    
    // Mini-Games
    else if (command === 'scramble') {
      await startScramble(message);
    }
    else if (command === 'trivia') {
      await startTrivia(message);
    }
    else if (command === 'guess') {
      await startGuess(message);
    }
    else if (command === 'rps') {
      await playRPS(message, args[0]);
    }
    else if (command === 'coinflip' || command === 'cf') {
      await coinFlip(message, args[0]);
    }
    
    // Social Commands
    else if (command === 'leaderboard' || command === 'lb') {
      await showLeaderboard(message, args[0]);
    }
    else if (command === 'trade') {
      await initiateTrade(message, args[0], args[1]);
    }
    
    // Info Commands
    else if (command === 'help' || command === 'h') {
      await showHelp(message, args[0]);
    }
    else if (command === 'info') {
      await showInfo(message);
    }
    else if (command === 'lore') {
      await showLore(message, args[0]);
    }
    else if (command === 'codex') {
      await showCodex(message, args[0], args[1]);
    }
    else if (command === 'reputation' || command === 'rep') {
      await showReputation(message, args[0]);
    }
    else if (command === 'eventsub') {
      await subscribeEvents(message, args[0]);
    }
    else if (command === 'eventstatus' || command === 'event') {
      await showEventStatus(message);
    }
    else if (command === 'participate') {
      await participateInEvent(message, args[0]);
    }
    
    // Tweet Tracker Commands
    else if (command === 'setuptweets') {
      if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ You need Administrator permissions to set up tweet tracking!');
      }
      await setupTweetTracker(message);
    }
    else if (command === 'checktweets') {
      await checkTweets(message, true);
    }
    
    // Admin Commands
    else if (command === 'reset') {
      if (message.author.id !== message.guild.ownerId) {
        return message.reply('❌ Only the server owner can use this command!');
      }
      await resetPlayer(message, args[0]);
    }
    else if (command === 'addcoins') {
      if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ You need Administrator permissions!');
      }
      await addCoinsAdmin(message, args[0], parseInt(args[1]));
    }
    else if (command === 'duel') {
      await startDuel(message, args[0], args[1]);
    }
    else if (command === 'accept') {
      await acceptDuel(message);
    }
    else if (command === 'decline') {
      await declineDuel(message);
    }
    else if (command === 'teamqueue') {
      await joinTeamQueue(message);
    }
    else if (command === 'leaveteam') {
      await leaveTeamQueue(message);
    }
    else if (command === 'dashboard') {
      const player = getPlayer(message.author.id);
      const exploration = ensureExplorationState(player);
      const embeds = [
        buildPlayerOverviewEmbed(player, exploration),
        buildExplorationStatusEmbed(player, getBiomeDefinition(exploration.currentBiome), exploration),
        buildBaseSummaryEmbed(player, exploration),
        buildSettlementSummaryEmbed(player)
      ];
      await message.reply({ embeds: embeds.slice(0, 4), components: buildDashboardComponents() });
    }
    else if (command === 'travel') {
      await handleTravelCommand(message, args);
    }
    else if (command === 'explore') {
      await handleExploreCommand(message, args);
    }
    else if (command === 'base') {
      await handleBaseCommand(message, args);
    }
    else if (command === 'settlement') {
      await handleSettlementCommand(message, args);
    }
    else if (command === 'hy') {
      await handleHyCommand(message, args);
    }
  } catch (error) {
    console.error('Command error:', error);
    message.reply('❌ An error occurred while executing that command!');
  }
});
// ==================== PROFILE COMMANDS ====================
async function showProfile(message, userId = message.author.id) {
  const user = await client.users.fetch(userId);
  const player = getPlayer(userId);
  
  const embed = new EmbedBuilder()
    .setColor('#00D4FF')
    .setTitle(`${user.username}'s Profile`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: '⭐ Level', value: `${player.level}`, inline: true },
      { name: '✨ XP', value: `${player.xp}/${xpForLevel(player.level + 1)}`, inline: true },
      { name: '💰 Coins', value: `${player.coins}`, inline: true },
      { name: '❤️ HP', value: `${player.hp}/${player.maxHp}`, inline: true },
      { name: '💙 Mana', value: `${player.mana}/${player.maxMana}`, inline: true },
      { name: '🎒 Items', value: `${Object.keys(player.inventory).length}`, inline: true }
    )
    .setFooter({ text: 'Hytale RPG System' })
    .setTimestamp();
  
  if (player.equipped.weapon || player.equipped.armor || player.equipped.accessory || player.equipped.tool) {
    const equipped = [];
    if (player.equipped.weapon) equipped.push(`Weapon: ${player.equipped.weapon}`);
    if (player.equipped.armor) equipped.push(`Armor: ${player.equipped.armor}`);
    if (player.equipped.accessory) equipped.push(`Accessory: ${player.equipped.accessory}`);
    if (player.equipped.tool) equipped.push(`Tool: ${player.equipped.tool}`);
    embed.addFields({ name: '⚔️ Equipped', value: equipped.join('\n') || 'Nothing' });
  }

  const activeSetData = getActiveItemSetData(player);
  const activeSetText = activeSetData.sets.length
    ? activeSetData.sets.map(set => `• ${set.name}`).join('\n')
    : 'None';
  embed.addFields({ name: '🔗 Active Sets', value: activeSetText, inline: false });

  if (player.cosmetics?.titles?.equipped) {
    const titleDef = COSMETIC_UNLOCKS.find(c => c.id === player.cosmetics.titles.equipped);
    embed.addFields({ name: '🎭 Title', value: titleDef ? titleDef.name : player.cosmetics.titles.equipped });
  }
  
  embed.addFields({ name: '🤝 Faction Standing', value: formatTopReputation(player) });
  embed.addFields({ name: '🧪 Active Buffs', value: formatActiveBuffs(player) });
  
  return sendStyledEmbed(message, embed, 'profile');
}

async function showInventory(message) {
  const player = getPlayer(message.author.id);
  
  if (Object.keys(player.inventory).length === 0) {
    return message.reply('🎒 Your inventory is empty!');
  }
  
  let items = [];
  for (const [item, count] of Object.entries(player.inventory)) {
    const itemData = ITEMS[item];
    if (itemData) {
      items.push(`${itemData.emoji} **${item}** x${count} (${itemData.value} coins)`);
    }
  }
  
  const embed = new EmbedBuilder()
    .setColor('#00D4FF')
    .setTitle('🎒 Your Inventory')
    .setDescription(items.join('\n'))
    .setFooter({ text: `Use ${PREFIX} equip <item> or ${PREFIX} use <item>` });
  
  return sendStyledEmbed(message, embed, 'inventory');
}
async function equipItem(message, itemName) {
  if (!itemName) return message.reply('❌ Please specify an item to equip!');
  
  const player = getPlayer(message.author.id);
  itemName = itemName.toLowerCase();
  
  if (!player.inventory[itemName]) {
    return message.reply('❌ You don\'t have that item!');
  }
  
  const item = ITEMS[itemName];
  if (!item) return message.reply('❌ Unknown item!');

  const beforeSetIds = new Set(getActiveItemSetData(player).sets.map(set => set.id));
  let responseMessage = '';
  
  if (item.type === 'weapon') {
    player.equipped.weapon = itemName;
    const damageText = item.damageMin || item.damageMax
      ? `${Math.max(1, item.damageMin || item.damage)}-${Math.max(1, item.damageMax || item.damage)}`
      : `${item.damage || 0}`;
    responseMessage = `⚔️ Equipped **${itemName}**! Damage: ${damageText}${item.damageType ? ` (${item.damageType})` : ''}`;
  } else if (item.type === 'armor') {
    player.equipped.armor = itemName;
    const resistText = item.resistances && Object.keys(item.resistances).length
      ? ` | Resist: ${Object.entries(item.resistances).map(([type, value]) => `${type} ${Math.round(value * 100)}%`).join(', ')}`
      : '';
    responseMessage = `🛡️ Equipped **${itemName}**! Defense: ${item.defense || 0}${resistText}`;
  } else if (item.type === 'accessory') {
    player.equipped.accessory = itemName;
    const bonuses = [];
    if (item.mana) bonuses.push(`Mana +${item.mana}`);
    if (item.luck) bonuses.push(`Luck +${item.luck}`);
    const bonusText = bonuses.length ? ` (${bonuses.join(', ')})` : '';
    responseMessage = `📿 Equipped **${itemName}**${bonusText}!`;
  } else if (item.type === 'tool') {
    player.equipped.tool = itemName;
    const gather = item.gathering || {};
    const types = Array.isArray(gather.types)
      ? gather.types.map(entry => GATHERING_TYPE_LABELS[entry.toLowerCase?.()] || entry).join(', ')
      : gather.type
        ? GATHERING_TYPE_LABELS[gather.type.toLowerCase?.()] || gather.type
        : 'All Gathering';
    const bonuses = gather.bonuses || {};
    const bonusSegments = [];
    if (bonuses.speed) bonusSegments.push(`Speed +${Math.round(bonuses.speed * 100)}%`);
    if (bonuses.quantity) bonusSegments.push(`Yield +${Math.round(bonuses.quantity * 100)}%`);
    if (bonuses.rarity) bonusSegments.push(`Rare +${Math.round(bonuses.rarity * 100)}%`);
    if (bonuses.extraRolls) bonusSegments.push(`Extra Rolls +${bonuses.extraRolls}`);
    responseMessage = `🛠️ Equipped **${itemName}**! (${types})${bonusSegments.length ? ` — ${bonusSegments.join(', ')}` : ''}`;
  } else {
    return message.reply('❌ This item cannot be equipped!');
  }

  const afterSetData = getActiveItemSetData(player);
  const newSets = afterSetData.sets.filter(set => !beforeSetIds.has(set.id));
  if (newSets.length) {
    const setLines = newSets.map(set => {
      const detail = set.effects.length ? `\n   ${set.effects.map(effect => `• ${effect}`).join('\n   ')}` : '';
      return `✨ **${set.name}** activated!${detail}`;
    });
    responseMessage += `\n${setLines.join('\n')}`;
  }

  message.reply(responseMessage);
}
async function useItem(message, itemName) {
  if (!itemName) return message.reply('❌ Please specify an item to use!');
  
  const player = getPlayer(message.author.id);
  itemName = itemName.toLowerCase();
  
  if (!player.inventory[itemName] || player.inventory[itemName] <= 0) {
    return message.reply('❌ You don\'t have that item!');
  }
  
  const item = ITEMS[itemName];
  if (!item || item.type !== 'consumable') {
    return message.reply('❌ This item cannot be used!');
  }
  
  player.inventory[itemName]--;
  if (player.inventory[itemName] === 0) delete player.inventory[itemName];
  
  const brew = BREW_MAP[itemName];
  let healAmount = Number(item.heal || 0);
  let manaAmount = Number(item.mana || 0);
  if (brew) {
    healAmount = Math.max(healAmount, brew.effects.heal || 0);
    manaAmount = Math.max(manaAmount, brew.effects.mana || 0);
  }

  const lines = [`🍷 Used **${item.name || itemName}**`];
  if (healAmount) {
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    lines.push(`• Restored ${healAmount} HP (${player.hp}/${player.maxHp})`);
  }
  if (manaAmount) {
    player.mana = Math.min(player.maxMana, player.mana + manaAmount);
    lines.push(`• Restored ${manaAmount} Mana (${player.mana}/${player.maxMana})`);
  }

  if (brew) {
    const applied = applyBrewBuff(player, brew);
    player.stats.brewsConsumed = (player.stats.brewsConsumed || 0) + 1;
    const minutes = Math.floor(brew.durationSeconds / 60);
    const durationLabel = minutes > 0 ? `${minutes}m` : `${brew.durationSeconds}s`;
    lines.push(`• Buff gained: ${applied?.label || brew.effects.buff} (${durationLabel})`);
    processQuestEvent(message, player, { type: 'brew', brewId: brew.id, action: 'consume', count: 1 });
  }

  message.reply(lines.join('\n'));
  await handleAchievementCheck(message, player);
}
async function showStats(message) {
  const player = getPlayer(message.author.id);
  
  const embed = new EmbedBuilder()
    .setColor('#FF6B6B')
    .setTitle('📊 Your Statistics')
    .addFields(
      { name: '⚔️ Enemies Defeated', value: `${player.stats.kills}`, inline: true },
      { name: '💀 Deaths', value: `${player.stats.deaths}`, inline: true },
      { name: '🎮 Games Played', value: `${player.stats.gamesPlayed}`, inline: true },
      { name: '⚒️ Items Crafted', value: `${player.stats.crafted}`, inline: true },
      { name: '🏰 Dungeons Cleared', value: `${player.stats.dungeonsCleared}`, inline: true },
      { name: '📜 Quests Started', value: `${player.stats.questsStarted}`, inline: true },
      { name: '✅ Quests Completed', value: `${player.stats.questsCompleted}`, inline: true },
      { name: '📘 Codex Unlocks', value: `${player.stats.codexUnlocks || 0}`, inline: true },
      { name: '🎇 Events Participated', value: `${player.stats.eventsParticipated || 0}`, inline: true },
      { name: '🧪 Brews Crafted', value: `${player.stats.brewsCrafted || 0}`, inline: true },
      { name: '🥤 Brews Consumed', value: `${player.stats.brewsConsumed || 0}`, inline: true },
      { name: '👥 Team Wins', value: `${player.stats.teamWins || 0}`, inline: true },
      { name: '👣 Team Losses', value: `${player.stats.teamLosses || 0}`, inline: true },
      { name: '⚔️ PvP Wins', value: `${player.stats.pvpWins || 0}`, inline: true },
      { name: '💢 PvP Losses', value: `${player.stats.pvpLosses || 0}`, inline: true },
      { name: '📜 Contracts Completed', value: `${player.stats.contractsCompleted || 0}`, inline: true },
      { name: '📝 Active Quests', value: `${player.quests.length}`, inline: true },
      { name: '💰 Total Wealth', value: `${player.coins} coins`, inline: true },
      { name: '🏠 Max Settlement Prestige', value: `${player.stats.maxSettlementPrestige || 0}`, inline: true },
      { name: '🏠 Settlements Managed', value: `${player.stats.settlementsManaged || 0}`, inline: true },
      { name: '🏠 Bases Claimed', value: `${player.stats.basesClaimed || 0}`, inline: true },
      { name: '🏠 Base Rank Ups', value: `${player.stats.baseRankUps || 0}`, inline: true },
      { name: '🏠 Base Modules Upgraded', value: `${player.stats.baseModulesUpgraded || 0}`, inline: true }
    )
    .setFooter({ text: 'Keep adventuring to grow your legend!' });
  
  return sendStyledEmbed(message, embed, 'stats');
}
// ==================== COMBAT COMMANDS ====================
async function startBattle(message) {
  const player = getPlayer(message.author.id);
  
  if (player.hp <= 0) {
    return message.reply('❌ You need to heal before battling! Use a health potion or `!hy heal`.');
  }
  
  const enemy = { ...ENEMIES[Math.floor(Math.random() * ENEMIES.length)] };
  if (enemy.hp == null) enemy.hp = enemy.maxHp || 30;
  const modifiers = getBrewModifiers(player);
  const playerProfile = buildPlayerCombatProfile(player, {
    label: message.author.username,
    modifiers
  });
  const enemyProfile = buildEnemyCombatProfile(enemy);
  
  const battleLog = [`⚔️ **Battle Started!** ${enemy.emoji} ${enemy.name} appears!\n`];
  
  while (player.hp > 0 && enemy.hp > 0) {
    const playerStrike = resolveAttack(playerProfile, enemyProfile);
    battleLog.push(formatAttackResult(playerProfile.label, enemyProfile.label, playerStrike, enemy.hp, enemyProfile.maxHp));
    if (enemy.hp <= 0) break;
    
    const enemyStrike = resolveAttack(enemyProfile, playerProfile);
    battleLog.push(formatAttackResult(enemyProfile.label, playerProfile.label, enemyStrike, player.hp, player.maxHp));
  }
  
  if (player.hp > 0) {
    const xpGain = Math.max(5, Math.round(enemy.xp * (1 + modifiers.xpBonus)));
    battleLog.push(`\n🎉 **Victory!** You defeated ${enemy.emoji} ${enemy.name}!`);
    battleLog.push(`+${xpGain} XP | +${enemy.coins} coins`);
    
    player.coins += enemy.coins;
    player.stats.kills++;
    
    const leveled = addXp(player, xpGain);
    if (leveled) {
      battleLog.push(`\n⭐ **LEVEL UP!** You are now level ${player.level}!`);
    }

    const questEnemyId = enemy.id || enemy.slug || (enemy.name ? enemy.name.toLowerCase().replace(/\s+/g, '_') : null);
    if (questEnemyId) {
      processQuestEvent(message, player, { type: 'defeat', enemyId: questEnemyId, count: 1 });
    }

    const lootRewards = rollMaterialDrops(player);
    if (lootRewards.length > 0) {
      battleLog.push(`Loot: ${lootRewards.map(entry => entry.label).join(', ')}`);
      lootRewards.forEach(entry => {
        processQuestEvent(message, player, { type: 'gather', itemId: entry.itemId, count: entry.quantity });
      });
    }
  } else {
    battleLog.push(`\n💀 **Defeated!** ${enemy.emoji} ${enemy.name} was too strong...`);
    player.hp = Math.floor(player.maxHp * 0.5);
    player.coins = Math.max(0, player.coins - 20);
    player.stats.deaths++;
    battleLog.push(`Lost 20 coins. HP restored to 50%.`);
  }
  
  applyPostBattleBuffs(player, battleLog);
  
  const embed = new EmbedBuilder()
    .setColor(player.hp > 0 ? '#00FF00' : '#FF0000')
    .setTitle('⚔️ Battle Report')
    .setDescription(battleLog.join('\n'))
    .setFooter({ text: `HP: ${player.hp}/${player.maxHp} | Coins: ${player.coins}` });
  
  await message.reply({ embeds: [embed] });
  await handleAchievementCheck(message, player);
}
async function startRaid(message) {
  if (activeGames.has(message.channel.id)) {
    return message.reply('❌ A game is already active in this channel!');
  }
  
  const boss = {
    name: 'Varyn Overlord',
    hp: 500,
    maxHp: 500,
    damage: 30,
    emoji: '👿',
    participants: new Map()
  };
  
  activeGames.set(message.channel.id, { type: 'raid', data: boss });
  
  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🔥 RAID BOSS SPAWNED!')
    .setDescription(`${boss.emoji} **${boss.name}** has appeared!\n\nType \`!hy attack\` to join the raid!\nYou have 60 seconds to defeat it!`)
    .addFields({ name: '❤️ Boss HP', value: `${boss.hp}/${boss.maxHp}` });
  
  await message.reply({ embeds: [embed] });
  
  setTimeout(() => endRaid(message.channel), 60000);
}
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const game = activeGames.get(message.channel.id);
  if (game && game.type === 'raid' && message.content.toLowerCase() === `${PREFIX} attack`) {
    const player = getPlayer(message.author.id);
    const boss = game.data;
    
    if (player.hp <= 0) {
      return message.reply('❌ You need to heal first!');
    }
    
    const modifiers = getBrewModifiers(player);
    const playerProfile = buildPlayerCombatProfile(player, { label: message.author.username, modifiers });
    const bossProfile = {
      label: boss.name,
      hpRef: boss,
      maxHp: boss.maxHp,
      damageMin: Math.max(1, boss.damageMin || boss.damage || 12),
      damageMax: Math.max(boss.damageMin || boss.damage || 12, boss.damageMax || (boss.damage ? boss.damage + 4 : 16)),
      damageBonus: 0,
      damageType: (boss.damageType || 'physical').toLowerCase(),
      critChance: Math.max(0, boss.critChance || 0.05),
      critMultiplier: Math.max(1.3, boss.critMultiplier || 1.5),
      accuracy: Math.min(0.99, Math.max(0.1, boss.accuracy || 0.85)),
      defense: Math.max(0, boss.defense || 10),
      resistances: boss.resistances || {},
      dodgeChance: Math.max(0, boss.dodgeChance || 0.02),
      blockChance: Math.max(0, boss.blockChance || 0),
      flatDamageReduction: Math.max(0, boss.damageReduction || 0),
      damageMultiplier: Math.max(0.1, Number(boss.damageMultiplier || 1))
    };
    const attack = resolveAttack(playerProfile, bossProfile);
    const damage = attack.type === 'hit' ? attack.damage : 0;
    if (damage > 0) {
    boss.participants.set(message.author.id, (boss.participants.get(message.author.id) || 0) + damage);
    }
    const attackLine = formatAttackResult(playerProfile.label, bossProfile.label, attack, boss.hp, boss.maxHp);
    message.reply(`${attackLine}`);
    
    if (boss.hp <= 0) {
      endRaid(message.channel);
    }
  }
});
async function endRaid(channel) {
  const game = activeGames.get(channel.id);
  if (!game || game.type !== 'raid') return;
  
  const boss = game.data;
  activeGames.delete(channel.id);
  
  if (boss.hp <= 0) {
    let rewards = [];
    for (const [userId, damage] of boss.participants) {
      const player = getPlayer(userId);
      const reward = Math.floor(damage / 2);
      player.coins += reward;
      addXp(player, Math.floor(damage / 3));
      rewards.push(`<@${userId}>: ${reward} coins`);
    }
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('🎉 RAID VICTORY!')
      .setDescription(`${boss.emoji} **${boss.name}** has been defeated!\n\n**Rewards:**\n${rewards.join('\n')}`)
      .setFooter({ text: `${boss.participants.size} heroes participated!` });
    
    sendStyledChannelMessage(channel, embed, 'combat').catch(() => {});
  } else {
    const failureEmbed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('💀 Raid Failed')
      .setDescription(`${boss.emoji} **${boss.name}** escaped with ${boss.hp} HP remaining!`)
      .setFooter({ text: 'Regroup and try again with stronger gear!' });
    sendStyledChannelMessage(channel, failureEmbed, 'combat').catch(() => {});
  }
}

async function healPlayer(message) {
  const player = getPlayer(message.author.id);
  const cost = 50;
  
  if (player.hp === player.maxHp) {
    return message.reply('❌ You\'re already at full health!');
  }
  
  if (player.coins < cost) {
    return message.reply(`❌ Not enough coins! Healing costs ${cost} coins.`);
  }
  
  player.coins -= cost;
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  
  message.reply(`✨ Fully healed! HP: ${player.hp}/${player.maxHp} | Mana: ${player.mana}/${player.maxMana} | -${cost} coins`);
}
async function startDungeon(message, dungeonIdentifier) {
  const existingGame = activeGames.get(message.channel.id);
  if (existingGame) {
    if (existingGame.type === 'dungeon' && existingGame.ownerId === message.author.id) {
      return message.reply('⚠️ You already have a dungeon in progress! Use `!hy descend` to continue or `!hy retreat` to exit.');
    }
    return message.reply('❌ A game is already active in this channel! Finish it before starting a dungeon.');
  }

  const player = getPlayer(message.author.id);
  if (player.hp <= 0) {
    return message.reply('❌ You need to heal before delving into a dungeon!');
  }

  let requestedTemplate = null;
  if (dungeonIdentifier) {
    requestedTemplate = resolveDungeon(dungeonIdentifier);
    if (!requestedTemplate) {
      return message.reply('❌ Dungeon not found! Use `!hy dungeons` to view available delves.');
    }
    if ((requestedTemplate.minLevel || 1) > player.level) {
      return message.reply(`🔒 You need to be at least level ${requestedTemplate.minLevel} to challenge ${requestedTemplate.name}.`);
    }
  }

  const dungeonRun = generateDungeonRun(player, requestedTemplate?.id);
  if (!dungeonRun || !dungeonRun.floors || dungeonRun.floors.length === 0) {
    return message.reply('❌ No dungeon layouts available at your level yet.');
  }

  activeGames.set(message.channel.id, {
    type: 'dungeon',
    ownerId: message.author.id,
    dungeonId: dungeonRun.id,
    dungeonName: dungeonRun.name,
    theme: dungeonRun.theme,
    biome: dungeonRun.biome,
    environment: dungeonRun.environment,
    recommendedPower: dungeonRun.recommendedPower,
    timeLimitSeconds: dungeonRun.timeLimitSeconds,
    completionReward: dungeonRun.completionReward,
    floors: dungeonRun.floors,
    currentFloor: 0,
    startTime: Date.now(),
    clearedFloors: 0
  });

  const firstFloor = dungeonRun.floors[0];

  const embed = new EmbedBuilder()
    .setColor('#34495E')
    .setTitle(`🏰 ${dungeonRun.name}`)
    .setDescription(`**Theme:** ${dungeonRun.theme || 'Unknown'} • **Biome:** ${dungeonRun.biome || 'Unknown'} • **Floors:** ${dungeonRun.floors.length}`)
    .addFields(
      { name: '⚔️ Floor 1', value: `${firstFloor.emoji} ${firstFloor.name}` },
      { name: '📜 Instructions', value: `Use \
\`${PREFIX} descend\` to fight the next floor or \
\`${PREFIX} retreat\` to leave early (small fee).` }
    )
    .setFooter({ text: 'Prepare for multi-floor combat. Healing between floors is limited!' });

  if (dungeonRun.environment) {
    embed.addFields({ name: '🌫️ Environment', value: dungeonRun.environment });
  }

  if (dungeonRun.recommendedPower) {
    embed.addFields({ name: '📈 Recommended Power', value: `${dungeonRun.recommendedPower}` });
  }

  if (dungeonRun.timeLimitSeconds) {
    const minutes = Math.ceil(dungeonRun.timeLimitSeconds / 60);
    embed.addFields({ name: '⏱️ Suggested Time', value: `${minutes} minutes` });
  }

  message.reply({ embeds: [embed] });
}
async function continueDungeon(message) {
  const game = activeGames.get(message.channel.id);
  if (!game || game.type !== 'dungeon') {
    return message.reply('❌ No dungeon is currently active here. Start one with `!hy dungeon`!');
  }
  if (game.ownerId !== message.author.id) {
    return message.reply('❌ Only the adventurer who started this dungeon can progress it!');
  }

  const player = getPlayer(message.author.id);
  if (player.hp <= 0) {
    return message.reply('❌ You are too wounded to continue! Heal before descending further.');
  }

  const floor = game.floors[game.currentFloor];
  if (!floor) {
    return message.reply('❌ Dungeon data missing. Please start a new dungeon.');
  }

  const result = runDungeonEncounter(player, floor);

  const embed = new EmbedBuilder()
    .setColor(result.victory ? '#1ABC9C' : '#E74C3C')
    .setTitle(`${floor.boss ? '🔥 Boss Floor' : '🏰 Floor'} ${game.currentFloor + 1}: ${floor.name}`)
    .setDescription(result.battleLog.join('\n'))
    .setFooter({ text: result.victory ? 'Prepare for the next floor or exit with !hy retreat' : 'Defeated... gather strength and try again!' });

  if (floor.ability) {
    embed.addFields({ name: '🌪️ Encounter Effect', value: floor.ability });
  }

  if (result.victory) {
    embed.addFields(
      { name: 'Rewards', value: `+${result.coins} coins | +${result.xp} XP` }
    );
    if (result.loot.length > 0) {
      embed.addFields({ name: 'Loot', value: result.loot.map(entry => entry.label).join('\n') });
      result.loot.forEach(entry => {
        processQuestEvent(message, player, { type: 'gather', itemId: entry.itemId, count: entry.quantity });
      });
    }
    if (result.relicReward) {
      embed.addFields({ name: 'Relic Found', value: result.relicReward });
    }
    if (result.relic) {
      processQuestEvent(message, player, { type: 'gather', itemId: result.relic.itemId, count: result.relic.quantity });
    }
    if (result.leveled) {
      embed.addFields({ name: '⭐ Level Up!', value: `You reached level ${player.level}!` });
    }
  }

  await message.reply({ embeds: [embed] });

  if (!result.victory) {
    activeGames.delete(message.channel.id);
    return;
  }
  game.currentFloor += 1;
  game.clearedFloors = (game.clearedFloors || 0) + 1;

  if (game.currentFloor >= game.floors.length) {
    activeGames.delete(message.channel.id);
    const completionReward = game.completionReward || { coins: { base: 200, perLevel: 12 }, xp: { base: 220, perLevel: 15 } };
    const bonusCoins = Math.round((completionReward.coins?.base || 0) + (completionReward.coins?.perLevel || 0) * player.level);
    const bonusXp = Math.round((completionReward.xp?.base || 0) + (completionReward.xp?.perLevel || 0) * player.level);
    player.coins += bonusCoins;
    const bonusLevel = addXp(player, bonusXp);
    player.stats.dungeonsCleared++;

    const summary = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🎉 Dungeon Cleared!')
      .setDescription(`You conquered ${game.dungeonName || 'the depths'} and defeated its final guardian!`)
      .addFields(
        { name: 'Bonus Rewards', value: `+${bonusCoins} coins | +${bonusXp} XP` }
      )
      .setFooter({ text: 'Use your spoils to craft stronger gear!' });

    const completionItems = Array.isArray(completionReward.items) ? completionReward.items : [];
    if (completionItems.length > 0) {
      const itemLines = [];
      completionItems.forEach(entry => {
        if (!entry?.item) return;
        const quantity = entry.quantity || entry.amount || 1;
        addItemToInventory(player, entry.item, quantity);
        const itemData = ITEMS[entry.item];
        const label = `${itemData ? itemData.emoji + ' ' : ''}${entry.item} x${quantity}`;
        itemLines.push(label);
        processQuestEvent(message, player, { type: 'gather', itemId: entry.item, count: quantity });
      });
      if (itemLines.length > 0) {
        summary.addFields({ name: 'Treasure', value: itemLines.join('\n') });
      }
    }

    if (bonusLevel) {
      summary.addFields({ name: '⭐ Level Up!', value: `You reached level ${player.level}!` });
    }

    if (result.loot.length === 0 && !result.relicReward) {
      summary.addFields({ name: 'Tip', value: 'Bring Kweebec charms or luck buffs to increase rare loot drops!' });
    }

    await message.channel.send(buildStyledPayload(summary, 'combat', { components: buildSystemComponents('combat') })).catch(() => {});
    processQuestEvent(message, player, { type: 'dungeon', dungeonId: game.dungeonId, count: 1 });
  } else {
    const nextFloor = game.floors[game.currentFloor];
    const environmentNote = game.environment ? `Environment: ${game.environment}` : null;
    const nextEmbed = new EmbedBuilder()
      .setColor('#2980B9')
      .setTitle(`⬇️ Prepare for Floor ${game.currentFloor + 1}`)
      .setDescription(`${nextFloor.emoji} **${nextFloor.name}** awaits within ${game.dungeonName || 'the dungeon'}.${environmentNote ? `\n${environmentNote}` : ''}\nUse \`${PREFIX} descend\` when ready.`)
      .setFooter({ text: 'Heal quickly and continue the push!' });
    await message.channel.send(buildStyledPayload(nextEmbed, 'combat', { components: buildSystemComponents('combat') })).catch(() => {});
  }

  await handleAchievementCheck(message, player);
}
async function retreatDungeon(message) {
  const game = activeGames.get(message.channel.id);
  if (!game || game.type !== 'dungeon') {
    return message.reply('❌ There is no active dungeon to retreat from.');
  }
  if (game.ownerId !== message.author.id) {
    return message.reply('❌ Only the adventurer who started this dungeon can retreat!');
  }

  const player = getPlayer(message.author.id);
  const penalty = Math.min(75, Math.floor(player.coins * 0.1) + 25);
  player.coins = Math.max(0, player.coins - penalty);
  activeGames.delete(message.channel.id);

  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('🚪 Dungeon Retreat')
    .setDescription('You retreat to safety, forfeiting a portion of your loot.')
    .addFields({ name: 'Cost', value: `-${penalty} coins` })
    .setFooter({ text: 'Train, heal, and return stronger!' });

  return sendStyledEmbed(message, embed, 'combat');
}

// ==================== ECONOMY COMMANDS ====================
async function showShop(message) {
  const player = getPlayer(message.author.id);
  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('🛒 Adventurer\'s Market')
    .setDescription('Browse goods available for purchase. Use `!hy buy <item> [amount]` to purchase.')
    .addFields(SHOP_ITEMS.map(item => ({
      name: `${item.emoji} ${item.name} — ${item.price} coins`,
      value: item.description || 'No description provided.',
      inline: false
    })))
    .setFooter({ text: `You currently have ${player.coins} coins.` });
  return sendStyledEmbed(message, embed, 'shop');
}

async function buyItem(message, itemName, amount = 1) {
  if (!itemName) return message.reply('❌ Please specify an item to buy!');
  if (amount < 1) return message.reply('❌ Invalid amount!');
  
  const player = getPlayer(message.author.id);
  itemName = itemName.toLowerCase();
  const item = ITEMS[itemName];
  
  if (!item) return message.reply('❌ Item not found in shop!');
  
  const totalCost = item.value * amount;
  if (player.coins < totalCost) {
    return message.reply(`❌ Not enough coins! Need ${totalCost}, you have ${player.coins}`);
  }
  
  player.coins -= totalCost;
  player.inventory[itemName] = (player.inventory[itemName] || 0) + amount;
  
  message.reply(`✅ Purchased ${amount}x ${item.emoji} **${itemName}** for ${totalCost} coins!`);
}

async function sellItem(message, itemName, amount = 1) {
  if (!itemName) return message.reply('❌ Please specify an item to sell!');
  if (amount < 1) return message.reply('❌ Invalid amount!');
  
  const player = getPlayer(message.author.id);
  itemName = itemName.toLowerCase();
  
  if (!player.inventory[itemName] || player.inventory[itemName] < amount) {
    return message.reply('❌ You don\'t have enough of that item!');
  }
  
  const item = ITEMS[itemName];
  if (!item) return message.reply('❌ Unknown item!');
  
  const sellPrice = Math.floor(item.value * 0.7) * amount;
  player.inventory[itemName] -= amount;
  if (player.inventory[itemName] === 0) delete player.inventory[itemName];
  player.coins += sellPrice;
  
  message.reply(`✅ Sold ${amount}x ${item.emoji} **${itemName}** for ${sellPrice} coins!`);
}
async function showRecipes(message, recipeKey) {
  if (recipeKey) {
    const itemKey = recipeKey.toLowerCase();
    const recipe = RECIPES[itemKey];
    const item = ITEMS[itemKey];
    if (!recipe || !item) {
      return message.reply('❌ Recipe not found! Use `!hy recipes` to view available crafts.');
    }
    const ingredientLines = Object.entries(recipe.ingredients).map(([name, qty]) => {
      const data = ITEMS[name];
      const label = data ? `${data.emoji} ${name}` : name;
      return `• ${label} x${qty}`;
    });
    const embed = new EmbedBuilder()
      .setColor('#8E44AD')
      .setTitle(`🛠️ Crafting Recipe: ${item.emoji} ${itemKey}`)
      .setDescription(recipe.description || 'Craft powerful gear using gathered resources.')
      .addFields(
        { name: 'Required Level', value: `${recipe.level}`, inline: true },
        { name: 'Crafting Cost', value: `${recipe.coins} coins`, inline: true },
        { name: 'Ingredients', value: ingredientLines.join('\n') }
      )
      .setFooter({ text: `Use ${PREFIX} craft ${itemKey}` });
    return message.reply({ embeds: [embed] });
  }

  const player = getPlayer(message.author.id);
  const available = RECIPE_DEFINITIONS
    .map(recipe => ({ itemKey: recipe.result, recipe: RECIPES[recipe.result], item: ITEMS[recipe.result] }))
    .filter(entry => !!entry.recipe && !!entry.item)
    .sort((a, b) => a.recipe.level - b.recipe.level);

  const lines = available.map(({ itemKey, recipe, item }) => {
    const status = player.level >= recipe.level ? '✅' : '🔒';
    return `${status} ${item.emoji} **${itemKey}** (Lvl ${recipe.level}, ${recipe.coins} coins)`;
  });

  const embed = new EmbedBuilder()
    .setColor('#8E44AD')
    .setTitle('🛠️ Crafting Recipes')
    .setDescription(lines.join('\n') || 'No recipes available yet!')
    .setFooter({ text: `Use ${PREFIX} recipes <item> for details` });

  message.reply({ embeds: [embed] });
}
async function craftItem(message, itemName, amount = 1) {
  if (!itemName) {
    return message.reply('❌ Please specify an item to craft! Example: `!hy craft steel_sword`');
  }

  const itemKey = itemName.toLowerCase();
  const recipe = RECIPES[itemKey];
  const itemData = ITEMS[itemKey];
  if (!recipe || !itemData) {
    return message.reply('❌ Unknown recipe! Use `!hy recipes` to see craftable items.');
  }

  if (amount < 1) amount = 1;
  if (amount > 5) amount = 5;

  const player = getPlayer(message.author.id);

  if (player.level < recipe.level) {
    return message.reply(`❌ You need to be level ${recipe.level} to craft ${itemKey}!`);
  }

  const totalCost = recipe.coins * amount;
  if (player.coins < totalCost) {
    return message.reply(`❌ Not enough coins! Crafting costs ${totalCost} coins, but you have ${player.coins}.`);
  }

  const totalIngredients = {};
  for (const [ingredient, qty] of Object.entries(recipe.ingredients)) {
    totalIngredients[ingredient] = qty * amount;
  }

  const missing = hasRequiredIngredients(player, totalIngredients);
  if (missing.length > 0) {
    const missingText = missing.map(m => `• ${m.item} (${m.have}/${m.required})`).join('\n');
    return message.reply(`❌ Missing ingredients:\n${missingText}`);
  }

  for (const [ingredient, qty] of Object.entries(totalIngredients)) {
    removeItemFromInventory(player, ingredient, qty);
  }

  player.coins -= totalCost;
  addItemToInventory(player, itemKey, amount);
  player.stats.crafted += amount;

  const xpGain = Math.max(15, Math.floor(recipe.level * 12)) * amount;
  const leveled = addXp(player, xpGain);

  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('🛠️ Crafting Complete')
    .setDescription(`Successfully crafted ${amount}x ${itemData.emoji} **${itemKey}**!`)
    .addFields(
      { name: 'Cost', value: `${totalCost} coins`, inline: true },
      { name: 'XP Gained', value: `${xpGain} XP`, inline: true }
    )
    .setFooter({ text: `Crafted items are stored in your inventory.` });

  if (leveled) {
    embed.addFields({ name: '⭐ Level Up!', value: `You are now level ${player.level}!` });
  }

  await message.reply({ embeds: [embed] });
  processQuestEvent(message, player, { type: 'craft', itemId: itemKey, count: amount });
  await handleAchievementCheck(message, player);
}

async function claimDaily(message) {
  const player = getPlayer(message.author.id);
  const now = Date.now();
  
  if (player.lastDaily && now - player.lastDaily < 86400000) {
    const remaining = Math.ceil((86400000 - (now - player.lastDaily)) / 3600000);
    return message.reply(`❌ Daily reward already claimed! Come back in ${remaining} hours.`);
  }
  
  const reward = 100 + player.level * 10;
  player.coins += reward;
  player.lastDaily = now;
  
  await message.reply(`🎁 Daily reward claimed! +${reward} coins!`);
  await handleAchievementCheck(message, player);
}
async function giveCoins(message, targetUser, amount) {
  const parsedAmount = Number(amount);
  if (!targetUser || !parsedAmount || parsedAmount <= 0) {
    return message.reply('❌ Usage: !hy give @user <amount>');
  }
  
  const target = await resolveUserFromInput(message, targetUser);
  if (!target) return message.reply('❌ Please mention a valid user!');
  if (target.id === message.author.id) return message.reply('❌ You can\'t give coins to yourself!');
  
  const player = getPlayer(message.author.id);
  if (player.coins < parsedAmount) {
    return message.reply(`❌ Not enough coins! You have ${player.coins} coins.`);
  }
  
  const targetPlayer = getPlayer(target.id);
  player.coins -= parsedAmount;
  targetPlayer.coins += parsedAmount;
  
  message.reply(`✅ Gave ${parsedAmount} coins to ${target.username}!`);
}
// ==================== QUEST COMMANDS ====================
async function showQuests(message) {
  const player = getPlayer(message.author.id);
  
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('📜 Quest Board')
    .setFooter({ text: `Active quests: ${player.quests.length}/${MAX_ACTIVE_QUESTS} | Use ${PREFIX} startquest <id>` });

  const activeLines = (player.quests || [])
    .map(id => QUEST_MAP[id])
    .filter(Boolean)
    .map(quest => formatActiveQuestLine(player, quest));

  addQuestField(embed, '📋 Active Quests', activeLines);

  const availableLines = [];
  const lockedLines = [];

  QUESTS.forEach(quest => {
    const availability = getQuestAvailability(player, quest);
    if (availability.status === 'available') {
      availableLines.push(`\`${quest.id}\` **${quest.name}** (Lvl ${quest.req?.level || 1})\n${formatObjectiveSummary(quest)}\nRewards: ${formatRewardSummary(quest.reward)}`);
    } else if (availability.status === 'locked') {
      lockedLines.push(`\`${quest.id}\` **${quest.name}** — ${availability.reason}`);
    }
  });

  addQuestField(embed, '✨ Available Quests', availableLines);
  addQuestField(embed, '🔒 Locked Quests', lockedLines);

  if (embed.data.fields?.length === 0) {
    embed.setDescription('You have no quests at the moment. Visit NPCs or the quest board to find new adventures!');
  }
  return sendStyledEmbed(message, embed, 'quests');
}
async function startQuest(message, questIdentifier) {
  if (!questIdentifier) return message.reply('❌ Please specify a quest ID or slug!');
  
  const player = getPlayer(message.author.id);
  const quest = resolveQuest(questIdentifier);
  
  if (!quest) return message.reply('❌ Quest not found!');

  if (player.quests.length >= MAX_ACTIVE_QUESTS) {
    return message.reply(`❌ You can only track ${MAX_ACTIVE_QUESTS} quests at a time. Complete or abandon one first.`);
  }

  const availability = getQuestAvailability(player, quest);
  if (availability.status === 'completed') {
    return message.reply('✅ You have already completed that quest!');
  }
  if (availability.status === 'active') {
    return message.reply('⚠️ That quest is already active for you. Check your quest log with `!hy quests`.');
  }
  if (availability.status === 'locked') {
    return message.reply(`🔒 You cannot start that quest yet: ${availability.reason}`);
  }

  player.quests.push(quest.id);
  initializeQuestProgress(player, quest);
  refreshQuestProgress(player, quest);
  player.stats.questsStarted++;

  const objectiveText = quest.objectives.length > 0
    ? quest.objectives.map(obj => `• ${formatObjectiveLabel(obj)} (Need ${obj.quantity})`).join('\n')
    : 'No objectives listed.';

  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle(`✅ Quest Accepted: ${quest.name}`)
    .setDescription(quest.desc || 'Adventure awaits!')
    .addFields(
      { name: 'Objectives', value: objectiveText },
      { name: 'Rewards', value: formatRewardSummary(quest.reward) }
    )
    .setFooter({ text: `Use ${PREFIX} completequest ${quest.id} when finished.` });

  await message.reply({ embeds: [embed] });
  await handleAchievementCheck(message, player);
}
async function completeQuest(message, questIdentifier) {
  if (!questIdentifier) return message.reply('❌ Please specify a quest ID or slug!');
  
  const player = getPlayer(message.author.id);
  const quest = resolveQuest(questIdentifier);
  
  if (!quest) return message.reply('❌ Quest not found!');
  if (!player.quests.includes(quest.id)) {
    return message.reply('❌ You do not have that quest active!');
  }

  const progress = refreshQuestProgress(player, quest) || player.questProgress[quest.id];
  if (!progress || !progress.ready) {
    return message.reply('⏳ Objectives are not complete yet! Check your progress with `!hy quests`.');
  }

  player.quests = player.quests.filter(id => id !== quest.id);
  if (!player.completedQuests.includes(quest.id)) {
    player.completedQuests.push(quest.id);
  }
  progress.completed = true;
  progress.ready = false;
  delete player.questProgress[quest.id];

  player.coins += quest.reward.coins;
  const leveled = addXp(player, quest.reward.xp);
  player.stats.questsCompleted++;

  const rewardLines = [`+${quest.reward.xp} XP`, `+${quest.reward.coins} coins`];

  if (Array.isArray(quest.reward.items)) {
    quest.reward.items.forEach(entry => {
      addItemToInventory(player, entry.item, entry.quantity || 1);
      rewardLines.push(`+${entry.quantity || 1} ${entry.item}`);
      processQuestEvent(message, player, { type: 'gather', itemId: entry.item, count: entry.quantity || 1 });
    });
  }
  
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('🏆 Quest Completed!')
    .setDescription(`**${quest.name}**\n${quest.desc}`)
    .addFields(
      { name: '🎁 Rewards', value: rewardLines.join(' | ') },
      { name: 'Next Steps', value: 'Check the quest board for new opportunities!' }
    )
    .setFooter({ text: leveled ? `⭐ Level up! You are now level ${player.level}!` : `Level ${player.level}` });
  
  await message.reply({ embeds: [embed] });
  await handleAchievementCheck(message, player);
}

async function showAchievements(message) {
  const player = getPlayer(message.author.id);
  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle('🎖️ Achievements')
    .setDescription('Complete challenges to unlock powerful rewards!');
  
  const unlocked = [];
  const locked = [];
  
  ACHIEVEMENTS.forEach(achievement => {
    const line = `${achievement.emoji} **${achievement.name}** — ${achievement.description}`;
    if (player.achievements.claimed.includes(achievement.id)) {
      unlocked.push(`✅ ${line}`);
    } else if (isAchievementComplete(player, achievement)) {
      unlocked.push(`✨ ${line} (Ready to claim)`);
    } else {
      locked.push(`❌ ${line}`);
    }
  });
  
  if (unlocked.length) embed.addFields({ name: 'Unlocked', value: unlocked.join('\n') });
  if (locked.length) embed.addFields({ name: 'Locked', value: locked.join('\n') });
  
  if (!unlocked.length && !locked.length) {
    embed.setDescription('No achievements found. Start adventuring!');
  }
  return sendStyledEmbed(message, embed, 'achievements');
}
function applyAchievementReward(player, reward) {
  if (!reward) return { leveled: false };
  if (reward.coins) player.coins += reward.coins;
  let leveled = false;
  if (reward.xp) {
    leveled = addXp(player, reward.xp) || leveled;
  }
  if (reward.item) {
    addItemToInventory(player, reward.item, reward.itemAmount || 1);
  }
  return { leveled };
}
async function claimAchievement(message, achievementId) {
  if (!achievementId) {
    return message.reply('❌ Please specify the achievement ID to claim. Example: `!hy claimach first_blood`');
  }

  const player = getPlayer(message.author.id);
  const id = achievementId.toLowerCase();
  const achievement = ACHIEVEMENTS.find(a => a.id === id);

  if (!achievement) {
    return message.reply('❌ Achievement not found! Use `!hy achievements` to view IDs.');
  }
  if (player.achievements.claimed.includes(id)) {
    return message.reply('✅ You already claimed this achievement reward!');
  }
  if (!isAchievementComplete(player, achievement)) {
    const progress = getAchievementProgress(player, achievement);
    return message.reply(`🔒 Not yet! Progress ${progress.current}/${progress.target}. Keep going!`);
  }

  player.achievements.claimed.push(id);
  if (!player.achievements.notified.includes(id)) {
    player.achievements.notified.push(id);
  }

  const { leveled } = applyAchievementReward(player, achievement.reward);

  const rewards = formatAchievementReward(achievement.reward);
  const embed = new EmbedBuilder()
    .setColor('#27AE60')
    .setTitle('🏆 Achievement Claimed')
    .setDescription(`${achievement.emoji} **${achievement.name}** reward claimed!`)
    .addFields({ name: 'Rewards', value: rewards });

  if (leveled) {
    embed.addFields({ name: '⭐ Level Up!', value: `You reached level ${player.level}!` });
  }

  await message.reply({ embeds: [embed] });
  await handleAchievementCheck(message, player);
}
// ==================== MINI-GAMES ====================
async function startScramble(message) {
  if (activeGames.has(message.channel.id)) {
    return message.reply('❌ A game is already active in this channel!');
  }
  
  const words = ['HYTALE', 'KWEEBEC', 'TRORK', 'VARYN', 'ORBIS', 'ADVENTURE', 'DUNGEON', 'CRYSTAL', 'WIZARD', 'KNIGHT'];
  const word = words[Math.floor(Math.random() * words.length)];
  const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
  
  activeGames.set(message.channel.id, {
    type: 'scramble',
    word: word,
    prize: 50
  });
  
  message.reply(`🔤 **Word Scramble!** Unscramble this word:\n\`${scrambled}\`\n\nYou have 30 seconds! First to answer wins 50 coins!`);
  
  setTimeout(() => {
    if (activeGames.get(message.channel.id)?.type === 'scramble') {
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('⏰ Time\'s Up!')
        .setDescription(`The word was **${word}**`)
        .setFooter({ text: `Start another round with ${PREFIX} scramble` });
      sendStyledChannelMessage(message.channel, embed, 'minigames').catch(() => {});
    }
  }, 30000);
}
async function startTrivia(message) {
  if (activeGames.has(message.channel.id)) {
    return message.reply('❌ A game is already active in this channel!');
  }
  
  const questions = [
    { q: 'What is the name of the peaceful tree-dwelling race in Hytale?', a: 'KWEEBEC' },
    { q: 'What is the name of the hostile pig-like creatures?', a: 'TRORK' },
    { q: 'What is the name of the undead faction?', a: 'VARYN' },
    { q: 'What planet does Hytale take place on?', a: 'ORBIS' },
    { q: 'Who is developing Hytale?', a: 'HYPIXEL' },
    { q: 'What type of game is Hytale?', a: 'SANDBOX' },
  ];
  
  const trivia = questions[Math.floor(Math.random() * questions.length)];
  
  activeGames.set(message.channel.id, {
    type: 'trivia',
    answer: trivia.a,
    prize: 75
  });
  
  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('📝 Hytale Trivia!')
    .setDescription(`❓ ${trivia.q}\n\nYou have 30 seconds! First correct answer wins 75 coins!`)
    .setFooter({ text: `Try another question with ${PREFIX} trivia` });
  const payload = buildStyledPayload(embed, 'minigames');
  message.channel.send(payload).catch(() => {});
  
  setTimeout(() => {
    if (activeGames.get(message.channel.id)?.type === 'trivia') {
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('⏰ Time\'s Up!')
        .setDescription(`The answer was **${trivia.a}**`)
        .setFooter({ text: `Try another question with ${PREFIX} trivia` });
      sendStyledChannelMessage(message.channel, embed, 'minigames').catch(() => {});
    }
  }, 30000);
}
async function startGuess(message) {
  if (activeGames.has(message.channel.id)) {
    return message.reply('❌ A game is already active in this channel!');
  }
  
  const number = Math.floor(Math.random() * 100) + 1;
  
  activeGames.set(message.channel.id, {
    type: 'guess',
    number: number,
    attempts: 0,
    prize: 100
  });
  
  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('🎲 Guess the Number!')
    .setDescription('I\'m thinking of a number between 1-100.\nYou have 6 attempts. Prize: 100 coins!')
    .setFooter({ text: `Use ${PREFIX} guess <number>` });
  const payload = buildStyledPayload(embed, 'minigames');
  message.channel.send(payload).catch(() => {});
}
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const game = activeGames.get(message.channel.id);
  if (!game) return;
  
  const player = getPlayer(message.author.id);
  player.stats.gamesPlayed++;
  
  if (game.type === 'scramble') {
    if (message.content.toUpperCase() === game.word) {
      activeGames.delete(message.channel.id);
      player.coins += game.prize;
      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🎉 Correct!')
        .setDescription(`**${message.author.username}** wins ${game.prize} coins!`)
        .setFooter({ text: `Play again with ${PREFIX} scramble` });
      const payload = buildStyledPayload(embed, 'minigames');
      message.channel.send(payload).catch(() => {});
    }
  }
  
  if (game.type === 'trivia') {
    if (message.content.toUpperCase().includes(game.answer)) {
      activeGames.delete(message.channel.id);
      player.coins += game.prize;
      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🎉 Correct!')
        .setDescription(`**${message.author.username}** wins ${game.prize} coins!`)
        .setFooter({ text: `Play again with ${PREFIX} trivia` });
      const payload = buildStyledPayload(embed, 'minigames');
      message.channel.send(payload).catch(() => {});
    }
  }
  
  if (game.type === 'guess') {
    const guess = parseInt(message.content);
    if (isNaN(guess) || guess < 1 || guess > 100) return;
    
    game.attempts++;
    
    if (guess === game.number) {
      activeGames.delete(message.channel.id);
      player.coins += game.prize;
      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🎉 Correct!')
        .setDescription(`**${message.author.username}** guessed ${game.number} in ${game.attempts} attempts! Won ${game.prize} coins!`)
        .setFooter({ text: `Play again with ${PREFIX} guess` });
      const payload = buildStyledPayload(embed, 'minigames');
      message.channel.send(payload).catch(() => {});
    } else if (game.attempts >= 6) {
      activeGames.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('💀 Out of attempts!')
        .setDescription(`The number was **${game.number}**.`)
        .setFooter({ text: `Try again with ${PREFIX} guess` });
      const payload = buildStyledPayload(embed, 'minigames');
      message.channel.send(payload).catch(() => {});
    } else {
      const hint = guess < game.number ? 'higher' : 'lower';
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ Wrong!')
        .setDescription(`Try ${hint}. (${6 - game.attempts} attempts left)`)
        .setFooter({ text: `Use ${PREFIX} guess <number>` });
      const payload = buildStyledPayload(embed, 'minigames');
      message.channel.send(payload).catch(() => {});
    }
  }
});
async function playRPS(message, choice) {
  const options = ['rock', 'paper', 'scissors'];
  if (!choice || !options.includes(choice.toLowerCase())) {
    return message.reply('❌ Usage: !hy rps <rock/paper/scissors>');
  }
  
  const player = getPlayer(message.author.id);
  const bet = 25;
  
  if (player.coins < bet) {
    return message.reply(`❌ You need ${bet} coins to play!`);
  }
  
  const botChoice = options[Math.floor(Math.random() * 3)];
  const playerChoice = choice.toLowerCase();
  
  let result;
  if (playerChoice === botChoice) {
    result = 'tie';
  } else if (
    (playerChoice === 'rock' && botChoice === 'scissors') ||
    (playerChoice === 'paper' && botChoice === 'rock') ||
    (playerChoice === 'scissors' && botChoice === 'paper')
  ) {
    result = 'win';
    player.coins += bet;
  } else {
    result = 'lose';
    player.coins -= bet;
  }
  
  const emojis = { rock: '🪨', paper: '📄', scissors: '✂️' };
  const outcomes = {
    win: `🎉 You win! +${bet} coins`,
    lose: `💀 You lose! -${bet} coins`,
    tie: '🤝 Tie! No coins lost or gained'
  };
  
  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('🪨 📄 ✂️ Rock Paper Scissors')
    .setDescription(`${emojis[playerChoice]} vs ${emojis[botChoice]}\n${outcomes[result]}`)
    .setFooter({ text: `Play again with ${PREFIX} rps <choice>` });
  const payload = buildStyledPayload(embed, 'minigames');
  message.channel.send(payload).catch(() => {});
}

async function coinFlip(message, choice) {
  if (!choice || !['heads', 'tails', 'h', 't'].includes(choice.toLowerCase())) {
    return message.reply('❌ Usage: !hy coinflip <heads/tails>');
  }
  
  const player = getPlayer(message.author.id);
  const bet = 50;
  
  if (player.coins < bet) {
    return message.reply(`❌ You need ${bet} coins to play!`);
  }
  
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const playerChoice = choice.toLowerCase()[0] === 'h' ? 'heads' : 'tails';
  
  if (result === playerChoice) {
    player.coins += bet;
    const embed = new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('🪙 Coin Flip')
      .setDescription(`🪙 **${result.toUpperCase()}!** You win! +${bet} coins`)
      .setFooter({ text: `Play again with ${PREFIX} coinflip <choice>` });
    const payload = buildStyledPayload(embed, 'minigames');
    message.channel.send(payload).catch(() => {});
  } else {
    player.coins -= bet;
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🪙 Coin Flip')
      .setDescription(`🪙 **${result.toUpperCase()}!** You lose! -${bet} coins`)
      .setFooter({ text: `Play again with ${PREFIX} coinflip <choice>` });
    const payload = buildStyledPayload(embed, 'minigames');
    message.channel.send(payload).catch(() => {});
  }
}

// ==================== SOCIAL COMMANDS ====================
async function showLeaderboard(message, type = 'level') {
  const sorted = Array.from(playerData.entries()).sort((a, b) => {
    if (type === 'coins') return b[1].coins - a[1].coins;
    if (type === 'kills') return (b[1].stats.kills || 0) - (a[1].stats.kills || 0);
    if (type === 'pvp') return (b[1].stats.pvpWins || 0) - (a[1].stats.pvpWins || 0);
    if (type === 'team') return (b[1].stats.teamWins || 0) - (a[1].stats.teamWins || 0);
    return b[1].level - a[1].level;
  }).slice(0, 10);
  
  let lb = [];
  for (let i = 0; i < sorted.length; i++) {
    const [userId, data] = sorted[i];
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    let value;
    if (type === 'coins') {
      value = `${data.coins} coins`;
    } else if (type === 'kills') {
      value = `${data.stats.kills || 0} kills`;
    } else if (type === 'pvp') {
      value = `${data.stats.pvpWins || 0} duel wins`;
    } else if (type === 'team') {
      value = `${data.stats.teamWins || 0} team wins`;
    } else {
      value = `Level ${data.level}`;
    }
    lb.push(`${medal} **${user.username}** - ${value}`);
  }
  
  const titles = {
    level: '⭐ Level Leaderboard',
    coins: '💰 Wealth Leaderboard',
    kills: '⚔️ Combat Leaderboard',
    pvp: '🥊 Duel Leaderboard',
    team: '👥 Team Battle Leaderboard'
  };
  
  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle(titles[type] || titles.level)
    .setDescription(lb.join('\n') || 'No data yet!')
    .setFooter({ text: 'Keep playing to climb the ranks!' });
  
  return sendStyledEmbed(message, embed, 'leaderboard');
}

async function initiateTrade(message, targetUser, itemName) {
  return message.reply('🚧 Trading system coming soon! Stay tuned for updates.');
}
// ==================== INFO COMMANDS ====================
async function showHelp(message, category) {
  const categories = {
    general: {
      title: 'General & Progression',
      commands: [
        ['profile', 'Show your character profile.'],
        ['stats', 'Full stat block, growth, multipliers.'],
        ['inventory', 'Inspect your bag contents.'],
        ['daily', 'Claim daily coins & XP.'],
        ['tutorial', 'Five-step onboarding walkthrough.'],
        ['dashboard', 'All systems overview with quick buttons.']
      ]
    },
    exploration: {
      title: 'Exploration & Travel',
      commands: [
        ['explore status', 'Current biome, timers, highlights.'],
        ['explore activity', 'Start a biome-specific activity.'],
        ['explore action', 'Perform mine / forage / survey / scavenge.'],
        ['travel start <biome>', 'Move to a neighboring biome.'],
        ['travel resolve', 'Finish travel timers.'],
        ['base claim', 'Establish a base in the current biome.'],
        ['base upgrade', 'Upgrade base modules & automation.']
      ]
    },
    settlements: {
      title: 'Settlements & Governance',
      commands: [
        ['settlement list', 'Show owned settlements.'],
        ['settlement info <id>', 'Inspect morale, wealth, army.'],
        ['settlement expeditions <id>', 'List expedition templates.'],
        ['settlement expedition <id> <template>', 'Launch villager expedition.'],
        ['settlement decisions <id>', 'Resolve crises, festivals, policies.'],
        ['contracts [faction]', 'Accept faction contracts.'],
        ['vendor [faction]', 'View faction vendor inventory.'],
        ['reputation [faction]', 'Check faction standings.']
      ]
    },
    combat: {
      title: 'Combat & Dungeons',
      commands: [
        ['hunt', 'Fight a random enemy.'],
        ['raid', 'Start a raid encounter.'],
        ['heal', 'Restore HP & Mana for coins.'],
        ['dungeon <id>', 'Begin a multi-floor dungeon run.'],
        ['descend', 'Advance to the next floor.'],
        ['retreat', 'Exit the dungeon safely.'],
        ['duel @user [wager]', 'Challenge another player (PvP).'],
        ['accept / decline', 'Respond to duel challenges.'],
        ['teamqueue', 'Queue for team PvP arena.'],
        ['leaveteam', 'Leave the team queue.']
      ]
    },
    economy: {
      title: 'Economy, Crafting & Brews',
      commands: [
        ['shop [category]', 'Browse shop stock.'],
        ['buy <item> [amount]', 'Purchase shop goods.'],
        ['sell <item> [amount]', 'Sell items for coins.'],
        ['recipes [item]', 'View crafting recipes.'],
        ['craft <item> [amount]', 'Craft gear and materials.'],
        ['brews [station]', 'List brewing options.'],
        ['brew <id> [amount]', 'Brew potions & tonics.'],
        ['drink <id>', 'Consume a brew for buffs.'],
        ['give @user <amount>', 'Gift coins to a friend.']
      ]
    },
    codex: {
      title: 'Lore & Codex',
      commands: [
        ['codex <category> [entry]', 'Browse items, enemies, biomes, etc.'],
        ['lore <topic>', 'Read lore snippets.'],
        ['info', 'Bot stats & tracked data.'],
        ['tutorial', 'Re-open the onboarding guide.']
      ]
    },
    events: {
      title: 'Events & Live Systems',
      commands: [
        ['eventstatus', 'Active global event summary.'],
        ['eventsub [event]', 'Subscribe this channel to event updates.'],
        ['participate <event>', 'Turn in event objectives.'],
        ['checktweets', 'Fetch latest official tweets.'],
        ['setuptweets [channel]', 'Configure tweet relay channel.']
      ]
    },
    misc: {
      title: 'Miscellaneous & Social',
      commands: [
        ['leaderboard [category]', 'View level, coin, kill, PvP rankings.'],
        ['achievements', 'Review achievement progress.'],
        ['claimachievement <id>', 'Claim unlocked achievement rewards.'],
        ['help <category>', 'Drill into a specific section.'],
        ['hy <command>', 'Slash entry point for legacy commands.']
      ]
    }
  };

  const selectedKey = category ? category.toLowerCase() : null;
  const categoryKeys = Object.keys(categories);

  if (selectedKey && !categories[selectedKey]) {
    return message.reply(
      `❌ Unknown help category. Try one of: ${categoryKeys.map(key => `\`${key}\``).join(', ')}`
    );
  }

  const embed = new EmbedBuilder()
    .setColor('#00D4FF')
    .setTitle('🆘 Hytale Bot Command Reference')
    .setThumbnail(EMBED_VISUALS.info)
    .setFooter({ text: `Prefix: ${PREFIX} | Slash mirror available via /hy …` });

  const renderCategory = (key, data) => {
    const rows = data.commands.map(([cmd, desc]) => `\`${PREFIX} ${cmd}\` — ${desc}`).join('\n');
    embed.addFields({ name: `**${data.title}**`, value: rows, inline: false });
  };

  if (selectedKey) {
    renderCategory(selectedKey, categories[selectedKey]);
  } else {
    categoryKeys.forEach(key => renderCategory(key, categories[key]));
    embed.addFields({
      name: '🎮 Quick Start',
      value: `\`${PREFIX} profile\` — check your stats\n\`${PREFIX} tutorial\` — onboarding guide\n\`${PREFIX} hunt\` — jump into combat\n\`${PREFIX} shop\` — restock and gear up`
    });
  }

  const overview = selectedKey
    ? `Categories: ${categoryKeys.map(key => key === selectedKey ? `**${key}**` : key).join(' • ')}`
    : `Categories: ${categoryKeys.map(key => `\`${key}\``).join(' • ')}`;
  embed.setDescription(`${overview}\nUse \`${PREFIX} help <category>\` or \`/help <category>\` to drill down.`);

  return sendStyledEmbed(message, embed, 'info');
}

async function showInfo(message) {
  const totalPlayers = playerData.size;
  const totalCoins = Array.from(playerData.values()).reduce((sum, p) => sum + p.coins, 0);
  
  const embed = new EmbedBuilder()
    .setColor('#00D4FF')
    .setTitle('ℹ️ Hytale Bot Information')
    .setDescription('A comprehensive Hytale-themed Discord bot with RPG mechanics, mini-games, and more!')
    .addFields(
      { name: '📊 Statistics', value: `Players: ${totalPlayers}\nTotal Coins: ${totalCoins}`, inline: true },
      { name: '🌍 World Data', value: `Items: ${ITEM_LIST.length}\nEnemies: ${ENEMIES.length}\nFactions: ${FACTIONS.length}\nBiomes: ${BIOMES.length}\nBrews: ${BREW_LIST.length}`, inline: true },
      { name: '🎮 Features', value: 'RPG System\nMini-Games\nQuests\nCombat\nEconomy\nFaction Vendors\nContracts\nArena PvP', inline: true },
      { name: '🔗 Links', value: '[Hytale Official](https://hytale.com)\n[Twitter](https://twitter.com/Hytale)', inline: true }
    )
    .setFooter({ text: 'Created for Hytale fans | Use !hy help for commands' })
    .setTimestamp();
  
  return sendStyledEmbed(message, embed, 'info');
}

async function showLore(message, topic) {
  const lore = {
    kweebec: {
      title: '🌳 The Kweebecs',
      desc: 'The Kweebecs are a peaceful, tree-dwelling race native to Orbis. They live in harmony with nature and are known for their craftsmanship and hospitality. Despite their small stature, Kweebecs are brave defenders of their forest homes.'
    },
    trork: {
      title: '🐗 The Trorks',
      desc: 'Trorks are aggressive, pig-like creatures that roam the wilderness. They travel in groups and are hostile to outsiders. While not particularly intelligent, they make up for it with ferocity and numbers.'
    },
    varyn: {
      title: '💀 The Varyn',
      desc: 'The Varyn are an undead faction that threatens Orbis. Corrupted by dark magic, they seek to spread their curse across the land. They are led by powerful necromancers and dark knights.'
    },
    orbis: {
      title: '🌍 Planet Orbis',
      desc: 'Orbis is a world of boundless adventure, featuring diverse biomes, towering mountains, deep oceans, and ancient ruins. Adventurers explore Orbis to uncover secrets and fend off dark forces.'
    }
  };
  
  const key = topic?.toLowerCase();
  const entry = lore[key];
  if (!entry) {
    return message.reply('❌ Lore topic not found! Try `kweebec`, `trork`, `varyn`, or `orbis`.');
  }
  
  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(entry.title)
    .setDescription(entry.desc)
    .setFooter({ text: 'Discover more lore by exploring Orbis!' });
  return sendStyledEmbed(message, embed, 'lore');
}
function resolveCodexEntry(category, identifier) {
  if (!category) return null;
  const lowerCat = category.toLowerCase();
  if (!identifier) return { category: lowerCat };
  const normalized = identifier.toString().trim().toLowerCase();
  switch (lowerCat) {
    case 'item':
    case 'items':
      return ITEMS[normalized] || ITEM_LIST.find(it => it.name?.toLowerCase() === normalized);
    case 'enemy':
    case 'enemies':
      return ENEMY_MAP[normalized] || ENEMY_LIST.find(e => e.name?.toLowerCase() === normalized);
    case 'faction':
    case 'factions':
      return FACTIONS.find(f => f.id?.toLowerCase() === normalized || f.name?.toLowerCase() === normalized) || null;
    case 'biome':
    case 'biomes':
      return BIOMES.find(b => b.id?.toLowerCase() === normalized || b.name?.toLowerCase() === normalized) || null;
    case 'dungeon':
    case 'dungeons':
      return resolveDungeon(normalized);
    default:
      return null;
  }
}

const CODEX_QUEST_HINTS = {
  items: `Experiment with \`${PREFIX} craft\` and gather rare drops to expand your item compendium.`,
  enemies: `Start fights using \`${PREFIX} hunt\` or tackle dungeons with \`${PREFIX} dungeon <id>\` to catalogue new foes.`,
  factions: `Grow allegiance via \`${PREFIX} reputation\`, complete \`${PREFIX} contracts\`, and visit faction vendors.`,
  biomes: `Travel with \`${PREFIX} travel <biome>\` and maintain \`${PREFIX} explore status\` to unlock new regions.`,
  dungeons: `Browse \`${PREFIX} dungeons\` and delve deeper with \`${PREFIX} descend\` to document more lairs.`
};

function registerCodexUnlock(player, category, entryId) {
  if (!player.codex) {
    player.codex = { factions: [], biomes: [], enemies: [], items: [], dungeons: [], structures: [], settlements: [] };
  }
  if (!player.codex[category]) {
    player.codex[category] = [];
  }
  const list = player.codex[category];
  if (list.includes(entryId)) return false;
  list.push(entryId);
  player.stats.codexUnlocks = (player.stats.codexUnlocks || 0) + 1;
  return true;
}

function maybeStartCodexQuest(message, player, questCategory, entryId, unlocked) {
  if (!unlocked || !questCategory) return;
  player.tutorials = player.tutorials || {};
  if (!player.tutorials.codex || typeof player.tutorials.codex !== 'object') {
    player.tutorials.codex = {};
  }

  let categoryState = player.tutorials.codex[questCategory];
  if (!categoryState || typeof categoryState !== 'object') {
    categoryState = {};
  }
  categoryState.count = (categoryState.count || 0) + 1;
  if (entryId) {
    categoryState.lastEntry = entryId;
    if (!categoryState.firstEntry) categoryState.firstEntry = entryId;
  }
  categoryState.updatedAt = Date.now();

  const hint = CODEX_QUEST_HINTS[questCategory];
  const isSelfTest = typeof message?.author?.id === 'string' && message.author.id.startsWith('SELF_TEST_');
  if (!categoryState.notified && hint) {
    categoryState.notified = true;
    if (!isSelfTest && message?.reply) {
      message.reply(`📘 Codex milestone unlocked! ${hint}`).catch(() => {});
    }
  }

  player.tutorials.codex[questCategory] = categoryState;
}

function formatTopReputation(player, limit = 3) {
  if (!player.reputation) return 'None yet';
  const ranked = Object.entries(player.reputation)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([factionId, value]) => {
      const faction = FACTIONS.find(f => f.id === factionId);
      const name = faction ? faction.name : factionId;
      return `${name}: ${value}`;
    });
  return ranked.length ? ranked.join('\n') : 'None yet';
}

function adjustFactionReputation(player, factionId, amount, message) {
  if (!factionId || !Number.isFinite(amount)) return;
  if (!player.reputation) player.reputation = {};
  player.reputation[factionId] = (player.reputation[factionId] || 0) + amount;
  if (!player.stats) player.stats = {};
  if (!player.stats.factionsAssisted) player.stats.factionsAssisted = {};
  player.stats.factionsAssisted[factionId] = (player.stats.factionsAssisted[factionId] || 0) + amount;
  if (message && amount > 0) {
    processQuestEvent(message, player, { type: 'faction', faction: factionId, count: amount });
  }
}

function resolveFaction(identifier) {
  if (!identifier) return null;
  const normalized = identifier.toLowerCase();
  return FACTIONS.find(f => f.id?.toLowerCase() === normalized || f.name?.toLowerCase() === normalized) || null;
}

function getFactionReputation(player, factionId) {
  return player.reputation?.[factionId] || 0;
}

function getFactionTierById(tierId) {
  return FACTION_TIER_LOOKUP[tierId] || { id: tierId, name: tierId, minRep: 0 };
}

function getFactionTierByReputation(reputation) {
  let tier = FACTION_TIERS[0];
  for (const candidate of FACTION_TIERS) {
    if (reputation >= candidate.minRep) {
      tier = candidate;
    }
  }
  return tier;
}

function getAccessibleFactionTierIds(reputation) {
  return FACTION_TIERS.filter(tier => reputation >= tier.min).map(tier => tier.id);
}

function getNextFactionTier(reputation) {
  for (let i = FACTION_TIERS.length - 1; i >= 0; i--) {
    if (reputation >= FACTION_TIERS[i].minRep) {
      return FACTION_TIERS[i + 1] || null;
    }
  }
  return FACTION_TIERS[0] || null;
}

function collectFactionVendors(faction, tierIds) {
  if (!faction?.tiers) return [];
  const entries = [];
  tierIds.forEach(tierId => {
    const tierData = faction.tiers?.[tierId];
    if (!tierData?.vendor) return;
    tierData.vendor.forEach(entry => {
      if (!entry?.item || !Number.isFinite(entry.price)) return;
      entries.push({ ...entry, tierId });
    });
  });
  return entries;
}

function collectFactionContracts(faction, tierIds) {
  if (!faction?.tiers) return [];
  const entries = [];
  tierIds.forEach(tierId => {
    const tierData = faction.tiers?.[tierId];
    if (!Array.isArray(tierData?.contracts)) return;
    tierData.contracts.forEach(contract => {
      if (!contract?.id) return;
      entries.push({ ...contract, tierId });
    });
  });
  return entries;
}
function getActiveContract(player, factionId) {
  if (!player.contracts) return null;
  return player.contracts[factionId] || null;
}
function formatContractGoal(contract) {
  switch (contract.type) {
    case 'gather':
      return `Gather ${contract.quantity}x ${contract.item}`;
    case 'defeat':
      return `Defeat ${contract.quantity}x ${contract.enemy}`;
    case 'dungeon':
      return `Clear ${contract.quantity}x ${contract.dungeon}`;
    case 'pvp':
      if (contract.result === 'win') return `Win ${contract.quantity} duel${contract.quantity > 1 ? 's' : ''}`;
      if (contract.result === 'loss') return `Complete ${contract.quantity} duel${contract.quantity > 1 ? 's' : ''}`;
      return `Complete ${contract.quantity} PvP match${contract.quantity > 1 ? 'es' : ''}`;
    default:
      return contract.description || 'Complete the contract objective.';
  }
}

function updateContractProgress(player, event) {
  if (!player.contracts || !event) return [];
  const completed = [];
  const delta = event.count || 1;
  for (const [factionId, contract] of Object.entries(player.contracts)) {
    if (!contract || contract.completed) continue;
    let matches = false;
    switch (contract.type) {
      case 'gather':
        matches = event.type === 'gather' && contract.item === event.itemId;
        break;
      case 'defeat':
        matches = event.type === 'defeat' && contract.enemy === event.enemyId;
        break;
      case 'dungeon':
        matches = event.type === 'dungeon' && contract.dungeon === event.dungeonId;
        break;
      case 'pvp':
        matches = event.type === 'pvp' && (!contract.result || contract.result === event.result);
        break;
      default:
        matches = false;
    }
    if (!matches) continue;
    contract.progress = Math.min(contract.quantity || 1, (contract.progress || 0) + delta);
    if (contract.progress >= (contract.quantity || 1)) {
      contract.completed = true;
      completed.push({ factionId, contract });
    }
  }
  return completed;
}
function notifyContractsReady(message, readyContracts) {
  if (!message || !readyContracts || readyContracts.length === 0) return;
  const lines = readyContracts.map(entry => {
    const faction = resolveFaction(entry.factionId);
    const factionName = faction ? faction.name : entry.factionId;
    return `✅ **${factionName}** — ${entry.contract.name}`;
  });
  if (lines.length === 0) return;
  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('📜 Contracts Ready')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Use ${PREFIX} turnincontract <faction>` });
  const payload = buildStyledPayload(embed, 'contracts', { components: buildSystemComponents('contracts') });
  message.channel.send(payload).catch(() => {});
}

function ensureCosmeticState(player) {
  if (!player.cosmetics) player.cosmetics = { titles: { owned: [], equipped: null } };
  if (!player.cosmetics.titles) player.cosmetics.titles = { owned: [], equipped: null };
  if (!Array.isArray(player.cosmetics.titles.owned)) player.cosmetics.titles.owned = [];
}
function unlockCosmetic(player, cosmetic, message) {
  ensureCosmeticState(player);
  const titles = player.cosmetics.titles;
  if (cosmetic.type === 'title') {
    if (!titles.owned.includes(cosmetic.id)) {
      titles.owned.push(cosmetic.id);
      const channel = message?.channel;
      if (channel) {
        const embed = new EmbedBuilder()
          .setColor('#F1C40F')
          .setTitle('✨ Cosmetic Unlocked')
          .setDescription(`**${cosmetic.name}** is now available!`)
          .setFooter({ text: 'Check your titles with !hy cosmetics' });
        channel.send(buildStyledPayload(embed, 'achievements')).catch(() => {});
      }
    }
  }
}
function checkCosmeticUnlocks(message, player) {
  ensureCosmeticState(player);
  COSMETIC_UNLOCKS.forEach(cosmetic => {
    try {
      if (cosmetic.condition(player)) {
        unlockCosmetic(player, cosmetic, message);
      }
    } catch (error) {
      console.warn('Cosmetic condition error:', cosmetic.id, error.message);
    }
  });
}

function describeCosmetic(cosmetic) {
  if (!cosmetic) return 'Unknown Cosmetic';
  return `${cosmetic.name}${cosmetic.description ? ` — ${cosmetic.description}` : ''}`;
}
async function showCosmetics(message) {
  const player = getPlayer(message.author.id);
  ensureCosmeticState(player);
  const titles = player.cosmetics.titles;
  const ownedSet = new Set(titles.owned || []);
  const ownedTitles = COSMETIC_UNLOCKS.filter(c => c.type === 'title' && ownedSet.has(c.id));
  const lockedTitles = COSMETIC_UNLOCKS.filter(c => c.type === 'title' && !ownedSet.has(c.id));

  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('🎭 Cosmetics — Titles');

  if (ownedTitles.length > 0) {
    const lines = ownedTitles.map(c => `${c.id === titles.equipped ? '⭐' : '•'} ${c.name}`);
    embed.addFields({ name: 'Owned', value: lines.join('\n'), inline: false });
  } else {
    embed.addFields({ name: 'Owned', value: 'No titles unlocked yet.', inline: false });
  }

  if (lockedTitles.length > 0) {
    const lines = lockedTitles.map(c => `🔒 ${describeCosmetic(c)}`);
    embed.addFields({ name: 'Locked', value: lines.join('\n'), inline: false });
  }

  embed.setFooter({ text: `Use ${PREFIX} equiptitle <id> to equip an unlocked title.` });
  message.reply({ embeds: [embed] });
}
async function equipTitle(message, titleId) {
  if (!titleId) {
    return message.reply(`❌ Usage: \`${PREFIX} equiptitle <cosmeticId>\``);
  }
  const player = getPlayer(message.author.id);
  ensureCosmeticState(player);
  const owned = new Set(player.cosmetics.titles.owned || []);
  const key = titleId.toLowerCase();
  const cosmetic = COSMETIC_UNLOCKS.find(c => c.id.toLowerCase() === key && c.type === 'title');
  if (!cosmetic) {
    return message.reply('❌ Title cosmetic not found.');
  }
  if (!owned.has(cosmetic.id)) {
    return message.reply('❌ You have not unlocked that title yet.');
  }
  player.cosmetics.titles.equipped = cosmetic.id;
  message.reply(`🎭 Equipped title: **${cosmetic.name}**`);
}
async function showCodex(message, category, entryIdentifier) {
  if (!category) {
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('📘 Orbis Codex')
      .setDescription(
        `Available categories:\n` +
        `• \`${PREFIX} codex items [id]\`\n` +
        `• \`${PREFIX} codex enemies [id]\`\n` +
        `• \`${PREFIX} codex factions [id]\`\n` +
        `• \`${PREFIX} codex biomes [id]\`\n` +
        `• \`${PREFIX} codex dungeons [id]\`\n\n` +
        `Example: \`${PREFIX} codex factions kweebec\``
      )
      .setFooter({ text: 'Discover the lore and knowledge of Hytale.' });
    return sendStyledEmbed(message, embed, 'codex');
  }

  const player = getPlayer(message.author.id);
  const lowerCat = category.toLowerCase();
  const entry = resolveCodexEntry(lowerCat, entryIdentifier);

  if (!entry) {
    if (!entryIdentifier) {
      const listEmbed = new EmbedBuilder()
        .setColor('#2980B9')
        .setTitle(`📘 Codex: ${lowerCat.charAt(0).toUpperCase()}${lowerCat.slice(1)}`);

      let lines = [];
      switch (lowerCat) {
        case 'items':
        case 'item':
          ITEM_LIST.forEach(item => {
            lines.push(`${item.emoji} **${item.id}** (${item.rarity})`);
          });
          break;
        case 'enemies':
        case 'enemy':
          ENEMY_LIST.forEach(enemy => {
            lines.push(`${enemy.emoji || '❔'} **${enemy.id || enemy.name}** — ${enemy.faction || 'wild'} (${enemy.rarity || 'common'})`);
          });
          break;
        case 'factions':
        case 'faction':
          FACTIONS.forEach(faction => {
            lines.push(`**${faction.id}** — ${faction.name}`);
          });
          break;
        case 'biomes':
        case 'biome':
          BIOMES.forEach(biome => {
            lines.push(`**${biome.id}** — ${biome.name}`);
          });
          break;
        case 'dungeons':
        case 'dungeon':
          DUNGEON_DEFINITIONS.forEach(d => {
            lines.push(`**${d.id}** — ${d.name} (Lvl ${d.minLevel || 1})`);
          });
          break;
        default:
          lines.push('Unknown category.');
      }

      addQuestField(listEmbed, 'Entries', lines);
      if (!lines.length) {
        listEmbed.setDescription('No data found for this category.');
      }
      return sendStyledEmbed(message, listEmbed, 'codex');
    }
    return message.reply('❌ Codex entry not found. Check the category or identifier.');
  }
  const embed = new EmbedBuilder().setColor('#2ECC71');
  const normalizedEntryId = entry.id || entry.name?.toLowerCase().replace(/\s+/g, '_');
  let unlocked = false;
  let questCategory = null;

  switch (lowerCat) {
    case 'item':
    case 'items': {
      questCategory = 'items';
      embed.setTitle(`${entry.emoji || '❔'} ${entry.name || entry.id}`)
        .setDescription(entry.description || 'No description available.')
        .addFields(
          { name: 'Type', value: entry.type || 'Unknown', inline: true },
          { name: 'Rarity', value: entry.rarity || 'Unknown', inline: true },
          { name: 'Value', value: `${entry.value || 0} coins`, inline: true }
        );
      const stats = [];
      if (entry.damage) stats.push(`Damage: ${entry.damage}`);
      if (entry.defense) stats.push(`Defense: ${entry.defense}`);
      if (entry.heal) stats.push(`Heal: ${entry.heal}`);
      if (entry.mana) stats.push(`Mana: ${entry.mana}`);
      if (entry.luck) stats.push(`Luck: ${entry.luck}`);
      if (stats.length) embed.addFields({ name: 'Attributes', value: stats.join(' • ') });
      if (entry.tags?.length) embed.addFields({ name: 'Tags', value: entry.tags.join(', ') });
      if (normalizedEntryId) {
        unlocked = registerCodexUnlock(player, 'items', normalizedEntryId);
      }
      break;
    }
    case 'enemy':
    case 'enemies': {
      questCategory = 'enemies';
      embed.setTitle(`${entry.emoji || '❔'} ${entry.name || entry.id}`)
        .setDescription(`Faction: ${entry.faction || 'Unknown'} • Biome: ${entry.biome || 'Unknown'}`)
        .addFields(
          { name: 'HP', value: `${entry.hp}`, inline: true },
          { name: 'Damage', value: `${entry.damage}`, inline: true },
          { name: 'XP Reward', value: `${entry.xp}`, inline: true },
          { name: 'Coins', value: `${entry.coins}`, inline: true }
        );
      if (entry.tags?.length) embed.addFields({ name: 'Traits', value: entry.tags.join(', ') });
      if (normalizedEntryId) {
        unlocked = registerCodexUnlock(player, 'enemies', normalizedEntryId);
      }
      break;
    }
    case 'faction':
    case 'factions': {
      questCategory = 'factions';
      embed.setTitle(`🛡️ ${entry.name}`)
        .setDescription(entry.description || 'No description available.')
        .addFields(
          { name: 'Alignment', value: entry.alignment || 'Unknown', inline: true },
          { name: 'Home Biome', value: entry.homeBiome || 'Unknown', inline: true }
        );
      if (entry.leaders?.length) embed.addFields({ name: 'Leaders', value: entry.leaders.join(', ') });
      if (entry.signatureItems?.length) embed.addFields({ name: 'Signature Items', value: entry.signatureItems.join(', ') });
      if (entry.allies?.length) embed.addFields({ name: 'Allies', value: entry.allies.join(', ') });
      if (entry.rivals?.length) embed.addFields({ name: 'Rivals', value: entry.rivals.join(', ') });
      if (entry.traits?.length) embed.addFields({ name: 'Traits', value: entry.traits.join(', ') });
      if (normalizedEntryId) {
        unlocked = registerCodexUnlock(player, 'factions', normalizedEntryId);
      }
      break;
    }
    case 'biome':
    case 'biomes': {
      questCategory = 'biomes';
      embed.setTitle(`🌍 ${entry.name}`)
        .setDescription(entry.description || 'No description available.')
        .addFields(
          { name: 'Climate', value: entry.climate || 'Unknown', inline: true },
          { name: 'Factions', value: (entry.factions || []).join(', ') || 'None', inline: true }
        );
      if (entry.threats?.length) embed.addFields({ name: 'Threats', value: entry.threats.join(', ') });
      if (entry.notableLocations?.length) embed.addFields({ name: 'Notable Locations', value: entry.notableLocations.join(', ') });
      if (normalizedEntryId) {
        unlocked = registerCodexUnlock(player, 'biomes', normalizedEntryId);
      }
      break;
    }
    case 'dungeon':
    case 'dungeons': {
      questCategory = 'dungeons';
      embed.setTitle(`🏰 ${entry.name}`)
        .setDescription(entry.environment || 'Delve into this dungeon for rare loot and challenges.')
        .addFields(
          { name: 'Theme', value: entry.theme || 'Unknown', inline: true },
          { name: 'Biome', value: entry.biome || 'Unknown', inline: true },
          { name: 'Minimum Level', value: `${entry.minLevel || 1}`, inline: true }
        );
      const completionItems = Array.isArray(entry.completionReward?.items) ? entry.completionReward.items : [];
      if (completionItems.length) {
        const lines = completionItems.map(item => `${item.item} x${item.quantity || item.amount || 1}`);
        embed.addFields({ name: 'Completion Rewards', value: lines.join('\n') });
      }
      embed.addFields({ name: 'Floors', value: `${entry.floors?.length || 0}` });
      if (normalizedEntryId) {
        unlocked = registerCodexUnlock(player, 'dungeons', normalizedEntryId);
      }
      break;
    }
    default:
      embed.setDescription('No codex data found.');
  }

  if (unlocked && questCategory && normalizedEntryId) {
    processQuestEvent(message, player, { type: 'codex', category: questCategory, entry: normalizedEntryId, count: 1 });
  }

  if (questCategory) {
    maybeStartCodexQuest(message, player, questCategory, normalizedEntryId, unlocked);
}
  return sendStyledEmbed(message, embed, 'codex');
}
async function showReputation(message, factionIdentifier) {
  const player = getPlayer(message.author.id);

  if (!factionIdentifier) {
    const all = Object.entries(player.reputation || {}).sort((a, b) => b[1] - a[1]);
    const lines = all.length
      ? all.map(([id, value]) => {
          const faction = FACTIONS.find(f => f.id === id);
          const name = faction ? faction.name : id;
          return `${name}: ${value}`;
        })
      : ['No reputation tracked yet. Complete quests, events, and dungeons to earn favor.'];

    const embed = new EmbedBuilder()
      .setColor('#1ABC9C')
      .setTitle('🤝 Faction Reputation')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Gain reputation via quests, events, and dungeon rewards.' });

    return sendStyledEmbed(message, embed, 'reputation');
  }

  const normalized = factionIdentifier.toLowerCase();
  const faction = FACTIONS.find(f => f.id?.toLowerCase() === normalized || f.name?.toLowerCase() === normalized);

  if (!faction) {
    return message.reply('❌ Faction not found. Try `!hy reputation` to view all factions.');
  }

  const reputationValue = player.reputation?.[faction.id] || 0;
  const allies = faction.allies?.length ? faction.allies.join(', ') : 'None listed';
  const rivals = faction.rivals?.length ? faction.rivals.join(', ') : 'None listed';

  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(`🤝 ${faction.name}`)
    .setDescription(faction.description || 'No description available.')
    .addFields(
      { name: 'Reputation', value: `${reputationValue}`, inline: true },
      { name: 'Home Biome', value: faction.homeBiome || 'Unknown', inline: true },
      { name: 'Leaders', value: faction.leaders?.join(', ') || 'Unknown' },
      { name: 'Allies', value: allies },
      { name: 'Rivals', value: rivals },
      { name: 'Signature Items', value: faction.signatureItems?.join(', ') || 'Unknown' }
    )
    .setFooter({ text: `Complete faction activities to gain reputation. Use ${PREFIX} vendor ${faction.id} and ${PREFIX} contracts ${faction.id} for services.` });

  const reputationThresholds = [
    { name: 'Friendly', value: 50 },
    { name: 'Honored', value: 150 },
    { name: 'Exalted', value: 300 }
  ];
  const nextThreshold = reputationThresholds.find(t => reputationValue < t.value);
  if (nextThreshold) {
    embed.addFields({ name: 'Next Rank', value: `${nextThreshold.name} at ${nextThreshold.value} reputation.` });
  } else if (reputationValue > 0) {
    embed.addFields({ name: 'Status', value: 'You are at the pinnacle of renown with this faction!' });
  }
  
  return sendStyledEmbed(message, embed, 'reputation');
}

// ==================== TWEET TRACKER ====================
async function setupTweetTracker(message) {
  message.reply('✅ Tweet tracker channel set! I\'ll post Hytale tweets here. Checking every 10 minutes.');
  
  // Store the channel ID for this guild
  lastTweetId.set(message.guild.id, { channelId: message.channel.id, lastId: null });
}
async function checkTweets(message, manual = false) {
  try {
    // Note: This is a simplified version. In production, you'd use Twitter API v2
    // For demonstration, this shows the structure
    
    const response = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
      params: {
        query: 'from:Hytale',
        max_results: 5,
        'tweet.fields': 'created_at,text'
      },
      headers: {
        'Authorization': 'Bearer YOUR_TWITTER_BEARER_TOKEN' // Users need to add their token
      }
    }).catch(() => null);
    
    if (!response || !response.data) {
      if (manual) {
        return message.reply('❌ Unable to fetch tweets. Make sure the bot has a valid Twitter API token configured.');
      }
      return;
    }
    
    const tweets = response.data.data;
    if (!tweets || tweets.length === 0) {
      if (manual) return message.reply('No recent tweets found.');
      return;
    }
    
    const guildData = lastTweetId.get(message.guild.id);
    const latestTweet = tweets[0];
    
    if (guildData && latestTweet.id !== guildData.lastId) {
      const channel = await client.channels.fetch(guildData.channelId);
      
      const embed = new EmbedBuilder()
        .setColor('#1DA1F2')
        .setTitle('🐦 New Hytale Tweet!')
        .setDescription(latestTweet.text)
        .setURL(`https://twitter.com/Hytale/status/${latestTweet.id}`)
        .setTimestamp(new Date(latestTweet.created_at))
        .setFooter({ text: 'Hytale (@Hytale) on Twitter' });
      
      const payload = buildStyledPayload(embed, 'info');
      payload.content = '@everyone New Hytale tweet!';
      channel.send(payload).catch(() => {});
      
      guildData.lastId = latestTweet.id;
    }
    
    if (manual) {
      const embed = new EmbedBuilder()
        .setColor('#1DA1F2')
        .setTitle('🐦 Latest Hytale Tweet')
        .setDescription(latestTweet.text)
        .setURL(`https://twitter.com/Hytale/status/${latestTweet.id}`)
        .setTimestamp(new Date(latestTweet.created_at));
      
      return sendStyledEmbed(message, embed, 'info');
    }
  } catch (error) {
    console.error('Tweet fetch error:', error);
    if (manual) {
      message.reply('❌ Error fetching tweets. Check console for details.');
    }
  }
}
// Check tweets every 10 minutes
cron.schedule('*/10 * * * *', () => {
  for (const [guildId, data] of lastTweetId) {
    client.guilds.fetch(guildId).then(guild => {
      checkTweets({ guild }, false);
    });
  }
});
// ==================== ADMIN COMMANDS ====================
async function resetPlayer(message, targetUser) {
  const target = await resolveUserFromInput(message, targetUser);
  if (!target) return message.reply('❌ Please mention a user to reset!');
  
  playerData.delete(target.id);
  message.reply(`✅ Reset ${target.username}'s progress!`);
}

async function addCoinsAdmin(message, targetUser, amount) {
  const parsedAmount = Number(amount);
  if (!targetUser || !parsedAmount) return message.reply('❌ Usage: !hy addcoins @user <amount>');

  const target = await resolveUserFromInput(message, targetUser);
  if (!target) return message.reply('❌ Please mention a valid user!');
  
  const player = getPlayer(target.id);
  player.coins += parsedAmount;
  message.reply(`✅ Added ${parsedAmount} coins to ${target.username}!`);
}

// ==================== BOT READY ====================
client.once('ready', async () => {
  console.log(`✅ Hytale Bot is online as ${client.user.tag}!`);
  console.log(`📊 Serving ${client.guilds.cache.size} servers`);
  
  client.user.setActivity('Hytale | !hy help', { type: 'PLAYING' });
  triggerWorldEvents();
  await registerSlashCommands(client);
  try {
    await runStartupSelfTest();
  } catch (error) {
    console.error('🧪 Startup self-test encountered an unexpected error:', error);
  }
});

client.on('interactionCreate', interaction => {
  if (interaction.isAutocomplete()) return handleSlashAutocomplete(interaction);
  if (interaction.isChatInputCommand()) return handleSlashCommand(interaction);
  if (interaction.isStringSelectMenu()) return handleSelectMenuInteraction(interaction);
  if (interaction.isButton()) return handleButtonInteraction(interaction);
  return null;
});
// ==================== LOGIN ====================
// Replace with your bot token

client.login(TOKEN);
const MATERIAL_DROPS = [
  { item: 'ancient_bark', chance: 0.45, min: 1, max: 3 },
  { item: 'sunstone_shard', chance: 0.3, min: 1, max: 2 },
  { item: 'iron_ingot', chance: 0.25, min: 1, max: 2 },
  { item: 'void_essence', chance: 0.2, min: 1, max: 1 },
  { item: 'luminite_core', chance: 0.08, min: 1, max: 1 },
  { item: 'stormcore_shard', chance: 0.18, min: 1, max: 2 },
  { item: 'ember_resin', chance: 0.22, min: 1, max: 3 },
  { item: 'frost_wisp', chance: 0.16, min: 1, max: 2 },
  { item: 'voidthread', chance: 0.14, min: 1, max: 2 },
  { item: 'siren_scale', chance: 0.15, min: 1, max: 2 },
  { item: 'gale_feather', chance: 0.24, min: 1, max: 3 },
  { item: 'desert_spice', chance: 0.28, min: 1, max: 4 },
  { item: 'shadowcap_mushroom', chance: 0.2, min: 1, max: 2 },
  { item: 'wyrmroot_seed', chance: 0.12, min: 1, max: 1 },
  { item: 'aurora_fragment', chance: 0.1, min: 1, max: 1 },
  { item: 'ember_crystal_cluster', chance: 0.08, min: 1, max: 1 },
  { item: 'sunken_pearl', chance: 0.06, min: 1, max: 1 },
  { item: 'emberglass_vial', chance: 0.2, min: 1, max: 2 }
];

function resolveDungeon(identifier) {
  if (!identifier) return null;
  const normalized = identifier.toString().trim().toLowerCase();
  if (DUNGEON_LOOKUP[normalized]) return DUNGEON_LOOKUP[normalized];
  return DUNGEON_DEFINITIONS.find(d => d.name?.toLowerCase() === normalized) || null;
}
async function showDungeons(message) {
  const player = getPlayer(message.author.id);
  const embed = new EmbedBuilder()
    .setColor('#8E44AD')
    .setTitle('🗺️ Dungeon Atlas')
    .setDescription(`Level ${player.level} | Use \`${PREFIX} dungeon <id>\` to start a delve.`)
    .setFooter({ text: `Active quests: ${player.quests.length}/${MAX_ACTIVE_QUESTS}` });

  const available = [];
  const locked = [];

  DUNGEON_DEFINITIONS.forEach(def => {
    const minLevel = def.minLevel || 1;
    const floors = def.floors?.length || 0;
    const rewardItems = Array.isArray(def.completionReward?.items) ? def.completionReward.items : [];
    const rewardPreview = rewardItems.length > 0
      ? rewardItems.map(entry => {
          const data = ITEMS[entry.item];
          return `${data ? data.emoji + ' ' : ''}${entry.item} x${entry.quantity || entry.amount || 1}`;
        }).join(', ')
      : `${def.completionReward?.coins?.base || 0} coins`;
    const summary = `\`${def.id}\` **${def.name}** (Lvl ${minLevel}${def.recommendedPower ? ` • Power ${def.recommendedPower}` : ''})\nFloors: ${floors} • Theme: ${def.theme || 'Unknown'}\nRewards: ${rewardPreview}`;
    if (player.level >= minLevel) {
      available.push(summary);
    } else {
      locked.push(`${summary}\n🔒 Requires level ${minLevel}`);
    }
  });

  addQuestField(embed, '✨ Available Dungeons', available);
  addQuestField(embed, '🔒 Locked Dungeons', locked);

  if (!available.length && !locked.length) {
    embed.setDescription('No dungeon data found.');
  }

  return sendStyledEmbed(message, embed, 'exploration');
}
const ACHIEVEMENTS = [
  {
    id: 'first_blood',
    name: 'First Blood',
    emoji: '🩸',
    requirement: { type: 'stat', key: 'kills', value: 1 },
    reward: { coins: 75, xp: 40 },
    description: 'Defeat your first enemy.'
  },
  {
    id: 'monster_hunter',
    name: 'Monster Hunter',
    emoji: '🐲',
    requirement: { type: 'stat', key: 'kills', value: 25 },
    reward: { coins: 250, xp: 180 },
    description: 'Defeat 25 enemies in battle.'
  },
  {
    id: 'artisan',
    name: 'Seasoned Artisan',
    emoji: '🛠️',
    requirement: { type: 'stat', key: 'crafted', value: 5 },
    reward: { coins: 180, xp: 120, item: 'focus_elixir', itemAmount: 1 },
    description: 'Craft 5 items at the workshop.'
  },
  {
    id: 'master_crafter',
    name: 'Master Crafter',
    emoji: '🎨',
    requirement: { type: 'stat', key: 'crafted', value: 20 },
    reward: { coins: 400, xp: 280, item: 'kweebec_charm', itemAmount: 1 },
    description: 'Craft 20 total items.'
  },
  {
    id: 'dungeon_delver',
    name: 'Dungeon Delver',
    emoji: '🏰',
    requirement: { type: 'stat', key: 'dungeonsCleared', value: 1 },
    reward: { coins: 300, xp: 220 },
    description: 'Clear your first dungeon.'
  },
  {
    id: 'depth_conqueror',
    name: 'Depth Conqueror',
    emoji: '👑',
    requirement: { type: 'stat', key: 'dungeonsCleared', value: 5 },
    reward: { coins: 800, xp: 450, item: 'guardian_armor', itemAmount: 1 },
    description: 'Clear 5 dungeons to master the depths.'
  },
  {
    id: 'wealthy',
    name: 'Wealth of Orbis',
    emoji: '💰',
    requirement: { type: 'coins', value: 1000 },
    reward: { coins: 0, xp: 150, item: 'kweebec_charm', itemAmount: 1 },
    description: 'Accumulate 1,000 coins at once.'
  },
  {
    id: 'adventurer',
    name: 'Seasoned Adventurer',
    emoji: '⭐',
    requirement: { type: 'level', value: 10 },
    reward: { coins: 350, xp: 0 },
    description: 'Reach level 10.'
  },
  {
    id: 'collector',
    name: 'Treasure Collector',
    emoji: '🎒',
    requirement: { type: 'inventorySize', value: 10 },
    reward: { coins: 220, xp: 140 },
    description: 'Hold 10 unique item types in your inventory.'
  },
  {
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    emoji: '🗝️',
    requirement: { type: 'inventorySize', value: 20 },
    reward: { coins: 320, xp: 220, item: 'skyseer_talisman', itemAmount: 1 },
    description: 'Collect 20 distinct items across your travels.'
  },
  {
    id: 'artisan_supreme',
    name: 'Artisan Supreme',
    emoji: '🏆',
    requirement: { type: 'stat', key: 'crafted', value: 60 },
    reward: { coins: 900, xp: 600, item: 'sunforged_blade', itemAmount: 1 },
    description: 'Craft 60 items to be recognized as a master artisan.'
  },
  {
    id: 'relentless',
    name: 'Relentless Slayer',
    emoji: '⚔️',
    requirement: { type: 'stat', key: 'kills', value: 200 },
    reward: { coins: 650, xp: 420, item: 'frostbite_blade', itemAmount: 1 },
    description: 'Defeat 200 enemies across Orbis.'
  },
  {
    id: 'raid_hero',
    name: 'Raid Hero',
    emoji: '🛡️',
    requirement: { type: 'stat', key: 'dungeonsCleared', value: 10 },
    reward: { coins: 1200, xp: 800, item: 'obsidian_shield', itemAmount: 1 },
    description: 'Complete 10 dungeon delves to safeguard Orbis.'
  },
  {
    id: 'fortune_keeper',
    name: 'Fortune Keeper',
    emoji: '💎',
    requirement: { type: 'coins', value: 5000 },
    reward: { coins: 0, xp: 600, item: 'skyflare_pendant', itemAmount: 1 },
    description: 'Reach a personal wealth milestone of 5,000 coins.'
  },
  {
    id: 'codex_curator',
    name: 'Codex Curator',
    emoji: '📚',
    requirement: { type: 'inventorySize', value: 30 },
    reward: { coins: 500, xp: 400, item: 'lumin_archivist_tome', itemAmount: 1 },
    description: 'Collect 30 unique items and document them in the Codex.'
  }
];

function getEventDefinition(eventId) {
  if (!eventId) return null;
  const normalized = eventId.toLowerCase();
  return EVENT_LOOKUP[normalized] || EVENT_DEFINITIONS.find(event => event.name?.toLowerCase() === normalized);
}
function formatEventEmbed(eventDef, expiresAt) {
  const embed = new EmbedBuilder()
    .setColor('#E67E22')
    .setTitle(`🌟 World Event: ${eventDef.name}`)
    .setDescription(eventDef.description || 'A special event has begun!')
    .addFields(
      { name: 'Faction', value: eventDef.faction || 'Unknown', inline: true },
      { name: 'Duration', value: `${eventDef.durationMinutes || 30} minutes`, inline: true }
    )
    .setFooter({ text: eventDef.participation || `Use ${PREFIX} participate <eventId>` });

  if (expiresAt) {
    const minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
    embed.addFields({ name: 'Time Remaining', value: `${minutes} minutes` });
  }

  const reward = eventDef.reward || {};
  const rewards = [];
  if (reward.coins) rewards.push(`${reward.coins} coins`);
  if (reward.xp) rewards.push(`${reward.xp} XP`);
  if (reward.reputation) {
    const repLines = Object.entries(reward.reputation).map(([faction, value]) => `${faction}: +${value} rep`);
    rewards.push(`Reputation → ${repLines.join(', ')}`);
  }
  if (Array.isArray(reward.items) && reward.items.length > 0) {
    const itemLines = reward.items.map(entry => `${entry.item} x${entry.quantity || entry.amount || 1}`);
    rewards.push(`Items → ${itemLines.join(', ')}`);
  }
  if (rewards.length) embed.addFields({ name: 'Rewards', value: rewards.join('\n') });

  return embed;
}

async function endWorldEvent(guildId, reason = 'The event has concluded!') {
  const state = ACTIVE_WORLD_EVENTS.get(guildId);
  if (!state) return;
  ACTIVE_WORLD_EVENTS.delete(guildId);
  if (state.timeoutId) clearTimeout(state.timeoutId);

  try {
    const channel = await client.channels.fetch(state.channelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle(`🌙 ${state.definition.name} Ended`)
        .setDescription(reason)
        .setFooter({ text: 'Stay tuned for the next world event!' });
      sendStyledChannelMessage(channel, embed, 'events').catch(() => {});
    }
  } catch (error) {
    console.warn('Failed to send event end message:', error.message);
  }
}

function scheduleEventTimeout(guildId) {
  const state = ACTIVE_WORLD_EVENTS.get(guildId);
  if (!state) return;
  const remaining = Math.max(0, state.expiresAt - Date.now());
  if (state.timeoutId) clearTimeout(state.timeoutId);
  state.timeoutId = setTimeout(() => endWorldEvent(guildId), remaining);
}
async function triggerWorldEvents() {
  for (const [guildId, subscription] of EVENT_SUBSCRIPTIONS.entries()) {
    try {
      const channel = await client.channels.fetch(subscription.channelId);
      if (!channel) continue;

      const existing = ACTIVE_WORLD_EVENTS.get(guildId);
      if (existing && existing.expiresAt > Date.now()) continue;

      const eventDef = subscription.preferredEvent ? getEventDefinition(subscription.preferredEvent) : null;
      const selected = eventDef || EVENT_DEFINITIONS[Math.floor(Math.random() * EVENT_DEFINITIONS.length)];
      if (!selected) continue;

      const expiresAt = Date.now() + (selected.durationMinutes || 30) * 60000;
      const state = {
        definition: selected,
        channelId: subscription.channelId,
        guildId,
        startedAt: Date.now(),
        expiresAt,
        participants: new Set(),
        timeoutId: null
      };
      ACTIVE_WORLD_EVENTS.set(guildId, state);
      scheduleEventTimeout(guildId);

      const embed = formatEventEmbed(selected, expiresAt);
      const payload = buildStyledPayload(embed, 'events');
      payload.content = '@here A world event has begun!';
      await channel.send(payload).catch(() => {});
    } catch (error) {
      console.warn('Failed to trigger world event for guild', guildId, error.message);
    }
  }
}
async function subscribeEvents(message, option) {
  if (!message.member.permissions.has('Administrator')) {
    return message.reply('❌ You need Administrator permissions to configure event alerts.');
  }

  if (option && option.toLowerCase() === 'off') {
    EVENT_SUBSCRIPTIONS.delete(message.guild.id);
    await endWorldEvent(message.guild.id, 'World event notifications have been disabled for this server.');
    return message.reply('✅ Automated world events disabled for this server.');
  }

  let preferredEvent = null;
  if (option) {
    const def = getEventDefinition(option);
    if (!def) {
      return message.reply('❌ Unknown event. Use `!hy eventstatus` to view active events or omit the id for random rotations.');
    }
    preferredEvent = def.id.toLowerCase();
  }

  EVENT_SUBSCRIPTIONS.set(message.guild.id, { channelId: message.channel.id, preferredEvent });
  message.reply('✅ This channel will now receive automated world event announcements every 30 minutes.');
}
async function showEventStatus(message) {
  const state = ACTIVE_WORLD_EVENTS.get(message.guild.id);
  if (!state || state.expiresAt < Date.now()) {
    if (state) await endWorldEvent(message.guild.id);
    return message.reply('There are no active world events right now.');
  }

  const embed = formatEventEmbed(state.definition, state.expiresAt);
  embed.addFields({ name: 'Participants', value: `${state.participants.size}`, inline: true });
  return sendStyledEmbed(message, embed, 'events');
}
async function participateInEvent(message, eventIdInput) {
  const state = ACTIVE_WORLD_EVENTS.get(message.guild.id);
  if (!state || state.expiresAt < Date.now()) {
    if (state) await endWorldEvent(message.guild.id);
    return message.reply('❌ No active event to participate in.');
  }

  const activeId = state.definition.id.toLowerCase();
  if (eventIdInput && eventIdInput.toLowerCase() !== activeId) {
    return message.reply(`❌ This server is currently running **${state.definition.name}**. Use \`${PREFIX} participate ${activeId}\`.`);
  }

  if (state.participants.has(message.author.id)) {
    return message.reply('⚠️ You have already claimed rewards for this event.');
  }

  const player = getPlayer(message.author.id);
  state.participants.add(message.author.id);

  const reward = state.definition.reward || {};
  const rewardLines = [];

  if (reward.coins) {
    player.coins += reward.coins;
    rewardLines.push(`+${reward.coins} coins`);
  }
  let leveled = false;
  if (reward.xp) {
    leveled = addXp(player, reward.xp) || leveled;
    rewardLines.push(`+${reward.xp} XP`);
  }
  if (reward.reputation) {
    Object.entries(reward.reputation).forEach(([factionId, amount]) => {
      adjustFactionReputation(player, factionId, amount, message);
      rewardLines.push(`${factionId}: +${amount} reputation`);
    });
  }
  if (Array.isArray(reward.items)) {
    reward.items.forEach(entry => {
      const quantity = entry.quantity || entry.amount || 1;
      addItemToInventory(player, entry.item, quantity);
      processQuestEvent(message, player, { type: 'gather', itemId: entry.item, count: quantity });
      rewardLines.push(`${entry.item} x${quantity}`);
    });
  }

  player.stats.eventsParticipated = (player.stats.eventsParticipated || 0) + 1;

  const successMessage = state.definition.successMessage || 'Thanks for helping during the event!';
  const embed = new EmbedBuilder()
    .setColor('#F1C40F')
    .setTitle(`✅ Participated: ${state.definition.name}`)
    .setDescription(successMessage)
    .addFields({ name: 'Rewards', value: rewardLines.join('\n') || 'No rewards listed.' })
    .setFooter({ text: 'Check the event log channel for global progress updates.' });

  if (leveled) {
    embed.addFields({ name: '⭐ Level Up!', value: `You reached level ${player.level}!` });
  }

  return sendStyledEmbed(message, embed, 'events');
}

cron.schedule('*/30 * * * *', () => {
  triggerWorldEvents();
});
cron.schedule('*/15 * * * *', () => {
  processAllBasesTick();
});

const BREW_BUFF_RULES = {
  regen: { label: 'Regeneration', healAfterBattle: 0.1 },
  haste: { label: 'Haste', damageBonus: 2 },
  fire_resist: { label: 'Fire Resist', enemyDamageReduction: 3 },
  heat_resist: { label: 'Heat Resist', enemyDamageReduction: 2 },
  spell_power: { label: 'Spell Power', damageBonus: 3 },
  fire_power: { label: 'Fire Power', damageBonus: 3 },
  water_affinity: { label: 'Water Affinity', defenseBonus: 2 },
  clarity: { label: 'Clarity', xpBonus: 0.15 },
  luminescence: { label: 'Luminescence', lootBonus: 0.1 }
};

function cleanupExpiredBuffs(player) {
  if (!player.activeBuffs) return;
  const now = Date.now();
  for (const [key, details] of Object.entries(player.activeBuffs)) {
    if (!details || details.expiresAt <= now) {
      delete player.activeBuffs[key];
    }
  }
}

function formatBuffDuration(expiresAt) {
  const remainingSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
function formatActiveBuffs(player) {
  cleanupExpiredBuffs(player);
  if (!player.activeBuffs || Object.keys(player.activeBuffs).length === 0) {
    return 'None';
  }
  const lines = [];
  for (const [buffId, details] of Object.entries(player.activeBuffs)) {
    const rule = BREW_BUFF_RULES[buffId] || {};
    const label = details?.label || rule.label || buffId;
    lines.push(`${label} (${formatBuffDuration(details.expiresAt)})`);
  }
  return lines.join('\n');
}
function getBrewModifiers(player) {
  cleanupExpiredBuffs(player);
  const modifiers = {
    damageBonus: 0,
    defenseBonus: 0,
    enemyDamageReduction: 0,
    xpBonus: 0,
    lootBonus: 0,
    healAfterBattle: 0
  };
  if (!player.activeBuffs) return modifiers;
  for (const [buffId] of Object.entries(player.activeBuffs)) {
    const rule = BREW_BUFF_RULES[buffId];
    if (!rule) continue;
    if (rule.damageBonus) modifiers.damageBonus += rule.damageBonus;
    if (rule.defenseBonus) modifiers.defenseBonus += rule.defenseBonus;
    if (rule.enemyDamageReduction) modifiers.enemyDamageReduction += rule.enemyDamageReduction;
    if (rule.xpBonus) modifiers.xpBonus += rule.xpBonus;
    if (rule.lootBonus) modifiers.lootBonus += rule.lootBonus;
    if (rule.healAfterBattle) modifiers.healAfterBattle = Math.max(modifiers.healAfterBattle, rule.healAfterBattle);
  }
  return modifiers;
}

function applyPostBattleBuffs(player, battleLog) {
  const modifiers = getBrewModifiers(player);
  const messages = [];
  if (modifiers.healAfterBattle > 0) {
    const healAmount = Math.max(5, Math.floor(player.maxHp * modifiers.healAfterBattle));
    if (healAmount > 0) {
      player.hp = Math.min(player.maxHp, player.hp + healAmount);
      messages.push(`🌿 Regeneration restores ${healAmount} HP. (${player.hp}/${player.maxHp})`);
    }
  }
  if (messages.length && battleLog) {
    battleLog.push('', ...messages);
  }
  return messages;
}

function applyBrewBuff(player, brew) {
  if (!brew?.effects?.buff) return null;
  if (!player.activeBuffs) player.activeBuffs = {};
  const buffId = brew.effects.buff.toLowerCase();
  const rule = BREW_BUFF_RULES[buffId];
  const label = rule?.label || buffId;
  const existing = player.activeBuffs[buffId];
  const baseTime = existing && existing.expiresAt > Date.now() ? existing.expiresAt : Date.now();
  const expiresAt = baseTime + brew.durationSeconds * 1000;
  player.activeBuffs[buffId] = { expiresAt, source: brew.id, label };
  return { buffId, label, expiresAt };
}

function randomBetween(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (max < min) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function buildPlayerCombatProfile(player, options = {}) {
  const modifiers = options.modifiers || {};
  const baseAttributes = player.attributes || { power: 10, agility: 8, resilience: 8, focus: 6 };
  const { sets: activeSets, bonuses: setBonuses } = getActiveItemSetData(player);
  const effectiveAttributes = {
    power: (baseAttributes.power || 0) + (setBonuses.attributes.power || 0),
    agility: (baseAttributes.agility || 0) + (setBonuses.attributes.agility || 0),
    resilience: (baseAttributes.resilience || 0) + (setBonuses.attributes.resilience || 0),
    focus: (baseAttributes.focus || 0) + (setBonuses.attributes.focus || 0)
  };
  const weaponId = player.equipped?.weapon;
  const armorId = player.equipped?.armor;
  const weapon = weaponId ? ITEMS[weaponId] : null;
  const armor = armorId ? ITEMS[armorId] : null;
  const baseDamageMin = weapon?.damageMin || weapon?.damage || 5;
  const baseDamageMax = weapon?.damageMax || (weapon?.damage ? weapon.damage + 2 : 8);
  const damageBonus = Math.floor(effectiveAttributes.power * 0.3) + (modifiers.damageBonus || 0) + (setBonuses.damageBonus || 0);
  const defenseBonus = Math.floor(effectiveAttributes.resilience * 0.5) + (modifiers.defenseBonus || 0) + (setBonuses.defenseBonus || 0);
  const resistances = { ...(armor?.resistances || {}) };
  mergeResistances(resistances, setBonuses.resistances);
  Object.keys(resistances).forEach(key => {
    resistances[key] = Math.min(0.9, Math.max(0, Number(resistances[key])));
  });
  const dodgeChance = Math.min(0.45, (armor?.dodgeChance || 0) + effectiveAttributes.agility * 0.003 + (setBonuses.dodgeChance || 0));
  const blockChance = Math.min(0.4, (armor?.blockChance || 0) + (setBonuses.blockChance || 0));
  const critChance = Math.min(0.6, (weapon?.critChance || 0.05) + effectiveAttributes.agility * 0.004 + (setBonuses.critChance || 0));
  const critMultiplier = Math.max(1.5, (weapon?.critMultiplier || 1.5) + effectiveAttributes.focus * 0.01 + (setBonuses.critMultiplier || 0));
  const accuracy = Math.min(0.99, Math.max(0.1, (weapon?.accuracy || 0.9) + effectiveAttributes.focus * 0.002 + (setBonuses.accuracyBonus || 0)));
  const damageType = weapon?.damageType || 'physical';
  const damageMultiplier = Math.max(0.1, 1 + (setBonuses.damageMultiplier || 0) + (modifiers.damageMultiplier || 0));
  const flatDamageReduction = Math.max(0, (modifiers.enemyDamageReduction || 0) + (setBonuses.flatDamageReduction || 0));

  return {
    label: options.label || 'Adventurer',
    hpRef: player,
    maxHp: player.maxHp,
    damageMin: Math.max(1, baseDamageMin),
    damageMax: Math.max(baseDamageMin, baseDamageMax),
    damageBonus,
    damageMultiplier,
    damageType,
    critChance: Math.max(0, critChance),
    critMultiplier,
    accuracy,
    defense: Math.max(0, (armor?.defense || 0) + defenseBonus),
    resistances,
    dodgeChance: Math.max(0, dodgeChance),
    blockChance: Math.max(0, blockChance),
    flatDamageReduction,
    activeSets
  };
}

function buildEnemyCombatProfile(enemy) {
  const damage = Number.isFinite(enemy.damage) ? enemy.damage : 6;
  const damageMin = Number.isFinite(enemy.damageMin) ? enemy.damageMin : Math.max(1, damage - 2);
  const damageMax = Number.isFinite(enemy.damageMax) ? enemy.damageMax : Math.max(damageMin, damage + 2);
  const resistances = {};
  if (enemy.resistances && typeof enemy.resistances === 'object') {
    Object.entries(enemy.resistances).forEach(([key, value]) => {
      if (value == null) return;
      resistances[key.toLowerCase()] = Math.min(0.9, Math.max(0, Number(value)));
    });
  }
  if (enemy.hp == null) enemy.hp = enemy.maxHp || 30;
  const maxHp = enemy.maxHp || enemy.hp;

  return {
    label: enemy.name || enemy.id || 'Enemy',
    hpRef: enemy,
    maxHp,
    damageMin,
    damageMax,
    damageBonus: Number(enemy.damageBonus || 0),
    damageType: (enemy.damageType || 'physical').toLowerCase(),
    critChance: Math.max(0, Number(enemy.critChance || 0.05)),
    critMultiplier: Math.max(1.3, Number(enemy.critMultiplier || 1.5)),
    accuracy: Math.min(0.99, Math.max(0.2, Number(enemy.accuracy || 0.85))),
    defense: Math.max(0, Number(enemy.defense || 0)),
    resistances,
    dodgeChance: Math.max(0, Number(enemy.dodgeChance || 0)),
    blockChance: Math.max(0, Number(enemy.blockChance || 0)),
    flatDamageReduction: Math.max(0, Number(enemy.damageReduction || 0)),
    damageMultiplier: Math.max(0.1, Number(enemy.damageMultiplier || 1))
  };
}

function resolveAttack(attacker, defender) {
  const accuracy = attacker.accuracy ?? 1;
  if (Math.random() > accuracy) {
    return { type: 'miss' };
  }

  if (Math.random() < (defender.dodgeChance || 0)) {
    return { type: 'dodge' };
  }

  let damage = randomBetween(attacker.damageMin || 1, attacker.damageMax || attacker.damageMin || 1);
  damage += attacker.damageBonus || 0;
  let crit = false;
  if (Math.random() < (attacker.critChance || 0)) {
    crit = true;
    damage = Math.floor(damage * (attacker.critMultiplier || 1.5));
  }

  const multiplier = attacker.damageMultiplier != null ? attacker.damageMultiplier : 1;
  damage = Math.floor(damage * multiplier);

  const mitigation = Math.floor((defender.defense || 0) * 0.4);
  damage -= mitigation;
  damage -= defender.flatDamageReduction || 0;

  const resistances = defender.resistances || {};
  const specificResistance = resistances[attacker.damageType] || 0;
  const universalResistance = resistances.all || 0;
  const totalResistance = Math.min(0.9, specificResistance + universalResistance);
  if (totalResistance > 0) {
    damage = Math.floor(damage * (1 - totalResistance));
  }

  let blocked = false;
  if (Math.random() < (defender.blockChance || 0)) {
    blocked = true;
    damage = Math.floor(damage * 0.6);
  }

  damage = Math.max(1, damage);
  defender.hpRef.hp = Math.max(0, defender.hpRef.hp - damage);

  return {
    type: 'hit',
    damage,
    crit,
    blocked,
    damageType: attacker.damageType
  };
}

function formatAttackResult(attackerLabel, defenderLabel, result, defenderHp, defenderMaxHp) {
  switch (result.type) {
    case 'miss':
      return `❌ ${attackerLabel} misses their strike!`;
    case 'dodge':
      return `💨 ${defenderLabel} dodges ${attackerLabel}'s attack!`;
    case 'hit': {
      const parts = [`${attackerLabel} hits ${defenderLabel} for ${result.damage} damage`];
      if (result.crit) parts.push('(critical!)');
      if (result.blocked) parts.push('(blocked)');
      const remaining = Math.max(0, defenderHp);
      const hpLine = defenderMaxHp ? ` (${remaining}/${defenderMaxHp} HP)` : '';
      return `⚔️ ${parts.join(' ')}${hpLine}`;
    }
    default:
      return `${attackerLabel} acts, but nothing happens.`;
  }
}
async function showBrews(message, stationFilter) {
  const player = getPlayer(message.author.id);
  const station = stationFilter ? stationFilter.toLowerCase() : null;

  const lines = BREW_LIST
    .filter(brew => !station || brew.station.toLowerCase() === station)
    .map(brew => {
      const owned = player.inventory[brew.id] || 0;
      const ingredients = Object.entries(brew.ingredients)
        .map(([item, qty]) => `${item} x${qty}`)
        .join(', ');
      const effects = [];
      if (brew.effects.heal) effects.push(`Heal +${brew.effects.heal}`);
      if (brew.effects.mana) effects.push(`Mana +${brew.effects.mana}`);
      if (brew.effects.buff) effects.push(`Buff: ${brew.effects.buff}`);
      return [
        `• **${brew.name}** (${brew.id}) — ${brew.rarity}`,
        `  Station: ${brew.station} | Owned: ${owned}`,
        `  Ingredients: ${ingredients}`,
        `  Effects: ${effects.join(', ') || 'None'}`,
        `  Description: ${brew.description}`
      ].join('\n');
    });

  const descriptions = [];
  const MAX_SECTION_LENGTH = 3500;
  let buffer = '';
  for (const line of lines) {
    const candidateLength = buffer.length ? buffer.length + 2 + line.length : line.length;
    if (candidateLength > MAX_SECTION_LENGTH && buffer.length) {
      descriptions.push(buffer);
      buffer = line;
    } else {
      buffer = buffer.length ? `${buffer}\n\n${line}` : line;
    }
  }
  if (!lines.length) {
    descriptions.push('No brews available. Gather more ingredients!');
  } else if (buffer.length) {
    descriptions.push(buffer);
  }

  const primaryEmbed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('🧪 Brewing Recipes')
    .setDescription(descriptions[0] || '')
    .setFooter({ text: station ? `Filtered by station: ${station}` : `Use ${PREFIX} brews <station> to filter` });

  if (!station) {
    primaryEmbed.addFields({ name: 'Stations', value: 'brewery, campfire' });
  }

  const payload = buildStyledPayload(primaryEmbed, 'brew');

  descriptions.slice(1).forEach((section, index) => {
    const extraEmbed = new EmbedBuilder()
      .setColor('#F39C12')
      .setTitle(`🧪 Brewing Recipes (page ${index + 2})`)
      .setDescription(section);
    payload.embeds.push(applyVisualStyle(extraEmbed, 'brew'));
  });

  message.reply(payload);
}

async function brewItem(message, brewId, amount = 1) {
  if (!brewId) {
    return message.reply(`❌ Please specify a brew ID! Example: \`${PREFIX} brew ember_ale\``);
  }

  const brewKey = brewId.toLowerCase();
  const brew = BREW_MAP[brewKey];
  if (!brew) {
    return message.reply('❌ Unknown brew! Use `!hy brews` to see available recipes.');
  }

  if (amount < 1) amount = 1;
  if (amount > 5) amount = 5;

  const player = getPlayer(message.author.id);

  const totalIngredients = {};
  for (const [ingredient, qty] of Object.entries(brew.ingredients)) {
    totalIngredients[ingredient] = qty * amount;
  }

  const missing = hasRequiredIngredients(player, totalIngredients);
  if (missing.length > 0) {
    const missingText = missing.map(m => `• ${m.item} (${m.have}/${m.required})`).join('\n');
    return message.reply(`❌ Missing ingredients:\n${missingText}`);
  }

  for (const [ingredient, qty] of Object.entries(totalIngredients)) {
    removeItemFromInventory(player, ingredient, qty);
  }

  const rarityMultiplier = { common: 12, uncommon: 18, rare: 25, epic: 35, legendary: 45 };
  const xpGain = Math.max(15, rarityMultiplier[brew.rarity] || 20) * amount;
  const leveled = addXp(player, xpGain);

  addItemToInventory(player, brew.id, amount);
  player.stats.crafted += amount;
  player.stats.brewsCrafted = (player.stats.brewsCrafted || 0) + amount;

  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle('🧪 Brewing Complete')
    .setDescription(`Brewed ${amount}x ${brew.name}!`)
    .addFields(
      { name: 'Station', value: brew.station, inline: true },
      { name: 'XP Gained', value: `${xpGain}`, inline: true },
      { name: 'Effects', value: `${brew.effects.heal ? `Heal +${brew.effects.heal}` : ''}${brew.effects.heal && brew.effects.mana ? ' | ' : ''}${brew.effects.mana ? `Mana +${brew.effects.mana}` : ''}${brew.effects.buff ? `${(brew.effects.heal || brew.effects.mana) ? ' | ' : ''}Buff: ${brew.effects.buff}` : ''}` || 'See item tooltip.', inline: false }
    )
    .setFooter({ text: 'Use !hy drink <brew> or !hy use <brew> to consume' });

  if (leveled) {
    embed.addFields({ name: '⭐ Level Up!', value: `You reached level ${player.level}!` });
  }

  await message.reply({ embeds: [embed] });
  processQuestEvent(message, player, { type: 'brew', brewId: brew.id, action: 'craft', count: amount });
  await handleAchievementCheck(message, player);
}

async function drinkBrew(message, brewId) {
  if (!brewId) {
    return message.reply(`❌ Please specify a brew ID! Example: \`${PREFIX} drink ember_ale\``);
  }
  await useItem(message, brewId);
}
async function showActiveBuffs(message) {
  const player = getPlayer(message.author.id);
  const embed = new EmbedBuilder()
    .setColor('#8E44AD')
    .setTitle('🧪 Active Buffs')
    .setDescription(formatActiveBuffs(player))
    .setFooter({ text: 'Brewed buffs expire over time. Drink more to refresh!' });
  return sendStyledEmbed(message, embed, 'brew');
}
function findUserDuel(userId) {
  for (const [channelId, duel] of ACTIVE_DUELS.entries()) {
    if (duel.challengerId === userId || duel.opponentId === userId) {
      return { channelId, duel };
    }
  }
  return null;
}
async function startDuel(message, targetInput, wagerArg) {
  const target = await resolveUserFromInput(message, targetInput);
  if (!target) {
    return message.reply(`❌ Usage: \`${PREFIX} duel @user [wager]\``);
  }
  if (target.bot) {
    return message.reply('❌ You cannot challenge bots to duels.');
  }
  if (target.id === message.author.id) {
    return message.reply('❌ You cannot duel yourself.');
  }

  if (ACTIVE_DUELS.has(message.channel.id)) {
    return message.reply('⚠️ A duel is already pending in this channel.');
  }
  if (findUserDuel(message.author.id) || findUserDuel(target.id)) {
    return message.reply('⚠️ Either you or that player is already involved in a duel.');
  }

  const wager = wagerArg ? parseInt(wagerArg, 10) : 0;
  if (Number.isNaN(wager) || wager < 0) {
    return message.reply('❌ Wager must be a positive number.');
  }

  const challenger = getPlayer(message.author.id);
  if (wager > 0 && challenger.coins < wager) {
    return message.reply(`❌ You need ${wager} coins to stake this duel.`);
  }

  const duel = {
    channelId: message.channel.id,
    challengerId: message.author.id,
    challengerName: message.author.username,
    opponentId: target.id,
    opponentName: target.username,
    wager,
    status: 'pending',
    createdAt: Date.now(),
    timeoutId: null
  };

  duel.timeoutId = setTimeout(() => {
    if (ACTIVE_DUELS.get(message.channel.id)?.createdAt === duel.createdAt) {
      ACTIVE_DUELS.delete(message.channel.id);
      const embed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('⌛ Duel Request Expired')
        .setDescription(`<@${duel.challengerId}> versus <@${duel.opponentId}> timed out.`)
        .setFooter({ text: `Send a fresh challenge with ${PREFIX} duel @user` });
      sendStyledChannelMessage(message.channel, embed, 'pvp').catch(() => {});
    }
  }, DUEL_TIMEOUT_MS);

  ACTIVE_DUELS.set(message.channel.id, duel);

  const embed = new EmbedBuilder()
    .setColor('#E74C3C')
    .setTitle('⚔️ Duel Challenge')
    .setDescription(`<@${duel.opponentId}>, you have been challenged by <@${duel.challengerId}>!`)
    .addFields(
      { name: 'Wager', value: wager > 0 ? `${wager} coins` : 'No wager', inline: true },
      { name: 'How to respond', value: `Use \`${PREFIX} accept\` to fight or \`${PREFIX} decline\` to refuse.`, inline: false }
    )
    .setFooter({ text: 'Duels expire after 2 minutes if unanswered.' });

  sendStyledChannelMessage(message.channel, embed, 'pvp').catch(() => {});
}
async function acceptDuel(message) {
  const duel = ACTIVE_DUELS.get(message.channel.id);
  if (!duel || duel.status !== 'pending') {
    return message.reply('❌ There is no pending duel to accept here.');
  }
  if (duel.opponentId !== message.author.id) {
    return message.reply('❌ Only the challenged player can accept this duel.');
  }

  const challenger = getPlayer(duel.challengerId);
  const opponent = getPlayer(duel.opponentId);

  if (duel.wager > 0) {
    if (challenger.coins < duel.wager) {
      ACTIVE_DUELS.delete(message.channel.id);
      if (duel.timeoutId) clearTimeout(duel.timeoutId);
      return message.reply('❌ Challenger no longer has enough coins for the wager. Duel cancelled.');
    }
    if (opponent.coins < duel.wager) {
      ACTIVE_DUELS.delete(message.channel.id);
      if (duel.timeoutId) clearTimeout(duel.timeoutId);
      return message.reply('❌ You do not have enough coins to cover the wager.');
    }
    challenger.coins -= duel.wager;
    opponent.coins -= duel.wager;
    duel.pot = duel.wager * 2;
  } else {
    duel.pot = 0;
  }

  duel.status = 'active';
  if (duel.timeoutId) clearTimeout(duel.timeoutId);

  await executeDuel(message, duel, challenger, opponent);
  ACTIVE_DUELS.delete(message.channel.id);
}

async function declineDuel(message) {
  const duel = ACTIVE_DUELS.get(message.channel.id);
  if (!duel || duel.status !== 'pending') {
    return message.reply('❌ There is no pending duel to decline here.');
  }
  if (duel.opponentId !== message.author.id) {
    return message.reply('❌ Only the challenged player can decline this duel.');
  }
  if (duel.timeoutId) clearTimeout(duel.timeoutId);
  ACTIVE_DUELS.delete(message.channel.id);
  const embed = new EmbedBuilder()
    .setColor('#95A5A6')
    .setTitle('🚫 Duel Declined')
    .setDescription(`<@${duel.opponentId}> declined the duel from <@${duel.challengerId}>.`)
    .setFooter({ text: `Challenge again with ${PREFIX} duel @user` });
  sendStyledChannelMessage(message.channel, embed, 'pvp').catch(() => {});
}
async function executeDuel(message, duel, challengerPlayer, opponentPlayer) {
  const channel = message.channel;
  const challengerUser = await client.users.fetch(duel.challengerId);
  const opponentUser = await client.users.fetch(duel.opponentId);

  const challengerModifiers = getBrewModifiers(challengerPlayer);
  const opponentModifiers = getBrewModifiers(opponentPlayer);

  const challengerProfile = buildPlayerCombatProfile(challengerPlayer, {
    label: challengerUser.username,
    modifiers: challengerModifiers
  });
  const opponentProfile = buildPlayerCombatProfile(opponentPlayer, {
    label: opponentUser.username,
    modifiers: opponentModifiers
  });

  const challengerInit = (challengerPlayer.attributes?.agility || 0) + Math.random() * 10;
  const opponentInit = (opponentPlayer.attributes?.agility || 0) + Math.random() * 10;
  const firstAttacker = challengerInit >= opponentInit ? challengerProfile : opponentProfile;
  const secondAttacker = firstAttacker === challengerProfile ? opponentProfile : challengerProfile;

  const battleLog = [`⚔️ **Duel Begins!** ${challengerUser.username} vs ${opponentUser.username}`];
  let round = 1;
  while (challengerPlayer.hp > 0 && opponentPlayer.hp > 0) {
    battleLog.push(`\n__Round ${round}__`);
    const firstStrike = resolveAttack(firstAttacker, secondAttacker);
    battleLog.push(formatAttackResult(firstAttacker.label, secondAttacker.label, firstStrike, secondAttacker.hpRef.hp, secondAttacker.maxHp));
    if (secondAttacker.hpRef.hp <= 0) break;

    const secondStrike = resolveAttack(secondAttacker, firstAttacker);
    battleLog.push(formatAttackResult(secondAttacker.label, firstAttacker.label, secondStrike, firstAttacker.hpRef.hp, firstAttacker.maxHp));
    if (firstAttacker.hpRef.hp <= 0) break;

    round++;
    if (battleLog.length > 60) {
      battleLog.push('...');
      break;
    }
  }

  let winnerUser = null;
  let winnerPlayer = null;
  let loserUser = null;
  let loserPlayer = null;

  if (challengerPlayer.hp > 0 && opponentPlayer.hp <= 0) {
    winnerUser = challengerUser;
    winnerPlayer = challengerPlayer;
    loserUser = opponentUser;
    loserPlayer = opponentPlayer;
  } else if (opponentPlayer.hp > 0 && challengerPlayer.hp <= 0) {
    winnerUser = opponentUser;
    winnerPlayer = opponentPlayer;
    loserUser = challengerUser;
    loserPlayer = challengerPlayer;
  }

  let resultFooter = '';
  if (!winnerPlayer) {
    battleLog.push('\n🤝 The duel ends in a draw! Wagers have been refunded.');
    if (duel.pot > 0) {
      challengerPlayer.coins += duel.pot / 2;
      opponentPlayer.coins += duel.pot / 2;
    }
    challengerPlayer.hp = Math.max(1, Math.floor(challengerPlayer.maxHp * 0.5));
    opponentPlayer.hp = Math.max(1, Math.floor(opponentPlayer.maxHp * 0.5));
    applyPostBattleBuffs(challengerPlayer, null);
    applyPostBattleBuffs(opponentPlayer, null);
    await handleAchievementCheck(message, challengerPlayer);
    await handleAchievementCheck(message, opponentPlayer);
    checkCosmeticUnlocks(message, challengerPlayer);
    checkCosmeticUnlocks(message, opponentPlayer);
    resultFooter = 'Result: Draw';
  } else {
    const xpReward = 80 + Math.floor(loserPlayer.level * 5);
    const leveled = addXp(winnerPlayer, xpReward);
    winnerPlayer.stats.pvpWins = (winnerPlayer.stats.pvpWins || 0) + 1;
    loserPlayer.stats.pvpLosses = (loserPlayer.stats.pvpLosses || 0) + 1;

    if (duel.pot > 0) {
      winnerPlayer.coins += duel.pot;
      battleLog.push(`\n💰 ${winnerUser.username} wins the wager pot of ${duel.pot} coins!`);
    }
    battleLog.push(`\n🏆 ${winnerUser.username} wins the duel and earns ${xpReward} XP!`);
    if (leveled) {
      battleLog.push(`⭐ ${winnerUser.username} leveled up to ${winnerPlayer.level}!`);
    }
    loserPlayer.hp = Math.max(1, Math.floor(loserPlayer.maxHp * 0.4));
    applyPostBattleBuffs(winnerPlayer, battleLog);
    applyPostBattleBuffs(loserPlayer, null);
    processQuestEvent(message, winnerPlayer, { type: 'pvp', result: 'win', opponent: loserUser.id });
    processQuestEvent(message, loserPlayer, { type: 'pvp', result: 'loss', opponent: winnerUser.id });
    await handleAchievementCheck(message, winnerPlayer);
    await handleAchievementCheck(message, loserPlayer);
    checkCosmeticUnlocks(message, winnerPlayer);
    checkCosmeticUnlocks(message, loserPlayer);
    resultFooter = `Winner: ${winnerUser.username}`;
  }

  const duelSummary = battleLog.join('\n');
  const description = duelSummary.length > 3500 ? `${duelSummary.slice(0, 3500)}\n...` : duelSummary;

  const embed = new EmbedBuilder()
    .setColor(winnerPlayer ? '#2ECC71' : '#95A5A6')
    .setTitle('⚔️ Duel Results')
    .setDescription(description)
    .setFooter({ text: resultFooter });

  sendStyledChannelMessage(channel, embed, 'pvp').catch(() => {});
}
async function showFactionVendors(message, factionIdentifier) {
  const player = getPlayer(message.author.id);
  if (!factionIdentifier) {
    const lines = FACTIONS.map(faction => {
      const rep = getFactionReputation(player, faction.id);
      const tier = getFactionTierByReputation(rep);
      const nextTier = getNextFactionTier(rep);
      const nextText = nextTier ? ` • Next tier at ${nextTier.minRep} rep` : ' • Max tier reached';
      return `• **${faction.name}** — ${rep} rep (${tier.name})${nextText}`;
    });
    const embed = new EmbedBuilder()
      .setColor('#1ABC9C')
      .setTitle('🏪 Faction Vendors')
      .setDescription(lines.join('\n') || 'No factions discovered yet.')
      .setFooter({ text: `Use ${PREFIX} vendor <faction> to view inventory.` });
    return sendStyledEmbed(message, embed, 'vendor');
  }

  const faction = resolveFaction(factionIdentifier);
  if (!faction) {
    return message.reply('❌ Faction not found. Try `!hy vendor` to view all factions.');
  }

  const rep = getFactionReputation(player, faction.id);
  const accessibleTierIds = getAccessibleFactionTierIds(rep);
  const vendorEntries = collectFactionVendors(faction, accessibleTierIds);
  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(`🏪 ${faction.name} Vendor`)
    .setDescription(faction.description || 'No description available.')
    .addFields({ name: 'Reputation', value: `${rep} (${getFactionTierByReputation(rep).name})`, inline: true });

  const grouped = new Map();
  vendorEntries.forEach(entry => {
    const tier = getFactionTierById(entry.tierId);
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier).push(entry);
  });

  if (grouped.size === 0) {
    embed.addFields({ name: 'Inventory', value: 'Increase your reputation to unlock vendor goods.' });
  } else {
    for (const [tier, entries] of grouped.entries()) {
      const lines = entries
        .map(entry => {
          const itemData = ITEMS[entry.item];
          const label = itemData ? `${itemData.emoji} ${itemData.name || entry.item}` : entry.item;
          return `${label} — ${entry.price} coins`;
        })
        .join('\n');
      embed.addFields({ name: `${tier.name} Tier`, value: lines || 'None', inline: false });
    }
  }

  const nextTier = getNextFactionTier(rep);
  if (nextTier) {
    embed.addFields({ name: 'Next Tier', value: `${nextTier.name} at ${nextTier.minRep} reputation.` });
  }
  embed.setFooter({ text: `Use ${PREFIX} buyrep ${faction.id} <item> [amount] to purchase.` });

  return sendStyledEmbed(message, embed, 'vendor');
}
async function buyFactionVendorItem(message, factionIdentifier, itemId, amountArg) {
  if (!factionIdentifier || !itemId) {
    return message.reply(`❌ Usage: \`${PREFIX} buyrep <faction> <item> [amount]\``);
  }

  const faction = resolveFaction(factionIdentifier);
  if (!faction) {
    return message.reply('❌ Faction not found.');
  }

  const player = getPlayer(message.author.id);
  const rep = getFactionReputation(player, faction.id);
  const accessibleTierIds = getAccessibleFactionTierIds(rep);
  const vendorEntries = collectFactionVendors(faction, accessibleTierIds);
  const itemKey = itemId.toLowerCase();
  const vendorItem = vendorEntries.find(entry => entry.item.toLowerCase() === itemKey);
  if (!vendorItem) {
    return message.reply('❌ That item is not available at your current reputation tier.');
  }

  const itemData = ITEMS[itemKey];
  if (!itemData) {
    return message.reply('❌ Unknown item definition.');
  }

  const amount = amountArg ? parseInt(amountArg, 10) : 1;
  if (!Number.isFinite(amount) || amount < 1 || amount > 5) {
    return message.reply('❌ Purchase amount must be between 1 and 5.');
  }

  const totalCost = vendorItem.price * amount;
  if (player.coins < totalCost) {
    return message.reply(`❌ Not enough coins. You need ${totalCost}, but have ${player.coins}.`);
  }

  player.coins -= totalCost;
  addItemToInventory(player, itemKey, amount);

  message.reply(`🛒 Purchased ${amount}x ${itemData.emoji} **${itemData.name || itemKey}** from ${faction.name} for ${totalCost} coins.`);
  await handleAchievementCheck(message, player);
}
async function showContracts(message, factionIdentifier) {
  const player = getPlayer(message.author.id);
  if (!factionIdentifier) {
    const lines = FACTIONS.map(faction => {
      const rep = getFactionReputation(player, faction.id);
      const active = getActiveContract(player, faction.id);
      const status = active ? (active.completed ? '✅ Ready to turn in' : `⏳ In progress (${active.progress || 0}/${active.quantity || 1})`) : '🆕 None active';
      return `• **${faction.name}** — ${rep} rep (${getFactionTierByReputation(rep).name}) • ${status}`;
    });
    const embed = new EmbedBuilder()
      .setColor('#F39C12')
      .setTitle('📜 Faction Contracts')
      .setDescription(lines.join('\n') || 'No factions tracked yet.')
      .setFooter({ text: `Use ${PREFIX} contracts <faction> to view details.` });
    return sendStyledEmbed(message, embed, 'contracts');
  }

  const faction = resolveFaction(factionIdentifier);
  if (!faction) {
    return message.reply('❌ Faction not found.');
  }

  const rep = getFactionReputation(player, faction.id);
  const accessibleTierIds = getAccessibleFactionTierIds(rep);
  const contracts = collectFactionContracts(faction, accessibleTierIds);
  const activeContract = getActiveContract(player, faction.id);

  const embed = new EmbedBuilder()
    .setColor('#F39C12')
    .setTitle(`📜 Contracts — ${faction.name}`)
    .setDescription(faction.description || 'Complete contracts to earn reputation and rewards.')
    .addFields({ name: 'Reputation', value: `${rep} (${getFactionTierByReputation(rep).name})`, inline: true });

  if (contracts.length === 0) {
    if (activeContract) {
      embed.addFields({
        name: 'Active Contract',
        value: `${activeContract.name} — ${formatContractGoal(activeContract)}\nStatus: ${activeContract.completed ? '✅ Ready to turn in' : `⏳ In progress (${activeContract.progress || 0}/${activeContract.quantity})`}`
      });
    } else {
      embed.addFields({ name: 'Contracts', value: 'No contracts unlocked. Increase your reputation to access more work.' });
    }
  } else {
    contracts.forEach(contract => {
      const tier = getFactionTierById(contract.tierId);
      let status;
      if (activeContract && activeContract.id === contract.id) {
        status = activeContract.completed
          ? `✅ Ready to turn in (${activeContract.progress || contract.quantity}/${contract.quantity})`
          : `⏳ In progress (${activeContract.progress || 0}/${contract.quantity})`;
      } else if (activeContract && activeContract.id !== contract.id) {
        status = '🔒 Another contract is active';
      } else {
        status = '🆕 Available';
      }
      const rewardParts = [];
      if (contract.reward?.coins) rewardParts.push(`Coins: ${contract.reward.coins}`);
      if (contract.reward?.reputation) {
        const repText = Object.entries(contract.reward.reputation)
          .map(([factionId, value]) => `${factionId}: +${value}`)
          .join(', ');
        rewardParts.push(`Reputation: ${repText}`);
      }
      if (Array.isArray(contract.reward?.items)) {
        const itemText = contract.reward.items.map(entry => `${entry.item} x${entry.quantity || 1}`).join(', ');
        rewardParts.push(`Items: ${itemText}`);
      }
      const details = [
        formatContractGoal(contract),
        contract.description || null,
        `Status: ${status}`,
        `Reward: ${rewardParts.join(' | ') || 'See contract details.'}`
      ].filter(Boolean).join('\n');
      embed.addFields({
        name: `${tier.name} • ${contract.name}`,
         value: details
      });
    });
  }

  const nextTier = getNextFactionTier(rep);
  if (nextTier) {
    embed.addFields({ name: 'Next Tier', value: `${nextTier.name} at ${nextTier.minRep} reputation.` });
  }
  embed.setFooter({ text: `Commands: ${PREFIX} acceptcontract ${faction.id} <id>, ${PREFIX} turnincontract ${faction.id}` });

  return sendStyledEmbed(message, embed, 'contracts');
}
async function acceptContract(message, factionIdentifier, contractId) {
  if (!factionIdentifier || !contractId) {
    return message.reply(`❌ Usage: \`${PREFIX} acceptcontract <faction> <contractId>\``);
  }

  const faction = resolveFaction(factionIdentifier);
  if (!faction) {
    return message.reply('❌ Faction not found.');
  }

  const player = getPlayer(message.author.id);
  const activeContract = getActiveContract(player, faction.id);
  if (activeContract) {
    if (activeContract.completed) {
      return message.reply('⚠️ You have a completed contract waiting to be turned in. Use `!hy turnincontract` before taking a new one.');
    }
    if (MAX_ACTIVE_CONTRACTS && Object.values(player.contracts || {}).filter(entry => entry && !entry.completed).length >= MAX_ACTIVE_CONTRACTS) {
      return message.reply(`⚠️ You already have ${MAX_ACTIVE_CONTRACTS} active contract${MAX_ACTIVE_CONTRACTS > 1 ? 's' : ''}. Turn one in or abandon it before taking another.`);
    }
    return message.reply('⚠️ You already have an active contract for this faction. Turn it in or abandon it first.');
  }
  if (MAX_ACTIVE_CONTRACTS) {
    const totalActive = Object.values(player.contracts || {}).filter(entry => entry && !entry.completed).length;
    if (totalActive >= MAX_ACTIVE_CONTRACTS) {
      return message.reply(`⚠️ You already have ${MAX_ACTIVE_CONTRACTS} active contract${MAX_ACTIVE_CONTRACTS > 1 ? 's' : ''}. Turn one in or abandon it before taking another.`);
    }
  }

  const rep = getFactionReputation(player, faction.id);

  const accessibleTierIds = getAccessibleFactionTierIds(rep);
  const contracts = collectFactionContracts(faction, accessibleTierIds);
  const contractKey = contractId.toLowerCase();
  const contract = contracts.find(entry => entry.id.toLowerCase() === contractKey);
  if (!contract) {
    return message.reply('❌ That contract is not available at your current reputation tier.');
  }

  player.contracts[faction.id] = {
    id: contract.id,
    name: contract.name,
    type: contract.type,
    item: contract.item,
    enemy: contract.enemy,
    dungeon: contract.dungeon,
    result: contract.result,
    quantity: contract.quantity || 1,
    progress: 0,
    completed: false,
    reward: contract.reward || {},
    tierId: contract.tierId,
    description: contract.description || '',
    startedAt: Date.now()
  };

  message.reply(`📜 Accepted contract **${contract.name}** from ${faction.name}. Goal: ${formatContractGoal(contract)}.`);
}
async function turnInContract(message, factionIdentifier) {
  if (!factionIdentifier) {
    return message.reply(`❌ Usage: \`${PREFIX} turnincontract <faction>\``);
  }
  const faction = resolveFaction(factionIdentifier);
  if (!faction) {
    return message.reply('❌ Faction not found.');
  }
  const player = getPlayer(message.author.id);
  const contract = getActiveContract(player, faction.id);
  if (!contract) {
    return message.reply('⚠️ You do not have an active contract with this faction.');
  }
  if (!contract.completed) {
    return message.reply(`⏳ Contract **${contract.name}** is not ready yet (${contract.progress || 0}/${contract.quantity || 1}).`);
  }

  const reward = contract.reward || {};
  const rewardLines = [];
  if (reward.coins) {
    player.coins += reward.coins;
    rewardLines.push(`+${reward.coins} coins`);
  }
  let leveled = false;
  if (reward.xp) {
    leveled = addXp(player, reward.xp) || leveled;
    rewardLines.push(`+${reward.xp} XP`);
  }
  if (reward.reputation) {
    Object.entries(reward.reputation).forEach(([factionId, value]) => {
      adjustFactionReputation(player, factionId, value, message);
      rewardLines.push(`${factionId}: +${value} reputation`);
    });
  }
  if (Array.isArray(reward.items)) {
    reward.items.forEach(entry => {
      const quantity = entry.quantity || 1;
      addItemToInventory(player, entry.item, quantity);
      processQuestEvent(message, player, { type: 'gather', itemId: entry.item, count: quantity });
      rewardLines.push(`${entry.item} x${quantity}`);
    });
  }

  player.stats.contractsCompleted = (player.stats.contractsCompleted || 0) + 1;
  delete player.contracts[faction.id];

  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('📜 Contract Completed')
    .setDescription(`Turned in **${contract.name}** for ${faction.name}.`)
    .addFields({ name: 'Rewards', value: rewardLines.join('\n') || 'No rewards listed.' });
  if (leveled) {
    embed.addFields({ name: 'Level Up', value: `You reached level ${player.level}!` });
  }

  sendStyledEmbed(message, embed, 'contracts');
  await handleAchievementCheck(message, player);
  checkCosmeticUnlocks(message, player);
}
async function abandonContract(message, factionIdentifier) {
  if (!factionIdentifier) {
    return message.reply(`❌ Usage: \`${PREFIX} abandoncontract <faction>\``);
  }
  const faction = resolveFaction(factionIdentifier);
  if (!faction) {
    return message.reply('❌ Faction not found.');
  }
  const player = getPlayer(message.author.id);
  const contract = getActiveContract(player, faction.id);
  if (!contract) {
    return message.reply('⚠️ You do not have an active contract with this faction.');
  }
  delete player.contracts[faction.id];
  message.reply(`🚫 Abandoned the contract **${contract.name}** with ${faction.name}.`);
}

function isUserInTeamQueue(userId) {
  for (const queue of TEAM_QUEUE.values()) {
    if (queue.includes(userId)) return true;
  }
  return false;
}

function removeFromTeamQueues(userId) {
  for (const [channelId, queue] of TEAM_QUEUE.entries()) {
    const index = queue.indexOf(userId);
    if (index !== -1) {
      queue.splice(index, 1);
      if (queue.length === 0) {
        TEAM_QUEUE.delete(channelId);
      } else {
        TEAM_QUEUE.set(channelId, queue);
      }
    }
  }
}

async function joinTeamQueue(message) {
  const channelId = message.channel.id;
  const userId = message.author.id;
  if (findUserDuel(userId)) {
    return message.reply('⚠️ You are already in a duel and cannot queue for team battles.');
  }
  if (isUserInTeamQueue(userId)) {
    return message.reply('⚠️ You are already queued for a team duel.');
  }

  const queue = TEAM_QUEUE.get(channelId) || [];
  queue.push(userId);
  TEAM_QUEUE.set(channelId, queue);

  const needed = TEAM_DUEL_SIZE * 2;
  if (queue.length >= needed) {
    const participants = queue.splice(0, needed);
    if (queue.length === 0) {
      TEAM_QUEUE.delete(channelId);
    } else {
      TEAM_QUEUE.set(channelId, queue);
    }
    const teamAIds = participants.slice(0, TEAM_DUEL_SIZE);
    const teamBIds = participants.slice(TEAM_DUEL_SIZE);
    await executeTeamDuel(message, teamAIds, teamBIds);
    while (queue.length >= needed) {
      const nextMatch = queue.splice(0, needed);
      const teamA = nextMatch.slice(0, TEAM_DUEL_SIZE);
      const teamB = nextMatch.slice(TEAM_DUEL_SIZE);
      await executeTeamDuel(message, teamA, teamB);
    }
    if (queue.length === 0) {
      TEAM_QUEUE.delete(channelId);
    } else {
      TEAM_QUEUE.set(channelId, queue);
      const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('👥 Team Queue Updated')
        .setDescription(`${queue.length}/${needed} players waiting for the next battle.`)
        .setFooter({ text: `Invite friends or queue again with ${PREFIX} teamqueue` });
      sendStyledChannelMessage(message.channel, embed, 'pvp').catch(() => {});
    }
  } else {
    message.reply(`👥 Added to team queue (${queue.length}/${needed}). Need ${needed - queue.length} more player(s).`);
  }
}
async function leaveTeamQueue(message) {
  const channelId = message.channel.id;
  const userId = message.author.id;
  const queue = TEAM_QUEUE.get(channelId);
  if (!queue || !queue.includes(userId)) {
    return message.reply('⚠️ You are not currently queued for a team duel in this channel.');
  }
  const index = queue.indexOf(userId);
  queue.splice(index, 1);
  if (queue.length === 0) {
    TEAM_QUEUE.delete(channelId);
  } else {
    TEAM_QUEUE.set(channelId, queue);
  }
  message.reply('👋 You have left the team duel queue.');
}
async function executeTeamDuel(message, teamAIds, teamBIds) {
  const channel = message.channel;
  const teamA = [];
  const teamB = [];

  for (const userId of teamAIds) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    const player = getPlayer(userId);
    const modifiers = getBrewModifiers(player);
    teamA.push({ userId, user, player, profile: buildPlayerCombatProfile(player, { label: user.username, modifiers }) });
  }
  for (const userId of teamBIds) {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;
    const player = getPlayer(userId);
    const modifiers = getBrewModifiers(player);
    teamB.push({ userId, user, player, profile: buildPlayerCombatProfile(player, { label: user.username, modifiers }) });
  }

  if (teamA.length < TEAM_DUEL_SIZE || teamB.length < TEAM_DUEL_SIZE) {
    const embed = new EmbedBuilder()
      .setColor('#E67E22')
      .setTitle('⚠️ Team Duel Cancelled')
      .setDescription('Not enough players remained available for the team duel. The queue has been reset.')
      .setFooter({ text: `Queue again with ${PREFIX} teamqueue` });
    sendStyledChannelMessage(channel, embed, 'pvp').catch(() => {});
    teamAIds.concat(teamBIds).forEach(removeFromTeamQueues);
    return;
  }

  const combatants = [...teamA.map(entry => ({ ...entry, team: 'A' })), ...teamB.map(entry => ({ ...entry, team: 'B' }))]
    .map(entry => ({ ...entry, initiative: (entry.player.attributes?.agility || 0) + Math.random() * 10 }));

  const turnOrder = combatants.sort((a, b) => b.initiative - a.initiative);
  const battleLog = [`👥 **Team Duel Begins!** ${teamA.map(p => p.user.username).join(' & ')} vs ${teamB.map(p => p.user.username).join(' & ')}`];
  let round = 1;
  const maxRounds = 30;

  const alive = team => team.filter(entry => entry.player.hp > 0);

  while (alive(teamA).length > 0 && alive(teamB).length > 0 && round <= maxRounds) {
    battleLog.push(`\n__Round ${round}__`);
    for (const attacker of turnOrder) {
      if (attacker.player.hp <= 0) continue;
      const opponents = attacker.team === 'A' ? alive(teamB) : alive(teamA);
      if (opponents.length === 0) break;
      const target = opponents.reduce((lowest, current) => current.player.hp < lowest.player.hp ? current : lowest, opponents[0]);
      const result = resolveAttack(attacker.profile, target.profile);
      battleLog.push(formatAttackResult(attacker.profile.label, target.profile.label, result, target.player.hp, target.profile.maxHp));
      if (alive(teamA).length === 0 || alive(teamB).length === 0) break;
    }
    round++;
  }

  let winningTeam = null;
  if (alive(teamA).length > 0 && alive(teamB).length === 0) {
    winningTeam = 'A';
  } else if (alive(teamB).length > 0 && alive(teamA).length === 0) {
    winningTeam = 'B';
  }

  const embed = new EmbedBuilder();
  const rewardLines = [];

  if (!winningTeam) {
    battleLog.push('\n🤝 The battle ends in a stalemate! No rewards granted.');
    for (const participant of [...teamA, ...teamB]) {
      participant.player.hp = Math.max(1, Math.floor(participant.player.maxHp * 0.6));
      applyPostBattleBuffs(participant.player, null);
      checkCosmeticUnlocks(message, participant.player);
      await handleAchievementCheck(message, participant.player);
    }
    embed.setColor('#95A5A6').setTitle('👥 Team Duel Draw');
  } else {
    const winners = winningTeam === 'A' ? teamA : teamB;
    const losers = winningTeam === 'A' ? teamB : teamA;
    for (const participant of winners) {
      const xp = 120 + Math.floor(losers.reduce((sum, entry) => sum + entry.player.level, 0) / (losers.length || 1));
      const leveled = addXp(participant.player, xp) || leveled;
      participant.player.coins += 200;
      participant.player.stats.teamWins = (participant.player.stats.teamWins || 0) + 1;
      rewardLines.push(`🏆 ${participant.user.username}: +200 coins | +${xp} XP`);
      if (leveled) battleLog.push(`⭐ ${participant.user.username} reached level ${participant.player.level}!`);
      applyPostBattleBuffs(participant.player, battleLog);
      processQuestEvent(message, participant.player, { type: 'pvp', result: 'team_win', opponent: losers.map(l => l.user.id) });
      checkCosmeticUnlocks(message, participant.player);
      await handleAchievementCheck(message, participant.player);
    }
    for (const participant of losers) {
      participant.player.stats.teamLosses = (participant.player.stats.teamLosses || 0) + 1;
      const consolationXp = 40;
      addXp(participant.player, consolationXp);
      participant.player.hp = Math.max(1, Math.floor(participant.player.maxHp * 0.4));
      applyPostBattleBuffs(participant.player, null);
      processQuestEvent(message, participant.player, { type: 'pvp', result: 'team_loss', opponent: winners.map(w => w.user.id) });
      checkCosmeticUnlocks(message, participant.player);
      await handleAchievementCheck(message, participant.player);
    }
    embed.setColor('#2ECC71').setTitle('👥 Team Duel Results');
    battleLog.push(`\n🥇 Winners: ${winners.map(p => p.user.username).join(' & ')}`);
  }

  const summary = battleLog.join('\n');
  const description = summary.length > 3500 ? `${summary.slice(0, 3500)}\n...` : summary;
  embed.setDescription(description);
  if (rewardLines.length > 0) {
    embed.addFields({ name: 'Rewards', value: rewardLines.join('\n') });
  }

  sendStyledChannelMessage(channel, embed, 'pvp').catch(() => {});
}

function processAllBasesTick(now = Date.now()) {
  for (const [, player] of playerData) {
    if (!player?.bases) continue;
    Object.keys(player.bases).forEach(biomeId => {
      processBaseTick(player, biomeId, now);
    });
  }
}
const fallbackExplorationBiomes = [
  {
    id: 'emerald_grove',
    name: 'Emerald Grove',
    description: 'Lush forests filled with Kweebec handiwork and ancient ruins.',
    travel: { baseMinutes: 5, neighbors: ['gale_cliffs', 'sunset_dunes', 'shadow_depths'] },
    resources: {
      forage: [
        { item: 'ancient_bark', min: 1, max: 3, chance: 0.7 },
        { item: 'grove_tonic', min: 1, max: 1, chance: 0.25 }
      ],
      mine: [
        { item: 'sunstone_shard', min: 1, max: 2, chance: 0.35 }
      ],
      scavenge: [
        { item: 'forestwarden_staff', min: 1, max: 1, chance: 0.05 }
      ]
    },
    encounters: {
      combat: [
        { enemy: 'feral_trork', chance: 0.35 },
        { enemy: 'shadow_crawler', chance: 0.18 }
      ],
      events: [
        { id: 'kweebec_cache', type: 'structure', structure: 'kweebec_cache', chance: 0.16 },
        { id: 'whispering_hollow', type: 'puzzle', structure: 'whispering_hollow', chance: 0.12 }
      ]
    }
  },
  {
    id: 'gale_cliffs',
    name: 'Gale Cliffs',
    description: 'Wind-carved mesas that collect Skysong resonance and static storms.',
    travel: { baseMinutes: 8, neighbors: ['emerald_grove', 'stormguard_keep', 'frostblossom_glacier'] },
    resources: {
      forage: [
        { item: 'aurora_fragment', min: 1, max: 2, chance: 0.45 }
      ],
      mine: [
        { item: 'stormcore_shard', min: 1, max: 1, chance: 0.32 }
      ],
      scavenge: [
        { item: 'stormfront_blade', min: 1, max: 1, chance: 0.04 }
      ]
    },
    encounters: {
      combat: [
        { enemy: 'void_knight', chance: 0.28 }
      ],
      events: [
        { id: 'skysong_shrine', type: 'structure', structure: 'skysong_shrine', chance: 0.18 },
        { id: 'resonance_anomaly', type: 'puzzle', structure: 'resonance_conduit', chance: 0.12 }
      ]
    }
  },
  {
    id: 'stormguard_keep',
    name: 'Stormguard Keep',
    description: 'Fortified stronghold battered by endless tempests.',
    travel: { baseMinutes: 12, neighbors: ['gale_cliffs', 'shadow_depths'] },
    resources: {
      forage: [
        { item: 'stormbrew_tonic', min: 1, max: 1, chance: 0.32 }
      ],
      mine: [
        { item: 'stormguard_plate', min: 1, max: 1, chance: 0.04 },
        { item: 'stormlens_scope', min: 1, max: 1, chance: 0.05 }
      ],
      scavenge: [
        { item: 'stormbreaker_hammer', min: 1, max: 1, chance: 0.02 }
      ]
    },
    encounters: {
      combat: [
        { enemy: 'ancient_golem', chance: 0.26 },
        { enemy: 'varyn_warlord', chance: 0.1 }
      ],
      events: [
        { id: 'stormguard_armory', type: 'structure', structure: 'stormguard_armory', chance: 0.2 },
        { id: 'war_council', type: 'story', reward: { coins: 160, reputation: { human: 8 } }, chance: 0.12 }
      ]
    }
  }
];

const EXPLORATION_BIOMES = loadDataFile('exploration.json', fallbackExplorationBiomes);

const BIOME_LOOKUP = {};
EXPLORATION_BIOMES.forEach(biome => {
  if (biome?.id) BIOME_LOOKUP[biome.id.toLowerCase()] = biome;
});
applyExplorationMetaToBiomes(Array.isArray(EXPLORATION_META.biomes) ? EXPLORATION_META.biomes : []);
const STRUCTURE_LOOKUP = {};
STRUCTURE_DEFINITIONS.forEach(structure => {
  if (structure?.id) STRUCTURE_LOOKUP[structure.id.toLowerCase()] = structure;
});

const SETTLEMENT_EXPEDITIONS = {
  trade_caravan: {
    name: 'Trade Caravan',
    type: 'trade',
    baseMinutes: 120,
    prestigeSuccess: 2,
    prestigeFailure: -1,
    supportBuilding: 'market',
    rewards(level, villagers) {
      return { coins: 80 + villagers * 20, items: [{ item: 'focus_elixir', quantity: Math.max(1, Math.floor(villagers / 2)) }] };
    }
  },
  grove_scouts: {
    name: 'Grove Scouts',
    type: 'exploration',
    baseMinutes: 90,
    prestigeSuccess: 2,
    prestigeFailure: -1,
    supportBuilding: 'ritual_grove',
    rewards(level, villagers) {
      return { items: [{ item: 'ancient_bark', quantity: villagers * 2 }, { item: 'grove_tonic', quantity: 1 }], xp: 70 + villagers * 15 };
    }
  },
  knowledge_run: {
    name: 'Knowledge Run',
    type: 'knowledge',
    baseMinutes: 180,
    prestigeSuccess: 3,
    prestigeFailure: -1,
    supportBuilding: 'archive',
    rewards(level, villagers) {
      return { xp: 120 + villagers * 30, items: [{ item: 'aurora_tea', quantity: 1 }] };
    }
  },
  diplomatic_envoy: {
    name: 'Diplomatic Envoy',
    type: 'diplomacy',
    baseMinutes: 240,
    prestigeSuccess: 3,
    prestigeFailure: -2,
    supportBuilding: 'embassy',
    rewards(level, villagers) {
      return { reputation: { skysong: 6 }, coins: 120 };
    }
  },
  war_patrol: {
    name: 'War Patrol',
    type: 'combat',
    baseMinutes: 150,
    prestigeSuccess: 4,
    prestigeFailure: -2,
    supportBuilding: 'barracks',
    rewards(level, villagers) {
      const items = [];
      if (level >= 2) items.push({ item: 'stormguard_plate', quantity: 1 });
      return { items, coins: 140 };
    }
  },
  supply_convoy: {
    name: 'Supply Convoy',
    type: 'trade',
    baseMinutes: 200,
    prestigeSuccess: 2,
    prestigeFailure: -1,
    supportBuilding: 'market',
    rewards(level, villagers) {
      return { items: [{ item: 'stormbrew_tonic', quantity: Math.max(1, Math.floor(villagers / 2)) }], coins: 100 };
    }
  },
  exploration_run: {
    name: 'Exploration Run',
    type: 'exploration',
    baseMinutes: 160,
    prestigeSuccess: 2,
    prestigeFailure: -1,
    supportBuilding: 'watchtower',
    rewards(level, villagers) {
      return { items: [{ item: 'sunstone_shard', quantity: Math.max(1, Math.floor(villagers / 2)) }], xp: 90 + villagers * 20 };
    }
  },
  ritual_voyage: {
    name: 'Ritual Voyage',
    type: 'ritual',
    baseMinutes: 210,
    prestigeSuccess: 4,
    prestigeFailure: -2,
    supportBuilding: 'ritual_grove',
    rewards(level, villagers) {
      return { items: [{ item: 'aurora_lantern', quantity: Math.max(1, Math.floor(villagers / 3)) }], reputation: { skysong: 4 }, xp: 130 };
    }
  },
  defense_patrol: {
    name: 'Defense Patrol',
    type: 'combat',
    baseMinutes: 110,
    prestigeSuccess: 3,
    prestigeFailure: -1,
    supportBuilding: 'watchtower',
    rewards(level, villagers) {
      return { settlement: { garrison: 4 + Math.floor(villagers / 2) }, coins: 90 };
    }
  }
};
mergeExpeditionProfiles(PENDING_SETTLEMENT_EXPEDITION_PROFILES);
function randChoice(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}
function randFloat() {
  return Math.random();
}

function weightedChoice(entries, weightField = 'chance') {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + (entry[weightField] || 0), 0);
  if (total <= 0) return randChoice(entries);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry[weightField] || 0;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}
function grantRewards(player, reward, message) {
  const lines = [];
  if (!reward) return lines;
  if (reward.coins) {
    player.coins += reward.coins;
    lines.push(`Coins +${reward.coins}`);
  }
  let leveled = false;
  if (reward.xp) {
    leveled = addXp(player, reward.xp) || leveled;
    lines.push(`XP +${reward.xp}`);
  }
  if (reward.reputation) {
    Object.entries(reward.reputation).forEach(([factionId, amount]) => {
      adjustFactionReputation(player, factionId, amount, message);
      lines.push(`Reputation ${factionId} +${amount}`);
    });
  }
  if (Array.isArray(reward.items)) {
    reward.items.forEach(entry => {
      if (!entry || !entry.item) return;
      const qty = entry.quantity || entry.amount || 1;
      addItemToInventory(player, entry.item, qty);
      lines.push(`${entry.item} x${qty}`);
    });
  }
  if (leveled) {
    lines.push(`Level Up! You are now level ${player.level}`);
  }
  return lines;
}

function getBiomeDefinition(biomeId) {
  if (!biomeId) return null;
  return BIOME_LOOKUP[biomeId.toLowerCase()] || null;
}

function ensureExplorationState(player) {
  if (!player.exploration) {
    player.exploration = {
      currentBiome: 'emerald_grove',
      targetBiome: null,
      status: 'idle',
      action: null,
      discoveredBiomes: ['emerald_grove'],
      lastTick: Date.now()
    };
  }
  if (!Array.isArray(player.exploration.discoveredBiomes)) {
    player.exploration.discoveredBiomes = ['emerald_grove'];
  }
  player.exploration.lastTick = player.exploration.lastTick || Date.now();
  if (!Number.isFinite(player.exploration.consecutiveActionsSinceCombat)) {
    player.exploration.consecutiveActionsSinceCombat = 0;
  }
  player.exploration.lastCombatAt = player.exploration.lastCombatAt || 0;
  if (player.exploration.pendingChain && typeof player.exploration.pendingChain !== 'object') {
    player.exploration.pendingChain = null;
  }
  if (player.exploration.gathering === undefined) {
    player.exploration.gathering = null;
  }
  return player.exploration;
}

function getBaseRankDefinition(rank) {
  if (BASE_RANK_MAP[rank]) return BASE_RANK_MAP[rank];
  if (BASE_RANKS.length === 0) return { level: rank, name: `Rank ${rank}`, storageBonus: 0, incidentDefense: 0 };
  return BASE_RANKS[Math.min(BASE_RANKS.length - 1, Math.max(0, rank - 1))];
}

function getNextBaseRankDefinition(rank) {
  return BASE_RANK_MAP[rank + 1] || null;
}

function ensureBaseUpgradeMap(base) {
  base.upgrades = base.upgrades || {};
  Object.entries(BASE_MODULE_DEFAULTS).forEach(([moduleId, defaultLevel]) => {
    if (base.upgrades[moduleId] == null) base.upgrades[moduleId] = defaultLevel;
  });
  return base.upgrades;
}

function calculateBaseCapacity(base) {
  const storageLevel = base.upgrades?.storage || 0;
  const storageDef = BASE_UPGRADE_DEFINITIONS.storage;
  const storageCapacity = storageDef ? storageDef.capacity(storageLevel) : 120;
  const rankBonus = getBaseRankDefinition(base.rank || 1)?.storageBonus || 0;
  const moduleBonus = base.bonuses?.storageBonus || 0;
  return Math.max(60, storageCapacity + rankBonus + moduleBonus);
}
function recalcBaseBonuses(base) {
  const bonuses = {
    storageBonus: 0,
    extractorRate: 1,
    travelModifier: 1,
    xpRate: 0,
    coinRate: 0,
    incidentDefense: getBaseRankDefinition(base.rank || 1)?.incidentDefense || 0,
    surveyBoost: 0,
    settlementDefenseBonus: 0,
    settlementWealthBonus: 0,
    contractRewardBonus: 0,
    brewSuccessBonus: 0
  };

  Object.entries(base.upgrades || {}).forEach(([moduleId, level]) => {
    if (level <= 0) return;
    const moduleDef = BASE_UPGRADE_DEFINITIONS[moduleId];
    if (!moduleDef) return;
    const levelData = moduleDef.getLevel(level);
    if (!levelData) return;
    const bonus = levelData.bonuses || {};
    if (bonus.storageBonus) bonuses.storageBonus += Number(bonus.storageBonus) || 0;
    if (bonus.extractorRate) bonuses.extractorRate *= Number(bonus.extractorRate) || 1;
    if (bonus.travelModifier) bonuses.travelModifier *= Number(bonus.travelModifier) || 1;
    if (bonus.incidentDefense) bonuses.incidentDefense += Number(bonus.incidentDefense) || 0;
    if (bonus.xpRate) bonuses.xpRate += Number(bonus.xpRate) || 0;
    if (bonus.coinRate) bonuses.coinRate += Number(bonus.coinRate) || 0;
    if (bonus.surveyBoost) bonuses.surveyBoost += Number(bonus.surveyBoost) || 0;
    if (bonus.settlementDefenseBonus) bonuses.settlementDefenseBonus += Number(bonus.settlementDefenseBonus) || 0;
    if (bonus.settlementWealthBonus) bonuses.settlementWealthBonus += Number(bonus.settlementWealthBonus) || 0;
    if (bonus.contractRewardBonus) bonuses.contractRewardBonus += Number(bonus.contractRewardBonus) || 0;
    if (bonus.brewSuccessBonus) bonuses.brewSuccessBonus += Number(bonus.brewSuccessBonus) || 0;
  });

  base.bonuses = bonuses;
  base.capacity = calculateBaseCapacity(base);
  return bonuses;
}
function getBaseStorageTotals(base) {
  return Object.values(base.storage || {}).reduce((sum, qty) => sum + qty, 0);
}

function ensureBaseProgress(base) {
  base.progress = base.progress || {};
  return base.progress;
}

function accumulateModuleProgress(base, moduleId, amount, slot = 'default') {
  if (amount <= 0) return 0;
  const progress = ensureBaseProgress(base);
  const moduleProgress = progress[moduleId] = progress[moduleId] || {};
  const current = moduleProgress[slot] || 0;
  const total = current + amount;
  const whole = Math.floor(total);
  moduleProgress[slot] = total - whole;
  return whole;
}

function refundModuleProgress(base, moduleId, amount, slot = 'default') {
  if (amount <= 0) return;
  const progress = ensureBaseProgress(base);
  const moduleProgress = progress[moduleId] = progress[moduleId] || {};
  moduleProgress[slot] = (moduleProgress[slot] || 0) + amount;
}
function recordBaseLog(base, entries, options = {}) {
  if (!entries || !entries.length) return;
  base.logs = base.logs || [];
  const logEntry = {
    timestamp: options.timestamp || Date.now(),
    entries,
    type: options.type || 'activity'
  };
  base.logs.push(logEntry);
  if (base.logs.length > 30) {
    base.logs.splice(0, base.logs.length - 30);
  }
  base.unreadLogs = (base.unreadLogs || 0) + 1;
}

function ensureBase(player, biomeId, now = Date.now()) {
  player.bases = player.bases || {};
  if (!player.bases[biomeId]) {
    const defaultName = `${biomeId.replace(/_/g, ' ')} Outpost`;
    const upgrades = { ...BASE_MODULE_DEFAULTS };
    player.bases[biomeId] = {
      biomeId,
      rank: 1,
      upgrades,
      storage: {},
      capacity: 0,
      lastProcessed: now,
      name: defaultName,
      bonuses: {},
      logs: [],
      progress: {}
    };
  }
  const base = player.bases[biomeId];
  base.rank = base.rank || 1;
  base.name = base.name || `${biomeId.replace(/_/g, ' ')} Outpost`;
  base.storage = base.storage || {};
  base.logs = Array.isArray(base.logs) ? base.logs : [];
  base.progress = base.progress || {};
  base.lastProcessed = base.lastProcessed || now;
  ensureBaseUpgradeMap(base);
  recalcBaseBonuses(base);
  return base;
}
function ensureSettlement(player, settlementId, template) {
  player.settlements = player.settlements || {};
  if (!player.settlements[settlementId]) {
    const seed = template || SETTLEMENT_TEMPLATE_LOOKUP[settlementId.toLowerCase()];
    if (!seed) return null;
    const population = randChoice(Array.from({ length: (seed.population?.max || 20) - (seed.population?.min || 10) + 1 }, (_, idx) => (seed.population?.min || 10) + idx));
    player.settlements[settlementId] = {
      id: settlementId,
      name: seed.name,
      faction: seed.faction,
      templateId: seed.id,
      buildings: seed.baseBuildings?.reduce((map, id) => { map[id] = 1; return map; }, {}) || {},
      availableBuildings: seed.possibleBuildings || [],
      population,
      happiness: seed.happiness || 60,
      wealth: seed.wealth || 100,
      garrison: seed.garrison || 40,
      prestige: 0,
      prestigeTier: SETTLEMENT_PRESTIGE_TIERS[0].id,
      traits: seed.traits || [],
      decisions: [],
      nextDecisionAt: Date.now() + 60 * 60 * 1000,
      expeditions: [],
      bonuses: {},
      production: {},
      stockpile: {},
      lastUpdated: Date.now()
    };
    player.stats.settlementsManaged = (player.stats.settlementsManaged || 0) + 1;
    const settlement = player.settlements[settlementId];
    (seed.baseBuildings || []).forEach(buildingId => {
      const buildingDef = SETTLEMENT_BUILDINGS[buildingId];
      if (buildingDef?.effects) {
        applySettlementEffects(player, settlement, buildingDef.effects);
      }
    });
  }
  return player.settlements[settlementId];
}
function calculateTravelDuration(player, fromBiomeId, toBiomeId) {
  const fromBiome = getBiomeDefinition(fromBiomeId);
  const toBiome = getBiomeDefinition(toBiomeId);
  if (!fromBiome || !toBiome) return 5 * 60 * 1000;
  const baseMinutes = fromBiome.travel?.neighbors?.includes(toBiomeId) ? fromBiome.travel.baseMinutes || 5 : (fromBiome.travel?.baseMinutes || 5) * 2;
  const fromMeta = fromBiomeId ? EXPLORATION_META_BIOME_LOOKUP[fromBiomeId.toLowerCase()] : null;
  const toMeta = toBiomeId ? EXPLORATION_META_BIOME_LOOKUP[toBiomeId.toLowerCase()] : null;
  const difficulty =
    ((fromMeta?.travelDifficulty || 1) + (toMeta?.travelDifficulty || 1)) / (toMeta || fromMeta ? 2 : 1);
  let modifier = 1;
  const base = player.bases?.[fromBiomeId];
  if (base) {
    recalcBaseBonuses(base);
    modifier *= base.bonuses?.travelModifier || 1;
  }
  const gearModifier = player.cosmetics?.titles?.equipped === 'title_duelist' ? 0.95 : 1;
  modifier *= gearModifier;
  return Math.max(60_000, baseMinutes * difficulty * modifier * 60_000);
}
function processBaseTick(player, biomeId, now = Date.now()) {
  const base = ensureBase(player, biomeId, now);
  const elapsed = Math.max(0, now - (base.lastProcessed || now));
  if (elapsed < 60_000) return [];
  const minutes = Math.floor(elapsed / 60_000);
  base.lastProcessed = (base.lastProcessed || now) + minutes * 60_000;
  recalcBaseBonuses(base);

  const rewards = [];
  const biome = getBiomeDefinition(biomeId) || { id: biomeId, travel: { neighbors: [] }, resources: {} };
  const storageCapacity = base.capacity || calculateBaseCapacity(base);
  const storageTotals = () => getBaseStorageTotals(base);

  // Extractor automation (biome resource tables)
  const extractorDef = BASE_UPGRADE_DEFINITIONS.extractor;
  const extractorLevel = base.upgrades.extractor || 0;
  if (extractorDef && extractorLevel > 0 && biome.resources) {
    const baseRate = extractorDef.rate(extractorLevel) || 0;
    const totalRate = Math.max(0, baseRate * (base.bonuses?.extractorRate || 1));
    const rolls = accumulateModuleProgress(base, 'extractor', totalRate * minutes, 'gather');
    const table = biome.resources.forage || biome.resources.mine || biome.resources.scavenge || [];
    for (let i = 0; i < rolls; i++) {
      if (storageTotals() >= storageCapacity) {
        rewards.push('📦 Storage full — extractor paused.');
        refundModuleProgress(base, 'extractor', rolls - i, 'gather');
        break;
      }
      const roll = weightedChoice(table, 'chance');
      if (!roll) continue;
      const qty = randomBetween(roll.min || 1, roll.max || roll.min || 1);
      const space = storageCapacity - storageTotals();
      if (space <= 0) {
        rewards.push('📦 Storage full — extractor paused.');
        refundModuleProgress(base, 'extractor', rolls - i, 'gather');
        break;
      }
      const applied = Math.min(qty, space);
      base.storage[roll.item] = (base.storage[roll.item] || 0) + applied;
      rewards.push(`⛏️ Extractor gathered ${roll.item} x${applied}`);
      if (applied < qty) {
        rewards.push('📦 Storage overflowed — some harvest lost.');
        break;
      }
    }
  }

  // Workshop conversions
  const workshopDef = BASE_UPGRADE_DEFINITIONS.workshop;
  const workshopLevel = base.upgrades.workshop || 0;
  if (workshopDef && workshopLevel > 0) {
    const levelData = workshopDef.getLevel(workshopLevel) || {};
    (levelData.conversions || []).forEach((conv, index) => {
      const perHour = conv.perHour || (workshopLevel * 2);
      const perMinute = perHour / 60;
      if (perMinute <= 0) return;
      const crafts = accumulateModuleProgress(base, `workshop_${index}`, perMinute * minutes, 'craft');
      if (crafts <= 0) return;
      const available = base.storage[conv.input] || 0;
      const possible = Math.min(crafts, Math.floor(available / conv.ratio));
      if (possible <= 0) {
        refundModuleProgress(base, `workshop_${index}`, crafts, 'craft');
        return;
      }
      for (let i = 0; i < possible; i++) {
        base.storage[conv.input] -= conv.ratio;
        if (base.storage[conv.input] <= 0) delete base.storage[conv.input];
        const space = storageCapacity - storageTotals();
        if (space <= 0) {
          refundModuleProgress(base, `workshop_${index}`, possible - i, 'craft');
          rewards.push('📦 Storage full — workshop output limited.');
          break;
        }
        base.storage[conv.output] = (base.storage[conv.output] || 0) + 1;
        rewards.push(`🔧 Workshop fabricated ${conv.output}`);
      }
      const unused = crafts - possible;
      if (unused > 0) refundModuleProgress(base, `workshop_${index}`, unused, 'craft');
    });
  }

  // Module automation outputs and passives
  Object.entries(base.upgrades || {}).forEach(([moduleId, level]) => {
    if (level <= 0) return;
    if (['storage', 'extractor', 'workshop'].includes(moduleId)) return;
    const moduleDef = BASE_UPGRADE_DEFINITIONS[moduleId];
    if (!moduleDef) return;
    const levelData = moduleDef.getLevel(level);
    if (!levelData) return;

    (levelData.outputs || []).forEach((output, idx) => {
      const perHour = output.perHour || 0;
      const perMinute = output.perMinute || (perHour / 60);
      if (perMinute <= 0) return;
      const rolls = accumulateModuleProgress(base, `${moduleId}_output_${idx}`, perMinute * minutes, 'output');
      for (let i = 0; i < rolls; i++) {
        if (storageTotals() >= storageCapacity) {
          rewards.push('📦 Storage full — automation paused.');
          refundModuleProgress(base, `${moduleId}_output_${idx}`, rolls - i, 'output');
          break;
        }
        const roll = weightedChoice(output.table || [], 'chance');
        if (!roll) continue;
        const qty = randomBetween(roll.min || 1, roll.max || roll.min || 1);
        const space = storageCapacity - storageTotals();
        if (space <= 0) {
          rewards.push('📦 Storage full — automation paused.');
          refundModuleProgress(base, `${moduleId}_output_${idx}`, rolls - i, 'output');
          break;
        }
        const applied = Math.min(qty, space);
        base.storage[roll.item] = (base.storage[roll.item] || 0) + applied;
        rewards.push(`🏭 ${moduleDef.name} produced ${roll.item} x${applied}`);
        if (applied < qty) {
          rewards.push('📦 Storage overflowed — some production lost.');
          break;
        }
      }
    });

    if (levelData.coinsPerHour) {
      const coins = Math.floor(levelData.coinsPerHour * minutes / 60);
      if (coins > 0) {
        player.coins += coins;
        rewards.push(`💰 ${moduleDef.name} earned ${coins} coins.`);
      }
    }

    if (levelData.xpPerHour) {
      const xp = Math.floor(levelData.xpPerHour * minutes / 60);
      if (xp > 0) {
        const leveled = addXp(player, xp);
        rewards.push(`📘 ${moduleDef.name} granted ${xp} XP${leveled ? ' (Level Up!)' : ''}.`);
      }
    }

    if (levelData.surveyChancePerHour) {
      const baseChance = Math.max(0, levelData.surveyChancePerHour);
      const chance = 1 - Math.pow(1 - Math.min(baseChance, 0.95), minutes / 60);
      const boostedChance = Math.min(0.95, chance * (1 + (base.bonuses?.surveyBoost || 0)));
      if (Math.random() < boostedChance) {
        const discovered = autoDiscoverNeighbor(player, base, biome);
        if (discovered) rewards.push(`🧭 Surveyors mapped ${discovered.replace(/_/g, ' ')}.`);
      }
    }
  });

  handleBaseIncidents(player, base, minutes, biome, rewards);
  recalcBaseBonuses(base);
  recalcPlayerBaseBonuses(player);
  checkCosmeticUnlocks(null, player);

  if (rewards.length) {
    recordBaseLog(base, rewards, { timestamp: now });
  }
  return rewards;
}
function processSettlementTick(player, settlement, now = Date.now()) {
  if (!settlement) return;
  const elapsed = now - (settlement.lastUpdated || now);
  if (elapsed < 60_000) return;
  const hours = Math.floor(elapsed / 3_600_000) || 1;
  settlement.lastUpdated = settlement.lastUpdated + hours * 3_600_000;
  const tier = getSettlementPrestigeTier(settlement.prestige || 0);
  const baseBonuses = player.baseBonuses || {};
  const wealthGainBase = Math.floor((settlement.happiness / 100) * 10 * hours);
  const wealthMultiplier = (tier?.bonus?.wealthMultiplier || 1) * (1 + (baseBonuses.settlementWealthBonus || 0));
  settlement.wealth += Math.floor(wealthGainBase * wealthMultiplier);
  settlement.happiness = Math.min(100, settlement.happiness + 0.2 * hours);
  const templateMaxPop = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId]?.population?.max || settlement.population;
  settlement.population = Math.min(templateMaxPop, settlement.population + Math.floor(hours / 6));
  if (settlement.nextDecisionAt <= now) {
    const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId];
    if (template?.decisionTable?.length) {
      const decisionId = randChoice(template.decisionTable);
      const decision = SETTLEMENT_DECISIONS[decisionId];
      if (decision) {
        settlement.decisions.push({ id: decisionId, startedAt: now, deadline: now + 2 * 3_600_000 });
      }
    }
    settlement.nextDecisionAt = now + 3 * 3_600_000;
  }
  settlement.expeditions = settlement.expeditions || [];
  if (settlement.production) {
    Object.entries(settlement.production).forEach(([item, rate]) => {
      if (!rate) return;
      const total = Math.max(0, Math.floor(rate * hours));
      if (total > 0) {
        settlement.stockpile[item] = (settlement.stockpile[item] || 0) + total;
      }
    });
  }
  settlement.expeditions.forEach(expedition => {
    if (expedition.status === 'active' && expedition.endsAt <= now) {
      const definition = SETTLEMENT_EXPEDITIONS[expedition.type];
      let successChance = 0.6 + (settlement.happiness / 200);
      if (definition?.type === 'trade' && settlement.buildings.market) successChance += 0.15;
      if (definition?.type === 'trade') successChance += baseBonuses.settlementWealthBonus || 0;
      if (definition?.type === 'exploration' && settlement.traits.includes('scholarly')) successChance += 0.05;
      if (definition?.type === 'exploration' && settlement.bonuses?.expeditionBonus) successChance += settlement.bonuses.expeditionBonus;
      if (definition?.type === 'combat' && settlement.buildings.barracks) successChance += 0.1;
      if (definition?.type === 'combat' && settlement.bonuses?.combatBonus) successChance += settlement.bonuses.combatBonus;
      if (definition?.type === 'combat') successChance += baseBonuses.settlementDefenseBonus || 0;
      if (definition?.type === 'diplomacy' && settlement.buildings.embassy) successChance += 0.1;
      if (definition?.type === 'knowledge' && settlement.buildings.archive) successChance += 0.12;
      if (definition?.type === 'knowledge' && settlement.bonuses?.knowledgeBoost) successChance += settlement.bonuses.knowledgeBoost;
      if (definition?.type === 'ritual' && settlement.buildings.ritual_grove) successChance += 0.12;
      if (definition?.type === 'ritual' && settlement.traits.includes('mystic')) successChance += 0.08;
      if (tier?.bonus?.successChance) successChance += tier.bonus.successChance;
      const success = Math.random() < Math.min(successChance, 0.95);
      expedition.status = 'completed';
      if (success) {
        expedition.success = true;
        const supportLevelSource = definition?.supportBuilding ? settlement.buildings[definition.supportBuilding] : settlement.buildings[definition.type];
        const supportLevel = supportLevelSource || 1;
        const rewards = definition?.rewards?.(supportLevel, expedition.villagers) || {};
        expedition.rewards = rewards;
        expedition.returning = expedition.villagers;
        settlement.population = Math.min(templateMaxPop, settlement.population + expedition.returning);
        settlement.happiness = Math.min(100, settlement.happiness + 4);
        if (definition?.prestigeSuccess) adjustSettlementPrestige(settlement, definition.prestigeSuccess, player);
        if (rewards.settlement) {
          applySettlementEffects(player, settlement, rewards.settlement);
          delete rewards.settlement;
        }
      } else {
        expedition.success = false;
        const casualties = Math.max(1, Math.floor(expedition.villagers / 3));
        expedition.returning = Math.max(0, expedition.villagers - casualties);
        settlement.population = Math.min(templateMaxPop, settlement.population + expedition.returning);
        settlement.happiness = Math.max(0, settlement.happiness - 6);
        expedition.rewards = null;
        if (definition?.prestigeFailure) adjustSettlementPrestige(settlement, definition.prestigeFailure, player);
      }
    }
  });
  checkCosmeticUnlocks(null, player);
}
function canAffordCost(player, cost = {}, options = {}) {
  if (!cost) return true;
  if (cost.coins && player.coins < cost.coins) return false;
  const storage = options.baseStorage || {};
  if (cost.materials) {
    for (const [item, amount] of Object.entries(cost.materials)) {
      const owned = (storage[item] || 0) + (player.inventory?.[item] || 0);
      if (owned < amount) return false;
    }
  }
  return true;
}
function deductCost(player, cost = {}, options = {}) {
  if (!cost) return;
  if (cost.coins) {
    player.coins -= cost.coins;
  }
  const storage = options.baseStorage;
  if (cost.materials) {
    for (const [item, amount] of Object.entries(cost.materials)) {
      let remaining = amount;
      if (storage && storage[item]) {
        const used = Math.min(storage[item], remaining);
        storage[item] -= used;
        if (storage[item] <= 0) delete storage[item];
        remaining -= used;
      }
      if (remaining > 0) {
        if (player.inventory?.[item]) {
          const used = Math.min(player.inventory[item], remaining);
          player.inventory[item] -= used;
          if (player.inventory[item] <= 0) delete player.inventory[item];
          remaining -= used;
        }
      }
    }
  }
}
function startTravel(player, targetBiomeId) {
  const exploration = ensureExplorationState(player);
  const duration = calculateTravelDuration(player, exploration.currentBiome, targetBiomeId);
  const now = Date.now();
  const origin = exploration.currentBiome;
  exploration.status = 'traveling';
  exploration.targetBiome = targetBiomeId;
  exploration.action = {
    type: 'travel',
    biomeId: targetBiomeId,
    startedAt: now,
    endsAt: now + duration,
    metadata: { from: origin }
  };
  return duration;
}
function startExplorationAction(player, actionType, biomeId, metadata = {}, options = {}) {
  const exploration = ensureExplorationState(player);
  const durationMinutes = Math.max(
    1,
    Number(options.durationMinutes ?? metadata.durationMinutes ?? getBiomeActionDuration(biomeId, actionType))
  );
  const now = Date.now();
  exploration.status = 'busy';
  exploration.action = {
    type: actionType,
    biomeId,
    startedAt: now,
    endsAt: now + durationMinutes * 60_000,
    metadata
  };
  return durationMinutes * 60_000;
}


function getBiomeActionDuration(biomeId, actionType) {
  const fallback = EXPLORATION_ACTION_DURATIONS[actionType] || 4;
  if (!biomeId) return fallback;
  const key = biomeId.toLowerCase();
  const meta = EXPLORATION_META_BIOME_LOOKUP[key];
  if (meta?.actionDurations && Number.isFinite(meta.actionDurations[actionType])) {
    return Number(meta.actionDurations[actionType]);
  }
  const biome = BIOME_LOOKUP[key];
  if (biome?.actionDurations && Number.isFinite(biome.actionDurations[actionType])) {
    return Number(biome.actionDurations[actionType]);
  }
  return fallback;
}
function resolveExplorationCombat(player, enemyId) {
  const exploration = ensureExplorationState(player);
  exploration.consecutiveActionsSinceCombat = 0;
  exploration.lastCombatAt = Date.now();
  const enemy = ENEMY_MAP[enemyId];
  if (!enemy) {
    return { description: `Encountered unknown enemy **${enemyId}** but it fled before engaging.`, events: [] };
  }
  const xpGain = Math.max(20, enemy.xp || 40);
  const coins = enemy.coins || 25;
  const rewardLines = grantRewards(player, { xp: xpGain, coins }, null);
  processQuestEvent(null, player, { type: 'defeat', enemyId, count: 1 });
  return {
    description: `⚔️ You battled ${enemy.name} during exploration and prevailed! Rewards: ${rewardLines.join(', ')}`,
    events: rewardLines
  };
}
function resolveStructureEncounter(player, structureId) {
  const structure = STRUCTURE_LOOKUP[structureId?.toLowerCase()];
  if (!structure) {
    return { text: 'Found an unmarked ruin but could not glean anything useful.' };
  }
  const puzzle = structure.puzzle;
  if (!puzzle) {
    return { text: `Explored **${structure.name}** but found nothing of note.` };
  }
  const focus = player.attributes?.focus || 6;
  const agility = player.attributes?.agility || 6;
  let successChance = 0.55 + focus * 0.02 + agility * 0.01 - (puzzle.difficulty || 1) * 0.05;
  successChance = Math.max(0.1, Math.min(0.95, successChance));
  const success = Math.random() < successChance;
  if (success) {
    const rewardLines = grantRewards(player, puzzle.successReward, null);
    return { text: `🧩 Solved **${structure.name}** puzzle! Rewards: ${rewardLines.join(', ')}` };
  }
  let failureText = `❌ Failed to solve **${structure.name}**.`;
  if (puzzle.failureConsequence?.damagePercent) {
    const damage = Math.floor(player.maxHp * puzzle.failureConsequence.damagePercent);
    player.hp = Math.max(1, player.hp - damage);
    failureText += ` Took ${damage} damage.`;
  }
  if (puzzle.failureConsequence?.spawnEnemy) {
    const combat = resolveExplorationCombat(player, puzzle.failureConsequence.spawnEnemy);
    failureText += ` ${combat.description}`;
  }
  if (puzzle.failureConsequence?.debuff) {
    failureText += ` Suffered ${puzzle.failureConsequence.debuff} for ${Math.floor((puzzle.failureConsequence.durationSeconds || 120) / 60)} minutes.`;
  }
  return { text: failureText };
}
function triggerExplorationEvent(player, biome, event, message) {
  if (!event) return null;
  switch (event.type) {
    case 'story': {
      const rewardLines = grantRewards(player, event.reward, message);
      return { text: `📖 ${event.id.replace(/_/g, ' ')} — ${rewardLines.join(', ')}` };
    }
    case 'structure': {
      startExplorationAction(player, 'structure', biome.id, { structureId: event.structure });
      return { text: `🧩 Discovered **${STRUCTURE_LOOKUP[event.structure]?.name || event.structure}**. Use \`${PREFIX} explore resolve\` when the timer completes.` };
    }
    case 'puzzle': {
      startExplorationAction(player, 'puzzle', biome.id, { structureId: event.structure });
      return { text: `🧠 Resonance puzzle detected: **${STRUCTURE_LOOKUP[event.structure]?.name || event.structure}**.` };
    }
    case 'camp': {
      const combatEntries = Array.isArray(biome?.encounters?.combat) ? biome.encounters.combat : [];
      const campData = event.camp || event.metadata?.camp || {};
      const encounterPool = Array.isArray(campData.encounters) && campData.encounters.length
        ? campData.encounters.map(enemy => ({ enemy }))
        : combatEntries;
      if (!encounterPool || encounterPool.length === 0) {
        return { text: '🏕️ Found an abandoned camp with no defenders.' };
      }
      const encounter = weightedChoice(encounterPool, 'chance');
      if (!encounter || !encounter.enemy) return { text: '🏕️ The camp was deserted.' };
      const combatOutcome = resolveExplorationCombat(player, encounter.enemy);
      const prefix = campData.faction ? `[${campData.faction.toUpperCase()}] ` : '';
      const rewardLines = campData.reward ? grantRewards(player, campData.reward, message) : [];
      const lootLine = rewardLines.length ? ` Loot: ${rewardLines.join(', ')}` : '';
      return { text: `🏕️ ${prefix}${combatOutcome.description}${lootLine}` };
    }
    case 'rare_unique': {
      const descriptor = event.name || event.structure || 'a rare phenomenon';
      const rewards = event.reward ? grantRewards(player, event.reward, message) : null;
      const rewardText = rewards?.length ? ` Rewards: ${rewards.join(', ')}` : '';
      return { text: `✨ You encounter ${descriptor}. Unique opportunities await!${rewardText}` };
    }
    case 'settlement': {
      const template = SETTLEMENT_TEMPLATE_LOOKUP[event.template?.toLowerCase()];
      if (!template) return { text: 'Stumbled upon a settlement, but it vanished like a mirage.' };
      const settlementId = `${template.id}_${Math.floor(Date.now() / 1000)}`;
      const settlement = ensureSettlement(player, settlementId, template);
      return { text: `🏘️ Discovered settlement **${settlement.name}** (${template.faction}). Use \`${PREFIX} settlement info ${settlementId}\` to manage it.` };
    }
    default:
      return { text: 'Encountered something unusual, but nothing came of it.' };
  }
}
function resolveExplorationAction(player, message) {
  const exploration = ensureExplorationState(player);
  const action = exploration.action;
  if (!action) return null;
  const now = Date.now();
  if (action.endsAt > now) return null;
  const biome = getBiomeDefinition(action.biomeId || exploration.currentBiome);
  let responseText = '';
  const extraFields = [];
  exploration.action = null;
  exploration.status = 'idle';
  if (action.type === 'travel') {
    exploration.currentBiome = action.biomeId;
    exploration.targetBiome = null;
    if (!exploration.discoveredBiomes.includes(action.biomeId)) {
      exploration.discoveredBiomes.push(action.biomeId);
    }
    exploration.travelHistory.push({ from: action.metadata?.from || exploration.currentBiome, to: action.biomeId, arrivedAt: now });
    exploration.consecutiveActionsSinceCombat = 0;
    responseText = `🚶 Arrived at **${biome?.name || action.biomeId}**.`;
    checkCosmeticUnlocks(message, player);
    return { text: responseText, fields: extraFields };
  }
  if (action.type === 'forage' || action.type === 'mine' || action.type === 'scavenge') {
    const table = biome?.resources?.[action.type];
    const results = [];
    if (Array.isArray(table)) {
      for (let i = 0; i < 3; i++) {
        const entry = weightedChoice(table, 'chance');
        if (!entry) continue;
        if (Math.random() > (entry.chance || 1)) continue;
        const min = entry.min || 1;
        const max = entry.max || min;
        const qty = min + Math.floor(Math.random() * (max - min + 1));
        addItemToInventory(player, entry.item, qty);
        results.push(`${entry.item} x${qty}`);
        processQuestEvent(message, player, { type: 'gather', itemId: entry.item, count: qty });
      }
    }
    responseText = `🔍 Completed ${action.type} in ${biome?.name || exploration.currentBiome}.`;
    if (results.length) extraFields.push({ name: 'Gathered', value: results.join('\n'), inline: false });
    const eventEntries = Array.isArray(biome?.encounters?.events) ? biome.encounters.events : null;
    const combatEntries = Array.isArray(biome?.encounters?.combat) ? biome.encounters.combat : null;
    const totalEventWeight = Object.values(EXPLORATION_EVENT_WEIGHTS).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const eventTriggerChance = Math.min(0.75, totalEventWeight > 0 ? totalEventWeight : 0.25);
    let combatTriggered = false;
    if (eventEntries && eventEntries.length) {
      if (Math.random() < eventTriggerChance) {
        const event = weightedChoice(eventEntries, 'chance');
      if (event) {
        const eventOutcome = triggerExplorationEvent(player, biome, event, message);
        if (eventOutcome?.text) extraFields.push({ name: 'Event', value: eventOutcome.text, inline: false });
      }
      }
    }
    if (combatEntries && combatEntries.length && shouldTriggerSuddenCombat(exploration)) {
      const encounter = weightedChoice(combatEntries, 'chance');
      if (encounter) {
        const combatOutcome = resolveExplorationCombat(player, encounter.enemy);
        extraFields.push({ name: 'Encounter', value: combatOutcome.description.slice(0, 900), inline: false });
        exploration.consecutiveActionsSinceCombat = 0;
        exploration.lastCombatAt = Date.now();
        combatTriggered = true;
      }
    }
    if (!combatTriggered) {
      exploration.consecutiveActionsSinceCombat = (exploration.consecutiveActionsSinceCombat || 0) + 1;
    }
    checkCosmeticUnlocks(message, player);
    return { text: responseText, fields: extraFields };
  }
  if (action.type === 'structure' || action.type === 'puzzle') {
    const structureId = action.metadata?.structureId;
    const outcome = resolveStructureEncounter(player, structureId);
    responseText = outcome.text || `Explored ${structureId}.`;
    return { text: responseText, fields: extraFields };
  }
  if (action.type === 'survey') {
    responseText = `🧭 Surveyed the surroundings of ${biome?.name || exploration.currentBiome}. Future events more likely.`;
    return { text: responseText, fields: extraFields };
  }
  if (action.type === 'event') {
    responseText = action.metadata?.text || 'Exploration event resolved.';
    return { text: responseText, fields: extraFields };
  }
  const chainState = exploration.pendingChain;
  if (chainState && action.metadata?.chainId && chainState.id === action.metadata.chainId) {
    const nextIndex = (chainState.index ?? 0) + 1;
    if (nextIndex < chainState.steps.length) {
      chainState.index = nextIndex;
      const nextStep = chainState.steps[nextIndex];
      const stepBiome = nextStep.biomeId || chainState.biomeId || biome?.id || exploration.currentBiome;
      const durationMinutes = Number(nextStep.durationMinutes ?? getBiomeActionDuration(stepBiome, nextStep.action));
      const durationMs = startExplorationAction(
        player,
        nextStep.action,
        stepBiome,
        {
          ...(nextStep.metadata || {}),
          chainId: chainState.id,
          chainStepIndex: nextIndex,
          chainStepTotal: chainState.steps.length
        },
        { durationMinutes }
      );
      exploration.pendingChain = chainState;
      const chainText = `➡️ Chain progress: Step ${nextIndex + 1}/${chainState.steps.length} — ${formatActionName(nextStep.action)} (${formatDuration(durationMs)}).`;
      responseText += `\n${chainText}`;
      extraFields.push({ name: 'Chain', value: chainText, inline: false });
      return { text: responseText, fields: extraFields };
    }
    exploration.pendingChain = null;
    responseText += `\n✅ Exploration chain **${chainState.id}** completed.`;
  }
  return { text: responseText || 'Exploration action completed.', fields: extraFields };
}

function startExplorationChain(player, chainId) {
  if (!chainId) return { error: 'Missing chain identifier.' };
  const key = chainId.toLowerCase();
  const templateSteps = EXPLORATION_ACTION_CHAINS.get(key);
  if (!templateSteps || templateSteps.length === 0) {
    return { error: `Unknown exploration chain "${chainId}".` };
  }

  const exploration = ensureExplorationState(player);
  const clonedSteps = templateSteps.map(step => ({
    action: step.action,
    biomeId: step.biomeId,
    durationMinutes: Number(step.durationMinutes ?? getBiomeActionDuration(exploration.currentBiome, step.action)),
    metadata: step.metadata ? JSON.parse(JSON.stringify(step.metadata)) : undefined
  }));

  exploration.pendingChain = {
    id: key,
    steps: clonedSteps,
    index: 0,
    biomeId: exploration.currentBiome
  };

  const firstStep = clonedSteps[0];
  const durationMs = startExplorationAction(
    player,
    firstStep.action,
    firstStep.biomeId || exploration.currentBiome,
    {
      ...(firstStep.metadata || {}),
      chainId: key,
      chainStepIndex: 0,
      chainStepTotal: clonedSteps.length
    },
    { durationMinutes: firstStep.durationMinutes }
  );

  return {
    chain: exploration.pendingChain,
    step: firstStep,
    durationMs
  };
}
async function handleExploreCommand(message, args = []) {
  if (!Array.isArray(args)) {
    args = typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
  }
  const player = getPlayer(message.author.id);
  const exploration = ensureExplorationState(player);
  const biome = getBiomeDefinition(exploration.currentBiome);
  if (!biome) {
    return message.reply('❌ You are currently located in an unknown biome. Try traveling again.');
  }

  const subcommand = (args[0] || '').toLowerCase();
  if (!subcommand || subcommand === 'status' || subcommand === 'info') {
    const embed = buildExplorationStatusEmbed(player, biome, exploration);
    const components = [
      ...buildGatheringActionComponents(message.author.id, exploration),
      ...buildDashboardComponents()
    ];
    return sendStyledEmbed(message, embed, 'explore', { components });
  }

  if (subcommand === 'actions') {
    const embed = buildExplorationActionsEmbed(biome);
    return message.reply({ embeds: [embed] });
  }

  if (subcommand === 'activities') {
    const embed = buildBiomeActivitiesEmbed(biome);
    return message.reply({ embeds: [embed] });
  }

  if (subcommand === 'chains') {
    const embed = buildChainListEmbed();
    return message.reply({ embeds: [embed] });
  }

  if (subcommand === 'resolve') {
    const result = resolveExplorationAction(player, message);
    if (!result) {
      return message.reply('⏳ Nothing is ready to resolve yet. Check your timers with `!hy explore status`.');
    }
    const embed = new EmbedBuilder()
      .setColor('#1ABC9C')
      .setTitle('Exploration Complete')
      .setDescription(result.text);
    if (Array.isArray(result.fields) && result.fields.length) {
      embed.addFields(result.fields.slice(0, 25));
    }
    return message.reply({ embeds: [embed] });
  }

  if (subcommand === 'cancel') {
    if (!exploration.action) {
      return message.reply('⚠️ You are not performing an exploration action.');
    }
    exploration.action = null;
    exploration.status = 'idle';
    exploration.pendingChain = null;
    return message.reply('🛑 Current exploration action cancelled.');
  }

  if (subcommand === 'chain') {
    if (exploration.action) {
      return message.reply('⏳ Finish or cancel your current action before launching a chain.');
    }
    const chainId = (args[1] || '').toLowerCase();
    if (!chainId) {
      const embed = buildChainListEmbed();
      embed.setTitle('Exploration Chains');
      return message.reply({ embeds: [embed] });
    }
    const { error, chain, step, durationMs } = startExplorationChain(player, chainId);
    if (error) {
      return message.reply(`❌ ${error}`);
    }
    const actionName = formatActionName(step.action);
    return message.reply(`🧭 Chain **${chain.id}** initiated — Step 1/${chain.steps.length}: **${actionName}** (${formatDuration(durationMs)}). Use \`${PREFIX} explore resolve\` when the timer completes.`);
  }

  if (subcommand === 'activity') {
    const activityId = args[1];
    if (!Array.isArray(biome.activities) || biome.activities.length === 0) {
      return message.reply('⚠️ This biome has no bespoke activities.');
    }
    if (!activityId) {
      const embed = buildBiomeActivitiesEmbed(biome);
      return message.reply({ embeds: [embed] });
    }
    const activity = biome.activities.find(entry => entry.id?.toLowerCase() === activityId.toLowerCase());
    if (!activity) {
      return message.reply(`❌ Activity "${activityId}" is not available here. Use \`${PREFIX} explore activities\` to view options.`);
    }
    if (exploration.action) {
      return message.reply('⏳ Finish or resolve your current action before starting another.');
    }
    exploration.pendingChain = null;
    const duration = Number(activity.durationMinutes ?? getBiomeActionDuration(exploration.currentBiome, activity.type));
    const durationMs = startExplorationAction(
      player,
      activity.type,
      exploration.currentBiome,
      {
        activityId: activity.id,
        activityName: activity.name,
        description: activity.description,
        chainId: null
      },
      { durationMinutes: duration }
    );
    return message.reply(`🌿 Starting activity **${activity.name || activity.id}** (${formatDuration(durationMs)}). Use \`${PREFIX} explore resolve\` when complete.`);
  }

  // Default: treat as direct action request
  const actionType = subcommand;
  if (!EXPLORATION_ACTION_DURATIONS[actionType] && !biome.actionDurations?.[actionType]) {
    return message.reply(`❌ Unknown exploration action "${actionType}". Try \`${PREFIX} explore actions\` for a list.`);
  }
  if (exploration.action) {
    return message.reply('⏳ Finish or resolve your current action before starting another.');
  }

  exploration.pendingChain = null;
  const durationMinutes = getBiomeActionDuration(exploration.currentBiome, actionType);
  const durationMs = startExplorationAction(player, actionType, exploration.currentBiome);
  const actionLabel = formatActionName(actionType);
  return message.reply(`🔁 Beginning **${actionLabel}** in ${biome.name || exploration.currentBiome} (${formatDuration(durationMs)}). Use \`${PREFIX} explore resolve\` when the timer completes.`);
}
async function handleGatherCommand(message, args = []) {
  if (!Array.isArray(args)) {
    args = typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
  }
  const player = getPlayer(message.author.id);
  const exploration = ensureExplorationState(player);
  const biome = getBiomeDefinition(exploration.currentBiome);
  if (!biome) {
    return message.reply('❌ Unable to determine your current biome.');
  }

  const sub = (args[0] || '').toLowerCase();
  if (!sub || sub === 'status' || sub === 'info') {
    const includeTutorial = !player.tutorials.gathering?.intro;
    const embed = buildGatherStatusEmbed(player, biome, exploration, { includeTutorial });
    player.tutorials.gathering.intro = true;
    embed.addFields({
      name: 'Resource Highlights',
      value: summarizeBiomeGatheringResources(biome),
      inline: false
    });
    const components = [
      ...buildGatheringActionComponents(message.author.id, exploration),
      ...buildDashboardComponents()
    ];
    return sendStyledEmbed(message, embed, 'gather', { components });
  }

  if (sub === 'gear') {
    const actionType = (args[1] || '').toLowerCase();
    if (!actionType || actionType === 'status' || actionType === 'info') {
      const embed = buildGatheringGearEmbed(player);
      const components = [
        ...buildGatheringActionComponents(message.author.id, exploration),
        ...buildDashboardComponents()
      ];
      return sendStyledEmbed(message, embed, 'gather', { components });
    }
    if (actionType === 'upgrade') {
      const targetType = (args[2] || '').toLowerCase();
      if (!GATHERING_SET_TYPES.includes(targetType)) {
        return message.reply(`❌ Specify a gathering type to upgrade: ${GATHERING_SET_TYPES.join(', ')}`);
      }
      const gear = ensureGatheringGear(player);
      const currentId = gear.current?.[targetType];
      const nextTier = getNextGatheringTier(targetType, currentId);
      if (!nextTier) {
        return message.reply('⭐ You already have the best gear for that gathering type.');
      }
      if (!canAffordGatheringTier(player, nextTier)) {
        return message.reply(`❌ Missing materials. Cost: ${formatGatheringRequirements(nextTier)}.`);
      }
      applyGatheringTierCost(player, nextTier);
      gear.unlocked[targetType] = gear.unlocked[targetType] || {};
      gear.current[targetType] = nextTier.id;
      gear.unlocked[targetType][nextTier.id] = true;
      const embed = buildGatheringGearEmbed(player);
      embed.setDescription(`✅ Upgraded **${GATHERING_TYPE_LABELS[targetType]}** gear to **${nextTier.name}**!\nSpeed +${(nextTier.bonuses.speed * 100).toFixed(0)}%, Yield +${(nextTier.bonuses.quantity * 100).toFixed(0)}%, Rare +${(nextTier.bonuses.rarity * 100).toFixed(0)}%.`);
      const components = [
        ...buildGatheringActionComponents(message.author.id, exploration),
        ...buildDashboardComponents()
      ];
      return sendStyledEmbed(message, embed, 'gather', { components });
    }
    return message.reply('❌ Unknown gear subcommand. Try `status` or `upgrade <type>`.');
  }

  if (sub === 'notifications') {
    const option = (args[1] || '').toLowerCase();
    let enabled;
    if (!option) {
      enabled = !shouldSendGatherNotifications(player);
    } else if (['on', 'enable', 'enabled', 'true', 'yes'].includes(option)) {
      enabled = true;
    } else if (['off', 'disable', 'disabled', 'false', 'no'].includes(option)) {
      enabled = false;
    } else {
      return message.reply('❌ Use `!hy gather notifications on` or `!hy gather notifications off`.');
    }
    setGatherNotifications(player, enabled);
    return message.reply(`🔔 Harvest notifications ${enabled ? 'enabled' : 'disabled'}.`);
  }

  if (GATHERING_SET_TYPES.includes(sub)) {
    const result = await startGatheringSession(player, sub, { message, biome });
    if (result?.error) {
      return message.reply(`❌ ${result.error}`);
    }
    return;
  }

  return message.reply(`❌ Unknown gather option "${sub}". Try \`${PREFIX} gather status\` or \`${PREFIX} gather gear\`.`);
}
async function handleTravelCommand(message, args = []) {
  if (!Array.isArray(args)) {
    args = typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
  }
  const player = getPlayer(message.author.id);
  const exploration = ensureExplorationState(player);
  const currentBiome = getBiomeDefinition(exploration.currentBiome);
  if (!currentBiome) {
    return message.reply('❌ Unable to determine your current biome.');
  }

  const joinedArg = args.join(' ').trim();
  const lowerArg = joinedArg.toLowerCase();

  if (!joinedArg || lowerArg === 'status' || lowerArg === 'info') {
    const embed = buildTravelStatusEmbed(player, exploration, currentBiome);
    return sendStyledEmbed(message, embed, 'travel', { components: buildDashboardComponents() });
  }

  if (lowerArg === 'resolve') {
    const result = resolveExplorationAction(player, message);
    if (!result) {
      return message.reply('⏳ No travel to resolve right now.');
    }
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('Travel Complete')
      .setDescription(result.text);
    if (Array.isArray(result.fields) && result.fields.length) {
      embed.addFields(result.fields.slice(0, 25));
    }
    return message.reply({ embeds: [embed] });
  }

  if (exploration.action && exploration.action.type === 'travel') {
    return message.reply('⏳ You are already traveling. Use `!hy explore resolve` once the journey completes.');
  }
  if (exploration.action && exploration.action.type !== 'travel') {
    return message.reply('⏳ Finish your current exploration action before starting a new journey.');
  }

  const targetId = resolveBiomeId(joinedArg);
  if (!targetId) {
    return message.reply(`❌ Could not find biome "${joinedArg}". Try \`${PREFIX} travel\` to view neighbors.`);
  }

  const neighbors = Array.isArray(currentBiome.travel?.neighbors) ? currentBiome.travel.neighbors.map(n => n.toLowerCase()) : [];
  if (!neighbors.includes(targetId.toLowerCase())) {
    const neighborNames = formatNeighborList(currentBiome);
    return message.reply(`⚠️ ${formatBiomeName(targetId)} is not directly reachable from here. Available neighbors: ${neighborNames || 'none'}.`);
  }

  exploration.pendingChain = null;
  const durationMs = startTravel(player, targetId);
  const targetBiome = getBiomeDefinition(targetId);
  return message.reply(`🧭 Departing for **${targetBiome?.name || targetId}**. Estimated travel time: ${formatDuration(durationMs)}. Use \`${PREFIX} explore resolve\` when the journey completes.`);
}

function resolveBiomeId(input) {
  if (!input) return null;
  const cleaned = input.toLowerCase().replace(/\s+/g, '_');
  if (BIOME_LOOKUP[cleaned]) return BIOME_LOOKUP[cleaned].id || cleaned;
  const exact = EXPLORATION_BIOMES.find(b => b.name?.toLowerCase() === input.toLowerCase());
  if (exact) return exact.id;
  const partial = EXPLORATION_BIOMES.find(b => b.name?.toLowerCase().includes(input.toLowerCase()) || b.id?.toLowerCase().includes(cleaned));
  return partial?.id || null;
}
function buildExplorationStatusEmbed(player, biome, exploration) {
  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(`🌍 ${biome.name || exploration.currentBiome}`)
    .setDescription(biome.description || 'No description recorded for this biome.')
    .setThumbnail(BIOME_ARTWORK[biome.id?.toLowerCase?.()] || EMBED_VISUALS.exploration)
    .setImage(BIOME_ARTWORK[biome.id?.toLowerCase?.()] || EMBED_VISUALS.exploration);

  let statusValue = 'Idle';
  if (exploration.action) {
    statusValue = `${formatActionName(exploration.action.type)} — ${formatDuration(Math.max(0, exploration.action.endsAt - Date.now()))}`;
  } else if (exploration.gathering) {
    const remaining = Math.max(0, exploration.gathering.endsAt - Date.now());
    statusValue = `Gathering ${formatActionName(exploration.gathering.type)} — ${formatDuration(remaining)}`;
  }
  embed.addFields({ name: 'Status', value: statusValue, inline: false });

  const neighbors = formatNeighborList(biome);
  if (neighbors) {
    embed.addFields({ name: 'Neighbors', value: neighbors, inline: false });
  }

  const actions = getAvailableActionTypes(biome);
  if (actions.length) {
    embed.addFields({ name: 'Available Actions', value: actions.map(action => `• ${formatActionName(action)} (${formatMinutes(getBiomeActionDuration(biome.id, action))})`).join('\n'), inline: false });
  }

  if (Array.isArray(biome.activities) && biome.activities.length) {
    const highlights = biome.activities.slice(0, 3).map(activity => `• ${activity.name || formatActionName(activity.id || activity.type)} (${formatMinutes(activity.durationMinutes ?? getBiomeActionDuration(biome.id, activity.type))})`);
    embed.addFields({ name: 'Signature Activities', value: highlights.join('\n'), inline: false });
  }

  const materialHighlights = getBiomeMaterialHighlights(biome);
  if (materialHighlights) {
    embed.addFields({ name: 'Key Materials', value: materialHighlights, inline: false });
  }

  if (exploration.pendingChain) {
    const chain = exploration.pendingChain;
    embed.addFields({
      name: 'Active Chain',
      value: `${chain.id} — Step ${Math.min(chain.index + 1, chain.steps.length)}/${chain.steps.length}`,
      inline: false
    });
  }

  const gatheringSummary = buildGatheringGearSummary(player);
  if (gatheringSummary) {
    embed.addFields({ name: 'Gathering Gear', value: gatheringSummary, inline: false });
  }

  embed.setFooter({ text: `Discovered biomes: ${exploration.discoveredBiomes.length}` });
  return embed;
}

function buildExplorationActionsEmbed(biome) {
  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(`Available Actions — ${biome.name || biome.id}`);
  const lines = getAvailableActionTypes(biome).map(action => `• **${formatActionName(action)}** — ${formatMinutes(getBiomeActionDuration(biome.id, action))}`);
  embed.setDescription(lines.join('\n') || 'Standard actions available.');
  return embed;
}

function buildBiomeActivitiesEmbed(biome) {
  const embed = new EmbedBuilder()
    .setColor('#16A085')
    .setTitle(`Activities — ${biome.name || biome.id}`);
  if (!Array.isArray(biome.activities) || biome.activities.length === 0) {
    embed.setDescription('No bespoke activities available here.');
    return embed;
  }
  const lines = biome.activities.map(activity => {
    const name = activity.name || formatActionName(activity.id || activity.type);
    const duration = formatMinutes(activity.durationMinutes ?? getBiomeActionDuration(biome.id, activity.type));
    const desc = activity.description ? ` — ${activity.description}` : '';
    return `• **${name}** (${duration})${desc}`;
  });
  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `Start with: ${PREFIX} explore activity <id>` });
  return embed;
}

function buildChainListEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#2980B9')
    .setTitle('Exploration Chains');
  const chains = Array.from(EXPLORATION_ACTION_CHAINS.keys());
  if (!chains.length) {
    embed.setDescription('No exploration chains configured.');
    return embed;
  }
  embed.setDescription(chains.map(id => `• ${id}`).join('\n'));
  embed.setFooter({ text: `Start with: ${PREFIX} explore chain <id>` });
  return embed;
}
function buildTravelStatusEmbed(player, exploration, biome) {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle(`Travel Planner — ${biome.name || biome.id}`)
    .setDescription(biome.description || 'No description recorded for this biome.')
    .setThumbnail(EMBED_VISUALS.travel)
    .setImage(BIOME_ARTWORK[biome.id?.toLowerCase?.()] || EMBED_VISUALS.travel);

  const action = exploration.action;
  if (action && action.type === 'travel') {
    const remaining = Math.max(0, action.endsAt - Date.now());
    embed.addFields({ name: 'Current Journey', value: `${formatActionName(action.type)} to ${formatBiomeName(action.biomeId)} — ${formatDuration(remaining)} remaining`, inline: false });
  }

  const neighbors = Array.isArray(biome.travel?.neighbors) ? biome.travel.neighbors : [];
  if (neighbors.length) {
    const lines = neighbors.map(neighborId => {
      const duration = formatDuration(calculateTravelDuration(player, exploration.currentBiome, neighborId));
      return `• ${formatBiomeName(neighborId)} — ${duration}`;
    });
    embed.addFields({ name: 'Reachable Neighbors', value: lines.join('\n'), inline: false });
  } else {
    embed.addFields({ name: 'Reachable Neighbors', value: 'None discovered yet.', inline: false });
  }

  embed.setFooter({ text: `Use ${PREFIX} travel <biome> to depart.` });
  return embed;
}

function getAvailableActionTypes(biome) {
  const actions = new Set(Object.keys(EXPLORATION_ACTION_DURATIONS));
  if (biome?.actionDurations) {
    Object.keys(biome.actionDurations).forEach(action => actions.add(action));
  }
  if (Array.isArray(biome?.activities)) {
    biome.activities.forEach(activity => actions.add(activity.type));
  }
  return Array.from(actions);
}

function getBiomeMaterialHighlights(biome, limit = 5) {
  const materials = biome?.materials;
  if (!materials || typeof materials !== 'object') return '';
  const preferredOrder = ['foraging', 'farming', 'harvesting', 'mining', 'scavenge', 'scavenging', 'special'];
  const seen = new Set();
  const highlights = [];

  const pushEntries = entries => {
    if (!Array.isArray(entries)) return;
    entries.forEach(entry => {
      if (highlights.length >= limit) return;
      const itemId = entry?.item || entry?.id;
      if (!itemId || seen.has(itemId)) return;
      seen.add(itemId);
      const label = formatItemName(itemId);
      const tags = [];
      if (entry?.tier != null) tags.push(`T${entry.tier}`);
      if (entry?.rarity) tags.push(formatActionName(String(entry.rarity)));
      const line = tags.length ? `${label} (${tags.join(' · ')})` : label;
      highlights.push(`• ${line}`);
    });
  };

  preferredOrder.forEach(key => pushEntries(materials[key]));
  Object.entries(materials).forEach(([key, value]) => {
    if (preferredOrder.includes(key)) return;
    pushEntries(value);
  });

  return highlights.length ? highlights.join('\n') : '';
}

function formatNeighborList(biome) {
  const neighbors = Array.isArray(biome.travel?.neighbors) ? biome.travel.neighbors : [];
  if (!neighbors.length) return '';
  return neighbors.map(formatBiomeName).join(', ');
}

function formatItemName(itemId) {
  if (!itemId) return 'Unknown';
  const item = ITEMS[itemId];
  if (!item) {
    return itemId.replace(/_/g, ' ');
  }
  return item.emoji ? `${item.emoji} ${item.name}` : item.name || itemId;
}

function formatBiomeName(biomeId) {
  if (!biomeId) return 'Unknown';
  const def = getBiomeDefinition(biomeId);
  return def?.name || biomeId.replace(/_/g, ' ');
}

function formatActionName(actionType = '') {
  return actionType
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '?';
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (minutes >= 1) {
    return `${Math.max(1, Math.round(minutes))}m`;
  }
  return '<1m';
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return '?';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

async function handleBaseCommand(message, args = []) {
  if (!Array.isArray(args)) {
    args = typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
  }
  const player = getPlayer(message.author.id);
  const exploration = ensureExplorationState(player);
  const subcommand = (args[0] || '').toLowerCase();

  if (!subcommand || subcommand === 'list' || subcommand === 'status') {
    const embed = buildBaseSummaryEmbed(player, exploration);
    return sendStyledEmbed(message, embed, 'base', { components: buildDashboardComponents() });
  }

  if (subcommand === 'claim') {
    const biomeArg = args.slice(1).join(' ');
    const biomeId = biomeArg ? resolveBiomeId(biomeArg) : exploration.currentBiome;
    if (!biomeId) return message.reply('❌ Provide a valid biome to claim a base.');
    const key = biomeId.toLowerCase();
    const alreadyExists = player.bases && player.bases[key];
    const base = ensureBase(player, key);
    if (!alreadyExists) {
      player.stats.basesClaimed = (player.stats.basesClaimed || 0) + 1;
      return message.reply(`🏕️ Established a new base at **${formatBiomeName(biomeId)}**.`);
    }
    return message.reply(`ℹ️ A base already exists in **${formatBiomeName(biomeId)}**.`);
  }

  if (subcommand === 'info') {
    const biomeArg = args.slice(1).join(' ');
    const biomeId = biomeArg ? resolveBiomeId(biomeArg) : exploration.currentBiome;
    if (!biomeId) return message.reply('❌ Unknown biome. Try `!hy base info <biome>`.');
    const base = ensureBase(player, biomeId.toLowerCase());
    const embed = buildBaseDetailEmbed(player, base);
    return sendStyledEmbed(message, embed, 'base', { components: buildBaseDetailComponents(base) });
  }

  if (subcommand === 'modules') {
    const biomeArg = args.slice(1).join(' ');
    const biomeId = biomeArg ? resolveBiomeId(biomeArg) : exploration.currentBiome;
    if (!biomeId) return message.reply('❌ Unknown biome. Try `!hy base modules <biome>`.');
    const base = ensureBase(player, biomeId.toLowerCase());
    const embed = buildBaseModuleListEmbed(player, base);
    return sendStyledEmbed(message, embed, 'base', { components: buildBaseModulesComponents(base) });
  }

  if (subcommand === 'rankup') {
    const biomeArg = args.slice(1).join(' ');
    const biomeId = biomeArg ? resolveBiomeId(biomeArg) : exploration.currentBiome;
    if (!biomeId) return message.reply('❌ Unknown biome. Try `!hy base rankup <biome>`.');
    const base = ensureBase(player, biomeId.toLowerCase());
    const result = rankUpBase(player, base);
    if (result.error) return message.reply(`❌ ${result.error}`);
    const embed = buildBaseDetailEmbed(player, base);
    if (result.message) embed.setDescription(result.message);
    return sendStyledEmbed(message, embed, 'base', { components: buildBaseDetailComponents(base) });
  }

  if (subcommand === 'upgrade') {
    const hasBiome = args[1] && !args[1].includes(':') && !BASE_UPGRADE_DEFINITIONS[args[1].toLowerCase()];
    const biomeArg = hasBiome ? args[1] : null;
    const moduleId = args[hasBiome ? 2 : 1];
    if (!moduleId) return message.reply('❌ Usage: `!hy base upgrade [biome] <moduleId>`');
    const biomeId = biomeArg ? resolveBiomeId(biomeArg) : exploration.currentBiome;
    if (!biomeId) return message.reply('❌ Unknown biome. Try `!hy base upgrade <biome> <moduleId>`.');
    const base = ensureBase(player, biomeId.toLowerCase());
    const result = upgradeBaseModule(player, base, moduleId.toLowerCase());
    if (result.error) return message.reply(`❌ ${result.error}`);
    const embed = buildBaseDetailEmbed(player, base);
    if (result.message) embed.setDescription(result.message);
    return sendStyledEmbed(message, embed, 'base', { components: buildBaseDetailComponents(base) });
  }

  const embed = buildBaseSummaryEmbed(player, exploration);
  embed.setDescription(
    `${embed.data.description || ''}\n\n` +
    `• Claim: \`${PREFIX} base claim <biome>\`\n` +
    `• Info: \`${PREFIX} base info <biome>\`\n` +
    `• Rank Up: \`${PREFIX} base rankup <biome>\`\n` +
    `• Modules: \`${PREFIX} base modules <biome>\`\n` +
    `• Upgrade: \`${PREFIX} base upgrade <biome> <moduleId>\``
  );
  return sendStyledEmbed(message, embed, 'base', { components: buildDashboardComponents() });
}
async function handleSettlementCommand(message, args = []) {
  if (!Array.isArray(args)) {
    args = typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : [];
  }
  const player = getPlayer(message.author.id);
  const subcommand = (args[0] || '').toLowerCase();

  if (!subcommand || subcommand === 'list' || subcommand === 'status') {
    const embed = buildSettlementSummaryEmbed(player);
    return sendStyledEmbed(message, embed, 'settlement', { components: buildDashboardComponents() });
  }

  if (subcommand === 'info') {
    const settlementArg = args[1];
    if (!settlementArg) return message.reply('❌ Usage: `!hy settlement info <settlementId>`');
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const embed = buildSettlementDetailEmbed(player, settlement);
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
  }

  if (subcommand === 'stockpile') {
    const settlementArg = args[1];
    if (!settlementArg) return message.reply('❌ Usage: `!hy settlement stockpile <settlementId>`');
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const stockpileText = formatStockpile(settlement.stockpile) || 'No stored materials.';
    const embed = new EmbedBuilder()
      .setColor('#27AE60')
      .setTitle(`📦 ${settlement.name} Stockpile`)
      .setDescription(stockpileText)
      .setThumbnail(EMBED_VISUALS.settlementDetail)
      .setImage(EMBED_VISUALS.settlementSummary);
    if (settlement.production && Object.keys(settlement.production).length) {
      embed.addFields({ name: 'Hourly Production', value: formatProduction(settlement.production), inline: false });
    }
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
  }

  if (subcommand === 'decision' || subcommand === 'decide') {
    const settlementArg = args[1];
    const decisionId = args[2];
    const optionId = args[3];
    if (!settlementArg || !decisionId || !optionId) {
      return message.reply('❌ Usage: `!hy settlement decision <settlementId> <decisionId> <optionId>`');
    }
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const result = applySettlementDecisionChoice(player, settlement, decisionId.toLowerCase(), optionId.toLowerCase());
    if (result.error) return message.reply(`❌ ${result.error}`);
    const embed = buildSettlementDetailEmbed(player, settlement);
    if (result.message) embed.setDescription(result.message);
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
  }

  if (subcommand === 'expeditions') {
    const settlementArg = args[1];
    if (!settlementArg) return message.reply('❌ Usage: `!hy settlement expeditions <settlementId>`');
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const embed = buildSettlementExpeditionOptionsEmbed(player, settlement);
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementExpeditionComponents(settlement) });
  }

  if (subcommand === 'expedition') {
    const settlementArg = args[1];
    const typeArg = args[2];
    const villagersArg = args[3];
    if (!settlementArg || !typeArg) {
      return message.reply('❌ Usage: `!hy settlement expedition <settlementId> <expeditionId> [villagers]`');
    }
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const result = dispatchSettlementExpedition(player, settlement, typeArg.toLowerCase(), villagersArg);
    if (result.error) return message.reply(`❌ ${result.error}`);
    const embed = buildSettlementDetailEmbed(player, settlement);
    embed.setDescription(result.message);
    if (result.durationMs) {
      embed.addFields({ name: 'New Expedition', value: `${formatActionName(typeArg)} — ETA ${formatDuration(result.durationMs)}`, inline: false });
    }
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
  }

  if (subcommand === 'cancel') {
    const settlementArg = args[1];
    const expeditionArg = args[2];
    if (!settlementArg || !expeditionArg) {
      return message.reply('❌ Usage: `!hy settlement cancel <settlementId> <expeditionInstanceId>`');
    }
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const result = cancelSettlementExpedition(player, settlement, expeditionArg);
    if (result.error) return message.reply(`❌ ${result.error}`);
    const embed = buildSettlementDetailEmbed(player, settlement);
    embed.setDescription(result.message);
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
  }

  if (subcommand === 'expedite') {
    const settlementArg = args[1];
    const expeditionArg = args[2];
    if (!settlementArg || !expeditionArg) {
      return message.reply('❌ Usage: `!hy settlement expedite <settlementId> <expeditionInstanceId>`');
    }
    const settlement = findSettlement(player, settlementArg);
    if (!settlement) return message.reply('❌ Settlement not found.');
    const result = expediteSettlementExpedition(player, settlement, expeditionArg);
    if (result.error) return message.reply(`❌ ${result.error}`);
    const embed = buildSettlementDetailEmbed(player, settlement);
    embed.setDescription(result.message);
    return sendStyledEmbed(message, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
  }

  const embed = buildSettlementSummaryEmbed(player);
  embed.setDescription(
    `${embed.data.description || ''}\n\n` +
    `• Details: \`${PREFIX} settlement info <id>\`\n` +
    `• Choose Decision: \`${PREFIX} settlement decision <id> <decisionId> <optionId>\`\n` +
    `• Stockpile: \`${PREFIX} settlement stockpile <id>\`\n` +
    `• Expeditions: \`${PREFIX} settlement expeditions <id>\`\n` +
    `• Launch Expedition: \`${PREFIX} settlement expedition <id> <expeditionId> [villagers]\`\n` +
    `• Cancel Expedition: \`${PREFIX} settlement cancel <id> <expeditionInstanceId>\`\n` +
    `• Expedite Expedition: \`${PREFIX} settlement expedite <id> <expeditionInstanceId>\``
  );
  return sendStyledEmbed(message, embed, 'settlement', { components: buildDashboardComponents() });
}

function buildBaseSummaryEmbed(player, exploration) {
  const embed = new EmbedBuilder().setColor('#8E44AD').setTitle('🏕️ Your Bases');
  const bases = Object.values(player.bases || {});
  if (!bases.length) {
    embed.setDescription('You have no bases yet. Use `!hy base claim <biome>` to establish one.');
    embed.setThumbnail(EMBED_VISUALS.baseSummary);
    embed.setImage(EMBED_VISUALS.baseSummary);
    return embed;
  }
  const lines = bases.map(base => {
    const biomeName = formatBiomeName(base.biomeId);
    const rankDef = getBaseRankDefinition(base.rank);
    const storageUsed = getBaseStorageTotals(base);
    const capacity = base.capacity || calculateBaseCapacity(base);
    return `• **${biomeName}** — Rank ${base.rank} (${rankDef?.name || 'Unknown'})\n   Storage ${storageUsed}/${capacity} • Modules ${Object.keys(base.upgrades || {}).length}`;
  });
  embed.setDescription(lines.join('\n'));
  embed.setThumbnail(EMBED_VISUALS.baseSummary);
  embed.setImage(EMBED_VISUALS.baseDetail);
  if (exploration?.currentBiome) {
    embed.setFooter({ text: `Current biome: ${formatBiomeName(exploration.currentBiome)} | ${PREFIX} base info <biome>` });
  }
  return embed;
}
function buildBaseDetailEmbed(player, base) {
  const biomeName = formatBiomeName(base.biomeId);
  const embed = new EmbedBuilder().setColor('#9B59B6').setTitle(`🏕️ ${biomeName} Base`);
  const biomeArt = BIOME_ARTWORK[base.biomeId?.toLowerCase?.()] || EMBED_VISUALS.baseDetail;
  embed.setThumbnail(biomeArt).setImage(biomeArt);
  const rankDef = getBaseRankDefinition(base.rank);
  embed.addFields(
    { name: 'Rank', value: `${base.rank} — ${rankDef?.name || 'Unknown'}`, inline: true },
    { name: 'Incident Defense', value: `${Math.round((base.bonuses?.incidentDefense || 0) * 100)}%`, inline: true },
    { name: 'Extractor Rate', value: `${(base.bonuses?.extractorRate || 1).toFixed(2)}x`, inline: true }
  );

  const storageCapacity = base.capacity || calculateBaseCapacity(base);
  const storageTotals = getBaseStorageTotals(base);
  embed.addFields({
    name: `Storage (${storageTotals}/${storageCapacity})`,
    value: formatStorageLines(base.storage) || 'Empty',
    inline: false
  });

  const moduleLines = Object.entries(base.upgrades || {}).map(([moduleId, level]) => {
    const def = BASE_UPGRADE_DEFINITIONS[moduleId];
    const label = def?.name || moduleId;
    const levelData = def?.getLevel(level);
    const summary = levelData?.summary ? ` — ${levelData.summary}` : '';
    const bonuses = formatBonuses(levelData?.bonuses);
    return `• **${label}** (Lv ${level})${summary}${bonuses ? `\n   ${bonuses}` : ''}`;
  });
  embed.addFields({ name: 'Modules', value: moduleLines.join('\n') || 'None', inline: false });

  const bonusText = formatBonuses(base.bonuses);
  if (bonusText) {
    embed.addFields({ name: 'Bonuses', value: bonusText, inline: false });
  }
  return embed;
}
function buildBaseModuleListEmbed(player, base) {
  const embed = new EmbedBuilder()
    .setColor('#A569BD')
    .setTitle(`🔧 Modules — ${formatBiomeName(base.biomeId)} Base`)
    .setDescription('Upgrade modules to unlock automation, defenses, and logistics.')
    .setThumbnail(EMBED_VISUALS.modules)
    .setImage(EMBED_VISUALS.modules);

  const lines = Object.values(BASE_UPGRADE_DEFINITIONS).map(def => {
    const currentLevel = base.upgrades?.[def.id] ?? def.startLevel ?? 0;
    const currentData = def.getLevel(currentLevel);
    const nextLevel = currentLevel < def.maxLevel ? currentLevel + 1 : null;
    const nextData = nextLevel ? def.getLevel(nextLevel) : null;
    const summary = currentData?.summary ? ` — ${currentData.summary}` : '';
    const bonuses = currentData?.bonuses ? `\n   ${formatBonuses(currentData.bonuses)}` : '';
    const nextSummary = nextData
      ? `\n   ➡️ Lv ${nextLevel}: ${nextData.summary || ''} ${nextData.cost ? `(Cost: ${formatCost(nextData.cost)})` : ''}`
      : '\n   ✅ Max level reached';
    return `• **${def.name}** (Lv ${currentLevel}/${def.maxLevel})${summary}${bonuses}${nextSummary}`;
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `Upgrade with: ${PREFIX} base upgrade <biome> <moduleId>` });
  return embed;
}
function buildBaseModuleSelectRow(base) {
  const modules = Object.values(BASE_UPGRADE_DEFINITIONS);
  if (!modules.length) return null;
  const options = modules.slice(0, 25).map(def => {
    const currentLevel = base.upgrades?.[def.id] ?? def.startLevel ?? 0;
    const label = `${def.name || def.id} (Lv ${currentLevel}/${def.maxLevel})`.slice(0, 100);
    const nextLevel = currentLevel < def.maxLevel ? currentLevel + 1 : null;
    const description = nextLevel
      ? `Next: ${(def.getLevel(nextLevel)?.summary || 'Upgrade available.').slice(0, 60)}`
      : 'Max level reached.';
    return { label, value: def.id, description: description.slice(0, 100) };
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`base-upgrade|${base.biomeId}`)
    .setPlaceholder('Preview or upgrade a module')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}

function buildBaseModulePreview(base, moduleId) {
  const def = BASE_UPGRADE_DEFINITIONS[moduleId];
  if (!def) return { error: `Unknown module "${moduleId}".` };
  const currentLevel = base.upgrades?.[moduleId] ?? def.startLevel ?? 0;
  if (currentLevel >= def.maxLevel) return { error: 'Module is already at maximum level.' };
  const nextLevel = currentLevel + 1;
  const levelData = def.getLevel(nextLevel);
  if (!levelData) return { error: 'No data available for next level.' };
  if (levelData.requires?.baseRank && base.rank < levelData.requires.baseRank) {
    return { error: `Requires base rank ${levelData.requires.baseRank}.` };
  }
  if (levelData.requires?.modules) {
    for (const [requiredModuleId, requiredLevel] of Object.entries(levelData.requires.modules)) {
      const ownedLevel = base.upgrades?.[requiredModuleId] || 0;
      if (ownedLevel < requiredLevel) {
        return { error: `Requires ${requiredModuleId} level ${requiredLevel}.` };
      }
    }
  }
  if (levelData.cost && !canAffordCost(player, levelData.cost, { baseStorage: base.storage })) {
    return { error: `Insufficient resources. Cost: ${formatCost(levelData.cost)}.` };
  }
  if (levelData.cost) deductCost(player, levelData.cost, { baseStorage: base.storage });
  base.upgrades[moduleId] = nextLevel;
  recalcBaseBonuses(base);
  recalcPlayerBaseBonuses(player);
  const label = def.name || moduleId;
  return { message: `🔧 Upgraded **${label}** to level ${nextLevel}.` };
}

function rankUpBase(player, base) {
  const nextRank = getNextBaseRankDefinition(base.rank);
  if (!nextRank) return { error: 'Maximum rank reached.' };
  if (nextRank.requires?.baseRank && base.rank < nextRank.requires.baseRank) {
    return { error: `Requires base rank ${nextRank.requires.baseRank}.` };
  }
  if (nextRank.requires?.modules) {
    for (const [moduleId, requiredLevel] of Object.entries(nextRank.requires.modules)) {
      const ownedLevel = base.upgrades?.[moduleId] || 0;
      if (ownedLevel < requiredLevel) {
        return { error: `Upgrade ${moduleId} to level ${requiredLevel} first.` };
      }
    }
  }
  if (nextRank.cost && !canAffordCost(player, nextRank.cost, { baseStorage: base.storage })) {
    return { error: `Insufficient resources. Cost: ${formatCost(nextRank.cost)}.` };
  }
  if (nextRank.cost) deductCost(player, nextRank.cost, { baseStorage: base.storage });
  base.rank = nextRank.level;
  player.stats.baseRankUps = (player.stats.baseRankUps || 0) + 1;
  recalcBaseBonuses(base);
  recalcPlayerBaseBonuses(player);
  return { message: `⭐ Base rank increased to **${nextRank.name}**!` };
}
function upgradeBaseModule(player, base, moduleId) {
  const def = BASE_UPGRADE_DEFINITIONS[moduleId];
  if (!def) return { error: `Unknown module "${moduleId}".` };
  const currentLevel = base.upgrades?.[moduleId] ?? def.startLevel ?? 0;
  if (currentLevel >= def.maxLevel) return { error: 'Module is already at maximum level.' };
  const nextLevel = currentLevel + 1;
  const levelData = def.getLevel(nextLevel);
  if (!levelData) return { error: 'No data available for next level.' };
  if (levelData.requires?.baseRank && base.rank < levelData.requires.baseRank) {
    return { error: `Requires base rank ${levelData.requires.baseRank}.` };
  }
  if (levelData.requires?.modules) {
    for (const [requiredModuleId, requiredLevel] of Object.entries(levelData.requires.modules)) {
      const ownedLevel = base.upgrades?.[requiredModuleId] || 0;
      if (ownedLevel < requiredLevel) {
        return { error: `Requires ${requiredModuleId} level ${requiredLevel}.` };
      }
    }
  }
  if (levelData.cost && !canAffordCost(player, levelData.cost, { baseStorage: base.storage })) {
    return { error: `Insufficient resources. Cost: ${formatCost(levelData.cost)}.` };
  }
  if (levelData.cost) deductCost(player, levelData.cost, { baseStorage: base.storage });
  base.upgrades[moduleId] = nextLevel;
  recalcBaseBonuses(base);
  recalcPlayerBaseBonuses(player);
  const label = def.name || moduleId;
  return { message: `🔧 Upgraded **${label}** to level ${nextLevel}.` };
}
function buildSettlementSummaryEmbed(player) {
  const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('🏘️ Your Settlements');
  const settlements = Object.values(player.settlements || {});
  if (!settlements.length) {
    embed.setDescription('No settlements discovered yet. Explore to find faction outposts!');
    embed.setThumbnail(EMBED_VISUALS.settlementSummary);
    embed.setImage(EMBED_VISUALS.settlementSummary);
    return embed;
  }
  const lines = settlements.map(settlement => {
    const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
    return `• **${settlement.name}** (${template?.faction || 'Unknown'}) — Pop ${settlement.population}, Happiness ${Math.round(settlement.happiness)}, Prestige ${settlement.prestige || 0}`;
  });
  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `Details: ${PREFIX} settlement info <id>` });
  embed.setThumbnail(EMBED_VISUALS.settlementSummary);
  embed.setImage(EMBED_VISUALS.settlementDetail);
  return embed;
}
function buildSettlementDetailEmbed(player, settlement) {
  const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
  const embed = new EmbedBuilder()
    .setColor('#27AE60')
    .setTitle(`🏘️ ${settlement.name}`)
    .setDescription(template?.description || 'No description available.');
  const factionArt = template?.faction ? FACTION_ARTWORK[template.faction?.toLowerCase?.()] : null;
  const visual = factionArt || EMBED_VISUALS.settlementDetail;
  embed.setThumbnail(visual).setImage(visual);

  embed.addFields(
    { name: 'Faction', value: template?.faction || 'Unknown', inline: true },
    { name: 'Population', value: `${settlement.population}/${template?.population?.max || '?'}`, inline: true },
    { name: 'Happiness', value: `${Math.round(settlement.happiness)}`, inline: true },
    { name: 'Wealth', value: `${settlement.wealth}`, inline: true },
    { name: 'Garrison', value: `${settlement.garrison}`, inline: true },
    { name: 'Prestige', value: `${settlement.prestige || 0}`, inline: true }
  );

  if (template?.traits?.length) {
    embed.addFields({ name: 'Traits', value: template.traits.map(trait => `• ${trait}`).join('\n'), inline: false });
  }
  if (settlement.production && Object.keys(settlement.production).length) {
    embed.addFields({ name: 'Production', value: formatProduction(settlement.production), inline: false });
  }
  if (settlement.stockpile && Object.keys(settlement.stockpile).length) {
    embed.addFields({ name: 'Stockpile', value: formatStockpile(settlement.stockpile), inline: false });
  }
  if (settlement.bonuses && Object.keys(settlement.bonuses).length) {
    embed.addFields({ name: 'Bonuses', value: formatBonuses(settlement.bonuses), inline: false });
  }
  const decisions = formatSettlementDecisions(settlement);
  if (decisions) embed.addFields({ name: 'Pending Decisions', value: decisions, inline: false });
  const expeditions = formatSettlementExpeditions(settlement);
  if (expeditions) embed.addFields({ name: 'Expeditions', value: expeditions, inline: false });
  return embed;
}

function buildSettlementExpeditionOptionsEmbed(player, settlement) {
  const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(`🚚 Expeditions — ${settlement.name}`)
    .setThumbnail(EMBED_VISUALS.expeditions)
    .setImage(EMBED_VISUALS.expeditions);

  const profiles = template?.expeditionProfiles;
  if (!profiles || !profiles.length) {
    embed.setDescription('No expedition profiles available for this settlement.');
    return embed;
  }

  const lines = profiles.map(profile => {
    const definition = SETTLEMENT_EXPEDITIONS[profile.id];
    const name = profile.name || definition?.name || profile.id;
    const durationText = profile.durationRangeMinutes
      ? `${formatMinutes(profile.durationRangeMinutes[0])} - ${formatMinutes(profile.durationRangeMinutes[1])}`
      : definition?.baseMinutes
        ? formatMinutes(definition.baseMinutes)
        : 'Varies';
    const recommended = profile.recommendedVillagers?.length
      ? `Recommended: ${profile.recommendedVillagers.join(', ')}`
      : '';
    return `• **${profile.id}** — ${name}\n   Duration: ${durationText}${recommended ? `\n   ${recommended}` : ''}`;
  });

  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `Launch with: ${PREFIX} settlement expedition ${settlement.id} <expeditionId> [villagers]` });
  return embed;
}

function buildGatheringGearSummary(player) {
  const { totals, gear } = getGatheringBonuses(player);
  const lines = [];
  GATHERING_SET_TYPES.forEach(type => {
    const tierId = gear.current?.[type];
    const tier = getGatheringTierDefinition(type, tierId);
    const speed = ((totals.global.speed || 0) + (totals[type]?.speed || 0)) * 100;
    const quantity = ((totals.global.quantity || 0) + (totals[type]?.quantity || 0)) * 100;
    const rarity = ((totals.global.rarity || 0) + (totals[type]?.rarity || 0)) * 100;
    const extra = (totals.global.extraRolls || 0) + (totals[type]?.extraRolls || 0);
    lines.push(`${GATHERING_TYPE_LABELS[type]}: ${tier?.name || 'Standard Kit'} — Speed +${speed.toFixed(0)}%, Yield +${quantity.toFixed(0)}%, Rare +${rarity.toFixed(0)}%, Extra Rolls +${extra.toFixed(2)}`);
  });
  return lines.join('\n');
}

function buildGatheringGearEmbed(player) {
  const { gear } = getGatheringBonuses(player);
  const embed = new EmbedBuilder()
    .setColor('#27AE60')
    .setTitle('🛠️ Gathering Gear')
    .setDescription('Manage your harvesting outfits to improve speed, yield, and rare find chances.')
    .setThumbnail(EMBED_VISUALS.exploration)
    .setImage(EMBED_VISUALS.dashboard);

  GATHERING_SET_TYPES.forEach(type => {
    const definition = GATHERING_SET_LOOKUP.get(type);
    if (!definition) return;
    const currentId = gear.current?.[type];
    const currentTier = getGatheringTierDefinition(type, currentId);
    const nextTier = getNextGatheringTier(type, currentId);
    const lines = [];
    if (currentTier) {
      lines.push(`Current: **${currentTier.name}** — Speed +${(currentTier.bonuses.speed * 100).toFixed(0)}%, Yield +${(currentTier.bonuses.quantity * 100).toFixed(0)}%, Rare +${(currentTier.bonuses.rarity * 100).toFixed(0)}%`);
      if (currentTier.perks?.length) {
        currentTier.perks.slice(0, 3).forEach(perk => lines.push(`• ${perk}`));
      }
    } else {
      lines.push('Current: Standard Kit');
    }
    if (nextTier) {
      lines.push('');
      lines.push(`Next: **${nextTier.name}** — Speed +${(nextTier.bonuses.speed * 100).toFixed(0)}%, Yield +${(nextTier.bonuses.quantity * 100).toFixed(0)}%, Rare +${(nextTier.bonuses.rarity * 100).toFixed(0)}%`);
      lines.push(`Cost: ${formatGatheringRequirements(nextTier)}`);
    } else {
      lines.push('');
      lines.push('Next: Max tier reached.');
    }
    embed.addFields({
      name: `${GATHERING_TYPE_LABELS[type]} Gear`,
      value: lines.join('\n'),
      inline: false
    });
  });

  embed.setFooter({ text: `Use ${PREFIX} gather gear upgrade <type> to enhance your equipment.` });
  return embed;
}

function summarizeBiomeGatheringResources(biome, limitPerType = 3) {
  if (!biome) return 'Unknown biome.';
  const lines = [];
  GATHERING_SET_TYPES.forEach(type => {
    const pool = buildGatheringResourcePool(biome, type, { biomeId: biome.id }).slice(0, limitPerType);
    if (!pool.length) return;
    const resources = pool.map(entry => `${formatItemName(entry.item)} (${entry.rarity})`).join(', ');
    lines.push(`${GATHERING_TYPE_LABELS[type]}: ${resources}`);
  });
  return lines.length ? lines.join('\n') : 'No dedicated harvesting nodes discovered here yet.';
}

function buildGatheringActionComponents(userId, exploration) {
  const rows = [];
  const disabled = ACTIVE_GATHER_SESSIONS.has(userId) || Boolean(exploration?.action);
  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gather|mining').setLabel('Mine').setStyle(ButtonStyle.Primary).setEmoji('⛏️').setDisabled(disabled),
    new ButtonBuilder().setCustomId('gather|foraging').setLabel('Forage').setStyle(ButtonStyle.Secondary).setEmoji('🌿').setDisabled(disabled),
    new ButtonBuilder().setCustomId('gather|farming').setLabel('Farm').setStyle(ButtonStyle.Secondary).setEmoji('🌾').setDisabled(disabled),
    new ButtonBuilder().setCustomId('gather|fishing').setLabel('Fish').setStyle(ButtonStyle.Success).setEmoji('🎣').setDisabled(disabled)
  );
  rows.push(primaryRow);
  const utilityRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('command|gather').setLabel('Status').setStyle(ButtonStyle.Secondary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('command|gather|gear').setLabel('Gear & Upgrades').setStyle(ButtonStyle.Success).setEmoji('🛠️'),
    new ButtonBuilder().setCustomId('command|gather|notifications').setLabel('Toggle Notifications').setStyle(ButtonStyle.Primary).setEmoji('🔔')
  );
  rows.push(utilityRow);
  return rows;
}

function buildDashboardComponents() {
  const rows = [];
  const navigationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard|explore').setLabel('Exploration').setStyle(ButtonStyle.Primary).setEmoji('🧭'),
    new ButtonBuilder().setCustomId('dashboard|travel').setLabel('Travel').setStyle(ButtonStyle.Secondary).setEmoji('🛣️'),
    new ButtonBuilder().setCustomId('dashboard|base').setLabel('Bases').setStyle(ButtonStyle.Success).setEmoji('🏕️'),
    new ButtonBuilder().setCustomId('dashboard|settlement').setLabel('Settlements').setStyle(ButtonStyle.Success).setEmoji('🏘️')
  );
  rows.push(navigationRow);

  const linkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Official Site').setStyle(ButtonStyle.Link).setURL('https://hytale.com').setEmoji('🌐'),
    new ButtonBuilder().setLabel('Media Gallery').setStyle(ButtonStyle.Link).setURL('https://hypixelstudios.com/hytale/media').setEmoji('🖼️')
  );
  rows.push(linkRow);

  return rows;
}

function buildBaseDetailComponents(base) {
  const rows = [];
  const selectRow = buildBaseModuleSelectRow(base);
  if (selectRow) rows.push(selectRow);
  const nextRank = getNextBaseRankDefinition(base.rank);
  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`base|modules|${base.biomeId}`).setLabel('Modules').setStyle(ButtonStyle.Secondary).setEmoji('🧰'),
    new ButtonBuilder().setCustomId(`base|rankup|${base.biomeId}`).setLabel('Rank Up').setStyle(ButtonStyle.Primary).setEmoji('⭐').setDisabled(!nextRank),
    new ButtonBuilder().setCustomId('dashboard|base').setLabel('All Bases').setStyle(ButtonStyle.Success).setEmoji('📜')
  );
  rows.push(primaryRow);

  const travelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard|explore').setLabel('Exploration Status').setStyle(ButtonStyle.Secondary).setEmoji('🧭'),
    new ButtonBuilder().setCustomId('dashboard|travel').setLabel('Travel Planner').setStyle(ButtonStyle.Secondary).setEmoji('🛣️')
  );
  rows.push(travelRow);

  return rows;
}

function buildBaseModulesComponents(base) {
  const rows = [];
  const selectRow = buildBaseModuleSelectRow(base);
  if (selectRow) rows.push(selectRow);
  const nextRank = getNextBaseRankDefinition(base.rank);
  const moduleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`base|rankup|${base.biomeId}`).setLabel('Rank Up').setStyle(ButtonStyle.Primary).setEmoji('⭐').setDisabled(!nextRank),
    new ButtonBuilder().setCustomId(`base|info|${base.biomeId}`).setLabel('Back to Base Info').setStyle(ButtonStyle.Secondary).setEmoji('🏕️'),
    new ButtonBuilder().setCustomId('dashboard|base').setLabel('All Bases').setStyle(ButtonStyle.Success).setEmoji('📜')
  );
  rows.push(moduleRow);
  return rows;
}

function buildSettlementDetailComponents(settlement) {
  const decisionCount = Array.isArray(settlement.decisions) ? settlement.decisions.length : 0;
  const rows = [];
  const selectRow = buildSettlementExpeditionSelectRow(settlement);
  if (selectRow) rows.push(selectRow);
  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`settlement|stockpile|${settlement.id}`).setLabel('Stockpile').setStyle(ButtonStyle.Secondary).setEmoji('📦'),
    new ButtonBuilder().setCustomId(`settlement|decisions|${settlement.id}`).setLabel('Decisions').setStyle(ButtonStyle.Primary).setEmoji('⚖️').setDisabled(decisionCount === 0),
    new ButtonBuilder().setCustomId(`settlement|expeditions|${settlement.id}`).setLabel('Expeditions').setStyle(ButtonStyle.Success).setEmoji('🚚')
  );
  rows.push(primaryRow);

  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dashboard|settlement').setLabel('All Settlements').setStyle(ButtonStyle.Success).setEmoji('🏘️'),
    new ButtonBuilder().setCustomId('dashboard|explore').setLabel('Exploration Status').setStyle(ButtonStyle.Secondary).setEmoji('🧭')
  );
  rows.push(navRow);

  return rows;
}

function buildSettlementExpeditionComponents(settlement) {
  const rows = [];
  const selectRow = buildSettlementExpeditionSelectRow(settlement);
  if (selectRow) rows.push(selectRow);
  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`settlement|info|${settlement.id}`).setLabel('Back to Settlement').setStyle(ButtonStyle.Secondary).setEmoji('🏘️'),
    new ButtonBuilder().setCustomId('dashboard|settlement').setLabel('All Settlements').setStyle(ButtonStyle.Success).setEmoji('📜')
  );
  rows.push(primaryRow);
  return rows;
}
function buildSettlementExpeditionSelectRow(settlement) {
  const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
  const profiles = template?.expeditionProfiles;
  if (!profiles || !profiles.length) return null;
  const options = profiles.slice(0, 25).map(profile => {
    const baseDuration = profile.durationRangeMinutes
      ? profile.durationRangeMinutes[0]
      : SETTLEMENT_EXPEDITIONS[profile.id]?.baseMinutes || 120;
    return {
      label: (profile.name || profile.id).slice(0, 100),
      value: profile.id,
      description: `Duration ~${formatMinutes(baseDuration)}`.slice(0, 100)
    };
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`settlement-expedition|${settlement.id}`)
    .setPlaceholder('Preview or launch expeditions')
    .addOptions(options);
  return new ActionRowBuilder().addComponents(menu);
}
function buildSettlementExpeditionPreview(settlement, profileId) {
  const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
  const profile = template?.expeditionProfiles?.find(entry => entry.id === profileId);
  if (!profile) return { error: `Expedition "${profileId}" not available for this settlement.` };
  const definition = SETTLEMENT_EXPEDITIONS[profile.id];

  const embed = new EmbedBuilder()
    .setColor('#1ABC9C')
    .setTitle(`🚚 ${profile.name || profile.id} — ${settlement.name}`)
    .setThumbnail(EMBED_VISUALS.expeditions)
    .setImage(EMBED_VISUALS.expeditions);

  if (profile.description) {
    embed.setDescription(profile.description);
  }

  if (Array.isArray(profile.durationRangeMinutes) && profile.durationRangeMinutes.length) {
    const minMinutes = profile.durationRangeMinutes[0];
    const maxMinutes = profile.durationRangeMinutes[1] ?? minMinutes;
    const durationLabel = minMinutes === maxMinutes
      ? formatMinutes(minMinutes)
      : `${formatMinutes(minMinutes)} - ${formatMinutes(maxMinutes)}`;
    embed.addFields({ name: 'Duration', value: durationLabel, inline: true });
  } else if (definition?.baseMinutes) {
    embed.addFields({ name: 'Duration', value: formatMinutes(definition.baseMinutes), inline: true });
  }

  const recommended = profile.recommendedVillagers?.length
    ? profile.recommendedVillagers.join(', ')
    : definition?.recommendedRoles?.join(', ');
  if (recommended) {
    embed.addFields({ name: 'Recommended Villagers', value: recommended, inline: true });
  }

  if (profile.rewardPreview) {
    const rewards = [];
    if (profile.rewardPreview.coins) {
      rewards.push(`Coins: ${profile.rewardPreview.coins[0]} - ${profile.rewardPreview.coins[1]}`);
    }
    if (Array.isArray(profile.rewardPreview.items)) {
      rewards.push(
        profile.rewardPreview.items
          .map(item => `${item.item} x${item.min || item.quantity || 1}-${item.max || item.quantity || item.min || 1}`)
          .join(', ')
      );
    }
    embed.addFields({ name: 'Reward Preview', value: rewards.join('\n') || 'See expedition logs for details.', inline: false });
  }

  if (profile.rareOutcome) {
    const rareLines = [];
    if (profile.rareOutcome.chance) rareLines.push(`Chance: ${(profile.rareOutcome.chance * 100).toFixed(1)}%`);
    if (profile.rareOutcome.rewards?.prestige) rareLines.push(`Prestige: +${profile.rareOutcome.rewards.prestige}`);
    if (Array.isArray(profile.rareOutcome.rewards?.items)) {
      rareLines.push(
        profile.rareOutcome.rewards.items
          .map(item => `${item.item} x${item.quantity || 1}`)
          .join(', ')
      );
    }
    embed.addFields({ name: 'Rare Outcome', value: rareLines.join(' | '), inline: false });
  }

  const villagersAvailable = Math.floor(settlement.population || 0);
  const launchRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`settlement|launch|${settlement.id}|${profile.id}`)
      .setLabel('Launch Expedition')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀')
      .setDisabled(villagersAvailable <= 0),
    new ButtonBuilder()
      .setCustomId(`settlement|expeditions|${settlement.id}`)
      .setLabel('Back to Expeditions')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚚'),
    new ButtonBuilder()
      .setCustomId('dashboard|settlement')
      .setLabel('Settlement Dashboard')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🏘️')
  );

  if (villagersAvailable <= 0) {
    embed.addFields({ name: 'Warning', value: 'No available villagers to send on an expedition right now.', inline: false });
  }

  return { embed, components: [launchRow] };
}


function findSettlement(player, input) {
  if (!input) return null;
  const settlements = Object.values(player.settlements || {});
  if (!settlements.length) return null;
  const lowerInput = input.toLowerCase();
  return (
    settlements.find(settlement => settlement.id.toLowerCase() === lowerInput) ||
    settlements.find(settlement => settlement.name.toLowerCase() === lowerInput) ||
    settlements.find(settlement => settlement.id.toLowerCase().includes(lowerInput))
  );
}
function applySettlementDecisionChoice(player, settlement, decisionId, optionId) {
  const decisionIndex = settlement.decisions?.findIndex(entry => entry.id?.toLowerCase() === decisionId) ?? -1;
  if (decisionIndex === -1) return { error: 'No pending decision with that ID.' };
  const decision = settlement.decisions[decisionIndex];
  const definition = SETTLEMENT_DECISIONS[decision.id?.toLowerCase()] || SETTLEMENT_DECISIONS[decision.id];
  if (!definition) return { error: 'Decision definition missing.' };
  const option = definition.options?.find(opt => opt.id?.toLowerCase() === optionId);
  if (!option) return { error: 'Option not available for this decision.' };
  if (option.cost && !canAffordCost(player, option.cost)) {
    return { error: `Not enough resources. Cost: ${formatCost(option.cost)}.` };
  }
  if (option.cost) deductCost(player, option.cost);
  applySettlementEffects(player, settlement, option.effect || {});
  settlement.decisions.splice(decisionIndex, 1);
  settlement.nextDecisionAt = Date.now() + 2 * 60 * 60 * 1000;
  return { message: `✅ Chosen **${option.label || option.id}** for ${settlement.name}.` };
}

function formatProduction(production) {
  return Object.entries(production || {})
    .map(([item, rate]) => `• ${item}: ${rate}/hr`)
    .join('\n');
}

function formatStockpile(stockpile = {}) {
  const entries = Object.entries(stockpile).filter(([, qty]) => qty);
  if (!entries.length) return '';
  return entries.map(([item, qty]) => `• ${item} x${qty}`).join('\n');
}

function formatStorageLines(storage = {}) {
  const entries = Object.entries(storage).filter(([, qty]) => qty);
  if (!entries.length) return '';
  return entries.map(([item, qty]) => `• ${item} x${qty}`).join('\n');
}

function formatBonuses(bonuses = {}) {
  const entries = Object.entries(bonuses)
    .filter(([, value]) => Number(value))
    .map(([key, value]) => {
      if (typeof value === 'number' && Math.abs(value) <= 1 && !Number.isInteger(value)) {
        return `${key}: ${(value * 100).toFixed(1)}%`;
      }
      return `${key}: ${value}`;
    });
  return entries.length ? entries.join(', ') : '';
}

function formatCost(cost) {
  if (!cost) return 'Free';
  const parts = [];
  if (cost.coins) parts.push(`${cost.coins} coins`);
  if (cost.materials) {
    Object.entries(cost.materials).forEach(([item, qty]) => {
      parts.push(`${item} x${qty}`);
    });
  }
  return parts.join(', ') || 'Free';
}

function formatSettlementDecisions(settlement) {
  if (!Array.isArray(settlement.decisions) || settlement.decisions.length === 0) return '';
  return settlement.decisions
    .map(decision => {
      const definition = SETTLEMENT_DECISIONS[decision.id?.toLowerCase()] || SETTLEMENT_DECISIONS[decision.id];
      const name = definition?.name || decision.id;
      const options = definition?.options
        ?.map(option => `   • ${option.id}: ${option.label || option.id}${option.cost ? ` (Cost: ${formatCost(option.cost)})` : ''}`)
        .join('\n');
      return `• **${name}**\n${options || '   (No options defined)'}`;
    })
    .join('\n');
}

function formatSettlementExpeditions(settlement) {
  if (!Array.isArray(settlement.expeditions) || settlement.expeditions.length === 0) return '';
  return settlement.expeditions
    .map(expedition => {
      const definition = SETTLEMENT_EXPEDITIONS[expedition.type];
      const name = definition?.name || expedition.type;
      if (expedition.status === 'completed') {
        if (expedition.success) {
          const rewards = formatExpeditionRewards(expedition.rewards);
          return `• [${expedition.id}] **${name}** — ✅ Success${rewards ? ` | ${rewards}` : ''}`;
        }
        return `• [${expedition.id}] **${name}** — ❌ Failed`;
      }
      const remaining = expedition.endsAt ? formatDuration(expedition.endsAt - Date.now()) : '—';
      const assigned = expedition.villagers ? `, ${expedition.villagers} villagers` : '';
      return `• [${expedition.id}] **${name}** — ${expedition.status || 'active'} (${remaining} remaining${assigned})`;
    })
    .join('\n');
}

function formatExpeditionRewards(rewards) {
  if (!rewards) return '';
  const parts = [];
  if (rewards.coins) parts.push(`${rewards.coins} coins`);
  if (rewards.xp) parts.push(`${rewards.xp} XP`);
  if (rewards.reputation) {
    parts.push(
      Object.entries(rewards.reputation)
        .map(([factionId, amount]) => `${factionId}: +${amount}`)
        .join(', ')
    );
  }
  if (Array.isArray(rewards.items)) {
    parts.push(rewards.items.map(entry => `${entry.item} x${entry.quantity || 1}`).join(', '));
  }
  return parts.join(' | ');
}
function dispatchSettlementExpedition(player, settlement, expeditionId, villagersArg) {
  const definition = SETTLEMENT_EXPEDITIONS[expeditionId];
  if (!definition) return { error: `Unknown expedition "${expeditionId}".` };
  const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
  const profile = template?.expeditionProfiles?.find(profile => profile.id?.toLowerCase() === expeditionId);
  const requiredBuilding = definition.supportBuilding;
  if (requiredBuilding && !(settlement.buildings?.[requiredBuilding] > 0)) {
    return { error: `Requires ${requiredBuilding.replace(/_/g, ' ')} building.` };
  }
  const availablePopulation = Math.floor(settlement.population || 0);
  if (availablePopulation <= 0) {
    return { error: 'No available villagers to send on an expedition.' };
  }
  let villagerCount = villagersArg != null ? Number(villagersArg) : NaN;
  if (!Number.isFinite(villagerCount) || villagerCount <= 0) {
    villagerCount = Math.min(3, availablePopulation);
  }
  villagerCount = Math.min(availablePopulation, Math.max(1, Math.floor(villagerCount)));
  if (villagerCount > availablePopulation) {
    return { error: 'Not enough villagers available.' };
  }

  const durationMinutes = resolveExpeditionDuration(definition, profile, settlement);
  const durationMs = Math.max(60_000, durationMinutes * 60_000);

  settlement.population = Math.max(0, settlement.population - villagerCount);
  settlement.expeditions = settlement.expeditions || [];
  const expedition = {
    id: `${expeditionId}_${Math.floor(Date.now() / 1000)}`,
    type: expeditionId,
    villagers: villagerCount,
    status: 'active',
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    success: null,
    rewards: null
  };
  settlement.expeditions.push(expedition);
  return {
    message: `🚚 Launched **${definition.name || expeditionId}** with ${villagerCount} villagers. ETA ${formatDuration(durationMs)}.`,
    expedition,
    durationMs
  };
}
function resolveExpeditionDuration(definition, profile, settlement) {
  let baseMinutes = 120;
  const range = profile?.durationRangeMinutes || definition?.durationRangeMinutes;
  if (Array.isArray(range) && range.length >= 2) {
    baseMinutes = randomBetween(Number(range[0]) || 60, Number(range[1]) || 240);
  } else if (definition?.baseMinutes) {
    baseMinutes = Number(definition.baseMinutes);
  }
  const bonus = settlement.bonuses?.expeditionSpeed || 0;
  const modifier = Math.max(0.3, 1 - bonus);
  return baseMinutes * modifier;
}
function findSettlementExpedition(settlement, expeditionArg) {
  if (!Array.isArray(settlement?.expeditions)) return null;
  const lower = expeditionArg.toLowerCase();
  return settlement.expeditions.find(expedition =>
    expedition.id?.toLowerCase() === lower ||
    expedition.id?.toLowerCase().includes(lower)
  );
}

function cancelSettlementExpedition(player, settlement, expeditionArg) {
  const expedition = findSettlementExpedition(settlement, expeditionArg);
  if (!expedition) return { error: 'Expedition not found.' };
  if (expedition.status !== 'active') return { error: 'Only active expeditions can be cancelled.' };
  settlement.population = Math.min(
    (SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()]?.population?.max || settlement.population + expedition.villagers),
    settlement.population + expedition.villagers
  );
  settlement.expeditions = settlement.expeditions.filter(entry => entry !== expedition);
  return { message: `🛑 Cancelled expedition **${expedition.type}**. Villagers returned safely.` };
}
function expediteSettlementExpedition(player, settlement, expeditionArg) {
  const expedition = findSettlementExpedition(settlement, expeditionArg);
  if (!expedition) return { error: 'Expedition not found.' };
  if (expedition.status !== 'active') return { error: 'Only active expeditions can be expedited.' };
  if (!Number.isFinite(expedition.endsAt)) return { error: 'Expedition timing unknown.' };
  const remainingMs = expedition.endsAt - Date.now();
  if (remainingMs <= 0) return { error: 'Expedition is already finishing.' };
  const cost = calculateExpeditionExpediteCost(remainingMs, expedition.villagers || 1);
  if (player.coins < cost) return { error: `Need ${cost} coins to expedite.` };
  player.coins -= cost;
  expedition.endsAt = Date.now();
  processSettlementTick(player, settlement, Date.now());
  return { message: `⚡ Expedition **${expedition.type}** expedited for ${cost} coins.` };
}

function calculateExpeditionExpediteCost(remainingMs, villagers) {
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return Math.max(50, remainingMinutes * 8 * Math.max(1, villagers));
}
async function registerSlashCommands(client) {
  if (!client?.application?.commands) return;
  try {
    await client.application.commands.set(SLASH_COMMAND_DEFINITIONS);
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register slash commands:', error);
  }
}
function normalizeInteractionResponse(payload, defaults = {}) {
  let normalized = {};
  if (typeof payload === 'string') {
    normalized = { content: payload };
  } else if (payload && typeof payload === 'object') {
    normalized = { ...payload };
  }
  const merged = { ...defaults, ...normalized };
  if (Object.prototype.hasOwnProperty.call(merged, 'ephemeral')) {
    const isEphemeral = Boolean(merged.ephemeral);
    if (isEphemeral) {
      merged.flags = (merged.flags || 0) | MessageFlags.Ephemeral;
    }
    delete merged.ephemeral;
  }
  return merged;
}

function createMessageAdapterFromInteraction(interaction, overrides = {}) {
  const { mentionUser = null, channel = null, ephemeral = false } = overrides;
  const defaultFlags = ephemeral ? MessageFlags.Ephemeral : undefined;
  return {
    author: interaction.user,
    guild: interaction.guild,
    channel: channel || interaction.channel,
    member: interaction.member,
    reply: payload => {
      const response = normalizeInteractionResponse(payload, defaultFlags !== undefined ? { flags: defaultFlags } : {});
      if (interaction.deferred || interaction.replied) return interaction.followUp(response);
      return interaction.reply(response);
    },
    mentions: {
      users: {
        first: () => mentionUser
      }
    }
  };
}
function handleSlashAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const player = getPlayer(interaction.user.id);
  const exploration = ensureExplorationState(player);
  const lowerFocused = (focused.value || '').toLowerCase();

  const respond = choices => interaction.respond(choices.slice(0, 25));

  const biomeChoices = () =>
    EXPLORATION_BIOMES
      .map(biome => ({ name: biome.name || biome.id, value: biome.id }))
      .filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused));

  const settlementChoices = () =>
    Object.values(player.settlements || {})
      .map(settlement => ({ name: settlement.name, value: settlement.id }))
      .filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused));

  const moduleChoices = () =>
    Object.entries(BASE_UPGRADE_DEFINITIONS)
      .map(([id, def]) => ({ name: def.name || id, value: id }))
      .filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused));

  const expeditionTemplateChoices = settlement => {
    const template = SETTLEMENT_TEMPLATE_LOOKUP[settlement.templateId?.toLowerCase()];
    if (!template?.expeditionProfiles) return [];
    return template.expeditionProfiles
      .map(profile => ({ name: `${profile.name || profile.id} (${profile.id})`, value: profile.id }))
      .filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused));
  };

  const activeExpeditionChoices = settlement => {
    if (!Array.isArray(settlement.expeditions)) return [];
    return settlement.expeditions
      .filter(expedition => expedition.status === 'active')
      .map(expedition => ({ name: `[${expedition.id}] ${expedition.type}`, value: expedition.id }))
      .filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused));
  };

  try {
    switch (interaction.commandName) {
      case 'explore': {
        const sub = interaction.options.getSubcommand();
        if (sub === 'activity' && focused.name === 'activity_id') {
          const biome = getBiomeDefinition(exploration.currentBiome);
          const activities = biome?.activities || [];
          const options = activities.map(activity => ({
            name: `${activity.name || activity.id} (${activity.id})`,
            value: activity.id
          }));
          return respond(options.filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused)));
        }
        if (sub === 'chain' && focused.name === 'chain_id') {
          const options = Array.from(EXPLORATION_ACTION_CHAINS.keys()).map(chainId => ({ name: chainId, value: chainId }));
          return respond(options.filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused)));
        }
        if (sub === 'action' && focused.name === 'action_id') {
          const actions = getAvailableActionTypes(getBiomeDefinition(exploration.currentBiome));
          const options = actions.map(action => ({ name: action, value: action }));
          return respond(options.filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused)));
        }
        break;
      }
      case 'travel': {
        const sub = interaction.options.getSubcommand();
        if (sub === 'start' && focused.name === 'biome') {
          return respond(biomeChoices());
        }
        break;
      }
      case 'base': {
        const sub = interaction.options.getSubcommand();
        if (['info', 'modules', 'claim', 'rankup', 'upgrade'].includes(sub) && focused.name === 'biome') {
          return respond(biomeChoices());
        }
        if (sub === 'upgrade' && focused.name === 'module') {
          return respond(moduleChoices());
        }
        break;
      }
      case 'settlement': {
        const sub = interaction.options.getSubcommand();
        if (['info', 'stockpile', 'expeditions', 'expedition', 'cancel', 'expedite', 'decisions'].includes(sub) && focused.name === 'settlement') {
          return respond(settlementChoices());
        }
        if (sub === 'decisions' && focused.name === 'decision') {
          const settlementId = interaction.options.getString('settlement');
          const settlement = findSettlement(player, settlementId);
          if (!settlement) return respond([]);
          const options = (settlement.decisions || []).map(entry => ({ name: entry.id, value: entry.id }));
          return respond(options.filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused)));
        }
        if (sub === 'decisions' && focused.name === 'option') {
          const settlementId = interaction.options.getString('settlement');
          const decisionId = interaction.options.getString('decision');
          const settlement = findSettlement(player, settlementId);
          if (!settlement) return respond([]);
          const decision = settlement.decisions?.find(entry => entry.id === decisionId);
          const definition = decision ? (SETTLEMENT_DECISIONS[decision.id?.toLowerCase()] || SETTLEMENT_DECISIONS[decision.id]) : null;
          const options = definition?.options?.map(option => ({ name: option.id, value: option.id })) || [];
          return respond(options.filter(choice => choice.name.toLowerCase().includes(lowerFocused) || choice.value.toLowerCase().includes(lowerFocused)));
        }
        if (sub === 'expedition' && focused.name === 'expedition') {
          const settlementId = interaction.options.getString('settlement');
          const settlement = findSettlement(player, settlementId);
          if (!settlement) return respond([]);
          return respond(expeditionTemplateChoices(settlement));
        }
        if ((sub === 'cancel' || sub === 'expedite') && focused.name === 'expedition') {
          const settlementId = interaction.options.getString('settlement');
          const settlement = findSettlement(player, settlementId);
          if (!settlement) return respond([]);
          return respond(activeExpeditionChoices(settlement));
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error('Autocomplete handler error:', error);
  }
  return interaction.respond([]);
}
async function handleSlashCommand(interaction) {
  const player = getPlayer(interaction.user.id);
  const exploration = ensureExplorationState(player);

  if (!['dashboard', 'explore', 'travel', 'base', 'settlement', 'hy'].includes(interaction.commandName)) {
    const executor = SIMPLE_SLASH_EXECUTORS[interaction.commandName];
    if (executor) {
      const result = executor(interaction) || {};
      const { command, args = [], overrides = {} } = result;
      if (!command) {
        return interaction.reply({ content: '⚠️ Command handler misconfigured.', ephemeral: true });
      }
      return runLegacySlashCommand(interaction, command, args, overrides);
    }
  }

  switch (interaction.commandName) {
    case 'dashboard': {
      const scope = interaction.options.getString('scope') || 'all';
      const embeds = [];
      if (scope === 'all' || scope === 'explore') embeds.push(buildExplorationStatusEmbed(player, getBiomeDefinition(exploration.currentBiome), exploration));
      if (scope === 'all' || scope === 'base') embeds.push(buildBaseSummaryEmbed(player, exploration));
      if (scope === 'all' || scope === 'settlement') embeds.push(buildSettlementSummaryEmbed(player));
      if (!embeds.length) embeds.push(buildPlayerOverviewEmbed(player, exploration));
      return interaction.reply({ embeds: embeds.slice(0, 10), components: buildDashboardComponents() });
    }
    case 'explore': {
      const sub = interaction.options.getSubcommand();
      if (sub === 'status') {
        const biome = getBiomeDefinition(exploration.currentBiome);
        const components = [
          ...buildGatheringActionComponents(interaction.user.id, exploration),
          ...buildDashboardComponents()
        ];
        return interaction.reply({ embeds: [buildExplorationStatusEmbed(player, biome, exploration)], components });
      }
      if (sub === 'resolve') {
        const message = createMessageAdapterFromInteraction(interaction);
        return handleExploreCommand(message, ['resolve']);
      }
      if (sub === 'activity') {
        const activityId = interaction.options.getString('activity_id', true);
        const message = createMessageAdapterFromInteraction(interaction);
        return handleExploreCommand(message, ['activity', activityId]);
      }
      if (sub === 'chain') {
        const chainId = interaction.options.getString('chain_id', true);
        const message = createMessageAdapterFromInteraction(interaction);
        return handleExploreCommand(message, ['chain', chainId]);
      }
      if (sub === 'action') {
        const actionId = interaction.options.getString('action_id', true);
        const message = createMessageAdapterFromInteraction(interaction);
        return handleExploreCommand(message, [actionId]);
      }
      break;
    }
    case 'gather': {
      const sub = interaction.options.getSubcommand();
      const biome = getBiomeDefinition(exploration.currentBiome);
      if (!biome) {
        return interaction.reply({ ephemeral: true, content: '❌ Unable to determine your current biome.' });
      }
      if (sub === 'status') {
        const includeTutorial = !player.tutorials.gathering?.intro;
        const embed = buildGatherStatusEmbed(player, biome, exploration, { includeTutorial });
        player.tutorials.gathering.intro = true;
        embed.addFields({ name: 'Resource Highlights', value: summarizeBiomeGatheringResources(biome), inline: false });
        const components = [
          ...buildGatheringActionComponents(interaction.user.id, exploration),
          ...buildDashboardComponents()
        ];
        return interaction.reply({ embeds: [embed], components });
      }
      if (sub === 'start') {
        const gatherType = interaction.options.getString('type', true).toLowerCase();
        if (!GATHERING_SET_TYPES.includes(gatherType)) {
          return interaction.reply({ ephemeral: true, content: '❌ Unknown gathering type.' });
        }
        const result = await startGatheringSession(player, gatherType, { interaction, biome, ephemeral: true });
        if (result?.error && !interaction.replied) {
          return interaction.reply({ ephemeral: true, content: `❌ ${result.error}` });
        }
        return;
      }
      if (sub === 'gear') {
        const actionType = interaction.options.getString('action', true);
        if (actionType === 'status') {
          const embed = buildGatheringGearEmbed(player);
          const components = [
            ...buildGatheringActionComponents(interaction.user.id, exploration),
            ...buildDashboardComponents()
          ];
          return interaction.reply({ embeds: [embed], components, ephemeral: true });
        }
        if (actionType === 'upgrade') {
          const targetType = interaction.options.getString('type');
          if (!targetType || !GATHERING_SET_TYPES.includes(targetType.toLowerCase())) {
            return interaction.reply({ ephemeral: true, content: `❌ Specify a gathering type to upgrade: ${GATHERING_SET_TYPES.join(', ')}` });
          }
          const normalizedType = targetType.toLowerCase();
          const gear = ensureGatheringGear(player);
          const currentId = gear.current?.[normalizedType];
          const nextTier = getNextGatheringTier(normalizedType, currentId);
          if (!nextTier) {
            return interaction.reply({ ephemeral: true, content: '⭐ You already have the best gear for that gathering type.' });
          }
          if (!canAffordGatheringTier(player, nextTier)) {
            return interaction.reply({ ephemeral: true, content: `❌ Missing materials. Cost: ${formatGatheringRequirements(nextTier)}.` });
          }
          applyGatheringTierCost(player, nextTier);
          gear.unlocked[normalizedType] = gear.unlocked[normalizedType] || {};
          gear.current[normalizedType] = nextTier.id;
          gear.unlocked[normalizedType][nextTier.id] = true;
          const embed = buildGatheringGearEmbed(player);
          embed.setDescription(`✅ Upgraded **${GATHERING_TYPE_LABELS[normalizedType]}** gear to **${nextTier.name}**!\nSpeed +${(nextTier.bonuses.speed * 100).toFixed(0)}%, Yield +${(nextTier.bonuses.quantity * 100).toFixed(0)}%, Rare +${(nextTier.bonuses.rarity * 100).toFixed(0)}%.`);
          const components = [
            ...buildGatheringActionComponents(interaction.user.id, exploration),
            ...buildDashboardComponents()
          ];
          return interaction.reply({ embeds: [embed], components, ephemeral: true });
        }
        return interaction.reply({ ephemeral: true, content: '❌ Unknown gear action.' });
      }
      if (sub === 'notifications') {
        const enabled = interaction.options.getBoolean('enabled', true);
        setGatherNotifications(player, enabled);
        return interaction.reply({ ephemeral: true, content: `🔔 Harvest notifications ${enabled ? 'enabled' : 'disabled'}.` });
      }
      break;
    }
    case 'travel': {
      const sub = interaction.options.getSubcommand();
      if (sub === 'status') {
        const biome = getBiomeDefinition(exploration.currentBiome);
        return interaction.reply({ embeds: [buildTravelStatusEmbed(player, exploration, biome)], components: buildDashboardComponents() });
      }
      if (sub === 'resolve') {
        const message = createMessageAdapterFromInteraction(interaction);
        return handleTravelCommand(message, ['resolve']);
      }
      if (sub === 'start') {
        const biomeId = interaction.options.getString('biome', true);
        const message = createMessageAdapterFromInteraction(interaction);
        return handleTravelCommand(message, ['start', biomeId]);
      }
      break;
    }
    case 'base': {
      const sub = interaction.options.getSubcommand();
      const args = [sub];
      const biome = interaction.options.getString('biome');
      if (biome) args.push(biome);
      if (sub === 'upgrade') {
        args.push(interaction.options.getString('module', true));
      }
      const message = createMessageAdapterFromInteraction(interaction);
      return handleBaseCommand(message, args);
    }
    case 'settlement': {
      const sub = interaction.options.getSubcommand();
      const args = [sub];
      if (['info', 'stockpile', 'expeditions', 'expedition', 'cancel', 'expedite', 'decisions'].includes(sub)) {
        args.push(interaction.options.getString('settlement', true));
      }
      if (sub === 'decisions') {
        args.push(interaction.options.getString('decision', true));
        args.push(interaction.options.getString('option', true));
      }
      if (sub === 'expedition') {
        args.push(interaction.options.getString('expedition', true));
        const villagers = interaction.options.getInteger('villagers');
        if (villagers != null) args.push(String(villagers));
      }
      if (sub === 'cancel' || sub === 'expedite') {
        args.push(interaction.options.getString('expedition', true));
      }
      const message = createMessageAdapterFromInteraction(interaction);
      return handleSettlementCommand(message, args);
    }
    case 'hy': {
      const sub = interaction.options.getSubcommand();
      const executor = SIMPLE_SLASH_EXECUTORS[sub];
      if (!executor) {
        return interaction.reply({ content: '⚠️ That /hy command is not available yet.', ephemeral: true });
      }
      const result = executor(interaction) || {};
      const { command, args = [], overrides = {} } = result;
      if (!command) {
        return interaction.reply({ content: '⚠️ Command handler misconfigured.', ephemeral: true });
      }
      return runLegacySlashCommand(interaction, command, args, overrides);
    }
    case 'abandoncontract': {
      const factionId = interaction.options.getString('faction', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleContractCommand(message, ['abandon', factionId]);
    }
    case 'quests': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleQuestCommand(message, ['list']);
    }
    case 'startquest': {
      const questId = interaction.options.getString('id', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleQuestCommand(message, ['start', questId]);
    }
    case 'completequest': {
      const questId = interaction.options.getString('id', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleQuestCommand(message, ['complete', questId]);
    }
    case 'achievements': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleAchievementCommand(message, ['list']);
    }
    case 'claimachievement': {
      const achievementId = interaction.options.getString('id', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleAchievementCommand(message, ['claim', achievementId]);
    }
    case 'scramble': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleScrambleCommand(message);
    }
    case 'trivia': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleTriviaCommand(message);
    }
    case 'guess': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleGuessCommand(message);
    }
    case 'rps': {
      const choice = interaction.options.getString('choice', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleRPSCommand(message, choice);
    }
    case 'coinflip': {
      const call = interaction.options.getString('call');
      const message = createMessageAdapterFromInteraction(interaction);
      return handleCoinflipCommand(message, call);
    }
    case 'leaderboard': {
      const category = interaction.options.getString('category');
      const message = createMessageAdapterFromInteraction(interaction);
      return handleLeaderboardCommand(message, category ? [category] : []);
    }
    case 'trade': {
      const user = interaction.options.getUser('user', true);
      const item = interaction.options.getString('item', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleTradeCommand(message, [user.id, item]);
    }
    case 'help': {
      const category = interaction.options.getString('category');
      const message = createMessageAdapterFromInteraction(interaction);
      return handleHelpCommand(message, category ? [category] : []);
    }
    case 'info': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleInfoCommand(message);
    }
    case 'lore': {
      const topic = interaction.options.getString('topic', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleLoreCommand(message, [topic]);
    }
    case 'codex': {
      const category = interaction.options.getString('category', true);
      const entry = interaction.options.getString('entry');
      const args = [category];
      if (entry) args.push(entry);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleCodexCommand(message, args);
    }
    case 'reputation': {
      const faction = interaction.options.getString('faction');
      const message = createMessageAdapterFromInteraction(interaction);
      return handleReputationCommand(message, faction ? [faction] : []);
    }
    case 'eventsub': {
      const eventId = interaction.options.getString('event');
      const message = createMessageAdapterFromInteraction(interaction);
      return handleEventSubCommand(message, eventId ? [eventId] : []);
    }
    case 'eventstatus': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleEventStatusCommand(message);
    }
    case 'participate': {
      const eventId = interaction.options.getString('event', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleParticipateCommand(message, [eventId]);
    }
    case 'setuptweets': {
      const channel = interaction.options.getChannel('channel');
      const message = createMessageAdapterFromInteraction(interaction);
      return handleSetupTweetsCommand(message, [], channel ? { channel } : {});
    }
    case 'checktweets': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleCheckTweetsCommand(message);
    }
    case 'reset': {
      const user = interaction.options.getUser('user', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleResetCommand(message, [user.id]);
    }
    case 'addcoins': {
      const user = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const message = createMessageAdapterFromInteraction(interaction);
      return handleAddCoinsCommand(message, [user.id, String(amount)]);
    }
    case 'duel': {
      const user = interaction.options.getUser('user', true);
      const wager = interaction.options.getInteger('wager');
      const args = [user.id];
      if (wager != null) args.push(String(wager));
      const message = createMessageAdapterFromInteraction(interaction);
      return handleDuelCommand(message, args);
    }
    case 'accept': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleAcceptCommand(message);
    }
    case 'decline': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleDeclineCommand(message);
    }
    case 'teamqueue': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleTeamQueueCommand(message);
    }
    case 'leaveteam': {
      const message = createMessageAdapterFromInteraction(interaction);
      return handleLeaveTeamCommand(message);
    }
    default:
      break;
  }
  return interaction.reply({ content: '⚠️ Command not implemented yet.', ephemeral: true });
}
async function handleSelectMenuInteraction(interaction) {
  const [scope, context] = interaction.customId.split('|');
  const player = getPlayer(interaction.user.id);
  const exploration = ensureExplorationState(player);

  try {
    if (scope === 'base-upgrade') {
      const biomeId = context || exploration.currentBiome;
      const moduleId = interaction.values?.[0];
      if (!biomeId || !moduleId) {
        return interaction.reply({ ephemeral: true, content: '❌ Unable to determine module selection.' });
      }
      const base = ensureBase(player, biomeId.toLowerCase());
      const preview = buildBaseModulePreview(base, moduleId);
      if (preview.error) {
        return interaction.reply({ ephemeral: true, content: `❌ ${preview.error}` });
      }
      return interaction.reply({ ephemeral: true, embeds: [preview.embed], components: preview.components });
    }

    if (scope === 'settlement-expedition') {
      const settlementId = context;
      const expeditionId = interaction.values?.[0];
      if (!settlementId || !expeditionId) {
        return interaction.reply({ ephemeral: true, content: '❌ Unable to determine expedition selection.' });
      }
      const settlement = findSettlement(player, settlementId);
      if (!settlement) {
        return interaction.reply({ ephemeral: true, content: '❌ Settlement not found.' });
      }
      const preview = buildSettlementExpeditionPreview(settlement, expeditionId);
      if (preview.error) {
        return interaction.reply({ ephemeral: true, content: `❌ ${preview.error}` });
      }
      return interaction.reply({ ephemeral: true, embeds: [preview.embed], components: preview.components });
    }
  } catch (error) {
    console.error('Select menu handler error:', error);
    if (!interaction.replied) {
      return interaction.reply({ ephemeral: true, content: '❌ Something went wrong handling that selection.' });
    }
    return;
  }

  if (!interaction.replied) {
    interaction.reply({ ephemeral: true, content: '⚠️ This selection is not active yet.' });
  }
}
async function handleButtonInteraction(interaction) {
  const [scope, action, ...rest] = interaction.customId.split('|');
  const player = getPlayer(interaction.user.id);
  const exploration = ensureExplorationState(player);
  const biome = getBiomeDefinition(exploration.currentBiome);

  try {
    switch ((scope || '').toLowerCase()) {
      case 'command': {
        const commandName = action?.toLowerCase();
        if (!commandName) {
          return interaction.reply({ ephemeral: true, content: '❌ Unable to process that action.' });
        }
        const message = createMessageAdapterFromInteraction(interaction, { ephemeral: true });
        await executeCommand(message, commandName, rest);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ ephemeral: true, content: '✅ Command triggered.' });
        }
        return;
      }
      case 'gather': {
        const gatherType = action?.toLowerCase();
        if (!GATHERING_SET_TYPES.includes(gatherType)) {
          return interaction.reply({ ephemeral: true, content: '❌ That harvesting option is not available yet.' });
        }
        const result = await startGatheringSession(player, gatherType, { interaction, ephemeral: true, biome });
        if (result?.error) {
          if (!interaction.replied) {
            return interaction.reply({ ephemeral: true, content: `❌ ${result.error}` });
          }
        }
        return;
      }
      case 'dashboard': {
        if (action === 'explore') {
          const embed = buildExplorationStatusEmbed(player, biome, exploration);
          const components = [
            ...buildGatheringActionComponents(interaction.user.id, exploration),
            ...buildDashboardComponents()
          ];
          return interaction.reply({ ephemeral: true, embeds: [embed], components });
        }
        if (action === 'travel') {
          const embed = buildTravelStatusEmbed(player, exploration, biome);
          return interaction.reply({ ephemeral: true, embeds: [embed], components: buildDashboardComponents() });
        }
        if (action === 'base') {
          const embed = buildBaseSummaryEmbed(player, exploration);
          return sendStyledEmbed(interaction, embed, 'base', { components: buildDashboardComponents() });
        }
        if (action === 'settlement') {
          const embed = buildSettlementSummaryEmbed(player);
          return sendStyledEmbed(interaction, embed, 'settlement', { components: buildDashboardComponents() });
        }
        break;
      }
      case 'base': {
        const biomeId = (rest[0] || exploration.currentBiome || '').toLowerCase();
        if (!biomeId) {
          return interaction.reply({ ephemeral: true, content: '❌ Unable to resolve biome for that base.' });
        }
        const base = ensureBase(player, biomeId);
        if (action === 'modules') {
          const embed = buildBaseModuleListEmbed(player, base);
          return sendStyledEmbed(interaction, embed, 'base', { components: buildBaseModulesComponents(base) });
        }
        if (action === 'rankup') {
          const result = rankUpBase(player, base);
          if (result.error) return interaction.reply({ ephemeral: true, content: `❌ ${result.error}` });
          const embed = buildBaseDetailEmbed(player, base);
          if (result.message) embed.setDescription(result.message);
          return sendStyledEmbed(interaction, embed, 'base', { components: buildBaseDetailComponents(base) });
        }
        if (action === 'info') {
          const embed = buildBaseDetailEmbed(player, base);
          return sendStyledEmbed(interaction, embed, 'base', { components: buildBaseDetailComponents(base) });
        }
        if (action === 'upgrade') {
          const moduleId = rest[1];
          if (!moduleId) {
            return interaction.reply({ ephemeral: true, content: '❌ Module unknown.' });
          }
          const result = upgradeBaseModule(player, base, moduleId.toLowerCase());
          if (result.error) return interaction.reply({ ephemeral: true, content: `❌ ${result.error}` });
          const embed = buildBaseDetailEmbed(player, base);
          if (result.message) embed.setDescription(result.message);
          return sendStyledEmbed(interaction, embed, 'base', { components: buildBaseDetailComponents(base) });
        }
        break;
      }
      case 'settlement': {
        const settlementId = rest[0];
        const settlement = findSettlement(player, settlementId);
        if (!settlement) {
          return interaction.reply({ ephemeral: true, content: '❌ Settlement not found.' });
        }
        if (action === 'info') {
          const embed = buildSettlementDetailEmbed(player, settlement);
          return sendStyledEmbed(interaction, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
        }
        if (action === 'stockpile') {
          const stockpileText = formatStockpile(settlement.stockpile) || 'No stored materials.';
          const embed = new EmbedBuilder()
            .setColor('#27AE60')
            .setTitle(`📦 ${settlement.name} Stockpile`)
            .setDescription(stockpileText)
            .setThumbnail(EMBED_VISUALS.settlementDetail)
            .setImage(EMBED_VISUALS.settlementSummary);
          if (settlement.production && Object.keys(settlement.production).length) {
            embed.addFields({ name: 'Hourly Production', value: formatProduction(settlement.production), inline: false });
          }
          return sendStyledEmbed(interaction, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
        }
        if (action === 'decisions') {
          const details = formatSettlementDecisions(settlement) || 'No pending decisions.';
          const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle(`⚖️ Decisions — ${settlement.name}`)
            .setDescription(details)
            .setThumbnail(EMBED_VISUALS.settlementDetail)
            .setImage(EMBED_VISUALS.settlementDetail);
          return sendStyledEmbed(interaction, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
        }
        if (action === 'expeditions') {
          const embed = buildSettlementExpeditionOptionsEmbed(player, settlement);
          return sendStyledEmbed(interaction, embed, 'settlement', { components: buildSettlementExpeditionComponents(settlement) });
        }
        if (action === 'launch') {
          const expeditionId = rest[1];
          if (!expeditionId) {
            return interaction.reply({ ephemeral: true, content: '❌ Expedition not specified.' });
          }
          const result = dispatchSettlementExpedition(player, settlement, expeditionId.toLowerCase());
          if (result.error) return interaction.reply({ ephemeral: true, content: `❌ ${result.error}` });
          const embed = buildSettlementDetailEmbed(player, settlement);
          embed.setDescription(result.message);
          if (result.durationMs) {
            embed.addFields({ name: 'New Expedition', value: `${formatActionName(expeditionId)} — ETA ${formatDuration(result.durationMs)}`, inline: false });
          }
          return sendStyledEmbed(interaction, embed, 'settlement', { components: buildSettlementDetailComponents(settlement) });
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error('Button handler error:', error);
    if (!interaction.replied) {
      return interaction.reply({ ephemeral: true, content: '❌ Something went wrong handling that button.' });
    }
    return;
  }

  if (!interaction.replied) {
    return interaction.reply({ ephemeral: true, content: '⚠️ That control is not active yet.' });
  }
}

function buildPlayerOverviewEmbed(player, exploration) {
  const embed = new EmbedBuilder()
    .setColor('#2980B9')
    .setTitle('🎮 Adventurer Overview')
    .setDescription('Snapshot of your progress across all systems.')
    .setThumbnail(EMBED_VISUALS.dashboard)
    .setImage(EMBED_VISUALS.dashboard)
    .addFields(
      { name: 'Level', value: `${player.level} (${player.xp}/${xpForLevel(player.level + 1)} XP)`, inline: true },
      { name: 'Coins', value: `${player.coins}`, inline: true },
      { name: 'Bases', value: `${Object.keys(player.bases || {}).length}`, inline: true },
      { name: 'Settlements', value: `${Object.keys(player.settlements || {}).length}`, inline: true }
    );
  const action = exploration.action ? `${formatActionName(exploration.action.type)} (${formatDuration(exploration.action.endsAt - Date.now())})` : 'Idle';
  embed.addFields({ name: 'Exploration', value: action, inline: false });
  return embed;
}