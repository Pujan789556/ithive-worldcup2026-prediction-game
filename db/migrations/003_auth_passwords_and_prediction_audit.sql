alter table members
  add column if not exists password_hash text,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists password_changed_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists failed_login_attempts int not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists updated_at timestamptz default now();

update members
set password_hash = coalesce(password_hash, '$2b$10$RjgqhsRUYUyT4cUxAxIjyeSRgrugStmVep5STUIakPy07lhG/nWJG'),
    must_change_password = coalesce(must_change_password, true),
    failed_login_attempts = coalesce(failed_login_attempts, 0),
    updated_at = coalesce(updated_at, now())
where password_hash is null;

alter table members
  alter column password_hash set not null;

create index if not exists idx_members_email on members(email);
create index if not exists idx_members_is_active on members(is_active);

drop trigger if exists trg_members_updated_at on members;
create trigger trg_members_updated_at
before update on members
for each row execute function set_updated_at();

create table if not exists prediction_audit_logs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  prediction_id uuid references predictions(id) on delete cascade,
  action text not null,
  before_payload jsonb,
  after_payload jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_prediction_audit_logs_match_id on prediction_audit_logs(match_id);
create index if not exists idx_prediction_audit_logs_member_id on prediction_audit_logs(member_id);

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
  v_previous_prediction jsonb;
  v_new_prediction jsonb;
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

  select to_jsonb(p.*)
  into v_previous_prediction
  from predictions p
  where p.match_id = p_match_id
    and p.member_id = p_member_id;

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

  select to_jsonb(p.*)
  into v_new_prediction
  from predictions p
  where p.id = v_prediction_id;

  insert into prediction_audit_logs (
    match_id,
    member_id,
    prediction_id,
    action,
    before_payload,
    after_payload,
    created_at
  )
  values (
    p_match_id,
    p_member_id,
    v_prediction_id,
    'SET_PREDICTION',
    v_previous_prediction,
    v_new_prediction,
    now()
  );

  insert into contributions (match_id, member_id, amount, payment_status, created_at, updated_at)
  values (p_match_id, p_member_id, v_stage_amount, 'PENDING', now(), now())
  on conflict (match_id, member_id)
  do update set amount = excluded.amount, updated_at = now();

  return v_prediction_id;
end;
$$;
