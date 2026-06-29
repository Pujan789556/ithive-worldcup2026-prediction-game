"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  clearAuthCookies,
  createAuthenticatedSession,
  createPasswordChangeSession,
  requireAuth,
  requirePasswordChangeSession,
  requireAdmin,
  type MemberRole
} from "@/lib/auth";
import {
  fetchCompletedMatchBreakdown,
  fetchDashboardData,
  fetchGroupStandings,
  fetchLeaderboard,
  fetchMatchPredictionSummary,
  syncExpiredMatches
} from "@/lib/game";
import { parseNepalDateTimeInput } from "@/lib/time";
import { sql, typedSql } from "@/lib/server";

const emailSchema = z.string().email().max(320);
const passwordSchema = z.string().min(1).max(255);
const newPasswordSchema = z
  .string()
  .min(8)
  .max(255)
  .refine((value) => /[A-Za-z]/.test(value), "Password must include at least one letter.")
  .refine((value) => /\d/.test(value), "Password must include at least one number.");

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formRawString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formNullableString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function formNumber(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function genericAuthRedirect() {
  redirect("/?auth_error=1");
}

function passwordChangeRedirect() {
  redirect("/?password_error=1");
}

function profilePasswordChangeRedirect() {
  redirect("/?profile_error=1");
}

async function loadMatchForAdmin(matchId: string) {
  const rows = await typedSql<{
    id: string;
    status: "SCHEDULED" | "LOCKED" | "LIVE" | "COMPLETED" | "CANCELLED";
    lock_at: string;
    kickoff_at: string;
    stage_id: string;
    stage_code: string;
    stage_is_knockout: boolean;
    home_team_id: string;
    away_team_id: string;
    result_locked: boolean;
    result_locked_by: string | null;
  }>`
    select
      m.id,
      m.status,
      m.lock_at::text,
      m.kickoff_at::text,
      m.stage_id,
      s.code as stage_code,
      s.is_knockout as stage_is_knockout,
      m.home_team_id,
      m.away_team_id,
      m.result_locked,
      m.result_locked_by
    from matches m
    join stages s on s.id = m.stage_id
    where m.id = ${matchId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function loginWithPassword(formData: FormData) {
  const rawEmail = formString(formData, "email").toLowerCase();
  const emailResult = emailSchema.safeParse(rawEmail);
  const passwordResult = passwordSchema.safeParse(formRawString(formData, "password"));
  if (!emailResult.success || !passwordResult.success) {
    genericAuthRedirect();
  }

  const email = emailResult.success ? emailResult.data : "";
  const password = passwordResult.success ? passwordResult.data : "";

  const memberRows = await typedSql<{
    id: string;
    email: string;
    full_name: string;
    role: MemberRole;
    is_active: boolean;
    password_hash: string;
    must_change_password: boolean;
    failed_login_attempts: number;
    locked_until: string | null;
  }>`
    select
      id,
      email,
      full_name,
      role,
      is_active,
      password_hash,
      must_change_password,
      coalesce(failed_login_attempts, 0) as failed_login_attempts,
      locked_until::text as locked_until
    from members
    where lower(email) = ${email}
    limit 1
  `;

  const member = memberRows[0];
  if (!member || !member.is_active) {
    genericAuthRedirect();
  }

  if (member.locked_until && new Date(member.locked_until).getTime() > Date.now()) {
    genericAuthRedirect();
  }

  const passwordHash = String(member.password_hash ?? "");
  const validPassword = await bcrypt.compare(password, passwordHash);
  if (!validPassword) {
    const attempts = member.failed_login_attempts + 1;
    const lockAccount = attempts >= 5;
    const lockedUntil = lockAccount ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

    await sql`
      update members
      set failed_login_attempts = ${attempts},
          locked_until = ${lockedUntil},
          updated_at = now()
      where id = ${member.id}
    `;

    genericAuthRedirect();
  }

  await sql`
    update members
    set failed_login_attempts = 0,
        locked_until = null,
        last_login_at = now(),
        updated_at = now()
    where id = ${member.id}
  `;

  if (member.must_change_password) {
    await clearAuthCookies();
    await createPasswordChangeSession({
      id: member.id,
      email: member.email,
      role: member.role
    });
    redirect("/");
  }

  await clearAuthCookies();
  await createAuthenticatedSession({
    id: member.id,
    email: member.email,
    role: member.role
  });
  redirect("/");
}

export async function changeInitialPassword(formData: FormData) {
  const member = await requirePasswordChangeSession();
  const currentPasswordResult = passwordSchema.safeParse(formRawString(formData, "currentPassword"));
  const newPasswordResult = newPasswordSchema.safeParse(formRawString(formData, "newPassword"));
  const confirmPasswordResult = passwordSchema.safeParse(formRawString(formData, "confirmPassword"));

  if (!currentPasswordResult.success || !newPasswordResult.success || !confirmPasswordResult.success) {
    passwordChangeRedirect();
  }

  const currentPassword = currentPasswordResult.success ? currentPasswordResult.data : "";
  const newPassword = newPasswordResult.success ? newPasswordResult.data : "";
  const confirmPassword = confirmPasswordResult.success ? confirmPasswordResult.data : "";

  if (newPassword !== confirmPassword) {
    passwordChangeRedirect();
  }

  if (newPassword === currentPassword) {
    passwordChangeRedirect();
  }

  const memberRows = await typedSql<{
    id: string;
    password_hash: string;
    must_change_password: boolean;
  }>`
    select id, password_hash, must_change_password
    from members
    where id = ${member.id}
      and email = ${member.email}
      and is_active = true
    limit 1
  `;

  const freshMember = memberRows[0];
  if (!freshMember || !freshMember.must_change_password) {
    passwordChangeRedirect();
  }

  const currentPasswordHash = String(freshMember.password_hash ?? "");
  const validCurrentPassword = await bcrypt.compare(currentPassword, currentPasswordHash);
  if (!validCurrentPassword) {
    passwordChangeRedirect();
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await sql`
    update members
    set password_hash = ${newPasswordHash},
        must_change_password = false,
        password_changed_at = now(),
        failed_login_attempts = 0,
        locked_until = null,
        updated_at = now()
    where id = ${member.id}
  `;

  await clearAuthCookies();
  await createAuthenticatedSession({
    id: member.id,
    email: member.email,
    role: member.role
  });

  redirect("/");
}

export async function changePassword(formData: FormData) {
  const member = await requireAuth();
  const currentPasswordResult = passwordSchema.safeParse(formRawString(formData, "currentPassword"));
  const newPasswordResult = newPasswordSchema.safeParse(formRawString(formData, "newPassword"));
  const confirmPasswordResult = passwordSchema.safeParse(formRawString(formData, "confirmPassword"));

  if (!currentPasswordResult.success || !newPasswordResult.success || !confirmPasswordResult.success) {
    profilePasswordChangeRedirect();
  }

  const currentPassword = currentPasswordResult.success ? currentPasswordResult.data : "";
  const newPassword = newPasswordResult.success ? newPasswordResult.data : "";
  const confirmPassword = confirmPasswordResult.success ? confirmPasswordResult.data : "";

  if (newPassword !== confirmPassword || newPassword === currentPassword) {
    profilePasswordChangeRedirect();
  }

  const memberRows = await typedSql<{
    id: string;
    password_hash: string;
  }>`
    select id, password_hash
    from members
    where id = ${member.id}
      and email = ${member.email}
      and is_active = true
    limit 1
  `;

  const freshMember = memberRows[0];
  if (!freshMember) {
    profilePasswordChangeRedirect();
  }

  const currentPasswordHash = String(freshMember.password_hash ?? "");
  const validCurrentPassword = await bcrypt.compare(currentPassword, currentPasswordHash);
  if (!validCurrentPassword) {
    profilePasswordChangeRedirect();
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await sql`
    update members
    set password_hash = ${newPasswordHash},
        must_change_password = false,
        password_changed_at = now(),
        failed_login_attempts = 0,
        locked_until = null,
        updated_at = now()
    where id = ${member.id}
  `;

  redirect("/");
}

export async function resetMemberPassword(formData: FormData) {
  const admin = await requireAdmin();

  const memberId = z.string().uuid().parse(formString(formData, "member_id"));
  const temporaryPassword = newPasswordSchema.parse(formRawString(formData, "temporary_password"));
  const confirmTemporaryPassword = passwordSchema.parse(formRawString(formData, "confirm_temporary_password"));

  if (temporaryPassword !== confirmTemporaryPassword) {
    throw new Error("Password reset failed.");
  }

  if (memberId === admin.id) {
    throw new Error("Super admins cannot reset their own password from this panel.");
  }

  const memberRows = await typedSql<{
    id: string;
    email: string;
    full_name: string;
    is_active: boolean;
    role: MemberRole;
  }>`
    select id, email, full_name, is_active, role
    from members
    where id = ${memberId}
    limit 1
  `;

  const member = memberRows[0];
  if (!member || !member.is_active) {
    throw new Error("Member not found.");
  }

  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await sql`
    update members
    set password_hash = ${passwordHash},
        must_change_password = true,
        password_changed_at = null,
        failed_login_attempts = 0,
        locked_until = null,
        updated_at = now()
    where id = ${member.id}
  `;

  redirect("/");
}

export async function logout() {
  await clearAuthCookies();
  redirect("/");
}

export async function getCurrentMember() {
  return requireAuth().catch(() => null);
}

export async function getDashboardData() {
  await requireAuth();
  return fetchDashboardData();
}

export async function getLeaderboard() {
  await requireAuth();
  return fetchLeaderboard();
}

export async function getGroupStandings() {
  await requireAuth();
  return fetchGroupStandings();
}

export async function getMatchPredictionSummary(matchId: string) {
  const member = await requireAuth();
  return fetchMatchPredictionSummary(matchId, member.id);
}

export async function getCompletedMatchBreakdown(matchId: string) {
  await requireAuth();
  return fetchCompletedMatchBreakdown(matchId);
}

export async function storePrediction(memberId: string, formData: FormData) {
  const matchId = z.string().uuid().parse(formString(formData, "match_id"));
  const stageCode = z.string().min(1).parse(formString(formData, "stage_code"));
  const predictedOutcome = formNullableString(formData, "predicted_outcome");
  const predictedWinnerTeamId = formNullableString(formData, "predicted_winner_team_id");
  const predictedHomeScore = formNumber(formData, "predicted_home_score");
  const predictedAwayScore = formNumber(formData, "predicted_away_score");
  const predictsExtraTime = formBoolean(formData, "predicts_extra_time");
  const predictedHomeExtraScore = formNumber(formData, "predicted_home_extra_score");
  const predictedAwayExtraScore = formNumber(formData, "predicted_away_extra_score");
  const predictsPenalties = formBoolean(formData, "predicts_penalties");
  const predictedPenaltyWinnerTeamId = formNullableString(formData, "predicted_penalty_winner_team_id");

  const matchRows = await typedSql<{
    id: string;
    lock_at: string;
    status: string;
    stage_id: string;
    stage_code: string;
    stage_entry_amount: string;
    stage_is_knockout: boolean;
    home_team_id: string;
    away_team_id: string;
  }>`
    select
      m.id,
      m.lock_at::text,
      m.status,
      s.id as stage_id,
      s.code as stage_code,
      s.entry_amount::text as stage_entry_amount,
      s.is_knockout as stage_is_knockout,
      m.home_team_id,
      m.away_team_id
    from matches m
    join stages s on s.id = m.stage_id
    where m.id = ${matchId}
    limit 1
  `;

  const match = matchRows[0];
  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.stage_code !== stageCode) {
    throw new Error("Stage mismatch.");
  }

  if (match.status !== "SCHEDULED") {
    throw new Error("Prediction is locked.");
  }

  const lockAt = new Date(match.lock_at);
  if (Number.isFinite(lockAt.getTime()) && lockAt.getTime() <= Date.now()) {
    await sql`select lock_expired_matches()`;
    throw new Error("Prediction is locked.");
  }

  let resolvedOutcome = predictedOutcome;
  let resolvedWinnerTeamId = predictedWinnerTeamId;

  if (match.stage_is_knockout) {
    if (resolvedWinnerTeamId !== match.home_team_id && resolvedWinnerTeamId !== match.away_team_id) {
      throw new Error("Pick a winner for the knockout match.");
    }
    resolvedOutcome = resolvedWinnerTeamId === match.home_team_id ? "HOME_WIN" : "AWAY_WIN";
  } else {
    if (!resolvedOutcome) {
      if (predictedHomeScore === null || predictedAwayScore === null) {
        throw new Error("Enter both scores for the group-stage match.");
      }

      resolvedOutcome =
        predictedHomeScore > predictedAwayScore
          ? "HOME_WIN"
          : predictedAwayScore > predictedHomeScore
            ? "AWAY_WIN"
            : "DRAW";
    }

    if (resolvedOutcome === "DRAW") {
      resolvedWinnerTeamId = null;
    } else {
      resolvedWinnerTeamId =
        resolvedOutcome === "HOME_WIN" ? match.home_team_id : match.away_team_id;
    }
  }

  const predictionRows = await typedSql<{ prediction_id: string }>`
    select submit_prediction(
      ${memberId},
      ${matchId},
      ${resolvedOutcome},
      ${resolvedWinnerTeamId},
      ${predictedHomeScore},
      ${predictedAwayScore},
      ${predictsExtraTime},
      ${predictedHomeExtraScore},
      ${predictedAwayExtraScore},
      ${predictsPenalties},
      ${predictedPenaltyWinnerTeamId}
    ) as prediction_id
  `;

  if (!predictionRows[0]) {
    throw new Error("Prediction could not be saved.");
  }

  return matchId;
}

export async function raisePredictionIssue(formData: FormData) {
  const member = await requireAuth();
  const matchId = z.string().uuid().parse(formString(formData, "match_id"));
  const reason = z.string().min(10).max(1000).parse(formString(formData, "reason"));

  const matchRows = await typedSql<{
    id: string;
    status: string;
  }>`
    select id, status
    from matches
    where id = ${matchId}
    limit 1
  `;

  const match = matchRows[0];
  if (!match) {
    throw new Error("Match not found.");
  }

  await sql`
    insert into prediction_issue_reports (
      match_id,
      member_id,
      reason,
      status,
      created_at
    )
    values (
      ${matchId},
      ${member.id},
      ${reason},
      'OPEN',
      now()
    )
    on conflict (match_id, member_id)
    do update set
      reason = excluded.reason,
      status = 'OPEN',
      resolved_at = null,
      resolved_by = null
  `;

  redirect("/");
}

export async function resolvePredictionIssue(formData: FormData) {
  const admin = await requireAdmin();
  const issueId = z.string().uuid().parse(formString(formData, "issue_id"));

  await sql`
    update prediction_issue_reports
    set status = 'RESOLVED',
        resolved_at = now(),
        resolved_by = ${admin.id}
    where id = ${issueId}
      and status = 'OPEN'
  `;

  redirect("/");
}

export async function submitPrediction(formData: FormData) {
  const member = await requireAuth();
  await storePrediction(member.id, formData);
  redirect("/");
}

export async function syncLocks() {
  await requireAdmin();
  await syncExpiredMatches();
  redirect("/");
}

export async function finalizeMatchResult(formData: FormData) {
  const admin = await requireAdmin();
  const matchId = z.string().uuid().parse(formString(formData, "match_id"));
  const match = await loadMatchForAdmin(matchId);
  if (!match) {
    throw new Error("Match not found.");
  }

  if (match.status === "CANCELLED") {
    throw new Error("Cancelled fixtures cannot be finalized.");
  }

  const now = Date.now();
  const kickoffTime = new Date(match.kickoff_at).getTime();
  const resultReadyTime = kickoffTime + (match.stage_is_knockout ? 3 * 60 * 60 * 1000 : 90 * 60 * 1000);
  if (match.status === "SCHEDULED" && now < resultReadyTime) {
    throw new Error("This result is not ready to be updated yet.");
  }

  const homeScore = z.number().int().nonnegative().nullable().parse(formNumber(formData, "home_score"));
  const awayScore = z.number().int().nonnegative().nullable().parse(formNumber(formData, "away_score"));
  const wentExtraTime = formBoolean(formData, "went_extra_time");
  const homeExtraScore = z.number().int().nonnegative().nullable().parse(formNumber(formData, "home_extra_score"));
  const awayExtraScore = z.number().int().nonnegative().nullable().parse(formNumber(formData, "away_extra_score"));
  const wentPenalties = formBoolean(formData, "went_penalties");
  const actualOutcome = z.enum(["HOME_WIN", "AWAY_WIN", "DRAW"]).parse(formString(formData, "actual_outcome"));
  const winnerTeamId = formNullableString(formData, "winner_team_id");
  const penaltyWinnerTeamId = formNullableString(formData, "penalty_winner_team_id");
  const submitAction = formString(formData, "submit_action");
  const lockResult = submitAction === "LOCK";

  if (homeScore === null || awayScore === null) {
    throw new Error("Enter regular-time scores.");
  }

  if (match.result_locked) {
    throw new Error("Result is locked and cannot be updated.");
  }

  const derivedOutcome =
    homeScore > awayScore ? "HOME_WIN" : awayScore > homeScore ? "AWAY_WIN" : "DRAW";

  if (match.stage_is_knockout) {
    if (!winnerTeamId) {
      throw new Error("Knockout matches require a winner.");
    }
    if (actualOutcome === "DRAW") {
      throw new Error("Knockout matches cannot end in a draw.");
    }
    if (!wentExtraTime && !wentPenalties && actualOutcome !== derivedOutcome) {
      throw new Error("Knockout results without extra time or penalties must match the regular-time score.");
    }
    if (actualOutcome === "HOME_WIN" && winnerTeamId !== match.home_team_id) {
      throw new Error("Winner team must match the actual outcome.");
    }
    if (actualOutcome === "AWAY_WIN" && winnerTeamId !== match.away_team_id) {
      throw new Error("Winner team must match the actual outcome.");
    }
    if (wentPenalties && !penaltyWinnerTeamId) {
      throw new Error("Penalty winner is required when the match goes to penalties.");
    }
    if (wentPenalties && penaltyWinnerTeamId && penaltyWinnerTeamId !== winnerTeamId) {
      throw new Error("Penalty winner must match the final winner.");
    }
  } else {
    if (actualOutcome !== derivedOutcome) {
      throw new Error("Actual outcome must match the regular-time score.");
    }
    if (winnerTeamId) {
      throw new Error("Group-stage matches do not need a winner team.");
    }
    if (wentExtraTime || wentPenalties) {
      throw new Error("Group-stage matches cannot go to extra time or penalties.");
    }
  }

  if (!wentExtraTime) {
    if (homeExtraScore !== null || awayExtraScore !== null) {
      throw new Error("Extra-time scores must be empty unless the match went to extra time.");
    }
  } else if (homeExtraScore === null || awayExtraScore === null) {
    throw new Error("Enter extra-time scores when the match goes to extra time.");
  }

  if (!wentPenalties && penaltyWinnerTeamId) {
    throw new Error("Penalty winner must be empty unless the match went to penalties.");
  }

  if (wentPenalties && !penaltyWinnerTeamId) {
    throw new Error("Penalty winner is required when the match goes to penalties.");
  }

  if (match.stage_is_knockout && actualOutcome === "DRAW") {
    throw new Error("Knockout matches cannot end in a draw.");
  }

  await sql`
    select finalize_match_result(
      ${matchId},
      ${homeScore},
      ${awayScore},
      ${wentExtraTime},
      ${homeExtraScore},
      ${awayExtraScore},
      ${wentPenalties},
      ${penaltyWinnerTeamId},
      ${actualOutcome},
      ${winnerTeamId},
      ${lockResult},
      ${lockResult ? admin.id : null}
    )
  `;

  redirect("/");
}

export async function finalizeMemberSettlement(formData: FormData) {
  await requireAdmin();
  const memberId = z.string().uuid().parse(formString(formData, "member_id"));
  const settlementScopeRaw = formString(formData, "settlement_scope");
  const settlementScope = settlementScopeRaw === "WEEKLY" || settlementScopeRaw === "STAGE" ? settlementScopeRaw : "MANUAL";
  const label = formNullableString(formData, "label");

  const rows = await typedSql<{
    member_id: string;
    current_amount: string;
    current_status: "OPEN" | "RECEIVE" | "COLLECT" | "ZERO";
    open_settlement_id: string | null;
  }>`
    select member_id, current_amount::text as current_amount, current_status, open_settlement_id
    from get_member_settlement_statuses()
    where member_id = ${memberId}
    limit 1
  `;

  const summary = rows[0];
  if (!summary) {
    throw new Error("Member settlement summary not found.");
  }

  if (summary.open_settlement_id) {
    throw new Error("This member already has an open settlement.");
  }

  if (Number(summary.current_amount) === 0) {
    throw new Error("There is no amount to finalize for this member.");
  }

  await sql`
    select finalize_member_settlement(
      ${memberId},
      ${settlementScope},
      ${label}
    )
  `;

  redirect("/");
}

export async function settleMemberSettlement(formData: FormData) {
  const admin = await requireAdmin();
  const settlementId = z.string().uuid().parse(formString(formData, "settlement_id"));

  await sql`
    select settle_member_settlement(
      ${settlementId},
      ${admin.id}
    )
  `;

  redirect("/");
}

export async function undoMemberSettlementFinalization(formData: FormData) {
  await requireAdmin();
  const settlementId = z.string().uuid().parse(formString(formData, "settlement_id"));

  await sql`
    select undo_member_settlement_finalization(${settlementId})
  `;

  redirect("/");
}

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = z.string().min(2).max(80).parse(formString(formData, "name"));
  const shortName = formNullableString(formData, "short_name");
  const flagEmoji = formNullableString(formData, "flag_emoji");
  const flagUrl = formNullableString(formData, "flag_url");
  const groupId = z.string().uuid().parse(formString(formData, "group_id"));

  await sql`
    insert into teams (name, short_name, flag_emoji, flag_url, group_id)
    values (${name}, ${shortName}, ${flagEmoji}, ${flagUrl}, ${groupId})
  `;

  redirect("/");
}

export async function createFixture(formData: FormData) {
  await requireAdmin();
  const stageId = z.string().uuid().parse(formString(formData, "stage_id"));
  const homeTeamId = z.string().uuid().parse(formString(formData, "home_team_id"));
  const awayTeamId = z.string().uuid().parse(formString(formData, "away_team_id"));
  const kickoffAt = parseNepalDateTimeInput(formString(formData, "kickoff_at"));
  const statusRaw = formString(formData, "status");
  const status =
    statusRaw === ""
      ? "SCHEDULED"
      : z.enum(["SCHEDULED", "LOCKED", "LIVE", "CANCELLED"]).parse(statusRaw);

  if (homeTeamId === awayTeamId) {
    throw new Error("Home and away teams must be different.");
  }

  const fixtureMeta = await typedSql<{
    stage_code: string;
    home_group_id: string | null;
    away_group_id: string | null;
  }>`
    select s.code as stage_code, ht.group_id as home_group_id, at.group_id as away_group_id
    from stages s
    join teams ht on ht.id = ${homeTeamId}
    join teams at on at.id = ${awayTeamId}
    where s.id = ${stageId}
    limit 1
  `;

  if (!fixtureMeta[0]) {
    throw new Error("Stage or team not found.");
  }

  if (fixtureMeta[0].stage_code === "GROUP") {
    if (!fixtureMeta[0].home_group_id || fixtureMeta[0].home_group_id !== fixtureMeta[0].away_group_id) {
      throw new Error("Group-stage fixtures must use teams from the same group.");
    }
  }

  await sql`
    insert into matches (stage_id, home_team_id, away_team_id, kickoff_at, status)
    values (${stageId}, ${homeTeamId}, ${awayTeamId}, ${kickoffAt}, ${status})
  `;

  redirect("/");
}

export async function updateFixture(formData: FormData) {
  await requireAdmin();
  const matchId = z.string().uuid().parse(formString(formData, "match_id"));
  const existing = await loadMatchForAdmin(matchId);
  if (!existing) {
    throw new Error("Match not found.");
  }
  if (existing.status !== "SCHEDULED") {
    throw new Error("Fixture can only be edited before lock.");
  }

  const stageId = z.string().uuid().parse(formString(formData, "stage_id"));
  const homeTeamId = z.string().uuid().parse(formString(formData, "home_team_id"));
  const awayTeamId = z.string().uuid().parse(formString(formData, "away_team_id"));
  const kickoffAt = parseNepalDateTimeInput(formString(formData, "kickoff_at"));
  const status = z.enum(["SCHEDULED", "CANCELLED"]).parse(formString(formData, "status") || "SCHEDULED");

  if (status !== "SCHEDULED") {
    throw new Error("Use cancel fixture for cancellations.");
  }

  if (homeTeamId === awayTeamId) {
    throw new Error("Home and away teams must be different.");
  }

  const fixtureMeta = await typedSql<{
    stage_code: string;
    home_group_id: string | null;
    away_group_id: string | null;
  }>`
    select s.code as stage_code, ht.group_id as home_group_id, at.group_id as away_group_id
    from stages s
    join teams ht on ht.id = ${homeTeamId}
    join teams at on at.id = ${awayTeamId}
    where s.id = ${stageId}
    limit 1
  `;

  if (!fixtureMeta[0]) {
    throw new Error("Stage or team not found.");
  }

  if (fixtureMeta[0].stage_code === "GROUP") {
    if (!fixtureMeta[0].home_group_id || fixtureMeta[0].home_group_id !== fixtureMeta[0].away_group_id) {
      throw new Error("Group-stage fixtures must use teams from the same group.");
    }
  }

  await sql`
    update matches
    set stage_id = ${stageId},
        home_team_id = ${homeTeamId},
        away_team_id = ${awayTeamId},
        kickoff_at = ${kickoffAt},
        status = ${status},
        updated_at = now()
    where id = ${matchId}
  `;

  redirect("/");
}

export async function cancelFixture(formData: FormData) {
  await requireAdmin();
  const matchId = z.string().uuid().parse(formString(formData, "match_id"));
  const existing = await loadMatchForAdmin(matchId);
  if (!existing) {
    throw new Error("Match not found.");
  }
  if (existing.status === "COMPLETED") {
    throw new Error("Completed matches cannot be cancelled.");
  }

  await sql`
    update matches
    set status = 'CANCELLED',
        updated_at = now()
    where id = ${matchId}
  `;

  redirect("/");
}

export async function createMatch(formData: FormData) {
  return createFixture(formData);
}

export async function updateMatch(formData: FormData) {
  return updateFixture(formData);
}

export async function updateStageAmount(formData: FormData) {
  await requireAdmin();
  const stageId = z.string().uuid().parse(formString(formData, "stage_id"));
  const entryAmount = z.coerce.number().positive().parse(formString(formData, "entry_amount"));

  await sql`
    update stages
    set entry_amount = ${entryAmount}
    where id = ${stageId}
  `;

  redirect("/");
}

export async function updateUnresolvedPool(formData: FormData) {
  await requireAdmin();
  const poolId = z.string().uuid().parse(formString(formData, "pool_id"));
  const status = z.enum(["UNRESOLVED", "CARRIED_FORWARD", "SPLIT_EQUALLY", "MANUAL"]).parse(
    formString(formData, "status")
  );
  const amount = formNumber(formData, "amount");
  const reason = formNullableString(formData, "reason");

  await sql`
    update unresolved_pools
    set status = ${status},
        amount = coalesce(${amount}, amount),
        reason = ${reason}
    where id = ${poolId}
  `;

  redirect("/");
}
