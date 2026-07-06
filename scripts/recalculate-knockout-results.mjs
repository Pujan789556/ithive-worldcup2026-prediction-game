import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const databaseUrl =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL, POSTGRES_URL, or DATABASE_URL_UNPOOLED.");
  process.exit(1);
}

const matchId = process.argv[2] && process.argv[2] !== "--all" ? process.argv[2] : null;
const recalculateAll = process.argv.includes("--all") || !matchId;

const scopeSql = recalculateAll
  ? ""
  : `and m.id = '${matchId.replaceAll("'", "''")}'`;

const sql = `
with knockout_matches as (
  select
    m.id,
    m.home_team_id,
    m.away_team_id,
    m.home_score,
    m.away_score,
    m.went_extra_time,
    m.home_extra_score,
    m.away_extra_score,
    m.went_penalties,
    m.penalty_winner_team_id,
    m.actual_outcome as current_actual_outcome,
    m.winner_team_id as current_winner_team_id,
    case
      when m.home_score is null or m.away_score is null then null
      when m.home_score > m.away_score then m.home_team_id
      when m.away_score > m.home_score then m.away_team_id
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.home_extra_score > m.away_extra_score then m.home_team_id
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.away_extra_score > m.home_extra_score then m.away_team_id
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.home_extra_score = m.away_extra_score
           and coalesce(m.went_penalties, false)
           and m.penalty_winner_team_id is not null then m.penalty_winner_team_id
      else null
    end as resolved_winner_team_id,
    case
      when m.home_score is null or m.away_score is null then null
      when m.home_score > m.away_score then 'HOME_WIN'
      when m.away_score > m.home_score then 'AWAY_WIN'
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.home_extra_score > m.away_extra_score then 'HOME_WIN'
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.away_extra_score > m.home_extra_score then 'AWAY_WIN'
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.home_extra_score = m.away_extra_score
           and coalesce(m.went_penalties, false)
           and m.penalty_winner_team_id is not null
           and m.penalty_winner_team_id = m.home_team_id then 'HOME_WIN'
      when coalesce(m.went_extra_time, false)
           and m.home_extra_score is not null
           and m.away_extra_score is not null
           and m.home_extra_score = m.away_extra_score
           and coalesce(m.went_penalties, false)
           and m.penalty_winner_team_id is not null
           and m.penalty_winner_team_id = m.away_team_id then 'AWAY_WIN'
      else null
    end as resolved_actual_outcome
  from matches m
  join stages s on s.id = m.stage_id
  where s.is_knockout = true
    and m.home_score is not null
    and m.away_score is not null
    ${scopeSql}
),
updated_matches as (
  update matches m
  set winner_team_id = km.resolved_winner_team_id,
      actual_outcome = km.resolved_actual_outcome,
      updated_at = now()
  from knockout_matches km
  where km.id = m.id
    and (
      m.winner_team_id is distinct from km.resolved_winner_team_id
      or m.actual_outcome is distinct from km.resolved_actual_outcome
    )
  returning m.id
),
recalc_targets as (
  select id from knockout_matches
  union
  select id from updated_matches
)
select
  (select count(*) from knockout_matches) as inspected_matches,
  (select count(*) from updated_matches) as updated_matches,
  (
    select count(*)
    from recalc_targets rt
  ) as recalculation_targets;

do $$
declare
  v_match record;
begin
  for v_match in
    select m.id
    from matches m
    join stages s on s.id = m.stage_id
    where s.is_knockout = true
      and m.home_score is not null
      and m.away_score is not null
      ${scopeSql}
  loop
    perform calculate_match_scores(v_match.id);
    perform calculate_prize_distribution(v_match.id);
  end loop;
end;
$$;
`;

const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-c", sql], {
  stdio: "inherit"
});

if (result.error) {
  console.error("Could not run psql. Install PostgreSQL client tools or run the SQL in Neon.");
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
