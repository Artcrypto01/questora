import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { seedCompletions, seedProjects, seedQuests, seedUsers } from "@/lib/seed-data";
import type { AdminContext, Project, ProjectCurationInput, ProjectInput, ProjectMember, QualifiedUser, Quest, QuestInput, QuestSubmissionInput, UserProfile, UserProfileInput, UserQuest } from "@/lib/types";
import { getImageUrl, isQuestEnded, normalizeWallet } from "@/lib/utils";
import { calculateGlobalXp, clampProjectXp } from "@/lib/xp-policy";

let localProjects = [...seedProjects];
let localQuests = [...seedQuests];
let localUsers = [...seedUsers];
let localCompletions = [...seedCompletions];
let localProjectMembers: ProjectMember[] = [];

function assertSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  return supabase;
}

type UserQuestWithQuest = UserQuest & {
  quests: {
    xp_reward: number;
    global_xp_reward?: number | null;
    project_id?: string | null;
    title?: string;
    projects?: {
      name: string;
      status?: string;
    } | null;
  } | null;
  users?: {
    wallet_address: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
};

type QualifiedUserRow = {
  xp_awarded: number | null;
  completed_at?: string | null;
  reviewed_at?: string | null;
  users:
    | {
        id: string;
        wallet_address: string;
        display_name?: string | null;
        avatar_url?: string | null;
      }
    | Array<{
        id: string;
        wallet_address: string;
        display_name?: string | null;
        avatar_url?: string | null;
      }>
    | null;
  quests:
    | {
        project_id?: string | null;
        title?: string | null;
        projects?: { name: string } | Array<{ name: string }> | null;
      }
    | Array<{
        project_id?: string | null;
        title?: string | null;
        projects?: { name: string } | Array<{ name: string }> | null;
      }>
    | null;
};

function sumCompletedQuestXp(rows: UserQuestWithQuest[]) {
  return rows.reduce((total, row) => total + (row.quests?.global_xp_reward ?? row.global_xp_awarded ?? row.quests?.xp_reward ?? row.xp_awarded ?? 0), 0);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getConfiguredPlatformAdmins() {
  return (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_WALLETS ?? "")
    .split(",")
    .map((wallet) => wallet.trim().toLowerCase())
    .filter(Boolean);
}

function hasProjectAccess(context: AdminContext, projectId?: string | null) {
  return Boolean(projectId && (context.is_platform_admin || context.project_ids.includes(projectId)));
}

function isFeaturedActive(project: Pick<Project, "is_featured" | "featured_until">) {
  return Boolean(project.is_featured && (!project.featured_until || new Date(project.featured_until).getTime() > Date.now()));
}

function sortProjects(projects: Project[]) {
  return [...projects].sort((a, b) => {
    const aFeatured = isFeaturedActive(a);
    const bFeatured = isFeaturedActive(b);
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
    if (aFeatured && bFeatured) {
      const rankDiff = (a.featured_rank ?? 999) - (b.featured_rank ?? 999);
      if (rankDiff !== 0) return rankDiff;
    }
    if (a.is_verified !== b.is_verified) return a.is_verified ? -1 : 1;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
}

function formatDatabaseError(error: unknown, fallback = "Something went wrong.") {
  if (!error || typeof error !== "object") return fallback;

  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = maybeError.message ?? fallback;
  const details = maybeError.details ?? "";

  if (maybeError.code === "23505" || message.toLowerCase().includes("duplicate key")) {
    return "A quest with this title already exists in this project. Use a different title.";
  }

  if (
    message.includes("quest_type") ||
    message.includes("difficulty") ||
    message.includes("global_xp_reward") ||
    message.includes("global_xp_awarded") ||
    message.includes("ends_at") ||
    details.includes("quest_type") ||
    details.includes("difficulty") ||
    details.includes("global_xp_reward") ||
    details.includes("global_xp_awarded") ||
    details.includes("ends_at")
  ) {
    return "Supabase is missing newer quest columns. Run supabase/xp-guardrails.sql and supabase/quest-deadlines.sql in the Supabase SQL editor, then try again.";
  }

  if (message.toLowerCase().includes("row-level security") || message.toLowerCase().includes("violates row-level security")) {
    return "Supabase blocked this write with Row Level Security. Check the quests insert policy in the schema.";
  }

  return message;
}

function normalizeSubmissionStatus<T extends UserQuest>(submission: T): T {
  if (submission.status === "approved" && !submission.reviewed_at) {
    return {
      ...submission,
      status: "submitted"
    };
  }

  return submission;
}

function readJoinedObject<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function aggregateQualifiedUsers(rows: QualifiedUserRow[], projectNames: Map<string, string>, projectFilter?: string | null): QualifiedUser[] {
  const users = new Map<string, QualifiedUser>();

  for (const row of rows) {
    const user = readJoinedObject(row.users);
    const quest = readJoinedObject(row.quests);
    const projectId = quest?.project_id ?? "";
    if (!user || !projectId || (projectFilter && projectId !== projectFilter)) continue;

    const projectJoin = readJoinedObject(quest?.projects);
    const existing = users.get(`${projectId}:${user.id}`);
    const latestDate = row.reviewed_at ?? row.completed_at ?? null;
    const existingDate = existing?.qualified_at ?? null;

    users.set(`${projectId}:${user.id}`, {
      user_id: user.id,
      wallet_address: user.wallet_address,
      display_name: user.display_name ?? null,
      avatar_url: user.avatar_url ?? null,
      project_id: projectId,
      project_name: projectJoin?.name ?? projectNames.get(projectId) ?? "Project",
      project_xp: (existing?.project_xp ?? 0) + (row.xp_awarded ?? 0),
      approved_quests: (existing?.approved_quests ?? 0) + 1,
      qualified_at: !existingDate || (latestDate && latestDate > existingDate) ? latestDate : existingDate
    });
  }

  return Array.from(users.values()).sort((a, b) => {
    if (b.project_xp !== a.project_xp) return b.project_xp - a.project_xp;
    return b.approved_quests - a.approved_quests;
  });
}

async function getUserXp(userId: string) {
  if (!hasSupabaseConfig) {
    return localCompletions
      .filter((completion) => completion.user_id === userId && completion.status === "approved" && completion.reviewed_at)
      .reduce((total, completion) => total + completion.xp_awarded, 0);
  }

  const { data, error } = await assertSupabase()
    .from("user_quests")
    .select("*, quests(xp_reward, global_xp_reward)")
    .eq("user_id", userId)
    .eq("status", "approved")
    .not("reviewed_at", "is", null);

  if (error) throw error;
  return sumCompletedQuestXp((data ?? []) as UserQuestWithQuest[]);
}

async function hydrateUserXp(user: Omit<UserProfile, "total_xp"> & { total_xp?: number }): Promise<UserProfile> {
  return {
    ...user,
    total_xp: await getUserXp(user.id)
  };
}

export async function getQuests(): Promise<Quest[]> {
  if (!hasSupabaseConfig) {
    return localQuests.filter((quest) => {
      const project = localProjects.find((item) => item.id === quest.project_id);
      return quest.status !== "archived" && project?.status === "active";
    }).map((quest) => {
      const project = localProjects.find((item) => item.id === quest.project_id);
      return {
        ...quest,
        project_name: project?.name ?? quest.project_name,
        project_logo_url: project?.logo_url,
        project_type: project?.project_type,
        project_is_verified: project?.is_verified,
        project_is_featured: project?.is_featured,
        project_featured_rank: project?.featured_rank,
        project_featured_until: project?.featured_until
      };
    });
  }

  const { data, error } = await assertSupabase()
    .from("quests")
    .select("*, projects(name, status, logo_url, project_type, is_verified, is_featured, featured_rank, featured_until)")
    .neq("status", "archived")
    .eq("projects.status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((quest) => quest.projects?.status === "active")
    .map((quest) => ({
      ...quest,
      project_name: quest.projects?.name,
      project_logo_url: quest.projects?.logo_url,
      project_type: quest.projects?.project_type,
      project_is_verified: quest.projects?.is_verified,
      project_is_featured: quest.projects?.is_featured,
      project_featured_rank: quest.projects?.featured_rank,
      project_featured_until: quest.projects?.featured_until
    }));
}

export async function getQuestsByProject(projectId: string): Promise<Quest[]> {
  const quests = await getQuests();
  return quests.filter((quest) => quest.project_id === projectId);
}

export async function getProjects(): Promise<Project[]> {
  if (!hasSupabaseConfig) {
    return sortProjects(localProjects.filter((project) => project.status === "active"));
  }

  const { data, error } = await assertSupabase().from("projects").select("*").eq("status", "active").order("created_at", { ascending: false });
  if (error) throw error;
  return sortProjects((data ?? []) as Project[]);
}

export async function getAllProjectsForAdmin(walletAddress?: string | null): Promise<Project[]> {
  const context = await getAdminContext(walletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    const projects = localProjects.filter((project) => project.status !== "archived");
    if (context.is_platform_admin) return sortProjects(projects);
    return sortProjects(projects.filter((project) => context.project_ids.includes(project.id)));
  }

  const { data, error } = await assertSupabase().from("projects").select("*").neq("status", "archived").order("created_at", { ascending: false });
  if (error) throw error;
  if (context.is_platform_admin) return sortProjects((data ?? []) as Project[]);
  return sortProjects(((data ?? []) as Project[]).filter((project) => context.project_ids.includes(project.id)));
}

export async function getAdminContext(walletAddress?: string | null): Promise<AdminContext | null> {
  if (!walletAddress) return null;

  const wallet = normalizeWallet(walletAddress);
  const configuredAdmins = getConfiguredPlatformAdmins();

  if (!hasSupabaseConfig) {
    const ownedProjectIds = localProjects.filter((project) => project.owner_wallet_address === wallet).map((project) => project.id);
    const memberProjectIds = localProjectMembers.filter((member) => member.wallet_address === wallet).map((member) => member.project_id);

    return {
      wallet_address: wallet,
      is_platform_admin: configuredAdmins.includes(wallet),
      project_ids: Array.from(new Set([...ownedProjectIds, ...memberProjectIds]))
    };
  }

  const client = assertSupabase();
  const [{ data: platformAdmin, error: platformError }, { data: projects, error: projectsError }, { data: members, error: membersError }] =
    await Promise.all([
      client.from("platform_admins").select("id").eq("wallet_address", wallet).maybeSingle(),
      client.from("projects").select("id").eq("owner_wallet_address", wallet),
      client.from("project_members").select("project_id").eq("wallet_address", wallet)
    ]);

  if (platformError) throw platformError;
  if (projectsError) throw projectsError;
  if (membersError) throw membersError;

  const projectIds = [
    ...((projects ?? []).map((project) => project.id)),
    ...((members ?? []).map((member) => member.project_id))
  ];

  return {
    wallet_address: wallet,
    is_platform_admin: Boolean(platformAdmin) || configuredAdmins.includes(wallet),
    project_ids: Array.from(new Set(projectIds))
  };
}

export async function getManageableProjects(walletAddress?: string | null): Promise<Project[]> {
  return getAllProjectsForAdmin(walletAddress);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const decodedSlug = decodeURIComponent(slug);
  const normalizedSlug = slugify(decodedSlug);

  if (!hasSupabaseConfig) {
    return (
      localProjects.find(
        (project) =>
          project.status === "active" &&
          (project.slug === slug || project.slug === decodedSlug || project.id === decodedSlug || slugify(project.slug || project.name) === normalizedSlug)
      ) ?? null
    );
  }

  const client = assertSupabase();
  const slugCandidates = Array.from(new Set([slug, decodedSlug, normalizedSlug]));
  for (const candidate of slugCandidates) {
    const { data, error } = await client.from("projects").select("*").eq("status", "active").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (isUuid(decodedSlug)) {
    const { data, error } = await client.from("projects").select("*").eq("status", "active").eq("id", decodedSlug).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data: projects, error: fallbackError } = await client.from("projects").select("*").eq("status", "active");
  if (fallbackError) throw fallbackError;

  return (
    (projects ?? []).find((project) => slugify(project.slug || project.name) === normalizedSlug || slugify(project.name) === normalizedSlug) ??
    null
  );
}

export async function getProjectStats(projectId: string) {
  const quests = await getQuestsByProject(projectId);
  const availableXp = quests.reduce((total, quest) => total + quest.xp_reward, 0);

  if (!hasSupabaseConfig) {
    const questIds = new Set(quests.map((quest) => quest.id));
    const completions = localCompletions.filter((completion) => questIds.has(completion.quest_id) && completion.status === "approved" && completion.reviewed_at);
    return {
      questCount: quests.length,
      availableXp,
      approvedCount: completions.length
    };
  }

  const { data, error } = await assertSupabase()
    .from("user_quests")
    .select("id, quests!inner(project_id)")
    .eq("status", "approved")
    .not("reviewed_at", "is", null)
    .eq("quests.project_id", projectId);

  if (error) throw error;
  return {
    questCount: quests.length,
    availableXp,
    approvedCount: data?.length ?? 0
  };
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const context = await getAdminContext(input.owner_wallet_address);
  const status = context?.is_platform_admin ? input.status : "draft";
  const projectInput = {
    ...input,
    status,
    slug: slugify(input.slug || input.name),
    owner_wallet_address: input.owner_wallet_address ? normalizeWallet(input.owner_wallet_address) : null,
    logo_url: getImageUrl(input.logo_url),
    cover_image_url: getImageUrl(input.cover_image_url)
  };

  if (!hasSupabaseConfig) {
    const project = {
      id: crypto.randomUUID(),
      ...projectInput,
      is_verified: false,
      verified_at: null,
      is_featured: false,
      featured_rank: null,
      featured_until: null
    };
    localProjects = [project, ...localProjects];
    if (project.owner_wallet_address) {
      localProjectMembers = [
        {
          id: crypto.randomUUID(),
          project_id: project.id,
          wallet_address: project.owner_wallet_address,
          role: "owner"
        },
        ...localProjectMembers
      ];
    }
    return project;
  }

  const client = assertSupabase();
  const { data, error } = await client.from("projects").insert(projectInput).select("*").single();
  if (error) throw error;

  if (data.owner_wallet_address) {
    const { error: memberError } = await client.from("project_members").insert({
      project_id: data.id,
      wallet_address: data.owner_wallet_address,
      role: "owner"
    });

    if (memberError) throw memberError;
  }

  return data;
}

export async function updateProject(projectId: string, input: ProjectInput, actorWalletAddress?: string | null): Promise<Project> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, projectId)) {
    throw new Error("You do not have permission to edit this project.");
  }

  const projectInput = {
    name: input.name.trim(),
    slug: slugify(input.slug || input.name),
    description: input.description?.trim() || null,
    project_type: input.project_type,
    logo_url: getImageUrl(input.logo_url),
    cover_image_url: getImageUrl(input.cover_image_url),
    website_url: input.website_url?.trim() || null,
    discord_url: input.discord_url?.trim() || null,
    x_url: input.x_url?.trim() || null
  };

  if (!hasSupabaseConfig) {
    let updatedProject: Project | null = null;
    localProjects = localProjects.map((project) => {
      if (project.id !== projectId) return project;
      updatedProject = {
        ...project,
        ...projectInput
      };
      return updatedProject;
    });

    if (!updatedProject) {
      throw new Error("Project not found.");
    }

    return updatedProject;
  }

  const { data, error } = await assertSupabase().from("projects").update(projectInput).eq("id", projectId).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateProjectCuration(projectId: string, input: ProjectCurationInput, actorWalletAddress?: string | null): Promise<Project> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context?.is_platform_admin) {
    throw new Error("Only platform admins can curate projects.");
  }

  const curationInput = {
    is_verified: input.is_verified,
    verified_at: input.is_verified ? new Date().toISOString() : null,
    is_featured: input.is_featured,
    featured_rank: input.is_featured ? input.featured_rank : null,
    featured_until: input.is_featured ? input.featured_until || null : null
  };

  if (!hasSupabaseConfig) {
    let updatedProject: Project | null = null;
    localProjects = localProjects.map((project) => {
      if (project.id !== projectId) return project;
      updatedProject = {
        ...project,
        ...curationInput
      };
      return updatedProject;
    });

    if (!updatedProject) {
      throw new Error("Project not found.");
    }

    return updatedProject;
  }

  const { data, error } = await assertSupabase().from("projects").update(curationInput).eq("id", projectId).select("*").single();
  if (error) throw error;
  return data;
}

export async function reviewProject(projectId: string, status: "active" | "archived", actorWalletAddress?: string | null) {
  const context = await getAdminContext(actorWalletAddress);
  if (!context?.is_platform_admin) {
    throw new Error("Only platform admins can approve or reject projects.");
  }

  if (!hasSupabaseConfig) {
    localProjects = localProjects.map((project) => (project.id === projectId ? { ...project, status } : project));
    return;
  }

  const { error } = await assertSupabase().from("projects").update({ status }).eq("id", projectId);
  if (error) throw error;
}

export async function createQuest(input: QuestInput, actorWalletAddress?: string | null): Promise<Quest> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, input.project_id)) {
    throw new Error("You do not have permission to create quests for this project.");
  }

  const xpReward = clampProjectXp(input.xp_reward, input.quest_type, input.difficulty);
  const questInput = {
    ...input,
    ends_at: input.ends_at || null,
    xp_reward: xpReward,
    global_xp_reward: calculateGlobalXp(xpReward, input.quest_type, input.difficulty)
  };

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === questInput.project_id);
    if (project?.status !== "active") {
      throw new Error("Project must be approved before quests can be created.");
    }

    const quest = {
      id: crypto.randomUUID(),
      ...questInput,
      project_name: project?.name
    };
    localQuests = [quest, ...localQuests];
    return quest;
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("id, status").eq("id", questInput.project_id).single();
  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load selected project."));
  if (project.status !== "active") {
    throw new Error("Project must be approved before quests can be created.");
  }

  const { data, error } = await client.from("quests").insert(questInput).select("*, projects(name, logo_url, project_type, is_verified, is_featured, featured_rank, featured_until)").single();
  if (error) throw new Error(formatDatabaseError(error, "Failed to create quest."));
  return {
    ...data,
    project_name: data.projects?.name,
    project_logo_url: data.projects?.logo_url,
    project_type: data.projects?.project_type,
    project_is_verified: data.projects?.is_verified,
    project_is_featured: data.projects?.is_featured,
    project_featured_rank: data.projects?.featured_rank,
    project_featured_until: data.projects?.featured_until
  };
}

