"use client";

import { useRef } from "react";
import type { MatchPredictionSummaryBlock, MatchRow, Team } from "@/lib/game";
import { currencyLabel } from "./dashboard-shared";

function teamLabel(teams: Team[], teamId: string | null) {
  if (!teamId) return "Hidden";
  const team = teams.find((entry) => entry.id === teamId) ?? null;
  return `${team?.flag_emoji ?? ""} ${team?.short_name || team?.name || "TBD"}`.trim();
}

function predictionLabel(value: MatchRow["predicted_outcome"] | null) {
  if (!value) return "Hidden";
  if (value === "HOME_WIN") return "Home win";
  if (value === "AWAY_WIN") return "Away win";
  return "Draw";
}

export function MatchPredictionModal({
  match,
  teams,
  rows,
  triggerLabel,
  triggerClassName
}: {
  match: MatchRow;
  teams: Team[];
  rows: MatchPredictionSummaryBlock["rows"];
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const showResults = match.status === "COMPLETED" || match.home_score !== null || match.away_score !== null || match.actual_outcome !== null;

  if (!showResults && match.status !== "LOCKED" && match.status !== "LIVE" && match.status !== "COMPLETED") {
    return null;
  }

  function openModal() {
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={
          triggerLabel
            ? `inline-flex items-center justify-center rounded-2xl bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 ${triggerClassName ?? ""}`
            : `inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white transition hover:opacity-90 ${triggerClassName ?? ""}`
        }
        aria-label={triggerLabel ? triggerLabel : "Open prediction board"}
      >
        {triggerLabel ? (
          triggerLabel
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className="w-[min(94vw,980px)] rounded-[28px] border border-emerald-900/10 bg-white p-0 shadow-2xl backdrop:bg-black/40"
      >
        <div className="border-b border-emerald-900/10 bg-amber-50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-950/55">Prediction board</p>
              <h3 className="mt-1 text-xl font-black text-turf">{match.stage_name}</h3>
              <p className="mt-1 text-sm text-emerald-950/70">
                {match.home_team_name} vs {match.away_team_name}
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="rounded-2xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold text-turf"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-auto p-5">
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
                      <th className="px-4 py-3">Points</th>
                      <th className="px-4 py-3">Contribution</th>
                      <th className="px-4 py-3">Winnings</th>
                      <th className="px-4 py-3">Net</th>
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
                              {predictionLabel(row.predicted_outcome)} • Winner {teamLabel(teams, row.predicted_winner_team_id)}
                            </span>
                          ) : (
                            <span>{predictionLabel(row.predicted_outcome)}</span>
                          )
                        ) : (
                          "Hidden"
                        )}
                      </td>
                      <td className="px-4 py-3 text-turf">
                        {predictionVisible ? (
                          match.stage_is_knockout ? (
                            <span>
                              {row.predicted_home_score ?? "?"}-{row.predicted_away_score ?? "?"}
                              {row.predicts_extra_time ? ` ET ${row.predicted_home_extra_score ?? "?"}-${row.predicted_away_extra_score ?? "?"}` : ""}
                              {row.predicts_penalties ? ` Pens ${teamLabel(teams, row.predicted_penalty_winner_team_id)}` : ""}
                            </span>
                          ) : (
                            <span>
                              {row.predicted_home_score ?? "?"}-{row.predicted_away_score ?? "?"}
                            </span>
                          )
                        ) : (
                          "Hidden"
                        )}
                      </td>
                      {showResults ? (
                        <>
                          <td className="px-4 py-3 font-semibold text-turf">{row.total_points ?? 0}</td>
                          <td className="px-4 py-3 text-turf">{row.contribution_amount ?? "0.00"}</td>
                          <td className="px-4 py-3 text-turf">{row.prize_amount ?? "0.00"}</td>
                          <td className="px-4 py-3 font-semibold text-turf">
                            {currencyLabel(
                              (
                                Number(row.prize_amount ?? 0) - Number(row.contribution_amount ?? 0)
                              ).toFixed(2)
                            )}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </dialog>
    </>
  );
}
