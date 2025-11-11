# Player Data Storage

## Overview
Player data is stored in **JSON files** in the `player_data/` directory. **No database is required** - the bot uses a simple file-based storage system.

## Storage Location

### Local Development
- **Directory**: `player_data/` (created automatically in the bot's root directory on your computer)
- **File Format**: One JSON file per player: `{userId}.json`
- **Example**: `player_data/123456789012345678.json`

### Railway/Cloud Hosting
- **Directory**: `player_data/` on Railway's filesystem (in the bot's working directory)
- **Location**: Railway stores files in the container's filesystem
- **⚠️ IMPORTANT**: Railway uses **ephemeral filesystems** by default, meaning data can be lost on:
  - Bot redeployments
  - Container restarts
  - Service updates

### Railway Persistent Storage (Recommended)
To ensure data persists on Railway, you should:

1. **Use Railway Volumes** (Recommended):
   - Go to your Railway project → Service → Volumes
   - Create a new volume and mount it to `/app/player_data`
   - This ensures data persists across redeployments

2. **Alternative: External Database**:
   - For production with many players, consider migrating to:
     - MongoDB Atlas (free tier available)
     - PostgreSQL (Railway offers managed PostgreSQL)
     - Redis (for caching + persistence)

3. **Backup Strategy**:
   - Set up automated backups of the `player_data/` directory
   - Use Railway's scheduled tasks to backup to cloud storage (S3, etc.)
   - Or use a database with built-in backups

## How It Works
1. **On Bot Startup**: All player data files are loaded from `player_data/` into memory
2. **During Play**: Player data is kept in memory for fast access
3. **Auto-Save**: Player data is automatically saved:
   - Every 60 seconds (automatic background save)
   - After important actions (quest completion, item acquisition, etc.)
   - On bot shutdown

## Data Persistence
- ✅ **Survives bot restarts** - All data is loaded on startup
- ✅ **Automatic saves** - No manual intervention needed
- ✅ **Per-player files** - Easy to backup individual players
- ⚠️ **File-based** - Not suitable for very large player counts (1000+ players may want a database)
- ⚠️ **Railway Ephemeral** - Without volumes, data may be lost on redeploy

## Backup Recommendations
- **Local**: Regularly backup the `player_data/` directory
- **Railway**: Use Railway Volumes or migrate to a database
- **Cloud**: Set up automated backups to cloud storage
- **Production**: For many players, consider migrating to a database (MongoDB, PostgreSQL, etc.)

## File Structure
Each player file contains:
- Player stats (level, XP, HP, mana, coins)
- Inventory
- Quests and progress
- Exploration state
- Bases and settlements
- Achievements
- And more...

## Free Hosting & Storage Solutions

### Recommended: Free Database Services (Best for Persistence)

Since most free hosting services use ephemeral filesystems, **using a free database is the best solution** for persistent data storage:

#### 1. **MongoDB Atlas** (Recommended - Easiest)
- **Free Tier**: 512MB storage, shared cluster
- **Setup**: 
  1. Sign up at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
  2. Create a free cluster (M0 tier)
  3. Get connection string
  4. Add `MONGODB_URI` to your environment variables
- **Pros**: Easy setup, generous free tier, automatic backups
- **Cons**: Requires code changes to use MongoDB instead of files
- **Migration**: Would need to modify `savePlayerData()` and `loadPlayerData()` functions

