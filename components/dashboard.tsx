import { Countdown } from './countdown';
import { MatchLeaderboardModal } from './match-leaderboard-modal';
import { MatchPredictionModal } from './match-prediction-modal';
import { currencyLabel } from './dashboard-shared';
import {
  cancelFixture,
  createFixture,
  createTeam,
  changeInitialPassword,
  changePassword,
  finalizeMatchResult,
  finalizeMemberSettlement,
  loginWithPassword,
  logout,
  raisePredictionIssue,
  resolvePredictionIssue,
  undoMemberSettlementFinalization,
  settleMemberSettlement,
  syncLocks,
  updateFixture,
  updateUnresolvedPool,
  updateStageAmount,
} from '@/app/actions';
import { PredictionFormClient } from './prediction-form-client';
import type { DashboardData, MatchLeaderboardBlock, MatchPredictionSummaryBlock, MatchRow, Team } from '@/lib/game';

function cardClass(extra = '') {
  return `pitch-card rounded-[28px] p-5 md:p-6 ${extra}`;
}

function matchLabel(match: MatchRow) {
  const home = `${match.home_team_flag_emoji ?? ''} ${match.home_team_short_name || match.home_team_name}`.trim();
  const away = `${match.away_team_flag_emoji ?? ''} ${match.away_team_short_name || match.away_team_name}`.trim();
  return `${home} vs ${away}`;
}

function teamLabel(teams: Team[], teamId: string | null) {
  if (!teamId) return 'Hidden';
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const name = team?.short_name || team?.name || 'TBD';
  return `${team?.flag_emoji ?? ''} ${name}`.trim();
}

function compactTeamLabel(team: Team | null) {
  if (!team) return 'TBD';
  return team.short_name || team.name || 'TBD';
}

function teamLabelParts(team: Team | null) {
  if (!team) {
    return {
      emoji: '',
      shortName: 'TBD',
      fullName: 'TBD',
    };
  }

  return {
    emoji: team.flag_emoji ?? '',
    shortName: team.short_name || team.name || 'TBD',
    fullName: team.name || team.short_name || 'TBD',
  };
}

function TeamLabelStack({ team, align = 'left' }: { team: Team | null; align?: 'left' | 'center' }) {
  const parts = teamLabelParts(team);
  const alignClass = align === 'center' ? 'items-center text-center' : 'items-start text-left';

  return (
    <span className={`flex flex-col ${alignClass}`}>
      <span className="text-sm font-black leading-tight">
        {parts.emoji ? `${parts.emoji} ` : ''}
        {parts.shortName}
      </span>
      {parts.fullName !== parts.shortName ? (
        <span className="text-[11px] font-medium leading-4 text-emerald-950/60">{parts.fullName}</span>
      ) : null}
    </span>
  );
}

function formatNepalDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(iso));
}

function resultReadyAt(match: MatchRow) {
  const kickoff = new Date(match.kickoff_at).getTime();
  if (Number.isNaN(kickoff)) {
    return null;
  }

  return kickoff + (match.stage_is_knockout ? 3 * 60 * 60 * 1000 : 90 * 60 * 1000);
}

function canUpdateMatchResult(match: MatchRow) {
  const readyAt = resultReadyAt(match);
  return match.status !== 'SCHEDULED' || (readyAt !== null && Date.now() >= readyAt);
}

function predictionSummaryText(match: MatchRow, teams: Team[]) {
  if (!match.prediction_id) {
    return null;
  }

  const home = compactTeamLabel(teams.find((team) => team.id === match.home_team_id) ?? null);
  const away = compactTeamLabel(teams.find((team) => team.id === match.away_team_id) ?? null);

  if (match.stage_is_knockout) {
    const winner = compactTeamLabel(teams.find((team) => team.id === match.predicted_winner_team_id) ?? null);
    const score =
      match.predicted_home_score !== null && match.predicted_away_score !== null
        ? ` (${match.predicted_home_score}-${match.predicted_away_score})`
        : '';
    return `${winner}${score}`;
  }

  if (match.predicted_home_score === null || match.predicted_away_score === null) {
    return `${home} vs ${away}`;
  }

  return `${home} ${match.predicted_home_score}-${match.predicted_away_score} ${away}`;
}

function predictionLabel(value: MatchRow['predicted_outcome'] | null) {
  if (!value) return 'Hidden';
  if (value === 'HOME_WIN') return 'Home win';
  if (value === 'AWAY_WIN') return 'Away win';
  return 'Draw';
}

function actualResultLabel(match: MatchRow) {
  const homeScore = match.home_score;
  const awayScore = match.away_score;

  if (homeScore !== null && awayScore !== null) {
    const score = `FT ${homeScore}-${awayScore}`;
    if (match.stage_is_knockout && match.went_penalties && match.winner_team_id) {
      const winner =
        match.winner_team_id === match.home_team_id
          ? match.home_team_name
          : match.winner_team_id === match.away_team_id
            ? match.away_team_name
            : 'Winner';
      return `${score}${match.went_extra_time ? ' ET' : ''} on pens (${winner})`;
    }
    if (match.stage_is_knockout && match.went_extra_time) {
      return `${score} ET`;
    }
    return score;
  }

  if (match.actual_outcome) {
    return predictionLabel(match.actual_outcome);
  }

  return 'TBD';
}

function hasMatchResult(match: MatchRow) {
  return match.home_score !== null || match.away_score !== null || match.actual_outcome !== null;
}

function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function badgeForStatus(status: MatchRow['status']) {
  const map: Record<MatchRow['status'], string> = {
    SCHEDULED: 'bg-emerald-100 text-emerald-900',
    LOCKED: 'bg-amber-100 text-amber-900',
    LIVE: 'bg-sky-100 text-sky-900',
    COMPLETED: 'bg-slate-200 text-slate-900',
    CANCELLED: 'bg-rose-100 text-rose-900',
  };
  return map[status];
}

