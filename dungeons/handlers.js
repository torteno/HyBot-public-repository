'use strict';

const { EmbedBuilder } = require('discord.js');
const runModule = require('./run');
const queueModule = require('./index');

// Helper functions for player data manipulation (will be passed from main bot)
let addXpToPlayer = null;
let addItemToPlayer = null;

function setPlayerHelpers(addXpFunc, addItemFunc) {
  addXpToPlayer = addXpFunc;
  addItemToPlayer = addItemFunc;
}

// Handle dungeon button interactions
async function handleDungeonButton(interaction, action, runId, options = {}) {
  const userId = interaction.user.id;
  const run = runModule.getRun(runId) || runModule.getRunByPlayer(userId);
  
  if (!run) {
    return interaction.reply({ ephemeral: true, content: '❌ No active dungeon run found.' });
  }

  if (!run.party.has(userId)) {
    return interaction.reply({ ephemeral: true, content: '❌ You are not part of this dungeon run.' });
  }

  const currentRoom = run.rooms[run.currentRoomIndex];
  if (!currentRoom) {
    return handleDungeonComplete(interaction, run, options.getPlayerFunc);
  }

  switch (action) {
    case 'attack':
      return handleCombatAction(interaction, run, userId, 'attack');
    case 'defend':
      return handleCombatAction(interaction, run, userId, 'defend');
    case 'ability':
      return handleCombatAction(interaction, run, userId, 'ability');
    case 'solve':
      return handlePuzzleAction(interaction, run, userId);
    case 'claim':
      return handleTreasureAction(interaction, run, userId);
    case 'interact':
      return handleEventAction(interaction, run, userId);
    case 'challenge':
      return handlePreBossChallenge(interaction, run, userId);
    case 'next':
      return handleNextRoom(interaction, run);
    case 'leave':
      return handleLeaveDungeon(interaction, run, userId);
      case 'complete':
      return handleDungeonComplete(interaction, run, options?.getPlayerFunc);
    case 'requeue':
      return handleRequeueChoice(interaction, run, 'requeue', options?.getPlayerFunc);
    case 'leave_complete':
      return handleRequeueChoice(interaction, run, 'leave', options?.getPlayerFunc);
    case 'event_choice':
      return handleEventChoice(interaction, run, userId, rest[0]);
    default:
      return interaction.reply({ ephemeral: true, content: '❌ Unknown action.' });
  }
}

async function handleEventChoice(interaction, run, userId, choice) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (currentRoom.type !== runModule.ROOM_TYPES.EVENT) {
    return interaction.reply({ ephemeral: true, content: '❌ This is not an event room.' });
  }

  const event = currentRoom.event;
  if (!event || event.type !== 'choice') {
    return interaction.reply({ ephemeral: true, content: '❌ This event does not require a choice.' });
  }

  if (currentRoom.eventChoice) {
    return interaction.reply({ ephemeral: true, content: '✅ Choice already made for this event.' });
  }

  currentRoom.eventChoice = choice;
  let rewardText = '';

  if (choice === 'coins') {
    const coins = 100 + (currentRoom.difficulty || 1) * 50;
    currentRoom.rewards = { xp: 20, coins };
    rewardText = `You chose coins! Received ${coins} coins.`;
  } else if (choice === 'item') {
    // Grant a random item from dungeon loot tables
    const dungeonTemplate = run.dungeon || {};
    const floors = dungeonTemplate.floors || [];
    const allLoot = [];
    floors.forEach(floor => {
      if (floor.loot && Array.isArray(floor.loot)) {
        allLoot.push(...floor.loot);
      }
    });
    
    if (allLoot.length > 0) {
      const randomLoot = allLoot[Math.floor(Math.random() * allLoot.length)];
      const quantity = Math.floor(Math.random() * ((randomLoot.max || 1) - (randomLoot.min || 1) + 1)) + (randomLoot.min || 1);
      currentRoom.rewards = { xp: 30, coins: 0, items: [{ itemId: randomLoot.item, quantity }] };
      rewardText = `You chose an item! Received ${randomLoot.item} x${quantity}.`;
    } else {
      currentRoom.rewards = { xp: 30, coins: 50 };
      rewardText = 'You chose an item! Received 50 coins instead.';
    }
  } else if (choice === 'buff') {
    const buffEntry = {
      name: 'Shrine Blessing',
      description: 'A powerful blessing from the shrine.',
      power: 20,
      defense: 10,
      duration: 'dungeon'
    };
    run.teamBuffs.push(buffEntry);
    currentRoom.rewards = { xp: 40, coins: 0 };
    rewardText = 'You chose a buff! Your team received a powerful blessing!';
  }

  currentRoom.completed = true;
  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: `✅ ${rewardText}` });
}

