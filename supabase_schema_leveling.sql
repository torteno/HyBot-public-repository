-- Supabase Database Schema for Guild Leveling System
-- Run this SQL in your Supabase SQL Editor to create the necessary table
--
-- ⚠️ SAFETY NOTE: This SQL is completely safe to run!
-- - It only CREATES a new table (doesn't delete or modify existing data)
-- - Uses "IF NOT EXISTS" clauses to prevent overwriting
-- - DROP statements only affect the new table's policies/triggers (safe)
-- - Will NOT delete or modify any existing tables or data
--
-- This schema stores server-level leveling data for Discord users:
-- - EXP gained from messages and commands
-- - Current level
-- - Message and command counts
-- - Per-guild, per-user tracking

-- Create guild_leveling table
CREATE TABLE IF NOT EXISTS guild_leveling (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  exp INTEGER DEFAULT 0 NOT NULL,
  level INTEGER DEFAULT 1 NOT NULL,
  messages INTEGER DEFAULT 0 NOT NULL,
  commands INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_guild_leveling_guild_id ON guild_leveling(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_leveling_user_id ON guild_leveling(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_leveling_level ON guild_leveling(level DESC);
CREATE INDEX IF NOT EXISTS idx_guild_leveling_exp ON guild_leveling(exp DESC);

-- Create index on updated_at for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_guild_leveling_updated_at ON guild_leveling(updated_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE guild_leveling ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Allow all operations for service role on guild_leveling" ON guild_leveling;

-- Create a policy that allows all operations
-- Note: If using SERVICE_ROLE key, RLS is bypassed anyway, so this policy doesn't matter
-- If using ANON key, this policy allows all operations (not recommended for production)
CREATE POLICY "Allow all operations for service role on guild_leveling"
  ON guild_leveling
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create a trigger to automatically update updated_at on row update
CREATE OR REPLACE FUNCTION update_guild_leveling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_guild_leveling_updated_at ON guild_leveling;
CREATE TRIGGER update_guild_leveling_updated_at
  BEFORE UPDATE ON guild_leveling
  FOR EACH ROW
  EXECUTE FUNCTION update_guild_leveling_updated_at();

-- Example queries for verification:
-- SELECT * FROM guild_leveling WHERE guild_id = 'your_guild_id' ORDER BY exp DESC LIMIT 10;
-- SELECT * FROM guild_leveling WHERE guild_id = 'your_guild_id' AND user_id = 'your_user_id';
-- SELECT COUNT(*) as total_users, AVG(level) as avg_level, MAX(level) as max_level FROM guild_leveling WHERE guild_id = 'your_guild_id';

