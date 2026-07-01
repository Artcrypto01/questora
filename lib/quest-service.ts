import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import { seedCompletions, seedProjects, seedQuests, seedUsers } from "@/lib/seed-data";
import type { AdminContext, Campaign, CampaignInput, CampaignPartner, CampaignPartnerProject, Event, EventInput, EventStats, LeaderboardRank, Notification, NotificationType, Project, ProjectCurationInput, ProjectInput, ProjectLaunch, ProjectLaunchInput, ProjectMember, ProjectVerificationRequest, QualifiedUser, Quest, QuestInput, QuestSubmissionInput, UserProfile, UserProfileInput, UserQuest } from "@/lib/types";
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
let localLaunches: ProjectLaunch[] = [];
let localVerificationRequests: ProjectVerificationRequest[] = [];

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
    status?: Quest["status"] | null;
    ends_at?: string | null;
  } | null;
};

type LaunchWithJoins = ProjectLaunch & {
  projects?: {
    name: string;
    slug: string;
    logo_url?: string | null;
    project_type?: Project["project_type"];
    is_verified?: boolean;
  } | null;
  campaigns?: {
    name: string;
  } | null;
};

type QuestWithJoins = Quest & {
  projects?: {
    name?: string | null;
    status?: string | null;
    logo_url?: string | null;
    project_type?: Project["project_type"] | null;
    is_verified?: boolean | null;
    is_featured?: boolean | null;
    featured_rank?: number | null;
    featured_until?: string | null;
  } | null;
  campaigns?: {
    status?: Quest["status"] | null;
    ends_at?: string | null;
  } | null;
};

type ProjectMemberWithProject = ProjectMember & {
  projects?: {
    name: string;
    slug: string;
    logo_url?: string | null;
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

function isQuestVisibleForDashboard(quest: Pick<Quest, "status" | "campaign_id" | "ends_at" | "campaign_status">) {
  if (quest.status !== "active") return false;
  if (quest.campaign_id && quest.campaign_status !== "active") return false;
  return !isQuestEnded(quest.ends_at);
}

function hydrateQuestJoins(quest: QuestWithJoins): Quest {
  return {
    ...quest,
    project_name: quest.projects?.name ?? quest.project_name,
    project_logo_url: quest.projects?.logo_url ?? quest.project_logo_url,
    project_type: quest.projects?.project_type ?? quest.project_type,
    project_is_verified: quest.projects?.is_verified ?? quest.project_is_verified,
    project_is_featured: quest.projects?.is_featured ?? quest.project_is_featured,
    project_featured_rank: quest.projects?.featured_rank ?? quest.project_featured_rank,
    project_featured_until: quest.projects?.featured_until ?? quest.project_featured_until,
    campaign_status: quest.campaigns?.status ?? quest.campaign_status,
    campaign_ends_at: quest.campaigns?.ends_at ?? quest.campaign_ends_at
  };
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

function getLocalProjectMember(walletAddress: string, projectId?: string | null) {
  return localProjectMembers.find((member) => member.wallet_address === walletAddress && member.project_id === projectId && member.status === "active");
}

async function getProjectMemberRole(walletAddress?: string | null, projectId?: string | null): Promise<ProjectMember["role"] | null> {
  if (!walletAddress || !projectId) return null;
  const wallet = normalizeWallet(walletAddress);

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === projectId);
    if (project?.owner_wallet_address === wallet) return "owner";
    return getLocalProjectMember(wallet, projectId)?.role ?? null;
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("owner_wallet_address").eq("id", projectId).maybeSingle();
  if (projectError) throw projectError;
  if (project?.owner_wallet_address === wallet) return "owner";

  const { data: member, error: memberError } = await client.from("project_members").select("role, status").eq("project_id", projectId).eq("wallet_address", wallet).maybeSingle();
  if (memberError) {
    if (isMissingProjectMemberStatus(memberError)) {
      const { data: legacyMember, error: legacyError } = await client.from("project_members").select("role").eq("project_id", projectId).eq("wallet_address", wallet).maybeSingle();
      if (legacyError) throw legacyError;
      return (legacyMember?.role as ProjectMember["role"] | undefined) ?? null;
    }
    throw memberError;
  }
  return member?.status === "active" ? (member.role as ProjectMember["role"]) : null;
}

async function hasProjectOwnerAccess(actorWalletAddress?: string | null, projectId?: string | null) {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !projectId) return false;
  if (context.is_platform_admin) return true;
  return (await getProjectMemberRole(actorWalletAddress, projectId)) === "owner";
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
    campaign_name: event.campaign_name ?? campaign?.name,
    campaign_status: event.campaign_status ?? campaign?.status,
    campaign_ends_at: event.campaign_ends_at ?? campaign?.ends_at
  };
}

function mapEvent(row: EventWithJoins): Event {
  return {
    ...row,
    project_name: row.projects?.name ?? row.project_name,
    project_slug: row.projects?.slug ?? row.project_slug,
    project_logo_url: row.projects?.logo_url ?? row.project_logo_url,
    project_type: row.projects?.project_type ?? row.project_type,
    campaign_name: row.campaigns?.name ?? row.campaign_name,
    campaign_status: row.campaigns?.status ?? row.campaign_status,
    campaign_ends_at: row.campaigns?.ends_at ?? row.campaign_ends_at
  };
}

