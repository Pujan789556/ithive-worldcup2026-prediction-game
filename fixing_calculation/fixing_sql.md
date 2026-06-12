create or replace function fix_prediction_consistency(
p_match_id uuid default null,
p_member_id uuid default null
)
returns bigint
language plpgsql
as $$
declare
v_updated bigint := 0;
begin
with expected as (
select
p.id,
case
when p.predicted_home_score > p.predicted_away_score then 'HOME_WIN'::text
when p.predicted_home_score < p.predicted_away_score then 'AWAY_WIN'::text
else 'DRAW'::text
end as expected_outcome,
case
when p.predicted_home_score > p.predicted_away_score then m.home_team_id
when p.predicted_home_score < p.predicted_away_score then m.away_team_id
else null
end as expected_winner_team_id
from predictions p
join matches m on m.id = p.match_id
where p.predicted_home_score is not null
and p.predicted_away_score is not null
and (p_match_id is null or p.match_id = p_match_id)
and (p_member_id is null or p.member_id = p_member_id)
),
updated as (
update predictions p
set predicted_outcome = e.expected_outcome,
predicted_winner_team_id = e.expected_winner_team_id,
updated_at = now()
from expected e
where p.id = e.id
and (
p.predicted_outcome is distinct from e.expected_outcome
or p.predicted_winner_team_id is distinct from e.expected_winner_team_id
)
returning 1
)
select count(\*) into v_updated from updated;

return v_updated;
end;

$$
;






TO Check

select
  p.id,
  p.match_id,
  p.member_id,
  p.predicted_home_score,
  p.predicted_away_score,
  p.predicted_outcome as current_outcome,
  case
    when p.predicted_home_score > p.predicted_away_score then 'HOME_WIN'
    when p.predicted_home_score < p.predicted_away_score then 'AWAY_WIN'
    else 'DRAW'
  end as expected_outcome,
  p.predicted_winner_team_id as current_winner_team_id,
  case
    when p.predicted_home_score > p.predicted_away_score then m.home_team_id
    when p.predicted_home_score < p.predicted_away_score then m.away_team_id
    else null
  end as expected_winner_team_id
from predictions p
join matches m on m.id = p.match_id
where p.predicted_home_score is not null
  and p.predicted_away_score is not null
  and (
    p.predicted_outcome is distinct from case
      when p.predicted_home_score > p.predicted_away_score then 'HOME_WIN'
      when p.predicted_home_score < p.predicted_away_score then 'AWAY_WIN'
      else 'DRAW'
    end
    or p.predicted_winner_team_id is distinct from case
      when p.predicted_home_score > p.predicted_away_score then m.home_team_id
      when p.predicted_home_score < p.predicted_away_score then m.away_team_id
      else null
    end
  );



  To RUn:
  select fix_prediction_consistency();





// Re calculate

  create or replace function recalculate_points_and_amounts(
  p_match_id uuid default null
)
returns int
language plpgsql
as
$$

declare
v_match record;
v_count int := 0;
begin
for v_match in
select id
from matches
where (p_match_id is null or id = p_match_id)
and status in ('LOCKED', 'COMPLETED')
and home_score is not null
and away_score is not null
and actual_outcome is not null
loop
perform calculate_match_scores(v_match.id);
perform calculate_prize_distribution(v_match.id);
v_count := v_count + 1;
end loop;

return v_count;
end;

$$
;

To Run

select recalculate_points_and_amounts();
$$
