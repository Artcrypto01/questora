import { NextRequest, NextResponse } from "next/server";
import { normalizeWallet } from "@/lib/utils";

function encodeState(input: { wallet: string; nonce: string }) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

function getRequestOrigin(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }

  const host = request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  const wallet = normalizeWallet(request.nextUrl.searchParams.get("wallet") ?? "");
  if (!wallet.startsWith("0x")) {
    return NextResponse.redirect(new URL("/profile?discord=wallet_required", request.url));
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/profile?discord=missing_config", request.url));
  }

  const nonce = crypto.randomUUID();
  const state = encodeState({ wallet, nonce });
  const origin = getRequestOrigin(request);
  const redirectUri = new URL("/api/auth/discord/callback", origin).toString();
  const authorizeUrl = new URL("https://discord.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("questora_discord_state", state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:"
  });
  return response;
}