export async function getManageableQuests(actorWalletAddress?: string | null): Promise<Quest[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    return localQuests
      .filter((quest) => context.is_platform_admin || context.project_ids.includes(quest.project_id ?? ""))
      .map((quest) => ({
        ...quest,
        project_name: localProjects.find((project) => project.id === quest.project_id)?.name,
        project_logo_url: localProjects.find((project) => project.id === quest.project_id)?.logo_url,
        project_type: localProjects.find((project) => project.id === quest.project_id)?.project_type,
        project_is_verified: localProjects.find((project) => project.id === quest.project_id)?.is_verified,
        project_is_featured: localProjects.find((project) => project.id === quest.project_id)?.is_featured,
        project_featured_rank: localProjects.find((project) => project.id === quest.project_id)?.featured_rank,
        project_featured_until: localProjects.find((project) => project.id === quest.project_id)?.featured_until
      }));
  }

  const { data, error } = await assertSupabase()
    .from("quests")
    .select("*, projects(name, logo_url, project_type, is_verified, is_featured, featured_rank, featured_until)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? [])
    .filter((quest) => context.is_platform_admin || context.project_ids.includes(quest.project_id ?? ""))
    .map((quest) => ({
      ...quest,
      project_name: quest.projects?.name,
      project_logo_url: quest.projects?.logo_url,
      project_type: quest.projects?.project_type,
      project_is_verified: quest.projects?.is_verified,
      project_is_featured: quest.projects?.is_featured,
      project_featured_rank: quest.projects?.featured_rank,
      project_featured_until: quest.projects?.featured_until
    }));
}