async function handleCombatAction(interaction, run, userId, actionType) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (currentRoom.type !== runModule.ROOM_TYPES.COMBAT && currentRoom.type !== runModule.ROOM_TYPES.BOSS) {
    return interaction.reply({ ephemeral: true, content: '❌ This is not a combat room.' });
  }

  const player = run.party.get(userId);
  if (!player || player.hp <= 0) {
    return interaction.reply({ ephemeral: true, content: '❌ You are incapacitated and cannot act.' });
  }

  // Check for cooldown (prevent spam clicking)
  const now = Date.now();
  if (player.lastActionTime && (now - player.lastActionTime) < 1000) {
    return interaction.reply({ ephemeral: true, content: '⏳ Please wait a moment before acting again.' });
  }
  player.lastActionTime = now;

  // Simple combat resolution (can be expanded)
  const enemies = currentRoom.enemies || (currentRoom.boss ? [currentRoom.boss] : []);
  if (enemies.length === 0 || enemies.every(e => e.hp <= 0)) {
    // Room already cleared
    currentRoom.completed = true;
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: '✅ This room is already cleared!' });
  }

  let damage = 0;
  let actionText = '';
  
  // Apply team buffs to damage calculation
  const teamBuffs = run.teamBuffs || [];
  let powerBonus = 0;
  let critChance = 0;
  let lootBonus = 0;
  teamBuffs.forEach(buff => {
    if (buff.power) powerBonus += buff.power;
    if (buff.critChance) critChance += buff.critChance;
    if (buff.lootBonus) lootBonus += buff.lootBonus;
  });
  
  if (actionType === 'attack') {
    // Base damage scales with level and team buffs
    const baseDamage = 10 + (player.level || 1) * 2 + powerBonus;
    // Add some randomness
    damage = Math.floor(baseDamage * (0.8 + Math.random() * 0.4));
    
    // Critical hit chance
    if (Math.random() < critChance) {
      damage = Math.floor(damage * 1.5);
      actionText = '💥 You land a critical hit';
    } else {
      actionText = '⚔️ You attack';
    }
  } else if (actionType === 'ability') {
    // Abilities cost mana but deal more damage
    if ((player.mana || 0) < 10) {
      return interaction.reply({ ephemeral: true, content: '❌ Not enough mana! You need 10 mana to use an ability.' });
    }
    const baseDamage = 15 + (player.level || 1) * 3 + powerBonus;
    damage = Math.floor(baseDamage * (0.9 + Math.random() * 0.2));
    
    // Abilities have higher crit chance
    const abilityCritChance = critChance + 0.15;
    if (Math.random() < abilityCritChance) {
      damage = Math.floor(damage * 1.5);
      actionText = '💥✨ You unleash a critical ability';
    } else {
      actionText = '✨ You use an ability';
    }
    
    player.mana = Math.max(0, (player.mana || 0) - 10);
    
    // Chance to apply status effect (stun, burn, etc.)
    if (Math.random() < 0.2) {
      if (!target.statusEffects) target.statusEffects = [];
      const statusEffect = {
        type: Math.random() < 0.5 ? 'stun' : 'burn',
        duration: 2,
        damage: Math.floor(damage * 0.1)
      };
      target.statusEffects.push(statusEffect);
      actionText += ' and apply a status effect!';
    }
  } else if (actionType === 'defend') {
    // Defend reduces incoming damage for next attack
    player.defending = true;
    player.defendUntil = now + 5000; // Defend lasts 5 seconds
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: '🛡️ You brace for the next attack. Incoming damage reduced for 5 seconds.' });
  }
  
  // Apply damage to first alive enemy
  const target = enemies.find(e => e.hp > 0) || enemies[0];
  
  // Apply status effects to enemies before new damage
  if (target && target.statusEffects && target.statusEffects.length > 0) {
    target.statusEffects = target.statusEffects.filter(effect => {
      effect.duration--;
      if (effect.type === 'burn' && effect.duration > 0) {
        target.hp = Math.max(0, target.hp - effect.damage);
      }
      return effect.duration > 0;
    });
  }
  if (target) {
    target.hp = Math.max(0, target.hp - damage);
    player.damageDealt = (player.damageDealt || 0) + damage;
    player.actionsTaken = (player.actionsTaken || 0) + 1;
  }

  // Enemy counterattack (only if enemy is still alive)
  let enemyAttackText = '';
  if (target && target.hp > 0) {
    // Enemy attacks a random player
    const alivePlayers = Array.from(run.party.values()).filter(p => p.hp > 0);
    if (alivePlayers.length > 0) {
      const targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const enemyDamage = target.damage || 10;
      const actualDamage = (targetPlayer.defending && targetPlayer.defendUntil > now) 
        ? Math.floor(enemyDamage * 0.5) 
        : enemyDamage;
      targetPlayer.hp = Math.max(0, targetPlayer.hp - actualDamage);
      targetPlayer.defending = false; // Defend is consumed
      
      if (targetPlayer.userId === userId) {
        enemyAttackText = ` The enemy counterattacks for ${actualDamage} damage!`;
      } else {
        enemyAttackText = ` The enemy attacks <@${targetPlayer.userId}> for ${actualDamage} damage!`;
      }
    }
  }

  // Check if room is cleared
  if (enemies.every(e => e.hp <= 0)) {
    currentRoom.completed = true;
    // Grant rewards
    const totalXp = enemies.reduce((sum, e) => sum + (e.xp || 0), 0);
    const totalCoins = enemies.reduce((sum, e) => sum + (e.coins || 0), 0);
    currentRoom.rewards = { xp: totalXp, coins: totalCoins };
    
    // Notify all players
    const partyMentions = Array.from(run.party.values()).map(p => `<@${p.userId}>`).join(' ');
    interaction.channel.send(`🎉 **Room Cleared!** ${partyMentions} — All enemies defeated!`).catch(() => {});
  }

  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: `${actionText} for **${damage}** damage!${target.hp > 0 ? ` Enemy has ${target.hp}/${target.maxHp} HP remaining.${enemyAttackText}` : ' Enemy defeated!'}` });
}

