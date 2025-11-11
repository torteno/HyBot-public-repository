# Railway Data Persistence Setup Guide

## Overview
Railway uses **ephemeral filesystems** by default, meaning data stored in files can be lost on:
- Bot redeployments
- Container restarts
- Service updates

To ensure your player data persists, you need to set up **Railway Volumes** (persistent storage).

## Step-by-Step Setup

### Option 1: Railway Volumes (Recommended - Free)

1. **Go to your Railway project**
   - Navigate to https://railway.app
   - Select your bot's service

2. **Create a Volume**
   - Click on the **"Volumes"** tab (or "Data" tab in some Railway versions)
   - Click **"New Volume"**
   - Name it: `player-data` (or any name you prefer)
   - Set the mount path to: `/app/player_data`
   - Click **"Add"**

3. **Verify the Volume**
   - The volume should now appear in your service
   - Railway will automatically mount it to `/app/player_data`
   - Your bot code already uses this path, so no code changes needed!

4. **Deploy**
   - Railway will automatically redeploy your service
   - Your player data will now persist across restarts

### Option 2: External Database (For Production)

If you have many players or want more robust data management, consider migrating to an external database:

#### MongoDB Atlas (Free Tier Available)
- Sign up at https://www.mongodb.com/cloud/atlas
- Create a free cluster (M0 - 512MB storage)
- Get your connection string
- Update your bot code to use MongoDB instead of JSON files

#### Supabase (Free Tier Available)
- PostgreSQL database with 500MB free storage
- Sign up at https://supabase.com
- Create a new project
- Get your connection string

#### PlanetScale (Free Tier Available)
- MySQL database with 5GB free storage
- Sign up at https://planetscale.com
- Create a database
- Get your connection string

## Current File-Based Storage

Your bot currently stores data in:
- **Player Data**: `player_data/*.json` (one file per player)
- **RPG Channels**: `rpg_channels.json` (channel restrictions)

Both will persist if you set up a Railway Volume mounted to `/app/`.

## Verification

After setting up the volume:

1. **Test locally first** (optional):
   - Create a `player_data/` folder
   - Run the bot and create a test player
   - Verify files are created

2. **Deploy to Railway**:
   - Push your code
   - Railway will mount the volume
   - Test by creating a player and restarting the bot
   - Player data should persist!

## Troubleshooting

### Data Still Not Persisting?
- Check that the volume mount path is exactly `/app/player_data`
- Verify the volume is attached to your service
- Check Railway logs for any mount errors
- Ensure your bot code uses `path.join(__dirname, 'player_data')` (which it does)

### Volume Not Appearing?
- Make sure you're in the correct Railway project
- Check that you have the correct permissions
- Try creating the volume again

### Need More Storage?
- Railway Volumes have size limits (check your plan)
- Consider upgrading or using an external database
- MongoDB Atlas free tier: 512MB
- Supabase free tier: 500MB
- PlanetScale free tier: 5GB

## Migration to Database (Future)

If you want to migrate from file-based storage to a database:

1. **Choose a database** (MongoDB Atlas recommended for free tier)
2. **Install the database driver**: `npm install mongodb` (or `pg` for PostgreSQL)
3. **Update `savePlayerData()` and `loadPlayerData()`** to use database instead of files
4. **Run a migration script** to import existing JSON files
5. **Test thoroughly** before deploying

The current file-based system works great for small to medium servers, but databases scale better for large communities.

