"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Archive, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Download, ExternalLink, FolderPlus, Gift, Pencil, PlusCircle, RotateCcw, Save, ShieldCheck, Star, UserRound, UsersRound, Wand2, XCircle } from "lucide-react";
import { ProjectImage } from "@/components/ProjectImage";
import { addCampaignPartner, createCampaign, createEvent, createProject, createQuest, getAdminContext, getEventLeaderboard, getManageableCampaigns, getManageableEvents, getManageableProjects, getManageableQuests, getProjects, getQualifiedUsers, getQuestSubmissions, removeCampaignPartner, reviewCampaignPartner, reviewProject, reviewQuestSubmission, updateProject, updateProjectCuration, updateQuestStatus } from "@/lib/quest-service";
import type { AdminContext, Campaign, CampaignInput, Event, EventInput, EventRewardType, Project, ProjectInput, ProjectType, QualifiedUser, Quest, QuestDifficulty, QuestInput, QuestStatus, QuestType, UserQuest } from "@/lib/types";
import { formatQuestDeadline, fromDatetimeLocalValue, isQuestEnded, toDatetimeLocalValue } from "@/lib/utils";
import { calculateGlobalXp, clampProjectXp, difficultyLabels, getQuestXpPolicy, questTypeLabels } from "@/lib/xp-policy";

const projectTypes: ProjectType[] = ["NFT", "Meme", "AI", "DeFi", "Gaming", "DAO", "Social", "Education", "Tooling", "Other"];
const questTypes = Object.keys(questTypeLabels) as QuestType[];
const questDifficulties = Object.keys(difficultyLabels) as QuestDifficulty[];
const campaignPurposes = ["NFT whitelist", "Early access", "Community rewards", "Beta tester selection", "Contributor tracking", "Leaderboard rewards"];
const eventRewardTypeLabels: Record<EventRewardType, string> = {
  top_leaderboard: "Top leaderboard",
  raffle: "Raffle",
  manual_selection: "Manual selection",
  whitelist: "Whitelist"
};
const eventRewardTypes = Object.keys(eventRewardTypeLabels) as EventRewardType[];
const questWizardSteps = ["Project", "Purpose", "Task", "Reward", "Preview"];
const studioTabs = [
  { id: "overview", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "campaigns", label: "Campaigns" },
  { id: "events", label: "Events" },
  { id: "quests", label: "Quests" },
  { id: "submissions", label: "Submissions" },
  { id: "exports", label: "Exports" }
] as const;

type StudioTab = (typeof studioTabs)[number]["id"];
type QuestListFilter = "active" | "ended" | "archived" | "all";

const questListFilters: Array<{ id: QuestListFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "ended", label: "Ended" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" }
];

const questTemplates: Array<{ name: string; summary: string; values: Omit<QuestInput, "project_id" | "campaign_id" | "status"> }> = [
  {
    name: "Follow X",
    summary: "Ask members to follow your X account.",
    values: {
      title: "Follow us on X",
      description: "Follow our official X account to stay updated with community announcements.",
      task_url: "",
      instructions: "Open our X profile, follow the account, then submit your X username.",
      proof_type: "text",
      proof_placeholder: "@yourusername",
      proof_example: "@basebuilder",
      quest_type: "follow_x",
      difficulty: "easy",
      xp_reward: 20,
      global_xp_reward: 10,
      ends_at: null,
      category: "Social"
    }
  },
  {
    name: "Retweet X",
    summary: "Members repost a selected X post and submit proof.",
    values: {
      title: "Repost our X announcement",
      description: "Repost the selected X announcement to help the campaign reach more community members.",
      task_url: "",
      instructions: "Open the X post, repost it from your account, then paste your repost URL or X profile as proof.",
      proof_type: "tweet",
      proof_placeholder: "https://x.com/yourname/status/... or your X profile",
      proof_example: "https://x.com/yourname/status/123",
      quest_type: "retweet_x",
      difficulty: "easy",
      xp_reward: 15,
      global_xp_reward: 5,
      ends_at: null,
      category: "Social"
    }
  },
  {
    name: "Post on X",
    summary: "Members publish a post and submit the URL.",
    values: {
      title: "Share your community signal",
      description: "Post about the project on X and help more Base builders discover the community.",
      task_url: "",
      instructions: "Create a public X post, mention the project, then paste the post URL as proof.",
      proof_type: "tweet",
      proof_placeholder: "https://x.com/yourname/status/...",
      proof_example: "https://x.com/base/status/123",
      quest_type: "post_x",
      difficulty: "medium",
      xp_reward: 80,
      global_xp_reward: 30,
      ends_at: null,
      category: "Social"
    }
  },
  {
    name: "Join Discord",
    summary: "Members join your server and submit username.",
    values: {
      title: "Join our Discord",
      description: "Join the community Discord and introduce yourself.",
      task_url: "",
      instructions: "Join the Discord server, say hello in the welcome channel, then submit your Discord username.",
      proof_type: "discord",
      proof_placeholder: "@username",
      proof_example: "@basebuilder",
      quest_type: "join_discord",
      difficulty: "medium",
      xp_reward: 40,
      global_xp_reward: 14,
      ends_at: null,
      category: "Community"
    }
  },
  {
    name: "Onchain tx",
    summary: "Members submit wallet transaction proof.",
    values: {
      title: "Complete an onchain action",
      description: "Complete the requested Base transaction and submit proof.",
      task_url: "",
      instructions: "Perform the onchain action described by the project, then paste the transaction hash or explorer link.",
      proof_type: "wallet",
      proof_placeholder: "0x... or https://basescan.org/tx/...",
      proof_example: "https://basescan.org/tx/0x...",
      quest_type: "onchain",
      difficulty: "medium",
      xp_reward: 250,
      global_xp_reward: 88,
      ends_at: null,
      category: "Onchain"
    }
  },
  {
    name: "Read / Learn",
    summary: "Members read content and answer briefly.",
    values: {
      title: "Complete the learning task",
      description: "Read the selected resource and submit a short takeaway.",
      task_url: "",
      instructions: "Read the resource, then write one or two sentences about what you learned.",
      proof_type: "text",
      proof_placeholder: "Your short takeaway",
      proof_example: "I learned how Base reduces transaction costs using L2 batching.",
      quest_type: "learn",
      difficulty: "medium",
      xp_reward: 100,
      global_xp_reward: 30,
      ends_at: null,
      category: "Learning"
    }
  },
  {
    name: "Feedback",
    summary: "Members try something and submit feedback.",
    values: {
      title: "Submit product feedback",
      description: "Try the product or community experience and share useful feedback.",
      task_url: "",
      instructions: "Use the product, note one thing that worked well and one thing that could improve, then submit your feedback.",
      proof_type: "text",
      proof_placeholder: "Your feedback",
      proof_example: "The onboarding was clear, but the wallet step needs a better hint.",
      quest_type: "feedback",
      difficulty: "medium",
      xp_reward: 175,
      global_xp_reward: 60,
      ends_at: null,
      category: "Community"
    }
  }
];

const initialForm: QuestInput = {
  project_id: "",
  campaign_id: null,
  title: "",
  description: "",
  task_url: "",
  instructions: "",
  proof_type: "text",
  proof_placeholder: "",
  proof_example: "",
  quest_type: "submit_proof",
  difficulty: "medium",
  xp_reward: 100,
  global_xp_reward: 35,
  status: "active",
  category: "Community",
  ends_at: null
};

const initialCampaignForm: CampaignInput = {
  project_id: "",
  slug: "",
  name: "",
  description: "",
  purpose: campaignPurposes[0],
  starts_at: null,
  ends_at: null,
  status: "active"
};

const initialEventForm: EventInput = {
  project_id: "",
  campaign_id: "",
  slug: "",
  name: "",
  description: "",
  prize_pool: "",
  prize_currency: "USDC",
  reward_type: "top_leaderboard",
  rules: "",
  cover_image_url: "",
  starts_at: null,
  ends_at: null,
  status: "active",
  is_featured: false,
  featured_rank: null
};

const initialProjectForm: ProjectInput = {
  name: "",
  slug: "",
  description: "",
  project_type: "Other",
  owner_wallet_address: null,
  logo_url: "",
  cover_image_url: "",
  website_url: "",
  discord_url: "",
  telegram_url: "",
  x_url: "",
  status: "active"
};

function getProjectReviewLinks(project: Project) {
  return [
    { label: "Website", url: project.website_url },
    { label: "X", url: project.x_url },
    { label: "Discord", url: project.discord_url },
    { label: "Telegram", url: project.telegram_url },
    { label: "Logo", url: project.logo_url },
    { label: "Cover", url: project.cover_image_url }
  ].filter((link): link is { label: string; url: string } => Boolean(link.url));
}

