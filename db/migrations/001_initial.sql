create extension if not exists pgcrypto;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('ADMIN', 'MEMBER')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  short_name text,
  flag_emoji text,
  flag_url text,
  created_at timestamptz default now()
);

create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  sort_order int not null,
  entry_amount numeric(12,2) not null,
  is_knockout boolean default false,
  created_at timestamptz default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid references stages(id),
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  kickoff_at timestamptz not null,
  lock_at timestamptz not null,
  status text not null check (status in ('SCHEDULED', 'LOCKED', 'LIVE', 'COMPLETED', 'CANCELLED')) default 'SCHEDULED',
  home_score int,
  away_score int,
  went_extra_time boolean default false,
  home_extra_score int,
  away_extra_score int,
  went_penalties boolean default false,
  penalty_winner_team_id uuid references teams(id),
  actual_outcome text check (actual_outcome in ('HOME_WIN', 'AWAY_WIN', 'DRAW')),
  winner_team_id uuid references teams(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  predicted_outcome text check (predicted_outcome in ('HOME_WIN', 'AWAY_WIN', 'DRAW')),
  predicted_winner_team_id uuid references teams(id),
  predicted_home_score int,
  predicted_away_score int,
  predicts_extra_time boolean default false,
  predicted_home_extra_score int,
  predicted_away_extra_score int,
  predicts_penalties boolean default false,
  predicted_penalty_winner_team_id uuid references teams(id),
  status text not null check (status in ('SUBMITTED', 'LOCKED', 'MISSED', 'DISQUALIFIED')) default 'SUBMITTED',
  submitted_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(match_id, member_id)
);

create table if not exists match_scores (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  prediction_id uuid references predictions(id) on delete cascade,
  winner_points int default 0,
  goal_points int default 0,
  extra_time_points int default 0,
  penalty_points int default 0,
  total_points int default 0,
  notes text,
  calculated_at timestamptz default now(),
  unique(match_id, member_id)
);

create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_status text not null check (payment_status in ('PENDING', 'PAID', 'WAIVED')) default 'PENDING',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(match_id, member_id)
);

create table if not exists prize_distributions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  total_match_pool numeric(12,2) not null,
  user_points int not null,
  total_points int not null,
  prize_amount numeric(12,2) not null,
  created_at timestamptz default now(),
  unique(match_id, member_id)
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null
);