async function handlePuzzleAction(interaction, run, userId) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (currentRoom.type !== runModule.ROOM_TYPES.PUZZLE) {
    return interaction.reply({ ephemeral: true, content: '❌ This is not a puzzle room.' });
  }

  const puzzle = currentRoom.puzzle;
  if (!puzzle) {
    // Fallback: auto-solve
    currentRoom.completed = true;
    currentRoom.rewards = { xp: 50, coins: 30 };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: '✅ Puzzle solved! The mechanism clicks into place.' });
  }

  // Check if puzzle has been solved
  if (currentRoom.puzzleSolved) {
    return interaction.reply({ ephemeral: true, content: '✅ This puzzle has already been solved!' });
  }

  // Initialize puzzle state if needed
  if (!currentRoom.puzzleState) {
    currentRoom.puzzleState = {
      attempts: 0,
      maxAttempts: 3,
      sequenceProgress: [],
      solved: false
    };
  }

  const puzzleState = currentRoom.puzzleState;

  // Simple puzzle solving - for sequence puzzles, require correct order
  if (puzzle.type === 'sequence') {
    // For sequence puzzles, we need multiple players to press buttons in order
    // For now, auto-solve but track progress for future enhancement
    puzzleState.sequenceProgress.push(userId);
    
    if (puzzleState.sequenceProgress.length >= puzzle.solution.length) {
      currentRoom.puzzleSolved = true;
      currentRoom.completed = true;
      const baseXp = 75 + (puzzle.difficulty || 1) * 25;
      const baseCoins = 50 + (puzzle.difficulty || 1) * 20;
      currentRoom.rewards = { xp: baseXp, coins: baseCoins };
      await updateRunMessage(interaction, run);
      return interaction.reply({ ephemeral: true, content: `✅ Puzzle solved! Your team correctly followed the sequence: ${puzzle.solution.join(' → ')}` });
    } else {
      return interaction.reply({ ephemeral: true, content: `🧩 Sequence progress: ${puzzleState.sequenceProgress.length}/${puzzle.solution.length}. Continue the sequence!` });
    }
  }

  if (puzzle.type === 'riddle') {
    // Riddles require a text answer - for now, auto-solve on interaction
    // In future, could use a modal or text input
    puzzleState.attempts++;
    
    if (puzzleState.attempts >= puzzleState.maxAttempts) {
      return interaction.reply({ ephemeral: true, content: `❌ Too many attempts! Hint: ${puzzle.hint}` });
    }
    
    // Auto-solve for now (in future, require actual answer)
    currentRoom.puzzleSolved = true;
    currentRoom.completed = true;
    const baseXp = 100 + (puzzle.difficulty || 1) * 30;
    const baseCoins = 60 + (puzzle.difficulty || 1) * 25;
    currentRoom.rewards = { xp: baseXp, coins: baseCoins };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: `✅ Puzzle solved! The answer was: **${puzzle.solution[0]}**. The mechanism unlocks.` });
  }

  if (puzzle.type === 'math') {
    // Math puzzles - calculate answer
    try {
      const answer = eval(puzzle.question.split('=')[0].trim());
      puzzleState.attempts++;
      
      if (puzzleState.attempts >= puzzleState.maxAttempts) {
        return interaction.reply({ ephemeral: true, content: `❌ Too many attempts! Hint: ${puzzle.hint}` });
      }
      
      currentRoom.puzzleSolved = true;
      currentRoom.completed = true;
      const baseXp = 60 + (puzzle.difficulty || 1) * 20;
      const baseCoins = 40 + (puzzle.difficulty || 1) * 15;
      currentRoom.rewards = { xp: baseXp, coins: baseCoins };
      await updateRunMessage(interaction, run);
      return interaction.reply({ ephemeral: true, content: `✅ Puzzle solved! The answer was **${answer}**. The mechanism clicks into place.` });
    } catch (error) {
      return interaction.reply({ ephemeral: true, content: '❌ Unable to solve puzzle. Try again!' });
    }
  }

  if (puzzle.type === 'pattern') {
    // Pattern puzzles - require identifying the pattern
    puzzleState.attempts++;
    
    if (puzzleState.attempts >= puzzleState.maxAttempts) {
      return interaction.reply({ ephemeral: true, content: `❌ Too many attempts! Hint: ${puzzle.hint}` });
    }
    
    currentRoom.puzzleSolved = true;
    currentRoom.completed = true;
    const baseXp = 80 + (puzzle.difficulty || 1) * 25;
    const baseCoins = 55 + (puzzle.difficulty || 1) * 20;
    currentRoom.rewards = { xp: baseXp, coins: baseCoins };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: `✅ Puzzle solved! The answer was **${puzzle.solution[0]}**. The pattern is revealed!` });
  }

  // Default: auto-solve
  currentRoom.completed = true;
  currentRoom.rewards = { xp: 50, coins: 30 };
  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: '✅ Puzzle solved! The mechanism clicks into place.' });
}

