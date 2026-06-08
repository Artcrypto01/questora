import type { QuestDifficulty, QuestType } from "@/lib/types";

export const questTypeLabels: Record<QuestType, string> = {
  follow_x: "Follow X",
  retweet_x: "Retweet / Repost X",
  join_discord: "Join Discord",
  post_x: "Post on X",
  submit_proof: "Submit proof",
  onchain: "Onchain",
  learn: "Learn",
  feedback: "Feedback",
  custom: "Custom"
};

export const difficultyLabels: Record<QuestDifficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard"
};

export const questXpRanges: Record<QuestType, Record<QuestDifficulty, { min: number; max: number; globalCap: number }>> = {
  follow_x: {
    easy: { min: 10, max: 25, globalCap: 10 },
    medium: { min: 20, max: 40, globalCap: 15 },
    hard: { min: 30, max: 60, globalCap: 20 }
  },
  retweet_x: {
    easy: { min: 10, max: 20, globalCap: 8 },
    medium: { min: 20, max: 35, globalCap: 12 },
    hard: { min: 30, max: 50, globalCap: 16 }
  },
  join_discord: {
    easy: { min: 10, max: 30, globalCap: 10 },
    medium: { min: 25, max: 50, globalCap: 15 },
    hard: { min: 40, max: 75, globalCap: 20 }
  },
  post_x: {
    easy: { min: 20, max: 50, globalCap: 15 },
    medium: { min: 50, max: 100, globalCap: 30 },
    hard: { min: 100, max: 175, globalCap: 45 }
  },
  submit_proof: {
    easy: { min: 30, max: 75, globalCap: 20 },
    medium: { min: 75, max: 150, globalCap: 45 },
    hard: { min: 150, max: 250, globalCap: 75 }
  },
  onchain: {
    easy: { min: 75, max: 150, globalCap: 50 },
    medium: { min: 150, max: 300, globalCap: 100 },
    hard: { min: 300, max: 500, globalCap: 175 }
  },
  learn: {
    easy: { min: 20, max: 50, globalCap: 15 },
    medium: { min: 50, max: 100, globalCap: 30 },
    hard: { min: 100, max: 175, globalCap: 50 }
  },
  feedback: {
    easy: { min: 40, max: 100, globalCap: 25 },
    medium: { min: 100, max: 200, globalCap: 60 },
    hard: { min: 200, max: 350, globalCap: 100 }
  },
  custom: {
    easy: { min: 10, max: 50, globalCap: 10 },
    medium: { min: 50, max: 150, globalCap: 30 },
    hard: { min: 150, max: 300, globalCap: 60 }
  }
};

export function getQuestXpPolicy(questType: QuestType, difficulty: QuestDifficulty) {
  return questXpRanges[questType]?.[difficulty] ?? questXpRanges.custom.medium;
}

export function clampProjectXp(value: number, questType: QuestType, difficulty: QuestDifficulty) {
  const policy = getQuestXpPolicy(questType, difficulty);
  const normalizedValue = Number.isFinite(value) ? Math.round(value) : policy.min;
  return Math.min(Math.max(normalizedValue, policy.min), policy.max);
}

export function calculateGlobalXp(projectXp: number, questType: QuestType, difficulty: QuestDifficulty) {
  const policy = getQuestXpPolicy(questType, difficulty);
  return Math.min(Math.max(Math.round(projectXp * 0.35), 1), policy.globalCap);
}
