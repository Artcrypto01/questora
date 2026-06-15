"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Globe, MessageCircle, Search, Send, ShieldCheck, Sparkles, Star } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { getProjects } from "@/lib/quest-service";
import type { Project, ProjectType } from "@/lib/types";

const projectTypes: Array<"All" | ProjectType> = ["All", "NFT", "Meme", "AI", "DeFi", "Gaming", "DAO", "Social", "Education", "Tooling", "Other"];

function isFeaturedActive(project: Project) {
  return Boolean(project.is_featured && (!project.featured_until || new Date(project.featured_until).getTime() > Date.now()));
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectType, setProjectType] = useState<"All" | ProjectType>("All");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setProjects(await getProjects());
      setLoading(false);
    }

    load();
  }, []);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesType = projectType === "All" || project.project_type === projectType;
      const matchesSearch =
        !query ||
        project.name.toLowerCase().includes(query) ||
        project.project_type.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [projectType, projects, searchQuery]);

  const verifiedProjects = filteredProjects.filter((project) => project.is_verified);
  const communityProjects = filteredProjects.filter((project) => !project.is_verified);
  const featuredProjects = filteredProjects.filter(isFeaturedActive);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-cyan-200/20 bg-base-blue p-6 shadow-glow sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-4xl font-black text-white sm:text-6xl">Explore Questora projects</h1>
            <p className="mt-4 max-w-2xl leading-7 text-blue-100">
              Find verified communities, active campaigns, and project quest hubs.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <DirectoryStat label="Projects" value={projects.length.toString()} />
            <DirectoryStat label="Verified" value={projects.filter((project) => project.is_verified).length.toString()} />
            <DirectoryStat label="Featured" value={featuredProjects.length.toString()} />
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
            placeholder="Search projects, categories, or communities"
          />
        </label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
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
      </section>

      {loading ? (
        <div className="mt-10 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 text-blue-100">Loading projects...</div>
      ) : (
        <>
          <ProjectSection title="Verified projects" projects={verifiedProjects} emptyText="No verified projects match this filter yet." />
          <ProjectSection title="Community projects" projects={communityProjects} emptyText="No community projects match this filter yet." />
        </>
      )}
    </div>
  );
}

function DirectoryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wider text-blue-100">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function ProjectSection({ title, projects, emptyText }: { title: string; projects: Project[]; emptyText: string }) {
  return (
    <section className="mt-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">{title}</h2>
        </div>
        <span className="text-sm font-semibold text-blue-100">{projects.length} projects</span>
      </div>
      {projects.length === 0 ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 text-blue-100">
          <Sparkles className="text-cyan-200" size={26} />
          <p className="mt-3 font-semibold">{emptyText}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectDirectoryCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectDirectoryCard({ project }: { project: Project }) {
  const featuredActive = isFeaturedActive(project);
  return (
    <Link href={`/projects/${encodeURIComponent(project.slug || project.id)}`} className="focus-ring group overflow-hidden rounded-lg border border-white/10 bg-[#0b1730]/92 shadow-glow transition hover:-translate-y-0.5 hover:border-cyan-200/60">
      <div className="relative h-32 bg-base-blue">
        <ProjectImage src={project.cover_image_url} name={project.name} variant="cover" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{project.project_type}</span>
          {project.is_verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
              <ShieldCheck size={13} />
              Verified
            </span>
          ) : null}
          {featuredActive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
              <Star size={13} />
              Top
            </span>
          ) : null}
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="-mt-9 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#0b1730] bg-white text-base-blue">
            <ProjectImage src={project.logo_url} name={project.name} variant="logo" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-xl font-black text-white">{project.name}</h3>
            <p className="mt-1 truncate text-sm text-blue-100">{project.description || "Open Questora community hub"}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {project.website_url ? <SocialPill icon={Globe} label="Web" /> : null}
          {project.x_url ? <SocialPill icon={ArrowUpRight} label="X" /> : null}
          {project.discord_url ? <SocialPill icon={MessageCircle} label="Discord" /> : null}
          {project.telegram_url ? <SocialPill icon={Send} label="Telegram" /> : null}
        </div>
      </div>
    </Link>
  );
}

function SocialPill({ icon: Icon, label }: { icon: typeof Globe; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100">
      <Icon size={13} />
      {label}
    </span>
  );
}
