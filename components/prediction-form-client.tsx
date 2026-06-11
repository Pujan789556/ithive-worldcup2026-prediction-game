"use client";

import { useRef, useState, type FormEvent } from "react";
import type { MatchRow, Team } from "@/lib/game";
import { PredictionOutcomePreview } from "./prediction-outcome-preview";

function teamName(teams: Team[], teamId: string | null) {
  if (!teamId) return "Team";
  return teams.find((team) => team.id === teamId)?.short_name || teams.find((team) => team.id === teamId)?.name || "Team";
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

  const homeTeam = teams.find((team) => team.id === match.home_team_id) ?? null;
  const awayTeam = teams.find((team) => team.id === match.away_team_id) ?? null;
  const disabled = match.status !== "SCHEDULED" || isSaving;
  const hideOwnDefaults = memberRole === "ADMIN" && match.status === "SCHEDULED";
  const currentWinner =
    match.predicted_winner_team_id === match.home_team_id
      ? "home"
      : match.predicted_winner_team_id === match.away_team_id
        ? "away"
        : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;

    const form = formRef.current;
    if (!form) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/predictions", {
        method: "POST",
        body: new FormData(form)
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload || !payload.ok) {
        setMessage(payload && !payload.ok && payload.error ? payload.error : "Prediction could not be saved.");
        return;
      }

      setHasPrediction(true);
      setMessage("Saved. You can change it before lock.");
    } finally {
      setIsSaving(false);
    }
  }

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
        <span className={`badge ${hasPrediction ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-900"}`}>
          {hasPrediction ? "Already predicted" : "Open"}
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
              className={`flex cursor-pointer items-center justify-center rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                currentWinner === option.current
                  ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                  : "border-emerald-900/10 bg-white text-turf"
              } ${disabled ? "pointer-events-none opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="predicted_winner_team_id"
                value={option.value}
                defaultChecked={
                  hideOwnDefaults ? false : currentWinner === option.current
                }
                className="sr-only"
                disabled={disabled}
                required
              />
              {option.label}
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
              defaultValue={hideOwnDefaults ? "" : match.predicted_home_score ?? ""}
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
              defaultValue={hideOwnDefaults ? "" : match.predicted_away_score ?? ""}
              className="field"
              disabled={disabled}
              required
            />
          </div>
        </div>
      ) : (
      <PredictionOutcomePreview
          homeLabel={teamName(teams, match.home_team_id)}
          awayLabel={teamName(teams, match.away_team_id)}
          defaultHomeScore={hideOwnDefaults ? null : match.predicted_home_score}
          defaultAwayScore={hideOwnDefaults ? null : match.predicted_away_score}
          disabled={disabled}
        />
      )}

      {match.stage_is_knockout ? (
        <div className="space-y-4 rounded-[24px] bg-emerald-50 p-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-turf">
            <input
              type="checkbox"
              name="predicts_extra_time"
              defaultChecked={Boolean(match.predicts_extra_time)}
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
              defaultValue={hideOwnDefaults ? "" : match.predicted_home_extra_score ?? ""}
              className="field"
              disabled={disabled}
            />
            <input
              type="number"
              min="0"
              placeholder="ET away"
              name="predicted_away_extra_score"
              defaultValue={hideOwnDefaults ? "" : match.predicted_away_extra_score ?? ""}
              className="field"
              disabled={disabled}
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold text-turf">
            <input
              type="checkbox"
              name="predicts_penalties"
              defaultChecked={hideOwnDefaults ? false : Boolean(match.predicts_penalties)}
              disabled={disabled}
            />
            Goes to penalties
          </label>
          <select
            name="predicted_penalty_winner_team_id"
            className="field"
            defaultValue={hideOwnDefaults ? "" : match.predicted_penalty_winner_team_id ?? ""}
            disabled={disabled}
          >
            <option value="">Penalty winner</option>
            <option value={match.home_team_id}>{teamName(teams, match.home_team_id)}</option>
            <option value={match.away_team_id}>{teamName(teams, match.away_team_id)}</option>
          </select>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
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
