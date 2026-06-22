import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import { serverSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

type DiscordTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type DiscordUserResponse = {
  id?: string;
  username?: string;
  global_name?: string | null;
};

function requestDiscordJson<T>(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; json: T | null; text: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const request = https.request(
      {
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
        rejectUnauthorized: process.env.NODE_ENV === "production"
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: T | null = null;
          try {
            json = text ? (JSON.parse(text) as T) : null;
          } catch {
            json = null;
          }
          resolve({ ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300), status: response.statusCode ?? 0, json, text });
        });
      }
    );
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function decodeState(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { wallet?: string; nonce?: string };
  } catch {
    return null;
  }
}

function getRequestOrigin(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function setDatabaseError(url: URL, stage: string, error: { code?: string; message?: string }) {
  console.error(`Discord database ${stage} failed`, error);
  url.searchParams.set("discord", "database_failed");
  url.searchParams.set("db", `${stage}:${error.code ?? "unknown"}`);
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const profileUrl = new URL("/profile", origin);

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const expectedState = request.cookies.get("questora_discord_state")?.value;
    const decodedState = decodeState(state);

    if (!code || !state || state !== expectedState || !decodedState?.wallet) {
      profileUrl.searchParams.set("discord", "invalid_state");
      return NextResponse.redirect(profileUrl);
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret || !serverSupabase) {
      profileUrl.searchParams.set("discord", "missing_config");
      return NextResponse.redirect(profileUrl);
    }

    const redirectUri = new URL("/api/auth/discord/callback", origin).toString();
    const tokenResponse = await requestDiscordJson<DiscordTokenResponse>("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      }).toString()
    }).catch((error) => {
      console.error("Discord token request failed", error);
      return null;
    });

    if (!tokenResponse) {
      profileUrl.searchParams.set("discord", "token_network_failed");
      return NextResponse.redirect(profileUrl);
    }

    const token = tokenResponse.json;
    if (!token) {
      profileUrl.searchParams.set("discord", "token_parse_failed");
      return NextResponse.redirect(profileUrl);
    }

    if (!tokenResponse.ok || !token.access_token) {
      profileUrl.searchParams.set("discord", token.error ?? "token_failed");
      return NextResponse.redirect(profileUrl);
    }

    const userResponse = await requestDiscordJson<DiscordUserResponse>("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    }).catch((error) => {
      console.error("Discord profile request failed", error);
      return null;
    });

    if (!userResponse) {
      profileUrl.searchParams.set("discord", "profile_network_failed");
      return NextResponse.redirect(profileUrl);
    }

    const discordUser = userResponse.json;

    if (!userResponse.ok || !discordUser?.id || !discordUser.username) {
      profileUrl.searchParams.set("discord", "profile_failed");
      return NextResponse.redirect(profileUrl);
    }

    const discordName = discordUser.global_name || discordUser.username;
    const { error: upsertError } = await serverSupabase.from("users").upsert({ wallet_address: decodedState.wallet }, { onConflict: "wallet_address" });
    if (upsertError) {
      setDatabaseError(profileUrl, "upsert", upsertError);
      return NextResponse.redirect(profileUrl);
    }

    const { error: transferError } = await serverSupabase
      .from("users")
      .update({
        discord_user_id: null,
        discord_connected_at: null
      })
      .eq("discord_user_id", discordUser.id)
      .neq("wallet_address", decodedState.wallet);

    if (transferError) {
      setDatabaseError(profileUrl, "transfer", transferError);
      return NextResponse.redirect(profileUrl);
    }

    const { error } = await serverSupabase
      .from("users")
      .update({
        discord_user_id: discordUser.id,
        discord_username: discordName,
        discord_connected_at: new Date().toISOString()
      })
      .eq("wallet_address", decodedState.wallet);

    if (error) {
      setDatabaseError(profileUrl, "update", error);
      return NextResponse.redirect(profileUrl);
    }

    profileUrl.searchParams.set("discord", "connected");
    const response = NextResponse.redirect(profileUrl);
    response.cookies.delete("questora_discord_state");
    return response;
  } catch (error) {
    console.error("Discord callback failed", error);
    profileUrl.searchParams.set("discord", "callback_failed");
    return NextResponse.redirect(profileUrl);
  }
}