function hydrateLaunchJoins(launch: ProjectLaunch, projects = localProjects, campaigns = localCampaigns): ProjectLaunch {
  const project = projects.find((item) => item.id === launch.project_id);
  const campaign = launch.campaign_id ? campaigns.find((item) => item.id === launch.campaign_id) : null;
  return {
    ...launch,
    project_name: launch.project_name ?? project?.name,
    project_slug: launch.project_slug ?? project?.slug,
    project_logo_url: launch.project_logo_url ?? project?.logo_url,
    project_type: launch.project_type ?? project?.project_type,
    project_is_verified: launch.project_is_verified ?? project?.is_verified,
    campaign_name: launch.campaign_name ?? campaign?.name
  };
}

function mapLaunch(row: LaunchWithJoins): ProjectLaunch {
  return {
    ...row,
    project_name: row.projects?.name ?? row.project_name,
    project_slug: row.projects?.slug ?? row.project_slug,
    project_logo_url: row.projects?.logo_url ?? row.project_logo_url,
    project_type: row.projects?.project_type ?? row.project_type,
    project_is_verified: row.projects?.is_verified ?? row.project_is_verified,
    campaign_name: row.campaigns?.name ?? row.campaign_name
  };
}

function hydrateProjectMember(member: ProjectMember): ProjectMember {
  const project = localProjects.find((item) => item.id === member.project_id);
  return {
    ...member,
    project_name: member.project_name ?? project?.name,
    project_slug: member.project_slug ?? project?.slug,
    project_logo_url: member.project_logo_url ?? project?.logo_url
  };
}

function mapProjectMember(row: ProjectMemberWithProject): ProjectMember {
  return {
    ...row,
    status: row.status ?? "active",
    project_name: row.projects?.name ?? row.project_name,
    project_slug: row.projects?.slug ?? row.project_slug,
    project_logo_url: row.projects?.logo_url ?? row.project_logo_url
  };
}

function getEventEffectiveEndsAt(event: Pick<Event, "campaign_id" | "ends_at" | "campaign_ends_at">) {
  return event.campaign_id ? event.campaign_ends_at ?? event.ends_at : event.ends_at;
}

function isEventVisible(event: Pick<Event, "status" | "campaign_id" | "campaign_status" | "ends_at" | "campaign_ends_at">) {
  if (event.status !== "active") return false;
  if (event.campaign_id && event.campaign_status === "archived") return false;
  const endsAt = getEventEffectiveEndsAt(event);
  return !endsAt || new Date(endsAt).getTime() > Date.now();
}

function getLaunchState(launch: Pick<ProjectLaunch, "status" | "starts_at">) {
  if (launch.status !== "active") return launch.status;
  if (!launch.starts_at) return "upcoming";
  return new Date(launch.starts_at).getTime() <= Date.now() ? "live" : "upcoming";
}

