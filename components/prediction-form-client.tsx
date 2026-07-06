"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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

function resolveKnockoutPrediction({
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
  predictsExtraTime,
  extraTimeHomeScore,
  extraTimeAwayScore,
  predictsPenalties,
  fallbackWinnerTeamId,
  penaltyWinnerTeamId,
}: {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | "";
  awayScore: number | "";
  predictsExtraTime: boolean;
  extraTimeHomeScore: number | "";
  extraTimeAwayScore: number | "";
  predictsPenalties: boolean;
  fallbackWinnerTeamId: string | null;
  penaltyWinnerTeamId: string;
}) {
  if (homeScore === "" || awayScore === "") {
    return { winnerTeamId: null, outcome: null };
  }

  if (homeScore > awayScore) {
    return { winnerTeamId: homeTeamId, outcome: "HOME_WIN" as const };
  }

  if (awayScore > homeScore) {
    return { winnerTeamId: awayTeamId, outcome: "AWAY_WIN" as const };
  }

  if (!predictsExtraTime || extraTimeHomeScore === "" || extraTimeAwayScore === "") {
    return { winnerTeamId: null, outcome: null };
  }

  if (extraTimeHomeScore > extraTimeAwayScore) {
    return { winnerTeamId: homeTeamId, outcome: "HOME_WIN" as const };
  }

  if (extraTimeAwayScore > extraTimeHomeScore) {
    return { winnerTeamId: awayTeamId, outcome: "AWAY_WIN" as const };
  }

  if (!predictsExtraTime) {
    if (fallbackWinnerTeamId === homeTeamId) {
      return { winnerTeamId: homeTeamId, outcome: "HOME_WIN" as const };
    }

    if (fallbackWinnerTeamId === awayTeamId) {
      return { winnerTeamId: awayTeamId, outcome: "AWAY_WIN" as const };
    }

    return { winnerTeamId: null, outcome: null };
  }

  if (!predictsPenalties || !penaltyWinnerTeamId) {
    return { winnerTeamId: null, outcome: null };
  }

  if (penaltyWinnerTeamId !== homeTeamId && penaltyWinnerTeamId !== awayTeamId) {
    return { winnerTeamId: null, outcome: null };
  }

  return {
    winnerTeamId: penaltyWinnerTeamId,
    outcome: penaltyWinnerTeamId === homeTeamId ? ("HOME_WIN" as const) : ("AWAY_WIN" as const)
  };
}

