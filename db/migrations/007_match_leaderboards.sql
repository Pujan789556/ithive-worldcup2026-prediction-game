create or replace function get_match_leaderboard(p_match_id uuid)
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
  with member_rows as (
    select id, full_name, email
    from members
    where is_active = true
  ),
  scores as (
    select member_id, coalesce(total_points, 0) as total_points
    from match_scores
    where match_id = p_match_id
  ),
  contributions as (
    select member_id, coalesce(amount, 0) as total_contributed
    from contributions
    where match_id = p_match_id
      and payment_status in ('PENDING', 'PAID')
  ),
  winnings as (
    select member_id, coalesce(prize_amount, 0) as total_winnings
    from prize_distributions
    where match_id = p_match_id
  )
  select
    m.id as member_id,
    m.full_name,
    m.email,
    coalesce(s.total_points, 0)::int as total_points,
    coalesce(c.total_contributed, 0)::numeric(12,2) as total_contributed,
    coalesce(w.total_winnings, 0)::numeric(12,2) as total_winnings,
    (coalesce(w.total_winnings, 0) - coalesce(c.total_contributed, 0))::numeric(12,2) as net_amount,
    row_number() over (
      order by coalesce(s.total_points, 0) desc,
               coalesce(w.total_winnings, 0) desc,
               coalesce(c.total_contributed, 0) desc,
               m.full_name asc
    )::int as rank
  from member_rows m
  left join scores s on s.member_id = m.id
  left join contributions c on c.member_id = m.id
  left join winnings w on w.member_id = m.id
  order by rank asc;
$$;