function isLaunchVisible(launch: Pick<ProjectLaunch, "status">) {
  return launch.status === "active";
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

function sortLaunches(launches: ProjectLaunch[]) {
  return [...launches].sort((a, b) => {
    const aFeatured = a.is_featured && isLaunchVisible(a);
    const bFeatured = b.is_featured && isLaunchVisible(b);
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
    if (aFeatured && bFeatured) {
      const rankDiff = (a.featured_rank ?? 999) - (b.featured_rank ?? 999);
      if (rankDiff !== 0) return rankDiff;
    }

    const aState = getLaunchState(a);
    const bState = getLaunchState(b);
    if (aState !== bState) {
      if (aState === "live") return -1;
      if (bState === "live") return 1;
      if (aState === "upcoming") return -1;
      if (bState === "upcoming") return 1;
    }

    const aDate = new Date(a.starts_at ?? a.created_at ?? 0).getTime();
    const bDate = new Date(b.starts_at ?? b.created_at ?? 0).getTime();
    if (aState === "upcoming" && bState === "upcoming") return aDate - bDate;
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

function isMissingNotificationsTable(error: { code?: string; message?: string; details?: string }) {
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return error.code === "42P01" || message.includes("relation") && message.includes("notifications") && message.includes("does not exist");
}

function isMissingProjectMemberStatus(error: { code?: string; message?: string; details?: string }) {
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (error.code === "42703" || error.code === "PGRST204" || message.includes("schema cache")) && message.includes("project_members") && message.includes("status");
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
    if (isMissingNotificationsTable(error)) {
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
    const memberWallets = localProjectMembers.filter((member) => member.project_id === projectId && member.status === "active").map((member) => member.wallet_address);
    return [project?.owner_wallet_address, ...memberWallets].filter(Boolean) as string[];
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("owner_wallet_address").eq("id", projectId).maybeSingle();
  if (projectError) throw projectError;

  const { data: members, error: memberError } = await client.from("project_members").select("wallet_address, status").eq("project_id", projectId);
  if (memberError) {
    if (isMissingProjectMemberStatus(memberError)) {
      const { data: legacyMembers, error: legacyError } = await client.from("project_members").select("wallet_address").eq("project_id", projectId);
      if (legacyError) throw legacyError;
      return [project?.owner_wallet_address, ...(legacyMembers ?? []).map((member) => member.wallet_address)].filter(Boolean) as string[];
    }
    throw memberError;
  }

  return [project?.owner_wallet_address, ...(members ?? []).filter((member) => member.status === "active").map((member) => member.wallet_address)].filter(Boolean) as string[];
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

async function resolveUserWalletIdentifier(identifier: string): Promise<string> {
  const value = identifier.trim();
  const normalizedWallet = normalizeWallet(value);
  if (normalizedWallet.startsWith("0x")) return normalizedWallet;

  const normalizedUsername = normalizeXUsername(value);
  if (!normalizedUsername) throw new Error("Enter a wallet address or Questora username.");

  if (!hasSupabaseConfig) {
    const matches = localUsers.filter((user) => {
      const xUsername = normalizeXUsername(user.x_username);
      const discordUsername = normalizeXUsername(user.discord_username);
      const displayName = normalizeXUsername(user.display_name);
      return xUsername === normalizedUsername || discordUsername === normalizedUsername || displayName === normalizedUsername;
    });

    if (matches.length === 0) throw new Error("No Questora profile found for that username.");
    if (matches.length > 1) throw new Error("More than one profile matches that name. Use the wallet address or X username.");
    return matches[0].wallet_address;
  }

  const client = assertSupabase();
  const candidates = Array.from(new Set([normalizedUsername, `@${normalizedUsername}`, value]));
  const matches = new Map<string, string>();

  for (const candidate of candidates) {
    const { data, error } = await client
      .from("users")
      .select("wallet_address")
      .or(`x_username.ilike.${candidate},discord_username.ilike.${candidate},display_name.ilike.${candidate}`)
      .limit(2);

    if (error) throw new Error(formatDatabaseError(error, "Failed to look up that username."));
    for (const row of data ?? []) {
      matches.set(row.wallet_address, row.wallet_address);
    }
  }

  if (matches.size === 0) throw new Error("No Questora profile found for that username.");
  if (matches.size > 1) throw new Error("More than one profile matches that name. Use the wallet address or X username.");
  return Array.from(matches.values())[0];
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
      const campaign = quest.campaign_id ? localCampaigns.find((item) => item.id === quest.campaign_id) : null;
      return project?.status === "active" && isQuestVisibleForDashboard({ ...quest, campaign_status: campaign?.status });
    }).map((quest) => {
      const project = localProjects.find((item) => item.id === quest.project_id);
      const campaign = quest.campaign_id ? localCampaigns.find((item) => item.id === quest.campaign_id) : null;
      return hydrateQuestJoins({
        ...quest,
        projects: project,
        campaigns: campaign ? { status: campaign.status, ends_at: campaign.ends_at } : null
      });
    });
  }

  const { data, error } = await assertSupabase()
    .from("quests")
    .select("*, projects(name, status, logo_url, project_type, is_verified, is_featured, featured_rank, featured_until), campaigns(status, ends_at)")
    .eq("status", "active")
    .eq("projects.status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .map((quest) => hydrateQuestJoins(quest as QuestWithJoins))
    .filter((quest) => quest.project_name && isQuestVisibleForDashboard(quest));
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

export async function getQuestById(questId: string): Promise<Quest | null> {
  const decodedQuestId = decodeURIComponent(questId).trim();
  if (!decodedQuestId) return null;

  if (!hasSupabaseConfig) {
    const quest = localQuests.find((item) => item.id === decodedQuestId);
    if (!quest) return null;
    const project = localProjects.find((item) => item.id === quest.project_id);
    const campaign = quest.campaign_id ? localCampaigns.find((item) => item.id === quest.campaign_id) : null;
    if (project?.status !== "active" || quest.status === "archived") return null;
    if (quest.campaign_id && campaign?.status === "archived") return null;

    return hydrateQuestJoins({
      ...quest,
      projects: project,
      campaigns: campaign ? { status: campaign.status, ends_at: campaign.ends_at } : null
    });
  }

  const { data, error } = await assertSupabase()
    .from("quests")
    .select("*, projects(name, status, logo_url, project_type, is_verified, is_featured, featured_rank, featured_until), campaigns(status, ends_at)")
    .eq("id", decodedQuestId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.projects?.status !== "active" || data.status === "archived") return null;
  if (data.campaign_id && data.campaigns?.status === "archived") return null;

  return hydrateQuestJoins(data as QuestWithJoins);
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
    const memberProjectIds = localProjectMembers.filter((member) => member.wallet_address === wallet && member.status === "active").map((member) => member.project_id);

    return {
      wallet_address: wallet,
      is_platform_admin: configuredAdmins.includes(wallet),
      project_ids: Array.from(new Set([...ownedProjectIds, ...memberProjectIds]))
    };
  }

  const client = assertSupabase();
  const [{ data: platformAdmin, error: platformError }, { data: projects, error: projectsError }] = await Promise.all([
    client.from("platform_admins").select("id").eq("wallet_address", wallet).maybeSingle(),
    client.from("projects").select("id").eq("owner_wallet_address", wallet)
  ]);

  if (platformError) throw platformError;
  if (projectsError) throw projectsError;

  const { data: members, error: membersError } = await client.from("project_members").select("project_id, status").eq("wallet_address", wallet);
  let memberProjectIds: string[] = [];

  if (membersError) {
    if (isMissingProjectMemberStatus(membersError)) {
      const { data: legacyMembers, error: legacyError } = await client.from("project_members").select("project_id").eq("wallet_address", wallet);
      if (legacyError) throw legacyError;
      memberProjectIds = (legacyMembers ?? []).map((member) => member.project_id);
    } else {
      throw membersError;
    }
  } else {
    memberProjectIds = (members ?? []).filter((member) => member.status === "active").map((member) => member.project_id);
  }

  const projectIds = [
    ...((projects ?? []).map((project) => project.id)),
    ...memberProjectIds
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
          role: "owner",
          status: "active"
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
      role: "owner",
      status: "active"
    });

    if (memberError) {
      if (isMissingProjectMemberStatus(memberError)) {
        const { error: legacyMemberError } = await client.from("project_members").insert({
          project_id: data.id,
          wallet_address: data.owner_wallet_address,
          role: "owner"
        });
        if (legacyMemberError) throw legacyMemberError;
      } else {
        throw memberError;
      }
    }
  }

  return data;
}

export async function updateProject(projectId: string, input: ProjectInput, actorWalletAddress?: string | null): Promise<Project> {
  if (!(await hasProjectOwnerAccess(actorWalletAddress, projectId))) {
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

export async function getProjectTeamMembers(actorWalletAddress?: string | null): Promise<ProjectMember[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    return localProjectMembers
      .map(hydrateProjectMember)
      .filter((member) => context.is_platform_admin || context.project_ids.includes(member.project_id) || member.wallet_address === context.wallet_address)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  }

  const { data, error } = await assertSupabase()
    .from("project_members")
    .select("*, projects(name, slug, logo_url)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(formatDatabaseError(error, "Failed to load project team members. Run supabase/project-team-members.sql in Supabase first."));

  return ((data ?? []) as ProjectMemberWithProject[])
    .map(mapProjectMember)
    .filter((member) => context.is_platform_admin || context.project_ids.includes(member.project_id) || member.wallet_address === context.wallet_address);
}

export async function inviteCommunityManager(projectId: string, walletAddress: string, actorWalletAddress?: string | null): Promise<ProjectMember> {
  if (!(await hasProjectOwnerAccess(actorWalletAddress, projectId))) {
    throw new Error("Only the project owner can invite community managers.");
  }

  const wallet = await resolveUserWalletIdentifier(walletAddress);

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === projectId);
    if (!project) throw new Error("Project not found.");
    if (project.owner_wallet_address === wallet) throw new Error("Project owner is already on the team.");

    const member: ProjectMember = hydrateProjectMember({
      id: crypto.randomUUID(),
      project_id: projectId,
      wallet_address: wallet,
      role: "community_manager",
      status: "pending",
      created_at: new Date().toISOString()
    });
    localProjectMembers = [member, ...localProjectMembers.filter((item) => !(item.project_id === projectId && item.wallet_address === wallet))];
    await createNotification({
      recipient_wallet_address: wallet,
      type: "project_team_invited",
      title: "Team invite",
      body: `You were invited to join ${project.name} as Community Manager.`,
      href: "/admin?tab=projects"
    });
    return member;
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("name, owner_wallet_address").eq("id", projectId).single();
  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load selected project."));
  if (project.owner_wallet_address === wallet) throw new Error("Project owner is already on the team.");

  const { data, error } = await client
    .from("project_members")
    .upsert({ project_id: projectId, wallet_address: wallet, role: "community_manager", status: "pending" }, { onConflict: "project_id,wallet_address" })
    .select("*, projects(name, slug, logo_url)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to invite community manager. Run supabase/project-team-members.sql in Supabase first."));

  await createNotification({
    recipient_wallet_address: wallet,
    type: "project_team_invited",
    title: "Team invite",
    body: `You were invited to join ${project.name} as Community Manager.`,
    href: "/admin?tab=projects"
  });

  return mapProjectMember(data as ProjectMemberWithProject);
}

export async function reviewProjectTeamInvite(memberId: string, status: "active" | "rejected", actorWalletAddress?: string | null): Promise<ProjectMember> {
  if (!actorWalletAddress) throw new Error("Connect the invited wallet before reviewing this team invite.");
  const wallet = normalizeWallet(actorWalletAddress);

  if (!hasSupabaseConfig) {
    const member = localProjectMembers.find((item) => item.id === memberId);
    if (!member) throw new Error("Team invite not found.");
    if (member.wallet_address !== wallet) throw new Error("Only the invited wallet can review this invite.");
    localProjectMembers = localProjectMembers.map((item) => (item.id === memberId ? { ...item, status } : item));
    const updated = hydrateProjectMember({ ...member, status });
    const project = localProjects.find((item) => item.id === member.project_id);
    await createNotification({
      recipient_wallet_address: project?.owner_wallet_address,
      type: status === "active" ? "project_team_accepted" : "project_team_rejected",
      title: status === "active" ? "Team invite accepted" : "Team invite rejected",
      body: `${shortWallet(wallet)} ${status === "active" ? "accepted" : "rejected"} the Community Manager invite for ${project?.name ?? "your project"}.`,
      href: "/admin?tab=projects"
    });
    return updated;
  }

  const client = assertSupabase();
  const { data: existing, error: lookupError } = await client
    .from("project_members")
    .select("*, projects(name, slug, logo_url, owner_wallet_address)")
    .eq("id", memberId)
    .single();

  if (lookupError) throw new Error(formatDatabaseError(lookupError, "Failed to load team invite."));
  const existingMember = existing as ProjectMemberWithProject & { projects?: { owner_wallet_address?: string | null; name: string; slug: string; logo_url?: string | null } | null };
  if (existingMember.wallet_address !== wallet) throw new Error("Only the invited wallet can review this invite.");

  const { data, error } = await client
    .from("project_members")
    .update({ status })
    .eq("id", memberId)
    .select("*, projects(name, slug, logo_url)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to update team invite."));

  await createNotification({
    recipient_wallet_address: existingMember.projects?.owner_wallet_address,
    type: status === "active" ? "project_team_accepted" : "project_team_rejected",
    title: status === "active" ? "Team invite accepted" : "Team invite rejected",
    body: `${shortWallet(wallet)} ${status === "active" ? "accepted" : "rejected"} the Community Manager invite for ${existingMember.projects?.name ?? "your project"}.`,
    href: "/admin?tab=projects"
  });

  return mapProjectMember(data as ProjectMemberWithProject);
}

export async function removeProjectTeamMember(memberId: string, actorWalletAddress?: string | null) {
  const members = await getProjectTeamMembers(actorWalletAddress);
  const member = members.find((item) => item.id === memberId);
  if (!member) throw new Error("Team member not found.");
  if (member.role === "owner") throw new Error("Project owner cannot be removed from the team.");
  if (!(await hasProjectOwnerAccess(actorWalletAddress, member.project_id))) {
    throw new Error("Only the project owner can remove community managers.");
  }

  if (!hasSupabaseConfig) {
    localProjectMembers = localProjectMembers.filter((item) => item.id !== memberId);
    return;
  }

  const { error } = await assertSupabase().from("project_members").delete().eq("id", memberId);
  if (error) throw new Error(formatDatabaseError(error, "Failed to remove team member."));
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

type VerificationRequestWithProject = ProjectVerificationRequest & {
  projects?: {
    name?: string;
    slug?: string;
    logo_url?: string | null;
    website_url?: string | null;
    x_url?: string | null;
    discord_url?: string | null;
    telegram_url?: string | null;
  } | null;
};

function mapVerificationRequest(row: VerificationRequestWithProject): ProjectVerificationRequest {
  return {
    ...row,
    project_name: row.project_name ?? row.projects?.name,
    project_slug: row.project_slug ?? row.projects?.slug,
    project_logo_url: row.project_logo_url ?? row.projects?.logo_url,
    project_website_url: row.project_website_url ?? row.projects?.website_url,
    project_x_url: row.project_x_url ?? row.projects?.x_url,
    project_discord_url: row.project_discord_url ?? row.projects?.discord_url,
    project_telegram_url: row.project_telegram_url ?? row.projects?.telegram_url
  };
}

export async function getProjectVerificationRequests(actorWalletAddress?: string | null): Promise<ProjectVerificationRequest[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    const projectById = new Map(localProjects.map((project) => [project.id, project]));
    return localVerificationRequests
      .filter((request) => context.is_platform_admin || context.project_ids.includes(request.project_id))
      .map((request) => {
        const project = projectById.get(request.project_id);
        return mapVerificationRequest({ ...request, projects: project ?? null });
      })
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  }

  const { data, error } = await assertSupabase()
    .from("project_verification_requests")
    .select("*, projects(name, slug, logo_url, website_url, x_url, discord_url, telegram_url)")
    .order("created_at", { ascending: false });

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("project_verification_requests") || error.code === "42P01") return [];
    throw new Error(formatDatabaseError(error, "Failed to load verification requests."));
  }

  return ((data ?? []) as VerificationRequestWithProject[]).map(mapVerificationRequest).filter((request) => context.is_platform_admin || context.project_ids.includes(request.project_id));
}

