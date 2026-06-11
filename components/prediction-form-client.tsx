"use client";

import { useRef, useState, type FormEvent } from "react";
import type { MatchRow, Team } from "@/lib/game";
import { PredictionOutcomePreview } from "./prediction-outcome-preview";

function teamName(teams: Team[], teamId: string | null) {
  if (!teamId) return "Team";
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  const name = team?.short_name || team?.name || "Team";
  return `${team?.flag_emoji ?? ""} ${name}`.trim();
}

function compactTeamName(teams: Team[], teamId: string | null) {
  if (!teamId) return "Team";
  return teams.find((entry) => entry.id === teamId)?.short_name || teams.find((entry) => entry.id === teamId)?.name || "Team";
}

function teamDisplayParts(teams: Team[], teamId: string | null) {
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  return {
    emoji: team?.flag_emoji ?? "",
    shortName: team?.short_name || team?.name || "Team",
    fullName: team?.name || team?.short_name || "Team"
  };
}

function TeamStack({
  emoji,
  shortName,
  fullName,
  align = "left"
}: {
  emoji: string;
  shortName: string;
  fullName: string;
  align?: "left" | "center";
}) {
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <span className={`flex flex-col ${alignClass}`}>
      <span className="text-sm font-black leading-tight">
        {emoji ? `${emoji} ` : ""}
        {shortName}
      </span>
      {fullName !== shortName ? (
        <span className="text-[11px] font-medium leading-4 text-emerald-950/60">{fullName}</span>
      ) : null}
    </span>
  );
}

