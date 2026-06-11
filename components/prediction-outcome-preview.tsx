"use client";

import { useMemo, useState } from "react";

type Outcome = "HOME_WIN" | "DRAW" | "AWAY_WIN";
type TeamDisplay = {
  emoji: string;
  shortName: string;
  fullName: string;
};

function outcomeFromScores(homeScore: number | "", awayScore: number | ""): Outcome | null {
  if (homeScore === "" || awayScore === "") {
    return null;
  }

  if (homeScore > awayScore) {
    return "HOME_WIN";
  }

  if (awayScore > homeScore) {
    return "AWAY_WIN";
  }

  return "DRAW";
}

function pillClass(active: boolean) {
  return `rounded-2xl border px-3 py-3 text-center text-sm font-semibold transition ${
    active ? "border-amber-600 bg-amber-50 text-amber-950" : "border-emerald-900/10 bg-white text-turf"
  }`;
}

function scoreValue(value: number | "") {
  return value === "" ? "" : String(value);
}

export function PredictionOutcomePreview({
  homeTeam,
  awayTeam,
  defaultHomeScore,
  defaultAwayScore,
  disabled = false
}: {
  homeTeam: TeamDisplay;
  awayTeam: TeamDisplay;
  defaultHomeScore: number | null;
  defaultAwayScore: number | null;
  disabled?: boolean;
}) {
  const [homeScore, setHomeScore] = useState<number | "">(defaultHomeScore ?? "");
  const [awayScore, setAwayScore] = useState<number | "">(defaultAwayScore ?? "");

  const outcome = useMemo(() => outcomeFromScores(homeScore, awayScore), [homeScore, awayScore]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className={pillClass(outcome === "HOME_WIN")}>
          <div className="text-3xl leading-none">{homeTeam.emoji}</div>
          <div className="mt-1 text-sm font-black">{homeTeam.shortName}</div>
          {homeTeam.fullName !== homeTeam.shortName ? (
            <div className="mt-1 text-[11px] font-medium leading-4 text-emerald-950/60">
              {homeTeam.fullName}
            </div>
          ) : null}
        </div>
        <div className={pillClass(outcome === "DRAW")}>Draw</div>
        <div className={pillClass(outcome === "AWAY_WIN")}>
          <div className="text-3xl leading-none">{awayTeam.emoji}</div>
          <div className="mt-1 text-sm font-black">{awayTeam.shortName}</div>
          {awayTeam.fullName !== awayTeam.shortName ? (
            <div className="mt-1 text-[11px] font-medium leading-4 text-emerald-950/60">
              {awayTeam.fullName}
            </div>
          ) : null}
        </div>
      </div>

      <input type="hidden" name="predicted_outcome" value={outcome ?? ""} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-950/70">
            Home goals
          </label>
          <input
            type="number"
            min="0"
            name="predicted_home_score"
            value={scoreValue(homeScore)}
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
            value={scoreValue(awayScore)}
            onChange={(event) =>
              setAwayScore(event.target.value === "" ? "" : Number(event.target.value))
            }
            className="field"
            disabled={disabled}
            required
          />
        </div>
      </div>

      <p className="text-xs leading-5 text-emerald-950/70">
        The highlighted result is derived from the score you enter.
      </p>
    </div>
  );
}