export async function requestProjectVerification(projectId: string, input: { reason: string; proof_url?: string | null }, actorWalletAddress?: string | null): Promise<ProjectVerificationRequest> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, projectId)) {
    throw new Error("Only the project owner or team can request verification.");
  }

  const reason = input.reason.trim();
  if (reason.length < 8) {
    throw new Error("Add a short reason for the verification request.");
  }

  const requestInput = {
    project_id: projectId,
    requester_wallet_address: normalizeWallet(actorWalletAddress ?? context.wallet_address),
    reason,
    proof_url: input.proof_url?.trim() || null,
    status: "submitted" as const,
    review_note: null,
    reviewed_by_wallet_address: null,
    reviewed_at: null
  };

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === projectId);
    if (!project) throw new Error("Project not found.");
    if (project.is_verified) throw new Error("This project is already verified.");
    const existing = localVerificationRequests.find((request) => request.project_id === projectId && request.status === "submitted");
    if (existing) return mapVerificationRequest({ ...existing, projects: project });

    const request: ProjectVerificationRequest = {
      id: crypto.randomUUID(),
      ...requestInput,
      created_at: new Date().toISOString()
    };
    localVerificationRequests = [request, ...localVerificationRequests];
    return mapVerificationRequest({ ...request, projects: project });
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("id, is_verified").eq("id", projectId).single();
  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load project."));
  if (project.is_verified) throw new Error("This project is already verified.");

  const { data: existing, error: existingError } = await client
    .from("project_verification_requests")
    .select("*, projects(name, slug, logo_url, website_url, x_url, discord_url, telegram_url)")
    .eq("project_id", projectId)
    .eq("status", "submitted")
    .maybeSingle();
  if (existingError) throw new Error(formatDatabaseError(existingError, "Failed to check existing verification request."));
  if (existing) return mapVerificationRequest(existing as VerificationRequestWithProject);

  const { data, error } = await client
    .from("project_verification_requests")
    .insert(requestInput)
    .select("*, projects(name, slug, logo_url, website_url, x_url, discord_url, telegram_url)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to submit verification request. Run supabase/project-verification-requests.sql in Supabase first."));
  return mapVerificationRequest(data as VerificationRequestWithProject);
}

