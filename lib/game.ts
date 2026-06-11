import "server-only";

import { sql, typedSql } from "./server";
import { getCurrentMember } from "./auth";

export type Stage = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  entry_amount: string;
  is_knockout: boolean;
};

export type Team = {
  id: string;
  name: string;
  short_name: string | null;
  flag_emoji: string | null;
  flag_url: string | null;
  group_id: string | null;
};

export type GroupRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
};

export type GroupStandingRow = {
  group_id: string;
  group_code: string;
  group_name: string;
  standing_position: number;
  team_id: string;
  team_name: string;
  short_name: string | null;
  flag_emoji: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

export type MatchPredictionSummaryRow = {
  member_id: string;
  full_name: string;
  submission_status: string;
  details_visible: boolean;
  prediction_id: string | null;
  predicted_outcome: "HOME_WIN" | "AWAY_WIN" | "DRAW" | null;
  predicted_winner_team_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicts_extra_time: boolean | null;
  predicted_home_extra_score: number | null;
  predicted_away_extra_score: number | null;
  predicts_penalties: boolean | null;
  predicted_penalty_winner_team_id: string | null;
  winner_points: number | null;
  goal_points: number | null;
  extra_time_points: number | null;
  penalty_points: number | null;
  total_points: number | null;
  prize_amount: string | null;
  contribution_amount: string | null;
  payment_status: string | null;
};

export type MatchPredictionSummaryBlock = {
  match_id: string;
  rows: MatchPredictionSummaryRow[];
};

export type MatchLeaderboardRow = {
  member_id: string;
  full_name: string;
  email: string;
  total_points: number;
  total_contributed: string;
  total_winnings: string;
  net_amount: string;
  rank: number;
};

export type MatchLeaderboardBlock = {
  match_id: string;
  rows: MatchLeaderboardRow[];
};

export type CompletedMatchBreakdownBlock = {
  match_id: string;
  rows: MatchPredictionSummaryRow[];
};

export type Member = {
  id: string;
  email: string;
  full_name: string;
  role: "ADMIN" | "MEMBER";
  is_active: boolean;
  must_change_password: boolean;
};

export type MatchRow = {
  id: string;
  kickoff_at: string;
  lock_at: string;
  status: "SCHEDULED" | "LOCKED" | "LIVE" | "COMPLETED" | "CANCELLED";
  result_locked: boolean;
  result_locked_at: string | null;
  result_locked_by: string | null;
  home_score: number | null;
  away_score: number | null;
  went_extra_time: boolean;
  home_extra_score: number | null;
  away_extra_score: number | null;
  went_penalties: boolean;
  actual_outcome: "HOME_WIN" | "AWAY_WIN" | "DRAW" | null;
  winner_team_id: string | null;
  penalty_winner_team_id: string | null;
  stage_id: string;
  stage_code: string;
  stage_name: string;
  stage_sort_order: number;
  stage_entry_amount: string;
  stage_is_knockout: boolean;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_team_short_name: string | null;
  away_team_short_name: string | null;
  home_team_flag_emoji: string | null;
  away_team_flag_emoji: string | null;
  prediction_id: string | null;
  predicted_outcome: "HOME_WIN" | "AWAY_WIN" | "DRAW" | null;
  predicted_winner_team_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicts_extra_time: boolean | null;
  predicted_home_extra_score: number | null;
  predicted_away_extra_score: number | null;
  predicts_penalties: boolean | null;
  predicted_penalty_winner_team_id: string | null;
  prediction_status: "SUBMITTED" | "LOCKED" | "MISSED" | "DISQUALIFIED" | null;
  points: number | null;
  total_prize: string | null;
};

export type LeaderboardRow = {
  member_id: string;
  full_name: string;
  email: string;
  total_points: number;
  total_contributed: string;
  total_winnings: string;
  net_amount: string;
  rank: number;
};

export type SettlementRow = {
  member_id: string;
  member_name: string;
  email: string;
  total_points: number;
  total_winnings: string;
  total_fees: string;
  settled_amount: string;
  open_settlement_id: string | null;
  open_settlement_scope: "WEEKLY" | "STAGE" | "MANUAL" | null;
  open_settlement_label: string | null;
  open_settlement_amount: string | null;
  current_amount: string;
  current_status: "OPEN" | "RECEIVE" | "COLLECT" | "ZERO";
  last_finalized_at: string | null;
  last_settled_at: string | null;
  rank: number;
};

export type PrizePoolRow = {
  id: string;
  match_id: string;
  match_label: string;
  amount: string;
  status: "UNRESOLVED" | "CARRIED_FORWARD" | "SPLIT_EQUALLY" | "MANUAL";
  reason: string | null;
};

export type PredictionAuditRow = {
  id: string;
  match_id: string;
  match_label: string;
  member_id: string;
  member_name: string;
  prediction_id: string;
  action: string;
  created_at: string;
  before_payload: Record<string, unknown> | null;
  after_payload: Record<string, unknown> | null;
};

export type PredictionIssueRow = {
  id: string;
  match_id: string;
  match_label: string;
  member_id: string;
  member_name: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
};

export type DashboardData = {
  member: Member | null;
  groups: GroupRow[];
  stages: Stage[];
  teams: Team[];
  matches: MatchRow[];
  upcomingMatch: MatchRow | null;
  groupStandings: GroupStandingRow[];
  predictionSummaries: MatchPredictionSummaryBlock[];
  matchLeaderboards: MatchLeaderboardBlock[];
  completedBreakdowns: CompletedMatchBreakdownBlock[];
  leaderboard: LeaderboardRow[];
  settlements: SettlementRow[];
  prizePools: PrizePoolRow[];
  predictionAuditLogs: PredictionAuditRow[];
  predictionIssueReports: PredictionIssueRow[];
};

export async function syncExpiredMatches() {
  await sql`select lock_expired_matches()`;
}

export async function fetchCurrentMember() {
  return getCurrentMember();
}

export async function fetchLeaderboard() {
  const rows = await typedSql<LeaderboardRow>`select * from get_leaderboard()`;
  return rows;
}

export async function fetchGroupStandings() {
  const rows = await typedSql<GroupStandingRow>`select * from get_group_standings()`;
  return rows;
}

export async function fetchMatchPredictionSummary(matchId: string, memberId: string) {
  const rows = await typedSql<MatchPredictionSummaryRow>`
    select * from get_match_prediction_summary(${matchId}, ${memberId})
  `;
  return rows;
}

export async function fetchCompletedMatchBreakdown(matchId: string) {
  const rows = await typedSql<MatchPredictionSummaryRow>`
    select * from get_completed_match_breakdown(${matchId})
  `;
  return rows;
}

export async function fetchMatchLeaderboard(matchId: string) {
  const rows = await typedSql<MatchLeaderboardRow>`
    select * from get_match_leaderboard(${matchId})
  `;
  return rows;
}

export async function fetchPredictionAuditLogs(limit = 20) {
  const rows = await typedSql<PredictionAuditRow>`
    select
      pal.id,
      pal.match_id,
      concat(ht.short_name, ' vs ', at.short_name, ' ', s.code) as match_label,
      pal.member_id,
      m.full_name as member_name,
      pal.prediction_id,
      pal.action,
      pal.created_at::text as created_at,
      pal.before_payload,
      pal.after_payload
    from prediction_audit_logs pal
    join matches mm on mm.id = pal.match_id
    join stages s on s.id = mm.stage_id
    join teams ht on ht.id = mm.home_team_id
    join teams at on at.id = mm.away_team_id
    join members m on m.id = pal.member_id
    order by pal.created_at desc
    limit ${limit}
  `;
  return rows;
}

export async function fetchPredictionIssueReports() {
  const rows = await typedSql<PredictionIssueRow>`
    select
      pir.id,
      pir.match_id,
      concat(ht.short_name, ' vs ', at.short_name, ' ', s.code) as match_label,
      pir.member_id,
      m.full_name as member_name,
      pir.reason,
      pir.status,
      pir.created_at::text as created_at,
      pir.resolved_at::text as resolved_at,
      rm.full_name as resolved_by_name
    from prediction_issue_reports pir
    join matches mm on mm.id = pir.match_id
    join stages s on s.id = mm.stage_id
    join teams ht on ht.id = mm.home_team_id
    join teams at on at.id = mm.away_team_id
    join members m on m.id = pir.member_id
    left join members rm on rm.id = pir.resolved_by
    order by pir.created_at desc
  `;
  return rows;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const member = await getCurrentMember();

  if (!member) {
      return {
      member: null,
      groups: [],
      stages: [],
      teams: [],
      matches: [],
      upcomingMatch: null,
      groupStandings: [],
      predictionSummaries: [],
      matchLeaderboards: [],
      completedBreakdowns: [],
      leaderboard: [],
      settlements: [],
      prizePools: [],
      predictionAuditLogs: [],
      predictionIssueReports: []
    };
  }

  await syncExpiredMatches();

  const [groups, stages, teams, matches, leaderboard, settlements, prizePools, groupStandings, predictionAuditLogs, predictionIssueReports] =
    await Promise.all([
    typedSql<GroupRow>`
      select id, code, name, sort_order
      from groups
      order by sort_order asc
    `,
    typedSql<Stage>`
      select id, code, name, sort_order, entry_amount::text as entry_amount, is_knockout
      from stages
      order by sort_order asc
    `,
    typedSql<Team>`
      select id, name, short_name, flag_emoji, flag_url, group_id
      from teams
      order by name asc
    `,
    typedSql<MatchRow>`
      select
        m.id,
        m.kickoff_at::text,
        m.lock_at::text,
        m.status,
        m.result_locked,
        m.result_locked_at::text as result_locked_at,
        m.result_locked_by,
        m.home_score,
        m.away_score,
        m.went_extra_time,
        m.home_extra_score,
        m.away_extra_score,
        m.went_penalties,
        m.actual_outcome,
        m.winner_team_id,
        m.penalty_winner_team_id,
        s.id as stage_id,
        s.code as stage_code,
        s.name as stage_name,
        s.sort_order as stage_sort_order,
        s.entry_amount::text as stage_entry_amount,
        s.is_knockout as stage_is_knockout,
        ht.id as home_team_id,
        at.id as away_team_id,
        ht.name as home_team_name,
        at.name as away_team_name,
        ht.short_name as home_team_short_name,
        at.short_name as away_team_short_name,
        ht.flag_emoji as home_team_flag_emoji,
        at.flag_emoji as away_team_flag_emoji,
        p.id as prediction_id,
        p.predicted_outcome,
        p.predicted_winner_team_id,
        p.predicted_home_score,
        p.predicted_away_score,
        p.predicts_extra_time,
        p.predicted_home_extra_score,
        p.predicted_away_extra_score,
        p.predicts_penalties,
        p.predicted_penalty_winner_team_id,
        p.status as prediction_status,
        coalesce(ms.total_points, 0) as points,
        pd.prize_amount::text as total_prize
      from matches m
      join stages s on s.id = m.stage_id
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      left join predictions p on p.match_id = m.id and p.member_id = ${member.id}
      left join match_scores ms on ms.match_id = m.id and ms.member_id = ${member.id}
      left join prize_distributions pd on pd.match_id = m.id and pd.member_id = ${member.id}
      order by m.kickoff_at asc, s.sort_order asc, m.created_at asc
    `,
    typedSql<LeaderboardRow>`select * from get_leaderboard()`,
    typedSql<SettlementRow>`select * from get_member_settlement_statuses()`,
    typedSql<PrizePoolRow>`
      select
        up.id,
        up.match_id,
        concat(ht.short_name, ' vs ', at.short_name, ' ', s.code) as match_label,
        up.amount::text as amount,
        up.status,
        up.reason
      from unresolved_pools up
      join matches mm on mm.id = up.match_id
      join stages s on s.id = mm.stage_id
      join teams ht on ht.id = mm.home_team_id
      join teams at on at.id = mm.away_team_id
      order by up.created_at desc
    `,
    typedSql<GroupStandingRow>`select * from get_group_standings()`
    ,
    member.role === "ADMIN" ? fetchPredictionAuditLogs(25) : Promise.resolve([] as PredictionAuditRow[]),
    member.role === "ADMIN" ? fetchPredictionIssueReports() : Promise.resolve([] as PredictionIssueRow[])
    ]);

  const predictionSummaries = await Promise.all(
    matches.map(async (match) => ({
      match_id: match.id,
      rows: await fetchMatchPredictionSummary(match.id, member.id)
    }))
  );

  const matchLeaderboards = await Promise.all(
    matches.map(async (match) => ({
      match_id: match.id,
      rows: await fetchMatchLeaderboard(match.id)
    }))
  );

  const completedBreakdowns = await Promise.all(
    matches
      .filter((match) => match.status === "COMPLETED")
      .map(async (match) => ({
        match_id: match.id,
        rows: await fetchCompletedMatchBreakdown(match.id)
      }))
  );

  const upcomingMatch =
    matches.find((match) => match.status === "SCHEDULED") ??
    matches.find((match) => match.status === "LOCKED" || match.status === "LIVE") ??
    null;

  return {
    member,
    groups,
    stages,
    teams,
    matches,
    upcomingMatch,
    groupStandings,
    predictionSummaries,
    matchLeaderboards,
    completedBreakdowns,
    leaderboard,
    settlements,
    prizePools,
    predictionAuditLogs,
    predictionIssueReports
  };
}