async function handleTreasureAction(interaction, run, userId) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (currentRoom.type !== runModule.ROOM_TYPES.TREASURE) {
    return interaction.reply({ ephemeral: true, content: '❌ This is not a treasure room.' });
  }

  if (currentRoom.completed) {
    return interaction.reply({ ephemeral: true, content: '✅ Treasure already claimed!' });
  }

  currentRoom.completed = true;
  const loot = currentRoom.loot || { coins: 50, items: [] };
  currentRoom.rewards = loot;
  
  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: `✅ Treasure claimed! You found ${loot.coins || 0} coins.` });
}

async function handleEventAction(interaction, run, userId) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (currentRoom.type !== runModule.ROOM_TYPES.EVENT) {
    return interaction.reply({ ephemeral: true, content: '❌ This is not an event room.' });
  }

  const event = currentRoom.event;
  if (!event) {
    currentRoom.completed = true;
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: '✅ Event completed.' });
  }

  if (event.type === 'heal') {
    run.party.forEach(p => {
      const healAmount = Math.floor((p.maxHp || 100) * (event.healPercent || 0.3));
      p.hp = Math.min(p.maxHp || 100, (p.hp || 0) + healAmount);
      if (event.restoreMana) {
        p.mana = p.maxMana || 50;
      }
    });
    currentRoom.completed = true;
    currentRoom.rewards = { xp: 30, coins: 20 };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: `✅ ${event.name}: Your party has been healed!${event.restoreMana ? ' Mana fully restored!' : ''}` });
  }

  if (event.type === 'buff') {
    const buffEntry = {
      name: event.name || 'Team Buff',
      description: event.description || 'A temporary enhancement.',
      ...event.buff
    };
    run.teamBuffs.push(buffEntry);
    currentRoom.completed = true;
    currentRoom.rewards = { xp: 40, coins: 25 };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: `✅ ${event.name}: Your team received a buff! Power: +${event.buff.power || 0}${event.buff.defense ? `, Defense: +${event.buff.defense}` : ''}` });
  }

  if (event.type === 'combat_bonus') {
    const buffEntry = {
      name: event.name || 'Combat Training',
      description: event.description || 'Combat experience gained.',
      ...event.buff
    };
    run.teamBuffs.push(buffEntry);
    currentRoom.completed = true;
    currentRoom.rewards = { xp: event.xpBonus || 50, coins: 30 };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: `✅ ${event.name}: Your team gained combat experience and bonuses!` });
  }

  if (event.type === 'loot_bonus') {
    const buffEntry = {
      name: event.name || 'Treasure Blessing',
      description: event.description || 'Increased loot discovery.',
      ...event.buff
    };
    run.teamBuffs.push(buffEntry);
    currentRoom.completed = true;
    currentRoom.rewards = { xp: 50, coins: 40 };
    await updateRunMessage(interaction, run);
    return interaction.reply({ ephemeral: true, content: `✅ ${event.name}: Your team's loot discovery has been enhanced!` });
  }

  if (event.type === 'choice') {
    // Choice events require player selection
    if (!currentRoom.eventChoice) {
      // Show choice buttons
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const choiceComponents = [
        new ActionRowBuilder().addComponents(
          ...event.choices.map((choice, index) => 
            new ButtonBuilder()
              .setCustomId(`dungeon|event_choice|${run.id}|${choice}`)
              .setLabel(choice.charAt(0).toUpperCase() + choice.slice(1))
              .setStyle(ButtonStyle.Primary)
          )
        )
      ];
      
      await updateRunMessage(interaction, run, null, choiceComponents);
      return interaction.reply({ ephemeral: true, content: `🎯 ${event.name}: Choose your reward!` });
    }
  }

  currentRoom.completed = true;
  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: `✅ ${event.name || 'Event'} completed.` });
}

