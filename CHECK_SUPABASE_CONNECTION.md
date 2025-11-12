# How to Check if Supabase is Properly Handling Your Data

## Quick Answer: Your Supabase URL

**Yes, that's the correct URL format!** 

Your Supabase project URL is: `https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb`

The project ID is: `bvefifufanahnjnbkjhb`

## Step-by-Step Verification

### 1. Check Your Environment Variables

Make sure you have these set in your Railway/environment:

```env
SUPABASE_URL=https://bvefifufanahnjnbkjhb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**To get your credentials:**
1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb
2. Click **Settings** (gear icon) → **API**
3. Copy:
   - **Project URL** → This is your `SUPABASE_URL`
   - **service_role key** (secret) → This is your `SUPABASE_SERVICE_ROLE_KEY`

### 2. Verify Table Exists

1. Go to your Supabase dashboard
2. Click **Table Editor** in the left sidebar
3. You should see `player_data` table
4. If it doesn't exist, run the SQL from `supabase_schema.sql` in the **SQL Editor**

### 3. Check Current Errors

Based on your logs, you're seeing:
```
❌ Error saving player data for 930941522684285010: 
⚠️  Supabase save failed for 930941522684285010, falling back to file system
```

The error message is empty, which suggests:
- The error object might not have a `message` property
- There might be a connection issue
- RLS policies might be blocking the save
- The table might not exist

### 4. Improved Error Logging

I've updated the code to show **full error details** including:
- Error message
- Error code
- Error details
- Error hint
- Full error object

This will help identify what's actually failing.

### 5. Test Connection

Run the health check script:

```bash
node test-supabase.js
```

This will show:
- ✅ If Supabase is enabled
- ✅ If connection works
- ✅ How many players are in the database
- ✅ Sample player data

### 6. Check Supabase Dashboard

1. **Go to Table Editor:**
   - Click `player_data` table
   - You should see player records
   - Click on a row to view the `data` column (JSON)

2. **Check if data is being saved:**
   - Look at the `updated_at` column
   - It should update when player data changes
   - If it's not updating, saves are failing

3. **Check Logs:**
   - Go to **Logs** → **Postgres Logs**
   - Look for errors related to `player_data` table

### 7. Common Issues and Fixes

#### Issue: "Table does not exist"
**Fix:** Run the SQL schema from `supabase_schema.sql` in SQL Editor

#### Issue: "Row-level security policy violation"
**Fix:** Either:
1. Use service role key (recommended), OR
2. Create RLS policy that allows all operations:
```sql
CREATE POLICY "Allow all operations for service role"
  ON player_data
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

#### Issue: "Permission denied"
**Fix:** 
1. Check you're using the service role key (not anon key)
2. Verify RLS policies allow writes

#### Issue: Empty error message
**Fix:** The updated code now logs full error details. Check the logs after the update.

### 8. Verify Data is Being Saved

**Check in Supabase Dashboard:**
```sql
-- Count players
SELECT COUNT(*) FROM player_data;

-- View recent updates
SELECT user_id, updated_at 
FROM player_data 
ORDER BY updated_at DESC 
LIMIT 10;

-- View a specific player's data
SELECT data->>'level' as level, 
       data->'exploration'->'unlockedZones' as zones,
       data->'achievements'->'claimed' as achievements
FROM player_data 
WHERE user_id = '930941522684285010';
```

### 9. Test Save/Load

1. **Make a change in-game** (level up, unlock a zone, etc.)
2. **Wait 60 seconds** (auto-save interval)
3. **Check Supabase dashboard:**
   - `updated_at` should update
   - `data` column should show your changes
4. **Restart bot:**
   - Bot should load data from Supabase
   - Your changes should persist

## Next Steps

1. **Update your code** with the improved error logging
2. **Check your environment variables** are set correctly
3. **Verify the table exists** in Supabase
4. **Check RLS policies** if using anon key
5. **Run the health check** script to see detailed status
6. **Check Supabase dashboard** to verify data is being saved

The improved error logging will show you exactly what's failing so we can fix it!

