import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { seedCompletions, seedProjects, seedQuests, seedUsers } from "@/lib/seed-data";
import type { AdminContext, Campaign, CampaignInput, CampaignPartner, CampaignPartnerProject, Event, EventInput, EventStats, LeaderboardRank, Notification, NotificationType, Project, ProjectCurationInput, ProjectInput, ProjectMember, QualifiedUser, Quest, QuestInput, QuestSubmissionInput, UserProfile, UserProfileInput, UserQuest } from "@/lib/types";
import { getImageUrl, isQuestEnded, normalizeWallet, normalizeXUsername } from "@/lib/utils";
import { calculateGlobalXp, clampProjectXp } from "@/lib/xp-policy";

let localProjects = [...seedProjects];
let localQuests = [...seedQuests];
let localUsers = [...seedUsers];
let localCompletions = [...seedCompletions];
let localProjectMembers: ProjectMember[] = [];
let localCampaigns: Campaign[] = [];
let localCampaignPartners: CampaignPartner[] = [];
let localNotifications: Notification[] = [];
let localEvents: Event[] = [];

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

type EventWithJoins = Event & {
  projects?: {
    name: string;
    slug: string;
    logo_url?: string | null;
    project_type?: Project["project_type"];
  } | null;
  campaigns?: {
    name: string;
  } | null;
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

function toCampaignPartnerProject(project: Project): CampaignPartnerProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    logo_url: project.logo_url,
    project_type: project.project_type
  };
}

function attachCampaignPartners(campaign: Campaign, partnerProjects: CampaignPartnerProject[] = []): Campaign {
  return {
    ...campaign,
    partner_project_ids: campaign.partner_project_ids ?? partnerProjects.map((project) => project.id),
    partner_statuses: campaign.partner_statuses ?? Object.fromEntries(partnerProjects.map((project) => [project.id, "active"])),
    partner_projects: partnerProjects
  };
}

function canUseCampaignForProject(campaign: Pick<Campaign, "project_id" | "partner_project_ids">, projectId?: string | null) {
  return Boolean(projectId && (campaign.project_id === projectId || campaign.partner_project_ids?.includes(projectId)));
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

function sortLeaderboardUsers(users: UserProfile[]) {
  return [...users].sort((a, b) => {
    const xpDiff = b.total_xp - a.total_xp;
    if (xpDiff !== 0) return xpDiff;
    const completedDiff = (b.completed_quests ?? 0) - (a.completed_quests ?? 0);
    if (completedDiff !== 0) return completedDiff;
    const createdDiff = new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    if (createdDiff !== 0) return createdDiff;
    return a.wallet_address.localeCompare(b.wallet_address);
  });
}

function hydrateEventJoins(event: Event, projects = localProjects, campaigns = localCampaigns): Event {
  const project = projects.find((item) => item.id === event.project_id);
  const campaign = campaigns.find((item) => item.id === event.campaign_id);
  return {
    ...event,
    project_name: event.project_name ?? project?.name,
    project_slug: event.project_slug ?? project?.slug,
    project_logo_url: event.project_logo_url ?? project?.logo_url,
    project_type: event.project_type ?? project?.project_type,
    campaign_name: event.campaign_name ?? campaign?.name
  };
}

function mapEvent(row: EventWithJoins): Event {
  return {
    ...row,
    project_name: row.projects?.name ?? row.project_name,
    project_slug: row.projects?.slug ?? row.project_slug,
    project_logo_url: row.projects?.logo_url ?? row.project_logo_url,
    project_type: row.projects?.project_type ?? row.project_type,
    campaign_name: row.campaigns?.name ?? row.campaign_name
  };
}

function isEventVisible(event: Pick<Event, "status" | "ends_at">) {
  return event.status === "active" && (!event.ends_at || new Date(event.ends_at).getTime() > Date.now());
}

function sortEvents(events: Event[]) {
  return [...events].sort((a, b) => {
    const aFeatured = a.is_featured && isEventVisible(a);
    const bFeatured = b.is_featured && isEventVisible(b);
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
    if (aFeatured && bFeatured) {
      const rankDiff = (a.featured_rank ?? 999) - (b.featured_rank ?? 999);
      if (rankDiff !== 0) return rankDiff;
    }
    const aDate = new Date(a.starts_at ?? a.created_at ?? 0).getTime();
    const bDate = new Date(b.starts_at ?? b.created_at ?? 0).getTime();
    return bDate - aDate;
  });
}

function formatDatabaseError(error: unknown, fallback = "Something went wrong.") {
  if (!error || typeof error !== "object") return fallback;

  const maybeError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = maybeError.message ?? fallback;
  const details = maybeError.details ?? "";

  if (maybeError.code === "23505" || message.toLowerCase().includes("duplicate key")) {
    return "A quest with this title already exists in this campaign. Use a different title, or select another campaign.";
  }

  if (
    message.includes("quest_type") ||
    message.includes("campaign_id") ||
    message.includes("project_id") ||
    message.includes("slug") ||
    message.includes("difficulty") ||
    message.includes("global_xp_reward") ||
    message.includes("global_xp_awarded") ||
    message.includes("ends_at") ||
    details.includes("quest_type") ||
    details.includes("campaign_id") ||
    details.includes("project_id") ||
    details.includes("slug") ||
    details.includes("difficulty") ||
    details.includes("global_xp_reward") ||
    details.includes("global_xp_awarded") ||
    details.includes("ends_at")
  ) {
    return "Supabase is missing newer columns. Run the latest SQL migrations in the Supabase SQL editor, then try again.";
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

async function createNotification(input: {
  recipient_wallet_address?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
}) {
  if (!input.recipient_wallet_address) return;

  const notification = {
    recipient_wallet_address: normalizeWallet(input.recipient_wallet_address),
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    read_at: null
  };

  if (!hasSupabaseConfig) {
    localNotifications = [
      {
        id: crypto.randomUUID(),
        ...notification,
        created_at: new Date().toISOString()
      },
      ...localNotifications
    ];
    return;
  }

  const { error } = await assertSupabase().from("notifications").insert(notification);
  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("notifications") || error.code === "42P01") {
      console.warn("Notifications table is not ready yet.", error);
      return;
    }

    throw new Error(formatDatabaseError(error, "Failed to create notification."));
  }
}

async function createNotifications(
  recipients: Array<string | null | undefined>,
  input: Omit<Parameters<typeof createNotification>[0], "recipient_wallet_address">
) {
  const uniqueRecipients = Array.from(new Set(recipients.filter(Boolean).map((wallet) => normalizeWallet(wallet as string))));
  await Promise.all(uniqueRecipients.map((wallet) => createNotification({ ...input, recipient_wallet_address: wallet })));
}

async function getProjectNotificationRecipients(projectId?: string | null) {
  if (!projectId) return [];

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === projectId);
    const memberWallets = localProjectMembers.filter((member) => member.project_id === projectId).map((member) => member.wallet_address);
    return [project?.owner_wallet_address, ...memberWallets].filter(Boolean) as string[];
  }

  const client = assertSupabase();
  const [{ data: project, error: projectError }, { data: members, error: memberError }] = await Promise.all([
    client.from("projects").select("owner_wallet_address").eq("id", projectId).maybeSingle(),
    client.from("project_members").select("wallet_address").eq("project_id", projectId)
  ]);

  if (projectError) throw projectError;
  if (memberError) throw memberError;

  return [project?.owner_wallet_address, ...(members ?? []).map((member) => member.wallet_address)].filter(Boolean) as string[];
}

