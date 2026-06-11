-- db/seed.sql
-- Final seed for the office World Cup prediction app.
-- Based on the uploaded migrations: members/teams/stages/matches/predictions/etc., groups/group standings, and match prediction summary functions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------
-- Compatibility: auth columns for seeded temporary-password login
-- Your uploaded base members migration only has id/email/full_name/role/is_active/created_at.
-- These columns are needed for the seeded temp password + forced password change flow.
-- --------------------------------------------------
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- --------------------------------------------------
-- Helpful indexes
-- --------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS members_email_unique_idx ON members (email);
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_unique_idx ON teams (name);
CREATE UNIQUE INDEX IF NOT EXISTS stages_code_unique_idx ON stages (code);
CREATE UNIQUE INDEX IF NOT EXISTS groups_code_unique_idx ON groups (code);
CREATE INDEX IF NOT EXISTS idx_members_is_active ON members (is_active);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff_at ON matches (kickoff_at);
CREATE INDEX IF NOT EXISTS idx_teams_group_id ON teams (group_id);

-- --------------------------------------------------
-- Seed Members
-- Temporary password for all users: Office@2026
-- Replace emails/names before real use.
-- This does NOT overwrite passwords after a user has changed their password.
-- --------------------------------------------------
INSERT INTO members (
  email,
  full_name,
  role,
  is_active,
  password_hash,
  must_change_password,
  created_at,
  updated_at
)
VALUES
  ('pujan789556@gmail.com', 'Pujan Poudyal', 'ADMIN', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now()),
  ('santosh09001@gmail.com', 'Santosh Pokharel', 'MEMBER', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now()),
  ('diwakar777.up@gmail.com', 'Diwakar Upadhayaya', 'MEMBER', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now()),
  ('ramesh.1990.poudel@gmail.com', 'Ramesh Poudel', 'MEMBER', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now()),
  ('milanchaudhary589@gmail.com', 'Milan Chaudhary', 'MEMBER', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now()),
  ('sabinchaulagain15@gmail.com', 'Sabin Chaulagain', 'MEMBER', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now()),
  ('bishaladhikari872@gmail.com', 'Bishal Adhikari', 'MEMBER', true,  crypt('Office@2026', gen_salt('bf')), true, now(), now())
ON CONFLICT (email)
DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  updated_at = now(),
  password_hash = CASE
    WHEN members.password_changed_at IS NULL THEN EXCLUDED.password_hash
    ELSE members.password_hash
  END,
  must_change_password = CASE
    WHEN members.password_changed_at IS NULL THEN true
    ELSE members.must_change_password
  END;

-- --------------------------------------------------
-- Seed Stages
-- --------------------------------------------------
INSERT INTO stages (code, name, sort_order, entry_amount, is_knockout, created_at)
VALUES
  ('GROUP', 'Group Stage', 1, 20, false, now()),
  ('R32', 'Round of 32', 2, 30, true, now()),
  ('R16', 'Round of 16', 3, 50, true, now()),
  ('QF', 'Quarter Final', 4, 100, true, now()),
  ('SF', 'Semi Final', 5, 150, true, now()),
  ('FINAL', 'Final', 6, 200, true, now())
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  entry_amount = EXCLUDED.entry_amount,
  is_knockout = EXCLUDED.is_knockout;

-- --------------------------------------------------
-- Seed Groups
-- --------------------------------------------------
INSERT INTO groups (code, name, sort_order, created_at)
VALUES
  ('A', 'Group A', 1, now()),
  ('B', 'Group B', 2, now()),
  ('C', 'Group C', 3, now()),
  ('D', 'Group D', 4, now()),
  ('E', 'Group E', 5, now()),
  ('F', 'Group F', 6, now()),
  ('G', 'Group G', 7, now()),
  ('H', 'Group H', 8, now()),
  ('I', 'Group I', 9, now()),
  ('J', 'Group J', 10, now()),
  ('K', 'Group K', 11, now()),
  ('L', 'Group L', 12, now())
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;

