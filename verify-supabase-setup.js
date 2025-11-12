// Quick Supabase Setup Verification Script
// This script checks if your Supabase is properly configured and shows what data is being saved
// Usage: node verify-supabase-setup.js

require('dotenv').config();
const db = require('./database');

async function verifySetup() {
  console.log('🔍 Supabase Setup Verification\n');
  console.log('='.repeat(60));
  
  // Step 1: Check environment variables
  console.log('\n1. Checking Environment Variables...');
  console.log('-'.repeat(60));
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl) {
    console.log('❌ SUPABASE_URL is not set');
    console.log('💡 Set it in your .env file or environment variables');
    console.log('   Example: SUPABASE_URL=https://bvefifufanahnjnbkjhb.supabase.co');
    return;
  } else {
    console.log(`✅ SUPABASE_URL is set: ${supabaseUrl}`);
  }
  
  if (!supabaseKey) {
    console.log('❌ SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) is not set');
    console.log('💡 Set it in your .env file or environment variables');
    console.log('   Get it from: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api');
    return;
  } else {
    const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : 'ANON';
    console.log(`✅ Supabase key is set (${keyType})`);
    if (keyType === 'ANON') {
      console.log('⚠️  Using ANON key - make sure RLS policies allow access');
    }
  }
  
  // Step 2: Initialize Supabase
  console.log('\n2. Initializing Supabase...');
  console.log('-'.repeat(60));
  db.initSupabase();
  
  if (!db.isSupabaseEnabled()) {
    console.log('❌ Supabase is not enabled');
    console.log('💡 Check your environment variables');
    return;
  }
  console.log('✅ Supabase is enabled');
  
  // Step 3: Test connection
  console.log('\n3. Testing Connection...');
  console.log('-'.repeat(60));
  const connectionOk = await db.testConnection();
  
  if (!connectionOk) {
    console.log('❌ Connection test failed');
    console.log('💡 Check the error messages above for details');
    console.log('💡 Common issues:');
    console.log('   - Table does not exist → Run supabase_schema.sql in SQL Editor');
    console.log('   - RLS policy violation → Use service role key or create policies');
    console.log('   - Invalid credentials → Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  console.log('✅ Connection test passed');
  
  // Step 4: Check player count
  console.log('\n4. Checking Player Data...');
  console.log('-'.repeat(60));
  const count = await db.getPlayerCount();
  console.log(`✅ Total players in Supabase: ${count}`);
  
  if (count === 0) {
    console.log('💡 No players found - this is normal if no one has used the bot yet');
    console.log('💡 Once players start using the bot, their data will be saved here');
    return;
  }
  
  // Step 5: Load sample data
  console.log('\n5. Loading Sample Player Data...');
  console.log('-'.repeat(60));
  const allData = await db.loadAllPlayerData();
  console.log(`✅ Loaded ${allData.size} players`);
  
  if (allData.size > 0) {
    const firstUserId = Array.from(allData.keys())[0];
    const firstPlayer = allData.get(firstUserId);
    
    console.log(`\n📊 Sample Player: ${firstUserId}`);
    console.log('-'.repeat(60));
    
    // Check all important fields
    const checks = [
      { name: 'Level', value: firstPlayer.level, expected: 'number' },
      { name: 'XP', value: firstPlayer.xp, expected: 'number' },
      { name: 'Coins', value: firstPlayer.coins, expected: 'number' },
      { name: 'Inventory', value: firstPlayer.inventory, expected: 'object' },
      { name: 'Equipment', value: firstPlayer.equipped, expected: 'object' },
      { name: 'Quests', value: firstPlayer.quests, expected: 'array' },
      { name: 'Achievements', value: firstPlayer.achievements, expected: 'object' },
      { name: 'Codex', value: firstPlayer.codex, expected: 'object' },
      { name: 'Exploration', value: firstPlayer.exploration, expected: 'object' },
      { name: 'Bases', value: firstPlayer.bases, expected: 'object' },
      { name: 'Settlements', value: firstPlayer.settlements, expected: 'object' },
      { name: 'Unlocked Zones', value: firstPlayer.exploration?.unlockedZones, expected: 'array' },
      { name: 'Discovered Biomes', value: firstPlayer.exploration?.discoveredBiomes, expected: 'array' },
      { name: 'Base Bonuses', value: firstPlayer.baseBonuses, expected: 'object' },
      { name: 'Gathering Gear', value: firstPlayer.gatheringGear, expected: 'object' },
      { name: 'Settings', value: firstPlayer.settings, expected: 'object' },
      { name: 'Tutorials', value: firstPlayer.tutorials, expected: 'object' }
    ];
    
    let allGood = true;
    checks.forEach(({ name, value, expected }) => {
      const type = Array.isArray(value) ? 'array' : typeof value;
      const match = type === expected || (expected === 'object' && (type === 'object' && value !== null));
      const icon = match ? '✅' : '❌';
      const status = match ? 'OK' : `Expected ${expected}, got ${type}`;
      console.log(`${icon} ${name}: ${status}`);
      if (!match) allGood = false;
    });
    
    // Check specific values
    console.log(`\n📈 Player Stats:`);
    console.log(`   Level: ${firstPlayer.level || 'N/A'}`);
    console.log(`   XP: ${firstPlayer.xp || 'N/A'}`);
    console.log(`   Coins: ${firstPlayer.coins || 'N/A'}`);
    
    if (firstPlayer.exploration?.unlockedZones) {
      console.log(`   Unlocked Zones: [${firstPlayer.exploration.unlockedZones.join(', ')}]`);
    } else {
      console.log(`   Unlocked Zones: None (default: zone_1 should be unlocked)`);
    }
    
    if (firstPlayer.exploration?.discoveredBiomes) {
      console.log(`   Discovered Biomes: ${firstPlayer.exploration.discoveredBiomes.length} biomes`);
    }
    
    if (firstPlayer.achievements?.claimed) {
      console.log(`   Achievements Claimed: ${firstPlayer.achievements.claimed.length}`);
    }
    
    if (firstPlayer.bases && Object.keys(firstPlayer.bases).length > 0) {
      console.log(`   Bases: ${Object.keys(firstPlayer.bases).length} bases`);
    }
    
    if (firstPlayer.settlements && Object.keys(firstPlayer.settlements).length > 0) {
      console.log(`   Settlements: ${Object.keys(firstPlayer.settlements).length} settlements`);
    }
    
    // Check data size
    const dataSize = JSON.stringify(firstPlayer).length;
    const dataSizeKB = (dataSize / 1024).toFixed(2);
    console.log(`\n💾 Data Size: ${dataSizeKB} KB`);
    
    if (allGood) {
      console.log('\n✅ All fields are present and correctly typed!');
    } else {
      console.log('\n⚠️  Some fields are missing or have wrong types');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Verification complete!');
  console.log('\n💡 Next steps:');
  console.log('   1. Check Supabase dashboard: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb');
  console.log('   2. Go to Table Editor → player_data to view your data');
  console.log('   3. Use SQL Editor to run queries (see VERIFY_SUPABASE_DATA.md)');
  console.log('   4. Monitor updated_at timestamps to see when data is saved');
}

verifySetup().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});