export function PredictionFormClient({
  match,
  teams,
  memberRole,
  compact = false,
  initialHasPrediction,
  readOnly = false,
  readOnlyButtonLabel = "View My Prediction",
}: {
  match: MatchRow;
  teams: Team[];
  memberRole: "ADMIN" | "MEMBER";
  compact?: boolean;
  initialHasPrediction: boolean;
  readOnly?: boolean;
  readOnlyButtonLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hasPrediction, setHasPrediction] = useState(initialHasPrediction);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
  const previousNormalScoresRef = useRef<{ home: number | ""; away: number | "" }>({
    home: match.stage_is_knockout ? match.predicted_home_score ?? "" : "",
    away: match.stage_is_knockout ? match.predicted_away_score ?? "" : ""
  });

  const disabled = readOnly || match.status !== "SCHEDULED" || isSaving;
  const normalTimeFilled = homeScore !== "" && awayScore !== "";
  const normalTimeTied = normalTimeFilled && homeScore === awayScore;
  const extraTimeScoresFilled = extraTimeHomeScore !== "" && extraTimeAwayScore !== "";
  const extraTimeTied = normalTimeTied && predictsExtraTime && extraTimeScoresFilled && extraTimeHomeScore === extraTimeAwayScore;
  const knockoutPrediction = match.stage_is_knockout
    ? resolveKnockoutPrediction({
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        homeScore,
        awayScore,
        predictsExtraTime,
        extraTimeHomeScore,
        extraTimeAwayScore,
        predictsPenalties,
        fallbackWinnerTeamId: savedWinnerTeamId,
        penaltyWinnerTeamId
      })
    : null;

  useEffect(() => {
    if (!match.stage_is_knockout) {
      return;
    }

    const previousNormalScores = previousNormalScoresRef.current;

    if (!normalTimeFilled) {
      if (predictsExtraTime) setPredictsExtraTime(false);
      if (predictsPenalties) setPredictsPenalties(false);
      if (extraTimeHomeScore !== "") setExtraTimeHomeScore("");
      if (extraTimeAwayScore !== "") setExtraTimeAwayScore("");
      if (penaltyWinnerTeamId !== "") setPenaltyWinnerTeamId("");
      previousNormalScoresRef.current = { home: homeScore, away: awayScore };
      return;
    }

    if (!normalTimeTied) {
      if (predictsExtraTime) setPredictsExtraTime(false);
      if (predictsPenalties) setPredictsPenalties(false);
      if (extraTimeHomeScore !== "") setExtraTimeHomeScore("");
      if (extraTimeAwayScore !== "") setExtraTimeAwayScore("");
      if (penaltyWinnerTeamId !== "") setPenaltyWinnerTeamId("");
      previousNormalScoresRef.current = { home: homeScore, away: awayScore };
      return;
    }

    if (!predictsExtraTime) {
      setPredictsExtraTime(true);
    }

    const shouldSeedExtraTime =
      extraTimeHomeScore === "" ||
      extraTimeAwayScore === "" ||
      (previousNormalScores.home !== "" &&
        previousNormalScores.away !== "" &&
        extraTimeHomeScore === previousNormalScores.home &&
        extraTimeAwayScore === previousNormalScores.away);

    if (shouldSeedExtraTime) {
      if (extraTimeHomeScore !== homeScore) setExtraTimeHomeScore(homeScore);
      if (extraTimeAwayScore !== awayScore) setExtraTimeAwayScore(awayScore);
    }

    previousNormalScoresRef.current = { home: homeScore, away: awayScore };
  }, [
    match.stage_is_knockout,
    normalTimeFilled,
    normalTimeTied,
    homeScore,
    awayScore,
    predictsExtraTime,
    predictsPenalties,
    extraTimeHomeScore,
    extraTimeAwayScore,
    penaltyWinnerTeamId
  ]);

  useEffect(() => {
    if (!match.stage_is_knockout || !normalTimeTied || !predictsExtraTime) {
      return;
    }

    if (!extraTimeScoresFilled) {
      if (predictsPenalties) setPredictsPenalties(false);
      if (penaltyWinnerTeamId !== "") setPenaltyWinnerTeamId("");
      return;
    }

    if (extraTimeHomeScore === extraTimeAwayScore) {
      if (!predictsPenalties) {
        setPredictsPenalties(true);
      }
    } else {
      if (predictsPenalties) {
        setPredictsPenalties(false);
      }
      if (penaltyWinnerTeamId !== "") {
        setPenaltyWinnerTeamId("");
      }
    }
  }, [
    match.stage_is_knockout,
    normalTimeTied,
    predictsExtraTime,
    predictsPenalties,
    extraTimeScoresFilled,
    extraTimeHomeScore,
    extraTimeAwayScore,
    penaltyWinnerTeamId
  ]);

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
            : readOnly
              ? "Locked"
              : "Open"}
        </span>
      </div>

      {match.stage_is_knockout ? (
        <div className="rounded-2xl border border-emerald-900/10 bg-white px-4 py-3">
          <input
            type="hidden"
            name="predicted_outcome"
            value={knockoutPrediction?.outcome ?? ""}
          />
          <input
            type="hidden"
            name="predicted_winner_team_id"
            value={knockoutPrediction?.winnerTeamId ?? savedWinnerTeamId ?? ""}
          />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/60">
            Winner follows the score
          </p>
          <p className="mt-2 text-sm font-medium text-turf">
            {knockoutPrediction?.winnerTeamId ? (
              <>
                Winner: {teamName(teams, knockoutPrediction.winnerTeamId)}
                {knockoutPrediction.outcome ? ` (${knockoutPrediction.outcome.replace("_", " ").toLowerCase()})` : ""}
              </>
            ) : (
              "Enter scores, and the winner will be derived automatically."
            )}
          </p>
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
        <div className={`space-y-4 rounded-[24px] bg-amber-50 p-4 ${normalTimeTied ? "" : "opacity-75"}`}>
          <label className="flex items-center gap-3 text-sm font-semibold text-turf">
            <input
              type="checkbox"
              name="predicts_extra_time"
              checked={predictsExtraTime}
              disabled={disabled || !normalTimeTied}
              onChange={(event) => setPredictsExtraTime(event.target.checked)}
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
              disabled={disabled || !predictsExtraTime}
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
              disabled={disabled || !predictsExtraTime}
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold text-turf">
            <input
              type="checkbox"
              name="predicts_penalties"
              checked={predictsPenalties}
              disabled={disabled || !extraTimeTied}
              onChange={(event) => setPredictsPenalties(event.target.checked)}
            />
            Goes to penalties
          </label>
          <select
            name="predicted_penalty_winner_team_id"
            className="field"
            value={penaltyWinnerTeamId}
            required={predictsPenalties && extraTimeTied}
            onChange={(event) => setPenaltyWinnerTeamId(event.target.value)}
            disabled={disabled || !extraTimeTied}
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

      {!readOnly ? (
        <>
          <button type="submit" className="btn-primary w-full" disabled={disabled}>
            {isSaving ? "Saving..." : hasPrediction ? "Update prediction" : "Submit prediction"}
          </button>
          <p className="text-xs leading-5 text-emerald-950/70">
            {match.status === "SCHEDULED" ? "You can change it until lock." : "Prediction is locked."}
          </p>
        </>
      ) : (
        <>
          <button type="button" className="btn-secondary w-full opacity-90" disabled>
            {hasPrediction ? readOnlyButtonLabel : "Prediction locked"}
          </button>
          <p className="text-xs leading-5 text-emerald-950/70">
            This prediction is locked and shown for reference only.
          </p>
        </>
      )}
    </form>
  );
}