export function PredictionFormClient({
  match,
  teams,
  memberRole,
  compact = false,
  initialHasPrediction
}: {
  match: MatchRow;
  teams: Team[];
  memberRole: "ADMIN" | "MEMBER";
  compact?: boolean;
  initialHasPrediction: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hasPrediction, setHasPrediction] = useState(initialHasPrediction);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<"home" | "away" | "">(
    match.predicted_winner_team_id === match.home_team_id
      ? "home"
      : match.predicted_winner_team_id === match.away_team_id
        ? "away"
        : ""
  );
  const [homeScore, setHomeScore] = useState<number | "">(
    match.stage_is_knockout ? match.predicted_home_score ?? "" : ""
  );
  const [awayScore, setAwayScore] = useState<number | "">(
    match.stage_is_knockout ? match.predicted_away_score ?? "" : ""
  );
  const [extraTimeHomeScore, setExtraTimeHomeScore] = useState<number | "">(
    match.predicted_home_extra_score ?? ""
  );
  const [extraTimeAwayScore, setExtraTimeAwayScore] = useState<number | "">(
    match.predicted_away_extra_score ?? ""
  );
  const [predictsExtraTime, setPredictsExtraTime] = useState(Boolean(match.predicts_extra_time));
  const [predictsPenalties, setPredictsPenalties] = useState(Boolean(match.predicts_penalties));
  const [penaltyWinnerTeamId, setPenaltyWinnerTeamId] = useState<string>(
    match.predicted_penalty_winner_team_id ?? ""
  );
  const [savedHomeScore, setSavedHomeScore] = useState<number | null>(match.predicted_home_score);
  const [savedAwayScore, setSavedAwayScore] = useState<number | null>(match.predicted_away_score);
  const [savedWinnerTeamId, setSavedWinnerTeamId] = useState<string | null>(
    match.predicted_winner_team_id
  );
  const [savedOutcome, setSavedOutcome] = useState<string | null>(match.predicted_outcome);

  const homeTeam = teams.find((team) => team.id === match.home_team_id) ?? null;
  const awayTeam = teams.find((team) => team.id === match.away_team_id) ?? null;
  const disabled = match.status !== "SCHEDULED" || isSaving;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;

    const form = formRef.current;
    if (!form) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const formData = new FormData(form);
      const response = await fetch("/api/predictions", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload || !payload.ok) {
        setMessage(payload && !payload.ok && payload.error ? payload.error : "Prediction could not be saved.");
        return;
      }

      const homeScoreValue = formData.get("predicted_home_score");
      const awayScoreValue = formData.get("predicted_away_score");
      const predictedWinnerTeamId = formData.get("predicted_winner_team_id");
      const predictedOutcome = formData.get("predicted_outcome");

      setSavedHomeScore(typeof homeScoreValue === "string" && homeScoreValue !== "" ? Number(homeScoreValue) : null);
      setSavedAwayScore(typeof awayScoreValue === "string" && awayScoreValue !== "" ? Number(awayScoreValue) : null);
      setSavedWinnerTeamId(
        typeof predictedWinnerTeamId === "string" && predictedWinnerTeamId !== ""
          ? predictedWinnerTeamId
          : null
      );
      setSavedOutcome(typeof predictedOutcome === "string" && predictedOutcome !== "" ? predictedOutcome : null);
      if (match.stage_is_knockout) {
        setHomeScore(typeof homeScoreValue === "string" && homeScoreValue !== "" ? Number(homeScoreValue) : "");
        setAwayScore(typeof awayScoreValue === "string" && awayScoreValue !== "" ? Number(awayScoreValue) : "");
      }
      setHasPrediction(true);
      setMessage("Saved. You can change it before lock.");
    } finally {
      setIsSaving(false);
    }
  }

  const currentSummary = match.stage_is_knockout
    ? savedWinnerTeamId
      ? `${compactTeamName(teams, savedWinnerTeamId)}${savedHomeScore !== null && savedAwayScore !== null ? ` (${savedHomeScore}-${savedAwayScore})` : ""}`
      : null
    : savedOutcome
      ? `${compactTeamName(teams, match.home_team_id)} ${savedHomeScore}-${savedAwayScore} ${compactTeamName(teams, match.away_team_id)}`
      : null;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={compact ? "space-y-3" : "space-y-4 rounded-[24px] bg-white/80 p-4"}
    >
      <input type="hidden" name="match_id" value={match.id} />
      <input type="hidden" name="stage_code" value={match.stage_code} />

      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-turf">
          {match.stage_is_knockout ? "Winner" : "Prediction"}
        </label>
        <span className={`badge ${hasPrediction ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-900"}`}>
          {hasPrediction
            ? `Already predicted${currentSummary ? `: ${currentSummary}` : ""}`
            : "Open"}
        </span>
      </div>

      {match.stage_is_knockout ? (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: teamName(teams, match.home_team_id), value: match.home_team_id, current: "home" as const },
            { label: teamName(teams, match.away_team_id), value: match.away_team_id, current: "away" as const }
          ].map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border px-3 py-3 text-center transition ${
                selectedWinner === option.current
                  ? "border-amber-600 bg-amber-50 text-amber-950"
                  : "border-emerald-900/10 bg-white text-turf"
              } ${disabled ? "pointer-events-none opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="predicted_winner_team_id"
                value={option.value}
                checked={selectedWinner === option.current}
                onChange={() => setSelectedWinner(option.current)}
                className="sr-only"
                disabled={disabled}
                required
              />
              <TeamStack {...teamDisplayParts(teams, option.value)} align="center" />
            </label>
          ))}
        </div>
      ) : null}

      {match.stage_is_knockout ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/70">
              Home goals
            </label>
            <input
              type="number"
              min="0"
              name="predicted_home_score"
              value={homeScore}
              onChange={(event) =>
                setHomeScore(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="field"
              disabled={disabled}
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/70">
              Away goals
            </label>
            <input
              type="number"
              min="0"
              name="predicted_away_score"
              value={awayScore}
              onChange={(event) =>
                setAwayScore(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="field"
              disabled={disabled}
              required
            />
          </div>
        </div>
      ) : (
        <PredictionOutcomePreview
          homeTeam={teamDisplayParts(teams, match.home_team_id)}
          awayTeam={teamDisplayParts(teams, match.away_team_id)}
          defaultHomeScore={match.predicted_home_score}
          defaultAwayScore={match.predicted_away_score}
          disabled={disabled}
        />
      )}

      {match.stage_is_knockout ? (
        <div className="space-y-4 rounded-[24px] bg-amber-50 p-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-turf">
            <input
              type="checkbox"
              name="predicts_extra_time"
              checked={predictsExtraTime}
              onChange={(event) => setPredictsExtraTime(event.target.checked)}
              disabled={disabled}
            />
            Goes to extra time
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              placeholder="ET home"
              name="predicted_home_extra_score"
              value={extraTimeHomeScore}
              onChange={(event) =>
                setExtraTimeHomeScore(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="field"
              disabled={disabled}
            />
            <input
              type="number"
              min="0"
              placeholder="ET away"
              name="predicted_away_extra_score"
              value={extraTimeAwayScore}
              onChange={(event) =>
                setExtraTimeAwayScore(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="field"
              disabled={disabled}
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold text-turf">
            <input
              type="checkbox"
              name="predicts_penalties"
              checked={predictsPenalties}
              onChange={(event) => setPredictsPenalties(event.target.checked)}
              disabled={disabled}
            />
            Goes to penalties
          </label>
          <select
            name="predicted_penalty_winner_team_id"
            className="field"
            value={penaltyWinnerTeamId}
            onChange={(event) => setPenaltyWinnerTeamId(event.target.value)}
            disabled={disabled}
          >
            <option value="">Penalty winner</option>
            <option value={match.home_team_id}>{teamName(teams, match.home_team_id)}</option>
            <option value={match.away_team_id}>{teamName(teams, match.away_team_id)}</option>
          </select>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {message}
        </div>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={disabled}>
        {isSaving ? "Saving..." : hasPrediction ? "Update prediction" : "Submit prediction"}
      </button>
      <p className="text-xs leading-5 text-emerald-950/70">
        {match.status === "SCHEDULED" ? "You can change it until lock." : "Prediction is locked."}
      </p>
    </form>
  );
}
