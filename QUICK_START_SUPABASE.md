# Quick Start: Supabase Setup

## TL;DR - Quick Setup Steps

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project (free tier is fine)
   - Wait for project to be created

2. **Get Credentials**
   - Go to Settings → API
   - Copy `Project URL` → This is your `SUPABASE_URL`
   - Copy `service_role` key → This is your `SUPABASE_SERVICE_ROLE_KEY`

3. **Create Database Table**
   - Go to SQL Editor in Supabase
   - Copy contents of `supabase_schema.sql`
   - Paste and run it
   - Verify table `player_data` exists in Table Editor

4. **Set Environment Variables**
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

5. **Install Dependencies**
   ```bash
   npm install
   ```

6. **Start Bot**
   - Start your bot
   - Check console for: `✅ Supabase connection test successful`
   - Done! 🎉

## Environment Variables

### Local Development (.env file)
```env
DISCORD_TOKEN=your_discord_token
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Railway/Cloud Hosting
Add these in your hosting platform's environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Verification

After setup, your bot console should show:
```
✅ Supabase client initialized successfully
✅ Supabase connection test successful
✅ Loaded X player records from Supabase
```

## Troubleshooting

**Bot falls back to file storage?**
- Check environment variables are set
- Verify Supabase credentials are correct
- Ensure `player_data` table exists

**Connection test fails?**
- Run the SQL schema in Supabase SQL Editor
- Check RLS policies if using anon key (use service_role key instead)

## Full Documentation

See `SUPABASE_SETUP.md` for detailed instructions and troubleshooting.

