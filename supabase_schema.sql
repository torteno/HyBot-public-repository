-- Supabase Database Schema for Hytale Discord Bot
-- Run this SQL in your Supabase SQL Editor to create the necessary table
--
-- This schema stores complete player data in JSONB format, including:
-- - Core stats: level, xp, hp, mana, coins
-- - Inventory and equipment
-- - Quests and progress
-- - Achievements and codex entries
-- - Bases and settlements (with nested structures)
-- - All game systems: pets, spells, skillTree, adventureMode, dailyChallenges, pvp, worldBosses, worldEvents
-- - Exploration data: biomes, zones, gathering state
-- - And 30+ more fields with complete nested structures
--
-- The JSONB column can store unlimited nested data structures, making it perfect for complex game data.
-- All data is validated before save to ensure completeness and integrity.

-- Create player_data table
CREATE TABLE IF NOT EXISTS player_data (
  user_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,  -- Stores complete player object with all 37+ top-level fields and nested structures
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index on user_id for faster lookups (though it's already the primary key)
-- This is optional but can be useful for other queries
CREATE INDEX IF NOT EXISTS idx_player_data_user_id ON player_data(user_id);

-- Create index on updated_at for sorting/filtering by update time
CREATE INDEX IF NOT EXISTS idx_player_data_updated_at ON player_data(updated_at DESC);

-- Enable Row Level Security (RLS) - Optional but recommended for security
ALTER TABLE player_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Allow all operations for service role" ON player_data;

-- Create a policy that allows all operations
-- Note: If using SERVICE_ROLE key, RLS is bypassed anyway, so this policy doesn't matter
-- If using ANON key, this policy allows all operations (not recommended for production)
CREATE POLICY "Allow all operations for service role"
  ON player_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Alternative: If you want to use the anon key and restrict access,
-- you can create a more restrictive policy like this:
-- CREATE POLICY "Allow service role full access"
--   ON player_data
--   FOR ALL
--   TO service_role
--   USING (true)
--   WITH CHECK (true);

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create a trigger to automatically update updated_at on row update
CREATE TRIGGER update_player_data_updated_at
  BEFORE UPDATE ON player_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for player statistics
-- This view provides easy access to common player stats without querying the full JSONB object
CREATE OR REPLACE VIEW player_stats AS
SELECT 
  user_id,
  (data->>'level')::int as level,
  (data->>'xp')::int as xp,
  (data->>'coins')::int as coins,
  (data->'stats'->>'kills')::int as kills,
  (data->'stats'->>'deaths')::int as deaths,
  data->'exploration'->'unlockedZones' as unlocked_zones,  -- Array of unlocked zone IDs (e.g., ['zone_1', 'zone_2'])
  data->'exploration'->'discoveredBiomes' as discovered_biomes,  -- Array of discovered biome IDs
  data->'achievements'->'claimed' as claimed_achievements,  -- Array of claimed achievement IDs
  data->'bases' as bases,  -- Bases object (count keys in application code if needed)
  data->'settlements' as settlements,  -- Settlements object (count keys in application code if needed)
  created_at,
  updated_at
FROM player_data;

-- Note: The above view uses JSONB operators to extract specific fields.
-- You can query the full player data using: SELECT data FROM player_data WHERE user_id = '...'
-- The JSONB column supports querying nested fields, e.g.:
--   SELECT data->'bases'->'zone_1'->>'rank' FROM player_data WHERE user_id = '...'
--   SELECT data->'settlements'->'kweebec_village'->>'prestige' FROM player_data WHERE user_id = '...'
--   SELECT data->'exploration'->>'unlockedZones' FROM player_data WHERE user_id = '...'

-- Grant necessary permissions (adjust based on your RLS policies)
-- If using service role, these may not be necessary
-- GRANT SELECT, INSERT, UPDATE, DELETE ON player_data TO authenticated;
-- GRANT SELECT ON player_stats TO authenticated;

-- ==================== GUILD/SERVER DATA TABLE ====================

-- Create guild_data table for server-specific settings
-- This table stores guild/server-specific configuration and data
CREATE TABLE IF NOT EXISTS guild_data (
  guild_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,  -- Stores guild configuration and settings
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index on guild_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_guild_data_guild_id ON guild_data(guild_id);

-- Create index on updated_at for sorting/filtering by update time
CREATE INDEX IF NOT EXISTS idx_guild_data_updated_at ON guild_data(updated_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE guild_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Allow all operations for service role on guild_data" ON guild_data;

-- Create a policy that allows all operations
-- Note: If using SERVICE_ROLE key, RLS is bypassed anyway, so this policy doesn't matter
CREATE POLICY "Allow all operations for service role on guild_data"
  ON guild_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create a trigger to automatically update updated_at on row update for guild_data
CREATE TRIGGER update_guild_data_updated_at
  BEFORE UPDATE ON guild_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

