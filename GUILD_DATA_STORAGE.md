# Guild/Server Data Storage

## Overview
The bot now stores per-Discord-server (guild) data including setup status and RPG channel restrictions in Supabase (with file system fallback).

## What is Stored

### Guild Data Structure
Each Discord server (guild) has the following data stored:

```json
{
  "allowedChannels": ["channel_id_1", "channel_id_2"],
  "setupCompleted": true,
  "setupDate": "2024-01-01T00:00:00.000Z"
}
```

### Fields
- **allowedChannels** (array): List of channel IDs where RPG commands are allowed
- **setupCompleted** (boolean): Whether the server has completed the `/setup` command
- **setupDate** (string): ISO timestamp of when setup was completed

## Storage Methods

### 1. Supabase (Primary)
- Stored in `guild_data` table
- Persists across bot restarts and redeployments
- Automatic backups
- Scalable to many servers

### 2. File System (Fallback)
- Stored in `rpg_channels.json`
- Used if Supabase is not configured
- Also used as backup even when Supabase is enabled

## How It Works

### Setup Command (`/setup`)
1. Admin runs `/setup` in a channel
2. Channel is added to `allowedChannels`
3. `setupCompleted` is set to `true`
4. `setupDate` is recorded
5. Data is saved to Supabase (and file system as backup)

### Add Channel Command (`/addchannel`)
1. Admin runs `/addchannel` in a channel
2. Channel is added to `allowedChannels`
3. If not already set, `setupCompleted` is set to `true`
4. Data is saved to Supabase (and file system as backup)

### Loading on Startup
1. Bot loads guild data from Supabase (if enabled)
2. Falls back to file system if Supabase is not available
3. Loads channel restrictions and setup status into memory
4. RPG commands are restricted to allowed channels

## Database Schema

### guild_data Table
```sql
CREATE TABLE guild_data (
  guild_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

The `data` column contains the guild configuration as JSONB:
- `allowedChannels`: Array of channel IDs
- `setupCompleted`: Boolean
- `setupDate`: ISO timestamp string

## Migration

### From File to Supabase
If you have existing `rpg_channels.json` file:
1. The bot will automatically migrate data on startup
2. Data is loaded from file and saved to Supabase
3. File is kept as backup

### Manual Migration
Guild data is automatically migrated when:
- Bot starts up and loads from file
- Guild data is saved (automatically saves to Supabase if enabled)

## Benefits

✅ **Persistent Storage**: Guild settings survive bot restarts  
✅ **Multi-Server Support**: Each server has its own configuration  
✅ **Setup Tracking**: Know which servers have completed setup  
✅ **Channel Management**: Track which channels allow RPG commands  
✅ **Automatic Backup**: File system backup even with Supabase  
✅ **Scalable**: Handles many servers efficiently  

## Usage

### Check if Server is Setup
```javascript
const setupStatus = GUILD_SETUP_STATUS.get(guildId);
if (setupStatus && setupStatus.setupCompleted) {
  // Server is setup
}
```

### Get Allowed Channels
```javascript
const allowedChannels = RPG_CHANNELS.get(guildId);
if (allowedChannels && allowedChannels.has(channelId)) {
  // Channel allows RPG commands
}
```

### Save Guild Data
```javascript
await saveRPGChannels(); // Saves all guild data to Supabase/disk
```

## Troubleshooting

### Guild Data Not Loading
- Check Supabase connection
- Verify `guild_data` table exists
- Check RLS policies if using anon key
- Check file system fallback (`rpg_channels.json`)

### Setup Status Not Saved
- Ensure Supabase is enabled
- Check console for error messages
- Verify guild data is being saved after setup

### Channel Restrictions Not Working
- Verify channels are loaded on startup
- Check that `loadRPGChannels()` is called
- Ensure channel IDs are correct

## Future Enhancements

Potential additions to guild data:
- Custom prefixes per server
- Server-specific settings
- Role permissions
- Custom welcome messages
- Server statistics
- And more...

