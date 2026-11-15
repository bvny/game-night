-- Burrito Gang Game Night: D1 database schema.
-- Paste this into the D1 console (Cloudflare dashboard > D1 > your database > Console) and run it once.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,          -- Discord user ID
  name          TEXT NOT NULL,             -- server nickname, or Discord display name
  avatar        TEXT,
  steam_id      TEXT UNIQUE,               -- SteamID64 (NULL until linked)
  steam_private INTEGER DEFAULT 0,         -- 1 if Steam game details are private
  game_count    INTEGER DEFAULT 0,
  last_sync     INTEGER,                   -- ms timestamp of last Steam library sync
  created_at    INTEGER,
  last_login    INTEGER
);

CREATE TABLE IF NOT EXISTS library (
  user_id    TEXT NOT NULL,
  appid      INTEGER NOT NULL,
  minutes    INTEGER DEFAULT 0,            -- lifetime playtime
  minutes_2w INTEGER DEFAULT 0,            -- playtime in the last 2 weeks
  PRIMARY KEY (user_id, appid)
);
CREATE INDEX IF NOT EXISTS library_appid ON library(appid);

CREATE TABLE IF NOT EXISTS games (
  appid       INTEGER PRIMARY KEY,
  name        TEXT,
  is_free     INTEGER DEFAULT 0,
  coop        INTEGER DEFAULT 0,
  pvp         INTEGER DEFAULT 0,
  multi       INTEGER DEFAULT 0,
  max_players INTEGER,                     -- group-tagged later (Steam doesn't publish it)
  genres      TEXT,                        -- JSON array
  prices      TEXT,                        -- JSON {ie|gb|us: {final, initial, discount}} in cents
  meta_at     INTEGER                      -- when store metadata was last fetched
);

CREATE TABLE IF NOT EXISTS snapshots (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,                -- YYYY-MM-DD
  minutes    INTEGER,
  minutes_2w INTEGER,
  games      INTEGER,
  PRIMARY KEY (user_id, day)
);
