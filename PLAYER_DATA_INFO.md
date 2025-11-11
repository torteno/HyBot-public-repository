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

## Current Storage Location
- **If hosting locally**: Data is on your computer in `player_data/`
- **If hosting on Railway**: Data is on Railway's servers in the container's `player_data/` directory
- **If using Railway Volumes**: Data is in the mounted volume (persists across redeploys)

