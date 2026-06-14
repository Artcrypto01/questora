"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock3, FileCheck2, ShieldCheck, Star, Zap } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import type { Quest, UserQuest } from "@/lib/types";
import { formatQuestDeadline, isQuestEnded } from "@/lib/utils";

type QuestPreviewCardProps = {
  quest: Quest;
  completion?: UserQuest;
  campaignId?: string | null;
};

function getProofLabel(quest: Quest) {
  if (quest.proof_type === "tweet") return "X proof";
  if (quest.proof_type === "url") return "Link proof";
  if (quest.proof_type === "discord") return "Discord proof";
  if (quest.proof_type === "wallet") return "Wallet proof";
  return "Text proof";
}

export function QuestPreviewCard({ quest, completion, campaignId }: QuestPreviewCardProps) {
  const ended = isQuestEnded(quest.ends_at);
  const isApproved = completion?.status === "approved" && Boolean(completion.reviewed_at);
  const isSubmitted = Boolean(completion) && !isApproved && completion?.status !== "rejected";
  const status = ended ? "Ended" : isApproved ? "Approved" : isSubmitted ? "In review" : "Start quest";
  const featuredActive = Boolean(quest.project_is_featured && (!quest.project_featured_until || new Date(quest.project_featured_until).getTime() > Date.now()));
  const href = `/quests/${encodeURIComponent(quest.id)}${campaignId ? `?campaign=${encodeURIComponent(campaignId)}` : ""}`;

  return (
    <Link href={href} className="focus-ring group block overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/95 p-5 shadow-glow transition hover:-translate-y-0.5 hover:border-cyan-200/60">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-lg font-black text-base-blue">
            <ProjectImage src={quest.project_logo_url} name={quest.project_name || "Project"} variant="logo" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">{quest.project_name || "Questora project"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {quest.project_type ? <span className="text-xs font-semibold text-cyan-200">{quest.project_type}</span> : null}
              {quest.project_is_verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                  <ShieldCheck size={11} />
                  Verified
                </span>
              ) : null}
              {featuredActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                  <Star size={11} />
                  Top #{quest.project_featured_rank ?? 1}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${ended ? "bg-rose-400 text-slate-950" : isApproved ? "bg-emerald-300 text-slate-950" : isSubmitted ? "bg-amber-300 text-slate-950" : "bg-cyan-200 text-slate-950"}`}>
          {status}
        </span>
      </div>

      <h2 className="mt-5 text-xl font-black text-white">{quest.title}</h2>
      <p className="mt-3 line-clamp-2 leading-7 text-blue-100">{quest.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
          <Zap size={13} />
          {quest.xp_reward.toLocaleString()} XP
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">
          <FileCheck2 size={13} />
          {getProofLabel(quest)}
        </span>
        {quest.ends_at ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${ended ? "bg-rose-400 text-slate-950" : "bg-white/10 text-blue-100"}`}>
            {ended ? "Ended" : `Ends ${formatQuestDeadline(quest.ends_at)}`}
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-blue-100">{quest.global_xp_reward.toLocaleString()} global XP</p>
        <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-black text-base-blue transition group-hover:bg-cyan-100">
          Open
          {isApproved ? <CheckCircle2 size={16} /> : isSubmitted ? <Clock3 size={16} /> : <ArrowUpRight size={16} />}
        </span>
      </div>
    </Link>
  );
}