async function notifyProjectSubmission(user: UserProfile, quest: Quest) {
  const recipients = await getProjectNotificationRecipients(quest.project_id);
  await createNotifications(recipients, {
    type: "submission_created",
    title: "New quest submission",
    body: `${user.display_name || shortWallet(user.wallet_address)} submitted "${quest.title}".`,
    href: "/admin?tab=submissions"
  });
}

function shortWallet(walletAddress: string) {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
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
      return quest.status === "active" && !isQuestEnded(quest.ends_at) && project?.status === "active";
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
    .eq("status", "active")
    .eq("projects.status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((quest) => quest.projects?.status === "active" && !isQuestEnded(quest.ends_at))
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
  if (!hasSupabaseConfig) {
    return localQuests
      .filter((quest) => {
        const project = localProjects.find((item) => item.id === quest.project_id);
        return quest.project_id === projectId && quest.status !== "archived" && project?.status === "active";
      })
      .map((quest) => {
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
    .eq("project_id", projectId)
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

export async function getQuestsByCampaign(campaignId: string): Promise<Quest[]> {
  if (!hasSupabaseConfig) {
    return localQuests
      .filter((quest) => {
        const project = localProjects.find((item) => item.id === quest.project_id);
        return quest.campaign_id === campaignId && quest.status !== "archived" && project?.status === "active";
      })
      .map((quest) => {
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
    .eq("campaign_id", campaignId)
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
    telegram_url: input.telegram_url?.trim() || null,
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

type CampaignPartnerWithProject = CampaignPartner & {
  projects?: {
    name: string;
    slug: string;
    logo_url?: string | null;
    project_type?: Project["project_type"];
  } | null;
};

function mapCampaignPartner(row: CampaignPartnerWithProject): CampaignPartner {
  return {
    ...row,
    project_name: row.projects?.name,
    project_slug: row.projects?.slug,
    project_logo_url: row.projects?.logo_url,
    project_type: row.projects?.project_type
  };
}

async function getCampaignPartnersForCampaignIds(campaignIds: string[]): Promise<Map<string, CampaignPartner[]>> {
  const rowsByCampaign = new Map<string, CampaignPartner[]>();
  if (campaignIds.length === 0) return rowsByCampaign;

  if (!hasSupabaseConfig) {
    const projectsById = new Map(localProjects.map((project) => [project.id, project]));
    for (const partner of localCampaignPartners.filter((item) => campaignIds.includes(item.campaign_id))) {
      const project = projectsById.get(partner.project_id);
      const mapped = {
        ...partner,
        project_name: project?.name,
        project_slug: project?.slug,
        project_logo_url: project?.logo_url,
        project_type: project?.project_type
      };
      rowsByCampaign.set(partner.campaign_id, [...(rowsByCampaign.get(partner.campaign_id) ?? []), mapped]);
    }
    return rowsByCampaign;
  }

  const { data, error } = await assertSupabase()
    .from("campaign_partners")
    .select("*, projects(name, slug, logo_url, project_type)")
    .in("campaign_id", campaignIds);

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("campaign_partners") || error.code === "42P01") return rowsByCampaign;
    throw new Error(formatDatabaseError(error, "Failed to load campaign partners."));
  }

  for (const row of ((data ?? []) as CampaignPartnerWithProject[]).map(mapCampaignPartner)) {
    rowsByCampaign.set(row.campaign_id, [...(rowsByCampaign.get(row.campaign_id) ?? []), row]);
  }
  return rowsByCampaign;
}

export async function getCampaignPartners(campaignId: string): Promise<CampaignPartnerProject[]> {
  const rows = await getCampaignPartnersForCampaignIds([campaignId]);
  return (rows.get(campaignId) ?? []).filter((partner) => partner.status === "active").map((partner) => ({
    id: partner.project_id,
    name: partner.project_name ?? "Partner project",
    slug: partner.project_slug ?? partner.project_id,
    logo_url: partner.project_logo_url ?? null,
    project_type: partner.project_type ?? "Other"
  }));
}

async function attachPartnersToEvents(events: Event[]): Promise<Event[]> {
  const partnersByCampaign = await getCampaignPartnersForCampaignIds(events.map((event) => event.campaign_id));
  return events.map((event) => ({
    ...event,
    partner_projects: (partnersByCampaign.get(event.campaign_id) ?? []).filter((partner) => partner.status === "active").map((partner) => ({
      id: partner.project_id,
      name: partner.project_name ?? "Partner project",
      slug: partner.project_slug ?? partner.project_id,
      logo_url: partner.project_logo_url ?? null,
      project_type: partner.project_type ?? "Other"
    }))
  }));
}

export async function getManageableCampaigns(actorWalletAddress?: string | null): Promise<Campaign[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    const partnersByCampaign = await getCampaignPartnersForCampaignIds(localCampaigns.map((campaign) => campaign.id));
    return localCampaigns
      .map((campaign) => {
        const partners = partnersByCampaign.get(campaign.id) ?? [];
        const activePartnerIds = partners.filter((partner) => partner.status === "active").map((partner) => partner.project_id);
        return attachCampaignPartners(
          {
            ...campaign,
            project_name: localProjects.find((project) => project.id === campaign.project_id)?.name,
            partner_project_ids: activePartnerIds,
            partner_statuses: Object.fromEntries(partners.map((partner) => [partner.project_id, partner.status]))
          },
          partners
            .map((partner) => localProjects.find((project) => project.id === partner.project_id))
            .filter((project): project is Project => Boolean(project))
            .map(toCampaignPartnerProject)
        );
      })
      .filter((campaign) => {
        const partners = partnersByCampaign.get(campaign.id) ?? [];
        return context.is_platform_admin || context.project_ids.includes(campaign.project_id ?? "") || partners.some((partner) => context.project_ids.includes(partner.project_id));
      })
      .map((campaign) => ({
        ...campaign
      }))
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  }

  const manageableProjects = await getAllProjectsForAdmin(actorWalletAddress);
  const projectNames = new Map(manageableProjects.map((project) => [project.id, project.name]));

  const { data, error } = await assertSupabase()
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(formatDatabaseError(error, "Failed to load campaigns."));
  const partnerRows = await getCampaignPartnersForCampaignIds(((data ?? []) as Campaign[]).map((campaign) => campaign.id));
  return ((data ?? []) as Campaign[])
    .map((campaign) => ({
      ...campaign,
      project_name: projectNames.get(campaign.project_id ?? "")
    }))
    .map((campaign) => {
      const partners = partnerRows.get(campaign.id) ?? [];
      const activePartnerIds = partners.filter((partner) => partner.status === "active").map((partner) => partner.project_id);
      return attachCampaignPartners(
        { ...campaign, partner_project_ids: activePartnerIds, partner_statuses: Object.fromEntries(partners.map((partner) => [partner.project_id, partner.status])) },
        partners.map((partner) => ({
          id: partner.project_id,
          name: partner.project_name ?? "Partner project",
          slug: partner.project_slug ?? partner.project_id,
          logo_url: partner.project_logo_url ?? null,
          project_type: partner.project_type ?? "Other"
        }))
      );
    })
    .filter((campaign) => {
      const partners = partnerRows.get(campaign.id) ?? [];
      return context.is_platform_admin || context.project_ids.includes(campaign.project_id ?? "") || partners.some((partner) => context.project_ids.includes(partner.project_id));
    });
}

export async function createCampaign(input: CampaignInput, actorWalletAddress?: string | null): Promise<Campaign> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, input.project_id)) {
    throw new Error("You do not have permission to create campaigns for this project.");
  }

  const campaignInput = {
    ...input,
    slug: slugify(input.slug || input.name),
    description: input.description?.trim() || null,
    purpose: input.purpose?.trim() || null,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null
  };

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === campaignInput.project_id);
    if (project?.status !== "active") {
      throw new Error("Project must be approved before campaigns can be created.");
    }

    const campaign = {
      id: crypto.randomUUID(),
      ...campaignInput,
      project_name: project?.name,
      created_at: new Date().toISOString()
    };
    localCampaigns = [campaign, ...localCampaigns];
    return campaign;
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("id, status").eq("id", campaignInput.project_id).single();
  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load selected project."));
  if (project.status !== "active") {
    throw new Error("Project must be approved before campaigns can be created.");
  }

  const { data, error } = await client.from("campaigns").insert(campaignInput).select("*").single();
  if (error) throw new Error(formatDatabaseError(error, "Failed to create campaign."));
  return {
    ...data,
    project_name: (await getAllProjectsForAdmin(actorWalletAddress)).find((item) => item.id === data.project_id)?.name
  };
}

export async function addCampaignPartner(campaignId: string, projectId: string, actorWalletAddress?: string | null): Promise<CampaignPartner> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) throw new Error("Connect a project owner wallet before adding campaign partners.");

  if (!hasSupabaseConfig) {
    const campaign = localCampaigns.find((item) => item.id === campaignId);
    const project = localProjects.find((item) => item.id === projectId);
    if (!campaign) throw new Error("Campaign not found.");
    if (!hasProjectAccess(context, campaign.project_id)) throw new Error("Only the campaign owner can add partner projects.");
    if (!project || project.status !== "active") throw new Error("Partner project must be approved before it can join a campaign.");
    if (campaign.project_id === projectId) throw new Error("Primary project is already the campaign owner.");
    const existing = localCampaignPartners.find((partner) => partner.campaign_id === campaignId && partner.project_id === projectId);
    if (existing) return existing;

    const partner: CampaignPartner = {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      project_id: projectId,
      role: "partner",
      status: "draft",
      created_at: new Date().toISOString(),
      project_name: project.name,
      project_slug: project.slug,
      project_logo_url: project.logo_url,
      project_type: project.project_type
    };
    localCampaignPartners = [partner, ...localCampaignPartners];
    return partner;
  }

  const client = assertSupabase();
  const [{ data: campaign, error: campaignError }, { data: project, error: projectError }] = await Promise.all([
    client.from("campaigns").select("id, project_id").eq("id", campaignId).single(),
    client.from("projects").select("id, status").eq("id", projectId).single()
  ]);

  if (campaignError) throw new Error(formatDatabaseError(campaignError, "Failed to load selected campaign."));
  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load partner project."));
  if (!hasProjectAccess(context, campaign.project_id)) throw new Error("Only the campaign owner can add partner projects.");
  if (project.status !== "active") throw new Error("Partner project must be approved before it can join a campaign.");
  if (campaign.project_id === projectId) throw new Error("Primary project is already the campaign owner.");

  const { data, error } = await client
    .from("campaign_partners")
    .upsert({ campaign_id: campaignId, project_id: projectId, role: "partner", status: "draft" }, { onConflict: "campaign_id,project_id" })
    .select("*, projects(name, slug, logo_url, project_type)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to add campaign partner. Run supabase/campaign-partners.sql in Supabase first."));
  return mapCampaignPartner(data as CampaignPartnerWithProject);
}

