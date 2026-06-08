"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Medal, Trophy, UserRound } from "lucide-react";
import { getLeaderboard, getUserLeaderboardRank } from "@/lib/quest-service";
import type { LeaderboardRank, UserProfile } from "@/lib/types";
import { shortAddress } from "@/lib/utils";

export default function LeaderboardPage() {
  const { address, isConnected } = useAccount();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userRank, setUserRank] = useState<LeaderboardRank | null>(null);

  useEffect(() => {
    getLeaderboard(50).then(setUsers);
  }, []);

  useEffect(() => {
    if (!address) {
      setUserRank(null);
      return;
    }

    getUserLeaderboardRank(address).then(setUserRank);
  }, [address]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-base-blue">
          <Trophy size={30} />
        </div>
        <div>
          <p className="font-semibold text-cyan-200">Leaderboard</p>
          <h1 className="text-3xl font-black text-white sm:text-4xl">Top 50 Questora contributors</h1>
          <p className="mt-2 text-sm font-semibold text-blue-100">Global XP is calculated from approved quests and capped by quest type and difficulty.</p>
        </div>
      </div>

      <section className="mt-8 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-5 shadow-glow">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-200 text-slate-950">
              <Medal size={26} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-cyan-200">Your rank</p>
              {isConnected ? (
                userRank ? (
                  <h2 className="mt-1 text-2xl font-black text-white">#{userRank.rank}</h2>
                ) : (
                  <h2 className="mt-1 text-xl font-black text-white">No approved XP yet</h2>
                )
              ) : (
                <h2 className="mt-1 text-xl font-black text-white">Connect wallet to see your position</h2>
              )}
            </div>
          </div>
          {userRank ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-white/10 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Global XP</p>
                <p className="mt-1 text-xl font-black text-white">{userRank.user.total_xp.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-white/10 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Approved</p>
                <p className="mt-1 text-xl font-black text-white">{(userRank.user.completed_quests ?? 0).toLocaleString()}</p>
              </div>
              <div className="col-span-2 rounded-lg bg-white/10 px-4 py-3 sm:col-span-1">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Wallet</p>
                <p className="mt-1 text-sm font-black text-white">{shortAddress(userRank.user.wallet_address)}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/92 shadow-glow">
        <div className="grid grid-cols-[64px_1fr_120px] bg-base-blue px-4 py-3 text-sm font-bold uppercase tracking-wider text-white">
          <span>Rank</span>
          <span>Member</span>
          <span className="text-right">Global XP</span>
        </div>
        {users.map((user, index) => (
          <div key={user.id} className="grid grid-cols-[64px_1fr_120px] items-center border-t border-white/10 px-4 py-4">
            <span className="font-black text-cyan-200">#{index + 1}</span>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-base-blue">
                {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={20} />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{user.display_name || "Questora member"}</p>
                <p className="truncate text-xs text-blue-200">{shortAddress(user.wallet_address)}</p>
              </div>
            </div>
            <span className="text-right font-black text-white">{user.total_xp.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