function canProjectUseCampaign(projectId: string | null | undefined, campaign: Campaign) {
  return Boolean(projectId && (campaign.project_id === projectId || campaign.partner_project_ids?.includes(projectId)));
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const [adminContext, setAdminContext] = useState<AdminContext | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [managedQuests, setManagedQuests] = useState<Quest[]>([]);
  const [submissions, setSubmissions] = useState<UserQuest[]>([]);
  const [qualifiedUsers, setQualifiedUsers] = useState<QualifiedUser[]>([]);
  const [qualifiedProjectId, setQualifiedProjectId] = useState("");
  const [minimumQualifiedXp, setMinimumQualifiedXp] = useState(100);
  const [minimumQualifiedQuests, setMinimumQualifiedQuests] = useState(1);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [campaignForm, setCampaignForm] = useState(initialCampaignForm);
  const [eventForm, setEventForm] = useState(initialEventForm);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectForm, setEditProjectForm] = useState(initialProjectForm);
  const [curationForms, setCurationForms] = useState<Record<string, { featured_rank: string; featured_until: string }>>({});
  const [form, setForm] = useState(initialForm);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [questStep, setQuestStep] = useState(0);
  const [campaignPurpose, setCampaignPurpose] = useState(campaignPurposes[0]);
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>("overview");
  const [questListFilter, setQuestListFilter] = useState<QuestListFilter>("active");
  const [campaignPartnerProjectIds, setCampaignPartnerProjectIds] = useState<Record<string, string>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const selectedProject = projects.find((project) => project.id === form.project_id);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === form.campaign_id);
  const selectedCampaignProject = projects.find((project) => project.id === campaignForm.project_id);
  const selectedEventProject = projects.find((project) => project.id === eventForm.project_id);
  const selectedEventCampaign = campaigns.find((campaign) => campaign.id === eventForm.campaign_id);
  const projectCampaigns = campaigns.filter((campaign) => canProjectUseCampaign(form.project_id, campaign) && campaign.status !== "archived");
  const eventProjectCampaigns = campaigns.filter((campaign) => campaign.project_id === eventForm.project_id && campaign.status !== "archived");
  const canCreateQuest = Boolean(selectedProject && selectedProject.status === "active");
  const canCreateCampaign = Boolean(selectedCampaignProject && selectedCampaignProject.status === "active");
  const canCreateEvent = Boolean(selectedEventProject && selectedEventProject.status === "active" && selectedEventCampaign);
  const xpPolicy = getQuestXpPolicy(form.quest_type, form.difficulty);
  const globalXpReward = calculateGlobalXp(form.xp_reward, form.quest_type, form.difficulty);
  const pendingSubmissionsCount = submissions.filter((submission) => submission.status === "submitted").length;
  const pendingProjectsCount = projects.filter((project) => project.status === "draft").length;
  const activeQuestsCount = managedQuests.filter((quest) => quest.status === "active" && !isQuestEnded(quest.ends_at)).length;
  const liveEventsCount = events.filter((event) => event.status === "active" && (!event.ends_at || !isQuestEnded(event.ends_at))).length;
  const filteredQualifiedUsers = useMemo(
    () =>
      qualifiedUsers.filter(
        (user) =>
          (!qualifiedProjectId || user.project_id === qualifiedProjectId) &&
          user.project_xp >= minimumQualifiedXp &&
          user.approved_quests >= minimumQualifiedQuests
      ),
    [minimumQualifiedQuests, minimumQualifiedXp, qualifiedProjectId, qualifiedUsers]
  );
  const visibleManagedQuests = useMemo(
    () =>
      managedQuests.filter((quest) => {
        const ended = isQuestEnded(quest.ends_at);
        if (questListFilter === "active") return quest.status === "active" && !ended;
        if (questListFilter === "ended") return quest.status !== "archived" && ended;
        if (questListFilter === "archived") return quest.status === "archived";
        return true;
      }),
    [managedQuests, questListFilter]
  );

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (studioTabs.some((item) => item.id === tab)) {
      setActiveStudioTab(tab as StudioTab);
    }
  }, []);

  const canAdvanceQuestStep =
    questStep === 0
      ? Boolean(form.project_id && canCreateQuest)
      : questStep === 1
        ? Boolean(selectedTemplate || campaignPurpose)
        : questStep === 2
          ? Boolean(form.title.trim() && form.description.trim())
          : questStep === 3
            ? Boolean(form.xp_reward && (!form.ends_at || !isQuestEnded(form.ends_at)))
            : true;

  function projectToForm(project: Project): ProjectInput {
    return {
      name: project.name,
      slug: project.slug,
      description: project.description ?? "",
      project_type: project.project_type,
      owner_wallet_address: project.owner_wallet_address,
      logo_url: project.logo_url ?? "",
      cover_image_url: project.cover_image_url ?? "",
      website_url: project.website_url ?? "",
      discord_url: project.discord_url ?? "",
      telegram_url: project.telegram_url ?? "",
      x_url: project.x_url ?? "",
      status: project.status
    };
  }

  useEffect(() => {
    if (!address) {
      setAdminContext(null);
      setProjects([]);
      setActiveProjects([]);
      setCampaigns([]);
      setEvents([]);
      setManagedQuests([]);
      setSubmissions([]);
      setQualifiedUsers([]);
      return;
    }

    getAdminContext(address).then(setAdminContext);
    getProjects().then(setActiveProjects).catch(() => setActiveProjects([]));
    getManageableProjects(address).then((projectRows) => {
      setProjects(projectRows);
      setForm((current) => ({
        ...current,
        project_id: current.project_id || projectRows[0]?.id || ""
      }));
      setCampaignForm((current) => ({
        ...current,
        project_id: current.project_id || projectRows[0]?.id || ""
      }));
      setEventForm((current) => ({
        ...current,
        project_id: current.project_id || projectRows[0]?.id || ""
      }));
    });
    getManageableCampaigns(address)
      .then((campaignRows) => {
        setCampaigns(campaignRows);
        setEventForm((current) => ({
          ...current,
          campaign_id: current.campaign_id || campaignRows.find((campaign) => campaign.project_id === current.project_id)?.id || campaignRows[0]?.id || ""
        }));
      })
      .catch((error) => {
        setCampaigns([]);
        setMessage(error instanceof Error ? error.message : "Failed to load campaigns.");
      });
    getManageableEvents(address).then(setEvents).catch(() => setEvents([]));
    getManageableQuests(address).then(setManagedQuests);
    getQuestSubmissions(address).then(setSubmissions);
    getQualifiedUsers(address).then(setQualifiedUsers);
  }, [address]);

  useEffect(() => {
    setCurationForms((current) => {
      const next = { ...current };
      for (const project of projects) {
        if (!next[project.id]) {
          next[project.id] = {
            featured_rank: String(project.featured_rank ?? 1),
            featured_until: toDatetimeLocalValue(project.featured_until)
          };
        }
      }
      return next;
    });
  }, [projects]);

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) {
      setMessage("Connect a wallet before creating a project.");
      return;
    }

    const project = await createProject({
      ...projectForm,
      owner_wallet_address: address ?? null
    });
    setProjects((current) => [project, ...current]);
    setForm((current) => ({ ...current, project_id: project.id }));
    setCampaignForm((current) => ({ ...current, project_id: project.id }));
    setEventForm((current) => ({ ...current, project_id: project.id }));
    setProjectForm(initialProjectForm);
    setMessage(project.status === "active" ? "Project created and active." : "Project submitted. Platform admin must approve it before it appears publicly.");
  }

  function handleEditProject(project: Project) {
    setEditingProjectId(project.id);
    setEditProjectForm(projectToForm(project));
    setMessage("Editing project profile. Save changes when ready.");
  }

  function handleCancelProjectEdit() {
    setEditingProjectId(null);
    setEditProjectForm(initialProjectForm);
  }

  async function handleProjectEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !editingProjectId) {
      setMessage("Connect the project owner wallet before editing a project.");
      return;
    }

    try {
      await updateProject(editingProjectId, editProjectForm, address);
      const projectRows = await getManageableProjects(address);
      setProjects(projectRows);
      setCampaigns(await getManageableCampaigns(address));
      setManagedQuests(await getManageableQuests(address));
      setEditingProjectId(null);
      setEditProjectForm(initialProjectForm);
      setMessage("Project profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update project.");
    }
  }

  async function handleCampaignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) {
      setMessage("Connect a project owner wallet before creating campaigns.");
      return;
    }

    if (!canCreateCampaign) {
      setMessage("Project is waiting for platform approval. You can create campaigns after it is approved.");
      return;
    }

    if (campaignForm.ends_at && isQuestEnded(campaignForm.ends_at)) {
      setMessage("Campaign end date must be in the future.");
      return;
    }

    try {
      const campaign = await createCampaign(campaignForm, address);
      setCampaigns((current) => [campaign, ...current]);
      setForm((current) => ({ ...current, project_id: campaign.project_id ?? current.project_id, campaign_id: campaign.id }));
      setCampaignPurpose(campaign.purpose || campaignPurposes[0]);
      setCampaignForm({ ...initialCampaignForm, project_id: campaign.project_id ?? "" });
      setMessage("Campaign created. You can now assign quests to it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create campaign.");
    }
  }

  async function handleAddCampaignPartner(campaign: Campaign) {
    if (!address) {
      setMessage("Connect the campaign owner wallet before adding partners.");
      return;
    }

    const partnerProjectId = campaignPartnerProjectIds[campaign.id];
    if (!partnerProjectId) {
      setMessage("Select a partner project first.");
      return;
    }

    try {
      await addCampaignPartner(campaign.id, partnerProjectId, address);
      setCampaigns(await getManageableCampaigns(address));
      setCampaignPartnerProjectIds((current) => ({ ...current, [campaign.id]: "" }));
      setMessage("Partner invite sent. The partner project owner must accept before they can add quests.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add campaign partner.");
    }
  }

  async function handleRemoveCampaignPartner(campaign: Campaign, partnerProjectId: string) {
    if (!address) {
      setMessage("Connect the campaign owner wallet before removing partners.");
      return;
    }

    try {
      await removeCampaignPartner(campaign.id, partnerProjectId, address);
      setCampaigns(await getManageableCampaigns(address));
      setMessage("Partner project removed from campaign.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to remove campaign partner.");
    }
  }

  async function handleReviewCampaignPartner(campaign: Campaign, partnerProjectId: string, status: "active" | "archived") {
    if (!address) {
      setMessage("Connect the partner project owner wallet before reviewing this invite.");
      return;
    }

    try {
      await reviewCampaignPartner(campaign.id, partnerProjectId, status, address);
      setCampaigns(await getManageableCampaigns(address));
      setMessage(status === "active" ? "Collab invite accepted." : "Collab invite rejected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to review campaign partner invite.");
    }
  }

  useEffect(() => {
    setEventForm((current) => {
      if (!current.project_id) return current;
      const campaignStillMatches = campaigns.some((campaign) => campaign.id === current.campaign_id && campaign.project_id === current.project_id);
      if (campaignStillMatches) return current;
      return {
        ...current,
        campaign_id: campaigns.find((campaign) => campaign.project_id === current.project_id && campaign.status !== "archived")?.id || ""
      };
    });
  }, [campaigns, eventForm.project_id]);

  async function handleEventSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) {
      setMessage("Connect a project owner wallet before creating events.");
      return;
    }

    if (!canCreateEvent) {
      setMessage("Select an approved project and campaign before creating an event.");
      return;
    }

    if (eventForm.ends_at && isQuestEnded(eventForm.ends_at)) {
      setMessage("Event end date must be in the future.");
      return;
    }

    try {
      const createdEvent = await createEvent(eventForm, address);
      setEvents((current) => [createdEvent, ...current]);
      setEventForm({
        ...initialEventForm,
        project_id: createdEvent.project_id,
        campaign_id: createdEvent.campaign_id,
        prize_currency: eventForm.prize_currency || "USDC"
      });
      setMessage("Event created. It is now visible on the events section.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create event.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) {
      setMessage("Connect a project owner wallet before creating quests.");
      return;
    }

    if (!canCreateQuest) {
      setMessage("Project is waiting for platform approval. You can create quests after it is approved.");
      return;
    }

    if (form.ends_at && isQuestEnded(form.ends_at)) {
      setMessage("Quest end date must be in the future.");
      return;
    }

    if (managedQuests.some((quest) => quest.project_id === form.project_id && quest.title.trim().toLowerCase() === form.title.trim().toLowerCase())) {
      setMessage("A quest with this title already exists in this project. Use a different title.");
      return;
    }

    try {
      const selectedProjectId = form.project_id;
      const selectedCampaignId = form.campaign_id ?? null;
      const xpReward = clampProjectXp(form.xp_reward, form.quest_type, form.difficulty);
      await createQuest(
        {
          ...form,
          xp_reward: xpReward,
          global_xp_reward: calculateGlobalXp(xpReward, form.quest_type, form.difficulty)
        },
        address
      );
      setManagedQuests(await getManageableQuests(address));
      setForm({ ...initialForm, project_id: selectedProjectId, campaign_id: selectedCampaignId });
      setSelectedTemplate("");
      setCampaignPurpose(campaignPurposes[0]);
      setQuestStep(0);
      setMessage("Quest created. It is now available on the dashboard.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create quest.");
    }
  }

  async function handleReview(submissionId: string, status: "approved" | "rejected") {
    await reviewQuestSubmission(submissionId, status, address, reviewNotes[submissionId] ?? "");
    setSubmissions(await getQuestSubmissions(address));
    setQualifiedUsers(await getQualifiedUsers(address));
    setReviewNotes((current) => ({ ...current, [submissionId]: "" }));
    setMessage(`Submission ${status}.`);
  }

  async function handleProjectReview(projectId: string, status: "active" | "archived") {
    await reviewProject(projectId, status, address);
    setProjects(await getManageableProjects(address));
    setMessage(status === "active" ? "Project approved." : "Project rejected.");
  }

  async function handleProjectCuration(project: Project, patch: Partial<Pick<Project, "is_verified" | "is_featured">>) {
    if (!address) {
      setMessage("Connect a platform admin wallet before curating projects.");
      return;
    }

    const curationForm = curationForms[project.id] ?? { featured_rank: String(project.featured_rank ?? 1), featured_until: toDatetimeLocalValue(project.featured_until) };
    const isFeatured = patch.is_featured ?? project.is_featured;
    const featuredRank = Math.min(5, Math.max(1, Number(curationForm.featured_rank || project.featured_rank || 1)));

    try {
      await updateProjectCuration(
        project.id,
        {
          is_verified: patch.is_verified ?? project.is_verified,
          is_featured: isFeatured,
          featured_rank: isFeatured ? featuredRank : null,
          featured_until: isFeatured ? fromDatetimeLocalValue(curationForm.featured_until) : null
        },
        address
      );
      setProjects(await getManageableProjects(address));
      setMessage("Project curation updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update project curation.");
    }
  }

  async function handleQuestStatus(questId: string, status: QuestStatus) {
    await updateQuestStatus(questId, status, address);
    setManagedQuests(await getManageableQuests(address));
    setMessage(status === "archived" ? "Quest archived." : "Quest reactivated.");
  }

  function handleUseQuestAsTemplate(quest: Quest) {
    setSelectedTemplate("");
    setForm({
      project_id: quest.project_id ?? "",
      campaign_id: quest.campaign_id ?? null,
      title: "",
      description: quest.description,
      task_url: quest.task_url ?? "",
      instructions: quest.instructions ?? "",
      proof_type: quest.proof_type,
      proof_placeholder: quest.proof_placeholder ?? "",
      proof_example: quest.proof_example ?? "",
      quest_type: quest.quest_type,
      difficulty: quest.difficulty,
      xp_reward: quest.xp_reward,
      global_xp_reward: quest.global_xp_reward,
      status: "active",
      category: quest.category,
      ends_at: null
    });
    setQuestStep(2);
    setMessage("Quest template loaded. Add a new title, adjust details, then create it.");
  }

  function applyQuestTemplate(templateName: string) {
    const template = questTemplates.find((item) => item.name === templateName);
    if (!template) return;
    const project = projects.find((item) => item.id === form.project_id);
    const taskUrl =
      template.name === "Follow X" || template.name === "Retweet X" || template.name === "Post on X"
        ? project?.x_url ?? ""
        : template.name === "Join Discord"
          ? project?.discord_url ?? ""
          : template.name === "Feedback" || template.name === "Read / Learn"
            ? project?.website_url ?? ""
            : "";

    setSelectedTemplate(template.name);
    setForm((current) => ({
      ...current,
      ...template.values,
      task_url: taskUrl,
      global_xp_reward: calculateGlobalXp(template.values.xp_reward, template.values.quest_type, template.values.difficulty)
    }));
  }

  function goToNextQuestStep() {
    if (!canAdvanceQuestStep) return;
    setQuestStep((current) => Math.min(current + 1, questWizardSteps.length - 1));
  }

  function goToPreviousQuestStep() {
    setQuestStep((current) => Math.max(current - 1, 0));
  }

  function updateQuestType(questType: QuestType) {
    const xpReward = clampProjectXp(form.xp_reward, questType, form.difficulty);
    setForm({
      ...form,
      quest_type: questType,
      xp_reward: xpReward,
      global_xp_reward: calculateGlobalXp(xpReward, questType, form.difficulty)
    });
  }

  function updateDifficulty(difficulty: QuestDifficulty) {
    const xpReward = clampProjectXp(form.xp_reward, form.quest_type, difficulty);
    setForm({
      ...form,
      difficulty,
      xp_reward: xpReward,
      global_xp_reward: calculateGlobalXp(xpReward, form.quest_type, difficulty)
    });
  }

  function updateXpReward(value: number) {
    const xpReward = clampProjectXp(value, form.quest_type, form.difficulty);
    setForm({
      ...form,
      xp_reward: xpReward,
      global_xp_reward: calculateGlobalXp(xpReward, form.quest_type, form.difficulty)
    });
  }

  function csvCell(value: string | number | null | undefined) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadQualifiedUsersCsv() {
    if (filteredQualifiedUsers.length === 0) {
      setMessage("No qualified users match the current filters.");
      return;
    }

    const selectedProjectName = projects.find((project) => project.id === qualifiedProjectId)?.slug ?? "all-projects";
    const rows = [
      ["wallet_address", "display_name", "project_name", "project_xp", "approved_quests", "qualified_at"],
      ...filteredQualifiedUsers.map((user) => [
        user.wallet_address,
        user.display_name ?? "",
        user.project_name,
        user.project_xp,
        user.approved_quests,
        user.qualified_at ?? ""
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `questora-qualified-users-${selectedProjectName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${filteredQualifiedUsers.length} qualified users.`);
  }

  async function downloadEventWinnersCsv(event: Event) {
    const winners = await getEventLeaderboard(event.id, 100);
    if (winners.length === 0) {
      setMessage("No approved event participants yet.");
      return;
    }

    const rows = [
      ["rank", "wallet_address", "display_name", "event_xp", "approved_quests", "event_name", "project_name"],
      ...winners.map((user, index) => [
        index + 1,
        user.wallet_address,
        user.display_name ?? "",
        user.total_xp,
        user.completed_quests ?? 0,
        event.name,
        event.project_name ?? ""
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `questora-event-winners-${event.slug}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${winners.length} event participants.`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <p className="font-semibold text-cyan-200">Studio</p>
      <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Create projects and quests</h1>
      <div className="mt-5 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-blue-100">
        {isConnected
          ? adminContext?.is_platform_admin
            ? `Connected as platform admin: ${address?.slice(0, 6)}...${address?.slice(-4)}`
            : `Connected: ${address?.slice(0, 6)}...${address?.slice(-4)}`
          : "Connect a wallet to create a project or manage owned projects."}
        {isConnected ? (
          <span className="mt-1 block text-xs text-blue-200">
            {adminContext?.is_platform_admin
              ? `Platform admin: reviews projects. Owned projects: ${adminContext.project_ids.length}`
              : `Manageable projects: ${adminContext?.project_ids.length ?? 0}`}
          </span>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-white/10 bg-[#0b1730]/92 p-2 shadow-glow">
        <div className="flex min-w-max gap-2">
          {studioTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStudioTab(tab.id)}
              className={`focus-ring rounded-lg px-4 py-3 text-sm font-black transition ${
                activeStudioTab === tab.id ? "bg-cyan-200 text-slate-950" : "bg-white/10 text-blue-100 hover:bg-white/15 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeStudioTab === "overview" ? (
        <>
          <section className="mt-8 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-6 shadow-glow">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-cyan-200">Campaign purpose</p>
            <h2 className="mt-2 text-2xl font-black text-white">Find the people who actually show up</h2>
            <p className="mt-3 max-w-2xl leading-7 text-blue-100">
              Use quests to qualify members for whitelists, early access, community rewards, beta testing, and contributor programs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
            {campaignPurposes.map((purpose) => (
              <span key={purpose} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-50">
                {purpose}
              </span>
            ))}
          </div>
        </div>
      </section>

          <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Projects</p>
              <p className="mt-2 text-3xl font-black text-white">{projects.length}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">{pendingProjectsCount} waiting review</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Campaigns</p>
              <p className="mt-2 text-3xl font-black text-white">{campaigns.length}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">Across owned projects</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Live events</p>
              <p className="mt-2 text-3xl font-black text-white">{liveEventsCount}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">{events.length} total events</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Active quests</p>
              <p className="mt-2 text-3xl font-black text-white">{activeQuestsCount}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">{managedQuests.length} total manageable</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Pending reviews</p>
              <p className="mt-2 text-3xl font-black text-white">{pendingSubmissionsCount}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">Quest submissions</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-5 shadow-glow">
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Qualified users</p>
              <p className="mt-2 text-3xl font-black text-white">{filteredQualifiedUsers.length}</p>
              <p className="mt-1 text-xs font-semibold text-blue-200">Ready for export</p>
            </div>
          </section>
        </>
      ) : null}

      {activeStudioTab === "exports" ? (
      <section className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="flex items-start gap-3">
            <UsersRound className="mt-1 text-cyan-200" />
            <div>
              <h2 className="text-xl font-black text-white">Qualified users</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
                Export approved contributors as a CSV wallet list for whitelist, rewards, beta access, or manual review.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={downloadQualifiedUsersCsv}
            disabled={!isConnected || filteredQualifiedUsers.length === 0}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={18} />
            Download CSV
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-sm font-bold text-blue-100">Project</span>
            <select
              value={qualifiedProjectId}
              onChange={(event) => setQualifiedProjectId(event.target.value)}
              className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
            >
              <option value="">All manageable projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-blue-100">Minimum project XP</span>
            <input
              type="number"
              min={0}
              value={minimumQualifiedXp}
              onChange={(event) => setMinimumQualifiedXp(Number(event.target.value))}
              className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-blue-100">Minimum approved quests</span>
            <input
              type="number"
              min={1}
              value={minimumQualifiedQuests}
              onChange={(event) => setMinimumQualifiedQuests(Number(event.target.value))}
              className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
            />
          </label>
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/10">
          <div className="grid grid-cols-2 gap-3 border-b border-white/10 p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Matched users</p>
              <p className="mt-1 text-2xl font-black text-white">{filteredQualifiedUsers.length}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Approved quests</p>
              <p className="mt-1 text-2xl font-black text-white">{filteredQualifiedUsers.reduce((total, user) => total + user.approved_quests, 0)}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">Project XP</p>
              <p className="mt-1 text-2xl font-black text-white">{filteredQualifiedUsers.reduce((total, user) => total + user.project_xp, 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-200">CSV ready</p>
              <p className="mt-1 text-2xl font-black text-white">{filteredQualifiedUsers.length > 0 ? "Yes" : "No"}</p>
            </div>
          </div>

          <div className="max-h-80 overflow-auto">
            {!isConnected ? (
              <p className="p-4 text-blue-100">Connect a project owner wallet to view qualified users.</p>
            ) : filteredQualifiedUsers.length === 0 ? (
              <p className="p-4 text-blue-100">No approved contributors match these filters yet.</p>
            ) : (
              filteredQualifiedUsers.slice(0, 8).map((user) => (
                <div key={`${user.project_id}-${user.user_id}`} className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-base-blue">
                        {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={18} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{user.display_name || "Questora member"}</p>
                        <p className="break-all text-xs text-blue-100">{user.wallet_address}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-blue-200">{user.project_name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">{user.project_xp.toLocaleString()} XP</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-100">{user.approved_quests} approved</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeStudioTab === "projects" ? (
        <>
      <form onSubmit={handleProjectSubmit} className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex items-center gap-3">
          <FolderPlus className="text-cyan-200" />
          <h2 className="text-xl font-black text-white">Create project</h2>
        </div>
        <div className="mt-5 grid gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Project name</span>
              <input
                required
                value={projectForm.name}
                onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="Base NFT Guild"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Slug</span>
              <input
                value={projectForm.slug}
                onChange={(event) => setProjectForm({ ...projectForm, slug: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="base-nft-guild"
              />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-blue-100">Project type</span>
            <select
              value={projectForm.project_type}
              onChange={(event) => setProjectForm({ ...projectForm, project_type: event.target.value as ProjectType })}
              className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
            >
              {projectTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-blue-100">Description</span>
            <textarea
              value={projectForm.description ?? ""}
              onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })}
              className="focus-ring min-h-24 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
              placeholder="What is this project/community about?"
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Logo URL</span>
              <input
                value={projectForm.logo_url ?? ""}
                onChange={(event) => setProjectForm({ ...projectForm, logo_url: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="https://..."
              />
              <span className="text-xs text-blue-200">Imgur works best with direct image links like https://i.imgur.com/id.png</span>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Cover image URL</span>
              <input
                value={projectForm.cover_image_url ?? ""}
                onChange={(event) => setProjectForm({ ...projectForm, cover_image_url: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="https://..."
              />
              <span className="text-xs text-blue-200">Use a direct image URL, not an album or gallery page.</span>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Website</span>
              <input
                value={projectForm.website_url ?? ""}
                onChange={(event) => setProjectForm({ ...projectForm, website_url: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="https://..."
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Discord</span>
              <input
                value={projectForm.discord_url ?? ""}
                onChange={(event) => setProjectForm({ ...projectForm, discord_url: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="https://discord.gg/..."
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Telegram</span>
              <input
                value={projectForm.telegram_url ?? ""}
                onChange={(event) => setProjectForm({ ...projectForm, telegram_url: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="https://t.me/..."
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">X URL</span>
              <input
                value={projectForm.x_url ?? ""}
                onChange={(event) => setProjectForm({ ...projectForm, x_url: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="https://x.com/..."
              />
            </label>
          </div>
        </div>
        <button
          type="submit"
          disabled={!isConnected}
          className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-bold text-base-blue transition hover:bg-blue-50 sm:w-auto"
        >
          <FolderPlus size={20} />
          Create project
        </button>
      </form>

      <section className="mt-6 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex items-center gap-3">
          <Pencil className="text-cyan-200" />
          <h2 className="text-xl font-black text-white">Manage projects</h2>
        </div>
        <div className="mt-5 grid gap-3">
          {!isConnected ? (
            <p className="text-blue-100">Connect a project owner wallet to edit project profiles.</p>
          ) : projects.length === 0 ? (
            <p className="text-blue-100">No manageable projects for this wallet yet.</p>
          ) : (
            projects.map((project) => (
              <article key={project.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                {editingProjectId === project.id ? (
                  <form onSubmit={handleProjectEditSubmit} className="grid gap-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Project name</span>
                        <input
                          required
                          value={editProjectForm.name}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, name: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Slug</span>
                        <input
                          value={editProjectForm.slug}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, slug: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                        <span className="text-xs text-blue-200">Changing slug changes the project URL.</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Project type</span>
                        <select
                          value={editProjectForm.project_type}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, project_type: event.target.value as ProjectType })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                        >
                          {projectTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Status</span>
                        <input
                          value={project.status}
                          disabled
                          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-blue-100"
                        />
                      </label>
                    </div>
                    <label className="grid gap-2">
                      <span className="text-sm font-bold text-blue-100">Description</span>
                      <textarea
                        value={editProjectForm.description ?? ""}
                        onChange={(event) => setEditProjectForm({ ...editProjectForm, description: event.target.value })}
                        className="focus-ring min-h-24 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                      />
                    </label>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Logo URL</span>
                        <input
                          value={editProjectForm.logo_url ?? ""}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, logo_url: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Cover image URL</span>
                        <input
                          value={editProjectForm.cover_image_url ?? ""}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, cover_image_url: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Website</span>
                        <input
                          value={editProjectForm.website_url ?? ""}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, website_url: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Discord</span>
                        <input
                          value={editProjectForm.discord_url ?? ""}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, discord_url: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">Telegram</span>
                        <input
                          value={editProjectForm.telegram_url ?? ""}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, telegram_url: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-sm font-bold text-blue-100">X URL</span>
                        <input
                          value={editProjectForm.x_url ?? ""}
                          onChange={(event) => setEditProjectForm({ ...editProjectForm, x_url: event.target.value })}
                          className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                        />
                      </label>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="submit" className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 font-black text-slate-950">
                        <Save size={18} />
                        Save project
                      </button>
                      <button type="button" onClick={handleCancelProjectEdit} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 font-black text-white">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{project.status}</span>
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{project.project_type}</span>
                        {project.is_verified ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950"><ShieldCheck size={13} /> Verified</span> : null}
                        {project.is_featured ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-300 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950"><Star size={13} /> Top #{project.featured_rank ?? 1}</span> : null}
                      </div>
                      <h3 className="mt-3 font-black text-white">{project.name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-blue-100">{project.description || "No description"}</p>
                      <p className="mt-2 break-all text-xs text-blue-200">/{project.slug}</p>
                    </div>
                    <div className="flex flex-col gap-2 md:min-w-72">
                      {adminContext?.is_platform_admin ? (
                        <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-3">
                          <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Platform curation</p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleProjectCuration(project, { is_verified: !project.is_verified })}
                              className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black ${project.is_verified ? "bg-emerald-300 text-slate-950" : "bg-white/10 text-white"}`}
                            >
                              <ShieldCheck size={16} />
                              {project.is_verified ? "Verified" : "Verify"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProjectCuration(project, { is_featured: !project.is_featured })}
                              className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black ${project.is_featured ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"}`}
                            >
                              <Star size={16} />
                              {project.is_featured ? "Featured" : "Feature"}
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-[88px_1fr_auto] gap-2">
                            <select
                              value={curationForms[project.id]?.featured_rank ?? String(project.featured_rank ?? 1)}
                              onChange={(event) =>
                                setCurationForms((current) => ({
                                  ...current,
                                  [project.id]: {
                                    featured_rank: event.target.value,
                                    featured_until: current[project.id]?.featured_until ?? toDatetimeLocalValue(project.featured_until)
                                  }
                                }))
                              }
                              className="focus-ring rounded-lg border border-white/10 bg-white/10 px-2 py-2 text-sm font-bold text-white"
                            >
                              {[1, 2, 3, 4, 5].map((rank) => (
                                <option key={rank} value={rank}>
                                  #{rank}
                                </option>
                              ))}
                            </select>
                            <input
                              type="datetime-local"
                              value={curationForms[project.id]?.featured_until ?? toDatetimeLocalValue(project.featured_until)}
                              onChange={(event) =>
                                setCurationForms((current) => ({
                                  ...current,
                                  [project.id]: {
                                    featured_rank: current[project.id]?.featured_rank ?? String(project.featured_rank ?? 1),
                                    featured_until: event.target.value
                                  }
                                }))
                              }
                              className="focus-ring min-w-0 rounded-lg border border-white/10 bg-white/10 px-2 py-2 text-sm text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleProjectCuration(project, {})}
                              className="focus-ring rounded-lg bg-white px-3 py-2 text-sm font-black text-base-blue"
                            >
                              Save
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-blue-200">Leave date empty for no expiry.</p>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleEditProject(project)}
                        className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-base-blue"
                      >
                        <Pencil size={16} />
                        Edit
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>
        </>
      ) : null}

      {activeStudioTab === "quests" ? (
        <>
      <form onSubmit={handleSubmit} className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="flex items-center gap-3">
            <PlusCircle className="text-cyan-200" />
            <div>
              <h2 className="text-xl font-black text-white">Create quest</h2>
              <p className="mt-1 text-sm font-semibold text-blue-100">Build one campaign task at a time with clear member instructions.</p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {questWizardSteps.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setQuestStep(index)}
                className={`focus-ring h-10 min-w-10 rounded-lg border px-2 text-xs font-black transition ${
                  questStep === index ? "border-cyan-200 bg-cyan-200 text-slate-950" : "border-white/10 bg-white/10 text-blue-100 hover:border-cyan-200/60"
                }`}
                aria-label={`Go to ${step} step`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
          <div className="h-1 bg-white/10">
            <div className="h-full bg-cyan-200 transition-all" style={{ width: `${((questStep + 1) / questWizardSteps.length) * 100}%` }} />
          </div>
          <div className="grid gap-6 p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Step {questStep + 1} of {questWizardSteps.length}</p>
              <h3 className="mt-1 text-2xl font-black text-white">{questWizardSteps[questStep]}</h3>
            </div>

            {questStep === 0 ? (
              <div className="grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Project</span>
                  <select
                    required
                    value={form.project_id ?? ""}
                    onChange={(event) => setForm({ ...form, project_id: event.target.value, campaign_id: null })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} - {project.status === "active" ? "active" : "waiting approval"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Campaign</span>
                  <select
                    value={form.campaign_id ?? ""}
                    onChange={(event) => setForm({ ...form, campaign_id: event.target.value || null })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="">No campaign</option>
                    {projectCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}{campaign.project_id === form.project_id ? "" : " (collab)"}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-blue-200">Optional, but recommended for whitelist, beta, and reward programs.</span>
                </label>
                {selectedProject ? (
                  <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
                    <p className="font-black text-white">{selectedProject.name}</p>
                    <p className="mt-2 text-sm leading-6 text-blue-100">{selectedProject.description || "No project description yet."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wider text-base-blue">{selectedProject.project_type}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-100">{selectedProject.status}</span>
                    </div>
                  </div>
                ) : null}
                {selectedProject && selectedProject.status !== "active" ? (
                  <span className="rounded-lg border border-cyan-200/30 bg-cyan-200/10 px-4 py-3 text-sm font-semibold text-cyan-100">
                    Waiting for platform approval. Quest creation is locked until this project is approved.
                  </span>
                ) : null}
              </div>
            ) : null}

            {questStep === 1 ? (
              <div className="grid gap-5">
                <div className="grid gap-3">
                  <span className="text-sm font-bold text-blue-100">Campaign purpose</span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {campaignPurposes.map((purpose) => (
                      <button
                        key={purpose}
                        type="button"
                        onClick={() => setCampaignPurpose(purpose)}
                        className={`focus-ring rounded-lg border px-4 py-3 text-left text-sm font-black transition ${
                          campaignPurpose === purpose ? "border-cyan-200 bg-cyan-200 text-slate-950" : "border-white/10 bg-white/10 text-white hover:border-cyan-200/60"
                        }`}
                      >
                        {purpose}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  <span className="text-sm font-bold text-blue-100">Quest template</span>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {questTemplates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        onClick={() => applyQuestTemplate(template.name)}
                        className={`focus-ring rounded-lg border p-4 text-left transition ${
                          selectedTemplate === template.name ? "border-cyan-200 bg-cyan-200/15" : "border-white/10 bg-white/10 hover:border-cyan-200/60"
                        }`}
                      >
                        <p className="font-black text-white">{template.name}</p>
                        <p className="mt-2 text-sm leading-5 text-blue-100">{template.summary}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {questStep === 2 ? (
              <div className="grid gap-5">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Title</span>
                  <input
                    required
                    value={form.title}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="Join the Discord"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Task link</span>
                  <input
                    value={form.task_url ?? ""}
                    onChange={(event) => setForm({ ...form, task_url: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="https://x.com/project, https://discord.gg/..., article URL, app URL"
                  />
                  <span className="text-xs text-blue-200">This becomes the direct action button on the quest card.</span>
                </label>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Description</span>
                    <textarea
                      required
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      className="focus-ring min-h-36 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                      placeholder="Tell members what to do and what proof is expected."
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Step-by-step instructions</span>
                    <textarea
                      value={form.instructions ?? ""}
                      onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                      className="focus-ring min-h-36 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                      placeholder="Example: Open the post, repost it, then submit your repost URL."
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Proof type</span>
                    <select
                      value={form.proof_type}
                      onChange={(event) => setForm({ ...form, proof_type: event.target.value as QuestInput["proof_type"] })}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    >
                      <option value="text">Text proof</option>
                      <option value="url">Link proof</option>
                      <option value="tweet">X post URL</option>
                      <option value="discord">Discord username</option>
                      <option value="wallet">Wallet / tx proof</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Category</span>
                    <select
                      value={form.category}
                      onChange={(event) => setForm({ ...form, category: event.target.value })}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    >
                      <option>Community</option>
                      <option>Onchain</option>
                      <option>Social</option>
                      <option>Learning</option>
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Proof placeholder</span>
                    <input
                      value={form.proof_placeholder ?? ""}
                      onChange={(event) => setForm({ ...form, proof_placeholder: event.target.value })}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                      placeholder="https://x.com/yourname/status/..."
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Proof example</span>
                    <input
                      value={form.proof_example ?? ""}
                      onChange={(event) => setForm({ ...form, proof_example: event.target.value })}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                      placeholder="https://x.com/questora_xyz/status/123"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {questStep === 3 ? (
              <div className="grid gap-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Quest type</span>
                    <select
                      value={form.quest_type}
                      onChange={(event) => updateQuestType(event.target.value as QuestType)}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    >
                      {questTypes.map((type) => (
                        <option key={type} value={type}>
                          {questTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Difficulty</span>
                    <select
                      value={form.difficulty}
                      onChange={(event) => updateDifficulty(event.target.value as QuestDifficulty)}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    >
                      {questDifficulties.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficultyLabels[difficulty]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">XP reward</span>
                    <input
                      required
                      type="number"
                      min={xpPolicy.min}
                      max={xpPolicy.max}
                      value={form.xp_reward}
                      onChange={(event) => updateXpReward(Number(event.target.value))}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    />
                    <span className="text-xs text-blue-200">
                      Range {xpPolicy.min}-{xpPolicy.max} project XP. Global XP: {globalXpReward}.
                    </span>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-bold text-blue-100">Status</span>
                    <select
                      value={form.status}
                      onChange={(event) => setForm({ ...form, status: event.target.value as QuestStatus })}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  <label className="grid gap-2 lg:col-span-2">
                    <span className="text-sm font-bold text-blue-100">End date</span>
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(form.ends_at)}
                      onChange={(event) => setForm({ ...form, ends_at: fromDatetimeLocalValue(event.target.value) })}
                      className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                    />
                    <span className="text-xs text-blue-200">Leave empty if this quest has no deadline.</span>
                  </label>
                </div>
                <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 shrink-0 text-cyan-200" size={20} />
                    <div>
                      <p className="font-black text-white">Anti-farming XP rules</p>
                      <p className="mt-2 text-sm leading-6 text-blue-100">
                        Project XP can be tuned inside this range for the project leaderboard. Global XP is capped by Questora and currently awards {globalXpReward} XP for this quest.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {questStep === 4 ? (
              <div className="grid gap-5">
                <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Quest preview</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{selectedProject?.name ?? "Project"}</span>
                    {selectedCampaign ? <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{selectedCampaign.name}</span> : null}
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{campaignPurpose}</span>
                    <span className="rounded-full bg-cyan-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-100">{form.proof_type}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{questTypeLabels[form.quest_type]}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{difficultyLabels[form.difficulty]}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">
                      {form.ends_at ? `Ends ${formatQuestDeadline(form.ends_at)}` : "No deadline"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-black text-white">{form.title || "Untitled quest"}</h3>
                  <p className="mt-3 text-sm leading-6 text-blue-100">{form.description || "Add a description before publishing."}</p>
                  {form.task_url ? (
                    <p className="mt-3 break-all rounded-lg bg-white/10 p-3 text-sm font-semibold text-cyan-100">{form.task_url}</p>
                  ) : null}
                  {form.instructions ? <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm leading-6 text-blue-50">{form.instructions}</p> : null}
                  <p className="mt-4 font-black text-cyan-200">
                    {form.xp_reward.toLocaleString()} project XP / {globalXpReward.toLocaleString()} global XP
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={!canCreateQuest || !form.title.trim() || !form.description.trim()}
                  className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-base-blue px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <PlusCircle size={20} />
                  Create quest
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row">
          <button
            type="button"
            onClick={goToPreviousQuestStep}
            disabled={questStep === 0}
            className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/10 px-5 py-3 font-bold text-white transition hover:border-cyan-200/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          {questStep < questWizardSteps.length - 1 ? (
            <button
              type="button"
              onClick={goToNextQuestStep}
              disabled={!canAdvanceQuestStep}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-200 px-5 py-3 font-black text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
              <ArrowRight size={18} />
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-4 text-sm font-semibold text-cyan-200">{message}</p> : null}
      </form>

      <section className="mt-6 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <Archive className="text-cyan-200" />
            <div>
              <h2 className="text-xl font-black text-white">Manage quests</h2>
              <p className="mt-1 text-sm font-semibold text-blue-100">Archived and ended quests are hidden from the active view.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {questListFilters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setQuestListFilter(filter.id)}
                className={`focus-ring rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition ${
                  questListFilter === filter.id ? "bg-cyan-200 text-slate-950" : "bg-white/10 text-blue-100 hover:bg-white/15 hover:text-white"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {!isConnected ? (
            <p className="text-blue-100">Connect a project owner wallet to manage quests.</p>
          ) : managedQuests.length === 0 ? (
            <p className="text-blue-100">No quests available for this wallet yet.</p>
          ) : visibleManagedQuests.length === 0 ? (
            <p className="text-blue-100">No {questListFilter} quests in this view.</p>
          ) : (
            visibleManagedQuests.map((quest) => {
              const ended = isQuestEnded(quest.ends_at);
              const questCampaign = campaigns.find((campaign) => campaign.id === quest.campaign_id);
              return (
              <article key={quest.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      {quest.project_name ? <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{quest.project_name}</span> : null}
                      {questCampaign ? <span className="rounded-full bg-cyan-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-100">{questCampaign.name}</span> : null}
                      <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{ended ? "ended" : quest.status}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{quest.category}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{questTypeLabels[quest.quest_type]}</span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{difficultyLabels[quest.difficulty]}</span>
                    </div>
                    <h3 className="mt-3 font-black text-white">{quest.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-blue-100">{quest.description}</p>
                    {quest.ends_at ? <p className="mt-2 text-xs font-semibold text-blue-200">Ends at {formatQuestDeadline(quest.ends_at)}</p> : null}
                    <p className="mt-3 font-black text-cyan-200">
                      {quest.xp_reward.toLocaleString()} project XP / {quest.global_xp_reward.toLocaleString()} global XP
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleUseQuestAsTemplate(quest)}
                      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-base-blue"
                    >
                      <Wand2 size={16} />
                      Use template
                    </button>
                    {quest.status === "archived" ? (
                      <button
                        type="button"
                        onClick={() => handleQuestStatus(quest.id, "active")}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-slate-950"
                      >
                        <RotateCcw size={16} />
                        Reactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleQuestStatus(quest.id, "archived")}
                        className="focus-ring inline-flex items-center gap-2 rounded-lg bg-rose-400 px-3 py-2 text-sm font-black text-slate-950"
                      >
                        <Archive size={16} />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </article>
              );
            })
          )}
        </div>
      </section>
        </>
      ) : null}

      {activeStudioTab === "projects" && adminContext?.is_platform_admin ? (
        <section className="mt-6 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="flex items-center gap-3">
            <FolderPlus className="text-cyan-200" />
            <h2 className="text-xl font-black text-white">Review projects</h2>
          </div>
          <div className="mt-5 grid gap-3">
            {projects.filter((project) => project.status === "draft").length === 0 ? (
              <p className="text-blue-100">No pending projects.</p>
            ) : (
              projects
                .filter((project) => project.status === "draft")
                .map((project) => (
                  <article key={project.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{project.status}</span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{project.project_type}</span>
                        </div>
                        <h3 className="mt-3 font-black text-white">{project.name}</h3>
                        <p className="mt-1 text-sm text-blue-100">{project.description || "No description"}</p>
                        <p className="mt-2 break-all text-xs text-blue-200">Owner: {project.owner_wallet_address}</p>
                        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                          <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Review links</p>
                          {getProjectReviewLinks(project).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {getProjectReviewLinks(project).map((link) => (
                                <a
                                  key={`${project.id}-${link.label}`}
                                  href={link.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="focus-ring inline-flex max-w-full items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-black text-base-blue transition hover:bg-cyan-100"
                                >
                                  <span className="truncate">{link.label}</span>
                                  <ExternalLink size={13} className="shrink-0" />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-sm font-semibold text-blue-100">No website or social links submitted.</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleProjectReview(project.id, "active")}
                          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-slate-950"
                        >
                          <CheckCircle2 size={16} />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleProjectReview(project.id, "archived")}
                          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-rose-400 px-3 py-2 text-sm font-black text-slate-950"
                        >
                          <XCircle size={16} />
                          Reject
                        </button>
                      </div>
                    </div>
                  </article>
                ))
            )}
          </div>
        </section>
      ) : null}

      {activeStudioTab === "campaigns" ? (
        <>
          <form onSubmit={handleCampaignSubmit} className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
            <div className="flex items-center gap-3">
              <FolderPlus className="text-cyan-200" />
              <div>
                <h2 className="text-xl font-black text-white">Create campaign</h2>
                <p className="mt-1 text-sm font-semibold text-blue-100">Group quests into a whitelist, beta, reward, or contributor program.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Project</span>
                  <select
                    required
                    value={campaignForm.project_id ?? ""}
                    onChange={(event) => setCampaignForm({ ...campaignForm, project_id: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} - {project.status === "active" ? "active" : "waiting approval"}
                      </option>
                    ))}
                  </select>
                  {selectedCampaignProject && selectedCampaignProject.status !== "active" ? (
                    <span className="text-xs font-semibold text-cyan-200">Campaign creation unlocks after this project is approved.</span>
                  ) : null}
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Purpose</span>
                  <select
                    value={campaignForm.purpose ?? campaignPurposes[0]}
                    onChange={(event) => setCampaignForm({ ...campaignForm, purpose: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    {campaignPurposes.map((purpose) => (
                      <option key={purpose}>{purpose}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Campaign name</span>
                  <input
                    required
                    value={campaignForm.name}
                    onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="Whitelist Season 1"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Slug</span>
                  <input
                    value={campaignForm.slug}
                    onChange={(event) => setCampaignForm({ ...campaignForm, slug: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="whitelist-season-1"
                  />
                </label>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-blue-100">Description</span>
                <textarea
                  value={campaignForm.description ?? ""}
                  onChange={(event) => setCampaignForm({ ...campaignForm, description: event.target.value })}
                  className="focus-ring min-h-28 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                  placeholder="Explain who this campaign is for and what contributors can earn or qualify for."
                />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Status</span>
                  <select
                    value={campaignForm.status}
                    onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value as QuestStatus })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Starts</span>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(campaignForm.starts_at)}
                    onChange={(event) => setCampaignForm({ ...campaignForm, starts_at: fromDatetimeLocalValue(event.target.value) })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Ends</span>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(campaignForm.ends_at)}
                    onChange={(event) => setCampaignForm({ ...campaignForm, ends_at: fromDatetimeLocalValue(event.target.value) })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  />
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={!canCreateCampaign}
              className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-base-blue px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <FolderPlus size={20} />
              Create campaign
            </button>
            {message ? <p className="mt-4 text-sm font-semibold text-cyan-200">{message}</p> : null}
          </form>

          <section className="mt-6 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
            <div className="flex items-center gap-3">
              <Archive className="text-cyan-200" />
              <h2 className="text-xl font-black text-white">Manage campaigns</h2>
            </div>
            <div className="mt-5 grid gap-3">
              {!isConnected ? (
                <p className="text-blue-100">Connect a project owner wallet to manage campaigns.</p>
              ) : campaigns.length === 0 ? (
                <p className="text-blue-100">No campaigns yet. Create one to group related quests.</p>
              ) : (
                campaigns.map((campaign) => (
                  <article key={campaign.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{campaign.project_name ?? "Project"}</span>
                          <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{campaign.status}</span>
                          {campaign.purpose ? <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{campaign.purpose}</span> : null}
                        </div>
                        <h3 className="mt-3 font-black text-white">{campaign.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-blue-100">{campaign.description || "No campaign description yet."}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-blue-200">
                          <span>/{campaign.slug}</span>
                          {campaign.starts_at ? <span>Starts {formatQuestDeadline(campaign.starts_at)}</span> : null}
                          {campaign.ends_at ? <span>Ends {formatQuestDeadline(campaign.ends_at)}</span> : null}
                        </div>
                        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider text-cyan-200">Collab partners</p>
                              {campaign.partner_projects && campaign.partner_projects.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                              {campaign.partner_projects.map((partner) => (
                                <div key={partner.id} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 py-1 pl-1 pr-2 text-xs font-black text-white">
                                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-base-blue">
                                    <ProjectImage src={partner.logo_url} name={partner.name} variant="logo" />
                                  </span>
                                  <span>{partner.name}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${campaign.partner_statuses?.[partner.id] === "active" ? "bg-emerald-300 text-slate-950" : campaign.partner_statuses?.[partner.id] === "archived" ? "bg-rose-400 text-slate-950" : "bg-amber-300 text-slate-950"}`}>
                                    {campaign.partner_statuses?.[partner.id] === "active" ? "Accepted" : campaign.partner_statuses?.[partner.id] === "archived" ? "Rejected" : "Pending"}
                                  </span>
                                  {campaign.partner_statuses?.[partner.id] === "draft" && adminContext?.project_ids.includes(partner.id) ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewCampaignPartner(campaign, partner.id, "active")}
                                        className="focus-ring rounded-full bg-emerald-300 px-2 py-0.5 text-[10px] font-black text-slate-950"
                                      >
                                        Accept
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleReviewCampaignPartner(campaign, partner.id, "archived")}
                                        className="focus-ring rounded-full bg-rose-400 px-2 py-0.5 text-[10px] font-black text-slate-950"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : null}
                                  {adminContext?.is_platform_admin || adminContext?.project_ids.includes(campaign.project_id ?? "") ? (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCampaignPartner(campaign, partner.id)}
                                      className="focus-ring rounded-full bg-rose-400 px-2 py-0.5 text-[10px] font-black text-slate-950"
                                        >
                                          Remove
                                        </button>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm font-semibold text-blue-100">No partner projects yet.</p>
                              )}
                            </div>
                            {adminContext?.is_platform_admin || adminContext?.project_ids.includes(campaign.project_id ?? "") ? (
                              <div className="grid gap-2 sm:min-w-72">
                                <select
                                  value={campaignPartnerProjectIds[campaign.id] ?? ""}
                                  onChange={(event) => setCampaignPartnerProjectIds((current) => ({ ...current, [campaign.id]: event.target.value }))}
                                  className="focus-ring rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-white"
                                >
                                  <option value="">Select partner project</option>
                                  {activeProjects
                                    .filter((project) => project.id !== campaign.project_id && !campaign.partner_projects?.some((partner) => partner.id === project.id))
                                    .map((project) => (
                                      <option key={project.id} value={project.id}>
                                        {project.name}
                                      </option>
                                    ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleAddCampaignPartner(campaign)}
                                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-base-blue"
                                >
                                  <PlusCircle size={16} />
                                  Invite partner
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm font-semibold text-blue-100 lg:max-w-xs">Partner campaign. You can add quests from your project, but only the campaign owner can manage partners.</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/10 px-4 py-3 text-sm font-black text-cyan-200">
                        {managedQuests.filter((quest) => quest.campaign_id === campaign.id).length} quests
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {activeStudioTab === "events" ? (
        <>
          <form onSubmit={handleEventSubmit} className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
            <div className="flex items-center gap-3">
              <Gift className="text-cyan-200" />
              <div>
                <h2 className="text-xl font-black text-white">Create event</h2>
                <p className="mt-1 text-sm font-semibold text-blue-100">Turn a campaign into a public event with a prize pool, deadline, and event leaderboard.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Project</span>
                  <select
                    required
                    value={eventForm.project_id}
                    onChange={(event) => setEventForm({ ...eventForm, project_id: event.target.value, campaign_id: campaigns.find((campaign) => campaign.project_id === event.target.value)?.id || "" })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="">Select project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} - {project.status === "active" ? "active" : "waiting approval"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Campaign</span>
                  <select
                    required
                    value={eventForm.campaign_id}
                    onChange={(event) => setEventForm({ ...eventForm, campaign_id: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="">Select campaign</option>
                    {eventProjectCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                  {eventProjectCampaigns.length === 0 ? <span className="text-xs font-semibold text-cyan-200">Create a campaign before launching an event.</span> : null}
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Event name</span>
                  <input
                    required
                    value={eventForm.name}
                    onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="Launch Sprint"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Slug</span>
                  <input
                    value={eventForm.slug}
                    onChange={(event) => setEventForm({ ...eventForm, slug: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="launch-sprint"
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-blue-100">Description</span>
                <textarea
                  value={eventForm.description ?? ""}
                  onChange={(event) => setEventForm({ ...eventForm, description: event.target.value })}
                  className="focus-ring min-h-24 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                  placeholder="Describe the event, who should join, and what contributors can win."
                />
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Prize pool</span>
                  <input
                    value={eventForm.prize_pool ?? ""}
                    onChange={(event) => setEventForm({ ...eventForm, prize_pool: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="500"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Currency / prize</span>
                  <input
                    value={eventForm.prize_currency ?? ""}
                    onChange={(event) => setEventForm({ ...eventForm, prize_currency: event.target.value })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                    placeholder="USDC, NFT, WL spots"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Reward method</span>
                  <select
                    value={eventForm.reward_type}
                    onChange={(event) => setEventForm({ ...eventForm, reward_type: event.target.value as EventRewardType })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    {eventRewardTypes.map((type) => (
                      <option key={type} value={type}>
                        {eventRewardTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Status</span>
                  <select
                    value={eventForm.status}
                    onChange={(event) => setEventForm({ ...eventForm, status: event.target.value as QuestStatus })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Starts</span>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(eventForm.starts_at)}
                    onChange={(event) => setEventForm({ ...eventForm, starts_at: fromDatetimeLocalValue(event.target.value) })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-bold text-blue-100">Ends</span>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(eventForm.ends_at)}
                    onChange={(event) => setEventForm({ ...eventForm, ends_at: fromDatetimeLocalValue(event.target.value) })}
                    className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white"
                  />
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-bold text-blue-100">Cover image URL</span>
                <input
                  value={eventForm.cover_image_url ?? ""}
                  onChange={(event) => setEventForm({ ...eventForm, cover_image_url: event.target.value })}
                  className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                  placeholder="https://..."
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-blue-100">Rules</span>
                <textarea
                  value={eventForm.rules ?? ""}
                  onChange={(event) => setEventForm({ ...eventForm, rules: event.target.value })}
                  className="focus-ring min-h-24 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                  placeholder="Explain winner selection, eligibility, and any prize distribution rules."
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={!canCreateEvent}
              className="focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-base-blue px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Gift size={20} />
              Create event
            </button>
            {message ? <p className="mt-4 text-sm font-semibold text-cyan-200">{message}</p> : null}
          </form>

          <section className="mt-6 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
            <div className="flex items-center gap-3">
              <CalendarDays className="text-cyan-200" />
              <h2 className="text-xl font-black text-white">Manage events</h2>
            </div>
            <div className="mt-5 grid gap-3">
              {!isConnected ? (
                <p className="text-blue-100">Connect a project owner wallet to manage events.</p>
              ) : events.length === 0 ? (
                <p className="text-blue-100">No events yet. Create one from a campaign to make it visible publicly.</p>
              ) : (
                events.map((event) => (
                  <article key={event.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{event.project_name ?? "Project"}</span>
                          <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{event.status}</span>
                          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-100">{eventRewardTypeLabels[event.reward_type]}</span>
                        </div>
                        <h3 className="mt-3 font-black text-white">{event.name}</h3>
                        <p className="mt-1 text-sm leading-6 text-blue-100">{event.description || "No event description yet."}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-blue-200">
                          <span>/{event.slug}</span>
                          {event.campaign_name ? <span>Campaign: {event.campaign_name}</span> : null}
                          {event.prize_pool ? <span>Prize: {event.prize_pool} {event.prize_currency}</span> : null}
                          {event.ends_at ? <span>Ends {formatQuestDeadline(event.ends_at)}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <a href={`/events/${encodeURIComponent(event.slug)}`} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-black text-base-blue">
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadEventWinnersCsv(event)}
                          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-cyan-200 px-3 py-2 text-sm font-black text-slate-950"
                        >
                          <Download size={16} />
                          Winners CSV
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {activeStudioTab === "submissions" ? (
      <section className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-cyan-200" />
          <h2 className="text-xl font-black text-white">Review submissions</h2>
        </div>
        <div className="mt-5 grid gap-3">
          {!isConnected ? (
            <p className="text-blue-100">Connect a project owner or reviewer wallet to review submissions.</p>
          ) : submissions.length === 0 ? (
            <p className="text-blue-100">No pending submissions for projects owned by this wallet.</p>
          ) : (
            submissions.map((submission) => (
              <article key={submission.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{submission.status}</span>
                      {submission.project_name ? <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{submission.project_name}</span> : null}
                    </div>
                    <h3 className="mt-3 font-black text-white">{submission.quest_title ?? "Quest submission"}</h3>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-base-blue">
                        {submission.avatar_url ? <img src={submission.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={20} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{submission.display_name || "Questora member"}</p>
                        <p className="break-all text-xs text-blue-100">{submission.wallet_address}</p>
                      </div>
                    </div>
                    {submission.proof_text ? <p className="mt-3 text-blue-100">{submission.proof_text}</p> : null}
                    {submission.proof_url ? (
                      <a href={submission.proof_url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-sm font-bold text-cyan-200 hover:text-white">
                        {submission.proof_url}
                      </a>
                    ) : null}
                    <textarea
                      value={reviewNotes[submission.id] ?? ""}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [submission.id]: event.target.value }))}
                      className="focus-ring mt-4 min-h-20 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-blue-200/60"
                      placeholder="Reject reason, visible to the user"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={submission.status === "approved" && Boolean(submission.reviewed_at)}
                      onClick={() => handleReview(submission.id, "approved")}
                      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={submission.status === "rejected"}
                      onClick={() => handleReview(submission.id, "rejected")}
                      className="focus-ring inline-flex items-center gap-2 rounded-lg bg-rose-400 px-3 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircle size={16} />
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      ) : null}
    </div>
  );
}
