# How to Verify Supabase is Handling Your Data

## Quick Verification Methods

### 1. Check Bot Logs for Supabase Connection

When your bot starts, you should see:
```
✅ Supabase client initialized successfully
✅ Supabase connection test successful
✅ Loaded X player records from Supabase
```

If you see warnings like:
```
⚠️  Supabase credentials not found. Using file-based storage as fallback.
```
Then Supabase is not configured. Check your environment variables.

### 2. Check Environment Variables

Make sure you have these set in your `.env` file or environment:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# OR
SUPABASE_ANON_KEY=your-anon-key
```

### 3. View Data in Supabase Dashboard

#### Step 1: Log into Supabase
1. Go to [https://supabase.com](https://supabase.com)
2. Log into your account
3. Select your project

#### Step 2: Open Table Editor
1. Click on **"Table Editor"** in the left sidebar
2. Click on **"player_data"** table
3. You should see all player records with:
   - `user_id` (Discord user ID)
   - `data` (JSONB column with all player data)
   - `created_at` (when record was created)
   - `updated_at` (when record was last updated)

#### Step 3: View Player Data
1. Click on any row to expand it
2. Click on the `data` column to view the JSON
3. You should see the complete player object with all fields:
   - `level`, `xp`, `hp`, `mana`, `coins`
   - `inventory`, `equipped`
   - `bases`, `settlements`
   - `exploration` (with `unlockedZones`, `discoveredBiomes`)
   - `achievements` (with `claimed`, `notified`)
   - And all other fields...

### 4. Query Data Using SQL Editor

#### Step 1: Open SQL Editor
1. Click on **"SQL Editor"** in the left sidebar
2. Click **"New query"**

#### Step 2: Run Queries

**Count total players:**
```sql
SELECT COUNT(*) as total_players FROM player_data;
```

**View all player user IDs:**
```sql
SELECT user_id, created_at, updated_at FROM player_data ORDER BY updated_at DESC;
```

**View a specific player's data:**
```sql
SELECT data FROM player_data WHERE user_id = 'YOUR_USER_ID';
```

**View player level and XP:**
```sql
SELECT 
  user_id,
  data->>'level' as level,
  data->>'xp' as xp,
  data->>'coins' as coins
FROM player_data
ORDER BY (data->>'level')::int DESC;
```

**View players with bases:**
```sql
SELECT 
  user_id,
  data->>'level' as level,
  jsonb_object_keys(data->'bases') as base_ids
FROM player_data
WHERE data->'bases' IS NOT NULL AND jsonb_typeof(data->'bases') = 'object';
```

**View players with unlocked zones:**
```sql
SELECT 
  user_id,
  data->'exploration'->'unlockedZones' as unlocked_zones
FROM player_data
WHERE data->'exploration'->'unlockedZones' IS NOT NULL;
```

**View players with achievements:**
```sql
SELECT 
  user_id,
  data->'achievements'->'claimed' as claimed_achievements,
  jsonb_array_length(data->'achievements'->'claimed') as achievement_count
FROM player_data
WHERE data->'achievements'->'claimed' IS NOT NULL;
```

**View players with settlements:**
```sql
SELECT 
  user_id,
  jsonb_object_keys(data->'settlements') as settlement_ids
FROM player_data
WHERE data->'settlements' IS NOT NULL AND jsonb_typeof(data->'settlements') = 'object';
```

**View recently updated players:**
```sql
SELECT 
  user_id,
  data->>'level' as level,
  updated_at
