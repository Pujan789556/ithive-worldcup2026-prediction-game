create table if not exists member_settlements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  settlement_scope text not null check (settlement_scope in ('WEEKLY', 'STAGE', 'MANUAL')) default 'MANUAL',
  label text,
  calculated_winnings numeric(12,2) not null default 0,
  calculated_fees numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null,
  status text not null check (status in ('OPEN', 'SETTLED')) default 'OPEN',
  finalized_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_by uuid references members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_member_settlements_one_open
  on member_settlements(member_id)
  where status = 'OPEN';

create index if not exists idx_member_settlements_member_status
  on member_settlements(member_id, status, finalized_at desc);

drop trigger if exists trg_member_settlements_updated_at on member_settlements;
create trigger trg_member_settlements_updated_at
before update on member_settlements
for each row execute function set_updated_at();

create or replace function get_member_settlement_statuses()
returns table (
  member_id uuid,
  member_name text,
  email text,
  total_points int,
  total_winnings numeric(12,2),
  total_fees numeric(12,2),
  settled_amount numeric(12,2),
  open_settlement_id uuid,
  open_settlement_scope text,
  open_settlement_label text,
  open_settlement_amount numeric(12,2),
  current_amount numeric(12,2),
  current_status text,
  last_finalized_at timestamptz,
  last_settled_at timestamptz,
  rank int
)
language sql
as $$
  with points as (
    select member_id, coalesce(sum(total_points), 0) as total_points
    from match_scores
    group by member_id
  ),
  winnings as (
    select member_id, coalesce(sum(prize_amount), 0) as total_winnings
    from prize_distributions
    group by member_id
  ),
  fees as (
    select member_id, coalesce(sum(amount), 0) as total_fees
    from contributions c
    join (
      select distinct match_id
      from prize_distributions
      union
      select distinct match_id
      from unresolved_pools
    ) settled_matches on settled_matches.match_id = c.match_id
    where payment_status in ('PENDING', 'PAID')
    group by member_id
  ),
  settled as (
    select
      member_id,
      coalesce(sum(net_amount), 0) as settled_amount,
      max(settled_at) as last_settled_at
    from member_settlements
    where status = 'SETTLED'
    group by member_id
  ),
  open_settlements as (
    select distinct on (member_id)
      member_id,
      id as open_settlement_id,
      settlement_scope as open_settlement_scope,
      label as open_settlement_label,
      net_amount as open_settlement_amount,
      finalized_at as last_finalized_at
    from member_settlements
    where status = 'OPEN'
    order by member_id, finalized_at desc, created_at desc
  )
  select
    m.id as member_id,
    m.full_name as member_name,
    m.email,
    coalesce(p.total_points, 0)::int as total_points,
    coalesce(w.total_winnings, 0)::numeric(12,2) as total_winnings,
    coalesce(f.total_fees, 0)::numeric(12,2) as total_fees,
    coalesce(s.settled_amount, 0)::numeric(12,2) as settled_amount,
    o.open_settlement_id,
    o.open_settlement_scope,
    o.open_settlement_label,
    o.open_settlement_amount,
    case
      when o.open_settlement_id is not null then o.open_settlement_amount
      else (coalesce(w.total_winnings, 0) - coalesce(f.total_fees, 0) - coalesce(s.settled_amount, 0))::numeric(12,2)
    end as current_amount,
    case
      when o.open_settlement_id is not null then 'OPEN'
      when (coalesce(w.total_winnings, 0) - coalesce(f.total_fees, 0) - coalesce(s.settled_amount, 0)) > 0 then 'RECEIVE'
      when (coalesce(w.total_winnings, 0) - coalesce(f.total_fees, 0) - coalesce(s.settled_amount, 0)) < 0 then 'COLLECT'
      else 'ZERO'
    end as current_status,
    o.last_finalized_at,
    s.last_settled_at,
    row_number() over (
      order by coalesce(p.total_points, 0) desc,
               coalesce(w.total_winnings, 0) desc,
               coalesce(f.total_fees, 0) desc,
               m.full_name asc
    )::int as rank
  from members m
  left join points p on p.member_id = m.id
  left join winnings w on w.member_id = m.id
  left join fees f on f.member_id = m.id
  left join settled s on s.member_id = m.id
  left join open_settlements o on o.member_id = m.id
  where m.is_active = true
  order by rank asc;
$$;

create or replace function finalize_member_settlement(
  p_member_id uuid,
  p_settlement_scope text default 'MANUAL',
  p_label text default null
)
returns uuid
language plpgsql
as $$
declare
  v_total_winnings numeric(12,2);
  v_total_fees numeric(12,2);
  v_settled_amount numeric(12,2);
  v_net_amount numeric(12,2);
  v_settlement_id uuid;
begin
  if exists (
    select 1
    from member_settlements
    where member_id = p_member_id
      and status = 'OPEN'
  ) then
    raise exception 'Settlement already finalized for this member.';
  end if;

  select coalesce(sum(prize_amount), 0) into v_total_winnings
  from prize_distributions
  where member_id = p_member_id;

  select coalesce(sum(amount), 0) into v_total_fees
  from contributions c
  join (
    select distinct match_id
    from prize_distributions
    union
    select distinct match_id
    from unresolved_pools
  ) settled_matches on settled_matches.match_id = c.match_id
  where c.member_id = p_member_id
    and payment_status in ('PENDING', 'PAID');

  select coalesce(sum(net_amount), 0) into v_settled_amount
  from member_settlements
  where member_id = p_member_id
    and status = 'SETTLED';

  v_net_amount := round((v_total_winnings - v_total_fees - v_settled_amount)::numeric, 2);

  insert into member_settlements (
    member_id,
    settlement_scope,
    label,
    calculated_winnings,
    calculated_fees,
    net_amount,
    status,
    finalized_at
  )
  values (
    p_member_id,
    coalesce(nullif(p_settlement_scope, ''), 'MANUAL'),
    p_label,
    v_total_winnings,
    v_total_fees,
    v_net_amount,
    'OPEN',
    now()
  )
  returning id into v_settlement_id;

  return v_settlement_id;
end;
$$;

create or replace function settle_member_settlement(
  p_settlement_id uuid,
  p_settled_by uuid
)
returns void
language plpgsql
as $$
begin
  update member_settlements
  set status = 'SETTLED',
      settled_at = now(),
      settled_by = p_settled_by,
      updated_at = now()
  where id = p_settlement_id
    and status = 'OPEN';

  if not found then
    raise exception 'Open settlement not found.';
  end if;
end;
$$;

create or replace function undo_member_settlement_finalization(
  p_settlement_id uuid
)
returns void
language plpgsql
as $$
begin
  delete from member_settlements
  where id = p_settlement_id
    and status = 'OPEN';

  if not found then
    raise exception 'Open settlement not found.';
  end if;
end;
$$;