export async function reviewCampaignPartner(campaignId: string, projectId: string, status: "active" | "archived", actorWalletAddress?: string | null): Promise<CampaignPartner> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, projectId)) {
    throw new Error("Only the partner project owner can accept or reject this collab invite.");
  }

  if (!hasSupabaseConfig) {
    let updatedPartner: CampaignPartner | null = null;
    localCampaignPartners = localCampaignPartners.map((partner) => {
      if (partner.campaign_id !== campaignId || partner.project_id !== projectId) return partner;
      const project = localProjects.find((item) => item.id === projectId);
      updatedPartner = {
        ...partner,
        status,
        project_name: project?.name,
        project_slug: project?.slug,
        project_logo_url: project?.logo_url,
        project_type: project?.project_type
      };
      return updatedPartner;
    });
    if (!updatedPartner) throw new Error("Campaign partner invite not found.");
    return updatedPartner;
  }

  const { data, error } = await assertSupabase()
    .from("campaign_partners")
    .update({ status })
    .eq("campaign_id", campaignId)
    .eq("project_id", projectId)
    .select("*, projects(name, slug, logo_url, project_type)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to update campaign partner invite."));
  return mapCampaignPartner(data as CampaignPartnerWithProject);
}

export async function removeCampaignPartner(campaignId: string, projectId: string, actorWalletAddress?: string | null) {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) throw new Error("Connect a project owner wallet before removing campaign partners.");

  if (!hasSupabaseConfig) {
    const campaign = localCampaigns.find((item) => item.id === campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    if (!hasProjectAccess(context, campaign.project_id)) throw new Error("Only the campaign owner can remove partner projects.");
    localCampaignPartners = localCampaignPartners.filter((partner) => !(partner.campaign_id === campaignId && partner.project_id === projectId));
    return;
  }

  const client = assertSupabase();
  const { data: campaign, error: campaignError } = await client.from("campaigns").select("id, project_id").eq("id", campaignId).single();
  if (campaignError) throw new Error(formatDatabaseError(campaignError, "Failed to load selected campaign."));
  if (!hasProjectAccess(context, campaign.project_id)) throw new Error("Only the campaign owner can remove partner projects.");

  const { error } = await client.from("campaign_partners").delete().eq("campaign_id", campaignId).eq("project_id", projectId);
  if (error) throw new Error(formatDatabaseError(error, "Failed to remove campaign partner."));
}

