# Player Data Storage

## Overview
Player data is stored in **JSON files** in the `player_data/` directory. **No database is required** - the bot uses a simple file-based storage system.

## Storage Location
- **Directory**: `player_data/` (created automatically in the bot's root directory)
- **File Format**: One JSON file per player: `{userId}.json`
- **Example**: `player_data/123456789012345678.json`

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

## Backup Recommendations
- Regularly backup the `player_data/` directory
- Consider using version control or automated backups
- For production with many players, consider migrating to a database (MongoDB, PostgreSQL, etc.)

## File Structure
Each player file contains:
- Player stats (level, XP, HP, mana, coins)
- Inventory
- Quests and progress
- Exploration state
- Bases and settlements
- Achievements
- And more...