export async function reviewProjectVerificationRequest(requestId: string, status: "approved" | "rejected", reviewNote = "", actorWalletAddress?: string | null): Promise<ProjectVerificationRequest> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context?.is_platform_admin) {
    throw new Error("Only platform admin can review verification requests.");
  }

  const reviewedAt = new Date().toISOString();
  const reviewer = actorWalletAddress ? normalizeWallet(actorWalletAddress) : context.wallet_address;

  if (!hasSupabaseConfig) {
    const request = localVerificationRequests.find((item) => item.id === requestId);
    if (!request) throw new Error("Verification request not found.");
    localVerificationRequests = localVerificationRequests.map((item) =>
      item.id === requestId ? { ...item, status, review_note: reviewNote.trim() || null, reviewed_by_wallet_address: reviewer, reviewed_at: reviewedAt } : item
    );
    if (status === "approved") {
      localProjects = localProjects.map((project) => (project.id === request.project_id ? { ...project, is_verified: true, verified_at: reviewedAt } : project));
    }
    const updated = localVerificationRequests.find((item) => item.id === requestId) as ProjectVerificationRequest;
    const project = localProjects.find((item) => item.id === updated.project_id);
    await createNotifications(await getProjectNotificationRecipients(updated.project_id), {
      type: status === "approved" ? "project_approved" : "project_rejected",
      title: status === "approved" ? "Project verified" : "Verification request rejected",
      body:
        status === "approved"
          ? `${project?.name ?? "Your project"} is now verified on Questora.`
          : `${project?.name ?? "Your project"} verification was rejected.${reviewNote.trim() ? ` ${reviewNote.trim()}` : ""}`,
      href: "/admin?tab=projects"
    });
    return mapVerificationRequest({ ...updated, projects: project ?? null });
  }

  const client = assertSupabase();
  const { data: request, error: requestError } = await client.from("project_verification_requests").select("*").eq("id", requestId).single();
  if (requestError) throw new Error(formatDatabaseError(requestError, "Failed to load verification request."));

  const { data, error } = await client
    .from("project_verification_requests")
    .update({
      status,
      review_note: reviewNote.trim() || null,
      reviewed_by_wallet_address: reviewer,
      reviewed_at: reviewedAt
    })
    .eq("id", requestId)
    .select("*, projects(name, slug, logo_url, website_url, x_url, discord_url, telegram_url)")
    .single();
  if (error) throw new Error(formatDatabaseError(error, "Failed to review verification request."));

  if (status === "approved") {
    const { error: projectError } = await client.from("projects").update({ is_verified: true, verified_at: reviewedAt }).eq("id", request.project_id);
    if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to verify project."));
  }

  const mappedRequest = mapVerificationRequest(data as VerificationRequestWithProject);
  await createNotifications(await getProjectNotificationRecipients(request.project_id), {
    type: status === "approved" ? "project_approved" : "project_rejected",
    title: status === "approved" ? "Project verified" : "Verification request rejected",
    body:
      status === "approved"
        ? `${mappedRequest.project_name ?? "Your project"} is now verified on Questora.`
        : `${mappedRequest.project_name ?? "Your project"} verification was rejected.${reviewNote.trim() ? ` ${reviewNote.trim()}` : ""}`,
    href: "/admin?tab=projects"
  });

  return mappedRequest;
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

