-- =============================================
-- BARRICADE GAME — Supabase Schema v2
-- Run this in Supabase SQL Editor (fresh setup)
-- =============================================

-- Drop old tables if they exist (fresh install)
DROP TABLE IF EXISTS game_states CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- Rooms
CREATE TABLE rooms (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code             VARCHAR(8)  UNIQUE NOT NULL,
  status           VARCHAR(20) DEFAULT 'waiting',   -- waiting | playing | finished
  host_session_id  VARCHAR(120) NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Players
CREATE TABLE players (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      UUID        REFERENCES rooms(id) ON DELETE CASCADE,
  session_id   VARCHAR(120) NOT NULL,
  player_name  VARCHAR(60)  DEFAULT 'Player',
  team         VARCHAR(10)  NOT NULL,               -- red | blue
  is_ready     BOOLEAN      DEFAULT FALSE,
  joined_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(room_id, session_id)
);

-- Game states (v2: cell-based, 10 barricades per player, no phase column)
CREATE TABLE game_states (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id          UUID        REFERENCES rooms(id) ON DELETE CASCADE UNIQUE,
  current_turn     VARCHAR(10) DEFAULT 'red',       -- red | blue
  red_x            INT         DEFAULT 4,
  red_y            INT         DEFAULT 0,
  blue_x           INT         DEFAULT 4,
  blue_y           INT         DEFAULT 8,
  barricades       JSONB       DEFAULT '[]'::jsonb,
  red_barricades   INT         DEFAULT 10,          -- remaining barricades for red
  blue_barricades  INT         DEFAULT 10,          -- remaining barricades for blue
  winner           VARCHAR(10),                     -- null | red | blue
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime on all three tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_states;

-- Disable RLS for development (add policies before going to production)
ALTER TABLE rooms        DISABLE ROW LEVEL SECURITY;
ALTER TABLE players      DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_states  DISABLE ROW LEVEL SECURITY;


-- =============================================
-- MIGRATION (if you already have v1 schema)
-- Run only if you already ran the old schema
-- =============================================

-- ALTER TABLE game_states
--   ADD COLUMN IF NOT EXISTS red_barricades  INT DEFAULT 10,
--   ADD COLUMN IF NOT EXISTS blue_barricades INT DEFAULT 10;

-- ALTER TABLE game_states DROP COLUMN IF EXISTS phase;