export async function getEvents(limit = 6): Promise<Event[]> {
  if (!hasSupabaseConfig) {
    return attachPartnersToEvents(sortEvents(localEvents.map((event) => hydrateEventJoins(event)).filter(isEventVisible)).slice(0, limit));
  }

  const { data, error } = await assertSupabase()
    .from("events")
    .select("*, projects(name, slug, logo_url, project_type), campaigns(name)")
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("featured_rank", { ascending: true })
    .order("starts_at", { ascending: false })
    .limit(limit);

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("events") || error.code === "42P01") return [];
    throw new Error(formatDatabaseError(error, "Failed to load events."));
  }

  return attachPartnersToEvents(sortEvents(((data ?? []) as EventWithJoins[]).map(mapEvent).filter(isEventVisible)));
}

export async function getManageableEvents(actorWalletAddress?: string | null): Promise<Event[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    const eventsWithPartners = await attachPartnersToEvents(localEvents.map((event) => hydrateEventJoins(event)));
    return sortEvents(
      eventsWithPartners.filter((event) => context.is_platform_admin || context.project_ids.includes(event.project_id) || event.partner_projects?.some((project) => context.project_ids.includes(project.id)))
    );
  }

  const { data, error } = await assertSupabase()
    .from("events")
    .select("*, projects(name, slug, logo_url, project_type), campaigns(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(formatDatabaseError(error, "Failed to load events."));
  const eventsWithPartners = await attachPartnersToEvents(((data ?? []) as EventWithJoins[]).map(mapEvent));
  return sortEvents(eventsWithPartners.filter((event) => context.is_platform_admin || context.project_ids.includes(event.project_id) || event.partner_projects?.some((project) => context.project_ids.includes(project.id))));
}

