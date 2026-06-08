"use client";

import { useEffect, useState } from "react";
import { Trophy, UserRound } from "lucide-react";
import { getLeaderboard } from "@/lib/quest-service";
import type { UserProfile } from "@/lib/types";
import { shortAddress } from "@/lib/utils";

export default function LeaderboardPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    getLeaderboard().then(setUsers);
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-base-blue">
          <Trophy size={30} />
        </div>
        <div>
          <p className="font-semibold text-cyan-200">Leaderboard</p>
          <h1 className="text-3xl font-black text-white sm:text-4xl">Top Questora contributors</h1>
          <p className="mt-2 text-sm font-semibold text-blue-100">Global XP is capped by quest type and difficulty to reduce farming.</p>
        </div>
      </div>

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
