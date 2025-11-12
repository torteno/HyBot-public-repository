-- ==================== SAFE VERIFICATION QUERIES ====================
-- These queries are READ-ONLY and will NOT modify any data
-- Run these first to see your current data structure

-- Check if players have essence shards
SELECT 
  user_id,
  (data->>'essenceShards')::int as essence_shards
FROM player_data
WHERE (data->>'essenceShards')::int > 0
ORDER BY (data->>'essenceShards')::int DESC
LIMIT 10;

-- Check allocated attributes for players
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

-- ==================== OPTIONAL: Initialize Fields for Existing Players ====================
-- These UPDATE queries are SAFE - they only add fields if they don't exist
-- They will NOT overwrite or delete any existing data
-- NOTE: The application code already handles this automatically, so these are optional

-- Initialize essenceShards for players who don't have it (only if NULL)
UPDATE player_data
SET data = jsonb_set(
  data,
  '{essenceShards}',
  '0'::jsonb,
  true
)
WHERE data->>'essenceShards' IS NULL;

-- Initialize allocatedAttributes for players who don't have it (only if NULL)
UPDATE player_data
SET data = jsonb_set(
  data,
  '{allocatedAttributes}',
  '{"strength": 0, "speed": 0, "vitality": 0}'::jsonb,
  true
)
WHERE data->'allocatedAttributes' IS NULL;

-- Initialize equipped.artifacts array for players who don't have it (only if NULL)
UPDATE player_data
SET data = jsonb_set(
  data,
  '{equipped,artifacts}',
  '[]'::jsonb,
  true
)
WHERE data->'equipped'->'artifacts' IS NULL;

-- ==================== IMPORTANT NOTES ====================
-- 1. The SELECT queries above are READ-ONLY and completely safe
-- 2. The UPDATE queries only add fields if they're missing - they won't overwrite existing data
-- 3. The application code (hytale-discord-bot.js) already initializes these fields automatically
-- 4. You can run just the SELECT queries if you only want to verify data
-- 5. The UPDATE queries are optional - your code will handle initialization when players log in