FROM player_data
ORDER BY updated_at DESC
LIMIT 10;
```

### 5. Test Data Save/Load

#### Test 1: Check if Data is Being Saved
1. Use a bot command that modifies player data (e.g., level up, gain XP, unlock a zone)
2. Wait a few seconds (auto-save runs every 60 seconds)
3. Check Supabase dashboard - the `updated_at` timestamp should update
4. View the `data` column - your changes should be reflected

#### Test 2: Check if Data is Being Loaded
1. Restart your bot
2. Check bot logs for: `✅ Loaded X player records from Supabase`
3. Use a bot command to check your player data
4. Your data should be loaded correctly

#### Test 3: Verify Specific Fields
Use these SQL queries to verify specific data:

**Check zones:**
```sql
SELECT 
  user_id,
  data->'exploration'->'unlockedZones' as unlocked_zones
FROM player_data
WHERE data->'exploration'->'unlockedZones' IS NOT NULL;
```

**Check biomes:**
```sql
SELECT 
  user_id,
  data->'exploration'->'discoveredBiomes' as discovered_biomes
FROM player_data
WHERE data->'exploration'->'discoveredBiomes' IS NOT NULL;
```

**Check achievements:**
```sql
SELECT 
  user_id,
  data->'achievements'->'claimed' as claimed,
  data->'achievements'->'notified' as notified
FROM player_data
WHERE data->'achievements' IS NOT NULL;
```

**Check bases:**
```sql
SELECT 
  user_id,
  data->'bases' as bases
FROM player_data
WHERE data->'bases' IS NOT NULL AND jsonb_typeof(data->'bases') = 'object';
```

**Check settlements:**
```sql
SELECT 
  user_id,
  data->'settlements' as settlements
FROM player_data
WHERE data->'settlements' IS NOT NULL AND jsonb_typeof(data->'settlements') = 'object';
```

### 6. Monitor Real-Time Updates

#### Check Update Timestamps
```sql
SELECT 
  user_id,
  updated_at,
  NOW() - updated_at as time_since_update
FROM player_data
ORDER BY updated_at DESC;
```

This shows when each player's data was last updated. If it's updating, Supabase is working!

### 7. Verify Data Integrity

#### Check for Missing Fields
```sql
-- Check if all players have required fields
SELECT 
  user_id,
  CASE WHEN data->>'level' IS NULL THEN 'Missing level' END as missing_level,
  CASE WHEN data->>'xp' IS NULL THEN 'Missing xp' END as missing_xp,
  CASE WHEN data->'inventory' IS NULL THEN 'Missing inventory' END as missing_inventory,
  CASE WHEN data->'exploration' IS NULL THEN 'Missing exploration' END as missing_exploration
FROM player_data
WHERE data->>'level' IS NULL 
   OR data->>'xp' IS NULL 
   OR data->'inventory' IS NULL
   OR data->'exploration' IS NULL;
```

#### Check Data Structure
```sql
-- Verify exploration has unlockedZones
SELECT 
  user_id,
  data->'exploration'->'unlockedZones' as unlocked_zones,
  jsonb_typeof(data->'exploration'->'unlockedZones') as zones_type
FROM player_data
WHERE data->'exploration' IS NOT NULL;
```

### 8. Test Connection Programmatically

Add this to your bot code temporarily to test:

```javascript
// Test Supabase connection and data
async function testSupabaseData() {
  if (!db.isSupabaseEnabled()) {
    console.log('❌ Supabase is not enabled');
    return;
  }
  
  console.log('✅ Supabase is enabled');
  
  // Test connection
  const connectionOk = await db.testConnection();
  console.log('Connection test:', connectionOk ? '✅ Success' : '❌ Failed');
  
  // Get player count
  const count = await db.getPlayerCount();
  console.log(`Total players in Supabase: ${count}`);
  
  // Load all player data
  const allData = await db.loadAllPlayerData();
  console.log(`Loaded ${allData.size} players from Supabase`);
  
  // Check first player's data structure
  if (allData.size > 0) {
    const firstPlayer = Array.from(allData.values())[0];
    console.log('First player has:');
    console.log('  - Level:', firstPlayer.level);
    console.log('  - Bases:', Object.keys(firstPlayer.bases || {}).length);
    console.log('  - Settlements:', Object.keys(firstPlayer.settlements || {}).length);
    console.log('  - Unlocked zones:', firstPlayer.exploration?.unlockedZones);
    console.log('  - Discovered biomes:', firstPlayer.exploration?.discoveredBiomes?.length);
    console.log('  - Achievements claimed:', firstPlayer.achievements?.claimed?.length);
  }
}

