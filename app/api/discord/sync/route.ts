import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import { serverSupabase } from "@/lib/supabase-server";
import { normalizeWallet } from "@/lib/utils";

export const runtime = "nodejs";

type RoleKey = "verifiedExplorer" | "genesisExplorer" | "topExplorer" | "projectOwner" | "communityManager";

const roleConfig: Record<RoleKey, { label: string; env: string }> = {
  verifiedExplorer: { label: "Verified Explorer", env: "DISCORD_ROLE_VERIFIED_EXPLORER" },
  genesisExplorer: { label: "Genesis Explorer", env: "DISCORD_ROLE_GENESIS_EXPLORER" },
  topExplorer: { label: "Top Explorer", env: "DISCORD_ROLE_TOP_EXPLORER" },
  projectOwner: { label: "Project Owner", env: "DISCORD_ROLE_PROJECT_OWNER" },
  communityManager: { label: "Community Manager", env: "DISCORD_ROLE_COMMUNITY_MANAGER" }
};

function hasGenesisSignal(value?: string | null) {
  return Boolean(value?.toLowerCase().includes("genesis"));
}

function requestDiscordRole(method: "PUT" | "DELETE", url: string, botToken: string): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const request = https.request(
      {
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json"
        },
        rejectUnauthorized: process.env.NODE_ENV === "production"
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300), status: response.statusCode ?? 0, text });
        });
      }
    );
    request.on("error", reject);
    request.end();
  });
}

async function discordRoleRequest(method: "PUT" | "DELETE", discordUserId: string, roleId: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!botToken || !guildId) throw new Error("Discord bot configuration is missing.");

  const response = await requestDiscordRole(method, `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, botToken);

  if (response.ok || response.status === 404 && method === "DELETE") return;

  if (response.status === 404) {
    throw new Error("Join the Questora Discord server first, then sync roles again.");
  }

  if (response.status === 403) {
    throw new Error("Discord blocked role sync. Move the Questora bot role above the roles it manages and keep Manage Roles enabled.");
  }

  throw new Error(response.text || "Discord role sync failed.");
}

async function getGenesisEligibility(userId: string) {
  if (!serverSupabase) return false;

  const { data: submissions, error: submissionsError } = await serverSupabase.from("user_quests").select("quest_id").eq("user_id", userId).eq("status", "approved");
  if (submissionsError) throw submissionsError;

  const questIds = (submissions ?? []).map((submission) => submission.quest_id).filter(Boolean);
  if (questIds.length === 0) return false;

  const { data: quests, error: questsError } = await serverSupabase.from("quests").select("title, campaign_id").in("id", questIds);
  if (questsError) throw questsError;
  if ((quests ?? []).some((quest) => hasGenesisSignal(quest.title))) return true;

  const campaignIds = Array.from(new Set((quests ?? []).map((quest) => quest.campaign_id).filter(Boolean)));
  if (campaignIds.length === 0) return false;

  const { data: campaigns, error: campaignsError } = await serverSupabase.from("campaigns").select("name, slug").in("id", campaignIds);
  if (campaignsError) throw campaignsError;
  return (campaigns ?? []).some((campaign) => hasGenesisSignal(campaign.name) || hasGenesisSignal(campaign.slug));
}

async function getTopExplorerEligibility(wallet: string) {
  if (!serverSupabase) return false;
  const { data, error } = await serverSupabase.from("leaderboard").select("wallet_address").order("total_xp", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).some((user) => user.wallet_address === wallet);
}

async function getProjectOwnerEligibility(wallet: string) {
  if (!serverSupabase) return false;
  const { data, error } = await serverSupabase.from("projects").select("id").eq("owner_wallet_address", wallet).eq("is_verified", true).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function getCommunityManagerEligibility(wallet: string) {
  if (!serverSupabase) return false;
  const { data, error } = await serverSupabase
    .from("project_members")
    .select("id")
    .eq("wallet_address", wallet)
    .eq("role", "community_manager")
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function POST(request: NextRequest) {
  if (!serverSupabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => null)) as { wallet?: string } | null;
  const wallet = normalizeWallet(payload?.wallet ?? "");
  if (!wallet.startsWith("0x")) {
    return NextResponse.json({ error: "Connect a wallet before syncing Discord roles." }, { status: 400 });
  }

  const { data: user, error: userError } = await serverSupabase.from("users").select("id, wallet_address, discord_user_id").eq("wallet_address", wallet).maybeSingle();
  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
  if (!user?.discord_user_id) {
    return NextResponse.json({ error: "Connect Discord before syncing roles." }, { status: 400 });
  }

  const eligibility: Record<RoleKey, boolean> = {
    verifiedExplorer: true,
    genesisExplorer: await getGenesisEligibility(user.id),
    topExplorer: await getTopExplorerEligibility(wallet),
    projectOwner: await getProjectOwnerEligibility(wallet),
    communityManager: await getCommunityManagerEligibility(wallet)
  };

  const synced: string[] = [];
  const removed: string[] = [];
  const missingConfig: string[] = [];

  for (const key of Object.keys(roleConfig) as RoleKey[]) {
    const roleId = process.env[roleConfig[key].env];
    if (!roleId) {
      missingConfig.push(roleConfig[key].label);
      continue;
    }

    if (eligibility[key]) {
      await discordRoleRequest("PUT", user.discord_user_id, roleId);
      synced.push(roleConfig[key].label);
    } else {
      await discordRoleRequest("DELETE", user.discord_user_id, roleId);
      removed.push(roleConfig[key].label);
    }
  }

  return NextResponse.json({ synced, removed, missingConfig });
}