export function LoginCard({ errorMessage }: { errorMessage?: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-8">
      <section className={cardClass('w-full max-w-lg')}>
        <div className="mb-6">
          <span className="badge bg-emerald-100 text-emerald-900">Internal office pool</span>
          <h1 className="pitch-title mt-4 text-4xl font-black tracking-tight text-turf md:text-5xl">
            FIFA World Cup 2026 office pool
          </h1>
          <p className="mt-3 text-sm leading-6 text-emerald-950/80">
            Private office pool with seeded accounts and temporary passwords.
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            Invalid email or password.
          </div>
        ) : null}

        <form action={loginWithPassword} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-turf" htmlFor="email">
              Office email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              className="field"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-turf" htmlFor="password">
              Temporary or new password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              className="field"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Enter the pool
          </button>
        </form>
        <p className="mt-4 text-xs leading-5 text-emerald-950/70">
          Use your office email and temporary password to enter.
        </p>
      </section>
    </main>
  );
}

export function PasswordChangeCard({
  member,
  errorMessage,
}: {
  member: { email: string; full_name: string };
  errorMessage?: string | null;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-8">
      <section className={cardClass('w-full max-w-xl')}>
        <div className="mb-6">
          <span className="badge bg-amber-100 text-amber-900">First login</span>
          <h1 className="pitch-title mt-4 text-4xl font-black tracking-tight text-turf">
            Change your temporary password
          </h1>
          <p className="mt-3 text-sm leading-6 text-emerald-950/80">Change it once before you start predicting.</p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            Password change failed. Check the current password and try again.
          </div>
        ) : null}

        <div className="mb-4 rounded-[24px] bg-emerald-50 px-4 py-3 text-sm text-emerald-950/80">
          Logged in as <span className="font-semibold text-turf">{member.full_name}</span> ({member.email}).
        </div>

        <form action={changeInitialPassword} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-turf" htmlFor="currentPassword">
              Current temporary password
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="field"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-turf" htmlFor="newPassword">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              className="field"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-turf" htmlFor="confirmPassword">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="field"
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            Save new password
          </button>
        </form>
      </section>
    </main>
  );
}

function TopHeader({ data }: { data: DashboardData }) {
  if (!data.member) return null;

  return (
    <header className="mb-6 flex flex-col gap-4 rounded-[32px] bg-turf px-5 py-5 text-chalk shadow-soft md:flex-row md:items-center md:justify-between md:px-7">
      <div>
        <span className="badge bg-white/10 text-chalk">{data.member.role === 'ADMIN' ? 'Admin' : 'Player'}</span>
        <h2 className="pitch-title mt-3 text-3xl font-black tracking-tight">
          Hey {data.member.full_name.split(' ')[0]}, ready for kickoff?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-chalk/80">Track the lock timer and submit before kickoff.</p>
      </div>
      <form action={logout}>
        <button className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-chalk transition hover:bg-white/10">
          Logout
        </button>
      </form>
    </header>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="pitch-title text-2xl font-black tracking-tight text-turf">{title}</h3>
      {subtitle ? <p className="mt-1 text-sm text-emerald-950/70">{subtitle}</p> : null}
    </div>
  );
}

