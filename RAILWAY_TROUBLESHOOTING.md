# Railway Supabase Troubleshooting Guide

## Issue: Supabase saves are failing on Railway

If you've set up your Supabase schema and environment variables in Railway but saves are still failing, follow these steps:

### Step 1: Verify Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on your Discord bot service
3. Go to the "Variables" tab
4. Verify you have:
   - `SUPABASE_URL` - Should be: `https://bvefifufanahnjnbkjhb.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` - Get this from Supabase dashboard (Settings → API → service_role key)

**Important:** Use the **service_role** key, not the anon key. The service_role key bypasses Row Level Security (RLS) policies.

### Step 2: Check Railway Logs

1. In Railway, go to your bot service
2. Click on the "Logs" tab
3. Look for these messages:
   - `🔌 Initializing Supabase...` - Should show "✅ Set" for both URL and Key
   - `✅ Supabase client initialized successfully (using SERVICE_ROLE key)` - Should show SERVICE_ROLE, not ANON
   - `✅ Supabase connection test successful` - Should pass
   - `❌ Error saving player data` - This will show the actual error

### Step 3: Common Error Messages and Solutions

#### Error: "Table does not exist" or "PGRST301"
**Solution:** 
- Go to Supabase dashboard → SQL Editor
- Copy the entire contents of `supabase_schema.sql`
- Paste and run it in the SQL Editor
- Verify the `player_data` table exists in Table Editor

#### Error: "Permission denied" or "42501" or "row-level security"
**Solution:**
- Make sure you're using `SUPABASE_SERVICE_ROLE_KEY` (not ANON key)
- The service_role key bypasses RLS policies
- If using ANON key, you need to create RLS policies that allow access

#### Error: Empty error message
**Solution:**
- Check Railway logs for the full error details (they should now show more information)
- The improved error logging will show: message, code, details, and hint
- Copy the full error and check what it says

#### Error: Connection timeout or network error
**Solution:**
- Verify your `SUPABASE_URL` is correct
- Check if Railway can access external APIs (should work by default)
- Verify your Supabase project is active (not paused)

### Step 4: Verify Supabase Setup

1. Go to https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb
2. Go to Table Editor
3. Verify `player_data` table exists with columns:
   - `user_id` (text, primary key)
   - `data` (jsonb)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

4. Go to SQL Editor
5. Run this query to check if you can read/write:
   ```sql
   -- Test read
   SELECT user_id FROM player_data LIMIT 1;
   
   -- Test write (should work with service_role key)
   INSERT INTO player_data (user_id, data, updated_at)
   VALUES ('test_user', '{"test": true}'::jsonb, NOW())
   ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data;
   ```

### Step 5: Check RLS Policies

1. Go to Supabase dashboard → Authentication → Policies
2. Find the `player_data` table
3. Verify there's a policy that allows all operations (if using service_role key, this doesn't matter)
4. If using ANON key, you need a policy like:
   ```sql
   CREATE POLICY "Allow all operations for service role"
     ON player_data
     FOR ALL
     USING (true)
     WITH CHECK (true);
   ```

### Step 6: Test with Debug Script

If you want to test locally (with Railway credentials):

1. Create a `.env` file in your project root
2. Add your Railway environment variables:
   ```
   SUPABASE_URL=https://bvefifufanahnjnbkjhb.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```
3. Run: `node debug-supabase-save.js`
4. This will test the connection and show detailed error messages

### Step 7: Verify Data is Being Saved

1. Go to Supabase dashboard → Table Editor → player_data
2. Check if any rows exist
3. If rows exist, click on a row to see the data
4. Verify the `data` column contains the player JSON

### Step 8: Check Bot Logs for Specific Errors

After the bot starts, look for these log messages:

**Good signs:**
```
🔌 Initializing Supabase...
   URL: ✅ Set
   Key: SERVICE_ROLE (✅ Set)
✅ Supabase client initialized successfully (using SERVICE_ROLE key)
🧪 Testing Supabase connection...
✅ Supabase connection test successful - player_data table accessible
✅ Supabase connection verified and ready!
✅ Loaded X player records from Supabase
```

**Bad signs:**
```
❌ Error saving player data for [userId]: [error message]
⚠️  Supabase save failed for [userId], falling back to file system
```

### Step 9: Most Common Issues

1. **Using ANON key instead of SERVICE_ROLE key**
   - Fix: Use `SUPABASE_SERVICE_ROLE_KEY` in Railway
   - Get it from: Supabase Dashboard → Settings → API → service_role key

2. **Table doesn't exist**
   - Fix: Run `supabase_schema.sql` in Supabase SQL Editor

3. **Wrong URL format**
   - Fix: Should be `https://bvefifufanahnjnbkjhb.supabase.co` (no trailing slash)

4. **RLS policies blocking access**
   - Fix: Use SERVICE_ROLE key (bypasses RLS) or create proper RLS policies

5. **Environment variables not set in Railway**
   - Fix: Go to Railway → Variables tab → Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

### Step 10: Get Help

If none of the above works:

1. Copy the full error message from Railway logs
2. Check what error code it shows (e.g., PGRST301, 42501)
3. Verify your Supabase project is active (not paused or deleted)
4. Check if your Supabase project has reached any limits (free tier has limits)

### Quick Checklist

- [ ] `SUPABASE_URL` is set in Railway (format: `https://bvefifufanahnjnbkjhb.supabase.co`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Railway (not ANON key)
- [ ] `player_data` table exists in Supabase (check Table Editor)
- [ ] Schema was run in Supabase SQL Editor
- [ ] Bot logs show "✅ Supabase client initialized successfully"
- [ ] Bot logs show "✅ Supabase connection test successful"
- [ ] No error messages in Railway logs when saving player data

### Testing Your Setup

Run this in Supabase SQL Editor to test:

```sql
-- Check if table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'player_data';

-- Check table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'player_data';

-- Test insert (should work with service_role key)
INSERT INTO player_data (user_id, data, updated_at)
VALUES ('test_user_123', '{"level": 1, "coins": 100}'::jsonb, NOW())
ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();

-- Verify insert worked
SELECT * FROM player_data WHERE user_id = 'test_user_123';
```

If all of these work, your Supabase setup is correct and the issue is likely with the bot code or environment variables in Railway.

