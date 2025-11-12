// Debug Supabase Save Issues
// This script will test saving data to Supabase and show detailed error information
// Usage: node debug-supabase-save.js

require('dotenv').config();
const db = require('./database');

async function debugSave() {
  console.log('🔍 Debugging Supabase Save Issues\n');
  console.log('='.repeat(70));
  
  // Step 1: Check environment variables
  console.log('\n1. Environment Variables:');
  console.log('-'.repeat(70));
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  console.log(`SUPABASE_URL: ${supabaseUrl ? '✅ Set' : '❌ Not set'}`);
  if (supabaseUrl) {
    console.log(`   Value: ${supabaseUrl}`);
    // Verify URL format
    if (!supabaseUrl.includes('supabase.co')) {
      console.log('   ⚠️  Warning: URL should end with .supabase.co');
    }
  }
  
  console.log(`Supabase Key: ${supabaseKey ? '✅ Set' : '❌ Not set'}`);
  if (supabaseKey) {
    const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON';
    console.log(`   Type: ${keyType}`);
    console.log(`   Length: ${supabaseKey.length} characters`);
    if (keyType === 'ANON') {
      console.log('   ⚠️  Using ANON key - RLS policies must allow access');
    }
  }
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('\n❌ Missing environment variables. Cannot continue.');
    return;
  }
  
  // Step 2: Initialize Supabase
  console.log('\n2. Initializing Supabase...');
  console.log('-'.repeat(70));
  const initialized = db.initSupabase();
  console.log(`Initialization: ${initialized ? '✅ Success' : '❌ Failed'}`);
  
  if (!db.isSupabaseEnabled()) {
    console.log('❌ Supabase is not enabled. Check your credentials.');
    return;
  }
  
  // Step 3: Test connection
  console.log('\n3. Testing Connection...');
  console.log('-'.repeat(70));
  try {
    const connectionOk = await db.testConnection();
    console.log(`Connection test: ${connectionOk ? '✅ Passed' : '❌ Failed'}`);
    
    if (!connectionOk) {
      console.log('\n❌ Connection test failed. Check the error messages above.');
      return;
    }
  } catch (error) {
    console.log('❌ Connection test threw an exception:');
    console.error(error);
    return;
  }
  
  // Step 4: Create test player data
  console.log('\n4. Creating Test Player Data...');
  console.log('-'.repeat(70));
  const testUserId = '999999999999999999'; // Test user ID
  const testPlayerData = {
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    mana: 50,
    maxMana: 50,
    coins: 100,
    inventory: { 'wooden_sword': 1, 'health_potion': 2 },
    equipped: {
      weapon: 'wooden_sword',
      helmet: null,
      chestplate: null,
      leggings: null,
      boots: null,
      accessories: [],
      tool: 'rusty_multi_tool'
    },
    quests: [],
    completedQuests: [],
    questProgress: {},
    tutorialStarted: false,
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
    codex: {
      factions: [],
      biomes: [],
      enemies: [],
      items: [],
      dungeons: [],
      structures: [],
      settlements: []
    },
    reputation: {},
    activeBuffs: {},
    contracts: {},
    cosmetics: { titles: { owned: [], equipped: null } },
    pets: {
      owned: [],
      active: null,
      stabled: [],
      taskQueue: []
    },
    spells: {
      known: [],
      equipped: [],
      cooldowns: {}
    },
    skillTree: {
      class: null,
      branches: {},
      totalPoints: 0
    },
    adventureMode: {
      currentChapter: null,
      currentSection: null,
      progress: {},
      choices: []
    },
    dailyChallenges: {
      active: [],
      completed: [],
      streak: 0,
      lastReset: null
    },
    pvp: {
      rating: 1000,
      wins: 0,
      losses: 0,
      streak: 0,
      rank: "unranked"
    },
    worldBosses: {
      participated: [],
      lastDamage: {},
      rewards: []
    },
    worldEvents: {
      active: [],
      participation: {},
      rewards: []
    },
    exploration: {
      currentBiome: 'emerald_grove',
      targetBiome: null,
      status: 'idle',
      action: null,
      discoveredBiomes: ['emerald_grove'],
      lastTick: Date.now(),
      unlockedZones: ['zone_1'],
      gathering: null,
      consecutiveActionsSinceCombat: 0,
      lastCombatAt: 0,
      pendingChain: null
    },
    bases: {},
    settlements: {},
    travelHistory: [],
    baseBonuses: {
      contractRewardBonus: 0,
      settlementWealthBonus: 0,
      settlementDefenseBonus: 0,
      brewSuccessBonus: 0
    },
    gatheringGear: {
      current: {},
      unlocked: {}
    },
    settings: {
      gatherNotifications: true
    },
    tutorials: {
      gathering: {
        intro: false,
        completionHint: false
      },
      onboarding: null
    }
  };
  
  // Check data size
  const dataSize = JSON.stringify(testPlayerData).length;
  const dataSizeKB = (dataSize / 1024).toFixed(2);
  console.log(`Test data size: ${dataSizeKB} KB`);
  console.log(`Test data JSON valid: ${JSON.stringify(testPlayerData) ? '✅ Yes' : '❌ No'}`);
  
  // Step 5: Try to save test data
  console.log('\n5. Testing Save Operation...');
  console.log('-'.repeat(70));
  console.log(`Attempting to save test player data for user: ${testUserId}`);
  
  try {
    const result = await db.savePlayerData(testUserId, testPlayerData);
    
    if (result.success) {
      console.log('✅ Save test PASSED!');
      console.log('   Data was successfully saved to Supabase');
    } else {
      console.log('❌ Save test FAILED!');
      console.log(`   Error: ${result.error || 'Unknown error'}`);
      if (result.errorDetails) {
        console.log('   Error Details:', JSON.stringify(result.errorDetails, null, 2));
      }
    }
  } catch (error) {
    console.log('❌ Save test threw an exception:');
    console.error('   Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  // Step 6: Try to load the test data
  console.log('\n6. Testing Load Operation...');
  console.log('-'.repeat(70));
  try {
    const loadedData = await db.loadPlayerData(testUserId);
    if (loadedData) {
      console.log('✅ Load test PASSED!');
      console.log(`   Loaded data for user: ${testUserId}`);
      console.log(`   Level: ${loadedData.level}`);
      console.log(`   Coins: ${loadedData.coins}`);
      console.log(`   Unlocked Zones: ${loadedData.exploration?.unlockedZones?.join(', ') || 'None'}`);
    } else {
      console.log('❌ Load test FAILED!');
      console.log('   No data returned (might not have been saved)');
    }
  } catch (error) {
    console.log('❌ Load test threw an exception:');
    console.error('   Error:', error);
  }
  
  // Step 7: Try to load all data
  console.log('\n7. Testing Load All Operation...');
  console.log('-'.repeat(70));
  try {
    const allData = await db.loadAllPlayerData();
    console.log(`✅ Loaded ${allData.size} players from Supabase`);
    if (allData.size > 0) {
      console.log('   Sample user IDs:', Array.from(allData.keys()).slice(0, 5).join(', '));
    }
  } catch (error) {
    console.log('❌ Load all test threw an exception:');
    console.error('   Error:', error);
  }
  
  // Step 8: Direct Supabase test
  console.log('\n8. Direct Supabase Client Test...');
  console.log('-'.repeat(70));
  try {
    const { createClient } = require('@supabase/supabase-js');
    const directClient = createClient(supabaseUrl, supabaseKey);
    
    // Try a simple query
    const { data, error } = await directClient
      .from('player_data')
      .select('user_id')
      .limit(1);
    
    if (error) {
      console.log('❌ Direct client test FAILED:');
      console.log('   Error:', error);
      console.log('   Message:', error.message);
      console.log('   Code:', error.code);
      console.log('   Details:', error.details);
      console.log('   Hint:', error.hint);
    } else {
      console.log('✅ Direct client test PASSED!');
      console.log(`   Retrieved ${data ? data.length : 0} rows`);
    }
    
    // Try to insert test data directly
    console.log('\n9. Direct Insert Test...');
    console.log('-'.repeat(70));
    const testUserId2 = '888888888888888888';
    const { data: insertData, error: insertError } = await directClient
      .from('player_data')
      .upsert({
        user_id: testUserId2,
        data: { test: true, level: 1 },
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (insertError) {
      console.log('❌ Direct insert test FAILED:');
      console.log('   Error:', insertError);
      console.log('   Message:', insertError.message);
      console.log('   Code:', insertError.code);
      console.log('   Details:', insertError.details);
      console.log('   Hint:', insertError.hint);
      console.log('   Full error object:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('✅ Direct insert test PASSED!');
      console.log('   Data inserted successfully');
    }
  } catch (error) {
    console.log('❌ Direct client test threw an exception:');
    console.error('   Error:', error);
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Debug complete!');
  console.log('\n💡 Check the output above to see what\'s failing.');
  console.log('💡 Common issues:');
  console.log('   - RLS policy blocking → Use service role key or create policies');
  console.log('   - Table doesn\'t exist → Run supabase_schema.sql');
  console.log('   - Invalid credentials → Check SUPABASE_URL and key');
  console.log('   - Data too large → Check data size (should be < 1MB)');
}

debugSave().catch(error => {
  console.error('❌ Debug script failed:', error);
  process.exit(1);
});

