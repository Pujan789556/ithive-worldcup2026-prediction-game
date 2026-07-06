create or replace function resolve_knockout_final_result(
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_home_score int,
  p_away_score int,
  p_went_extra_time boolean,
  p_home_extra_score int,
  p_away_extra_score int,
  p_went_penalties boolean,
  p_penalty_winner_team_id uuid
)
returns table (
  winner_team_id uuid,
  actual_outcome text
)
language plpgsql
as $$
begin
  winner_team_id := null;
  actual_outcome := null;

  if p_home_score is null or p_away_score is null then
    return;
  end if;

  if p_home_score > p_away_score then
    winner_team_id := p_home_team_id;
    actual_outcome := 'HOME_WIN';
    return next;
    return;
  end if;

  if p_away_score > p_home_score then
    winner_team_id := p_away_team_id;
    actual_outcome := 'AWAY_WIN';
    return next;
    return;
  end if;

  if coalesce(p_went_extra_time, false)
     and p_home_extra_score is not null
     and p_away_extra_score is not null then
    if p_home_extra_score > p_away_extra_score then
      winner_team_id := p_home_team_id;
      actual_outcome := 'HOME_WIN';
      return next;
      return;
    end if;

    if p_away_extra_score > p_home_extra_score then
      winner_team_id := p_away_team_id;
      actual_outcome := 'AWAY_WIN';
      return next;
      return;
    end if;
  end if;

  if not coalesce(p_went_extra_time, false) then
    return;
  end if;

  if coalesce(p_home_extra_score, 0) = coalesce(p_away_extra_score, 0)
     and coalesce(p_went_penalties, false)
     and p_penalty_winner_team_id is not null
     and p_penalty_winner_team_id in (p_home_team_id, p_away_team_id) then
    winner_team_id := p_penalty_winner_team_id;
    actual_outcome := case
      when p_penalty_winner_team_id = p_home_team_id then 'HOME_WIN'
      else 'AWAY_WIN'
    end;
    return next;
    return;
  end if;
end;
$$;

create or replace function resolve_knockout_prediction_result(
  p_home_team_id uuid,
  p_away_team_id uuid,
  p_home_score int,
  p_away_score int,
  p_predicts_extra_time boolean,
  p_home_extra_score int,
  p_away_extra_score int,
  p_predicts_penalties boolean,
  p_predicted_winner_team_id uuid,
  p_penalty_winner_team_id uuid
)
returns table (
  winner_team_id uuid,
  predicted_outcome text
)
language plpgsql
as $$
begin
  winner_team_id := null;
  predicted_outcome := null;

  if p_home_score is null or p_away_score is null then
    return;
  end if;

  if p_home_score > p_away_score then
    winner_team_id := p_home_team_id;
    predicted_outcome := 'HOME_WIN';
    return next;
    return;
  end if;

  if p_away_score > p_home_score then
    winner_team_id := p_away_team_id;
    predicted_outcome := 'AWAY_WIN';
    return next;
    return;
  end if;

  if coalesce(p_predicts_extra_time, false)
     and p_home_extra_score is not null
     and p_away_extra_score is not null then
    if p_home_extra_score > p_away_extra_score then
      winner_team_id := p_home_team_id;
      predicted_outcome := 'HOME_WIN';
      return next;
      return;
    end if;

    if p_away_extra_score > p_home_extra_score then
      winner_team_id := p_away_team_id;
      predicted_outcome := 'AWAY_WIN';
      return next;
      return;
    end if;
  end if;

  if coalesce(p_predicts_extra_time, false)
     and coalesce(p_home_extra_score, 0) = coalesce(p_away_extra_score, 0)
     and coalesce(p_predicts_penalties, false)
     and p_penalty_winner_team_id is not null
     and p_penalty_winner_team_id in (p_home_team_id, p_away_team_id) then
    winner_team_id := p_penalty_winner_team_id;
    predicted_outcome := case
      when p_penalty_winner_team_id = p_home_team_id then 'HOME_WIN'
      else 'AWAY_WIN'
    end;
    return next;
    return;
  end if;

  if p_predicted_winner_team_id is not null
     and p_predicted_winner_team_id in (p_home_team_id, p_away_team_id) then
    winner_team_id := p_predicted_winner_team_id;
    predicted_outcome := case
      when p_predicted_winner_team_id = p_home_team_id then 'HOME_WIN'
      else 'AWAY_WIN'
    end;
    return next;
    return;
  end if;
end;
$$;