export async function createEvent(input: EventInput, actorWalletAddress?: string | null): Promise<Event> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, input.project_id)) {
    throw new Error("You do not have permission to create events for this project.");
  }

  const eventInput = {
    ...input,
    slug: slugify(input.slug || input.name),
    description: input.description?.trim() || null,
    prize_pool: input.prize_pool?.trim() || null,
    prize_currency: input.prize_currency?.trim() || null,
    rules: input.rules?.trim() || null,
    cover_image_url: getImageUrl(input.cover_image_url) || null,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    featured_rank: input.is_featured ? input.featured_rank : null
  };

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === eventInput.project_id);
    const campaign = localCampaigns.find((item) => item.id === eventInput.campaign_id);
    if (project?.status !== "active") throw new Error("Project must be approved before events can be created.");
    if (!campaign || campaign.project_id !== eventInput.project_id) throw new Error("Selected campaign does not belong to this project.");

    const event = hydrateEventJoins({
      id: crypto.randomUUID(),
      ...eventInput,
      created_at: new Date().toISOString()
    });
    localEvents = [event, ...localEvents];
    return event;
  }

  const client = assertSupabase();
  const [{ data: project, error: projectError }, { data: campaign, error: campaignError }] = await Promise.all([
    client.from("projects").select("id, status").eq("id", eventInput.project_id).single(),
    client.from("campaigns").select("id, project_id").eq("id", eventInput.campaign_id).single()
  ]);

  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load selected project."));
  if (campaignError) throw new Error(formatDatabaseError(campaignError, "Failed to load selected campaign."));
  if (project.status !== "active") throw new Error("Project must be approved before events can be created.");
  if (campaign.project_id !== eventInput.project_id) throw new Error("Selected campaign does not belong to this project.");

  const { data, error } = await client.from("events").insert(eventInput).select("*, projects(name, slug, logo_url, project_type), campaigns(name)").single();
  if (error) throw new Error(formatDatabaseError(error, "Failed to create event."));
  return mapEvent(data as EventWithJoins);
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const normalizedSlug = decodeURIComponent(slug).trim().toLowerCase();
  if (!normalizedSlug) return null;

  if (!hasSupabaseConfig) {
    const event = localEvents.find((item) => item.slug === normalizedSlug || item.id === normalizedSlug);
    if (!event) return null;
    const [withPartners] = await attachPartnersToEvents([hydrateEventJoins(event)]);
    return withPartners;
  }

  const { data, error } = await assertSupabase()
    .from("events")
    .select("*, projects(name, slug, logo_url, project_type), campaigns(name)")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const [withPartners] = await attachPartnersToEvents([mapEvent(data as EventWithJoins)]);
  return withPartners;
}

