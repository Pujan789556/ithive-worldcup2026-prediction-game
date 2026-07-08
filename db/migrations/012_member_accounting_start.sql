alter table members
  add column if not exists accounting_start_at timestamptz;

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
    select m.id, m.stage_id, m.lock_at, s.entry_amount
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
      and (
        mem.accounting_start_at is null
        or mem.accounting_start_at <= locked_match.lock_at
      )
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
      and (
        mem.accounting_start_at is null
        or mem.accounting_start_at <= locked_match.lock_at
      )
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
