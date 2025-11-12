// Supabase Health Check Script
// Run this to verify Supabase is properly handling your data
// Usage: node test-supabase.js

require('dotenv').config();
const db = require('./database');

async function healthCheck() {
  console.log('🔍 Supabase Health Check\n');
  console.log('='.repeat(50));
  
  // Initialize Supabase
  console.log('\n1. Initializing Supabase...');
  db.initSupabase();
  
  // Check if enabled
  if (!db.isSupabaseEnabled()) {
    console.log('❌ Supabase is not enabled');
    console.log('💡 Make sure you have set:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
    console.log('   in your .env file');
    return;
  }
  
  console.log('✅ Supabase is enabled\n');
  
  // Test connection
  console.log('2. Testing connection...');
  const connectionOk = await db.testConnection();
  if (!connectionOk) {
    console.log('❌ Connection test failed');
    console.log('💡 Check your Supabase credentials and make sure the tables exist');
    return;
  }
  console.log('✅ Connection test passed\n');
  
  // Get player count
  console.log('3. Getting player count...');
  const count = await db.getPlayerCount();
  console.log(`✅ Total players in Supabase: ${count}\n`);
  
  if (count === 0) {
    console.log('⚠️  No players found in Supabase');
    console.log('💡 This is normal if no players have used the bot yet');
    return;
  }
  
  // Load sample data
  console.log('4. Loading sample player data...');
  const allData = await db.loadAllPlayerData();
  console.log(`✅ Loaded ${allData.size} players from Supabase\n`);
  
  if (allData.size > 0) {
    const firstUserId = Array.from(allData.keys())[0];
    const firstPlayer = allData.get(firstUserId);
    
    console.log('5. Sample Player Data:');
    console.log('='.repeat(50));
    console.log(`User ID: ${firstUserId}`);
    console.log(`Level: ${firstPlayer.level || 'N/A'}`);
    console.log(`XP: ${firstPlayer.xp || 'N/A'}`);
    console.log(`Coins: ${firstPlayer.coins || 'N/A'}`);
    console.log(`HP: ${firstPlayer.hp || 'N/A'}/${firstPlayer.maxHp || 'N/A'}`);
    console.log(`Mana: ${firstPlayer.mana || 'N/A'}/${firstPlayer.maxMana || 'N/A'}`);
    console.log('');
    
    // Check bases
    const bases = firstPlayer.bases || {};
    const baseCount = Object.keys(bases).length;
    console.log(`Bases: ${baseCount}`);
    if (baseCount > 0) {
      Object.keys(bases).slice(0, 3).forEach(baseId => {
        const base = bases[baseId];
        console.log(`  - ${baseId}: Rank ${base.rank || 'N/A'}, ${Object.keys(base.storage || {}).length} items in storage`);
      });
    }
    console.log('');
    
    // Check settlements
    const settlements = firstPlayer.settlements || {};
    const settlementCount = Object.keys(settlements).length;
    console.log(`Settlements: ${settlementCount}`);
    if (settlementCount > 0) {
      Object.keys(settlements).slice(0, 3).forEach(settlementId => {
        const settlement = settlements[settlementId];
        console.log(`  - ${settlementId}: Prestige ${settlement.prestige || 0}, ${settlement.expeditions?.length || 0} expeditions`);
      });
    }
    console.log('');
    
    // Check exploration
    const exploration = firstPlayer.exploration || {};
    console.log('Exploration:');
    console.log(`  - Current biome: ${exploration.currentBiome || 'N/A'}`);
    console.log(`  - Unlocked zones: ${exploration.unlockedZones ? exploration.unlockedZones.join(', ') : 'None'}`);
    console.log(`  - Discovered biomes: ${exploration.discoveredBiomes ? exploration.discoveredBiomes.length : 0}`);
    if (exploration.unlockedZones && exploration.unlockedZones.length > 0) {
      console.log(`    Zones: [${exploration.unlockedZones.join(', ')}]`);
    }
    if (exploration.discoveredBiomes && exploration.discoveredBiomes.length > 0) {
      console.log(`    Biomes: ${exploration.discoveredBiomes.slice(0, 5).join(', ')}${exploration.discoveredBiomes.length > 5 ? '...' : ''}`);
    }
    console.log('');
    
    // Check achievements
    const achievements = firstPlayer.achievements || {};
    console.log('Achievements:');
    console.log(`  - Claimed: ${achievements.claimed ? achievements.claimed.length : 0}`);
    console.log(`  - Notified: ${achievements.notified ? achievements.notified.length : 0}`);
    if (achievements.claimed && achievements.claimed.length > 0) {
      console.log(`    Claimed: [${achievements.claimed.slice(0, 5).join(', ')}${achievements.claimed.length > 5 ? '...' : ''}]`);
    }
    console.log('');
    
    // Check codex
    const codex = firstPlayer.codex || {};
    console.log('Codex:');
    console.log(`  - Factions: ${codex.factions ? codex.factions.length : 0}`);
    console.log(`  - Biomes: ${codex.biomes ? codex.biomes.length : 0}`);
    console.log(`  - Enemies: ${codex.enemies ? codex.enemies.length : 0}`);
    console.log(`  - Items: ${codex.items ? codex.items.length : 0}`);
    console.log(`  - Dungeons: ${codex.dungeons ? codex.dungeons.length : 0}`);
    console.log(`  - Structures: ${codex.structures ? codex.structures.length : 0}`);
    console.log(`  - Settlements: ${codex.settlements ? codex.settlements.length : 0}`);
    console.log('');
    
    // Check other game systems
    console.log('Game Systems:');
    console.log(`  - Pets owned: ${firstPlayer.pets?.owned ? firstPlayer.pets.owned.length : 0}`);
    console.log(`  - Spells known: ${firstPlayer.spells?.known ? firstPlayer.spells.known.length : 0}`);
    console.log(`  - Active quests: ${firstPlayer.quests ? firstPlayer.quests.length : 0}`);
    console.log(`  - Completed quests: ${firstPlayer.completedQuests ? firstPlayer.completedQuests.length : 0}`);
    console.log(`  - Contracts: ${firstPlayer.contracts ? Object.keys(firstPlayer.contracts).length : 0}`);
    console.log(`  - Active buffs: ${firstPlayer.activeBuffs ? Object.keys(firstPlayer.activeBuffs).length : 0}`);
    console.log('');
    
    // Verify data completeness
    console.log('6. Data Completeness Check:');
    console.log('='.repeat(50));
    const requiredFields = [
      'level', 'xp', 'hp', 'maxHp', 'mana', 'maxMana', 'coins',
      'inventory', 'equipped', 'quests', 'completedQuests', 'questProgress',
      'achievements', 'attributes', 'stats', 'codex', 'reputation',
      'activeBuffs', 'contracts', 'cosmetics', 'pets', 'spells',
      'skillTree', 'adventureMode', 'dailyChallenges', 'pvp',
      'worldBosses', 'worldEvents', 'exploration', 'bases', 'settlements',
      'travelHistory', 'baseBonuses', 'gatheringGear', 'settings', 'tutorials'
    ];
    
    const missingFields = requiredFields.filter(field => !(field in firstPlayer));
    if (missingFields.length === 0) {
      console.log('✅ All required fields are present');
    } else {
      console.log(`⚠️  Missing fields: ${missingFields.join(', ')}`);
    }
    
    // Check nested structures
    console.log('\n7. Nested Structure Check:');
    console.log('='.repeat(50));
    
    const checks = [
      { name: 'Exploration has unlockedZones', check: exploration.unlockedZones && Array.isArray(exploration.unlockedZones) },
      { name: 'Exploration has discoveredBiomes', check: exploration.discoveredBiomes && Array.isArray(exploration.discoveredBiomes) },
      { name: 'Achievements has claimed array', check: achievements.claimed && Array.isArray(achievements.claimed) },
      { name: 'Achievements has notified array', check: achievements.notified && Array.isArray(achievements.notified) },
      { name: 'Codex has all categories', check: codex.factions && codex.biomes && codex.enemies && codex.items && codex.dungeons && codex.structures && codex.settlements },
      { name: 'Bases structure is object', check: typeof bases === 'object' },
      { name: 'Settlements structure is object', check: typeof settlements === 'object' },
      { name: 'BaseBonuses exists', check: firstPlayer.baseBonuses && typeof firstPlayer.baseBonuses === 'object' },
      { name: 'GatheringGear exists', check: firstPlayer.gatheringGear && typeof firstPlayer.gatheringGear === 'object' },
      { name: 'Settings exists', check: firstPlayer.settings && typeof firstPlayer.settings === 'object' }
    ];
    
    checks.forEach(({ name, check }) => {
      console.log(`${check ? '✅' : '❌'} ${name}`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Health check complete!');
  console.log('\n💡 To view data in Supabase dashboard:');
  console.log('   1. Go to https://supabase.com');
  console.log('   2. Open your project');
  console.log('   3. Click "Table Editor" → "player_data"');
  console.log('   4. Click on any row to view the complete player data');
  console.log('\n💡 To query data using SQL:');
  console.log('   1. Click "SQL Editor" in Supabase dashboard');
  console.log('   2. Run queries from VERIFY_SUPABASE_DATA.md');
}

// Run health check
healthCheck().catch(error => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});

