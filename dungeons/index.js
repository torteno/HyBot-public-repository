'use strict';

const { EmbedBuilder } = require('discord.js');
const path = require('path');

// Load dungeon definitions directly from data file to avoid circular requires.
let dungeonDefinitions = [];
try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  dungeonDefinitions = require(path.join('..', 'data', 'dungeons.json'));
} catch (error) {
  console.error('[DUNGEONS] Failed to load dungeon definitions:', error.message);
  dungeonDefinitions = [];
}

const DUNGEON_LOOKUP = new Map();
dungeonDefinitions.forEach(def => {
  if (def?.id) {
    DUNGEON_LOOKUP.set(def.id.toLowerCase(), def);
  }
});

const QUEUE_REGISTRY = new Map(); // queueId -> queue state
const PLAYER_QUEUE_INDEX = new Map(); // playerId -> queueId

const MAX_PARTY_SIZE = 4;

function resolveDungeonDefinition(input, playerLevel) {
  if (input) {
    const normalized = input.toString().trim().toLowerCase();
    const exact = DUNGEON_LOOKUP.get(normalized);
    if (exact) return exact;
    const byName = dungeonDefinitions.find(def => def.name?.toLowerCase() === normalized);
    if (byName) return byName;
  }

  // Fallback: choose the hardest dungeon the player qualifies for.
  const unlocked = dungeonDefinitions
    .filter(def => (def.minLevel || 1) <= playerLevel)
    .sort((a, b) => (b.minLevel || 0) - (a.minLevel || 0));
  return unlocked[0] || null;
}

function buildQueueId(guildId, dungeonId) {
  return `${guildId || 'global'}:${dungeonId}`;
}

function formatPlayersList(queue) {
  if (!queue.players.size) return 'No adventurers queued yet.';
  return Array.from(queue.players.values())
    .map((entry, index) => `${index + 1}. <@${entry.userId}>`)
    .join('\n');
}

function isPlayerEligibleForDungeon(player, dungeon, options = {}) {
  if (!player) {
    return { ok: false, error: 'Player data unavailable.' };
  }
  if (!dungeon) {
    return { ok: false, error: 'Dungeon unavailable.' };
  }
  const minLevel = dungeon.minLevel || 1;
  if ((player.level || 1) < minLevel) {
    return { ok: false, error: `You must be level ${minLevel} to enter ${dungeon.name}.` };
  }
  
  // Check for remote dungeon key (flag or item in inventory)
  const hasAnywhereFlag = Boolean(player.flags && player.flags.dungeonAnywhere);
  const hasAnywhereItem = Boolean(player.inventory && player.inventory.remote_dungeon_key > 0);
  const hasAnywhereUnlock = hasAnywhereFlag || hasAnywhereItem;
  
  if (!hasAnywhereUnlock) {
    const currentBiome = player.exploration?.currentBiome?.toLowerCase?.() || '';
    const requiredBiome = dungeon.biome?.toLowerCase?.() || '';
    if (requiredBiome && currentBiome !== requiredBiome) {
      return { ok: false, error: `Travel to the ${dungeon.biome} entrance or complete the "Master Dungeon Delver" quest to obtain the Remote Dungeon Key.` };
    }
  }
  return { ok: true };
}

function buildQueueEmbed(queue, prefix) {
  const embed = new EmbedBuilder()
    .setColor('#8E44AD')
    .setTitle(`Dungeon Queue — ${queue.dungeon.name}`)
    .setDescription(`${queue.players.size}/${MAX_PARTY_SIZE} adventurers ready.`)
    .addFields(
      { name: 'Dungeon', value: `ID: \
\`${queue.dungeon.id}\` • Min Level: ${queue.dungeon.minLevel || 1}`, inline: false },
      { name: 'Players', value: formatPlayersList(queue), inline: false }
    )
    .setFooter({ text: `Use ${prefix} dungeon leave to exit the queue.` });

  if (queue.dungeon.theme) {
    embed.addFields({ name: 'Theme', value: queue.dungeon.theme, inline: true });
  }
  if (queue.dungeon.environment) {
    embed.addFields({ name: 'Environment', value: queue.dungeon.environment, inline: false });
  }
  if (queue.players.size >= MAX_PARTY_SIZE) {
    embed.addFields({ name: 'Status', value: 'Queue full — team assembly complete. Dungeon launch coming soon!' });
  } else {
    const remaining = MAX_PARTY_SIZE - queue.players.size;
    embed.addFields({ name: 'Status', value: `Waiting for ${remaining} more adventurer(s).` });
  }

  return embed;
}

