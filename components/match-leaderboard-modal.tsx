"use client";

import { useRef } from "react";
import type { MatchLeaderboardBlock, MatchRow } from "@/lib/game";
import { currencyLabel } from "./dashboard-shared";

export function MatchLeaderboardModal({
  match,
  matchLeaderboards
}: {
  match: MatchRow;
  matchLeaderboards: MatchLeaderboardBlock[];
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const block = matchLeaderboards.find((entry) => entry.match_id === match.id);
  const rows = block?.rows ?? [];

  function openModal() {
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
  }

  if (match.status !== "COMPLETED") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-turf text-chalk transition hover:opacity-90"
        aria-label="Open game leaderboard"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
          <path d="M4 20h16" />
          <path d="M8 20V12" />
          <path d="M12 20V6" />
          <path d="M16 20v-9" />
        </svg>
      </button>

      <dialog
        ref={dialogRef}
        className="w-[min(92vw,900px)] rounded-[28px] border border-emerald-900/10 bg-white p-0 shadow-2xl backdrop:bg-black/40"
      >
        <div className="border-b border-emerald-900/10 bg-emerald-50 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-950/55">Game leaderboard</p>
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
          <div className="overflow-x-auto rounded-[18px] border border-emerald-900/10 bg-white/90">
            {rows.length === 0 ? (
              <div className="px-4 py-4 text-sm text-emerald-950/65">No leaderboard data yet.</div>
            ) : (
              <table className="min-w-[640px] w-full text-left text-sm">
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
                  {rows.map((row) => (
                    <tr key={row.member_id} className="border-t border-emerald-900/5">
                      <td className="px-4 py-3 font-semibold text-turf">#{row.rank}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-turf">{row.full_name}</div>
                        <div className="text-xs text-emerald-950/65">{row.email}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-turf">{row.total_points}</td>
                      <td className="px-4 py-3 font-semibold text-turf">
                        {currencyLabel(row.total_contributed)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-turf">
                        {currencyLabel(row.total_winnings)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-turf">{currencyLabel(row.net_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