export async function updateQuestStatus(questId: string, status: Quest["status"], actorWalletAddress?: string | null) {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) {
    throw new Error("Connect a project owner wallet before managing quests.");
  }

  if (!hasSupabaseConfig) {
    const quest = localQuests.find((item) => item.id === questId);
    if (!hasProjectAccess(context, quest?.project_id)) {
      throw new Error("You do not have permission to manage this quest.");
    }

    localQuests = localQuests.map((item) => (item.id === questId ? { ...item, status } : item));
    return;
  }

  const client = assertSupabase();
  const { data: quest, error: lookupError } = await client.from("quests").select("id, project_id").eq("id", questId).single();
  if (lookupError) throw lookupError;
  if (!hasProjectAccess(context, quest.project_id)) {
    throw new Error("You do not have permission to manage this quest.");
  }

  const { error } = await client.from("quests").update({ status }).eq("id", questId);
  if (error) throw error;
}

export async function getOrCreateUser(walletAddress: string): Promise<UserProfile> {
  const wallet = normalizeWallet(walletAddress);

  if (!hasSupabaseConfig) {
    const existing = localUsers.find((user) => user.wallet_address === wallet);
    if (existing) return hydrateUserXp(existing);

    const user = {
      id: crypto.randomUUID(),
      wallet_address: wallet,
      display_name: null,
      avatar_url: null,
      x_username: null,
      discord_username: null,
      bio: null,
      total_xp: 0
    };
    localUsers = [user, ...localUsers];
    return hydrateUserXp(user);
  }

  const client = assertSupabase();
  const { data: existing, error: lookupError } = await client.from("users").select("*").eq("wallet_address", wallet).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return hydrateUserXp(existing);

  const { data, error } = await client.from("users").insert({ wallet_address: wallet }).select("*").single();
  if (error) throw error;
  return hydrateUserXp(data);
}

