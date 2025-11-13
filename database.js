// Supabase Database Module for Hytale Discord Bot
// This module handles all database operations using Supabase

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
let supabase = null;
let useSupabase = false;

// Initialize Supabase connection
function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Prefer service role key over anon key (service role bypasses RLS)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE' : (process.env.SUPABASE_ANON_KEY ? 'ANON' : 'NONE');
  
  console.log('🔌 Initializing Supabase...');
  console.log(`   URL: ${supabaseUrl ? '✅ Set' : '❌ Not set'}`);
  console.log(`   Key: ${keyType} ${supabaseKey ? '(✅ Set)' : '(❌ Not set)'}`);
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase credentials not found. Using file-based storage as fallback.');
    console.log('💡 To use Supabase, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment variables.');
    console.log('💡 Get your credentials from: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api');
    useSupabase = false;
    return false;
  }
  
  // Validate URL format
  if (supabaseUrl.startsWith('postgresql://') || supabaseUrl.startsWith('postgres://')) {
    console.error('❌ ERROR: You are using a PostgreSQL connection string, but the bot needs the Supabase HTTPS API URL!');
    console.error(`   Current URL: ${supabaseUrl.substring(0, 50)}... (PostgreSQL connection string)`);
    console.error(`   ❌ Wrong: postgresql://postgres:[PASSWORD]@db.bvefifufanahnjnbkjhb.supabase.co:5432/postgres`);
    console.error(`   ✅ Correct: https://bvefifufanahnjnbkjhb.supabase.co`);
    console.error('');
    console.error('💡 How to fix:');
    console.error('   1. Go to: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api');
    console.error('   2. Copy the "Project URL" (not the connection string)');
    console.error('   3. It should look like: https://bvefifufanahnjnbkjhb.supabase.co');
    console.error('   4. Set this as SUPABASE_URL in Railway');
    console.error('');
    console.error('📝 Note: The PostgreSQL connection string is for direct database connections.');
    console.error('   The bot uses the Supabase JavaScript client, which needs the HTTPS API URL.');
    useSupabase = false;
    return false;
  }
  
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('supabase.co')) {
    console.error('❌ ERROR: SUPABASE_URL must be an HTTPS URL ending with .supabase.co');
    console.error(`   Current URL: ${supabaseUrl}`);
    console.error(`   Expected format: https://bvefifufanahnjnbkjhb.supabase.co`);
    console.error('');
    console.error('💡 Get the correct URL from:');
    console.error('   https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api');
    console.error('   Copy the "Project URL" field');
    useSupabase = false;
    return false;
  }
  
  if (keyType === 'ANON') {
    console.warn('⚠️  Warning: Using ANON key. Make sure RLS policies allow access, or use SERVICE_ROLE key.');
  }
  
  try {
    // Use service role key if available (for server-side operations), otherwise use anon key
    supabase = createClient(supabaseUrl, supabaseKey);
    useSupabase = true;
    console.log(`✅ Supabase client initialized successfully (using ${keyType} key)`);
    return true;
  } catch (error) {
    console.error('❌ Error initializing Supabase:', {
      message: error.message || 'No error message',
      stack: error.stack || 'No stack trace',
      error: error
    });
    useSupabase = false;
    return false;
  }
}

// Test database connection
async function testConnection() {
  if (!useSupabase) return false;
  
  try {
    // Try to select from player_data table to test connection and table existence
    const { data: playerData, error: playerError } = await supabase
      .from('player_data')
      .select('user_id')
      .limit(1);
    
    // Try to select from guild_data table to test connection and table existence
    const { data: guildData, error: guildError } = await supabase
      .from('guild_data')
      .select('guild_id')
      .limit(1);
    
    if (playerError && guildError) {
      console.error('❌ Supabase connection test failed');
      console.error('Player data error:', {
        message: playerError.message || 'No error message',
        code: playerError.code || 'No error code',
        details: playerError.details || 'No error details',
        hint: playerError.hint || 'No error hint'
      });
      console.error('💡 Make sure you have:');
      console.error('   1. Created the player_data and guild_data tables in your Supabase database');
      console.error('   2. Run the SQL schema from supabase_schema.sql in Supabase SQL Editor');
      console.error('   3. Set proper RLS policies (or use service role key)');
      console.error('   4. Check your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct');
      return false;
    }
    
    // Log warnings for missing tables but don't fail if at least one works
    if (playerError) {
      console.warn('⚠️  player_data table error:', {
        message: playerError.message || 'No error message',
        code: playerError.code || 'No error code',
        hint: playerError.hint || 'No error hint'
      });
      console.warn('💡 Run the SQL schema from supabase_schema.sql to create the table');
    }
    if (guildError) {
      console.warn('⚠️  guild_data table error:', {
        message: guildError.message || 'No error message',
        code: guildError.code || 'No error code'
      });
    }
    
    if (!playerError) {
      console.log('✅ Supabase connection test successful - player_data table accessible');
    }
    return !playerError; // Return true only if player_data table is accessible
  } catch (error) {
    console.error('❌ Error testing Supabase connection:', {
      message: error.message || 'No error message',
      stack: error.stack || 'No stack trace',
      error: error
    });
    return false;
  }
}