export async function updateCampaign(campaignId: string, input: CampaignInput, actorWalletAddress?: string | null): Promise<Campaign> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) throw new Error("Connect the campaign owner wallet before editing this campaign.");

  const campaignInput = {
    ...input,
    slug: slugify(input.slug || input.name),
    description: input.description?.trim() || null,
    purpose: input.purpose?.trim() || null,
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null
  };

  if (!hasSupabaseConfig) {
    const existing = localCampaigns.find((item) => item.id === campaignId);
    if (!existing) throw new Error("Campaign not found.");
    if (!hasProjectAccess(context, existing.project_id)) throw new Error("Only the campaign owner can edit this campaign.");
    localCampaigns = localCampaigns.map((campaign) =>
      campaign.id === campaignId
        ? {
            ...campaign,
            ...campaignInput,
            project_id: existing.project_id,
            project_name: localProjects.find((item) => item.id === existing.project_id)?.name ?? existing.project_name
          }
        : campaign
    );
    return localCampaigns.find((item) => item.id === campaignId) as Campaign;
  }

  const client = assertSupabase();
  const { data: existing, error: existingError } = await client.from("campaigns").select("id, project_id").eq("id", campaignId).single();
  if (existingError) throw new Error(formatDatabaseError(existingError, "Failed to load campaign."));
  if (!hasProjectAccess(context, existing.project_id)) throw new Error("Only the campaign owner can edit this campaign.");

  const { data, error } = await client
    .from("campaigns")
    .update({
      slug: campaignInput.slug,
      name: campaignInput.name,
      description: campaignInput.description,
      purpose: campaignInput.purpose,
      starts_at: campaignInput.starts_at,
      ends_at: campaignInput.ends_at,
      status: campaignInput.status
    })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw new Error(formatDatabaseError(error, "Failed to update campaign."));
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
    await createNotifications(await getProjectNotificationRecipients(projectId), {
      type: "campaign_partner_invited",
      title: "New collab invite",
      body: `You were invited to co-host "${campaign.name}".`,
      href: "/admin?tab=campaigns"
    });
    return partner;
  }

  const client = assertSupabase();
  const [{ data: campaign, error: campaignError }, { data: project, error: projectError }] = await Promise.all([
    client.from("campaigns").select("id, project_id, name").eq("id", campaignId).single(),
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
  const mappedPartner = mapCampaignPartner(data as CampaignPartnerWithProject);
  await createNotifications(await getProjectNotificationRecipients(projectId), {
    type: "campaign_partner_invited",
    title: "New collab invite",
    body: `You were invited to co-host "${campaign.name}".`,
    href: "/admin?tab=campaigns"
  });
  return mappedPartner;
}

export async function reviewCampaignPartner(campaignId: string, projectId: string, status: "active" | "archived", actorWalletAddress?: string | null): Promise<CampaignPartner> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, projectId)) {
    throw new Error("Only the partner project owner can accept or reject this collab invite.");
  }

  if (!hasSupabaseConfig) {
    const campaign = localCampaigns.find((item) => item.id === campaignId);
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
    const reviewedPartner = updatedPartner as CampaignPartner;
    await createNotifications(await getProjectNotificationRecipients(campaign?.project_id), {
      type: status === "active" ? "campaign_partner_accepted" : "campaign_partner_rejected",
      title: status === "active" ? "Collab invite accepted" : "Collab invite rejected",
      body: `${reviewedPartner.project_name ?? "A partner project"} ${status === "active" ? "accepted" : "rejected"} your collab invite${campaign?.name ? ` for "${campaign.name}"` : ""}.`,
      href: "/admin?tab=campaigns"
    });
    return reviewedPartner;
  }

  const client = assertSupabase();
  const { data: campaign, error: campaignError } = await client.from("campaigns").select("id, project_id, name").eq("id", campaignId).single();
  if (campaignError) throw new Error(formatDatabaseError(campaignError, "Failed to load selected campaign."));

  const { data, error } = await client
    .from("campaign_partners")
    .update({ status })
    .eq("campaign_id", campaignId)
    .eq("project_id", projectId)
    .select("*, projects(name, slug, logo_url, project_type)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to update campaign partner invite."));
  const mappedPartner = mapCampaignPartner(data as CampaignPartnerWithProject);
  await createNotifications(await getProjectNotificationRecipients(campaign.project_id), {
    type: status === "active" ? "campaign_partner_accepted" : "campaign_partner_rejected",
    title: status === "active" ? "Collab invite accepted" : "Collab invite rejected",
    body: `${mappedPartner.project_name ?? "A partner project"} ${status === "active" ? "accepted" : "rejected"} your collab invite for "${campaign.name}".`,
    href: "/admin?tab=campaigns"
  });
  return mappedPartner;
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
    .select("*, projects(name, slug, logo_url, project_type), campaigns(name, status, ends_at)")
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
    .select("*, projects(name, slug, logo_url, project_type), campaigns(name, status, ends_at)")
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