-- --------------------------------------------------
-- Seed Teams with Group Assignment
-- Includes all 48 teams. This fixes missing pre-seeded teams such as Argentina, Brazil, France, England, Germany, and Spain too.
-- --------------------------------------------------
WITH team_rows(name, short_name, flag_emoji, group_code) AS (
  VALUES
    ('Mexico', 'MEX', '🇲🇽', 'A'),
    ('South Africa', 'RSA', '🇿🇦', 'A'),
    ('Korea Republic', 'KOR', '🇰🇷', 'A'),
    ('Czechia', 'CZE', '🇨🇿', 'A'),
    ('Canada', 'CAN', '🇨🇦', 'B'),
    ('Bosnia and Herzegovina', 'BIH', '🇧🇦', 'B'),
    ('Qatar', 'QAT', '🇶🇦', 'B'),
    ('Switzerland', 'SUI', '🇨🇭', 'B'),
    ('Brazil', 'BRA', '🇧🇷', 'C'),
    ('Morocco', 'MAR', '🇲🇦', 'C'),
    ('Haiti', 'HAI', '🇭🇹', 'C'),
    ('Scotland', 'SCO', '🏴', 'C'),
    ('United States', 'USA', '🇺🇸', 'D'),
    ('Paraguay', 'PAR', '🇵🇾', 'D'),
    ('Australia', 'AUS', '🇦🇺', 'D'),
    ('Türkiye', 'TUR', '🇹🇷', 'D'),
    ('Côte d''Ivoire', 'CIV', '🇨🇮', 'E'),
    ('Ecuador', 'ECU', '🇪🇨', 'E'),
    ('Germany', 'GER', '🇩🇪', 'E'),
    ('Curaçao', 'CUR', '🇨🇼', 'E'),
    ('Netherlands', 'NED', '🇳🇱', 'F'),
    ('Japan', 'JPN', '🇯🇵', 'F'),
    ('Sweden', 'SWE', '🇸🇪', 'F'),
    ('Tunisia', 'TUN', '🇹🇳', 'F'),
    ('Iran', 'IRN', '🇮🇷', 'G'),
    ('New Zealand', 'NZL', '🇳🇿', 'G'),
    ('Belgium', 'BEL', '🇧🇪', 'G'),
    ('Egypt', 'EGY', '🇪🇬', 'G'),
    ('Saudi Arabia', 'KSA', '🇸🇦', 'H'),
    ('Uruguay', 'URU', '🇺🇾', 'H'),
    ('Spain', 'ESP', '🇪🇸', 'H'),
    ('Cape Verde', 'CPV', '🇨🇻', 'H'),
    ('France', 'FRA', '🇫🇷', 'I'),
    ('Senegal', 'SEN', '🇸🇳', 'I'),
    ('Iraq', 'IRQ', '🇮🇶', 'I'),
    ('Norway', 'NOR', '🇳🇴', 'I'),
    ('Argentina', 'ARG', '🇦🇷', 'J'),
    ('Algeria', 'ALG', '🇩🇿', 'J'),
    ('Austria', 'AUT', '🇦🇹', 'J'),
    ('Jordan', 'JOR', '🇯🇴', 'J'),
    ('Portugal', 'POR', '🇵🇹', 'K'),
    ('DR Congo', 'DRC', '🇨🇩', 'K'),
    ('Uzbekistan', 'UZB', '🇺🇿', 'K'),
    ('Colombia', 'COL', '🇨🇴', 'K'),
    ('Ghana', 'GHA', '🇬🇭', 'L'),
    ('Panama', 'PAN', '🇵🇦', 'L'),
    ('England', 'ENG', '🏴', 'L'),
    ('Croatia', 'CRO', '🇭🇷', 'L')
)
INSERT INTO teams (name, short_name, flag_emoji, flag_url, group_id, created_at)
SELECT
  tr.name,
  tr.short_name,
  tr.flag_emoji,
  NULL,
  g.id,
  now()
FROM team_rows tr
JOIN groups g ON g.code = tr.group_code
ON CONFLICT (name)
DO UPDATE SET
  short_name = EXCLUDED.short_name,
  flag_emoji = EXCLUDED.flag_emoji,
  flag_url = EXCLUDED.flag_url,
  group_id = EXCLUDED.group_id;