export async function updateUserProfile(walletAddress: string, input: UserProfileInput): Promise<UserProfile> {
  const wallet = normalizeWallet(walletAddress);
  const profileInput = {
    display_name: input.display_name?.trim() || null,
    avatar_url: input.avatar_url?.trim() || null,
    x_username: input.x_username?.trim().replace(/^@/, "") || null,
    discord_username: input.discord_username?.trim() || null,
    bio: input.bio?.trim() || null
  };

  if (!hasSupabaseConfig) {
    const existing = localUsers.find((user) => user.wallet_address === wallet);
    if (!existing) {
      const user = {
        id: crypto.randomUUID(),
        wallet_address: wallet,
        ...profileInput,
        total_xp: 0
      };
      localUsers = [user, ...localUsers];
      return hydrateUserXp(user);
    }

    localUsers = localUsers.map((user) => (user.wallet_address === wallet ? { ...user, ...profileInput } : user));
    return hydrateUserXp(localUsers.find((user) => user.wallet_address === wallet) as UserProfile);
  }

  await getOrCreateUser(wallet);
  const { data, error } = await assertSupabase().from("users").update(profileInput).eq("wallet_address", wallet).select("*").single();
  if (error) throw error;
  return hydrateUserXp(data);
}

export async function getUserCompletions(userId: string): Promise<UserQuest[]> {
  if (!hasSupabaseConfig) {
    return localCompletions
      .filter((completion) => completion.user_id === userId)
      .map(normalizeSubmissionStatus)
      .map((completion) => {
        const quest = localQuests.find((item) => item.id === completion.quest_id);
        return {
          ...completion,
          quest_title: quest?.title,
          project_name: localProjects.find((project) => project.id === quest?.project_id)?.name
        };
      });
  }

  const { data, error } = await assertSupabase().from("user_quests").select("*, quests(title, projects(name))").eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as UserQuestWithQuest[])
    .map(normalizeSubmissionStatus)
    .map((completion) => ({
      ...completion,
      quest_title: completion.quests?.title,
      project_name: completion.quests?.projects?.name
    }));
}