async function handlePreBossChallenge(interaction, run, userId) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (currentRoom.type !== runModule.ROOM_TYPES.PRE_BOSS) {
    return interaction.reply({ ephemeral: true, content: '❌ This is not the pre-boss chamber.' });
  }

  // Pre-boss challenge is similar to combat
  if (currentRoom.challenge && currentRoom.challenge.type === 'elite_combat') {
    const enemy = currentRoom.challenge.enemy;
    if (!enemy.hp || enemy.hp > 0) {
      // Start combat
      currentRoom.enemies = [enemy];
      await updateRunMessage(interaction, run);
      return interaction.reply({ ephemeral: true, content: '⚔️ Elite Guardian engaged! Use combat actions to defeat it.' });
    }
  }

  currentRoom.completed = true;
  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: '✅ Pre-boss challenge completed! You may now proceed to the boss.' });
}

async function handleNextRoom(interaction, run) {
  const currentRoom = run.rooms[run.currentRoomIndex];
  if (!currentRoom || !currentRoom.completed) {
    return interaction.reply({ ephemeral: true, content: '❌ You must complete the current room before proceeding.' });
  }

  // Add progress bar for room transition
  const nextRoom = run.rooms[run.currentRoomIndex + 1];
  if (nextRoom) {
    const progressEmbed = new EmbedBuilder()
      .setColor('#8E44AD')
      .setTitle('🚪 Moving to Next Room...')
      .setDescription(`Progressing to **${nextRoom.name}**...`)
      .addFields({ name: 'Progress', value: buildProgressBar(0, 20), inline: false });
    
    const progressMessage = await interaction.channel.send({ embeds: [progressEmbed] });
    
    // Animate progress bar
    let progress = 0;
    const progressInterval = setInterval(async () => {
      progress += 5;
      if (progress > 100) {
        clearInterval(progressInterval);
        await progressMessage.delete().catch(() => {});
        
        // Proceed to next room
        run.currentRoomIndex++;
        run.completedRooms.push(currentRoom);
        
        if (run.currentRoomIndex >= run.rooms.length) {
          return handleDungeonComplete(interaction, run, run.getPlayerFunc);
        }
        
        await updateRunMessage(interaction, run);
        return;
      }
      
      const updatedEmbed = new EmbedBuilder()
        .setColor('#8E44AD')
        .setTitle('🚪 Moving to Next Room...')
        .setDescription(`Progressing to **${nextRoom.name}**...`)
        .addFields({ name: 'Progress', value: buildProgressBar(progress, 20), inline: false });
      
      await progressMessage.edit({ embeds: [updatedEmbed] }).catch(() => {});
    }, 200);
    
    return interaction.reply({ ephemeral: true, content: '✅ Moving to the next room...' });
  }

  // Fallback if no next room
  run.currentRoomIndex++;
  run.completedRooms.push(currentRoom);

  if (run.currentRoomIndex >= run.rooms.length) {
    return handleDungeonComplete(interaction, run, run.getPlayerFunc);
  }

  await updateRunMessage(interaction, run);
  return interaction.reply({ ephemeral: true, content: '✅ Proceeding to the next room...' });
}

