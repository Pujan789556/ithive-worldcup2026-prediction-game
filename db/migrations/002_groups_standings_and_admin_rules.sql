create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  sort_order int not null,
  created_at timestamptz default now()
);

alter table teams
  add column if not exists group_id uuid references groups(id);

create index if not exists idx_teams_group_id on teams(group_id);
create index if not exists idx_groups_sort_order on groups(sort_order);
create or replace function get_group_standings()
returns table (
  group_id uuid,
  group_code text,
  group_name text,
  standing_position int,
  team_id uuid,
  team_name text,
  short_name text,
  flag_emoji text,
  played int,
  won int,
  drawn int,
  lost int,
  goals_for int,
  goals_against int,
  goal_difference int,
  points int
)
language sql
as $$
  with completed_group_matches as (
    select
      m.id,
      m.home_team_id,
      m.away_team_id,
      m.home_score,
      m.away_score,
      case
        when m.home_score > m.away_score then m.home_team_id
        when m.away_score > m.home_score then m.away_team_id
        else null
      end as winner_team_id
    from matches m
    join stages s on s.id = m.stage_id
    where s.code = 'GROUP'
      and m.status = 'COMPLETED'
      and m.home_score is not null
      and m.away_score is not null
  ),
  team_stats as (
    select
      t.id as team_id,
      t.group_id,
      count(*) filter (where gm.id is not null) as played,
      count(*) filter (where gm.winner_team_id = t.id) as won,
      count(*) filter (
        where gm.id is not null
          and gm.home_score is not distinct from gm.away_score
      ) as drawn,
      count(*) filter (
        where gm.id is not null
          and gm.winner_team_id is not null
          and gm.winner_team_id <> t.id
      ) as lost,
      coalesce(sum(
        case
          when gm.home_team_id = t.id then coalesce(gm.home_score, 0)
          when gm.away_team_id = t.id then coalesce(gm.away_score, 0)
          else 0
        end
      ), 0) as goals_for,
      coalesce(sum(
        case
          when gm.home_team_id = t.id then coalesce(gm.away_score, 0)
          when gm.away_team_id = t.id then coalesce(gm.home_score, 0)
          else 0
        end
      ), 0) as goals_against
    from teams t
    left join completed_group_matches gm
      on gm.home_team_id = t.id or gm.away_team_id = t.id
    where t.group_id is not null
    group by t.id, t.group_id
  )
  select
    g.id as group_id,
    g.code as group_code,
    g.name as group_name,
    row_number() over (
      partition by g.id
      order by
        (coalesce(ts.won, 0) * 3 + coalesce(ts.drawn, 0)) desc,
        coalesce((coalesce(ts.goals_for, 0) - coalesce(ts.goals_against, 0)), 0) desc,
        coalesce(ts.goals_for, 0) desc,
        t.name asc
    )::int as standing_position,
    t.id as team_id,
    t.name as team_name,
    t.short_name,
    t.flag_emoji,
    coalesce(ts.played, 0)::int as played,
    coalesce(ts.won, 0)::int as won,
    coalesce(ts.drawn, 0)::int as drawn,
    coalesce(ts.lost, 0)::int as lost,
    coalesce(ts.goals_for, 0)::int as goals_for,
    coalesce(ts.goals_against, 0)::int as goals_against,
    (coalesce(ts.goals_for, 0) - coalesce(ts.goals_against, 0))::int as goal_difference,
    (coalesce(ts.won, 0) * 3 + coalesce(ts.drawn, 0))::int as points
  from teams t
  join groups g on g.id = t.group_id
  left join team_stats ts on ts.team_id = t.id
  order by g.sort_order asc, points desc, goal_difference desc, goals_for desc, t.name asc;
$$;

drop function if exists get_match_prediction_summary(uuid, uuid);
create or replace function get_match_prediction_summary(
  p_match_id uuid,
  p_member_id uuid
)
returns table (
  member_id uuid,
  full_name text,
  submission_status text,
  details_visible boolean,
  prediction_id uuid,
  predicted_outcome text,
  predicted_winner_team_id uuid,
  predicted_home_score int,
  predicted_away_score int,
  predicts_extra_time boolean,
  predicted_home_extra_score int,
  predicted_away_extra_score int,
  predicts_penalties boolean,
  predicted_penalty_winner_team_id uuid,
  winner_points int,
  goal_points int,
  extra_time_points int,
  penalty_points int,
  total_points int,
  prize_amount numeric(12,2),
  contribution_amount numeric(12,2),
  payment_status text
)
language plpgsql
as $$
declare
  v_role text;
  v_match_status text;
  v_is_locked boolean;
