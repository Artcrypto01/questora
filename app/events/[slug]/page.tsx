"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Award, BadgeCheck, CalendarDays, Gift, Trophy, UserRound, UsersRound } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { getCampaignPartners, getEventBySlug, getEventLeaderboard, getEventStats, getQuestsByCampaign } from "@/lib/quest-service";
import type { CampaignPartnerProject, Event, EventStats, Quest, UserProfile } from "@/lib/types";
import { formatQuestDeadline, isQuestEnded, shortAddress } from "@/lib/utils";

const rewardTypeLabels = {
  top_leaderboard: "Top leaderboard",
  raffle: "Raffle",
  manual_selection: "Manual selection",
  whitelist: "Whitelist"
};

export default function EventDetailPage() {
  const params = useParams<{ slug: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [stats, setStats] = useState<EventStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [partners, setPartners] = useState<CampaignPartnerProject[]>([]);

  useEffect(() => {
    async function load() {
      const eventRow = await getEventBySlug(params.slug);
      setEvent(eventRow);
      if (!eventRow) return;

      const [statRow, leaderboardRows, campaignQuests, partnerRows] = await Promise.all([
        getEventStats(eventRow.id),
        getEventLeaderboard(eventRow.id, 50),
        getQuestsByCampaign(eventRow.campaign_id),
        getCampaignPartners(eventRow.campaign_id)
      ]);
      setStats(statRow);
      setLeaderboard(leaderboardRows);
      setQuests(campaignQuests);
      setPartners(partnerRows);
    }

    load();
  }, [params.slug]);

  if (!event) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-white sm:px-6 lg:px-8">
        <p className="text-cyan-200">Event</p>
        <h1 className="mt-2 text-3xl font-black">Event not found</h1>
      </div>
    );
  }

  const ended = isQuestEnded(event.ends_at);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-cyan-200/20 bg-[#0b1730]/92 shadow-glow">
        <div className="relative h-64 bg-base-blue sm:h-80">
          <ProjectImage src={event.cover_image_url} name={event.name} variant="cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061022] via-[#061022]/30 to-transparent" />
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{ended ? "Ended" : "Live event"}</span>
              {partners.length > 0 ? <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">Collab campaign</span> : null}
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">{rewardTypeLabels[event.reward_type]}</span>
              {event.campaign_name ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">{event.campaign_name}</span> : null}
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-black text-white sm:text-6xl">{event.name}</h1>
          </div>
        </div>
        <div className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-base-blue">
              <ProjectImage src={event.project_logo_url} name={event.project_name || event.name} variant="logo" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-cyan-200">{event.project_name ?? "Project event"}</p>
              <p className="mt-2 max-w-3xl leading-7 text-blue-100">{event.description || "Compete in approved quests, climb the event leaderboard, and qualify for rewards."}</p>
              {partners.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-black uppercase tracking-wider text-blue-200">Co-hosted with</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {partners.map((partner) => (
                      <span key={partner.id} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 py-1 pl-1 pr-3 text-xs font-black text-white">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-base-blue">
                          <ProjectImage src={partner.logo_url} name={partner.name} variant="logo" />
                        </span>
                        {partner.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <Link href={`/dashboard?campaign=${encodeURIComponent(event.campaign_id)}`} className="focus-ring inline-flex items-center justify-center rounded-lg bg-white px-5 py-3 font-black text-base-blue">
            Start quests
          </Link>
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <EventStat icon={Gift} label="Prize pool" value={event.prize_pool ? `${event.prize_pool} ${event.prize_currency ?? ""}` : "TBA"} />
        <EventStat icon={CalendarDays} label={ended ? "Ended" : "Ends"} value={(event.ends_at ? formatQuestDeadline(event.ends_at) : null) ?? "Open"} />
        <EventStat icon={UsersRound} label="Participants" value={(stats?.participantCount ?? 0).toLocaleString()} />
        <EventStat icon={Award} label="Event XP" value={(stats?.totalXp ?? 0).toLocaleString()} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="flex items-center gap-3">
            <BadgeCheck className="text-cyan-200" />
            <h2 className="text-xl font-black text-white">Event rules</h2>
          </div>
          <p className="mt-4 whitespace-pre-line leading-7 text-blue-100">{event.rules || "Complete approved event quests before the deadline. Winners are selected based on the reward method shown above."}</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Quests</p>
              <p className="mt-1 text-2xl font-black text-white">{stats?.questCount ?? quests.length}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Approved</p>
              <p className="mt-1 text-2xl font-black text-white">{stats?.approvedCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/92 shadow-glow">
          <div className="flex items-center justify-between gap-4 bg-base-blue px-5 py-4">
            <div>
              <h2 className="text-xl font-black text-white">Event leaderboard</h2>
              <p className="mt-1 text-sm font-semibold text-blue-100">Ranks approved quest XP inside this event only.</p>
            </div>
            <Trophy className="text-cyan-100" size={26} />
          </div>
          {leaderboard.length === 0 ? (
            <p className="p-5 text-blue-100">No approved event submissions yet.</p>
          ) : (
            leaderboard.slice(0, 10).map((user, index) => (
              <div key={user.id} className="grid grid-cols-[52px_1fr_112px] items-center border-t border-white/10 px-5 py-4">
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
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-white">Event quests</h2>
          <span className="text-sm font-semibold text-blue-100">{quests.length} quests</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {quests.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 text-blue-100 md:col-span-2">No quests are attached to this event campaign yet.</div>
          ) : (
            quests.map((quest) => (
              <Link
                key={quest.id}
                href={`/dashboard?campaign=${encodeURIComponent(event.campaign_id)}`}
                className="focus-ring rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 transition hover:-translate-y-0.5 hover:border-cyan-200/60"
              >
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{quest.category}</span>
                  {quest.ends_at ? <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${isQuestEnded(quest.ends_at) ? "bg-rose-400 text-slate-950" : "bg-white/10 text-blue-100"}`}>{isQuestEnded(quest.ends_at) ? "Ended" : `Ends ${formatQuestDeadline(quest.ends_at)}`}</span> : null}
                </div>
                <h3 className="mt-4 text-xl font-black text-white">{quest.title}</h3>
                <p className="mt-3 leading-7 text-blue-100">{quest.description}</p>
                <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <p className="font-black text-cyan-200">{quest.xp_reward.toLocaleString()} event XP</p>
                  <span className="inline-flex justify-center rounded-lg bg-white px-4 py-2 text-sm font-black text-base-blue">Start quest</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function EventStat({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
      <Icon className="text-cyan-200" size={24} />
      <p className="mt-4 text-sm font-semibold text-blue-100">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}
