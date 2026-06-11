alter table matches
  add column if not exists result_locked boolean not null default false,
  add column if not exists result_locked_at timestamptz,
  add column if not exists result_locked_by uuid references members(id);

create or replace function lock_expired_matches()
returns void
language plpgsql
as $$
declare
  locked_match record;
begin
  update matches
  set status = 'LOCKED',
      updated_at = now()
  where status = 'SCHEDULED'
    and now() >= lock_at;

  update predictions p
  set status = 'LOCKED',
      updated_at = now()
  from matches m
  where p.match_id = m.id
    and m.status = 'LOCKED'
    and p.status = 'SUBMITTED';

  for locked_match in
    select m.id, m.stage_id, s.entry_amount
    from matches m
    join stages s on s.id = m.stage_id
    where m.status = 'LOCKED'
      and now() >= m.lock_at
  loop
    insert into predictions (
      match_id, member_id, status, submitted_at, updated_at
    )
    select
      locked_match.id,
      mem.id,
      'MISSED',
      now(),
      now()
    from members mem
    where mem.is_active = true
      and not exists (
        select 1
        from predictions p
        where p.match_id = locked_match.id
          and p.member_id = mem.id
      )
    on conflict (match_id, member_id)
    do update set status = 'MISSED', updated_at = now();

    insert into contributions (match_id, member_id, amount, payment_status, created_at, updated_at)
    select
      locked_match.id,
      mem.id,
      locked_match.entry_amount,
      'PENDING',
      now(),
      now()
    from members mem
    where mem.is_active = true
      and not exists (
        select 1
        from contributions c
        where c.match_id = locked_match.id
          and c.member_id = mem.id
      )
    on conflict (match_id, member_id)
    do update set
      amount = excluded.amount,
      updated_at = now();
  end loop;
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
  v_winner_points int;
  v_goal_points int;
  v_extra_points int;
  v_penalty_points int;
  v_total int;
begin
  select * into v_match
  from matches
  where id = p_match_id;

  delete from match_scores where match_id = p_match_id;

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

    v_winner_points := 0;
    v_goal_points := 0;
    v_extra_points := 0;
    v_penalty_points := 0;
    v_total := 0;

    if not v_has_prediction or v_prediction.status in ('MISSED', 'DISQUALIFIED') then
      v_total := 0;
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

create or replace function calculate_prize_distribution(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_total_pool numeric(12,2);
  v_total_points int;
  v_score record;
begin
  delete from prize_distributions where match_id = p_match_id;
  delete from unresolved_pools where match_id = p_match_id;

  select coalesce(sum(amount), 0) into v_total_pool
  from contributions
  where match_id = p_match_id
    and payment_status in ('PENDING', 'PAID');

  select coalesce(sum(total_points), 0) into v_total_points
  from match_scores
  where match_id = p_match_id;

  if v_total_points > 0 then
    for v_score in
      select member_id, total_points
      from match_scores
      where match_id = p_match_id
    loop
      insert into prize_distributions (
        match_id,
        member_id,
        total_match_pool,
        user_points,
        total_points,
        prize_amount,
        created_at
      )
      values (
        p_match_id,
        v_score.member_id,
        v_total_pool,
        v_score.total_points,
        v_total_points,
        round((v_total_pool * v_score.total_points::numeric / v_total_points::numeric)::numeric, 2),
        now()
      )
      on conflict (match_id, member_id)
      do update set
        total_match_pool = excluded.total_match_pool,
        user_points = excluded.user_points,
        total_points = excluded.total_points,
        prize_amount = excluded.prize_amount,
        created_at = now();
    end loop;
  else
    insert into unresolved_pools (match_id, amount, reason, status, created_at)
    values (p_match_id, v_total_pool, 'No points were scored, so the pool stays unresolved.', 'UNRESOLVED', now());
  end if;
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
begin
  select result_locked into v_is_locked
  from matches
  where id = p_match_id;

  if coalesce(v_is_locked, false) then
    raise exception 'Result is locked.';
  end if;

  update matches
  set home_score = p_home_score,
      away_score = p_away_score,
      went_extra_time = coalesce(p_went_extra_time, false),
      home_extra_score = p_home_extra_score,
      away_extra_score = p_away_extra_score,
      went_penalties = coalesce(p_went_penalties, false),
      penalty_winner_team_id = p_penalty_winner_team_id,
      actual_outcome = p_actual_outcome,
      winner_team_id = p_winner_team_id,
      result_locked = coalesce(p_lock_result, false),
      result_locked_at = case when coalesce(p_lock_result, false) then now() else null end,
      result_locked_by = case when coalesce(p_lock_result, false) then p_locked_by else null end,
      updated_at = now()
  where id = p_match_id;

  perform calculate_match_scores(p_match_id);
  perform calculate_prize_distribution(p_match_id);
end;
$$;