function queuePlayer(message, player, options = {}) {
  const prefix = options.prefix || '!hy ';
  const guildId = message.guild?.id || 'global';
  const channelId = message.channel?.id;
  const userId = message.author?.id;

  if (!channelId || !userId) {
    return { error: 'Channel or user information missing.' };
  }

  const dungeon = resolveDungeonDefinition(options.dungeonId, player.level || 1);
  if (!dungeon) {
    return { error: 'No available dungeon matches the request.' };
  }

  const eligibility = isPlayerEligibleForDungeon(player, dungeon, options);
  if (!eligibility.ok) {
    return { error: eligibility.error };
  }

  const existingQueueId = PLAYER_QUEUE_INDEX.get(userId);
  if (existingQueueId) {
    if (existingQueueId === buildQueueId(guildId, dungeon.id)) {
      const queue = QUEUE_REGISTRY.get(existingQueueId);
      return { content: '⚠️ You are already queued for this dungeon.', embeds: [buildQueueEmbed(queue, prefix)] };
    }
    return { error: 'You are already queued for another dungeon. Use `!hy dungeon leave` first.' };
  }

  const queueId = buildQueueId(guildId, dungeon.id);
  let queue = QUEUE_REGISTRY.get(queueId);
  if (!queue) {
    queue = {
      id: queueId,
      guildId,
      channelId,
      dungeon,
      createdAt: Date.now(),
      players: new Map()
    };
    QUEUE_REGISTRY.set(queueId, queue);
  }

  if (queue.players.size >= MAX_PARTY_SIZE) {
    return { error: 'This dungeon queue is already full.' };
  }

  queue.players.set(userId, {
    userId,
    username: message.author.username || `Player ${queue.players.size + 1}`,
    joinedAt: Date.now()
  });
  PLAYER_QUEUE_INDEX.set(userId, queueId);

  const embed = buildQueueEmbed(queue, prefix);
  const content = queue.players.size >= MAX_PARTY_SIZE
    ? '✅ Party assembled! Dungeon launching soon (feature under construction).'
    : `✅ Joined the queue for **${dungeon.name}**.`;

  return { content, embeds: [embed] };
}

function leaveQueue(message) {
  const userId = message.author?.id;
  if (!userId) return { error: 'User information missing.' };

  const queueId = PLAYER_QUEUE_INDEX.get(userId);
  if (!queueId) {
    return { error: 'You are not currently queued for any dungeon.' };
  }

  const queue = QUEUE_REGISTRY.get(queueId);
  if (queue) {
    queue.players.delete(userId);
    if (queue.players.size === 0) {
      QUEUE_REGISTRY.delete(queueId);
    }
  }
  PLAYER_QUEUE_INDEX.delete(userId);

  return { content: '✅ You have left the dungeon queue.' };
}

function getQueueStatus(message, options = {}) {
  const prefix = options.prefix || '!hy';
  const userId = message.author?.id;
  if (!userId) return { error: 'User information missing.' };

  const queueId = PLAYER_QUEUE_INDEX.get(userId);
  if (!queueId) {
    return { content: 'ℹ️ You are not queued for any dungeon. Use `!hy dungeon queue <id>` to join one.' };
  }

  const queue = QUEUE_REGISTRY.get(queueId);
  if (!queue) {
    PLAYER_QUEUE_INDEX.delete(userId);
    return { content: 'ℹ️ Your previous queue no longer exists. You can join another with `!hy dungeon queue`.' };
  }

  return { embeds: [buildQueueEmbed(queue, prefix)] };
}

module.exports = {
  queuePlayer,
  leaveQueue,
  getQueueStatus,
  QUEUE_REGISTRY,
  PLAYER_QUEUE_INDEX,
  MAX_PARTY_SIZE,
  buildQueueId
};
