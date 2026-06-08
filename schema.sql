-- =============================================
-- BARRICADE GAME — Supabase Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code        VARCHAR(8)  UNIQUE NOT NULL,
  status      VARCHAR(20) DEFAULT 'waiting',  -- waiting | playing | finished
  host_session_id VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      UUID        REFERENCES rooms(id) ON DELETE CASCADE,
  session_id   VARCHAR(120) NOT NULL,
  player_name  VARCHAR(60)  DEFAULT 'Player',
  team         VARCHAR(10)  NOT NULL,    -- red | blue
  is_ready     BOOLEAN      DEFAULT FALSE,
  joined_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(room_id, session_id)
);

-- Game states table
CREATE TABLE IF NOT EXISTS game_states (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id       UUID        REFERENCES rooms(id) ON DELETE CASCADE UNIQUE,
  current_turn  VARCHAR(10) DEFAULT 'red',   -- red | blue
  phase         VARCHAR(20) DEFAULT 'move',  -- move | place
  red_x         INT         DEFAULT 4,
  red_y         INT         DEFAULT 0,
  blue_x        INT         DEFAULT 4,
  blue_y        INT         DEFAULT 8,
  barricades    JSONB       DEFAULT '[]'::jsonb,
  winner        VARCHAR(10),               -- null | red | blue
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime on all three tables
-- (Run these in Supabase Dashboard → Database → Replication → 0 tables → select these)
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_states;

-- Disable RLS for quick development (re-enable + add policies for production)
ALTER TABLE rooms        DISABLE ROW LEVEL SECURITY;
ALTER TABLE players      DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_states  DISABLE ROW LEVEL SECURITY;