export async function getEventStats(eventId: string): Promise<EventStats> {
  const event = !hasSupabaseConfig ? localEvents.find((item) => item.id === eventId) : await getEventRecord(eventId);
  if (!event) return { questCount: 0, participantCount: 0, approvedCount: 0, totalXp: 0 };

  if (!hasSupabaseConfig) {
    const eventQuestIds = new Set(localQuests.filter((quest) => quest.campaign_id === event.campaign_id).map((quest) => quest.id));
    const approved = localCompletions.filter((completion) => eventQuestIds.has(completion.quest_id) && completion.status === "approved" && completion.reviewed_at);
    return {
      questCount: eventQuestIds.size,
      participantCount: new Set(approved.map((completion) => completion.user_id)).size,
      approvedCount: approved.length,
      totalXp: approved.reduce((total, completion) => total + completion.xp_awarded, 0)
    };
  }

  const client = assertSupabase();
  const [{ data: quests, error: questError }, { data: completions, error: completionError }] = await Promise.all([
    client.from("quests").select("id").eq("campaign_id", event.campaign_id).neq("status", "archived"),
    client.from("user_quests").select("user_id, xp_awarded, quests!inner(campaign_id)").eq("status", "approved").not("reviewed_at", "is", null).eq("quests.campaign_id", event.campaign_id)
  ]);

  if (questError) throw questError;
  if (completionError) throw completionError;

  const rows = (completions ?? []) as Array<{ user_id: string; xp_awarded: number }>;
  return {
    questCount: quests?.length ?? 0,
    participantCount: new Set(rows.map((row) => row.user_id)).size,
    approvedCount: rows.length,
    totalXp: rows.reduce((total, row) => total + (row.xp_awarded ?? 0), 0)
  };
}

async function getEventRecord(eventId: string): Promise<Event | null> {
  const { data, error } = await assertSupabase().from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  return data as Event | null;
}

export async function getEventLeaderboard(eventId: string, limit = 50): Promise<UserProfile[]> {
  const event = !hasSupabaseConfig ? localEvents.find((item) => item.id === eventId) : await getEventRecord(eventId);
  if (!event) return [];

  if (!hasSupabaseConfig) {
    const eventQuestIds = new Set(localQuests.filter((quest) => quest.campaign_id === event.campaign_id).map((quest) => quest.id));
    const rows = new Map<string, UserProfile>();
    for (const completion of localCompletions.filter((item) => eventQuestIds.has(item.quest_id) && item.status === "approved" && item.reviewed_at)) {
      const user = localUsers.find((item) => item.id === completion.user_id);
      if (!user) continue;
      const existing = rows.get(user.id);
      rows.set(user.id, {
        ...user,
        total_xp: (existing?.total_xp ?? 0) + completion.xp_awarded,
        completed_quests: (existing?.completed_quests ?? 0) + 1
      });
    }
    return Array.from(rows.values()).sort((a, b) => b.total_xp - a.total_xp).slice(0, limit);
  }

  const { data, error } = await assertSupabase()
    .from("user_quests")
    .select("xp_awarded, users(id, wallet_address, display_name, avatar_url, x_username, discord_username, bio, created_at), quests!inner(campaign_id)")
    .eq("status", "approved")
    .not("reviewed_at", "is", null)
    .eq("quests.campaign_id", event.campaign_id);

  if (error) throw error;

  type EventLeaderboardRow = {
    xp_awarded: number;
    users:
      | {
          id: string;
          wallet_address: string;
          display_name: string | null;
          avatar_url: string | null;
          x_username: string | null;
          discord_username: string | null;
          bio: string | null;
          created_at?: string;
        }
      | Array<{
          id: string;
          wallet_address: string;
          display_name: string | null;
          avatar_url: string | null;
          x_username: string | null;
          discord_username: string | null;
          bio: string | null;
          created_at?: string;
        }>
      | null;
  };

  const rows = new Map<string, UserProfile>();
  for (const row of (data ?? []) as unknown as EventLeaderboardRow[]) {
    const user = readJoinedObject(row.users);
    if (!user) continue;
    const existing = rows.get(user.id);
    rows.set(user.id, {
      ...user,
      total_xp: (existing?.total_xp ?? 0) + (row.xp_awarded ?? 0),
      completed_quests: (existing?.completed_quests ?? 0) + 1
    });
  }

  return Array.from(rows.values()).sort((a, b) => b.total_xp - a.total_xp).slice(0, limit);
}

