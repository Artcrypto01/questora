"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowUpRight, BadgeCheck, Globe, MessageCircle, Trophy, UserRound } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { getProjectBySlug, getProjectLeaderboard, getProjectStats, getQuestsByProject } from "@/lib/quest-service";
import type { ProofType, Project, Quest, UserProfile } from "@/lib/types";
import { difficultyLabels, questTypeLabels } from "@/lib/xp-policy";
import { formatQuestDeadline, isQuestEnded, shortAddress } from "@/lib/utils";

type ProjectStats = {
  questCount: number;
  availableXp: number;
  approvedCount: number;
};

const proofTypeLabels: Record<ProofType, string> = {
  text: "Text proof",
  url: "Link proof",
  tweet: "X post URL",
  discord: "Discord proof",
  wallet: "Wallet proof"
};

export default function ProjectDetailPage() {
  const params = useParams<{ slug: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function load() {
      const projectRow = await getProjectBySlug(params.slug);
      setProject(projectRow);
      if (!projectRow) return;
      const [questRows, statRow, leaderboardRows] = await Promise.all([
        getQuestsByProject(projectRow.id),
        getProjectStats(projectRow.id),
        getProjectLeaderboard(projectRow.id)
      ]);
      setQuests(questRows);
      setStats(statRow);
      setLeaderboard(leaderboardRows);
    }

    load();
  }, [params.slug]);

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-white sm:px-6 lg:px-8">
        <p className="text-cyan-200">Project</p>
        <h1 className="mt-2 text-3xl font-black">Project not found</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1730]/92 shadow-glow">
        <div className="relative h-56 bg-base-blue">
          <ProjectImage src={project.cover_image_url} name={project.name} variant="cover" />
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="-mt-16 flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-[#0b1730] bg-white text-4xl font-black text-base-blue">
              <ProjectImage src={project.logo_url} name={project.name} variant="logo" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-cyan-200">Project</p>
                <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{project.project_type}</span>
              </div>
              <h1 className="mt-1 text-4xl font-black text-white">{project.name}</h1>
              <p className="mt-3 max-w-2xl leading-7 text-blue-100">{project.description || "No description yet."}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.website_url ? <ProjectLink href={project.website_url} label="Website" icon={Globe} /> : null}
            {project.discord_url ? <ProjectLink href={project.discord_url} label="Discord" icon={MessageCircle} /> : null}
            {project.x_url ? <ProjectLink href={project.x_url} label="X" icon={ArrowUpRight} /> : null}
          </div>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniStat icon={BadgeCheck} label="Quests" value={(stats?.questCount ?? quests.length).toString()} />
        <MiniStat icon={Trophy} label="Available XP" value={(stats?.availableXp ?? 0).toLocaleString()} />
        <MiniStat icon={BadgeCheck} label="Approved submissions" value={(stats?.approvedCount ?? 0).toString()} />
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-white">Project quests</h2>
          <Link href="/dashboard" className="focus-ring rounded-lg bg-white px-4 py-2 font-bold text-base-blue">
            Work on quests
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {quests.map((quest) => {
            const ended = isQuestEnded(quest.ends_at);
            return (
            <article key={quest.id} className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5">
              <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{quest.category}</span>
              <span className="ml-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{proofTypeLabels[quest.proof_type]}</span>
              <span className="ml-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{questTypeLabels[quest.quest_type]}</span>
              <span className="ml-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{difficultyLabels[quest.difficulty]}</span>
              {quest.ends_at ? <span className={`ml-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${ended ? "bg-rose-400 text-slate-950" : "bg-white/10 text-blue-100"}`}>{ended ? "Ended" : `Ends ${formatQuestDeadline(quest.ends_at)}`}</span> : null}
              <h3 className="mt-4 text-xl font-black text-white">{quest.title}</h3>
              <p className="mt-3 leading-7 text-blue-100">{quest.description}</p>
              {quest.instructions ? (
                <div className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Instructions</p>
                  <p className="mt-2 text-sm leading-6 text-blue-50">{quest.instructions}</p>
                  {quest.proof_example ? <p className="mt-2 text-xs text-blue-200">Example: {quest.proof_example}</p> : null}
                </div>
              ) : null}
              {quest.task_url ? (
                <a href={quest.task_url} target="_blank" rel="noreferrer" className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-base-blue">
                  <ArrowUpRight size={16} />
                  Open task link
                </a>
              ) : null}
              <p className="mt-5 font-black text-cyan-200">
                {quest.xp_reward.toLocaleString()} project XP / {quest.global_xp_reward.toLocaleString()} global XP
              </p>
            </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/92 shadow-glow">
        <div className="flex items-center justify-between gap-4 bg-base-blue px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-white">Project leaderboard</h2>
            <p className="mt-1 text-sm font-semibold text-blue-100">Ranks members by project XP from approved submissions.</p>
          </div>
          <Trophy className="text-cyan-100" size={26} />
        </div>
        {leaderboard.length === 0 ? (
          <p className="p-5 text-blue-100">No approved submissions yet.</p>
        ) : (
          leaderboard.slice(0, 10).map((user, index) => (
            <div key={user.id} className="grid grid-cols-[56px_1fr_120px] items-center border-t border-white/10 px-5 py-4">
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
              <span className="text-right font-black text-white">{user.total_xp.toLocaleString()} XP</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function ProjectLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Globe }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white hover:text-base-blue">
      <Icon size={16} />
      {label}
    </a>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof BadgeCheck; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
      <Icon className="text-cyan-200" size={24} />
      <p className="mt-4 text-sm font-semibold text-blue-100">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}