#### 2. **Supabase** (PostgreSQL)
- **Free Tier**: 500MB database, 1GB bandwidth
- **Setup**: 
  1. Sign up at [supabase.com](https://supabase.com)
  2. Create a project
  3. Get PostgreSQL connection string
  4. Add `DATABASE_URL` to environment variables
- **Pros**: Full PostgreSQL, generous free tier, built-in auth options
- **Cons**: Requires code changes to use PostgreSQL

#### 3. **PlanetScale** (MySQL)
- **Free Tier**: 5GB storage, 1 billion reads/month
- **Setup**: 
  1. Sign up at [planetscale.com](https://planetscale.com)
  2. Create a database
  3. Get connection string
- **Pros**: Serverless MySQL, good free tier
- **Cons**: Requires code changes

#### 4. **Neon** (PostgreSQL)
- **Free Tier**: 3GB storage, serverless
- **Setup**: 
  1. Sign up at [neon.tech](https://neon.tech)
  2. Create a project
  3. Get connection string
- **Pros**: Serverless PostgreSQL, good performance
- **Cons**: Requires code changes

### Free Hosting Services

#### 1. **Render** (Recommended)
- **Free Tier**: 750 hours/month, sleeps after 15 min inactivity
- **Persistent Storage**: ❌ No persistent disk (use database)
- **Best For**: Small bots, development
- **Setup**: Connect GitHub repo, add environment variables
- **Storage Solution**: Use MongoDB Atlas or Supabase

#### 2. **Fly.io**
- **Free Tier**: 3 shared VMs, 3GB persistent volumes
- **Persistent Storage**: ✅ Yes! 3GB free persistent volumes
- **Best For**: Bots that need persistent disk
- **Setup**: 
  1. Install Fly CLI
  2. Create volume: `fly volumes create player_data --size 1`
  3. Mount in `fly.toml`: `mounts = [{ source = "player_data", destination = "/app/player_data" }]`
- **Storage Solution**: Can use file system OR database

#### 3. **Replit**
- **Free Tier**: Always-on option available
- **Persistent Storage**: ✅ Yes, files persist
- **Best For**: Quick setup, educational projects
- **Storage Solution**: File system works, but database recommended

#### 4. **Koyeb**
- **Free Tier**: 2 services, always-on
- **Persistent Storage**: ❌ No persistent disk
- **Best For**: Simple deployments
- **Storage Solution**: Use MongoDB Atlas or Supabase

#### 5. **Cyclic**
- **Free Tier**: Always-on, serverless
- **Persistent Storage**: ❌ No persistent disk
- **Best For**: Serverless functions
- **Storage Solution**: Use MongoDB Atlas or Supabase

### Recommended Setup for Free Hosting

**Best Combination:**
1. **Hosting**: Render or Fly.io (free tier)
2. **Database**: MongoDB Atlas (free tier)
3. **Why**: 
   - Data persists across deployments
   - No data loss on restarts
   - Scales better than files
   - Automatic backups

**Alternative (if you want to keep file system):**
1. **Hosting**: Fly.io (has persistent volumes)
2. **Storage**: Use file system with mounted volume
3. **Why**: 
   - No code changes needed
   - 3GB free storage
   - Files persist across deployments

### Quick Migration Guide (If Using Database)

If you want to migrate to MongoDB Atlas (recommended):

1. **Install MongoDB driver**: `npm install mongodb`
2. **Create database helper file** (e.g., `database.js`):
   ```javascript
   const { MongoClient } = require('mongodb');
   const uri = process.env.MONGODB_URI;
   const client = new MongoClient(uri);
   
   async function savePlayerData(userId, data) {
     const db = client.db('hytale_bot');
     await db.collection('players').updateOne(
       { userId },
       { $set: { ...data, userId, updatedAt: new Date() } },
       { upsert: true }
     );
   }
   
   async function loadPlayerData(userId) {
     const db = client.db('hytale_bot');
     return await db.collection('players').findOne({ userId });
   }
   ```
3. **Replace** `savePlayerData()` and `loadPlayerData()` calls
4. **Add** `MONGODB_URI` to environment variables

## Current Storage Location
- **If hosting locally**: Data is on your computer in `player_data/`
- **If hosting on Railway**: Data is on Railway's servers in the container's `player_data/` directory
- **If using Railway Volumes**: Data is in the mounted volume (persists across redeploys)
- **If using Fly.io with volume**: Data is in the mounted volume (persists across redeploys)
- **If using a database**: Data is in the cloud database (always persists)