export async function reviewProject(projectId: string, status: "active" | "archived", actorWalletAddress?: string | null) {
  const context = await getAdminContext(actorWalletAddress);
  if (!context?.is_platform_admin) {
    throw new Error("Only platform admins can approve or reject projects.");
  }

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === projectId);
    localProjects = localProjects.map((project) => (project.id === projectId ? { ...project, status } : project));
    await createNotification({
      recipient_wallet_address: project?.owner_wallet_address,
      type: status === "active" ? "project_approved" : "project_rejected",
      title: status === "active" ? "Project approved" : "Project rejected",
      body: status === "active" ? `Your project "${project?.name ?? "project"}" is now live.` : `Your project "${project?.name ?? "project"}" was rejected by Questora review.`,
      href: "/admin?tab=projects"
    });
    return;
  }

  const client = assertSupabase();
  const { data: project, error: lookupError } = await client.from("projects").select("name, owner_wallet_address").eq("id", projectId).maybeSingle();
  if (lookupError) throw lookupError;

  const { error } = await client.from("projects").update({ status }).eq("id", projectId);
  if (error) throw error;

  await createNotification({
    recipient_wallet_address: project?.owner_wallet_address,
    type: status === "active" ? "project_approved" : "project_rejected",
    title: status === "active" ? "Project approved" : "Project rejected",
    body: status === "active" ? `Your project "${project?.name ?? "project"}" is now live.` : `Your project "${project?.name ?? "project"}" was rejected by Questora review.`,
    href: "/admin?tab=projects"
  });
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
    const campaign = questInput.campaign_id ? localCampaigns.find((item) => item.id === questInput.campaign_id) : null;
    if (questInput.campaign_id) {
      const partnerProjectIds = localCampaignPartners.filter((partner) => partner.campaign_id === questInput.campaign_id && partner.status === "active").map((partner) => partner.project_id);
      if (!campaign || !canUseCampaignForProject({ ...campaign, partner_project_ids: partnerProjectIds }, questInput.project_id)) {
        throw new Error("Selected campaign is not available for this project.");
      }
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
  if (questInput.campaign_id) {
    const { data: campaign, error: campaignError } = await client
      .from("campaigns")
      .select("id, project_id")
      .eq("id", questInput.campaign_id)
      .single();

    if (campaignError) throw new Error(formatDatabaseError(campaignError, "Failed to load selected campaign."));
    const partners = await getCampaignPartnersForCampaignIds([questInput.campaign_id]);
    const partnerProjectIds = (partners.get(questInput.campaign_id) ?? []).filter((partner) => partner.status === "active").map((partner) => partner.project_id);
    if (!canUseCampaignForProject({ ...campaign, partner_project_ids: partnerProjectIds }, questInput.project_id)) {
      throw new Error("Selected campaign is not available for this project.");
    }
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
    x_username: normalizeXUsername(input.x_username) || null,
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

export async function getUserProfileByIdentifier(identifier: string): Promise<UserProfile | null> {
  const decodedIdentifier = decodeURIComponent(identifier).trim();
  if (!decodedIdentifier) return null;

  const normalizedIdentifier = decodedIdentifier.toLowerCase().replace(/^@/, "");
  const normalizedXIdentifier = normalizeXUsername(decodedIdentifier);
  const isWallet = normalizedIdentifier.startsWith("0x");

  if (!hasSupabaseConfig) {
    const user =
      localUsers.find((item) => item.wallet_address === normalizedIdentifier) ??
      localUsers.find((item) => normalizeXUsername(item.x_username) === normalizedXIdentifier) ??
      null;
    return user ? hydrateUserXp(user) : null;
  }

  const client = assertSupabase();
  if (isWallet) {
    const { data, error } = await client.from("users").select("*").eq("wallet_address", normalizedIdentifier).maybeSingle();
    if (error) throw error;
    return data ? hydrateUserXp(data) : null;
  }

  const usernameCandidates = [
    normalizedXIdentifier,
    `https://x.com/${normalizedXIdentifier}`,
    `https://twitter.com/${normalizedXIdentifier}`,
    `https://www.x.com/${normalizedXIdentifier}`,
    `https://www.twitter.com/${normalizedXIdentifier}`
  ].filter(Boolean);

  for (const candidate of usernameCandidates) {
    const { data, error } = await client.from("users").select("*").ilike("x_username", candidate).maybeSingle();
    if (error) throw error;
    if (data) return hydrateUserXp(data);
  }

  return null;
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

export async function getNotifications(walletAddress?: string | null): Promise<Notification[]> {
  if (!walletAddress) return [];
  const wallet = normalizeWallet(walletAddress);

  if (!hasSupabaseConfig) {
    return localNotifications
      .filter((notification) => notification.recipient_wallet_address === wallet)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  const { data, error } = await assertSupabase()
    .from("notifications")
    .select("*")
    .eq("recipient_wallet_address", wallet)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("notifications") || error.code === "42P01") return [];
    throw error;
  }

  return (data ?? []) as Notification[];
}

export async function getUnreadNotificationCount(walletAddress?: string | null): Promise<number> {
  if (!walletAddress) return 0;
  const wallet = normalizeWallet(walletAddress);

  if (!hasSupabaseConfig) {
    return localNotifications.filter((notification) => notification.recipient_wallet_address === wallet && !notification.read_at).length;
  }

  const { count, error } = await assertSupabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_wallet_address", wallet)
    .is("read_at", null);

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("notifications") || error.code === "42P01") return 0;
    throw error;
  }

  return count ?? 0;
}

