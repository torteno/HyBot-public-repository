# Supabase Debugging - Summary

## What We've Done

### 1. Enhanced Error Logging
- **database.js**: Now logs full error details including message, code, details, and hint
- **hytale-discord-bot.js**: Better error messages when Supabase saves fail
- **Initialization**: More detailed logging when Supabase client is initialized

### 2. Improved Environment Variable Handling
- Now prefers `SUPABASE_SERVICE_ROLE_KEY` over `SUPABASE_ANON_KEY`
- Validates URL format
- Warns if using ANON key (which requires RLS policies)

### 3. Better Connection Testing
- More detailed connection test logging
- Shows exactly what's failing (table doesn't exist, permission denied, etc.)

### 4. Updated Schema
- Added `DROP POLICY IF EXISTS` to avoid conflicts when re-running schema
- Better comments explaining RLS policies

### 5. Created Debug Tools
- `debug-supabase-save.js` - Comprehensive debug script
- `RAILWAY_TROUBLESHOOTING.md` - Full troubleshooting guide
- `QUICK_FIX_SUPABASE.md` - Quick reference for common issues

## What to Check Now

### Step 1: Check Railway Logs

When your bot starts on Railway, you should now see detailed logs like:

```
🔌 Initializing Supabase...
   URL: ✅ Set
   Key: SERVICE_ROLE (✅ Set)
✅ Supabase client initialized successfully (using SERVICE_ROLE key)
🧪 Testing Supabase connection...
✅ Supabase connection test successful - player_data table accessible
✅ Supabase connection verified and ready!
```

**If you see:**
- `Key: ANON (✅ Set)` → You're using the wrong key! Use SERVICE_ROLE key
- `URL: ❌ Not set` → Environment variable not set in Railway
- `Key: NONE (❌ Not set)` → SERVICE_ROLE_KEY not set in Railway
- `❌ Error saving player data` → Check the error message for details

### Step 2: Verify Environment Variables in Railway

1. Go to Railway → Your bot service → Variables tab
2. Make sure you have:
   - `SUPABASE_URL` = `https://bvefifufanahnjnbkjhb.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (your service_role key from Supabase)

**Important:** Use the **service_role** key, not the anon key!

### Step 3: Get Your SERVICE_ROLE Key

1. Go to: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api
2. Scroll to "Project API keys"
3. Copy the **service_role** key (it's the secret one, starts with `eyJ...`)
4. Paste it into Railway as `SUPABASE_SERVICE_ROLE_KEY`

### Step 4: Verify Table Exists

1. Go to Supabase dashboard → Table Editor
2. Check if `player_data` table exists
3. If not, run `supabase_schema.sql` in SQL Editor

### Step 5: Check Error Messages

When a save fails, you'll now see detailed error messages like:

```
❌ Error saving player data for [userId]: {
  message: "permission denied for table player_data",
  code: "42501",
  details: null,
  hint: "Check RLS policies or use service role key"
}
```

**Common error codes:**
- `PGRST301` → Table doesn't exist (run schema)
- `42501` → Permission denied (use SERVICE_ROLE key)
- `23505` → Duplicate key (shouldn't happen with upsert)

### Step 6: Test Your Setup

After setting SERVICE_ROLE key, check Railway logs:

1. Bot should start without errors
2. Should see "✅ Supabase client initialized successfully"
3. Should see "✅ Supabase connection test successful"
4. When a player uses a command, should save to Supabase (check logs)

### Step 7: Verify Data is Being Saved

1. Go to Supabase dashboard → Table Editor → player_data
2. Check if rows exist
3. Click on a row to see the data
4. Verify the `data` column contains player JSON

## Most Likely Issue

Based on your description ("idk why its not working tho"), the most likely issue is:

**You're using the ANON key instead of the SERVICE_ROLE key**

**Fix:**
1. Get SERVICE_ROLE key from Supabase dashboard
2. Set it in Railway as `SUPABASE_SERVICE_ROLE_KEY`
3. Redeploy your bot
4. Check logs - should now show "using SERVICE_ROLE key"

## Next Steps

1. **Check Railway logs** - Look for the initialization messages
2. **Verify environment variables** - Make sure SERVICE_ROLE_KEY is set
3. **Check error messages** - The improved logging will tell you exactly what's wrong
4. **Test with debug script** - If you want to test locally, create a `.env` file with your Railway credentials and run `node debug-supabase-save.js`

## Files Created/Updated

- ✅ `database.js` - Enhanced error logging, better initialization
- ✅ `hytale-discord-bot.js` - Better error handling, early initialization
- ✅ `supabase_schema.sql` - Added DROP POLICY IF EXISTS
- ✅ `debug-supabase-save.js` - Debug script
- ✅ `RAILWAY_TROUBLESHOOTING.md` - Full troubleshooting guide
- ✅ `QUICK_FIX_SUPABASE.md` - Quick reference
- ✅ `DEBUG_SUPABASE_SUMMARY.md` - This file

## Still Not Working?

1. Copy the full error message from Railway logs
2. Check what error code it shows
3. Verify your Supabase project is active (not paused)
4. Check if you've reached any Supabase limits (free tier has limits)
5. Verify the table exists in Supabase Table Editor

The improved error logging should now tell you exactly what's wrong!