function buildProgressBar(percent, length = 20) {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.round(percent)}%`;
}

async function handleLeaveDungeon(interaction, run, userId) {
  // Remove player from run
  run.party.delete(userId);
  runModule.PLAYER_RUN_INDEX.delete(userId);

  if (run.party.size === 0) {
    // All players left, clean up run
    runModule.ACTIVE_RUNS.delete(run.id);
    if (run.messageId) {
      runModule.RUN_MESSAGE_INDEX.delete(run.messageId);
    }
  }

  return interaction.reply({ ephemeral: true, content: '✅ You have left the dungeon. Your progress has been saved.' });
}

async function handleDungeonComplete(interaction, run, getPlayerFunc) {
  run.status = 'completed';
  
  // Calculate and distribute rewards for each player (individual rewards)
  const partyArray = Array.from(run.party.values());
  const playerRewards = new Map();
  const rewardSummary = [];
  
  partyArray.forEach(player => {
    const totalXp = run.completedRooms.reduce((sum, room) => sum + (room.rewards?.xp || 0), 0);
    const totalCoins = run.completedRooms.reduce((sum, room) => sum + (room.rewards?.coins || 0), 0);
    
    // Add boss rewards if boss was defeated
    const bossRoom = run.rooms.find(r => r.type === runModule.ROOM_TYPES.BOSS && r.completed);
    let finalXp = totalXp;
    let finalCoins = totalCoins;
    const items = [];
    
    if (bossRoom && bossRoom.boss) {
      finalXp += bossRoom.boss.xp || 0;
      finalCoins += bossRoom.boss.coins || 0;
      
      // Roll boss loot
      if (bossRoom.boss.loot && Array.isArray(bossRoom.boss.loot)) {
        bossRoom.boss.loot.forEach(lootEntry => {
          if (Math.random() < (lootEntry.chance || 0.5)) {
            const quantity = Math.floor(Math.random() * ((lootEntry.max || 1) - (lootEntry.min || 1) + 1)) + (lootEntry.min || 1);
            items.push({ itemId: lootEntry.item, quantity });
          }
        });
      }
      
      // Roll boss relic
      if (bossRoom.boss.relic && Math.random() < (bossRoom.boss.relic.chance || 0.5)) {
        items.push({ itemId: bossRoom.boss.relic.item, quantity: bossRoom.boss.relic.amount || 1 });
      }
    }
    
    // Distribute rewards to actual player data
    if (getPlayerFunc) {
      const actualPlayer = getPlayerFunc(player.userId);
      if (actualPlayer) {
        // Add XP
        if (finalXp > 0) {
          const leveled = addXpToPlayer(actualPlayer, finalXp);
          if (leveled) {
            rewardSummary.push(`<@${player.userId}> leveled up to ${actualPlayer.level}!`);
          }
        }
        
        // Add coins
        if (finalCoins > 0) {
          actualPlayer.coins = (actualPlayer.coins || 0) + finalCoins;
        }
        
        // Add items
        items.forEach(itemEntry => {
          addItemToPlayer(actualPlayer, itemEntry.itemId, itemEntry.quantity);
        });
        
        // Update stats
        actualPlayer.stats = actualPlayer.stats || {};
        actualPlayer.stats.dungeonsCleared = (actualPlayer.stats.dungeonsCleared || 0) + 1;
      }
    }
    
    playerRewards.set(player.userId, {
      xp: finalXp,
      coins: finalCoins,
      items: items.map(i => `${i.itemId} x${i.quantity}`).join(', ') || 'None'
    });
  });

  // Build completion embed with requeue options
  const rewardFields = partyArray.map(p => {
    const rewards = playerRewards.get(p.userId);
    return `<@${p.userId}>: +${rewards.xp} XP | +${rewards.coins} coins${rewards.items ? ` | ${rewards.items}` : ''}`;
  });
  
  const embed = new EmbedBuilder()
    .setColor('#9B59B6')
    .setTitle('🎉 Dungeon Cleared!')
    .setDescription(`Your party successfully completed **${run.dungeonName}**!`)
    .addFields(
      { name: 'Party Rewards', value: rewardFields.join('\n') || 'No rewards', inline: false }
    );
  
  if (rewardSummary.length > 0) {
    embed.addFields({ name: 'Achievements', value: rewardSummary.join('\n'), inline: false });
  }
  
  embed.setFooter({ text: 'Choose to leave or requeue for another run.' });

  // Add requeue system
  run.requeueChoices = new Map(); // userId -> 'leave' | 'requeue' | null
  run.requeueEndTime = Date.now() + 30000; // 30 seconds
  run.getPlayerFunc = getPlayerFunc; // Store for later use
  run.requeueTimer = setTimeout(() => {
    processRequeueChoices(run, getPlayerFunc);
  }, 30000);

  // Build requeue buttons
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`dungeon|requeue|${run.id}`)
        .setLabel('🔄 Requeue')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`dungeon|leave_complete|${run.id}`)
        .setLabel('🚪 Leave')
        .setStyle(ButtonStyle.Danger)
    )
  ];

  await updateRunMessage(interaction, run, embed, components);
  return interaction.reply({ ephemeral: true, content: '🎉 Dungeon completed! Choose to leave or requeue for another run.' });
}

async function processRequeueChoices(run, getPlayerFunc) {
  const requeuePlayers = [];
  const leavePlayers = [];
  
  run.requeueChoices.forEach((choice, userId) => {
    if (choice === 'requeue') {
      requeuePlayers.push(userId);
    } else {
      leavePlayers.push(userId);
    }
  });
  
  // Anyone who didn't choose is kicked out
  run.party.forEach((player, userId) => {
    if (!run.requeueChoices.has(userId)) {
      leavePlayers.push(userId);
    }
  });
  
  // Clean up current run
  run.party.forEach(p => {
    runModule.PLAYER_RUN_INDEX.delete(p.userId);
  });
  runModule.ACTIVE_RUNS.delete(run.id);
  if (run.messageId) {
    runModule.RUN_MESSAGE_INDEX.delete(run.messageId);
  }
  
  // If at least 1 player wants to requeue, start a new run
  if (requeuePlayers.length > 0) {
    const queueModule = require('./index');
    const newQueueId = queueModule.buildQueueId(run.guildId || 'global', run.dungeonId);
    
    // Create new queue with requeue players
    const newQueue = {
      id: newQueueId,
      guildId: run.guildId || 'global',
      channelId: run.channelId,
      dungeon: run.dungeon,
      createdAt: Date.now(),
      players: new Map()
    };
    
    requeuePlayers.forEach(userId => {
      const player = getPlayerFunc(userId);
      if (player) {
        newQueue.players.set(userId, {
          userId,
          username: player.username || `Player ${userId}`,
          joinedAt: Date.now()
        });
        queueModule.PLAYER_QUEUE_INDEX.set(userId, newQueueId);
      }
    });
    
    queueModule.QUEUE_REGISTRY.set(newQueueId, newQueue);
    
    // If queue is full, launch immediately
    if (newQueue.players.size >= queueModule.MAX_PARTY_SIZE) {
      // Launch will be handled by the main bot
    }
  }
}

async function handleRequeueChoice(interaction, run, choice, getPlayerFunc) {
  const userId = interaction.user.id;
  if (!run.party.has(userId)) {
    return interaction.reply({ ephemeral: true, content: '❌ You are not part of this dungeon run.' });
  }
  
  run.requeueChoices.set(userId, choice);
  run.getPlayerFunc = getPlayerFunc; // Store for later use
  
  const choiceText = choice === 'requeue' ? '🔄 Requeue' : '🚪 Leave';
  const remaining = Math.ceil((run.requeueEndTime - Date.now()) / 1000);
  
  // Check if all players have chosen
  const allChosen = Array.from(run.party.keys()).every(id => run.requeueChoices.has(id));
  
  if (allChosen && getPlayerFunc) {
    // Process immediately
    clearTimeout(run.requeueTimer);
    await processRequeueChoices(run, getPlayerFunc);
    return interaction.reply({ ephemeral: true, content: `✅ You chose to ${choiceText}. Processing choices...` });
  }
  
  return interaction.reply({ ephemeral: true, content: `✅ You chose to ${choiceText}. Waiting for other players... (${remaining}s remaining)` });
}

async function updateRunMessage(interaction, run, customEmbed = null, customComponents = null) {
  if (!run || !run.messageId) return;

  try {
    const channel = interaction?.channel || (interaction?.client ? await interaction.client.channels.fetch(run.channelId) : null);
    if (!channel) return;
    
    const message = await channel.messages.fetch(run.messageId);
    
    const embed = customEmbed || runModule.buildRunEmbed(run);
    const components = customComponents || (run.status === 'completed' ? [] : runModule.buildRoomActionComponents(run));
    
    await message.edit({ embeds: [embed], components });
  } catch (error) {
    console.error('[DUNGEON] Failed to update run message:', error.message);
  }
}

// Launch a dungeon run from a full queue
async function launchDungeonFromQueue(queue, getPlayerFunc, options = {}) {
  const partyMembers = Array.from(queue.players.values()).map(entry => {
    const player = getPlayerFunc(entry.userId);
    return {
      userId: entry.userId,
      username: entry.username,
      level: player?.level || 1,
      hp: player?.hp || player?.maxHp || 100,
      maxHp: player?.maxHp || 100,
      mana: player?.mana || player?.maxMana || 50,
      maxMana: player?.maxMana || 50
    };
  });

  const run = runModule.generateDungeonRun(queue.dungeon, partyMembers, {
    channelId: queue.channelId
  });

  if (!run) {
    return { error: 'Failed to generate dungeon run.' };
  }

  // Clean up queue
  partyMembers.forEach(p => {
    queueModule.PLAYER_QUEUE_INDEX.delete(p.userId);
  });
  queueModule.QUEUE_REGISTRY.delete(queue.id);

  return { run };
}

module.exports = {
  handleDungeonButton,
  launchDungeonFromQueue,
  queuePlayer: queueModule.queuePlayer,
  leaveQueue: queueModule.leaveQueue,
  getQueueStatus: queueModule.getQueueStatus,
  setPlayerHelpers
};

