# Supabase Setup Guide for Hytale Discord Bot

This guide will help you set up Supabase as the data storage solution for your Discord bot.

## Prerequisites

- A Supabase account (free tier available at [supabase.com](https://supabase.com))
- Your Discord bot code with the Supabase integration

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in the project details:
   - **Name**: Choose a name for your project (e.g., "hytale-bot")
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the region closest to your bot's hosting location
   - **Pricing Plan**: Select "Free" (generous free tier with 500MB database)
4. Click "Create new project"
5. Wait for the project to be created (takes 1-2 minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. You'll find two important values:
   - **Project URL**: This is your `SUPABASE_URL`
   - **anon/public key**: This is your `SUPABASE_ANON_KEY`
   - **service_role key**: This is your `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

### Which Key Should You Use?

- **Service Role Key** (Recommended for bots): Has full access to your database, bypasses Row Level Security (RLS). Use this if you want the simplest setup.
- **Anon Key**: Limited access, requires RLS policies. Use this if you want more security (requires additional RLS policy setup).

For a Discord bot, the **Service Role Key** is recommended as it simplifies setup.

## Step 3: Create the Database Table

1. In your Supabase project, go to **SQL Editor**
2. Click "New Query"
3. Copy the entire contents of `supabase_schema.sql` file
4. Paste it into the SQL Editor
5. Click "Run" (or press Ctrl+Enter)
6. You should see "Success. No rows returned" - this means the table was created successfully

### Verify Table Creation

1. Go to **Table Editor** in the Supabase dashboard
2. You should see a table named `player_data` with the following columns:
   - `user_id` (text, primary key)
   - `data` (jsonb)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

## Step 4: Configure Environment Variables

### Local Development

Create or update your `.env` file in the bot's root directory:

```env
DISCORD_TOKEN=your_discord_bot_token
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**OR** if using the anon key:

```env
DISCORD_TOKEN=your_discord_bot_token
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### Railway/Cloud Hosting

1. Go to your Railway project dashboard (or your hosting platform)
2. Navigate to **Variables** tab
3. Add the following environment variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (or `SUPABASE_ANON_KEY` if using anon key)
4. Save the variables
5. Redeploy your bot

## Step 5: Install Dependencies

Make sure you have the Supabase client installed:

```bash
npm install @supabase/supabase-js
```

This should already be in your `package.json` if you've updated it.

## Step 6: Test the Connection

1. Start your bot
2. Check the console output. You should see:
   - `✅ Supabase client initialized successfully`
   - `✅ Supabase connection test successful`

If you see errors, check:
- Are your environment variables set correctly?
- Did you create the `player_data` table?
- Are you using the correct key (service_role or anon)?

## How It Works

### Data Storage

- Player data is stored in Supabase PostgreSQL database as JSONB
- Data is automatically saved to Supabase when players make changes
- Data is loaded from Supabase on bot startup
- Falls back to file-based storage if Supabase is not configured

### Automatic Fallback

The bot is designed to work with or without Supabase:
- **With Supabase**: Data is stored in the cloud database
- **Without Supabase**: Data is stored in local JSON files (existing behavior)

If Supabase credentials are not provided, the bot will automatically use file-based storage.

### Data Migration

If you're migrating from file-based storage to Supabase:

1. The bot will automatically load data from Supabase if available
2. If no data exists in Supabase, it will check the file system
3. Once data is saved to Supabase, it will be used going forward
4. Old file-based data can be manually migrated (see below)

## Manual Data Migration (Optional)

If you have existing player data in JSON files and want to migrate it to Supabase:

1. Make sure Supabase is set up and working
2. The bot will automatically migrate data as players interact with it
3. For bulk migration, you can create a migration script (see example below)

### Example Migration Script

Create a file `migrate-to-supabase.js`:

```javascript
const db = require('./database');
const fs = require('fs');
const path = require('path');

async function migratePlayerData() {
  // Initialize Supabase
  db.initSupabase();
  
  if (!db.isSupabaseEnabled()) {
    console.error('❌ Supabase not enabled. Check your environment variables.');
    return;
  }
  
  // Test connection
  const connected = await db.testConnection();
  if (!connected) {
    console.error('❌ Cannot connect to Supabase. Check your setup.');
    return;
  }
  
  // Load all JSON files from player_data directory
  const playerDataDir = path.join(__dirname, 'player_data');
  if (!fs.existsSync(playerDataDir)) {
    console.log('❌ No player_data directory found.');
    return;
  }
  
  const files = fs.readdirSync(playerDataDir);
  let migrated = 0;
  let errors = 0;
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const userId = file.replace('.json', '');
      try {
        const filePath = path.join(playerDataDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const result = await db.savePlayerData(userId, data);
        if (result.success) {
          migrated++;
          console.log(`✅ Migrated player ${userId}`);
        } else {
          errors++;
          console.error(`❌ Failed to migrate player ${userId}: ${result.error}`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Error migrating player ${userId}:`, error.message);
      }
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Migrated: ${migrated} players`);
  console.log(`   Errors: ${errors} players`);
}

migratePlayerData();
```

Run the migration script:

```bash
node migrate-to-supabase.js
```

## Row Level Security (RLS) Setup (Optional)

If you're using the **anon key** instead of the service role key, you need to set up RLS policies:

1. Go to **Authentication** → **Policies** in Supabase
2. Click on the `player_data` table
3. Create a policy that allows all operations:

```sql
-- Allow all operations for service role (if using anon key)
CREATE POLICY "Allow all operations"
  ON player_data
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

**Note**: For a Discord bot, using the service role key is simpler and recommended.

## Troubleshooting

### Error: "relation 'player_data' does not exist"

**Solution**: Run the SQL schema from `supabase_schema.sql` in the Supabase SQL Editor.

### Error: "new row violates row-level security policy"

**Solution**: Either:
1. Use the service role key instead of anon key, OR
2. Create RLS policies that allow all operations (see RLS setup above)

### Error: "Invalid API key"

**Solution**: Check that your `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) are correct in your environment variables.

### Bot falls back to file storage

**Solution**: 
1. Check that environment variables are set correctly
2. Verify Supabase credentials are valid
3. Check bot console for error messages
4. Ensure the `player_data` table exists in Supabase

### Data not saving to Supabase

**Solution**:
1. Check bot console for error messages
2. Verify Supabase connection test passes
3. Check that you have write permissions (RLS policies if using anon key)
4. Verify the `player_data` table structure matches the schema

## Benefits of Using Supabase

✅ **Persistent Storage**: Data survives bot restarts and redeployments  
✅ **Scalability**: Handles thousands of players easily  
✅ **Automatic Backups**: Supabase provides automatic backups  
✅ **Real-time**: Can enable real-time features in the future  
✅ **Free Tier**: Generous free tier (500MB database, 1GB bandwidth)  
✅ **No File System Issues**: No need for persistent volumes on hosting platforms  
✅ **Easy Migration**: Can migrate from file-based storage easily  

## Free Tier Limits

Supabase free tier includes:
- **500MB database storage**
- **1GB bandwidth/month**
- **2GB file storage**
- **50,000 monthly active users**

For most Discord bots, this is more than enough. If you need more, consider upgrading to the Pro plan.

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Check Supabase documentation: [supabase.com/docs](https://supabase.com/docs)
3. Check bot console for error messages
4. Verify your environment variables are set correctly

## Next Steps

Once Supabase is set up and working:
1. Test the bot with a few commands
2. Verify data is being saved to Supabase (check Table Editor)
3. Restart the bot and verify data persists
4. (Optional) Remove old file-based player data if migration is complete

Your bot is now using Supabase for persistent data storage! 🎉