export async function completeQuest(walletAddress: string, quest: Quest, proof: QuestSubmissionInput): Promise<UserProfile> {
  if (isQuestEnded(quest.ends_at)) {
    throw new Error("This quest has ended and no longer accepts submissions.");
  }

  const user = await getOrCreateUser(walletAddress);
  const existingCompletions = await getUserCompletions(user.id);
  const existingCompletion = existingCompletions.find((completion) => completion.quest_id === quest.id);

  if (existingCompletion?.status === "submitted" || (existingCompletion?.status === "approved" && existingCompletion.reviewed_at)) {
    return user;
  }

  if (!hasSupabaseConfig) {
    if (existingCompletion?.status === "rejected" || (existingCompletion?.status === "approved" && !existingCompletion.reviewed_at)) {
      localCompletions = localCompletions.map((completion) =>
        completion.id === existingCompletion.id
          ? {
              ...completion,
              status: "submitted",
              proof_text: proof.proof_text,
              proof_url: proof.proof_url,
              review_note: null,
              reviewed_at: null
            }
          : completion
      );
      return hydrateUserXp(localUsers.find((item) => item.id === user.id) as UserProfile);
    }

    localCompletions = [
      {
        id: crypto.randomUUID(),
        user_id: user.id,
        quest_id: quest.id,
        xp_awarded: quest.xp_reward,
        global_xp_awarded: quest.global_xp_reward,
        status: "submitted",
        proof_text: proof.proof_text,
        proof_url: proof.proof_url,
        review_note: null
      },
      ...localCompletions
    ];

    return hydrateUserXp(localUsers.find((item) => item.id === user.id) as UserProfile);
  }

  const client = assertSupabase();
  if (existingCompletion?.status === "rejected" || (existingCompletion?.status === "approved" && !existingCompletion.reviewed_at)) {
    const { error: updateError } = await client
      .from("user_quests")
      .update({
        status: "submitted",
        proof_text: proof.proof_text,
        proof_url: proof.proof_url,
        review_note: null,
        reviewed_at: null
      })
      .eq("id", existingCompletion.id);

    if (updateError) throw updateError;
    return getOrCreateUser(walletAddress);
  }

  const { error: completionError } = await client.from("user_quests").insert({
    user_id: user.id,
    quest_id: quest.id,
    xp_awarded: quest.xp_reward,
    global_xp_awarded: quest.global_xp_reward,
    status: "submitted",
    proof_text: proof.proof_text,
    proof_url: proof.proof_url,
    review_note: null
  });

  if (completionError) throw completionError;

  return getOrCreateUser(walletAddress);
}