create or replace function calculate_match_scores(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match record;
  v_member record;
  v_prediction record;
  v_has_prediction boolean;
  v_knockout_winner_team_id uuid;
  v_knockout_outcome text;
  v_prediction_winner_team_id uuid;
  v_prediction_outcome text;
  v_winner_points int;
  v_goal_points int;
  v_extra_points int;
  v_penalty_points int;
  v_total int;
begin
  select
    m.*,
    s.is_knockout as stage_is_knockout
  into v_match
  from matches m
  join stages s on s.id = m.stage_id
  where m.id = p_match_id;

  delete from match_scores where match_id = p_match_id;

  if coalesce(v_match.stage_is_knockout, false) then
    select winner_team_id, actual_outcome
    into v_knockout_winner_team_id, v_knockout_outcome
    from resolve_knockout_final_result(
      v_match.home_team_id,
      v_match.away_team_id,
      v_match.home_score,
      v_match.away_score,
      v_match.went_extra_time,
      v_match.home_extra_score,
      v_match.away_extra_score,
      v_match.went_penalties,
      v_match.penalty_winner_team_id
    );
  end if;

  for v_member in
    select id
    from members
    where is_active = true
  loop
    select *
    into v_prediction
    from predictions
    where match_id = p_match_id
      and member_id = v_member.id;
    v_has_prediction := found;

    if coalesce(v_match.stage_is_knockout, false) and v_has_prediction then
      select winner_team_id, predicted_outcome
      into v_prediction_winner_team_id, v_prediction_outcome
      from resolve_knockout_prediction_result(
        v_match.home_team_id,
        v_match.away_team_id,
        v_prediction.predicted_home_score,
        v_prediction.predicted_away_score,
        v_prediction.predicts_extra_time,
        v_prediction.predicted_home_extra_score,
        v_prediction.predicted_away_extra_score,
        v_prediction.predicts_penalties,
        v_prediction.predicted_winner_team_id,
        v_prediction.predicted_penalty_winner_team_id
      );
    end if;

    v_winner_points := 0;
    v_goal_points := 0;
    v_extra_points := 0;
    v_penalty_points := 0;
    v_total := 0;

    if not v_has_prediction or v_prediction.status in ('MISSED', 'DISQUALIFIED') then
      v_total := 0;
    elsif coalesce(v_match.stage_is_knockout, false) then
      if v_knockout_winner_team_id is null
         or v_prediction_winner_team_id is null
         or v_prediction_winner_team_id <> v_knockout_winner_team_id then
        v_total := 0;
      else
        v_winner_points := 2;
        if coalesce(v_prediction.predicted_home_score, -1) = coalesce(v_match.home_score, -2)
           and coalesce(v_prediction.predicted_away_score, -1) = coalesce(v_match.away_score, -2) then
          v_goal_points := 2;
        elsif coalesce(v_prediction.predicted_home_score, -1) = coalesce(v_match.home_score, -2)
              or coalesce(v_prediction.predicted_away_score, -1) = coalesce(v_match.away_score, -2) then
          v_goal_points := 1;
        end if;

        if coalesce(v_match.went_extra_time, false)
           and coalesce(v_prediction.predicts_extra_time, false)
           and coalesce(v_prediction.predicted_home_extra_score, -1) = coalesce(v_match.home_extra_score, -2)
           and coalesce(v_prediction.predicted_away_extra_score, -1) = coalesce(v_match.away_extra_score, -2) then
          v_extra_points := 2;
        end if;

        if coalesce(v_match.went_penalties, false)
           and coalesce(v_prediction.predicts_penalties, false)
           and v_prediction.predicted_penalty_winner_team_id = v_match.penalty_winner_team_id then
          v_penalty_points := 2;
        end if;

        v_total := v_winner_points + v_goal_points + v_extra_points + v_penalty_points;
      end if;
    elsif v_prediction.predicted_outcome is null or v_match.actual_outcome is null then
      v_total := 0;
    elsif v_prediction.predicted_outcome <> v_match.actual_outcome then
      v_total := 0;
    else
      v_winner_points := 2;
      if coalesce(v_prediction.predicted_home_score, -1) = coalesce(v_match.home_score, -2)
         and coalesce(v_prediction.predicted_away_score, -1) = coalesce(v_match.away_score, -2) then
        v_goal_points := 2;
      elsif coalesce(v_prediction.predicted_home_score, -1) = coalesce(v_match.home_score, -2)
            or coalesce(v_prediction.predicted_away_score, -1) = coalesce(v_match.away_score, -2) then
        v_goal_points := 1;
      end if;

      if coalesce(v_match.went_extra_time, false)
         and coalesce(v_prediction.predicts_extra_time, false)
         and coalesce(v_prediction.predicted_home_extra_score, -1) = coalesce(v_match.home_extra_score, -2)
         and coalesce(v_prediction.predicted_away_extra_score, -1) = coalesce(v_match.away_extra_score, -2) then
        v_extra_points := 2;
      end if;

      if coalesce(v_match.went_penalties, false)
         and coalesce(v_prediction.predicts_penalties, false)
         and v_prediction.predicted_penalty_winner_team_id = v_match.penalty_winner_team_id then
        v_penalty_points := 2;
      end if;

      v_total := v_winner_points + v_goal_points + v_extra_points + v_penalty_points;
    end if;

    insert into match_scores (
      match_id,
      member_id,
      prediction_id,
      winner_points,
      goal_points,
      extra_time_points,
      penalty_points,
      total_points,
      notes,
      calculated_at
    )
    values (
      p_match_id,
      v_member.id,
      case when v_has_prediction then v_prediction.id else null end,
      v_winner_points,
      v_goal_points,
      v_extra_points,
      v_penalty_points,
      v_total,
      null,
      now()
    )
    on conflict (match_id, member_id)
    do update set
      prediction_id = excluded.prediction_id,
      winner_points = excluded.winner_points,
      goal_points = excluded.goal_points,
      extra_time_points = excluded.extra_time_points,
      penalty_points = excluded.penalty_points,
      total_points = excluded.total_points,
      calculated_at = now();
  end loop;
end;
$$;

create or replace function finalize_match_result(
  p_match_id uuid,
  p_home_score int,
  p_away_score int,
  p_went_extra_time boolean,
  p_home_extra_score int,
  p_away_extra_score int,
  p_went_penalties boolean,
  p_penalty_winner_team_id uuid,
  p_actual_outcome text,
  p_winner_team_id uuid,
  p_lock_result boolean default false,
  p_locked_by uuid default null
)
returns void
language plpgsql
as $$
declare
  v_is_locked boolean;
  v_match record;
  v_knockout_winner_team_id uuid;
  v_knockout_outcome text;
begin
  select result_locked into v_is_locked
  from matches
  where id = p_match_id;

  if coalesce(v_is_locked, false) then
    raise exception 'Result is locked.';
  end if;

  select
    m.*,
    s.is_knockout as stage_is_knockout
  into v_match
  from matches m
  join stages s on s.id = m.stage_id
  where m.id = p_match_id;

  if coalesce(v_match.stage_is_knockout, false) then
    select winner_team_id, actual_outcome
    into v_knockout_winner_team_id, v_knockout_outcome
    from resolve_knockout_final_result(
      v_match.home_team_id,
      v_match.away_team_id,
      p_home_score,
      p_away_score,
      p_went_extra_time,
      p_home_extra_score,
      p_away_extra_score,
      p_went_penalties,
      p_penalty_winner_team_id
    );

    if v_knockout_winner_team_id is null then
      raise exception 'Knockout result is incomplete.';
    end if;

    if p_home_score <> p_away_score then
      if coalesce(p_went_extra_time, false)
         or coalesce(p_went_penalties, false)
         or p_home_extra_score is not null
         or p_away_extra_score is not null
         or p_penalty_winner_team_id is not null then
        raise exception 'Extra time and penalties are only available when regular time is tied.';
      end if;
    elsif coalesce(p_went_extra_time, false)
       and p_home_extra_score is not null
       and p_away_extra_score is not null
       and p_home_extra_score <> p_away_extra_score
       and (coalesce(p_went_penalties, false) or p_penalty_winner_team_id is not null) then
      raise exception 'Penalty winner is only needed when extra time is tied.';
    end if;

    if p_actual_outcome <> v_knockout_outcome then
      raise exception 'Knockout result must follow the score, extra time, and penalty order.';
    end if;

    if p_winner_team_id <> v_knockout_winner_team_id then
      raise exception 'Winner team must match the final result.';
    end if;
  end if;

  update matches
  set home_score = p_home_score,
      away_score = p_away_score,
      went_extra_time = coalesce(p_went_extra_time, false),
      home_extra_score = p_home_extra_score,
      away_extra_score = p_away_extra_score,
      went_penalties = coalesce(p_went_penalties, false),
      penalty_winner_team_id = p_penalty_winner_team_id,
      actual_outcome = case
        when coalesce(v_match.stage_is_knockout, false) then v_knockout_outcome
        else p_actual_outcome
      end,
      winner_team_id = case
        when coalesce(v_match.stage_is_knockout, false) then v_knockout_winner_team_id
        else p_winner_team_id
      end,
      result_locked = coalesce(p_lock_result, false),
      result_locked_at = case when coalesce(p_lock_result, false) then now() else null end,
      result_locked_by = case when coalesce(p_lock_result, false) then p_locked_by else null end,
      updated_at = now()
  where id = p_match_id;

  perform calculate_match_scores(p_match_id);
  perform calculate_prize_distribution(p_match_id);
end;
$$;

create or replace function recalculate_points_and_amounts(
  p_match_id uuid default null
)
returns int
language plpgsql
as $$
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
  loop
    perform calculate_match_scores(v_match.id);
    perform calculate_prize_distribution(v_match.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
