# Quick Fix for Supabase Issues on Railway

## Most Common Issues

### Issue 1: Using PostgreSQL Connection String Instead of HTTPS URL

**❌ Wrong:**
```
SUPABASE_URL=postgresql://postgres:[PASSWORD]@db.bvefifufanahnjnbkjhb.supabase.co:5432/postgres
```

**✅ Correct:**
```
SUPABASE_URL=https://bvefifufanahnjnbkjhb.supabase.co
```

**How to fix:**
1. Go to: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api
2. Copy the **"Project URL"** (not the connection string)
3. Set it as `SUPABASE_URL` in Railway

See `CORRECT_SUPABASE_URL.md` for detailed instructions.

### Issue 2: Using ANON Key Instead of SERVICE_ROLE Key

If your bot is failing to save data to Supabase, the most likely issue is that you're using the **ANON key** instead of the **SERVICE_ROLE key**.

### Fix Steps:

1. **Get your SERVICE_ROLE key:**
   - Go to: https://supabase.com/dashboard/project/bvefifufanahnjnbkjhb/settings/api
   - Scroll down to "Project API keys"
   - Copy the **service_role** key (NOT the anon key)
   - ⚠️ **Important:** The service_role key is secret and should never be exposed publicly

2. **Set it in Railway:**
   - Go to your Railway project
   - Click on your Discord bot service
   - Go to "Variables" tab
   - Add/Update: `SUPABASE_SERVICE_ROLE_KEY` with the service_role key value
   - Make sure you also have: `SUPABASE_URL` set to `https://bvefifufanahnjnbkjhb.supabase.co`

3. **Redeploy your bot:**
   - Railway should automatically redeploy when you change environment variables
   - Or manually trigger a redeploy

4. **Check the logs:**
   - After redeploy, check Railway logs
   - You should see: `✅ Supabase client initialized successfully (using SERVICE_ROLE key)`
   - You should see: `✅ Supabase connection test successful`

### Why SERVICE_ROLE Key?

- The **service_role key** bypasses Row Level Security (RLS) policies
- This is necessary for server-side operations like your Discord bot
- The **anon key** is for client-side applications and respects RLS policies
- Your bot needs full access to read/write player data, so use service_role

### Verify It's Working:

After setting the SERVICE_ROLE key, check Railway logs for:

✅ **Good signs:**
```
🔌 Initializing Supabase...
   URL: ✅ Set
   Key: SERVICE_ROLE (✅ Set)
✅ Supabase client initialized successfully (using SERVICE_ROLE key)
✅ Supabase connection test successful - player_data table accessible
✅ Supabase connection verified and ready!
```

❌ **Bad signs (if you see these, you're still using ANON key or credentials are wrong):**
```
⚠️  Warning: Using ANON key. Make sure RLS policies allow access, or use SERVICE_ROLE key.
❌ Error saving player data for [userId]: Permission denied
❌ Error saving player data for [userId]: row-level security policy violation
```

### Other Common Issues:

1. **Table doesn't exist:**
   - Go to Supabase SQL Editor
   - Run the entire `supabase_schema.sql` file
   - Verify table exists in Table Editor

2. **Wrong URL:**
   - Should be: `https://bvefifufanahnjnbkjhb.supabase.co`
   - No trailing slash
   - Get it from: Supabase Dashboard → Settings → API → Project URL

3. **Environment variables not set:**
   - Make sure both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Railway
   - Check the Variables tab in Railway

### Test Your Setup:

Run this in Supabase SQL Editor to verify:

```sql
-- Should return the table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'player_data';

-- Should work without errors (if using service_role key)
INSERT INTO player_data (user_id, data, updated_at)
VALUES ('test_user', '{"test": true}'::jsonb, NOW())
ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data;
```

If these work, your Supabase setup is correct!

