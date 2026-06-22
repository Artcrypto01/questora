# Questora

Questora is a Zealy-style quest MVP for Base communities. Members connect a wallet, register their address, complete quests, earn XP from completed quest records, collect mocked badges, and climb the leaderboard.

Questora can also support NFT whitelist campaigns, early access programs, community rewards, beta tester selection, contributor tracking, and leaderboard-based rewards. The goal is to help projects find the people who actually show up.

## Stack

- Next.js app router
- TypeScript
- Tailwind CSS
- Supabase
- RainbowKit, Wagmi, Viem
- Base mainnet

## Pages

- `/` landing page
- `/dashboard` quest list and manual completion
- `/launches` launch calendar for mints, beta launches, whitelists, and prelaunch discovery
- `/profile` wallet profile, XP, completions, mocked badges
- `/leaderboard` users sorted by total XP
- `/admin` Studio for creating projects and quests
- Studio qualified users export for whitelist and reward wallet lists

## Getting Started

Install dependencies:

```bash
pnpm install
```

Copy the example env file:

```bash
cp .env.example .env.local
```

Add your keys:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
NEXT_PUBLIC_PLATFORM_ADMIN_WALLETS=0xyourwalletaddress
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-discord-server-id
DISCORD_ROLE_VERIFIED_EXPLORER=role-id
DISCORD_ROLE_GENESIS_EXPLORER=role-id
DISCORD_ROLE_TOP_EXPLORER=role-id
DISCORD_ROLE_PROJECT_OWNER=role-id
DISCORD_ROLE_COMMUNITY_MANAGER=role-id
```

Run the app:

```bash
pnpm dev
```

Open `http://localhost:3000`.

The app includes local seed data when Supabase env vars are missing, so the UI can be previewed before connecting a database. Once Supabase env vars are set, project creation, wallet registration, quest fetches, completions, and leaderboard reads use Supabase.

## Supabase Schema

Run [supabase/schema.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/schema.sql>) in the Supabase SQL editor.

If the database already exists, also run [supabase/quest-deadlines.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/quest-deadlines.sql>) to add quest deadlines.

Run [supabase/retweet-quest-type.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/retweet-quest-type.sql>) if your database was created before the Retweet X quest type was added.

Run [supabase/project-curation.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/project-curation.sql>) to add verified project and top campaign controls.

Run [supabase/project-telegram-url.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/project-telegram-url.sql>) to add Telegram links for projects.

Run [supabase/campaign-partners.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/campaign-partners.sql>) to add collab campaigns with partner projects.

Run [supabase/project-launches.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/project-launches.sql>) to add the Launch Calendar for upcoming mints, beta launches, whitelists, airdrops, and prelaunch pages.

Run [supabase/avatar-storage.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/avatar-storage.sql>) to create the `avatars` Storage bucket used by profile image uploads.

Run [supabase/project-team-members.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/project-team-members.sql>) to add Community Manager invites for project teams.

Run [supabase/discord-integration.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/discord-integration.sql>) to add Discord account linking fields.

Before going live, run [supabase/pre-live-audit.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/pre-live-audit.sql>) to check platform admins, pending submissions, active quests without deadlines, and anon write policies that should be reviewed.

The schema creates:

- `campaigns`
- `campaign_partners`
- `project_launches`
- `projects`
- `platform_admins`
- `project_members`
- `users`
- `quests`
- `user_quests`
- `badges`
- `user_badges`
- `leaderboard` view

Core behavior:

- Projects are created from the Studio (`/admin`) and stored in `projects`, including a project type such as NFT, Meme, AI, or DeFi.
- The connected project creator is saved as the project owner in `project_members`.
- Project owners can invite Community Managers by wallet. Invites must be accepted by the invited wallet before they can help manage the project.
- `users` are created after wallet connect and can store display name, avatar, X, Discord, and bio.
- Users can connect Discord from Profile and sync Questora server roles with the Discord bot.
- Profile avatars can be uploaded from the Profile page. Images are resized in the browser to a small WebP and stored in Supabase Storage at `avatars/{wallet}/avatar.webp`.
- `quests` are created under a project and fetched from Supabase.
- Users submit quest proof into `user_quests` with `submitted` status.
- Quests can define instructions, task link, proof type, proof placeholder, and proof example.
- Quests can define an optional `ends_at` deadline. Ended quests stay visible but no longer accept submissions.
- Quest templates include social tasks such as Follow X, Retweet/Repost X, and Post on X.
- Project owners approve or reject submissions from the Studio (`/admin`), including an optional reject reason.
- XP is calculated from approved `user_quests` joined to `quests`.
- The leaderboard reads the `leaderboard` view sorted by computed XP.
- Studio can export qualified users as CSV based on approved quest count and project XP.
- Platform admins can manually mark projects as verified and feature up to five top campaign slots.
- Campaign owners can invite partner projects to create collab campaigns with one shared event leaderboard. Partner owners must accept the invite before adding quests.
- Project owners can publish Launch Calendar entries for NFT mints, token launches, beta launches, whitelists, airdrops, and other prelaunch moments.

