"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Badge, CheckCircle2, ListFilter, Loader2, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { QuestCard } from "@/components/QuestCard";
import { StatCard } from "@/components/StatCard";
import { getOrCreateUser, getProjects, getQuests, getUserCompletions, completeQuest } from "@/lib/quest-service";
import type { Project, ProjectType, Quest, UserProfile, UserQuest } from "@/lib/types";

const projectTypes: Array<"All" | ProjectType> = ["All", "NFT", "Meme", "AI", "DeFi", "Gaming", "DAO", "Social", "Education", "Tooling", "Other"];

function isProjectFeaturedActive(project: Project) {
  return Boolean(project.is_featured && (!project.featured_until || new Date(project.featured_until).getTime() > Date.now()));
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [submissions, setSubmissions] = useState<Map<string, UserQuest>>(new Map());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [projectId, setProjectId] = useState("All");
  const [projectType, setProjectType] = useState<"All" | ProjectType>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyQuest, setBusyQuest] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const [projectRows, questRows, userRow] = await Promise.all([
        getProjects(),
        getQuests(),
        address ? getOrCreateUser(address) : Promise.resolve(null)
      ]);

      const completions = userRow ? await getUserCompletions(userRow.id) : [];

      if (active) {
        setProjects(projectRows);
        setQuests(questRows);
        setUser(userRow);
        setSubmissions(new Map(completions.map((item) => [item.quest_id, item])));
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [address]);

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
      const matchesProjectFilters = visibleProjectIds.has(quest.project_id ?? "");
      const matchesSearch =
        !query ||
        quest.title.toLowerCase().includes(query) ||
        quest.description.toLowerCase().includes(query) ||
        quest.category.toLowerCase().includes(query) ||
        project?.name.toLowerCase().includes(query) ||
        project?.project_type.toLowerCase().includes(query);

      return matchesProjectFilters && matchesSearch;
    }).sort((a, b) => (projectOrder.get(a.project_id ?? "") ?? 9999) - (projectOrder.get(b.project_id ?? "") ?? 9999));
  }, [filteredProjects, projects, quests, searchQuery]);

  const earnedXp = user?.total_xp ?? 0;

  async function handleComplete(quest: Quest, proof: { proof_text: string; proof_url: string }) {
    if (!address) return;
    setBusyQuest(quest.id);
    setMessage("");
    try {
      const updatedUser = await completeQuest(address, quest, proof);
      setUser(updatedUser);
      const latestCompletions = await getUserCompletions(updatedUser.id);
      setSubmissions(new Map(latestCompletions.map((item) => [item.quest_id, item])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to submit quest proof.");
    } finally {
      setBusyQuest(null);
    }
  }

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
        <StatCard icon={CheckCircle2} label="Approved" value={`${Array.from(submissions.values()).filter((item) => item.status === "approved" && item.reviewed_at).length}/${quests.length}`} />
        <StatCard icon={Badge} label="In review" value={Array.from(submissions.values()).filter((item) => item.status === "submitted").length.toString()} />
      </div>

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

      {loading ? (
        <div className="mt-14 flex justify-center text-base-blue">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleQuests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              completion={submissions.get(quest.id)}
              disabled={!isConnected || Boolean(busyQuest)}
              loading={busyQuest === quest.id}
              onComplete={(proof) => handleComplete(quest, proof)}
            />
          ))}
          {visibleQuests.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 text-blue-100 lg:col-span-2">
              No quests found for this search.
            </div>
          ) : null}
        </div>
      )}
      {message ? <p className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4 text-sm font-semibold text-cyan-100">{message}</p> : null}
    </div>
  );
}
