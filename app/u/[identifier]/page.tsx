"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { Award, BadgeCheck, ExternalLink, Medal, Trophy, UserRound, Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { getOrCreateUser, getUserCompletions, getUserLeaderboardRank, getUserProfileByIdentifier } from "@/lib/quest-service";
import type { LeaderboardRank, UserProfile, UserQuest } from "@/lib/types";
import { normalizeWallet, normalizeXUsername, shortAddress } from "@/lib/utils";

const mockBadges = ["Base Starter", "Quest Sprinter", "Community Signal"];

export default function PublicUserProfilePage() {
  const params = useParams<{ identifier: string }>();
  const { address } = useAccount();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [rank, setRank] = useState<LeaderboardRank | null>(null);
  const [completions, setCompletions] = useState<UserQuest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        let profile = await getUserProfileByIdentifier(params.identifier);
        const normalizedIdentifier = decodeURIComponent(params.identifier).trim().toLowerCase().replace(/^@/, "");

        if (!profile && address) {
          const connectedProfile = await getOrCreateUser(address);
          const matchesConnectedWallet = normalizedIdentifier === normalizeWallet(address);
          const matchesConnectedUsername = normalizeXUsername(connectedProfile.x_username) === normalizeXUsername(normalizedIdentifier);
          if (matchesConnectedWallet || matchesConnectedUsername) {
            profile = connectedProfile;
          }
        }

        if (!active) return;

        setUser(profile);
        if (!profile) {
          setRank(null);
          setCompletions([]);
          setLoading(false);
          return;
        }

        const [rankRow, completionRows] = await Promise.all([
          getUserLeaderboardRank(profile.wallet_address),
          getUserCompletions(profile.id)
        ]);

        if (!active) return;
        setRank(rankRow);
        setCompletions(completionRows.filter((completion) => completion.status === "approved" && completion.reviewed_at));
        setLoading(false);
      } catch (error) {
        console.error(error);
        if (!active) return;
        setUser(null);
        setRank(null);
        setCompletions([]);
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [address, params.identifier]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-blue-100 sm:px-6 lg:px-8">
        Loading contributor profile...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="font-semibold text-cyan-200">Public profile</p>
        <h1 className="mt-2 text-3xl font-black text-white">Contributor not found</h1>
        <p className="mt-4 max-w-2xl text-blue-100">This Questora profile does not exist yet, or the username has not been added to a profile.</p>
        <Link href="/dashboard" className="focus-ring mt-6 inline-flex rounded-lg bg-cyan-200 px-5 py-3 font-black text-slate-950">
          Explore quests
        </Link>
      </div>
    );
  }

  const xUsername = normalizeXUsername(user.x_username);
  const displayName = user.display_name || xUsername || "Questora member";
  const profilePath = xUsername ? `/u/${encodeURIComponent(xUsername)}` : `/u/${encodeURIComponent(user.wallet_address)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-2xl border border-cyan-200/20 bg-base-blue text-white shadow-glow">
        <div className="h-24 bg-[radial-gradient(circle_at_20%_20%,rgba(125,249,255,0.45),transparent_28%),linear-gradient(120deg,#0052ff,#071a3f)]" />
        <div className="px-6 pb-8 sm:px-8">
          <div className="-mt-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-base-blue bg-white text-base-blue">
                {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={42} />}
              </div>
              <div>
                <p className="font-semibold text-cyan-100">Questora contributor</p>
                <h1 className="mt-1 text-3xl font-black sm:text-5xl">{displayName}</h1>
                <p className="mt-2 break-all text-sm font-semibold text-blue-100">{shortAddress(user.wallet_address)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {xUsername ? (
                <a
                  href={`https://x.com/${xUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue"
                >
                  X profile
                  <ExternalLink size={16} />
                </a>
              ) : null}
              <Link href={profilePath} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-3 text-sm font-black text-white">
                Share profile
              </Link>
            </div>
          </div>
          <p className="mt-5 max-w-3xl leading-7 text-blue-100">{user.bio || "This contributor is building their Questora reputation across Base communities."}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard icon={Award} label="Global XP" value={user.total_xp.toLocaleString()} />
        <StatCard icon={Trophy} label="Global rank" value={rank ? `#${rank.rank}` : "-"} />
        <StatCard icon={BadgeCheck} label="Approved quests" value={completions.length.toString()} />
        <StatCard icon={Medal} label="Badges" value={mockBadges.length.toString()} />
      </div>

      <section className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="flex items-center gap-3">
            <Wallet className="text-cyan-200" />
            <h2 className="text-xl font-black text-white">Contributor identity</h2>
          </div>
          <div className="mt-5 grid gap-3 text-sm font-semibold text-blue-100">
            <p className="break-all">Wallet: {user.wallet_address}</p>
            {xUsername ? <p>X: @{xUsername}</p> : null}
            {user.discord_username ? <p>Discord: {user.discord_username}</p> : null}
          </div>
          <h2 className="mt-8 text-xl font-black text-white">Badge shelf</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {mockBadges.map((badge) => (
              <div key={badge} className="rounded-lg border border-white/10 bg-white/10 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-base-blue">
                  <Medal size={22} />
                </div>
                <p className="mt-4 font-bold text-white">{badge}</p>
                <p className="mt-1 text-sm text-blue-100">Mock badge</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="flex items-center gap-3">
            <BadgeCheck className="text-cyan-200" />
            <h2 className="text-xl font-black text-white">Approved quest history</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {completions.length === 0 ? (
              <p className="text-blue-100">No approved quest history yet.</p>
            ) : (
              completions.map((completion) => (
                <article key={completion.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">approved</span>
                        {completion.project_name ? <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{completion.project_name}</span> : null}
                      </div>
                      <h3 className="mt-3 font-black text-white">{completion.quest_title ?? "Quest submission"}</h3>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-cyan-200">{completion.xp_awarded.toLocaleString()} project XP</p>
                      <p className="text-xs font-bold text-blue-200">+{(completion.global_xp_awarded ?? completion.xp_awarded).toLocaleString()} global XP</p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