-- --------------------------------------------------
-- Seed Group Stage Fixtures
-- lock_at is provided, but your trigger also recalculates lock_at = kickoff_at - 30 minutes.
-- --------------------------------------------------
WITH match_rows(stage_code, home_team, away_team, kickoff_at) AS (
  VALUES
    -- Group A
    ('GROUP', 'Mexico', 'South Africa', '2026-06-11 13:00:00-06'::timestamptz),
    ('GROUP', 'Korea Republic', 'Czechia', '2026-06-11 20:00:00-06'::timestamptz),
    ('GROUP', 'Czechia', 'South Africa', '2026-06-18 12:00:00-04'::timestamptz),
    ('GROUP', 'Mexico', 'Korea Republic', '2026-06-18 19:00:00-06'::timestamptz),
    ('GROUP', 'Czechia', 'Mexico', '2026-06-24 19:00:00-06'::timestamptz),
    ('GROUP', 'South Africa', 'Korea Republic', '2026-06-24 19:00:00-06'::timestamptz),

    -- Group B
    ('GROUP', 'Canada', 'Bosnia and Herzegovina', '2026-06-12 15:00:00-04'::timestamptz),
    ('GROUP', 'Qatar', 'Switzerland', '2026-06-13 12:00:00-07'::timestamptz),
    ('GROUP', 'Switzerland', 'Bosnia and Herzegovina', '2026-06-18 12:00:00-07'::timestamptz),
    ('GROUP', 'Canada', 'Qatar', '2026-06-18 15:00:00-07'::timestamptz),
    ('GROUP', 'Switzerland', 'Canada', '2026-06-24 12:00:00-07'::timestamptz),
    ('GROUP', 'Bosnia and Herzegovina', 'Qatar', '2026-06-24 12:00:00-07'::timestamptz),

    -- Group C
    ('GROUP', 'Brazil', 'Morocco', '2026-06-13 18:00:00-04'::timestamptz),
    ('GROUP', 'Haiti', 'Scotland', '2026-06-13 21:00:00-04'::timestamptz),
    ('GROUP', 'Scotland', 'Morocco', '2026-06-19 18:00:00-04'::timestamptz),
    ('GROUP', 'Brazil', 'Haiti', '2026-06-19 21:00:00-04'::timestamptz),
    ('GROUP', 'Scotland', 'Brazil', '2026-06-24 18:00:00-04'::timestamptz),
    ('GROUP', 'Morocco', 'Haiti', '2026-06-24 18:00:00-04'::timestamptz),

    -- Group D
    ('GROUP', 'United States', 'Paraguay', '2026-06-12 18:00:00-07'::timestamptz),
    ('GROUP', 'Australia', 'Türkiye', '2026-06-13 21:00:00-07'::timestamptz),
    ('GROUP', 'Türkiye', 'Paraguay', '2026-06-19 20:00:00-07'::timestamptz),
    ('GROUP', 'United States', 'Australia', '2026-06-19 12:00:00-07'::timestamptz),
    ('GROUP', 'Türkiye', 'United States', '2026-06-25 19:00:00-07'::timestamptz),
    ('GROUP', 'Paraguay', 'Australia', '2026-06-25 19:00:00-07'::timestamptz),

    -- Group E
    ('GROUP', 'Côte d''Ivoire', 'Ecuador', '2026-06-14 19:00:00-04'::timestamptz),
    ('GROUP', 'Germany', 'Curaçao', '2026-06-14 12:00:00-05'::timestamptz),
    ('GROUP', 'Germany', 'Côte d''Ivoire', '2026-06-20 16:00:00-04'::timestamptz),
    ('GROUP', 'Ecuador', 'Curaçao', '2026-06-20 19:00:00-05'::timestamptz),
    ('GROUP', 'Curaçao', 'Côte d''Ivoire', '2026-06-25 16:00:00-04'::timestamptz),
    ('GROUP', 'Ecuador', 'Germany', '2026-06-25 16:00:00-04'::timestamptz),

    -- Group F
    ('GROUP', 'Netherlands', 'Japan', '2026-06-14 15:00:00-05'::timestamptz),
    ('GROUP', 'Sweden', 'Tunisia', '2026-06-14 20:00:00-06'::timestamptz),
    ('GROUP', 'Netherlands', 'Sweden', '2026-06-20 12:00:00-05'::timestamptz),
    ('GROUP', 'Tunisia', 'Japan', '2026-06-20 22:00:00-06'::timestamptz),
    ('GROUP', 'Japan', 'Sweden', '2026-06-25 18:00:00-05'::timestamptz),
    ('GROUP', 'Tunisia', 'Netherlands', '2026-06-25 18:00:00-05'::timestamptz),

    -- Group G
    ('GROUP', 'Iran', 'New Zealand', '2026-06-15 18:00:00-07'::timestamptz),
    ('GROUP', 'Belgium', 'Egypt', '2026-06-15 12:00:00-07'::timestamptz),
    ('GROUP', 'Belgium', 'Iran', '2026-06-21 12:00:00-07'::timestamptz),
    ('GROUP', 'New Zealand', 'Egypt', '2026-06-21 18:00:00-07'::timestamptz),
    ('GROUP', 'Egypt', 'Iran', '2026-06-26 20:00:00-07'::timestamptz),
    ('GROUP', 'New Zealand', 'Belgium', '2026-06-26 20:00:00-07'::timestamptz),

    -- Group H
    ('GROUP', 'Saudi Arabia', 'Uruguay', '2026-06-15 18:00:00-04'::timestamptz),
    ('GROUP', 'Spain', 'Cape Verde', '2026-06-15 12:00:00-04'::timestamptz),
    ('GROUP', 'Uruguay', 'Cape Verde', '2026-06-21 18:00:00-04'::timestamptz),
    ('GROUP', 'Spain', 'Saudi Arabia', '2026-06-21 12:00:00-04'::timestamptz),
    ('GROUP', 'Cape Verde', 'Saudi Arabia', '2026-06-26 19:00:00-05'::timestamptz),
    ('GROUP', 'Uruguay', 'Spain', '2026-06-26 18:00:00-06'::timestamptz),

    -- Group I
    ('GROUP', 'France', 'Senegal', '2026-06-16 15:00:00-04'::timestamptz),
    ('GROUP', 'Iraq', 'Norway', '2026-06-16 18:00:00-04'::timestamptz),
    ('GROUP', 'Norway', 'Senegal', '2026-06-22 20:00:00-04'::timestamptz),
    ('GROUP', 'France', 'Iraq', '2026-06-22 17:00:00-04'::timestamptz),
    ('GROUP', 'Norway', 'France', '2026-06-26 15:00:00-04'::timestamptz),
    ('GROUP', 'Senegal', 'Iraq', '2026-06-26 15:00:00-04'::timestamptz),

    -- Group J
    ('GROUP', 'Argentina', 'Algeria', '2026-06-16 20:00:00-05'::timestamptz),
    ('GROUP', 'Austria', 'Jordan', '2026-06-16 21:00:00-07'::timestamptz),
    ('GROUP', 'Argentina', 'Austria', '2026-06-22 12:00:00-05'::timestamptz),
    ('GROUP', 'Jordan', 'Algeria', '2026-06-22 20:00:00-07'::timestamptz),
    ('GROUP', 'Algeria', 'Austria', '2026-06-27 21:00:00-05'::timestamptz),
    ('GROUP', 'Jordan', 'Argentina', '2026-06-27 21:00:00-05'::timestamptz),

    -- Group K
    ('GROUP', 'Portugal', 'DR Congo', '2026-06-17 12:00:00-05'::timestamptz),
    ('GROUP', 'Uzbekistan', 'Colombia', '2026-06-17 20:00:00-06'::timestamptz),
    ('GROUP', 'Portugal', 'Uzbekistan', '2026-06-23 12:00:00-05'::timestamptz),
    ('GROUP', 'Colombia', 'DR Congo', '2026-06-23 20:00:00-06'::timestamptz),
    ('GROUP', 'Colombia', 'Portugal', '2026-06-27 19:30:00-04'::timestamptz),
    ('GROUP', 'DR Congo', 'Uzbekistan', '2026-06-27 19:30:00-04'::timestamptz),

    -- Group L
    ('GROUP', 'Ghana', 'Panama', '2026-06-17 19:00:00-04'::timestamptz),
    ('GROUP', 'England', 'Croatia', '2026-06-17 15:00:00-05'::timestamptz),
    ('GROUP', 'England', 'Ghana', '2026-06-23 16:00:00-04'::timestamptz),
    ('GROUP', 'Panama', 'Croatia', '2026-06-23 19:00:00-04'::timestamptz),
    ('GROUP', 'Panama', 'England', '2026-06-27 17:00:00-04'::timestamptz),
    ('GROUP', 'Croatia', 'Ghana', '2026-06-27 17:00:00-04'::timestamptz)
)
INSERT INTO matches (
  stage_id,
  home_team_id,
  away_team_id,
  kickoff_at,
  lock_at,
  status,
  created_at,
  updated_at
)
SELECT
  s.id,
  ht.id,
  at.id,
  mr.kickoff_at,
  mr.kickoff_at - interval '30 minutes',
  'SCHEDULED',
  now(),
  now()
FROM match_rows mr
JOIN stages s ON s.code = mr.stage_code
JOIN teams ht ON ht.name = mr.home_team
JOIN teams at ON at.name = mr.away_team
WHERE NOT EXISTS (
  SELECT 1
  FROM matches m
  WHERE m.home_team_id = ht.id
    AND m.away_team_id = at.id
    AND m.kickoff_at = mr.kickoff_at
);

-- --------------------------------------------------
-- App Settings
-- --------------------------------------------------
INSERT INTO app_settings (key, value)
VALUES
  ('winner_points', '2'::jsonb),
  ('exact_score_points', '2'::jsonb),
  ('one_team_goal_points', '1'::jsonb),
  ('exact_extra_time_score_points', '2'::jsonb),
  ('correct_penalty_winner_points', '2'::jsonb),
  ('prediction_lock_minutes', '30'::jsonb),
  ('default_temporary_password_note', '"Office@2026"'::jsonb)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;