The MVP uses permissive anon RLS policies so wallet-based flows work without a custom auth server. For production, replace the write policies with wallet/session-aware server actions or Supabase auth checks.

Admin access in the app is wallet-gated:

- Wallets in `NEXT_PUBLIC_PLATFORM_ADMIN_WALLETS` or `platform_admins` can manage all projects and submissions.
- Project owners and accepted Community Managers in `project_members` can manage only their project.
- Normal users can submit proof but should not see review actions for projects they do not own.

Seed data is included at the bottom of [supabase/schema.sql](</D:/DEVELOPMENT/Project/WEB CODEX/ZEALYMODEL/supabase/schema.sql>).

For reference, the main table shape is:

```sql
projects(id, name, slug, description, project_type, owner_wallet_address, logo_url, cover_image_url, website_url, discord_url, telegram_url, x_url, status, created_at)
platform_admins(id, wallet_address, created_at)
project_members(id, project_id, wallet_address, role, status, created_at)
users(id, wallet_address, display_name, avatar_url, x_username, discord_username, discord_user_id, discord_connected_at, bio, created_at)
campaigns(id, name, description, starts_at, ends_at, status, created_at)
campaign_partners(id, campaign_id, project_id, role, status, created_at)
project_launches(id, project_id, campaign_id, slug, name, description, launch_type, launch_url, price, supply, network, cover_image_url, starts_at, status, is_featured, featured_rank, created_at)
quests(id, project_id, campaign_id, title, description, task_url, instructions, proof_type, proof_placeholder, proof_example, xp_reward, status, category, ends_at, created_at)
user_quests(id, user_id, quest_id, xp_awarded, status, proof_text, proof_url, review_note, reviewed_at, completed_at)
badges(id, name, description, image_url, created_at)
user_badges(id, user_id, badge_id, awarded_at)
```

## Real App Flow

1. Connect a wallet with RainbowKit.
2. The app inserts or fetches that wallet in `users`.
3. A member can edit their profile name, avatar, socials, and bio in `/profile`.
4. A project owner opens the Studio (`/admin`) and creates a project.
5. The project owner adds logo, cover image, socials, and quests linked to that project.
6. The project owner can publish a launch page in Studio for upcoming mints, beta launches, whitelists, or airdrops.
7. Community users open `/dashboard`, filter by project, read the quest instructions, and submit the requested proof.
8. The app saves each proof in `user_quests` as `submitted`.
9. Project owners approve or reject submissions. Reject notes are shown on the user profile and the quest can be resubmitted.
10. The `leaderboard` view calculates XP from approved quest rows.
11. Project owners can export qualified wallet lists from Studio for whitelist, rewards, or beta access.

## Production Checklist

1. Run all Supabase SQL files in this order: `schema.sql`, `xp-guardrails.sql`, `quest-deadlines.sql`, `retweet-quest-type.sql`, `project-curation.sql`, `project-telegram-url.sql`, `events.sql`, `notifications-and-quest-title-scope.sql`, `campaign-partners.sql`, `project-launches.sql`, `avatar-storage.sql`.
2. Add your platform admin wallet to `platform_admins` and `NEXT_PUBLIC_PLATFORM_ADMIN_WALLETS`.
3. Run `pre-live-audit.sql` and review any anon write policies before opening the app publicly.
4. Set production env vars in your host:

```bash
NEXT_PUBLIC_SITE_URL=https://questora.xyz
NEXT_PUBLIC_SUPABASE_URL=your-production-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-walletconnect-project-id
NEXT_PUBLIC_PLATFORM_ADMIN_WALLETS=0xyourwalletaddress
```

5. Deploy with `pnpm build`, then connect your custom domain.
6. For a real production launch, add signed wallet authentication or server actions before tightening RLS. Wallet addresses sent directly from the browser are good for an MVP, but not enough for anti-spoofing security.

## Notes

- Base mainnet is configured through Wagmi and RainbowKit.
- Quest completion is manual for the MVP.
- Badges are still mocked in the UI, with database tables ready for real awards.
- The Studio route is intentionally open for MVP speed. Add auth or role checks before production use.
