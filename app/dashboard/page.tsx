"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { Badge, CalendarDays, CheckCircle2, Gift, ListFilter, Loader2, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { QuestPreviewCard } from "@/components/QuestPreviewCard";
import { StatCard } from "@/components/StatCard";
import { getEvents, getOrCreateUser, getProjects, getQuests, getUserCompletions } from "@/lib/quest-service";
import type { Event, Project, ProjectType, Quest, UserProfile, UserQuest } from "@/lib/types";
import { formatQuestDeadline } from "@/lib/utils";

const projectTypes: Array<"All" | ProjectType> = ["All", "NFT", "Meme", "AI", "DeFi", "Gaming", "DAO", "Social", "Education", "Tooling", "Other"];

function isProjectFeaturedActive(project: Project) {
  return Boolean(project.is_featured && (!project.featured_until || new Date(project.featured_until).getTime() > Date.now()));
}

function getEventDisplayEndsAt(event: Event) {
  return event.campaign_id ? event.campaign_ends_at ?? event.ends_at : event.ends_at;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-8 text-blue-100 sm:px-6 lg:px-8">Loading quests...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, UserQuest>>(new Map());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [projectId, setProjectId] = useState("All");
  const [projectType, setProjectType] = useState<"All" | ProjectType>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const campaignFilter = searchParams.get("campaign");
  const projectFilter = searchParams.get("project");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const [projectRows, eventRows, questRows, userRow] = await Promise.all([
        getProjects(),
        getEvents(6),
        getQuests(),
        address ? getOrCreateUser(address) : Promise.resolve(null)
      ]);

      const completions = userRow ? await getUserCompletions(userRow.id) : [];

      if (active) {
        setProjects(projectRows);
        setEvents(eventRows);
        setQuests(questRows);
        setUser(userRow);
        setSubmissions(new Map(completions.map((item) => [item.quest_id, item])));
        if (projectFilter) {
          setProjectId(projectFilter);
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [address, projectFilter]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesProject = projectId === "All" || project.id === projectId;
      const matchesType = projectType === "All" || project.project_type === projectType;
      const matchesSearch =
        !query ||
        project.name.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query) ||
        project.project_type.toLowerCase().includes(query);

      return matchesProject && matchesType && matchesSearch;
    });
  }, [projectId, projectType, projects, searchQuery]);

  const visibleQuests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const visibleProjectIds = new Set(filteredProjects.map((project) => project.id));

    const projectOrder = new Map(filteredProjects.map((project, index) => [project.id, index]));

    return quests.filter((quest) => {
      const project = projects.find((item) => item.id === quest.project_id);
      const submission = submissions.get(quest.id);
      const isCompleted = submission?.status === "approved" && Boolean(submission.reviewed_at);
      const matchesProjectFilters = visibleProjectIds.has(quest.project_id ?? "");
      const matchesCampaign = !campaignFilter || quest.campaign_id === campaignFilter;
      const matchesSearch =
        !query ||
        quest.title.toLowerCase().includes(query) ||
        quest.description.toLowerCase().includes(query) ||
        quest.category.toLowerCase().includes(query) ||
        project?.name.toLowerCase().includes(query) ||
        project?.project_type.toLowerCase().includes(query);

      return !isCompleted && matchesProjectFilters && matchesCampaign && matchesSearch;
    }).sort((a, b) => (projectOrder.get(a.project_id ?? "") ?? 9999) - (projectOrder.get(b.project_id ?? "") ?? 9999));
  }, [campaignFilter, filteredProjects, projects, quests, searchQuery, submissions]);

  const earnedXp = user?.total_xp ?? 0;
  const approvedSubmissionCount = Array.from(submissions.values()).filter((item) => item.status === "approved" && item.reviewed_at).length;
  const inReviewCount = Array.from(submissions.values()).filter((item) => item.status === "submitted").length;
  const featuredEvents = useMemo(() => events.filter((event) => event.is_featured), [events]);
  const endingSoonEvents = useMemo(
    () =>
      events
        .filter((event) => getEventDisplayEndsAt(event))
        .sort((a, b) => new Date(getEventDisplayEndsAt(a) ?? 0).getTime() - new Date(getEventDisplayEndsAt(b) ?? 0).getTime())
        .slice(0, 3),
    [events]
  );
  const verifiedProjects = useMemo(() => filteredProjects.filter((project) => project.is_verified).slice(0, 6), [filteredProjects]);
  const campaignQuests = useMemo(() => quests.filter((quest) => quest.campaign_id === campaignFilter), [campaignFilter, quests]);
  const campaignProgress = useMemo(() => {
    const approved = campaignQuests.filter((quest) => {
      const submission = submissions.get(quest.id);
      return submission?.status === "approved" && Boolean(submission.reviewed_at);
    }).length;
    const submitted = campaignQuests.filter((quest) => submissions.get(quest.id)?.status === "submitted").length;
    const total = campaignQuests.length;
    const percent = total > 0 ? Math.round((approved / total) * 100) : 0;

    return { approved, submitted, total, percent };
  }, [campaignQuests, submissions]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="font-semibold text-cyan-200">Quest dashboard</p>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Earn XP across the Base network</h1>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm text-blue-100 shadow-sm backdrop-blur">
          {isConnected ? `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}` : "Connect a wallet to save progress"}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={Sparkles} label="Global XP" value={earnedXp.toLocaleString()} />
        <StatCard icon={CheckCircle2} label="Approved" value={`${approvedSubmissionCount}/${quests.length}`} />
        <StatCard icon={Badge} label="In review" value={inReviewCount.toString()} />
      </div>

      {events.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-black text-white">Live events</h2>
            <span className="text-sm font-semibold text-blue-100">Prize campaigns</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <DiscoveryPill icon={Star} label="Featured campaigns" value={featuredEvents.length.toString()} />
            <DiscoveryPill icon={CalendarDays} label="Ending soon" value={endingSoonEvents.length.toString()} />
            <DiscoveryPill icon={ShieldCheck} label="Verified projects" value={verifiedProjects.length.toString()} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {events.map((event) => (
              <Link key={event.id} href={`/events/${encodeURIComponent(event.slug)}`} className="focus-ring overflow-hidden rounded-lg border border-cyan-200/20 bg-[#0b1730]/92 shadow-glow transition hover:-translate-y-0.5 hover:border-cyan-200/70">
                <div className="relative h-32 bg-base-blue">
                  <ProjectImage src={event.cover_image_url} name={event.name} variant="cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                    {event.is_featured ? "Featured event" : "Live event"}
                  </span>
                  {event.partner_projects && event.partner_projects.length > 0 ? (
                    <span className="absolute right-3 top-3 rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                      Collab
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-base-blue">
                      <ProjectImage src={event.project_logo_url} name={event.project_name || event.name} variant="logo" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold uppercase tracking-wider text-cyan-200">{event.project_name ?? "Project"}</p>
                      <h3 className="truncate font-black text-white">{event.name}</h3>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-blue-100">{event.description || "Compete in approved quests and climb the event leaderboard."}</p>
                  {event.partner_projects && event.partner_projects.length > 0 ? (
                    <p className="mt-2 text-xs font-black uppercase tracking-wider text-cyan-200">
                      + {event.partner_projects.length} partner{event.partner_projects.length > 1 ? "s" : ""}
                    </p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-blue-100">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2">
                      <Gift size={14} className="text-cyan-200" />
                      {event.prize_pool ? `${event.prize_pool} ${event.prize_currency ?? ""}` : "Prize TBA"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2">
                      <CalendarDays size={14} className="text-cyan-200" />
                      {getEventDisplayEndsAt(event) ? formatQuestDeadline(getEventDisplayEndsAt(event)) : "Open"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {endingSoonEvents.length > 0 ? (
        <section className="mt-8 rounded-lg border border-amber-300/20 bg-amber-300/10 p-5 shadow-glow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-amber-200">Ending soon</p>
              <h2 className="mt-1 text-2xl font-black text-white">Campaigns with deadlines coming up</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {endingSoonEvents.map((event) => (
                <Link key={event.id} href={`/events/${encodeURIComponent(event.slug)}`} className="focus-ring rounded-full bg-white px-4 py-2 text-sm font-black text-base-blue">
                  {event.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-black text-white">Projects</h2>
          <span className="text-sm font-semibold text-blue-100">{filteredProjects.length} shown</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {filteredProjects.slice(0, 6).map((project) => (
            <Link key={project.id} href={`/projects/${encodeURIComponent(project.slug || project.id)}`} className="focus-ring overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/92 shadow-glow transition hover:-translate-y-0.5 hover:border-cyan-200/60">
              <div className="h-24 bg-base-blue">
                <ProjectImage src={project.cover_image_url} name={project.name} variant="cover" />
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="-mt-8 flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#0b1730] bg-white text-xl font-black text-base-blue">
                  <ProjectImage src={project.logo_url} name={project.name} variant="logo" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-black text-white">{project.name}</p>
                    <span className="shrink-0 rounded-full bg-cyan-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">{project.project_type}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {project.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                        <ShieldCheck size={11} />
                        Verified
                      </span>
                    ) : null}
                    {isProjectFeaturedActive(project) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                        <Star size={11} />
                        Top #{project.featured_rank ?? 1}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-blue-100">{project.description || "Open quest hub"}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
        <label className="focus-within:ring-base-blue/70 flex min-h-12 items-center gap-3 rounded-full border border-white/10 bg-white/10 px-4 text-blue-100 shadow-sm focus-within:ring-2">
          <Search className="shrink-0 text-cyan-200" size={18} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold text-white outline-none placeholder:text-blue-200/70"
            placeholder="Search communities, projects, or quests"
          />
        </label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
          <ListFilter className="shrink-0 text-cyan-200" size={20} />
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="focus-ring shrink-0 rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-base-blue"
          >
            <option value="All">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projectTypes.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setProjectType(item)}
              className={`focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                projectType === item ? "bg-white text-base-blue" : "border border-white/10 bg-white/10 text-blue-100 hover:border-cyan-200 hover:text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {campaignFilter ? (
        <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-wider text-cyan-200">Event quest filter</p>
            <p className="mt-1 text-sm font-semibold text-blue-100">Showing quests from the selected event campaign.</p>
            <div className="mt-4 max-w-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase tracking-wider text-blue-100">
                <span>Your progress</span>
                <span>
                  {campaignProgress.approved}/{campaignProgress.total} approved
                  {campaignProgress.submitted > 0 ? ` · ${campaignProgress.submitted} in review` : ""}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-cyan-200 transition-all" style={{ width: `${campaignProgress.percent}%` }} />
              </div>
            </div>
          </div>
          <Link href="/dashboard" className="focus-ring inline-flex shrink-0 justify-center rounded-lg bg-white px-4 py-2 text-sm font-black text-base-blue">
            Clear filter
          </Link>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-14 flex justify-center text-base-blue">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleQuests.map((quest) => (
            <QuestPreviewCard
              key={quest.id}
              quest={quest}
              completion={submissions.get(quest.id)}
              campaignId={campaignFilter}
            />
          ))}
          {visibleQuests.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-8 text-blue-100 lg:col-span-2">
              <Sparkles className="text-cyan-200" size={28} />
              <h3 className="mt-4 text-xl font-black text-white">{approvedSubmissionCount > 0 ? "You are caught up" : "No quests found"}</h3>
              <p className="mt-2 max-w-2xl leading-7">
                {approvedSubmissionCount > 0
                  ? "All available quests are completed or no quests match this filter. Check live events or try another project category."
                  : "Try a different search, project, or category filter."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setProjectId("All");
                  setProjectType("All");
                }}
                className="focus-ring mt-5 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-base-blue"
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DiscoveryPill({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-blue-200">{label}</p>
          <p className="mt-1 text-2xl font-black text-white">{value}</p>
        </div>
        <Icon className="text-cyan-200" size={22} />
      </div>
    </div>
  );
}
