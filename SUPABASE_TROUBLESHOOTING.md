# Supabase Troubleshooting Guide

## Your Supabase Project

**Project URL:** https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb

**Project ID:** `bvefifufanahnjnbkjhb`

**Your Supabase URL should be:** `https://bvefifufanahnjnbkjhb.supabase.co`

## Current Issue

You're seeing errors like:
```
❌ Error saving player data for 930941522684285010: 
⚠️  Supabase save failed for 930941522684285010, falling back to file system
```

The error message is empty, which means we need better error logging (which I've now added).

## Step-by-Step Fix

### Step 1: Get Your Supabase Credentials

1. **Go to your Supabase dashboard:**
   - https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb
   
2. **Click Settings (gear icon) → API**

3. **Copy these values:**
   - **Project URL** → This goes in `SUPABASE_URL`
     - Should look like: `https://bvefifufanahnjnbkjhb.supabase.co`
   - **service_role key** (the secret one) → This goes in `SUPABASE_SERVICE_ROLE_KEY`
     - ⚠️ **Important:** Use the `service_role` key, NOT the `anon` key
     - The service role key bypasses RLS policies

### Step 2: Set Environment Variables

**In Railway (or your hosting):**

1. Go to your Railway project
2. Click on your service
3. Go to **Variables** tab
4. Add these environment variables:
   ```
   SUPABASE_URL=https://bvefifufanahnjnbkjhb.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

5. **Redeploy** your bot after adding the variables

### Step 3: Create the Table

1. **Go to Supabase dashboard:**
   - https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb

2. **Click SQL Editor** in the left sidebar

3. **Click New query**

4. **Copy and paste** the entire contents of `supabase_schema.sql`

5. **Click Run** (or press Ctrl+Enter)

6. **Verify the table was created:**
   - Click **Table Editor** in the left sidebar
   - You should see `player_data` table
   - You should see `guild_data` table

### Step 4: Verify RLS Policies

1. **Go to Table Editor → player_data**

2. **Click on the table settings** (three dots) → **View policies**

3. **You should see a policy** like "Allow all operations for service role"

4. **If no policy exists:**
   - Go to **SQL Editor**
   - Run this SQL:
   ```sql
   CREATE POLICY "Allow all operations for service role"
     ON player_data
     FOR ALL
     USING (true)
     WITH CHECK (true);
   ```

### Step 5: Test the Connection

**After updating the code with improved error logging:**

1. **Restart your bot**

2. **Check the logs** for:
   ```
   ✅ Supabase client initialized successfully
   ✅ Supabase connection test successful
   ```

3. **If you see errors**, the improved logging will now show:
   - Error message
   - Error code
   - Error details
   - Error hint
   - Full error object

### Step 6: Verify Data is Being Saved

**In Supabase Dashboard:**

1. **Go to Table Editor → player_data**

2. **You should see player records** with:
   - `user_id` (Discord user ID)
   - `data` (JSONB column with all player data)
   - `created_at` (when created)
   - `updated_at` (when last updated)

3. **Click on a row** to expand it

4. **Click on the `data` column** to view the JSON

5. **Verify the data includes:**
   - `level`, `xp`, `coins`
   - `exploration.unlockedZones` (array)
   - `exploration.discoveredBiomes` (array)
   - `achievements.claimed` (array)
   - `bases` (object)
   - `settlements` (object)
   - All other fields

### Step 7: Monitor Updates

**Check if data is updating:**

1. **Make a change in-game** (level up, unlock a zone, etc.)

2. **Wait 60 seconds** (auto-save interval)

3. **Check Supabase dashboard:**
   - The `updated_at` timestamp should update
   - The `data` column should show your changes

4. **If it's not updating:**
   - Check bot logs for the improved error messages
   - The error will now show exactly what's failing

## Common Error Codes and Solutions

### Error Code: `PGRST301` or "relation does not exist"
**Problem:** Table doesn't exist
**Solution:** Run the SQL schema from `supabase_schema.sql` in SQL Editor

### Error Code: `42501` or "permission denied"
**Problem:** RLS policy blocking access
**Solution:** 
1. Use service role key (recommended), OR
2. Create RLS policy that allows all operations

### Error: "row-level security policy violation"
**Problem:** RLS policy is blocking the operation
**Solution:** Create a policy that allows all operations (see Step 4)

### Error: Empty error message
**Problem:** Error object doesn't have a message property
**Solution:** The updated code now logs the full error object, so you'll see what's actually failing

### Error: "Invalid API key"
**Problem:** Wrong API key or URL
**Solution:** 
1. Verify `SUPABASE_URL` is correct (should be `https://bvefifufanahnjnbkjhb.supabase.co`)
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role key (not anon key)
3. Make sure there are no extra spaces or quotes

## Verification Queries

**Run these in Supabase SQL Editor to verify:**

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'player_data';

-- Check player count
SELECT COUNT(*) as total_players FROM player_data;

-- Check recent updates
SELECT user_id, updated_at 
FROM player_data 
ORDER BY updated_at DESC 
LIMIT 5;

-- Check a specific player's data structure
SELECT 
  user_id,
  data->>'level' as level,
  data->'exploration'->'unlockedZones' as unlocked_zones,
  data->'achievements'->'claimed' as achievements
FROM player_data 
WHERE user_id = '930941522684285010';

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'player_data';
```

## What the Improved Error Logging Shows

After the code update, you'll see detailed error information:

```
❌ Error saving player data for 930941522684285010: {
  message: '...',
  code: '...',
  details: '...',
  hint: '...',
  error: { ... full error object ... }
}
```

This will tell you exactly what's failing so we can fix it!

## Next Steps

1. ✅ **Update your code** (I've improved error logging)
2. ✅ **Set environment variables** in Railway
3. ✅ **Create the table** in Supabase (run SQL schema)
4. ✅ **Verify RLS policies** are set correctly
5. ✅ **Restart your bot** and check the improved error messages
6. ✅ **Check Supabase dashboard** to verify data is being saved

The improved error logging will show you exactly what's failing!