export async function getQuestSubmissions(actorWalletAddress?: string | null): Promise<UserQuest[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || context.project_ids.length === 0) return [];

  if (!hasSupabaseConfig) {
    return localCompletions
      .filter((submission) => submission.status === "submitted" || (submission.status === "approved" && !submission.reviewed_at))
      .filter((submission) => {
        const quest = localQuests.find((item) => item.id === submission.quest_id);
        return context.project_ids.includes(quest?.project_id ?? "");
      })
      .map(normalizeSubmissionStatus)
      .map((submission) => ({
        ...submission,
        wallet_address: localUsers.find((user) => user.id === submission.user_id)?.wallet_address,
        quest_title: localQuests.find((quest) => quest.id === submission.quest_id)?.title,
        project_name: localProjects.find((project) => project.id === localQuests.find((quest) => quest.id === submission.quest_id)?.project_id)?.name
      }));
  }

  const { data, error } = await assertSupabase()
    .from("user_quests")
    .select("*, users(wallet_address, display_name, avatar_url), quests(project_id, title, projects(name))")
    .eq("status", "submitted")
    .order("completed_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as UserQuestWithQuest[])
    .filter((submission) => context.project_ids.includes(submission.quests?.project_id ?? ""))
    .map(normalizeSubmissionStatus)
    .map((submission) => ({
      ...submission,
      wallet_address: submission.users?.wallet_address,
      display_name: submission.users?.display_name,
      avatar_url: submission.users?.avatar_url,
      quest_title: submission.quests?.title,
      project_name: submission.quests?.projects?.name
    }));
}

