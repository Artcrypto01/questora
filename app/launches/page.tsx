"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ExternalLink, Rocket, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { getLaunches } from "@/lib/quest-service";
import type { LaunchType, ProjectLaunch } from "@/lib/types";
import { formatQuestDeadline } from "@/lib/utils";

const launchTypeLabels: Record<LaunchType, string> = {
  nft_mint: "NFT mint",
  token_launch: "Token launch",
  beta_launch: "Beta launch",
  game_launch: "Game launch",
  whitelist: "Whitelist",
  airdrop: "Airdrop",
  other: "Other"
};

const launchTypes: Array<"All" | LaunchType> = ["All", "nft_mint", "token_launch", "beta_launch", "game_launch", "whitelist", "airdrop", "other"];

function getLaunchState(launch: ProjectLaunch) {
  if (launch.status !== "active") return launch.status;
  if (!launch.starts_at) return "Upcoming";
  return new Date(launch.starts_at).getTime() <= Date.now() ? "Live now" : "Upcoming";
}

export default function LaunchesPage() {
  const [launches, setLaunches] = useState<ProjectLaunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [launchType, setLaunchType] = useState<"All" | LaunchType>("All");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLaunches(await getLaunches(60));
      setLoading(false);
    }

    load();
  }, []);

  const filteredLaunches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return launches.filter((launch) => {
      const matchesType = launchType === "All" || launch.launch_type === launchType;
      const matchesSearch =
        !query ||
        launch.name.toLowerCase().includes(query) ||
        launch.description?.toLowerCase().includes(query) ||
        launch.project_name?.toLowerCase().includes(query) ||
        launchTypeLabels[launch.launch_type].toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [launchType, launches, searchQuery]);

  const liveCount = launches.filter((launch) => getLaunchState(launch) === "Live now").length;
  const upcomingCount = launches.filter((launch) => getLaunchState(launch) === "Upcoming").length;
  const verifiedCount = launches.filter((launch) => launch.project_is_verified).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-cyan-200/20 bg-base-blue shadow-glow">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/30 bg-cyan-200/10 px-3 py-1 text-sm font-black text-cyan-100">
              <Rocket size={16} />
              Launch calendar
            </div>
            <h1 className="mt-4 max-w-3xl text-4xl font-black text-white sm:text-6xl">Discover upcoming mints and project launches</h1>
            <p className="mt-4 max-w-2xl leading-7 text-blue-100">
              Track NFT mints, beta access, whitelist windows, and new project launches from Questora communities.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <LaunchStat label="Upcoming" value={upcomingCount.toString()} />
            <LaunchStat label="Live" value={liveCount.toString()} />
            <LaunchStat label="Verified" value={verifiedCount.toString()} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
        <label className="focus-within:ring-base-blue/70 flex min-h-12 items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 text-blue-100 shadow-sm focus-within:ring-2">
          <Search className="shrink-0 text-cyan-200" size={18} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold text-white outline-none placeholder:text-blue-200/70"
            placeholder="Search launches, projects, or launch types"
          />
        </label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
          {launchTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setLaunchType(type)}
              className={`focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                launchType === type ? "bg-white text-base-blue" : "border border-white/10 bg-white/10 text-blue-100 hover:border-cyan-200 hover:text-white"
              }`}
            >
              {type === "All" ? "All" : launchTypeLabels[type]}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="mt-10 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 text-blue-100">Loading launches...</div>
      ) : filteredLaunches.length === 0 ? (
        <div className="mt-10 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 text-blue-100">
          <Sparkles className="text-cyan-200" size={26} />
          <p className="mt-3 font-semibold">No launches match this filter yet.</p>
        </div>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLaunches.map((launch) => (
            <LaunchCard key={launch.id} launch={launch} />
          ))}
        </section>
      )}
    </div>
  );
}

function LaunchStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wider text-blue-100">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function LaunchCard({ launch }: { launch: ProjectLaunch }) {
  const state = getLaunchState(launch);

  return (
    <Link href={`/launches/${encodeURIComponent(launch.slug)}`} className="focus-ring group overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/92 shadow-glow transition hover:-translate-y-0.5 hover:border-cyan-200/60">
      <div className="relative h-40 bg-base-blue">
        <ProjectImage src={launch.cover_image_url} name={launch.name} variant="cover" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{state}</span>
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-base-blue">{launchTypeLabels[launch.launch_type]}</span>
          {launch.is_featured ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
              <Star size={13} />
              Featured
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="-mt-10 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#0b1730] bg-white text-base-blue">
            <ProjectImage src={launch.project_logo_url} name={launch.project_name || launch.name} variant="logo" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-black uppercase tracking-wider text-cyan-200">{launch.project_name ?? "Project"}</p>
              {launch.project_is_verified ? <ShieldCheck className="shrink-0 text-emerald-300" size={14} /> : null}
            </div>
            <h2 className="truncate text-xl font-black text-white">{launch.name}</h2>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-blue-100">{launch.description || "Upcoming Questora project launch."}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-bold text-blue-100">
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2">
            <CalendarDays size={14} className="text-cyan-200" />
            {launch.starts_at ? formatQuestDeadline(launch.starts_at) : "Date TBA"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2">
            <ExternalLink size={14} className="text-cyan-200" />
            {launch.price || "Details TBA"}
          </span>
        </div>
      </div>
    </Link>
  );
}