create table if not exists unresolved_pools (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  amount numeric(12,2) not null,
  reason text,
  status text check (status in ('UNRESOLVED', 'CARRIED_FORWARD', 'SPLIT_EQUALLY', 'MANUAL')) default 'UNRESOLVED',
  created_at timestamptz default now(),
  unique (match_id)
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function set_match_lock_at()
returns trigger
language plpgsql
as $$
begin
  new.lock_at = new.kickoff_at - interval '30 minutes';
  return new;
end;
$$;

drop trigger if exists trg_matches_lock_at on matches;
create trigger trg_matches_lock_at
before insert or update on matches
for each row execute function set_match_lock_at();

drop trigger if exists trg_matches_updated_at on matches;
create trigger trg_matches_updated_at
before update on matches
for each row execute function set_updated_at();

drop trigger if exists trg_predictions_updated_at on predictions;
create trigger trg_predictions_updated_at
before update on predictions
for each row execute function set_updated_at();

drop trigger if exists trg_contributions_updated_at on contributions;
create trigger trg_contributions_updated_at
before update on contributions
for each row execute function set_updated_at();

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
  end loop;
end;
$$;

create or replace function submit_prediction(
  p_member_id uuid,
  p_match_id uuid,
  p_predicted_outcome text,
  p_predicted_winner_team_id uuid,
  p_predicted_home_score int,
  p_predicted_away_score int,
  p_predicts_extra_time boolean,
  p_predicted_home_extra_score int,
  p_predicted_away_extra_score int,
  p_predicts_penalties boolean,
  p_predicted_penalty_winner_team_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_prediction_id uuid;
  v_member_active boolean;
  v_match_lock timestamptz;
  v_match_status text;
  v_stage_amount numeric(12,2);
begin
  select is_active into v_member_active
  from members
  where id = p_member_id;

  if coalesce(v_member_active, false) = false then
    raise exception 'Member inactive';
  end if;

  select m.lock_at, m.status, s.entry_amount
  into v_match_lock, v_match_status, v_stage_amount
  from matches m
  join stages s on s.id = m.stage_id
  where m.id = p_match_id;

  if not found then
    raise exception 'Match not found';
  end if;

  if now() >= v_match_lock then
    raise exception 'Prediction locked';
  end if;

  if v_match_status <> 'SCHEDULED' then
    raise exception 'Match is not open for predictions';
  end if;

  insert into predictions (
    match_id,
    member_id,
    predicted_outcome,
    predicted_winner_team_id,
    predicted_home_score,
    predicted_away_score,
    predicts_extra_time,
    predicted_home_extra_score,
    predicted_away_extra_score,
    predicts_penalties,
    predicted_penalty_winner_team_id,
    status,
    submitted_at,
    updated_at
  )
  values (
    p_match_id,
    p_member_id,
    p_predicted_outcome,
    p_predicted_winner_team_id,
    p_predicted_home_score,
    p_predicted_away_score,
    coalesce(p_predicts_extra_time, false),
    p_predicted_home_extra_score,
    p_predicted_away_extra_score,
    coalesce(p_predicts_penalties, false),
    p_predicted_penalty_winner_team_id,
    'SUBMITTED',
    now(),
    now()
  )
  on conflict (match_id, member_id)
  do update set
    predicted_outcome = excluded.predicted_outcome,
    predicted_winner_team_id = excluded.predicted_winner_team_id,
    predicted_home_score = excluded.predicted_home_score,
    predicted_away_score = excluded.predicted_away_score,
    predicts_extra_time = excluded.predicts_extra_time,
    predicted_home_extra_score = excluded.predicted_home_extra_score,
    predicted_away_extra_score = excluded.predicted_away_extra_score,
    predicts_penalties = excluded.predicts_penalties,
    predicted_penalty_winner_team_id = excluded.predicted_penalty_winner_team_id,
    status = 'SUBMITTED',
    updated_at = now()
  returning id into v_prediction_id;

  insert into contributions (match_id, member_id, amount, payment_status, created_at, updated_at)
  values (p_match_id, p_member_id, v_stage_amount, 'PENDING', now(), now())
  on conflict (match_id, member_id)
  do update set amount = excluded.amount, updated_at = now();

  return v_prediction_id;
end;
$$;

create or replace function calculate_match_scores(p_match_id uuid)
returns void
language plpgsql
as $$
declare
  v_match record;
  v_prediction record;
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

  for v_prediction in
    select *
    from predictions
    where match_id = p_match_id
  loop
    v_winner_points := 0;
    v_goal_points := 0;
    v_extra_points := 0;
    v_penalty_points := 0;
    v_total := 0;

    if v_prediction.status in ('MISSED', 'DISQUALIFIED') then
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
      v_prediction.member_id,
      v_prediction.id,
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
  p_winner_team_id uuid
)
returns void
language plpgsql
as $$
begin
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
      status = 'COMPLETED',
      updated_at = now()
  where id = p_match_id;

  perform calculate_match_scores(p_match_id);
  perform calculate_prize_distribution(p_match_id);
end;
$$;

create or replace function get_leaderboard()
returns table (
  member_id uuid,
  full_name text,
  email text,
  total_points int,
  total_contributed numeric(12,2),
  total_winnings numeric(12,2),
  net_amount numeric(12,2),
  rank int
)
language sql
as $$
  with points as (
    select member_id, coalesce(sum(total_points), 0) as total_points
    from match_scores
    group by member_id
  ),
  contributed as (
    select member_id, coalesce(sum(amount), 0) as total_contributed
    from contributions
    where payment_status in ('PENDING', 'PAID')
    group by member_id
  ),
  winnings as (
    select member_id, coalesce(sum(prize_amount), 0) as total_winnings
    from prize_distributions
    group by member_id
  )
  select
    m.id as member_id,
    m.full_name,
    m.email,
    coalesce(p.total_points, 0)::int as total_points,
    coalesce(c.total_contributed, 0)::numeric(12,2) as total_contributed,
    coalesce(w.total_winnings, 0)::numeric(12,2) as total_winnings,
    (coalesce(w.total_winnings, 0) - coalesce(c.total_contributed, 0))::numeric(12,2) as net_amount,
    row_number() over (
      order by coalesce(p.total_points, 0) desc,
               coalesce(w.total_winnings, 0) desc,
               coalesce(c.total_contributed, 0) desc,
               m.full_name asc
    )::int as rank
  from members m
  left join points p on p.member_id = m.id
  left join contributed c on c.member_id = m.id
  left join winnings w on w.member_id = m.id
  where m.is_active = true
  order by rank asc;
$$;

create or replace function get_match_prediction_summary(
  p_match_id uuid,
  p_member_id uuid
)
returns table (
  prediction_id uuid,
  member_id uuid,
  full_name text,
  predicted_outcome text,
  predicted_winner_team_id uuid,
  predicted_home_score int,
  predicted_away_score int,
  predicts_extra_time boolean,
  predicted_home_extra_score int,
  predicted_away_extra_score int,
  predicts_penalties boolean,
  predicted_penalty_winner_team_id uuid,
  status text,
  can_view boolean
)
language plpgsql
as $$
declare
  v_role text;
  v_match_status text;
begin
  select role into v_role from members where id = p_member_id;
  select status into v_match_status from matches where id = p_match_id;

  return query
    select
      p.id as prediction_id,
      p.member_id,
      m.full_name,
      p.predicted_outcome,
      p.predicted_winner_team_id,
      p.predicted_home_score,
      p.predicted_away_score,
      p.predicts_extra_time,
      p.predicted_home_extra_score,
      p.predicted_away_extra_score,
      p.predicts_penalties,
      p.predicted_penalty_winner_team_id,
      p.status,
      (v_role = 'ADMIN' or v_match_status in ('LOCKED', 'LIVE', 'COMPLETED')) as can_view
    from predictions p
    join members m on m.id = p.member_id
    where p.match_id = p_match_id
      and (
        v_role = 'ADMIN'
        or p.member_id = p_member_id
        or v_match_status in ('LOCKED', 'LIVE', 'COMPLETED')
      )
    order by m.full_name asc;
end;
$$;

create index if not exists idx_matches_kickoff_at on matches(kickoff_at);
create index if not exists idx_predictions_match_member on predictions(match_id, member_id);
create index if not exists idx_contributions_match_member on contributions(match_id, member_id);
