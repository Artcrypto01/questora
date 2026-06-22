"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Award, BadgeCheck, Bot, Clock3, ExternalLink, ImageUp, Loader2, Medal, RefreshCw, Save, UserRound, Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { getOrCreateUser, getUserCompletions, updateUserProfile } from "@/lib/quest-service";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { UserProfile, UserProfileInput, UserQuest } from "@/lib/types";
import { normalizeXUsername } from "@/lib/utils";

const mockBadges = ["Base Starter", "Quest Sprinter", "Community Signal"];
const avatarBucket = "avatars";
const avatarMaxBytes = 150 * 1024;
const avatarSize = 320;

async function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to read image."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to compress image."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function compressAvatar(file: File) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = avatarSize;
  canvas.height = avatarSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image compression is not supported in this browser.");

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, avatarSize, avatarSize);

  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.size <= avatarMaxBytes || quality === 0.52) return blob;
  }

  throw new Error("Failed to compress image.");
}

export default function ProfilePage() {
  const { address } = useAccount();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [completions, setCompletions] = useState<UserQuest[]>([]);
  const [profileForm, setProfileForm] = useState<UserProfileInput>({
    display_name: "",
    avatar_url: "",
    x_username: "",
    discord_username: "",
    bio: ""
  });
  const [message, setMessage] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [syncingDiscord, setSyncingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const status = searchParams.get("discord");
    if (!status) return;
    setDiscordStatus(status);

    const messages: Record<string, string> = {
      connected: "Discord connected. You can sync roles now.",
      wallet_required: "Connect a wallet before connecting Discord.",
      invalid_state: "Discord connection expired. Try connecting again.",
      missing_config: "Discord is not configured yet.",
      token_failed: "Discord authorization failed. Try again.",
      token_network_failed: "Questora could not reach Discord from the server. Try again after restarting the local server.",
      token_parse_failed: "Discord returned an unreadable authorization response. Try connecting again.",
      invalid_grant: "Discord authorization expired or redirect URI changed. Start Connect Discord again.",
      profile_failed: "Could not read your Discord profile.",
      profile_network_failed: "Questora could not read your Discord profile from the server. Try again.",
      database_failed: "Could not save Discord connection. Run the Discord SQL migration first.",
      callback_failed: "Discord connection could not be completed. Check Discord env values and try again."
    };

    const databaseCode = searchParams.get("db");
    if (status === "database_failed" && databaseCode?.endsWith(":23505")) {
      setMessage("This Discord account was already linked to another wallet. Try connecting Discord again to move it to this wallet.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const databaseHint = status === "database_failed" && databaseCode ? ` Code: ${databaseCode}.` : "";
    setMessage(`${messages[status] ?? "Discord connection could not be completed."}${databaseHint}`);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!address) {
      setUser(null);
      setCompletions([]);
      return;
    }

    const profile = await getOrCreateUser(address);
    setUser(profile);
    setProfileForm({
      display_name: profile.display_name ?? "",
      avatar_url: profile.avatar_url ?? "",
      x_username: profile.x_username ?? "",
      discord_username: profile.discord_username ?? "",
      bio: profile.bio ?? ""
    });
    setCompletions(await getUserCompletions(profile.id));
  }, [address]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (discordStatus === "connected") {
      loadProfile();
    }
  }, [discordStatus, loadProfile]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;

    const updatedProfile = await updateUserProfile(address, profileForm);
    setUser(updatedProfile);
    setProfileForm({
      display_name: updatedProfile.display_name ?? "",
      avatar_url: updatedProfile.avatar_url ?? "",
      x_username: updatedProfile.x_username ?? "",
      discord_username: updatedProfile.discord_username ?? "",
      bio: updatedProfile.bio ?? ""
    });
    setMessage("Profile saved.");
  }

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !address) return;

    if (!hasSupabaseConfig || !supabase) {
      setMessage("Supabase is not configured. Use Avatar URL for local preview.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please upload an image file.");
      return;
    }

    setUploadingAvatar(true);
    setMessage("Compressing avatar...");

    try {
      const avatarBlob = await compressAvatar(file);
      const wallet = address.toLowerCase();
      const path = `${wallet}/avatar.webp`;
      const { error: uploadError } = await supabase.storage.from(avatarBucket).upload(path, avatarBlob, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: true
      });

      if (uploadError) {
        throw new Error(`${uploadError.message}. Make sure the avatars bucket and policies exist in Supabase.`);
      }

      const { data } = supabase.storage.from(avatarBucket).getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const nextProfileForm = { ...profileForm, avatar_url: avatarUrl };
      setProfileForm(nextProfileForm);
      const updatedProfile = await updateUserProfile(address, nextProfileForm);
      setUser(updatedProfile);
      setProfileForm({
        display_name: updatedProfile.display_name ?? "",
        avatar_url: updatedProfile.avatar_url ?? avatarUrl,
        x_username: updatedProfile.x_username ?? "",
        discord_username: updatedProfile.discord_username ?? "",
        bio: updatedProfile.bio ?? ""
      });
      setMessage("Profile image updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to upload avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleDiscordSync() {
    if (!address) {
      setMessage("Connect a wallet before syncing Discord roles.");
      return;
    }

    setSyncingDiscord(true);
    setMessage("Syncing Discord roles...");

    try {
      const response = await fetch("/api/discord/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: address })
      });
      const result = (await response.json()) as { synced?: string[]; removed?: string[]; missingConfig?: string[]; error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Discord role sync failed.");
      }

      const synced = result.synced?.length ? result.synced.join(", ") : "no new roles";
      setMessage(`Discord roles synced: ${synced}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discord role sync failed.");
    } finally {
      setSyncingDiscord(false);
    }
  }

  const displayName = user?.display_name || (address ? "Questora member" : "Connect to create your profile");
  const xUsername = normalizeXUsername(user?.x_username);
  const publicProfilePath = user ? `/u/${encodeURIComponent(xUsername || user.wallet_address)}` : "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-white/10 bg-base-blue px-6 py-8 text-white shadow-glow sm:px-8">
        <p className="font-semibold text-blue-100">User profile</p>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white text-base-blue">
            {user?.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={42} />}
          </div>
          <div>
            <h1 className="text-3xl font-black sm:text-5xl">{displayName}</h1>
            <p className="mt-3 max-w-2xl break-all leading-7 text-blue-100">
              {address ?? "Wallet progress, XP, and badges appear here once you connect."}
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-2xl leading-7 text-blue-100">
          {user?.bio || "Add a name, avatar, and socials so project owners can recognize you."}
        </p>
        {user ? (
          <Link href={publicProfilePath} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue">
            View public profile
            <ExternalLink size={16} />
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={Award} label="Global XP" value={(user?.total_xp ?? 0).toLocaleString()} />
        <StatCard icon={BadgeCheck} label="Quests done" value={completions.length.toString()} />
        <StatCard icon={Medal} label="Badges" value={mockBadges.length.toString()} />
      </div>

      <section className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={handleProfileSubmit} className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="flex items-center gap-3">
            <UserRound className="text-cyan-200" />
            <h2 className="text-xl font-bold text-white">Edit profile</h2>
          </div>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Display name</span>
              <input
                value={profileForm.display_name ?? ""}
                onChange={(event) => setProfileForm({ ...profileForm, display_name: event.target.value })}
                className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="Base Builder"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Profile image</span>
              <div className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-base-blue">
                    {profileForm.avatar_url ? <img src={profileForm.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={28} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-blue-100">Upload a profile image from your device.</p>
                    <p className="mt-1 text-xs font-semibold text-blue-200">Use a clear square image so your profile looks sharp across Questora.</p>
                  </div>
                  <label className={`focus-ring inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue transition hover:bg-cyan-100 ${!address || uploadingAvatar ? "pointer-events-none opacity-50" : ""}`}>
                    {uploadingAvatar ? <Loader2 className="animate-spin" size={17} /> : <ImageUp size={17} />}
                    {uploadingAvatar ? "Uploading" : "Upload"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={!address || uploadingAvatar} onChange={handleAvatarUpload} />
                  </label>
                </div>
              </div>
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-bold text-blue-100">X username</span>
                <input
                  value={profileForm.x_username ?? ""}
                  onChange={(event) => setProfileForm({ ...profileForm, x_username: event.target.value })}
                  className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                  placeholder="@username"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-blue-100">Discord username</span>
                <input
                  value={profileForm.discord_username ?? ""}
                  onChange={(event) => setProfileForm({ ...profileForm, discord_username: event.target.value })}
                  className="focus-ring rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                  placeholder="@username"
                />
              </label>
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-bold text-blue-100">Bio</span>
              <textarea
                value={profileForm.bio ?? ""}
                onChange={(event) => setProfileForm({ ...profileForm, bio: event.target.value })}
                className="focus-ring min-h-24 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-white placeholder:text-blue-200/60"
                placeholder="What do you build or collect on Base?"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={!address}
            className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-base-blue px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={18} />
            Save profile
          </button>
          {message ? <p className="mt-3 text-sm font-semibold text-cyan-200">{message}</p> : null}
        </form>

        <div className="rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
          <div className="mb-5 flex items-center gap-3">
            <Wallet className="text-cyan-200" />
            <h2 className="text-xl font-bold text-white">Wallet</h2>
          </div>
          <p className="mb-6 break-all text-blue-100">{address ?? "No wallet connected yet."}</p>
          <div className="mb-6 rounded-lg border border-cyan-200/20 bg-cyan-200/10 p-4">
            <div className="flex items-start gap-3">
              <Bot className="mt-1 shrink-0 text-cyan-200" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-white">Discord roles</h2>
                <p className="mt-2 text-sm leading-6 text-blue-100">
                  {user?.discord_user_id ? `Connected as ${user.discord_username ?? "Discord user"}.` : "Connect Discord to receive Questora server roles."}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={address ? `/api/auth/discord/start?wallet=${encodeURIComponent(address)}` : "#"}
                    className={`focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-black text-base-blue transition hover:bg-cyan-100 ${!address ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <Bot size={17} />
                    {user?.discord_user_id ? "Reconnect Discord" : "Connect Discord"}
                  </a>
                  <button
                    type="button"
                    onClick={handleDiscordSync}
                    disabled={!address || !user?.discord_user_id || syncingDiscord}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-base-blue px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {syncingDiscord ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                    Sync roles
                  </button>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-blue-200">Join the Questora Discord server before syncing roles.</p>
                {message ? <p className="mt-3 rounded-lg border border-white/10 bg-white/10 p-3 text-xs font-bold leading-5 text-cyan-100">{message}</p> : null}
              </div>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white">Badge shelf</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {mockBadges.map((badge) => (
              <div key={badge} className="rounded-lg border border-white/10 bg-white/10 p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-base-blue">
                  <Medal size={22} />
                </div>
                <p className="mt-4 font-bold text-white">{badge}</p>
                <p className="mt-1 text-sm text-blue-100">Mock badge</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-white/10 bg-[#0b1730]/92 p-6 shadow-glow">
        <div className="flex items-center gap-3">
          <Clock3 className="text-cyan-200" />
          <h2 className="text-xl font-bold text-white">Quest submissions</h2>
        </div>
        <div className="mt-5 grid gap-3">
          {!address ? (
            <p className="text-blue-100">Connect a wallet to see submitted quests.</p>
          ) : completions.length === 0 ? (
            <p className="text-blue-100">No quest submissions yet.</p>
          ) : (
            completions.map((completion) => (
              <article key={completion.id} className="rounded-lg border border-white/10 bg-white/10 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-cyan-200 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">{completion.status}</span>
                      {completion.project_name ? <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-base-blue">{completion.project_name}</span> : null}
                    </div>
                    <h3 className="mt-3 font-black text-white">{completion.quest_title ?? "Quest submission"}</h3>
                    {completion.review_note ? <p className="mt-3 rounded-lg border border-rose-300/30 bg-rose-400/10 p-3 text-sm font-semibold text-rose-100">{completion.review_note}</p> : null}
                    {completion.proof_text ? <p className="mt-3 text-sm text-blue-100">{completion.proof_text}</p> : null}
                    {completion.proof_url ? (
                      <a href={completion.proof_url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-sm font-bold text-cyan-200 hover:text-white">
                        {completion.proof_url}
                      </a>
                    ) : null}
                  </div>
                  <p className="font-black text-cyan-200">{completion.xp_awarded.toLocaleString()} project XP</p>
                  <p className="text-xs font-bold text-blue-200">+{(completion.global_xp_awarded ?? completion.xp_awarded).toLocaleString()} global XP</p>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
