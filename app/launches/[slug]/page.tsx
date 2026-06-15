"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight, CalendarDays, Coins, ExternalLink, Network, Rocket, ShieldCheck, UsersRound } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { getLaunchBySlug } from "@/lib/quest-service";
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

function getLaunchState(launch: ProjectLaunch) {
  if (launch.status !== "active") return launch.status;
  if (!launch.starts_at) return "Upcoming";
  return new Date(launch.starts_at).getTime() <= Date.now() ? "Live now" : "Upcoming";
}

export default function LaunchDetailPage() {
  const params = useParams<{ slug: string }>();
  const [launch, setLaunch] = useState<ProjectLaunch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLaunch(await getLaunchBySlug(params.slug));
      setLoading(false);
    }

    load();
  }, [params.slug]);

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-blue-100 sm:px-6 lg:px-8">Loading launch...</div>;
  }

  if (!launch) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-white sm:px-6 lg:px-8">
        <p className="text-cyan-200">Launch</p>
        <h1 className="mt-2 text-3xl font-black">Launch not found</h1>
        <Link href="/launches" className="focus-ring mt-6 inline-flex rounded-lg bg-cyan-200 px-5 py-3 font-black text-slate-950">
          Explore launches
        </Link>
      </div>
    );
  }

  const state = getLaunchState(launch);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-cyan-200/20 bg-[#0b1730]/92 shadow-glow">
        <div className="relative h-72 bg-base-blue sm:h-96">
          <ProjectImage src={launch.cover_image_url} name={launch.name} variant="cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061022] via-[#061022]/30 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{state}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">{launchTypeLabels[launch.launch_type]}</span>
              {launch.project_is_verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                  <ShieldCheck size={13} />
                  Verified project
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-black text-white sm:text-6xl">{launch.name}</h1>
          </div>
        </div>

        <div className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-base-blue">
              <ProjectImage src={launch.project_logo_url} name={launch.project_name || launch.name} variant="logo" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-cyan-200">{launch.project_name ?? "Project launch"}</p>
              <p className="mt-2 max-w-3xl leading-7 text-blue-100">{launch.description || "Follow this launch and complete linked quests to qualify for access."}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {launch.campaign_id ? (
              <Link href={`/dashboard?campaign=${encodeURIComponent(launch.campaign_id)}`} className="focus-ring inline-flex items-center justify-center rounded-lg bg-cyan-200 px-5 py-3 font-black text-slate-950">
                View quests
              </Link>
            ) : null}
            {launch.launch_url ? (
              <a href={launch.launch_url} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-black text-base-blue">
                Open launch
                <ArrowUpRight size={18} />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <LaunchInfo icon={CalendarDays} label="Launch date" value={launch.starts_at ? formatQuestDeadline(launch.starts_at) ?? "Date TBA" : "Date TBA"} />
        <LaunchInfo icon={Coins} label="Price" value={launch.price || "TBA"} />
        <LaunchInfo icon={UsersRound} label="Supply / access" value={launch.supply || "TBA"} />
        <LaunchInfo icon={Network} label="Network" value={launch.network || "Base"} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="flex items-center gap-3">
            <Rocket className="text-cyan-200" />
            <h2 className="text-xl font-black text-white">Launch details</h2>
          </div>
          <div className="mt-5 grid gap-3 text-sm font-semibold text-blue-100">
            <DetailRow label="Type" value={launchTypeLabels[launch.launch_type]} />
            <DetailRow label="Project" value={launch.project_name ?? "Project"} />
            <DetailRow label="Campaign" value={launch.campaign_name ?? "Not linked"} />
            <DetailRow label="Status" value={state} />
          </div>
        </div>

        <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-6 shadow-glow">
          <h2 className="text-xl font-black text-white">How to participate</h2>
          <p className="mt-3 leading-7 text-blue-100">
            Check the official launch link and complete any linked Questora campaign before the launch window. Project owners can use approved quest activity to qualify wallets for whitelist, beta access, or rewards.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {launch.campaign_id ? (
              <Link href={`/dashboard?campaign=${encodeURIComponent(launch.campaign_id)}`} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue">
                Complete campaign quests
              </Link>
            ) : null}
            {launch.launch_url ? (
              <a href={launch.launch_url} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-2 rounded-lg bg-base-blue px-4 py-3 text-sm font-black text-white">
                <ExternalLink size={16} />
                Visit official page
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function LaunchInfo({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
      <Icon className="text-cyan-200" size={24} />
      <p className="mt-4 text-sm font-semibold text-blue-100">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-white/10 px-4 py-3">
      <span className="text-blue-200">{label}</span>
      <span className="text-right font-black text-white">{value}</span>
    </div>
  );
}
