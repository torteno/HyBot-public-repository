// Supabase Database Module for Hytale Discord Bot
// This module handles all database operations using Supabase

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
let supabase = null;
let useSupabase = false;

// Initialize Supabase connection
function initSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase credentials not found. Using file-based storage as fallback.');
    console.log('💡 To use Supabase, set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in your environment variables.');
    useSupabase = false;
    return false;
  }
  
  try {
    // Use service role key if available (for server-side operations), otherwise use anon key
    supabase = createClient(supabaseUrl, supabaseKey);
    useSupabase = true;
    console.log('✅ Supabase client initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Error initializing Supabase:', error.message);
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
      console.error('❌ Supabase connection test failed:', playerError.message);
      console.error('💡 Make sure you have:');
      console.error('   1. Created the player_data and guild_data tables in your Supabase database');
      console.error('   2. Run the SQL schema from supabase_schema.sql');
      console.error('   3. Set proper RLS policies if using anon key');
      return false;
    }
    
    // Log warnings for missing tables but don't fail if at least one works
    if (playerError) {
      console.warn('⚠️  player_data table not found. Run the SQL schema to create it.');
    }
    if (guildError) {
      console.warn('⚠️  guild_data table not found. Run the SQL schema to create it.');
    }
    
    console.log('✅ Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Error testing Supabase connection:', error.message);
    return false;
  }
}

// Save player data to Supabase
async function savePlayerData(userId, playerData) {
  if (!useSupabase || !supabase) {
    return { success: false, error: 'Supabase not initialized' };
  }
  
  try {
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
      console.error(`❌ Error saving player data for ${userId}:`, error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    console.error(`❌ Exception saving player data for ${userId}:`, error.message);
    return { success: false, error: error.message };
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
  loadAllGuildData
};