export async function getLaunches(limit = 24): Promise<ProjectLaunch[]> {
  if (!hasSupabaseConfig) {
    return sortLaunches(localLaunches.map((launch) => hydrateLaunchJoins(launch)).filter(isLaunchVisible)).slice(0, limit);
  }

  const { data, error } = await assertSupabase()
    .from("project_launches")
    .select("*, projects(name, slug, logo_url, project_type, is_verified), campaigns(name)")
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("featured_rank", { ascending: true })
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("project_launches") || error.code === "42P01") return [];
    throw new Error(formatDatabaseError(error, "Failed to load launches."));
  }

  return sortLaunches(((data ?? []) as LaunchWithJoins[]).map(mapLaunch).filter(isLaunchVisible));
}

export async function getManageableLaunches(actorWalletAddress?: string | null): Promise<ProjectLaunch[]> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context) return [];

  if (!hasSupabaseConfig) {
    return sortLaunches(localLaunches.map((launch) => hydrateLaunchJoins(launch)).filter((launch) => hasProjectAccess(context, launch.project_id)));
  }

  const { data, error } = await assertSupabase()
    .from("project_launches")
    .select("*, projects(name, slug, logo_url, project_type, is_verified), campaigns(name)")
    .order("created_at", { ascending: false });

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("project_launches") || error.code === "42P01") return [];
    throw new Error(formatDatabaseError(error, "Failed to load launches."));
  }

  return sortLaunches(((data ?? []) as LaunchWithJoins[]).map(mapLaunch).filter((launch) => hasProjectAccess(context, launch.project_id)));
}