// Save player data to Supabase
async function savePlayerData(userId, playerData) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
    // Calculate data size for debugging
    const dataSize = JSON.stringify(playerData).length;
    const dataSizeKB = (dataSize / 1024).toFixed(2);
    
    if (dataSize > 1024 * 1024) {
      console.warn(`⚠️  Large player data for ${userId}: ${dataSizeKB} KB (may cause issues)`);
    }
    
    const { data, error } = await supabase
      .from('player_data')
      .upsert({
        user_id: userId,
        data: playerData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      // Log full error details for debugging
      console.error(`❌ Error saving player data for ${userId}:`, {
        message: error.message || 'No error message',
        details: error.details || 'No error details',
        hint: error.hint || 'No error hint',
        code: error.code || 'No error code',
        error: error
      });
      
      // Provide helpful error messages
      let errorMessage = error.message || 'Unknown error';
      if (error.code === 'PGRST301') {
        errorMessage = 'Table does not exist. Run the SQL schema from supabase_schema.sql';
      } else if (error.code === '42501') {
        errorMessage = 'Permission denied. Check RLS policies or use service role key';
      } else if (error.code === '23505') {
        errorMessage = 'Duplicate key violation (this should not happen with upsert)';
      } else if (error.message && error.message.includes('row-level security')) {
        errorMessage = 'Row-level security policy violation. Check RLS policies';
      } else if (error.message && error.message.includes('does not exist')) {
        errorMessage = 'Table does not exist. Run the SQL schema from supabase_schema.sql';
      }
      
      return { success: false, error: errorMessage, errorDetails: error };
    }
    
    console.log(`✅ Successfully saved player data for ${userId} (${dataSizeKB} KB)`);
    return { success: true, data };
  } catch (error) {
    // Log full exception details
    console.error(`❌ Exception saving player data for ${userId}:`, {
      message: error.message || 'No error message',
      stack: error.stack || 'No stack trace',
      error: error
    });
    
    return { success: false, error: error.message || 'Unknown exception', errorDetails: error };
  }
}

// Load player data from Supabase
async function loadPlayerData(userId) {
  if (!useSupabase || !supabase) {
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('player_data')
      .select('data')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - player doesn't exist yet
        return null;
      }
      console.error(`❌ Error loading player data for ${userId}:`, error.message);
      return null;
    }
    
    return data?.data || null;
  } catch (error) {
    console.error(`❌ Exception loading player data for ${userId}:`, error.message);
    return null;
  }
}

// Load all player data from Supabase
async function loadAllPlayerData() {
  if (!useSupabase || !supabase) {
    return new Map();
  }
  
  try {
    const { data, error } = await supabase
      .from('player_data')
      .select('user_id, data');
    
    if (error) {
      console.error('❌ Error loading all player data:', error.message);
      return new Map();
    }
    
    const playerDataMap = new Map();
    if (data && Array.isArray(data)) {
      data.forEach(row => {
        if (row.user_id && row.data) {
          playerDataMap.set(row.user_id, row.data);
        }
      });
    }
    
    console.log(`✅ Loaded ${playerDataMap.size} player records from Supabase`);
    return playerDataMap;
  } catch (error) {
    console.error('❌ Exception loading all player data:', error.message);
    return new Map();
  }
}

