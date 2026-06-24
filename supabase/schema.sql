-- BARRICADE v3 — Run in Supabase SQL Editor
DROP TABLE IF EXISTS game_states CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

CREATE TABLE rooms (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  code             VARCHAR(8)   UNIQUE NOT NULL,
  status           VARCHAR(20)  DEFAULT 'waiting',
  host_session_id  VARCHAR(120) NOT NULL,
  is_public        BOOLEAN      DEFAULT TRUE,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);
CREATE TABLE players (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      UUID         REFERENCES rooms(id) ON DELETE CASCADE,
  session_id   VARCHAR(120) NOT NULL,
  player_name  VARCHAR(60)  DEFAULT 'Player',
  team         VARCHAR(10)  NOT NULL,
  is_ready     BOOLEAN      DEFAULT FALSE,
  joined_at    TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(room_id, session_id)
);
CREATE TABLE game_states (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id          UUID        REFERENCES rooms(id) ON DELETE CASCADE UNIQUE,
  current_turn     VARCHAR(10) DEFAULT 'red',
  red_x            INT         DEFAULT 4,
  red_y            INT         DEFAULT 0,
  blue_x           INT         DEFAULT 4,
  blue_y           INT         DEFAULT 8,
  barricades       JSONB       DEFAULT '[]'::jsonb,
  red_barricades   INT         DEFAULT 10,
  blue_barricades  INT         DEFAULT 10,
  winner           VARCHAR(10),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_states;
ALTER TABLE rooms       DISABLE ROW LEVEL SECURITY;
ALTER TABLE players     DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_states DISABLE ROW LEVEL SECURITY;

-- MIGRATION (if you have existing tables):
-- ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
-- ALTER TABLE game_states ADD COLUMN IF NOT EXISTS red_barricades INT DEFAULT 10;
-- ALTER TABLE game_states ADD COLUMN IF NOT EXISTS blue_barricades INT DEFAULT 10;
-- ALTER TABLE game_states DROP COLUMN IF EXISTS phase;