export async function createLaunch(input: ProjectLaunchInput, actorWalletAddress?: string | null): Promise<ProjectLaunch> {
  const context = await getAdminContext(actorWalletAddress);
  if (!context || !hasProjectAccess(context, input.project_id)) {
    throw new Error("You do not have permission to create launches for this project.");
  }

  const launchInput = {
    ...input,
    campaign_id: input.campaign_id || null,
    slug: slugify(input.slug || input.name),
    description: input.description?.trim() || null,
    launch_url: input.launch_url?.trim() || null,
    price: input.price?.trim() || null,
    supply: input.supply?.trim() || null,
    network: input.network?.trim() || null,
    cover_image_url: getImageUrl(input.cover_image_url) || null,
    starts_at: input.starts_at || null,
    featured_rank: input.is_featured ? input.featured_rank : null
  };

  if (!hasSupabaseConfig) {
    const project = localProjects.find((item) => item.id === launchInput.project_id);
    const campaign = launchInput.campaign_id ? localCampaigns.find((item) => item.id === launchInput.campaign_id) : null;
    if (project?.status !== "active") throw new Error("Project must be approved before launches can be created.");
    if (launchInput.campaign_id && (!campaign || !canUseCampaignForProject(campaign, launchInput.project_id))) {
      throw new Error("Selected campaign is not available for this project.");
    }

    const launch = hydrateLaunchJoins({
      id: crypto.randomUUID(),
      ...launchInput,
      created_at: new Date().toISOString()
    });
    localLaunches = [launch, ...localLaunches];
    return launch;
  }

  const client = assertSupabase();
  const { data: project, error: projectError } = await client.from("projects").select("id, status").eq("id", launchInput.project_id).single();
  if (projectError) throw new Error(formatDatabaseError(projectError, "Failed to load selected project."));
  if (project.status !== "active") throw new Error("Project must be approved before launches can be created.");

  if (launchInput.campaign_id) {
    const { data: campaign, error: campaignError } = await client
      .from("campaigns")
      .select("id, project_id")
      .eq("id", launchInput.campaign_id)
      .single();

    if (campaignError) throw new Error(formatDatabaseError(campaignError, "Failed to load selected campaign."));
    const partners = await getCampaignPartnersForCampaignIds([launchInput.campaign_id]);
    const partnerProjectIds = (partners.get(launchInput.campaign_id) ?? []).filter((partner) => partner.status === "active").map((partner) => partner.project_id);
    if (!canUseCampaignForProject({ ...campaign, partner_project_ids: partnerProjectIds }, launchInput.project_id)) {
      throw new Error("Selected campaign is not available for this project.");
    }
  }

  const { data, error } = await client
    .from("project_launches")
    .insert(launchInput)
    .select("*, projects(name, slug, logo_url, project_type, is_verified), campaigns(name)")
    .single();

  if (error) throw new Error(formatDatabaseError(error, "Failed to create launch. Run supabase/project-launches.sql in Supabase first."));
  return mapLaunch(data as LaunchWithJoins);
}

export async function getLaunchBySlug(slug: string): Promise<ProjectLaunch | null> {
  const normalizedSlug = decodeURIComponent(slug).trim().toLowerCase();
  if (!normalizedSlug) return null;

  if (!hasSupabaseConfig) {
    const launch = localLaunches.find((item) => item.slug === normalizedSlug || item.id === normalizedSlug);
    return launch ? hydrateLaunchJoins(launch) : null;
  }

  const { data, error } = await assertSupabase()
    .from("project_launches")
    .select("*, projects(name, slug, logo_url, project_type, is_verified), campaigns(name)")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (error) {
    const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (message.includes("project_launches") || error.code === "42P01") return null;
    throw error;
  }
  return data ? mapLaunch(data as LaunchWithJoins) : null;
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
    if (isMissingNotificationsTable(error)) return [];
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
    if (isMissingNotificationsTable(error)) return 0;
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
