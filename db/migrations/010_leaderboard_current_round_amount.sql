create or replace function get_leaderboard()
returns table (
  member_id uuid,
  full_name text,
  email text,
  total_points int,
  total_contributed numeric(12,2),
  total_winnings numeric(12,2),
  current_amount numeric(12,2),
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
    select c.member_id, coalesce(sum(c.amount), 0) as total_contributed
    from contributions c
    join (
      select distinct match_id
      from prize_distributions
    ) settled_matches on settled_matches.match_id = c.match_id
    group by c.member_id
  ),
  winnings as (
    select member_id, coalesce(sum(prize_amount), 0) as total_winnings
    from prize_distributions
    group by member_id
  ),
  settlement_statuses as (
    select member_id, current_amount
    from get_member_settlement_statuses()
  )
  select
    m.id as member_id,
    m.full_name,
    m.email,
    coalesce(p.total_points, 0)::int as total_points,
    coalesce(c.total_contributed, 0)::numeric(12,2) as total_contributed,
    coalesce(w.total_winnings, 0)::numeric(12,2) as total_winnings,
    coalesce(ss.current_amount, 0)::numeric(12,2) as current_amount,
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
  left join settlement_statuses ss on ss.member_id = m.id
  where m.is_active = true
  order by rank asc;
$$;