begin
  select role into v_role from members where id = p_member_id and is_active = true;
  select status into v_match_status from matches where id = p_match_id;
  v_is_locked := coalesce(v_match_status in ('LOCKED', 'LIVE', 'COMPLETED'), false);

  return query
    with member_rows as (
      select m.id as member_id, m.full_name
      from members m
      where m.is_active = true
    ),
    pred as (
      select *
      from predictions
      where match_id = p_match_id
    ),
    scores as (
      select *
      from match_scores
      where match_id = p_match_id
    ),
    prizes as (
      select *
      from prize_distributions
      where match_id = p_match_id
    ),
    contrib as (
      select *
      from contributions
      where match_id = p_match_id
    )
    select
      mr.member_id,
      mr.full_name,
      coalesce(pred.status, 'NOT_SUBMITTED') as submission_status,
      case
        when v_is_locked then true
        when v_role = 'ADMIN' then false
        when mr.member_id = p_member_id then true
        else false
      end as details_visible,
      case
        when v_is_locked then pred.id
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.id
        else null
      end as prediction_id,
      case
        when v_is_locked then pred.predicted_outcome
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_outcome
        else null
      end as predicted_outcome,
      case
        when v_is_locked then pred.predicted_winner_team_id
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_winner_team_id
        else null
      end as predicted_winner_team_id,
      case
        when v_is_locked then pred.predicted_home_score
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_home_score
        else null
      end as predicted_home_score,
      case
        when v_is_locked then pred.predicted_away_score
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_away_score
        else null
      end as predicted_away_score,
      case
        when v_is_locked then pred.predicts_extra_time
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicts_extra_time
        else null
      end as predicts_extra_time,
      case
        when v_is_locked then pred.predicted_home_extra_score
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_home_extra_score
        else null
      end as predicted_home_extra_score,
      case
        when v_is_locked then pred.predicted_away_extra_score
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_away_extra_score
        else null
      end as predicted_away_extra_score,
      case
        when v_is_locked then pred.predicts_penalties
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicts_penalties
        else null
      end as predicts_penalties,
      case
        when v_is_locked then pred.predicted_penalty_winner_team_id
        when v_role = 'ADMIN' then null
        when mr.member_id = p_member_id then pred.predicted_penalty_winner_team_id
        else null
      end as predicted_penalty_winner_team_id,
      case when v_is_locked then coalesce(scores.winner_points, 0) else null end as winner_points,
      case when v_is_locked then coalesce(scores.goal_points, 0) else null end as goal_points,
      case when v_is_locked then coalesce(scores.extra_time_points, 0) else null end as extra_time_points,
      case when v_is_locked then coalesce(scores.penalty_points, 0) else null end as penalty_points,
      case when v_is_locked then coalesce(scores.total_points, 0) else null end as total_points,
      case when v_is_locked then coalesce(prizes.prize_amount, 0) else null end as prize_amount,
      case when v_is_locked then coalesce(contrib.amount, 0) else null end as contribution_amount,
      case when v_is_locked then contrib.payment_status else null end as payment_status
    from member_rows mr
    left join pred on pred.member_id = mr.member_id
    left join scores on scores.member_id = mr.member_id
    left join prizes on prizes.member_id = mr.member_id
    left join contrib on contrib.member_id = mr.member_id
    order by mr.full_name asc;
end;
$$;

drop function if exists get_completed_match_breakdown(uuid);
create or replace function get_completed_match_breakdown(p_match_id uuid)
returns table (
  member_id uuid,
  full_name text,
  submission_status text,
  details_visible boolean,
  prediction_id uuid,
  predicted_outcome text,
  predicted_winner_team_id uuid,
  predicted_home_score int,
  predicted_away_score int,
  predicts_extra_time boolean,
  predicted_home_extra_score int,
  predicted_away_extra_score int,
  predicts_penalties boolean,
  predicted_penalty_winner_team_id uuid,
  winner_points int,
  goal_points int,
  extra_time_points int,
  penalty_points int,
  total_points int,
  prize_amount numeric(12,2),
  contribution_amount numeric(12,2),
  payment_status text
)
language sql
as $$
  select
    s.member_id,
    s.full_name,
    s.submission_status,
    s.details_visible,
    s.prediction_id,
    s.predicted_outcome,
    s.predicted_winner_team_id,
    s.predicted_home_score,
    s.predicted_away_score,
    s.predicts_extra_time,
    s.predicted_home_extra_score,
    s.predicted_away_extra_score,
    s.predicts_penalties,
    s.predicted_penalty_winner_team_id,
    s.winner_points,
    s.goal_points,
    s.extra_time_points,
    s.penalty_points,
    s.total_points,
    s.prize_amount,
    s.contribution_amount,
    s.payment_status
  from get_match_prediction_summary(p_match_id, (select id from members where role = 'ADMIN' order by created_at asc limit 1)) s
  where exists (select 1 from matches m where m.id = p_match_id and m.status = 'COMPLETED');
$$;