// Call this function after bot starts
testSupabaseData();
```

### 9. Common Issues and Solutions

#### Issue: "Supabase not initialized"
**Solution:** Check your environment variables are set correctly.

#### Issue: "No player data found in Supabase"
**Solution:** 
- Check if players exist in the table
- Verify RLS policies allow access
- Check if you're using the correct key (service role vs anon)

#### Issue: "Data not updating"
**Solution:**
- Check bot logs for save errors
- Verify Supabase connection is working
- Check if `savePlayerData` is being called
- Verify RLS policies allow updates

#### Issue: "Can't see data in dashboard"
**Solution:**
- Verify you're logged into the correct Supabase project
- Check if the table exists
- Verify RLS policies (might need to use service role key)

### 10. Quick Health Check Script

Create a file `test-supabase.js`:

```javascript
require('dotenv').config();
const db = require('./database');

async function healthCheck() {
  console.log('🔍 Supabase Health Check\n');
  
  // Check if enabled
  if (!db.isSupabaseEnabled()) {
    console.log('❌ Supabase is not enabled');
    console.log('💡 Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    return;
  }
  
  console.log('✅ Supabase is enabled\n');
  
  // Test connection
  console.log('Testing connection...');
  const connectionOk = await db.testConnection();
  if (!connectionOk) {
    console.log('❌ Connection test failed');
    return;
  }
  console.log('✅ Connection test passed\n');
  
  // Get player count
  console.log('Getting player count...');
  const count = await db.getPlayerCount();
  console.log(`✅ Total players: ${count}\n`);
  
  // Load sample data
  if (count > 0) {
    console.log('Loading sample player data...');
    const allData = await db.loadAllPlayerData();
    const firstUserId = Array.from(allData.keys())[0];
    const firstPlayer = allData.get(firstUserId);
    
    console.log(`✅ Sample player (${firstUserId}):`);
    console.log(`   Level: ${firstPlayer.level}`);
    console.log(`   XP: ${firstPlayer.xp}`);
    console.log(`   Coins: ${firstPlayer.coins}`);
    console.log(`   Bases: ${Object.keys(firstPlayer.bases || {}).length}`);
    console.log(`   Settlements: ${Object.keys(firstPlayer.settlements || {}).length}`);
    console.log(`   Unlocked zones: ${firstPlayer.exploration?.unlockedZones?.join(', ') || 'None'}`);
    console.log(`   Discovered biomes: ${firstPlayer.exploration?.discoveredBiomes?.length || 0}`);
    console.log(`   Achievements claimed: ${firstPlayer.achievements?.claimed?.length || 0}`);
  }
  
  console.log('\n✅ Health check complete!');
}

healthCheck().catch(console.error);
```

Run it with:
```bash
node test-supabase.js
```

## Summary

**To verify Supabase is handling your data:**

1. ✅ Check bot logs for connection messages
2. ✅ View data in Supabase Dashboard → Table Editor
3. ✅ Run SQL queries to inspect data
4. ✅ Check `updated_at` timestamps (should update when data changes)
5. ✅ Verify specific fields (zones, biomes, achievements, bases, settlements)
6. ✅ Test save/load by modifying data and restarting bot
7. ✅ Use the health check script above

**If everything is working:**
- You'll see player data in the Supabase dashboard
- `updated_at` timestamps will update when data changes
- Bot will load data on startup
- All fields (zones, biomes, achievements, etc.) will be visible in the JSONB data column

**If something's not working:**
- Check environment variables
- Check bot logs for errors
- Verify RLS policies
- Check Supabase dashboard for connection issues

