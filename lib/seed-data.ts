import type { Project, Quest, UserProfile, UserQuest } from "@/lib/types";

export const seedProjects: Project[] = [
  {
    id: "project-base-quest-club",
    name: "Questora",
    slug: "questora",
    description: "Starter quest hub for Base communities.",
    project_type: "Social",
    owner_wallet_address: null,
    logo_url: "",
    cover_image_url: "",
    website_url: "",
    discord_url: "",
    x_url: "",
    status: "active"
  },
  {
    id: "project-builder-guild",
    name: "Builder Guild",
    slug: "builder-guild",
    description: "A project for builders learning and shipping on Base.",
    project_type: "Education",
    owner_wallet_address: null,
    logo_url: "",
    cover_image_url: "",
    website_url: "",
    discord_url: "",
    x_url: "",
    status: "active"
  }
];

export const seedQuests: Quest[] = [
  {
    id: "quest-base-discord",
    project_id: "project-base-quest-club",
    project_name: "Questora",
    title: "Join the Base community",
    description: "Join the official community channel and introduce yourself to other builders.",
    task_url: "",
    instructions: "Join Discord, introduce yourself, then paste your Discord username here.",
    proof_type: "discord",
    proof_placeholder: "yourname#1234 or @username",
    proof_example: "@basebuilder",
    quest_type: "join_discord",
    difficulty: "medium",
    xp_reward: 50,
    global_xp_reward: 15,
    status: "active",
    category: "Community",
    ends_at: null
  },
  {
    id: "quest-first-bridge",
    project_id: "project-base-quest-club",
    project_name: "Questora",
    title: "Complete a Base test transaction",
    description: "Complete a simple onchain action and submit transaction proof.",
    task_url: "https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet",
    instructions: "Complete the bridge or faucet flow and paste a transaction link or hash.",
    proof_type: "wallet",
    proof_placeholder: "Transaction hash or Base Sepolia explorer URL",
    proof_example: "0x1234... or https://sepolia.basescan.org/tx/...",
    quest_type: "onchain",
    difficulty: "medium",
    xp_reward: 300,
    global_xp_reward: 100,
    status: "active",
    category: "Onchain",
    ends_at: null
  },
  {
    id: "quest-retweet-announcement",
    project_id: "project-base-quest-club",
    project_name: "Questora",
    title: "Repost the Questora announcement",
    description: "Repost the campaign announcement on X and submit proof.",
    task_url: "https://x.com/",
    instructions: "Open the announcement post, repost it, then paste your repost URL or X profile.",
    proof_type: "tweet",
    proof_placeholder: "https://x.com/yourname/status/... or your X profile",
    proof_example: "https://x.com/yourname/status/123",
    quest_type: "retweet_x",
    difficulty: "easy",
    xp_reward: 15,
    global_xp_reward: 5,
    status: "active",
    category: "Social",
    ends_at: null
  },
  {
    id: "quest-share-build",
    project_id: "project-builder-guild",
    project_name: "Builder Guild",
    title: "Share your Base build idea",
    description: "Post a short build idea and tag the community so members can discover it.",
    task_url: "https://x.com/",
    instructions: "Post your idea on X, tag the project, then submit the tweet URL.",
    proof_type: "tweet",
    proof_placeholder: "https://x.com/yourname/status/...",
    proof_example: "https://x.com/base/status/123",
    quest_type: "post_x",
    difficulty: "hard",
    xp_reward: 175,
    global_xp_reward: 45,
    status: "active",
    category: "Social",
    ends_at: null
  },
  {
    id: "quest-learn-gas",
    project_id: "project-builder-guild",
    project_name: "Builder Guild",
    title: "Complete the gas primer",
    description: "Read a short primer on L2 gas fees and mark the task complete when finished.",
    task_url: "",
    instructions: "Read the primer and write one sentence about what you learned.",
    proof_type: "text",
    proof_placeholder: "One sentence summary",
    proof_example: "Base fees are lower because execution is batched on L2.",
    quest_type: "learn",
    difficulty: "medium",
    xp_reward: 100,
    global_xp_reward: 30,
    status: "active",
    category: "Learning",
    ends_at: null
  },
  {
    id: "quest-feedback",
    project_id: "project-base-quest-club",
    project_name: "Questora",
    title: "Submit product feedback",
    description: "Try one community app and submit actionable feedback.",
    task_url: "",
    instructions: "Try a community app, then submit a short note and optional screenshot or issue link.",
    proof_type: "url",
    proof_placeholder: "https://...",
    proof_example: "https://github.com/project/issues/123",
    quest_type: "feedback",
    difficulty: "medium",
    xp_reward: 175,
    global_xp_reward: 60,
    status: "active",
    category: "Community",
    ends_at: null
  }
];

export const seedUsers: UserProfile[] = [
  {
    id: "user-1",
    wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
    display_name: "Base Builder",
    avatar_url: "",
    x_username: "basebuilder",
    discord_username: "basebuilder",
    bio: "Completing quests across Base communities.",
    total_xp: 1120
  },
  {
    id: "user-2",
    wallet_address: "0x7a8b9c0d1e2f345678901234567890abcdefabcd",
    display_name: "Quest Sprinter",
    avatar_url: "",
    x_username: "",
    discord_username: "",
    bio: "",
    total_xp: 860
  },
  {
    id: "user-3",
    wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    display_name: "Onchain Learner",
    avatar_url: "",
    x_username: "",
    discord_username: "",
    bio: "",
    total_xp: 540
  }
];

export const seedCompletions: UserQuest[] = [];
