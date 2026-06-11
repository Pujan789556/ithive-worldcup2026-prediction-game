create table if not exists prediction_issue_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  reason text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolved_at timestamptz,
  resolved_by uuid references members(id) on delete set null,
  created_at timestamptz default now(),
  unique (match_id, member_id)
);

create index if not exists idx_prediction_issue_reports_match_id on prediction_issue_reports(match_id);
create index if not exists idx_prediction_issue_reports_status on prediction_issue_reports(status);
create index if not exists idx_prediction_issue_reports_member_id on prediction_issue_reports(member_id);
