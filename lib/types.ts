export type QuestStatus = "active" | "draft" | "archived";
export type ProofType = "text" | "url" | "tweet" | "discord" | "wallet";
export type ProjectType = "NFT" | "Meme" | "AI" | "DeFi" | "Gaming" | "DAO" | "Social" | "Education" | "Tooling" | "Other";
export type QuestType = "follow_x" | "retweet_x" | "join_discord" | "post_x" | "submit_proof" | "onchain" | "learn" | "feedback" | "custom";
export type QuestDifficulty = "easy" | "medium" | "hard";

export type Quest = {
  id: string;
  project_id?: string | null;
  campaign_id?: string | null;
  title: string;
  description: string;
  task_url: string | null;
  instructions: string | null;
  proof_type: ProofType;
  proof_placeholder: string | null;
  proof_example: string | null;
  quest_type: QuestType;
  difficulty: QuestDifficulty;
  xp_reward: number;
  global_xp_reward: number;
  status: QuestStatus;
  category: string;
  ends_at: string | null;
  created_at?: string;
  project_name?: string;
  project_logo_url?: string | null;
  project_type?: ProjectType;
  project_is_verified?: boolean;
  project_is_featured?: boolean;
  project_featured_rank?: number | null;
  project_featured_until?: string | null;
};

export type UserProfile = {
  id: string;
  wallet_address: string;
  display_name: string | null;
  avatar_url: string | null;
  x_username: string | null;
  discord_username: string | null;
  bio: string | null;
  total_xp: number;
  completed_quests?: number;
  created_at?: string;
};

export type LeaderboardRank = {
  rank: number;
  user: UserProfile;
};

export type UserProfileInput = Pick<UserProfile, "display_name" | "avatar_url" | "x_username" | "discord_username" | "bio">;

export type UserQuest = {
  id: string;
  user_id: string;
  quest_id: string;
  xp_awarded: number;
  status: "submitted" | "approved" | "rejected";
  proof_text: string | null;
  proof_url: string | null;
  global_xp_awarded?: number;
  review_note: string | null;
  reviewed_at?: string | null;
  completed_at?: string;
  wallet_address?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  quest_title?: string;
  project_name?: string;
};

export type QualifiedUser = {
  user_id: string;
  wallet_address: string;
  display_name: string | null;
  avatar_url: string | null;
  project_id: string;
  project_name: string;
  project_xp: number;
  approved_quests: number;
  qualified_at: string | null;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  project_type: ProjectType;
  owner_wallet_address: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  website_url: string | null;
  discord_url: string | null;
  telegram_url: string | null;
  x_url: string | null;
  status: QuestStatus;
  is_verified: boolean;
  verified_at: string | null;
  is_featured: boolean;
  featured_rank: number | null;
  featured_until: string | null;
  created_at?: string;
};

export type ProjectInput = Pick<
  Project,
  "name" | "slug" | "description" | "project_type" | "owner_wallet_address" | "logo_url" | "cover_image_url" | "website_url" | "discord_url" | "telegram_url" | "x_url" | "status"
>;

export type ProjectCurationInput = Pick<Project, "is_verified" | "is_featured" | "featured_rank" | "featured_until">;

export type QuestInput = Pick<
  Quest,
  | "project_id"
  | "campaign_id"
  | "title"
  | "description"
  | "task_url"
  | "instructions"
  | "proof_type"
  | "proof_placeholder"
  | "proof_example"
  | "quest_type"
  | "difficulty"
  | "xp_reward"
  | "global_xp_reward"
  | "status"
  | "category"
  | "ends_at"
>;

export type ProjectMemberRole = "owner" | "admin" | "reviewer";

export type ProjectMember = {
  id: string;
  project_id: string;
  wallet_address: string;
  role: ProjectMemberRole;
  created_at?: string;
};

export type PlatformAdmin = {
  id: string;
  wallet_address: string;
  created_at?: string;
};

export type AdminContext = {
  wallet_address: string;
  is_platform_admin: boolean;
  project_ids: string[];
};

export type QuestSubmissionInput = {
  proof_text: string;
  proof_url: string;
};

export type Badge = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at?: string;
};

export type UserBadge = {
  id: string;
  user_id: string;
  badge_id: string;
  awarded_at?: string;
};

export type Campaign = {
  id: string;
  project_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  purpose: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: QuestStatus;
  project_name?: string;
  created_at?: string;
};

export type CampaignInput = Pick<Campaign, "project_id" | "slug" | "name" | "description" | "purpose" | "starts_at" | "ends_at" | "status">;

export type EventRewardType = "top_leaderboard" | "raffle" | "manual_selection" | "whitelist";

export type Event = {
  id: string;
  project_id: string;
  campaign_id: string;
  slug: string;
  name: string;
  description: string | null;
  prize_pool: string | null;
  prize_currency: string | null;
  reward_type: EventRewardType;
  rules: string | null;
  cover_image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: QuestStatus;
  is_featured: boolean;
  featured_rank: number | null;
  created_at?: string;
  project_name?: string;
  project_slug?: string;
  project_logo_url?: string | null;
  project_type?: ProjectType;
  campaign_name?: string;
};

export type EventInput = Pick<
  Event,
  | "project_id"
  | "campaign_id"
  | "slug"
  | "name"
  | "description"
  | "prize_pool"
  | "prize_currency"
  | "reward_type"
  | "rules"
  | "cover_image_url"
  | "starts_at"
  | "ends_at"
  | "status"
  | "is_featured"
  | "featured_rank"
>;

export type EventStats = {
  questCount: number;
  participantCount: number;
  approvedCount: number;
  totalXp: number;
};

export type NotificationType = "submission_created" | "submission_approved" | "submission_rejected" | "project_approved" | "project_rejected";

export type Notification = {
  id: string;
  recipient_wallet_address: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};