// Delete player data from Supabase
async function deletePlayerData(userId) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
    const { error } = await supabase
      .from('player_data')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error(`❌ Error deleting player data for ${userId}:`, error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error(`❌ Exception deleting player data for ${userId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Get player count
async function getPlayerCount() {
  if (!useSupabase || !supabase) {
    return 0;
  }
  
  try {
    const { count, error } = await supabase
      .from('player_data')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Error getting player count:', error.message);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    console.error('❌ Exception getting player count:', error.message);
    return 0;
  }
}

// Check if Supabase is enabled
function isSupabaseEnabled() {
  return useSupabase;
}

// ==================== GUILD/SERVER DATA ====================

// Save guild data to Supabase
async function saveGuildData(guildId, guildData) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
    const { data, error } = await supabase
      .from('guild_data')
      .upsert({
        guild_id: guildId,
        data: guildData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'guild_id'
      });
    
    if (error) {
      console.error(`❌ Error saving guild data for ${guildId}:`, error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error(`❌ Exception saving guild data for ${guildId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Load guild data from Supabase
async function loadGuildData(guildId) {
  if (!useSupabase || !supabase) {
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('guild_data')
      .select('data')
      .eq('guild_id', guildId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - guild doesn't exist yet
        return null;
      }
      console.error(`❌ Error loading guild data for ${guildId}:`, error.message);
      return null;
    }
    
    return data?.data || null;
  } catch (error) {
    console.error(`❌ Exception loading guild data for ${guildId}:`, error.message);
    return null;
  }
}

// Load all guild data from Supabase
async function loadAllGuildData() {
  if (!useSupabase || !supabase) {
    return new Map();
  }
  
  try {
    const { data, error } = await supabase
      .from('guild_data')
      .select('guild_id, data');
    
    if (error) {
      console.error('❌ Error loading all guild data:', error.message);
      return new Map();
    }
    
    const guildDataMap = new Map();
    if (data && Array.isArray(data)) {
      data.forEach(row => {
        if (row.guild_id && row.data) {
          guildDataMap.set(row.guild_id, row.data);
        }
      });
    }
    
    console.log(`✅ Loaded ${guildDataMap.size} guild records from Supabase`);
    return guildDataMap;
  } catch (error) {
    console.error('❌ Exception loading all guild data:', error.message);
    return new Map();
  }
}

// ==================== GUILD LEVELING ====================

// Save leveling data for a user in a guild
async function saveLevelingData(guildId, userId, levelingData) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
    const { data, error } = await supabase
      .from('guild_leveling')
      .upsert({
        guild_id: guildId,
        user_id: userId,
        exp: levelingData.exp || 0,
        level: levelingData.level || 1,
        messages: levelingData.messages || 0,
        commands: levelingData.commands || 0,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'guild_id,user_id'
      });
    
    if (error) {
      console.error(`❌ Error saving leveling data for ${guildId}/${userId}:`, error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error(`❌ Exception saving leveling data for ${guildId}/${userId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Load leveling data for a user in a guild
async function loadLevelingData(guildId, userId) {
  if (!useSupabase || !supabase) {
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('guild_leveling')
      .select('*')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user doesn't have leveling data yet
        return null;
      }
      console.error(`❌ Error loading leveling data for ${guildId}/${userId}:`, error.message);
      return null;
    }
    
    return data ? {
      exp: data.exp || 0,
      level: data.level || 1,
      messages: data.messages || 0,
      commands: data.commands || 0
    } : null;
  } catch (error) {
    console.error(`❌ Exception loading leveling data for ${guildId}/${userId}:`, error.message);
    return null;
  }
}

// Load all leveling data for a guild
async function loadAllGuildLeveling(guildId) {
  if (!useSupabase || !supabase) {
    return new Map();
  }
  
  try {
    const { data, error } = await supabase
      .from('guild_leveling')
      .select('*')
      .eq('guild_id', guildId)
      .order('exp', { ascending: false });
    
    if (error) {
      console.error(`❌ Error loading leveling data for guild ${guildId}:`, error.message);
      return new Map();
    }
    
    const levelingMap = new Map();
    if (data && Array.isArray(data)) {
      data.forEach(row => {
        if (row.user_id) {
          levelingMap.set(row.user_id, {
            exp: row.exp || 0,
            level: row.level || 1,
            messages: row.messages || 0,
            commands: row.commands || 0
          });
        }
      });
    }
    
    return levelingMap;
  } catch (error) {
    console.error(`❌ Exception loading leveling data for guild ${guildId}:`, error.message);
    return new Map();
  }
}

// Save daily recap configuration
async function saveDailyRecapConfig(guildId, config) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
    // Load existing guild data
    const existingData = await loadGuildData(guildId);
    const guildData = existingData || { allowedChannels: [], setupCompleted: false };
    
    // Update daily recap config
    guildData.dailyRecap = config;
    
    // Save updated guild data
    const result = await saveGuildData(guildId, guildData);
    return result;
  } catch (error) {
    console.error(`❌ Error saving daily recap config for ${guildId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Load daily recap configuration
async function loadDailyRecapConfig(guildId) {
  if (!useSupabase || !supabase) {
    return null;
  }
  
  try {
    const guildData = await loadGuildData(guildId);
    return guildData?.dailyRecap || null;
  } catch (error) {
    console.error(`❌ Error loading daily recap config for ${guildId}:`, error.message);
    return null;
  }
}

// Save Twitter monitoring configuration
async function saveTwitterMonitoringConfig(guildId, config) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
    // Load existing guild data
    const existingData = await loadGuildData(guildId);
    const guildData = existingData || { allowedChannels: [], setupCompleted: false };
    
    // Update Twitter monitoring config
    guildData.twitterMonitoring = config;
    
    // Save updated guild data
    const result = await saveGuildData(guildId, guildData);
    return result;
  } catch (error) {
    console.error(`❌ Error saving Twitter monitoring config for ${guildId}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Load Twitter monitoring configuration
async function loadTwitterMonitoringConfig(guildId) {
  if (!useSupabase || !supabase) {
    return null;
  }
  
  try {
    const guildData = await loadGuildData(guildId);
    return guildData?.twitterMonitoring || null;
  } catch (error) {
    console.error(`❌ Error loading Twitter monitoring config for ${guildId}:`, error.message);
    return null;
  }
}

module.exports = {
  initSupabase,
  testConnection,
  savePlayerData,
  loadPlayerData,
  loadAllPlayerData,
  deletePlayerData,
  getPlayerCount,
  isSupabaseEnabled,
  saveGuildData,
  loadGuildData,
  loadAllGuildData,
  saveLevelingData,
  loadLevelingData,
  loadAllGuildLeveling,
  saveDailyRecapConfig,
  loadDailyRecapConfig,
  saveTwitterMonitoringConfig,
  loadTwitterMonitoringConfig
};