export async function markNotificationRead(notificationId: string, walletAddress?: string | null) {
  if (!walletAddress) return;
  const wallet = normalizeWallet(walletAddress);
  const readAt = new Date().toISOString();

  if (!hasSupabaseConfig) {
    localNotifications = localNotifications.map((notification) =>
      notification.id === notificationId && notification.recipient_wallet_address === wallet ? { ...notification, read_at: notification.read_at ?? readAt } : notification
    );
    return;
  }

  const { error } = await assertSupabase()
    .from("notifications")
    .update({ read_at: readAt })
    .eq("id", notificationId)
    .eq("recipient_wallet_address", wallet);

  if (error) throw error;
}

export async function markAllNotificationsRead(walletAddress?: string | null) {
  if (!walletAddress) return;
  const wallet = normalizeWallet(walletAddress);
  const readAt = new Date().toISOString();

  if (!hasSupabaseConfig) {
    localNotifications = localNotifications.map((notification) =>
      notification.recipient_wallet_address === wallet && !notification.read_at ? { ...notification, read_at: readAt } : notification
    );
    return;
  }

  const { error } = await assertSupabase()
    .from("notifications")
    .update({ read_at: readAt })
    .eq("recipient_wallet_address", wallet)
    .is("read_at", null);

  if (error) throw error;
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
      await notifyProjectSubmission(user, quest);
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

    await notifyProjectSubmission(user, quest);
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
    await notifyProjectSubmission(user, quest);
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

  await notifyProjectSubmission(user, quest);
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
    const user = localUsers.find((item) => item.id === submission?.user_id);
    if (!context.project_ids.includes(quest?.project_id ?? "")) {
      throw new Error("You do not have permission to review this submission.");
    }

    localCompletions = localCompletions.map((submission) =>
      submission.id === submissionId ? { ...submission, status, review_note: status === "rejected" ? reviewNote : null, reviewed_at: new Date().toISOString() } : submission
    );
    await createNotification({
      recipient_wallet_address: user?.wallet_address,
      type: status === "approved" ? "submission_approved" : "submission_rejected",
      title: status === "approved" ? "Quest approved" : "Quest rejected",
      body: status === "approved" ? `Your "${quest?.title ?? "quest"}" submission was approved.` : `Your "${quest?.title ?? "quest"}" submission was rejected.`,
      href: "/profile"
    });
    return;
  }

  const client = assertSupabase();
  const { data: submission, error: lookupError } = await client
    .from("user_quests")
    .select("id, user_id, quest_id")
    .eq("id", submissionId)
    .single();

  if (lookupError) throw lookupError;

  const [{ data: quest, error: questError }, { data: user, error: userError }] = await Promise.all([
    client.from("quests").select("project_id, title").eq("id", submission.quest_id).single(),
    client.from("users").select("wallet_address").eq("id", submission.user_id).single()
  ]);

  if (questError) throw questError;
  if (userError) throw userError;

  const projectId = quest.project_id;
  const questTitle = quest.title;
  if (!context.project_ids.includes(projectId ?? "")) {
    throw new Error("You do not have permission to review this submission.");
  }

  const { error } = await client
    .from("user_quests")
    .update({ status, review_note: status === "rejected" ? reviewNote : null, reviewed_at: new Date().toISOString() })
    .eq("id", submissionId);

  if (error) throw error;

  await createNotification({
    recipient_wallet_address: user.wallet_address,
    type: status === "approved" ? "submission_approved" : "submission_rejected",
    title: status === "approved" ? "Quest approved" : "Quest rejected",
    body: status === "approved" ? `Your "${questTitle ?? "quest"}" submission was approved.` : `Your "${questTitle ?? "quest"}" submission was rejected.`,
    href: "/profile"
  });
}

export async function getLeaderboard(limit = 50): Promise<UserProfile[]> {
  if (!hasSupabaseConfig) {
    const users = await Promise.all(localUsers.map((user) => hydrateUserXp(user)));
    return sortLeaderboardUsers(users).slice(0, limit);
  }

  const { data, error } = await assertSupabase()
    .from("leaderboard")
    .select("*")
    .order("total_xp", { ascending: false })
    .order("completed_quests", { ascending: false })
    .order("created_at", { ascending: true })
    .order("wallet_address", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getUserLeaderboardRank(walletAddress?: string | null): Promise<LeaderboardRank | null> {
  if (!walletAddress) return null;
  const wallet = normalizeWallet(walletAddress);

  if (!hasSupabaseConfig) {
    const users = sortLeaderboardUsers(await Promise.all(localUsers.map((user) => hydrateUserXp(user))));
    const index = users.findIndex((user) => user.wallet_address === wallet);
    if (index === -1) return null;
    return {
      rank: index + 1,
      user: users[index]
    };
  }

  const { data, error } = await assertSupabase()
    .from("leaderboard")
    .select("*")
    .order("total_xp", { ascending: false })
    .order("completed_quests", { ascending: false })
    .order("created_at", { ascending: true })
    .order("wallet_address", { ascending: true });

  if (error) throw error;
  const users = (data ?? []) as UserProfile[];
  const index = users.findIndex((user) => user.wallet_address === wallet);
  if (index === -1) return null;

  return {
    rank: index + 1,
    user: users[index]
  };
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
