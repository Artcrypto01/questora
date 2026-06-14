"use client";

import { ArrowUpRight, CheckCircle2, Clock3, FileCheck2, Loader2, Send, ShieldCheck, Star, Zap } from "lucide-react";
import { useState } from "react";
import { ProjectImage } from "@/components/ProjectImage";
import type { Quest, UserQuest } from "@/lib/types";
import { formatQuestDeadline, isQuestEnded } from "@/lib/utils";

type QuestCardProps = {
  quest: Quest;
  completion?: UserQuest;
  disabled: boolean;
  loading: boolean;
  onComplete: (proof: { proof_text: string; proof_url: string }) => void;
};

function getProofCopy(quest: Quest) {
  const fallback = quest.proof_placeholder || "Submit the requested proof";

  if (quest.proof_type === "tweet") {
    return {
      textPlaceholder: "Optional note",
      urlPlaceholder: quest.proof_placeholder || "https://x.com/yourname/status/..."
    };
  }

  if (quest.proof_type === "url") {
    return {
      textPlaceholder: "Optional note",
      urlPlaceholder: fallback
    };
  }

  if (quest.proof_type === "wallet") {
    return {
      textPlaceholder: quest.proof_placeholder || "Transaction hash",
      urlPlaceholder: "Optional explorer URL"
    };
  }

  if (quest.proof_type === "discord") {
    return {
      textPlaceholder: quest.proof_placeholder || "Discord username",
      urlPlaceholder: "Optional profile or screenshot URL"
    };
  }

  return {
    textPlaceholder: fallback,
    urlPlaceholder: "Optional supporting URL"
  };
}

export function QuestCard({ quest, completion, disabled, loading, onComplete }: QuestCardProps) {
  const [proofText, setProofText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const canResubmit = completion?.status === "rejected";
  const isSubmitted = Boolean(completion) && !canResubmit;
  const isApproved = completion?.status === "approved" && Boolean(completion.reviewed_at);
  const isPendingApproval = completion?.status === "approved" && !completion.reviewed_at;
  const effectiveStatus = isPendingApproval ? "submitted" : completion?.status;
  const ended = isQuestEnded(quest.ends_at);
  const proofCopy = getProofCopy(quest);
  const requiresUrl = quest.proof_type === "tweet" || quest.proof_type === "url";
  const hasRequiredProof = requiresUrl ? Boolean(proofUrl.trim()) : Boolean(proofText.trim() || proofUrl.trim());
  const featuredActive = Boolean(quest.project_is_featured && (!quest.project_featured_until || new Date(quest.project_featured_until).getTime() > Date.now()));
  const proofLabel = quest.proof_type === "tweet" ? "X proof" : quest.proof_type === "url" ? "Link proof" : quest.proof_type === "discord" ? "Discord proof" : quest.proof_type === "wallet" ? "Wallet proof" : "Text proof";

  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/95 shadow-glow transition hover:-translate-y-0.5 hover:border-blue-300/40">
      <div className="p-5">
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
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${ended ? "bg-rose-400 text-slate-950" : effectiveStatus ? "bg-white/10 text-blue-100" : "bg-cyan-200 text-slate-950"}`}>
          {ended ? "Ended" : effectiveStatus ?? "Open"}
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
          {proofLabel}
        </span>
        {quest.ends_at ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${ended ? "bg-rose-400 text-slate-950" : "bg-white/10 text-blue-100"}`}>
            {ended ? "Ended" : `Ends ${formatQuestDeadline(quest.ends_at)}`}
          </span>
        ) : null}
      </div>
      {quest.instructions ? (
        <div className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Instructions</p>
          <p className="mt-2 text-sm leading-6 text-blue-50">{quest.instructions}</p>
          {quest.proof_example ? <p className="mt-2 text-xs text-blue-200">Example: {quest.proof_example}</p> : null}
        </div>
      ) : null}
      {quest.task_url ? (
        <a
          href={quest.task_url}
          target="_blank"
          rel="noreferrer"
          className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 font-black text-base-blue transition hover:bg-blue-50 sm:w-auto"
        >
          <ArrowUpRight size={18} />
          Open task link
        </a>
      ) : null}
      {!isSubmitted && !ended ? (
        <div className="mt-5 grid gap-3">
          {canResubmit && completion?.review_note ? (
            <div className="rounded-lg border border-rose-300/30 bg-rose-400/10 p-4 text-sm font-semibold text-rose-100">
              {completion.review_note}
            </div>
          ) : null}
          <textarea
            value={proofText}
            onChange={(event) => setProofText(event.target.value)}
            className="focus-ring min-h-20 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-blue-200/60"
            placeholder={proofCopy.textPlaceholder}
          />
          <input
            value={proofUrl}
            onChange={(event) => setProofUrl(event.target.value)}
            className="focus-ring rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-blue-200/60"
            placeholder={proofCopy.urlPlaceholder}
          />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-blue-100">{quest.global_xp_reward.toLocaleString()} global XP</p>
        <button
          type="button"
          onClick={() => onComplete({ proof_text: proofText, proof_url: proofUrl })}
          disabled={disabled || ended || isSubmitted || quest.status !== "active" || !hasRequiredProof}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-base-blue px-4 py-2.5 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : isApproved ? <CheckCircle2 size={18} /> : isSubmitted || ended ? <Clock3 size={18} /> : <Send size={18} />}
          {ended ? "Quest ended" : isApproved ? "Approved" : isSubmitted ? "In review" : canResubmit ? "Resubmit proof" : "Submit proof"}
        </button>
      </div>
      </div>
    </article>
  );
}