export async function getQualifiedUsers(actorWalletAddress?: string | null, projectId?: string | null): Promise<QualifiedUser[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  const manageableProjects = await getAllProjectsForAdmin(actorWalletAddress);
  const allowedProjectIds = new Set(manageableProjects.map((project) => project.id));
  if (allowedProjectIds.size === 0) return [];
  const selectedProjectId = projectId || null;
  if (selectedProjectId && !allowedProjectIds.has(selectedProjectId)) {
    throw new Error("You do not have permission to export users for this project.");
  }

  if (!hasSupabaseConfig) {
    const rows: QualifiedUserRow[] = localCompletions
      .filter((completion) => completion.status === "approved" && completion.reviewed_at)
      .map((completion) => {
        const quest = localQuests.find((item) => item.id === completion.quest_id);
        const project = localProjects.find((item) => item.id === quest?.project_id);
        const user = localUsers.find((item) => item.id === completion.user_id);
        return {
          xp_awarded: completion.xp_awarded,
          completed_at: completion.completed_at,
          reviewed_at: completion.reviewed_at,
          users: user
            ? {
                id: user.id,
                wallet_address: user.wallet_address,
                display_name: user.display_name,
                avatar_url: user.avatar_url
              }
            : null,
          quests: quest
            ? {
                project_id: quest.project_id,
                title: quest.title,
                projects: project ? { name: project.name } : null
              }
            : null
        };
      })
      .filter((row) => allowedProjectIds.has(readJoinedObject(row.quests)?.project_id ?? ""));

    return aggregateQualifiedUsers(
      rows,
      new Map(localProjects.map((project) => [project.id, project.name])),
      selectedProjectId
    );
  }

  const { data, error } = await assertSupabase()
    .from("user_quests")
    .select("xp_awarded, completed_at, reviewed_at, users(id, wallet_address, display_name, avatar_url), quests!inner(project_id, title, projects(name))")
    .eq("status", "approved")
    .not("reviewed_at", "is", null);

  if (error) throw error;

  const rows = ((data ?? []) as QualifiedUserRow[]).filter((row) => allowedProjectIds.has(readJoinedObject(row.quests)?.project_id ?? ""));
  return aggregateQualifiedUsers(rows, new Map(manageableProjects.map((project) => [project.id, project.name])), selectedProjectId);
}