function UpcomingMatchCard({
  matches,
  teams,
  memberRole,
  predictionSummaries,
}: {
  matches: MatchRow[];
  teams: Team[];
  memberRole: 'ADMIN' | 'MEMBER';
  predictionSummaries: MatchPredictionSummaryBlock[];
}) {
  const upcomingMatches = matches.filter((match) => match.status === 'SCHEDULED');

  if (upcomingMatches.length === 0) {
    return (
      <section className={cardClass()}>
        <SectionTitle title="Today / upcoming matches" subtitle="Nothing scheduled yet." />
      </section>
    );
  }

  return (
    <section className={cardClass()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle title="Today / upcoming matches" subtitle="Next four fixtures in Nepal time." />
        <a
          href="#match-list"
          className="rounded-2xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold text-turf transition hover:bg-emerald-50"
        >
          Go to match list
        </a>
      </div>
      <div className="flex flex-col gap-3 xl:flex-row">
        {upcomingMatches.map((match, index) => {
          const homeTeam = teams.find((team) => team.id === match.home_team_id) ?? null;
          const awayTeam = teams.find((team) => team.id === match.away_team_id) ?? null;
          const isNext = index === 0;
          const locked = match.status !== 'SCHEDULED';
          return (
            <article
              key={match.id}
              className={`min-w-0 flex-1 rounded-[22px] border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                isNext
                  ? 'border-turf/20 bg-white text-turf ring-2 ring-turf/10'
                  : 'border-emerald-900/10 bg-white/90 text-turf'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-950/55">
                    {match.stage_name}
                  </p>
                  <h4 className="mt-1 break-words text-base font-black leading-tight text-turf">{matchLabel(match)}</h4>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-emerald-950/60">
                    {match.home_team_name} vs {match.away_team_name}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`badge ${badgeForStatus(match.status)}`}>{match.status}</span>
                  {match.prediction_id ? (
                    <span className="badge bg-amber-100 text-amber-900">Already predicted</span>
                  ) : null}
                  {match.status === 'LOCKED' || match.status === 'LIVE' || match.status === 'COMPLETED' ? (
                    <MatchPredictionModal
                      match={match}
                      teams={teams}
                      rows={predictionSummaries.find((entry) => entry.match_id === match.id)?.rows ?? []}
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-emerald-950/80">
                <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-950/55">Kickoff</p>
                  <p className="mt-1 text-sm font-bold">{formatNepalDateTime(match.kickoff_at)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-950/55">Home</p>
                    <div className="mt-1">
                      <TeamLabelStack team={homeTeam} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-950/55">Away</p>
                    <div className="mt-1">
                      <TeamLabelStack team={awayTeam} />
                    </div>
                  </div>
                </div>
                <p className="text-xs leading-5 text-emerald-950/70">
                  {locked ? (
                    'Locked or live.'
                  ) : (
                    <>
                      Locks in <Countdown targetIso={match.lock_at} />
                    </>
                  )}
                </p>
                {match.status === 'SCHEDULED' ? (
                  <details className="mt-1 rounded-2xl border border-amber-900/15 bg-amber-50 p-3">
                    <summary className="cursor-pointer list-none rounded-2xl bg-white px-4 py-2 text-center text-sm font-semibold text-amber-950 transition hover:bg-amber-50">
                      {match.prediction_id ? 'Update prediction' : 'Predict'}
                    </summary>
                    <div className="mt-3">
                      <PredictionForm match={match} teams={teams} memberRole={memberRole} compact />
                    </div>
                  </details>
                ) : null}
                {memberRole === 'MEMBER' && match.prediction_id ? (
                  <details className="mt-1 rounded-2xl border border-amber-900/15 bg-amber-50 p-3">
                    <summary className="cursor-pointer list-none rounded-2xl bg-white px-4 py-2 text-center text-sm font-semibold text-amber-950 transition hover:bg-amber-50">
                      Raise issue
                    </summary>
                    <form action={raisePredictionIssue} className="mt-3 space-y-3">
                      <input type="hidden" name="match_id" value={match.id} />
                      <textarea
                        name="reason"
                        className="field min-h-24"
                        placeholder="Explain the issue in a few words."
                        required
                      />
                      <p className="text-xs leading-5 text-amber-950/70">
                        If 2 or 3 members flag the same match, admin will review the audit.
                      </p>
                      <button type="submit" className="btn-secondary w-full">
                        Submit issue
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PredictionForm({
  match,
  teams,
  memberRole,
  compact = false,
  readOnly = false,
  readOnlyButtonLabel = 'View saved prediction',
}: {
  match: MatchRow;
  teams: Team[];
  memberRole: 'ADMIN' | 'MEMBER';
  compact?: boolean;
  readOnly?: boolean;
  readOnlyButtonLabel?: string;
}) {
  return (
    <PredictionFormClient
      match={match}
      teams={teams}
      memberRole={memberRole}
      compact={compact}
      initialHasPrediction={Boolean(match.prediction_id)}
      readOnly={readOnly}
      readOnlyButtonLabel={readOnlyButtonLabel}
    />
  );
}

function PredictionVisibilityPanel({
  match,
  teams,
  rows,
}: {
  match: MatchRow;
  teams: Team[];
  rows: MatchPredictionSummaryBlock['rows'];
}) {
  const showResults = match.status === 'COMPLETED';
  return (
    <div className="mt-4 rounded-[24px] border border-emerald-900/10 bg-white/85 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-bold text-turf">Prediction board</h4>
          <p className="text-sm text-emerald-950/70">
            {match.status === 'SCHEDULED' ? 'Hidden until lock time.' : 'Locked and visible.'}
          </p>
        </div>
        <span className={`badge ${badgeForStatus(match.status)}`}>{match.status}</span>
      </div>
      <div className="overflow-x-auto rounded-[20px] border border-emerald-900/10 bg-emerald-50/70">
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="bg-white/80 uppercase tracking-[0.18em] text-emerald-950/60">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Prediction</th>
              <th className="px-4 py-3">Score</th>
              {showResults ? (
                <>
                  <th className="px-4 py-3">Pts</th>
                  <th className="px-4 py-3">Prize</th>
                  <th className="px-4 py-3">Contrib.</th>
                  <th className="px-4 py-3">Pay</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const predictionVisible = row.details_visible;
              return (
                <tr key={row.member_id} className="border-t border-emerald-900/5">
                  <td className="px-4 py-3 font-semibold text-turf">{row.full_name}</td>
                  <td className="px-4 py-3 text-turf">{row.submission_status}</td>
                  <td className="px-4 py-3 text-turf">
                    {predictionVisible ? (
                      match.stage_is_knockout ? (
                        <span>
                          {predictionLabel(row.predicted_outcome)} • Winner{' '}
                          {teamLabel(teams, row.predicted_winner_team_id)}
                        </span>
                      ) : (
                        <span>{predictionLabel(row.predicted_outcome)}</span>
                      )
                    ) : (
                      'Hidden'
                    )}
                  </td>
                  <td className="px-4 py-3 text-turf">
                    {predictionVisible ? (
                      match.stage_is_knockout ? (
                        <span>
                          {row.predicted_home_score ?? '?'}-{row.predicted_away_score ?? '?'}
                          {row.predicts_extra_time
                            ? ` ET ${row.predicted_home_extra_score ?? '?'}-${row.predicted_away_extra_score ?? '?'}`
                            : ''}
                          {row.predicts_penalties
                            ? ` Pens ${teamLabel(teams, row.predicted_penalty_winner_team_id)}`
                            : ''}
                        </span>
                      ) : (
                        <span>
                          {row.predicted_home_score ?? '?'}-{row.predicted_away_score ?? '?'}
                        </span>
                      )
                    ) : (
                      'Hidden'
                    )}
                  </td>
                  {showResults ? (
                    <>
                      <td className="px-4 py-3 font-semibold text-turf">{row.total_points ?? 0}</td>
                      <td className="px-4 py-3 text-turf">{currencyLabel(row.prize_amount ?? '0.00')}</td>
                      <td className="px-4 py-3 text-turf">{currencyLabel(row.contribution_amount ?? '0.00')}</td>
                      <td className="px-4 py-3 text-turf">{row.payment_status ?? '-'}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchCard({
  match,
  teams,
  memberRole,
  matchLeaderboards,
  predictionSummaries,
}: {
  match: MatchRow;
  teams: Team[];
  memberRole: 'ADMIN' | 'MEMBER';
  matchLeaderboards: MatchLeaderboardBlock[];
  predictionSummaries: MatchPredictionSummaryBlock[];
}) {
  const isPredictionLocked = match.status === 'LOCKED' || match.status === 'COMPLETED';
  const hasPrediction = Boolean(match.prediction_id);

  return (
    <article className="rounded-[22px] border border-emerald-900/10 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-950/55">
            {match.stage_name}
          </p>
          <h4 className="mt-1 truncate text-base font-black text-turf">{matchLabel(match)}</h4>
          <p className="mt-1 text-sm text-emerald-950/65">{formatNepalDateTime(match.kickoff_at)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`badge ${badgeForStatus(match.status)}`}>{match.status}</span>
          {hasPrediction ? <span className="badge bg-amber-100 text-amber-900">Already predicted</span> : null}
          {match.status === 'LOCKED' || match.status === 'COMPLETED' ? (
            <MatchLeaderboardModal
              match={match}
              matchLeaderboards={matchLeaderboards}
              predictionSummaries={predictionSummaries}
              teams={teams}
            />
          ) : null}
        </div>
      </div>

      {isPredictionLocked ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <details className="rounded-2xl border border-emerald-900/10 bg-emerald-50/80 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-turf">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
                <path d="M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" />
                <path d="M8 8h8" />
                <path d="M8 12h8" />
                <path d="M8 16h5" />
              </svg>
              View My Prediction
            </summary>
            <div className="mt-3">
              <PredictionForm
                match={match}
                teams={teams}
                memberRole={memberRole}
                compact
                readOnly
                readOnlyButtonLabel="View My Prediction"
              />
            </div>
          </details>

          {hasPrediction ? (
            <details className="rounded-2xl border border-amber-900/15 bg-amber-50/80 px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-amber-950">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
                Raise issue
              </summary>
              <form action={raisePredictionIssue} className="mt-3 space-y-3">
                <input type="hidden" name="match_id" value={match.id} />
                <textarea
                  name="reason"
                  className="field min-h-24"
                  placeholder="Explain the issue in a few words."
                  required
                />
                <p className="text-xs leading-5 text-amber-950/70">
                  If 2 or 3 members flag the same match, admin will review the audit.
                </p>
                <button type="submit" className="btn-secondary w-full">
                  Submit issue
                </button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 px-3 py-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-950/60">My points</p>
          <p className="mt-1 font-bold text-turf">{match.points ?? 0}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-950/60">Score</p>
          <p className="mt-1 font-bold text-turf">{hasMatchResult(match) ? actualResultLabel(match) : 'TBD'}</p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-emerald-950/70">
        {match.stage_is_knockout ? 'Knockout fixture.' : 'Group fixture.'}
      </p>

      {match.status === 'SCHEDULED' ? (
        <details className="mt-4 rounded-[20px] border border-emerald-900/10 bg-emerald-50/70 p-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-turf">
            {match.prediction_id ? 'Update prediction' : 'Predict'}
          </summary>
          <div className="mt-3">
            <PredictionForm match={match} teams={teams} memberRole={memberRole} compact />
          </div>
        </details>
      ) : null}
    </article>
  );
}

function LeaderboardCard({ data }: { data: DashboardData }) {
  return (
    <section id="leaderboard" className={cardClass()}>
      <SectionTitle title="Leaderboard" subtitle="Current standings." />
      <div className="overflow-x-auto rounded-[24px] border border-emerald-900/10 bg-white/80">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-emerald-50 text-xs uppercase tracking-[0.18em] text-emerald-950/60">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Points</th>
              <th className="px-4 py-3">Contributed</th>
              <th className="px-4 py-3">Winnings</th>
              <th className="px-4 py-3">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((row) => (
              <tr key={row.member_id} className="border-t border-emerald-900/5">
                <td className="px-4 py-3 font-semibold text-turf">#{row.rank}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-turf">{row.full_name}</div>
                  <div className="text-xs text-emerald-950/65">{row.email}</div>
                </td>
                <td className="px-4 py-3 font-semibold text-turf">{row.total_points}</td>
                <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.total_contributed)}</td>
                <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.total_winnings)}</td>
                <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.net_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountCard({ member, errorMessage }: { member: DashboardData['member']; errorMessage?: string | null }) {
  if (!member) {
    return null;
  }

  return (
    <section className={cardClass()}>
      <SectionTitle title="Account" subtitle="Keep your password fresh and secure." />
      <div className="rounded-[24px] bg-white/80 p-4">
        <p className="text-sm font-semibold text-turf">{member.full_name}</p>
        <p className="text-xs text-emerald-950/65">{member.email}</p>
        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            Current password or new password was not accepted.
          </div>
        ) : null}
        <form action={changePassword} className="mt-4 space-y-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/70">
              Current password
            </label>
            <input type="password" name="currentPassword" autoComplete="current-password" className="field" required />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/70">
              New password
            </label>
            <input type="password" name="newPassword" autoComplete="new-password" className="field" required />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/70">
              Confirm new password
            </label>
            <input type="password" name="confirmPassword" autoComplete="new-password" className="field" required />
          </div>
          <button className="btn-secondary w-full">Change password</button>
        </form>
      </div>
    </section>
  );
}

function GroupStandingsSection({ data }: { data: DashboardData }) {
  return (
    <section id="group-standing" className={cardClass()}>
      <SectionTitle title="Group Standings" subtitle="Calculated from completed group-stage matches only." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.groups.map((group) => {
          const rows = data.groupStandings.filter((row) => row.group_code === group.code);
          return (
            <article key={group.id} className="rounded-[24px] border border-emerald-900/10 bg-white/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-950/60">{group.code}</p>
                  <h4 className="mt-1 font-black text-turf">{group.name}</h4>
                </div>
                <span className="badge bg-emerald-100 text-emerald-900">{rows.length} teams</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[560px] w-full text-left text-xs">
                  <thead className="text-emerald-950/55">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Team</th>
                      <th className="px-2 py-2">P</th>
                      <th className="px-2 py-2">W</th>
                      <th className="px-2 py-2">D</th>
                      <th className="px-2 py-2">L</th>
                      <th className="px-2 py-2">GF</th>
                      <th className="px-2 py-2">GA</th>
                      <th className="px-2 py-2">GD</th>
                      <th className="px-2 py-2">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.team_id} className="border-t border-emerald-900/5">
                        <td className="px-2 py-2 font-semibold text-turf">{row.standing_position}</td>
                        <td className="px-2 py-2 text-base font-black text-turf">
                          <span className="flex flex-col">
                            <span className="text-sm font-black leading-tight">
                              {row.flag_emoji ? `${row.flag_emoji} ` : ''}
                              {row.short_name || row.team_name}
                            </span>
                            {row.team_name !== (row.short_name || row.team_name) ? (
                              <span className="text-[11px] font-medium leading-4 text-emerald-950/60">
                                {row.team_name}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-2 py-2">{row.played}</td>
                        <td className="px-2 py-2">{row.won}</td>
                        <td className="px-2 py-2">{row.drawn}</td>
                        <td className="px-2 py-2">{row.lost}</td>
                        <td className="px-2 py-2">{row.goals_for}</td>
                        <td className="px-2 py-2">{row.goals_against}</td>
                        <td className="px-2 py-2">{row.goal_difference}</td>
                        <td className="px-2 py-2 font-bold text-turf">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PrizePoolCard({ data }: { data: DashboardData }) {
  const unresolvedPools = data.prizePools.filter((row) => row.status === 'UNRESOLVED');
  const total = unresolvedPools.reduce((sum, row) => sum + Number(row.amount), 0);
  const activeSettlements = data.settlements.filter((row) => Number(row.current_amount) !== 0);

  return (
    <section className={cardClass()}>
      <SectionTitle title="Prize pool" subtitle="Distributions and unresolved carry-over amounts." />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] bg-turf p-5 text-chalk">
          <p className="text-xs uppercase tracking-[0.2em] text-chalk/60">Total unresolved</p>
          <p className="mt-2 text-3xl font-black">{currencyLabel(total.toFixed(2))}</p>
        </div>
        <div className="rounded-[24px] bg-emerald-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-950/60">Unresolved matches</p>
          <p className="mt-2 text-3xl font-black text-turf">{unresolvedPools.length}</p>
        </div>
        <div className="rounded-[24px] bg-amber-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-950/60">Active settlements</p>
          <p className="mt-2 text-3xl font-black text-amber-900">{activeSettlements.length}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {unresolvedPools.slice(0, 4).map((pool) => (
          <div key={pool.match_id} className="rounded-[20px] bg-white/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-turf">{pool.match_label}</p>
                <p className="text-xs text-emerald-950/65">{pool.status}</p>
              </div>
              <div className="font-bold text-turf">{currencyLabel(pool.amount)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function settlementBadgeClass(status: DashboardData['settlements'][number]['current_status']) {
  const map: Record<DashboardData['settlements'][number]['current_status'], string> = {
    OPEN: 'bg-amber-100 text-amber-900',
    RECEIVE: 'bg-emerald-100 text-emerald-900',
    COLLECT: 'bg-rose-100 text-rose-900',
    ZERO: 'bg-slate-100 text-slate-900',
  };

  return map[status];
}

function currentSettlementLabel(amount: number) {
  if (amount > 0) {
    return `To give ${currencyLabel(amount.toFixed(2))}`;
  }

  if (amount < 0) {
    return `To collect ${currencyLabel(Math.abs(amount).toFixed(2))}`;
  }

  return 'Settled';
}

function SettlementStatusTable({ data }: { data: DashboardData }) {
  if (data.member?.role !== 'ADMIN') return null;
  const rows = [...data.settlements].sort((a, b) => {
    if (a.current_status === 'OPEN' && b.current_status !== 'OPEN') return -1;
    if (a.current_status !== 'OPEN' && b.current_status === 'OPEN') return 1;
    return a.rank - b.rank;
  });
  const matchRows = data.matchLeaderboards.flatMap((block) => block.rows);
  const toGive = matchRows.filter((row) => Number(row.net_amount) > 0).reduce((sum, row) => sum + Number(row.net_amount), 0);
  const toCollect = Math.abs(
    matchRows.filter((row) => Number(row.net_amount) < 0).reduce((sum, row) => sum + Number(row.net_amount), 0),
  );
  const totalNet = matchRows.reduce((sum, row) => sum + Number(row.net_amount), 0);

  return (
    <section className={cardClass()}>
      <SectionTitle
        title="Settlement status"
        subtitle="Totals are based on the individual game leaderboards."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] bg-emerald-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-950/60">Members to settle</p>
          <p className="mt-2 text-3xl font-black text-turf">
            {matchRows.filter((row) => Number(row.net_amount) !== 0).length}
          </p>
        </div>
        <div className="rounded-[24px] bg-amber-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-950/60">To give</p>
          <p className="mt-2 text-3xl font-black text-amber-900">{currencyLabel(toGive.toFixed(2))}</p>
        </div>
        <div className="rounded-[24px] bg-rose-50 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-rose-950/60">To collect</p>
          <p className="mt-2 text-3xl font-black text-rose-900">{currencyLabel(toCollect.toFixed(2))}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-rose-950/55">
            Net {currencyLabel(totalNet.toFixed(2))}
          </p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-[24px] border border-emerald-900/10 bg-white/80">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-emerald-50 text-xs uppercase tracking-[0.18em] text-emerald-950/60">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Points</th>
              <th className="px-4 py-3">Winnings</th>
              <th className="px-4 py-3">Fees</th>
              <th className="px-4 py-3">Settled</th>
              <th className="px-4 py-3">Current amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const amount = Number(row.current_amount);
              const isOpen = row.current_status === 'OPEN';

              return (
                <tr key={row.member_id} className="border-t border-emerald-900/5">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-turf">{row.member_name}</div>
                    <div className="text-xs text-emerald-950/60">{row.email}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-turf">{row.total_points}</td>
                  <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.total_winnings)}</td>
                  <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.total_fees)}</td>
                  <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.settled_amount)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-turf">{currentSettlementLabel(amount)}</div>
                    {row.last_finalized_at ? (
                      <div className="text-xs text-emerald-950/60">
                        Finalized {formatNepalDateTime(row.last_finalized_at)}
                      </div>
                    ) : null}
                    {row.last_settled_at ? (
                      <div className="text-xs text-emerald-950/60">
                        Settled {formatNepalDateTime(row.last_settled_at)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${settlementBadgeClass(row.current_status)}`}>
                      {row.current_status === 'OPEN'
                        ? 'Open'
                        : row.current_status === 'RECEIVE'
                          ? 'Ready to give'
                          : row.current_status === 'COLLECT'
                            ? 'Ready to collect'
                            : 'Settled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isOpen ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <form action={settleMemberSettlement} className="flex items-center gap-2">
                          <input type="hidden" name="settlement_id" value={row.open_settlement_id ?? ''} />
                          <button className="btn-secondary px-3 py-2 text-xs">Settle</button>
                        </form>
                        <form action={undoMemberSettlementFinalization} className="flex items-center gap-2">
                          <input type="hidden" name="settlement_id" value={row.open_settlement_id ?? ''} />
                          <button className="btn-secondary px-3 py-2 text-xs">Undo finalize</button>
                        </form>
                      </div>
                    ) : amount !== 0 ? (
                      <form action={finalizeMemberSettlement} className="flex items-center gap-2">
                        <input type="hidden" name="member_id" value={row.member_id} />
                        <input type="hidden" name="settlement_scope" value="MANUAL" />
                        <button className="btn-secondary px-3 py-2 text-xs">Finalize</button>
                      </form>
                    ) : (
                      <span className="text-xs font-medium text-emerald-950/50">No action</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PredictionIssueSection({ data }: { data: DashboardData }) {
  if (data.member?.role !== 'ADMIN') return null;

  const openIssues = data.predictionIssueReports.filter((issue) => issue.status === 'OPEN');

  if (openIssues.length === 0) {
    return null;
  }

  return (
    <section className={cardClass()}>
      <SectionTitle title="Prediction issues" subtitle="Shown while members have an open dispute or concern." />
      <div className="space-y-3">
        {openIssues.map((issue) => (
          <div key={issue.id} className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-amber-950/60">{issue.match_label}</p>
                <h4 className="mt-1 font-bold text-amber-950">{issue.member_name}</h4>
                <p className="mt-1 text-sm leading-6 text-amber-950/80">{issue.reason}</p>
                <p className="mt-2 text-xs text-amber-950/60">Raised {formatNepalDateTime(issue.created_at)}</p>
              </div>
              <form action={resolvePredictionIssue}>
                <input type="hidden" name="issue_id" value={issue.id} />
                <button className="btn-secondary">Resolve</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PredictionAuditSection({ data }: { data: DashboardData }) {
  if (data.member?.role !== 'ADMIN') return null;
  const openIssues = data.predictionIssueReports.filter((issue) => issue.status === 'OPEN');
  if (openIssues.length === 0) return null;

  return (
    <section className={cardClass()}>
      <SectionTitle title="Prediction audit" subtitle="Visible only while an issue is open and needs review." />
      <div className="overflow-x-auto rounded-[24px] border border-emerald-900/10 bg-white/80">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-emerald-50 text-xs uppercase tracking-[0.18em] text-emerald-950/60">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Fixture</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Prediction</th>
            </tr>
          </thead>
          <tbody>
            {data.predictionAuditLogs.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-sm text-emerald-950/70" colSpan={5}>
                  No prediction audit entries yet.
                </td>
              </tr>
            ) : (
              data.predictionAuditLogs.map((row) => (
                <tr key={row.id} className="border-t border-emerald-900/5">
                  <td className="px-4 py-3 text-turf">{formatNepalDateTime(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-turf">{row.member_name}</div>
                    <div className="text-xs text-emerald-950/65">{row.member_id}</div>
                  </td>
                  <td className="px-4 py-3 text-turf">{row.match_label}</td>
                  <td className="px-4 py-3 text-turf">{row.action}</td>
                  <td className="px-4 py-3 text-turf">
                    <pre className="max-w-[420px] whitespace-pre-wrap rounded-2xl bg-emerald-50 px-3 py-2 text-xs leading-5">
                      {JSON.stringify(row.after_payload, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultUpdateSection({ data }: { data: DashboardData }) {
  if (data.member?.role !== 'ADMIN') return null;

  const editableMatches = data.matches
    .filter((match) => canUpdateMatchResult(match))
    .sort((a, b) => {
      if (a.result_locked !== b.result_locked) {
        return a.result_locked ? 1 : -1;
      }
      return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
    });

  return (
    <section className={cardClass()}>
      <SectionTitle title="Result update" subtitle="Set the result first, then lock it once you are sure." />
      <div className="space-y-4">
        {editableMatches.length === 0 ? (
          <p className="text-sm text-emerald-950/70">No matches are ready for result update yet.</p>
        ) : (
          editableMatches.map((match) => {
            const locked = match.result_locked;
            const homeDisabled = locked;
            return (
              <form
                key={match.id}
                action={finalizeMatchResult}
                className="rounded-[24px] border border-emerald-900/10 bg-white/80 p-4"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-950/60">{match.stage_name}</p>
                    <h4 className="mt-1 font-bold text-turf">{matchLabel(match)}</h4>
                    <p className="mt-1 text-[11px] font-medium leading-4 text-emerald-950/60">
                      {match.home_team_name} vs {match.away_team_name}
                    </p>
                    <p className="mt-1 text-sm text-emerald-950/70">
                      {match.status} • Kickoff {formatNepalDateTime(match.kickoff_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`badge ${badgeForStatus(match.status)}`}>{match.status}</span>
                    <span
                      className={`badge ${locked ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}
                    >
                      {locked ? 'Result locked' : 'Draft result'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <input
                    name="home_score"
                    type="number"
                    min="0"
                    placeholder="Home score"
                    className="field"
                    defaultValue={match.home_score ?? ''}
                    disabled={homeDisabled}
                    required
                  />
                  <input
                    name="away_score"
                    type="number"
                    min="0"
                    placeholder="Away score"
                    className="field"
                    defaultValue={match.away_score ?? ''}
                    disabled={homeDisabled}
                    required
                  />
                  <select
                    name="actual_outcome"
                    className="field"
                    defaultValue={match.actual_outcome ?? ''}
                    disabled={homeDisabled}
                    required
                  >
                    <option value="">Actual outcome</option>
                    <option value="HOME_WIN">Home win</option>
                    <option value="AWAY_WIN">Away win</option>
                    {match.stage_is_knockout ? null : <option value="DRAW">Draw</option>}
                  </select>
                  {match.stage_is_knockout ? (
                    <>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="went_extra_time"
                          defaultChecked={Boolean(match.went_extra_time)}
                          disabled={homeDisabled}
                        />
                        Extra time
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="went_penalties"
                          defaultChecked={Boolean(match.went_penalties)}
                          disabled={homeDisabled}
                        />
                        Penalties
                      </label>
                      <input
                        name="home_extra_score"
                        type="number"
                        min="0"
                        placeholder="ET home"
                        className="field"
                        defaultValue={match.home_extra_score ?? ''}
                        disabled={homeDisabled}
                      />
                      <input
                        name="away_extra_score"
                        type="number"
                        min="0"
                        placeholder="ET away"
                        className="field"
                        defaultValue={match.away_extra_score ?? ''}
                        disabled={homeDisabled}
                      />
                      <select
                        name="winner_team_id"
                        className="field"
                        defaultValue={match.winner_team_id ?? ''}
                        disabled={homeDisabled}
                      >
                        <option value="">Winner team</option>
                        <option value={match.home_team_id}>
                          {match.home_team_short_name || match.home_team_name} - {match.home_team_name}
                        </option>
                        <option value={match.away_team_id}>
                          {match.away_team_short_name || match.away_team_name} - {match.away_team_name}
                        </option>
                      </select>
                      <select
                        name="penalty_winner_team_id"
                        className="field"
                        defaultValue={match.penalty_winner_team_id ?? ''}
                        disabled={homeDisabled}
                      >
                        <option value="">Penalty winner</option>
                        <option value={match.home_team_id}>
                          {match.home_team_short_name || match.home_team_name} - {match.home_team_name}
                        </option>
                        <option value={match.away_team_id}>
                          {match.away_team_short_name || match.away_team_name} - {match.away_team_name}
                        </option>
                      </select>
                    </>
                  ) : null}
                </div>

                {locked ? (
                  <p className="mt-3 text-sm font-medium text-emerald-950/70">
                    This result is locked and cannot be changed.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="submit" name="submit_action" value="SAVE" className="btn-secondary">
                      Save result
                    </button>
                    <button type="submit" name="submit_action" value="LOCK" className="btn-primary">
                      Lock result
                    </button>
                  </div>
                )}
              </form>
            );
          })
        )}
      </div>
    </section>
  );
}

function AdminPanel({ data }: { data: DashboardData }) {
  if (data.member?.role !== 'ADMIN') return null;

  const unresolvedPools = data.prizePools.filter((pool) => pool.status === 'UNRESOLVED');
  const editableFixtures = data.matches.filter((match) => match.status === 'SCHEDULED');

  return (
    <section className={cardClass()}>
      <SectionTitle title="Admin controls" subtitle="Only visible to the office admin." />
      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createFixture} className="rounded-[24px] bg-white/80 p-4">
          <h4 className="font-bold text-turf">Create Fixture</h4>
          <p className="mt-2 text-sm text-emerald-950/70">
            Build a future fixture and let the lock trigger handle the deadline.
          </p>
          <div className="mt-3 grid gap-3">
            <select name="stage_id" className="field" required defaultValue="">
              <option value="">Pick a stage</option>
              {data.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <select name="home_team_id" className="field" required defaultValue="">
              <option value="">Home team</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.flag_emoji
                    ? `${team.flag_emoji} ${team.short_name || team.name}`
                    : team.short_name || team.name}
                </option>
              ))}
            </select>
            <select name="away_team_id" className="field" required defaultValue="">
              <option value="">Away team</option>
              {data.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.flag_emoji
                    ? `${team.flag_emoji} ${team.short_name || team.name}`
                    : team.short_name || team.name}
                </option>
              ))}
            </select>
            <input name="kickoff_at" type="datetime-local" className="field" required />
            <input type="hidden" name="status" value="SCHEDULED" />
            <button className="btn-secondary">Create fixture</button>
          </div>
        </form>

        <form action={createTeam} className="rounded-[24px] bg-white/80 p-4">
          <h4 className="font-bold text-turf">Add Team</h4>
          <div className="mt-3 grid gap-3">
            <input name="name" placeholder="Team name" className="field" required />
            <input name="short_name" placeholder="Short name" className="field" />
            <input name="flag_emoji" placeholder="Flag emoji" className="field" />
            <input name="flag_url" placeholder="Flag URL" className="field" />
            <select name="group_id" className="field" required defaultValue="">
              <option value="">Pick a group</option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.code} - {group.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary">Create team</button>
          </div>
        </form>

        <form action={updateStageAmount} className="rounded-[24px] bg-white/80 p-4">
          <h4 className="font-bold text-turf">Update stage amount</h4>
          <div className="mt-3 grid gap-3">
            <select name="stage_id" className="field" required defaultValue="">
              <option value="">Pick a stage</option>
              {data.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <input name="entry_amount" placeholder="Amount" className="field" required />
            <button className="btn-secondary">Update amount</button>
          </div>
        </form>

        <form action={syncLocks} className="rounded-[24px] bg-emerald-50 p-4">
          <h4 className="font-bold text-turf">Sync locks</h4>
          <p className="mt-2 text-sm text-emerald-950/70">
            Lock expired matches, mark missed predictions, and freeze submissions.
          </p>
          <button className="btn-primary mt-4">Sync Locks</button>
        </form>
      </div>

      <div className="mt-5 rounded-[24px] bg-white/80 p-4">
        <h4 className="font-bold text-turf">Edit Fixture</h4>
        <p className="mt-2 text-sm text-emerald-950/70">
          Only scheduled fixtures can be edited. Locked, live, or completed fixtures can be cancelled, but not
          retargeted.
        </p>
        <div className="mt-4 space-y-4">
          {editableFixtures.length === 0 ? (
            <p className="text-sm text-emerald-950/70">No scheduled fixtures available to edit.</p>
          ) : (
            editableFixtures.map((match) => (
              <form
                key={match.id}
                action={updateFixture}
                className="grid gap-3 rounded-[24px] bg-emerald-50 p-4 md:grid-cols-[0.9fr_1fr_1fr_1fr_auto]"
              >
                <input type="hidden" name="match_id" value={match.id} />
                <select name="stage_id" className="field" defaultValue={match.stage_id} required>
                  {data.stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
                <select name="home_team_id" className="field" defaultValue={match.home_team_id} required>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.flag_emoji
                        ? `${team.flag_emoji} ${team.short_name || team.name}`
                        : team.short_name || team.name}
                    </option>
                  ))}
                </select>
                <select name="away_team_id" className="field" defaultValue={match.away_team_id} required>
                  {data.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.flag_emoji
                        ? `${team.flag_emoji} ${team.short_name || team.name}`
                        : team.short_name || team.name}
                    </option>
                  ))}
                </select>
                <input
                  name="kickoff_at"
                  type="datetime-local"
                  className="field"
                  defaultValue={toDatetimeLocalValue(match.kickoff_at)}
                  required
                />
                <input type="hidden" name="status" value="SCHEDULED" />
                <div className="flex flex-wrap gap-2 md:col-span-5">
                  <button className="btn-primary">Save</button>
                  <button formAction={cancelFixture} className="btn-secondary">
                    Cancel match
                  </button>
                </div>
              </form>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 rounded-[24px] bg-white/80 p-4">
        <h4 className="font-bold text-turf">Unresolved pools</h4>
        <div className="mt-3 space-y-3">
          {unresolvedPools.length === 0 ? (
            <p className="text-sm text-emerald-950/70">No unresolved pools right now.</p>
          ) : (
            unresolvedPools.slice(0, 4).map((pool) => (
              <form
                key={pool.id}
                action={updateUnresolvedPool}
                className="grid gap-3 rounded-[20px] bg-emerald-50 p-3 md:grid-cols-[1fr_1fr_0.7fr_auto]"
              >
                <input type="hidden" name="pool_id" value={pool.id} />
                <select name="status" className="field" defaultValue={pool.status}>
                  <option value="UNRESOLVED">Unresolved</option>
                  <option value="CARRIED_FORWARD">Carry forward</option>
                  <option value="SPLIT_EQUALLY">Split equally</option>
                  <option value="MANUAL">Manual adjustment</option>
                </select>
                <input
                  name="amount"
                  className="field"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={pool.amount}
                  placeholder="Amount"
                />
                <input name="reason" className="field" defaultValue={pool.reason ?? ''} placeholder="Reason or note" />
                <button className="btn-primary">Save</button>
              </form>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function AdminWorkspaceMenu() {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-[24px] border border-emerald-900/10 bg-white/80 p-2 shadow-sm">
      <a
        href="#predictions"
        className="rounded-2xl bg-turf px-4 py-3 text-sm font-semibold text-chalk transition hover:opacity-90"
      >
        Predictions
      </a>
      <a
        href="#leaderboard"
        className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
      >
        Leaderboard
      </a>
      <a
        href="#match-list"
        className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
      >
        Match list
      </a>
      <a
        href="#group-standing"
        className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-100"
      >
        Group standing
      </a>
      <a
        href="#admin-work"
        className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-turf transition hover:bg-emerald-100"
      >
        Admin work
      </a>
    </nav>
  );
}

export function DashboardShell({
  data,
  profileError,
  predictionError,
}: {
  data: DashboardData;
  profileError?: string | null;
  predictionError?: string | null;
}) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      <TopHeader data={data} />
      {data.member?.role === 'ADMIN' ? <AdminWorkspaceMenu /> : null}

      <section id="predictions" className="space-y-6">
        {predictionError ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
            Prediction could not be saved. Please check the match is still scheduled and try again.
          </div>
        ) : null}
        <UpcomingMatchCard
          matches={data.matches
            .filter((match) => match.status === 'SCHEDULED')
            .slice(0, 4)}
          teams={data.teams}
          memberRole={data.member?.role ?? 'MEMBER'}
          predictionSummaries={data.predictionSummaries}
        />

        <LeaderboardCard data={data} />
        <section id="match-list" className={cardClass()}>
          <SectionTitle title="Match list" subtitle="All fixtures at a glance." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                teams={data.teams}
                memberRole={data.member?.role ?? 'MEMBER'}
                matchLeaderboards={data.matchLeaderboards}
                predictionSummaries={data.predictionSummaries}
              />
            ))}
          </div>
        </section>

        <div className="mt-6">
          <GroupStandingsSection data={data} />
        </div>
      </section>

      {data.member?.role === 'ADMIN' ? (
        <section id="admin-work" className="mt-8 space-y-6">
          <section className={cardClass()}>
            <SectionTitle title="Admin work" subtitle="Tools for results, settlements, and logs." />
            <p className="text-sm leading-6 text-emerald-950/70">
              Keep predictions above and admin tasks here, so the workflow stays separate.
            </p>
          </section>
          <ResultUpdateSection data={data} />
          <PredictionIssueSection data={data} />
          <PredictionAuditSection data={data} />
          <SettlementStatusTable data={data} />
          <AdminPanel data={data} />
        </section>
      ) : null}

      <footer className="py-8 text-center text-sm text-emerald-950/60">Private office pool.</footer>
    </main>
  );
}
