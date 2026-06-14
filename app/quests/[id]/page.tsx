"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { ArrowLeft, Loader2, ShieldCheck, Star } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { QuestCard } from "@/components/QuestCard";
import { completeQuest, getOrCreateUser, getQuestById, getUserCompletions } from "@/lib/quest-service";
import type { Quest, UserQuest } from "@/lib/types";

export default function QuestDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [completion, setCompletion] = useState<UserQuest | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const campaignId = searchParams.get("campaign");
  const backHref = campaignId ? `/dashboard?campaign=${encodeURIComponent(campaignId)}` : "/dashboard";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const questRow = await getQuestById(params.id);
      const userRow = address ? await getOrCreateUser(address) : null;
      const completions = userRow ? await getUserCompletions(userRow.id) : [];

      if (active) {
        setQuest(questRow);
        setCompletion(completions.find((item) => item.quest_id === questRow?.id));
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [address, params.id]);

  async function handleComplete(proof: { proof_text: string; proof_url: string }) {
    if (!address || !quest) return;
    setBusy(true);
    setMessage("");
    try {
      const updatedUser = await completeQuest(address, quest, proof);
      const latestCompletions = await getUserCompletions(updatedUser.id);
      setCompletion(latestCompletions.find((item) => item.quest_id === quest.id));
      setMessage("Proof submitted. Project owner will review it soon.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to submit quest proof.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl justify-center px-4 py-16 text-base-blue sm:px-6 lg:px-8">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (!quest) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-white sm:px-6 lg:px-8">
        <p className="text-cyan-200">Quest</p>
        <h1 className="mt-2 text-3xl font-black">Quest not found</h1>
        <Link href={backHref} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 font-black text-base-blue">
          <ArrowLeft size={18} />
          Back to quests
        </Link>
      </div>
    );
  }

  const featuredActive = Boolean(quest.project_is_featured && (!quest.project_featured_until || new Date(quest.project_featured_until).getTime() > Date.now()));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href={backHref} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white hover:text-base-blue">
        <ArrowLeft size={18} />
        Back to quests
      </Link>

      <section className="mt-5 rounded-2xl border border-cyan-200/20 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-base-blue">
              <ProjectImage src={quest.project_logo_url} name={quest.project_name || "Project"} variant="logo" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black uppercase tracking-wider text-cyan-200">{quest.project_name || "Questora project"}</p>
                {quest.project_type ? <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{quest.project_type}</span> : null}
                {quest.project_is_verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                    <ShieldCheck size={14} />
                    Verified
                  </span>
                ) : null}
                {featuredActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                    <Star size={14} />
                    Top #{quest.project_featured_rank ?? 1}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">{quest.title}</h1>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-100">
            {isConnected ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` : "Connect wallet to submit proof"}
          </div>
        </div>
      </section>

      <div className="mt-6">
        <QuestCard quest={quest} completion={completion} disabled={!isConnected || busy} loading={busy} onComplete={handleComplete} />
      </div>

      {message ? <p className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4 text-sm font-semibold text-cyan-100">{message}</p> : null}
    </div>
  );
}