export async function reviewQuestSubmission(submissionId: string, status: "approved" | "rejected", actorWalletAddress?: string | null, reviewNote = "") {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) {
    throw new Error("Connect an admin wallet before reviewing submissions.");
  }

  if (!hasSupabaseConfig) {
    const submission = localCompletions.find((item) => item.id === submissionId);
    const quest = localQuests.find((item) => item.id === submission?.quest_id);
    if (!context.project_ids.includes(quest?.project_id ?? "")) {
      throw new Error("You do not have permission to review this submission.");
    }

    localCompletions = localCompletions.map((submission) =>
      submission.id === submissionId ? { ...submission, status, review_note: status === "rejected" ? reviewNote : null, reviewed_at: new Date().toISOString() } : submission
    );
    return;
  }

  const client = assertSupabase();
  const { data: submission, error: lookupError } = await client
    .from("user_quests")
    .select("id, quests(project_id)")
    .eq("id", submissionId)
    .single();

  if (lookupError) throw lookupError;

  const questJoin = submission.quests as { project_id?: string | null } | Array<{ project_id?: string | null }> | null;
  const projectId = Array.isArray(questJoin) ? questJoin[0]?.project_id : questJoin?.project_id;
  if (!context.project_ids.includes(projectId ?? "")) {
    throw new Error("You do not have permission to review this submission.");
  }

  const { error } = await client
    .from("user_quests")
    .update({ status, review_note: status === "rejected" ? reviewNote : null, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (error) throw error;
}

export async function getLeaderboard(): Promise<UserProfile[]> {
  if (!hasSupabaseConfig) {
    const users = await Promise.all(localUsers.map((user) => hydrateUserXp(user)));
    return users.sort((a, b) => b.total_xp - a.total_xp);
  }

  const { data, error } = await assertSupabase().from("leaderboard").select("*").order("total_xp", { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function getProjectLeaderboard(projectId: string): Promise<UserProfile[]> {
  if (!hasSupabaseConfig) {
    const projectQuestIds = new Set(localQuests.filter((quest) => quest.project_id === projectId).map((quest) => quest.id));
    return localUsers
      .map((user) => ({
        ...user,
        total_xp: localCompletions
          .filter((completion) => completion.user_id === user.id && projectQuestIds.has(completion.quest_id) && completion.status === "approved" && completion.reviewed_at)
          .reduce((total, completion) => total + completion.xp_awarded, 0)
      }))
      .filter((user) => user.total_xp > 0)
      .sort((a, b) => b.total_xp - a.total_xp);
  }

  const { data, error } = await assertSupabase()
    .from("user_quests")
    .select("xp_awarded, users(id, wallet_address, display_name, avatar_url, x_username, discord_username, bio, created_at), quests!inner(project_id)")
    .eq("status", "approved")
    .not("reviewed_at", "is", null)
    .eq("quests.project_id", projectId);

  if (error) throw error;

  const users = new Map<string, UserProfile>();
  for (const row of data ?? []) {
    const userJoin = row.users as Omit<UserProfile, "total_xp"> | Array<Omit<UserProfile, "total_xp">> | null;
    const user = Array.isArray(userJoin) ? userJoin[0] : userJoin;
    if (!user) continue;

    const existing = users.get(user.id);
    users.set(user.id, {
      ...user,
      total_xp: (existing?.total_xp ?? 0) + (row.xp_awarded ?? 0)
    });
  }

  return Array.from(users.values()).sort((a, b) => b.total_xp - a.total_xp);
}
