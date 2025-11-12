-- Supabase Schema Update: Attribute System and Enhanced Equipment
-- Run this SQL in your Supabase SQL Editor to add support for the new attribute system
--
-- This update adds support for:
-- - Essence Shards (attribute upgrade tokens)
-- - Allocated Attributes (Strength, Speed, Vitality)
-- - Enhanced Equipment (artifacts array)
-- - Individual base and settlement upgrade tracking
--
-- Note: Since we use JSONB, these fields are automatically supported once the code is updated.
-- This file documents the new fields and provides verification queries.

-- ==================== NEW FIELDS IN PLAYER DATA ====================
-- The following fields are now stored in the player_data.data JSONB column:
--
-- 1. essenceShards: number
--    - Attribute upgrade tokens earned from leveling up
--    - Default: 0
--
-- 2. allocatedAttributes: object
--    - {
--        strength: number,  // Combat damage bonus (1% per point)
--        speed: number,     // Gathering/travel/upgrade speed (1% per point, max 50%)
--        vitality: number   // HP and defense bonus (1% HP, 0.5% defense per point)
--      }
--    - Default: { strength: 0, speed: 0, vitality: 0 }
--
-- 3. equipped.artifacts: array
--    - Array of artifact item IDs
--    - Default: []
--
-- 4. Bases and Settlements are already stored individually
--    - Each base is stored as: data->'bases'->'<biome_id>'->'upgrades'
--    - Each settlement is stored as: data->'settlements'->'<settlement_id>'->'upgrades'
--    - These are already properly isolated per base/settlement

-- ==================== VERIFICATION QUERIES ====================

-- Check if a player has essence shards
SELECT 
  user_id,
  (data->>'essenceShards')::int as essence_shards
FROM player_data
WHERE (data->>'essenceShards')::int > 0
ORDER BY (data->>'essenceShards')::int DESC
LIMIT 10;

-- Check allocated attributes for all players
SELECT 
  user_id,
  (data->'allocatedAttributes'->>'strength')::int as strength,
  (data->'allocatedAttributes'->>'speed')::int as speed,
  (data->'allocatedAttributes'->>'vitality')::int as vitality
FROM player_data
WHERE data->'allocatedAttributes' IS NOT NULL
ORDER BY 
  ((data->'allocatedAttributes'->>'strength')::int + 
   (data->'allocatedAttributes'->>'speed')::int + 
   (data->'allocatedAttributes'->>'vitality')::int) DESC
LIMIT 10;

-- Verify individual base upgrades are stored separately
-- This query shows that each base has its own upgrades object
SELECT 
  user_id,
  jsonb_object_keys(data->'bases') as biome_id,
  data->'bases'->jsonb_object_keys(data->'bases')->'upgrades' as base_upgrades
FROM player_data
WHERE data->'bases' IS NOT NULL
  AND jsonb_typeof(data->'bases') = 'object'
LIMIT 20;

-- Verify individual settlement upgrades are stored separately
SELECT 
  user_id,
  jsonb_object_keys(data->'settlements') as settlement_id,
  data->'settlements'->jsonb_object_keys(data->'settlements')->'upgrades' as settlement_upgrades
FROM player_data
WHERE data->'settlements' IS NOT NULL
  AND jsonb_typeof(data->'settlements') = 'object'
LIMIT 20;

-- Check equipped artifacts
SELECT 
  user_id,
  data->'equipped'->'artifacts' as artifacts
FROM player_data
WHERE data->'equipped'->'artifacts' IS NOT NULL
  AND jsonb_array_length(data->'equipped'->'artifacts') > 0
LIMIT 10;

-- ==================== UPDATE EXISTING PLAYERS (Optional) ====================
-- If you want to initialize these fields for existing players, you can run:
-- (Note: The application code already handles this, but this is for manual updates if needed)

-- Initialize essenceShards for players who don't have it
UPDATE player_data
SET data = jsonb_set(
  data,
  '{essenceShards}',
  '0'::jsonb,
  true
)
WHERE data->>'essenceShards' IS NULL;

-- Initialize allocatedAttributes for players who don't have it
UPDATE player_data
SET data = jsonb_set(
  data,
  '{allocatedAttributes}',
  '{"strength": 0, "speed": 0, "vitality": 0}'::jsonb,
  true
)
WHERE data->'allocatedAttributes' IS NULL;

-- Initialize equipped.artifacts array for players who don't have it
UPDATE player_data
SET data = jsonb_set(
  data,
  '{equipped,artifacts}',
  '[]'::jsonb,
  true
)
WHERE data->'equipped'->'artifacts' IS NULL;

-- ==================== NOTES ====================
-- 1. Bases and Settlements are already stored individually in the JSONB structure
--    - Each base: data->'bases'->'<biome_id>' contains its own upgrades, rank, modules, etc.
--    - Each settlement: data->'settlements'->'<settlement_id>' contains its own upgrades, prestige, etc.
--    - Upgrading one base/settlement does NOT affect others because they are separate keys in the JSONB object
--
-- 2. The application code (hytale-discord-bot.js) already:
--    - Initializes these fields when loading player data (getPlayer function)
--    - Saves all fields when saving player data (savePlayerData function)
--    - Properly isolates base and settlement data
--
-- 3. No schema migration is required because JSONB is flexible and accepts new fields automatically.
--    The queries above are for verification and optional initialization only.

