create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  project_type text not null default 'Other' check (project_type in ('NFT', 'Meme', 'AI', 'DeFi', 'Gaming', 'DAO', 'Social', 'Education', 'Tooling', 'Other')),
  owner_wallet_address text,
  logo_url text,
  cover_image_url text,
  website_url text,
  discord_url text,
  telegram_url text,
  x_url text,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  is_verified boolean not null default false,
  verified_at timestamptz,
  is_featured boolean not null default false,
  featured_rank integer,
  featured_until timestamptz,
  created_at timestamptz not null default now(),
  constraint projects_owner_wallet_lowercase check (owner_wallet_address is null or owner_wallet_address = lower(owner_wallet_address)),
  constraint projects_featured_rank_check check (featured_rank is null or (featured_rank >= 1 and featured_rank <= 5))
);

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  created_at timestamptz not null default now(),
  constraint platform_admins_wallet_lowercase check (wallet_address = lower(wallet_address))
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  wallet_address text not null,
  role text not null default 'reviewer' check (role in ('owner', 'admin', 'reviewer')),
  created_at timestamptz not null default now(),
  unique (project_id, wallet_address),
  constraint project_members_wallet_lowercase check (wallet_address = lower(wallet_address))
);

alter table public.projects add column if not exists logo_url text;
alter table public.projects add column if not exists project_type text not null default 'Other';
alter table public.projects drop constraint if exists projects_project_type_check;
alter table public.projects add constraint projects_project_type_check check (project_type in ('NFT', 'Meme', 'AI', 'DeFi', 'Gaming', 'DAO', 'Social', 'Education', 'Tooling', 'Other'));
alter table public.projects add column if not exists cover_image_url text;
alter table public.projects add column if not exists website_url text;
alter table public.projects add column if not exists discord_url text;
alter table public.projects add column if not exists telegram_url text;
alter table public.projects add column if not exists x_url text;
alter table public.projects add column if not exists is_verified boolean not null default false;
alter table public.projects add column if not exists verified_at timestamptz;
alter table public.projects add column if not exists is_featured boolean not null default false;
alter table public.projects add column if not exists featured_rank integer;
alter table public.projects add column if not exists featured_until timestamptz;
alter table public.projects drop constraint if exists projects_featured_rank_check;
alter table public.projects add constraint projects_featured_rank_check check (featured_rank is null or (featured_rank >= 1 and featured_rank <= 5));
create index if not exists projects_featured_sort_idx on public.projects (is_featured, featured_rank, featured_until, is_verified, created_at);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  slug text,
  name text not null,
  description text,
  purpose text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  constraint campaigns_project_slug_unique unique (project_id, slug)
);

alter table public.campaigns add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.campaigns add column if not exists slug text;
alter table public.campaigns add column if not exists purpose text;
alter table public.campaigns drop constraint if exists campaigns_name_key;
update public.campaigns
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
where slug is null or slug = '';
alter table public.campaigns drop constraint if exists campaigns_project_slug_unique;
alter table public.campaigns add constraint campaigns_project_slug_unique unique (project_id, slug);
create index if not exists campaigns_project_status_idx on public.campaigns (project_id, status, created_at);

create table if not exists public.campaign_partners (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null default 'partner',
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz default now(),
  unique (campaign_id, project_id)
);

create index if not exists campaign_partners_campaign_idx on public.campaign_partners (campaign_id, status);
create index if not exists campaign_partners_project_idx on public.campaign_partners (project_id, status);
alter table public.campaign_partners alter column status set default 'draft';
alter table public.campaign_partners drop constraint if exists campaign_partners_status_check;
alter table public.campaign_partners add constraint campaign_partners_status_check check (status in ('active', 'draft', 'archived'));

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null unique,
  name text not null,
  description text,
  prize_pool text,
  prize_currency text,
  reward_type text not null default 'top_leaderboard' check (reward_type in ('top_leaderboard', 'raffle', 'manual_selection', 'whitelist')),
  rules text,
  cover_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  is_featured boolean not null default false,
  featured_rank integer,
  created_at timestamptz not null default now(),
  constraint events_featured_rank_check check (featured_rank is null or (featured_rank >= 1 and featured_rank <= 5))
);

create index if not exists events_status_dates_idx on public.events (status, starts_at, ends_at, created_at);
create index if not exists events_project_campaign_idx on public.events (project_id, campaign_id);
create index if not exists events_featured_sort_idx on public.events (is_featured, featured_rank, starts_at, created_at);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  display_name text,
  avatar_url text,
  x_username text,
  discord_username text,
  bio text,
  created_at timestamptz not null default now(),
  constraint users_wallet_lowercase check (wallet_address = lower(wallet_address))
);

alter table public.users add column if not exists display_name text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists x_username text;
alter table public.users add column if not exists discord_username text;
alter table public.users add column if not exists bio text;

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  title text not null,
  description text not null,
  task_url text,
  instructions text,
  proof_type text not null default 'text' check (proof_type in ('text', 'url', 'tweet', 'discord', 'wallet')),
  proof_placeholder text,
  proof_example text,
  quest_type text not null default 'submit_proof' check (quest_type in ('follow_x', 'retweet_x', 'join_discord', 'post_x', 'submit_proof', 'onchain', 'learn', 'feedback', 'custom')),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  xp_reward integer not null check (xp_reward > 0),
  global_xp_reward integer not null default 1 check (global_xp_reward > 0),
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  category text not null default 'Community',
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.quests drop constraint if exists quests_project_id_title_key;
drop index if exists public.quests_project_campaign_title_unique_idx;
drop index if exists public.quests_project_uncampaigned_title_unique_idx;
create unique index if not exists quests_project_campaign_title_unique_idx
  on public.quests (project_id, campaign_id, lower(trim(title)))
  where campaign_id is not null;
create unique index if not exists quests_project_uncampaigned_title_unique_idx
  on public.quests (project_id, lower(trim(title)))
  where campaign_id is null;

create table if not exists public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  xp_awarded integer not null check (xp_awarded > 0),
  global_xp_awarded integer not null default 1 check (global_xp_awarded > 0),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  proof_text text,
  proof_url text,
  review_note text,
  reviewed_at timestamptz,
  completed_at timestamptz not null default now(),
  unique (user_id, quest_id)
);

alter table public.quests add column if not exists instructions text;
alter table public.quests add column if not exists task_url text;
alter table public.quests add column if not exists proof_type text not null default 'text';
alter table public.quests add column if not exists proof_placeholder text;
alter table public.quests add column if not exists proof_example text;
alter table public.quests add column if not exists quest_type text not null default 'submit_proof';
alter table public.quests add column if not exists difficulty text not null default 'medium';
alter table public.quests add column if not exists global_xp_reward integer not null default 1;
alter table public.quests add column if not exists ends_at timestamptz;
alter table public.quests drop constraint if exists quests_proof_type_check;
alter table public.quests add constraint quests_proof_type_check check (proof_type in ('text', 'url', 'tweet', 'discord', 'wallet'));
alter table public.quests drop constraint if exists quests_quest_type_check;
alter table public.quests add constraint quests_quest_type_check check (quest_type in ('follow_x', 'retweet_x', 'join_discord', 'post_x', 'submit_proof', 'onchain', 'learn', 'feedback', 'custom'));
alter table public.quests drop constraint if exists quests_difficulty_check;
alter table public.quests add constraint quests_difficulty_check check (difficulty in ('easy', 'medium', 'hard'));
alter table public.quests drop constraint if exists quests_global_xp_reward_check;
alter table public.quests add constraint quests_global_xp_reward_check check (global_xp_reward > 0);

alter table public.user_quests drop constraint if exists user_quests_status_check;
update public.user_quests set status = 'approved' where status = 'completed';
update public.user_quests set status = 'submitted' where status = 'approved' and reviewed_at is null;
alter table public.user_quests add constraint user_quests_status_check check (status in ('submitted', 'approved', 'rejected'));
alter table public.user_quests alter column status set default 'submitted';
alter table public.user_quests add column if not exists global_xp_awarded integer not null default 1;
alter table public.user_quests add column if not exists proof_text text;
alter table public.user_quests add column if not exists proof_url text;
alter table public.user_quests add column if not exists review_note text;
alter table public.user_quests add column if not exists reviewed_at timestamptz;
alter table public.user_quests drop constraint if exists user_quests_global_xp_awarded_check;
alter table public.user_quests add constraint user_quests_global_xp_awarded_check check (global_xp_awarded > 0);

update public.quests
set
  quest_type = case
    when proof_type = 'tweet' then 'post_x'
    when proof_type = 'discord' then 'join_discord'
    when proof_type = 'wallet' then 'onchain'
    when category = 'Learning' then 'learn'
    else 'submit_proof'
  end,
  difficulty = case
    when xp_reward <= 75 then 'easy'
    when xp_reward >= 200 then 'hard'
    else 'medium'
  end,
  global_xp_reward = least(greatest(round(xp_reward * 0.35), 1), case
    when proof_type = 'wallet' then 175
    when proof_type = 'tweet' then 45
    when proof_type = 'discord' then 20
    when category = 'Learning' then 50
    else 75
  end)
where global_xp_reward = 1;

update public.user_quests uq
set global_xp_awarded = q.global_xp_reward
from public.quests q
where q.id = uq.quest_id
and uq.global_xp_awarded = 1;

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_wallet_address text not null,
  type text not null check (type in ('submission_created', 'submission_approved', 'submission_rejected', 'project_approved', 'project_rejected', 'campaign_partner_invited', 'campaign_partner_accepted', 'campaign_partner_rejected')),
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_wallet_lowercase check (recipient_wallet_address = lower(recipient_wallet_address))
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('submission_created', 'submission_approved', 'submission_rejected', 'project_approved', 'project_rejected', 'campaign_partner_invited', 'campaign_partner_accepted', 'campaign_partner_rejected'));

create index if not exists notifications_recipient_created_idx on public.notifications (recipient_wallet_address, created_at desc);
create index if not exists notifications_recipient_unread_idx on public.notifications (recipient_wallet_address, read_at) where read_at is null;

drop view if exists public.leaderboard;
create view public.leaderboard as
select
  u.id,
  u.wallet_address,
  u.display_name,
  u.avatar_url,
  u.x_username,
  u.discord_username,
  u.bio,
  coalesce(sum(q.global_xp_reward), 0)::integer as total_xp,
  count(uq.id)::integer as completed_quests,
  u.created_at
from public.users u
left join public.user_quests uq on uq.user_id = u.id and uq.status = 'approved' and uq.reviewed_at is not null
left join public.quests q on q.id = uq.quest_id
group by u.id, u.wallet_address, u.display_name, u.avatar_url, u.x_username, u.discord_username, u.bio, u.created_at;

alter table public.projects enable row level security;
alter table public.platform_admins enable row level security;
alter table public.project_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_partners enable row level security;
alter table public.events enable row level security;
alter table public.users enable row level security;
alter table public.quests enable row level security;
alter table public.user_quests enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Projects are readable" on public.projects;
create policy "Projects are readable" on public.projects
  for select using (true);

drop policy if exists "Projects can be created for MVP" on public.projects;
create policy "Projects can be created for MVP" on public.projects
  for insert with check (owner_wallet_address is null or owner_wallet_address = lower(owner_wallet_address));

drop policy if exists "Projects can be updated for MVP" on public.projects;
create policy "Projects can be updated for MVP" on public.projects
  for update using (true) with check (owner_wallet_address is null or owner_wallet_address = lower(owner_wallet_address));

drop policy if exists "Platform admins are readable" on public.platform_admins;
create policy "Platform admins are readable" on public.platform_admins
  for select using (true);

drop policy if exists "Platform admins can be created for setup" on public.platform_admins;
create policy "Platform admins can be created for setup" on public.platform_admins
  for insert with check (wallet_address = lower(wallet_address));

drop policy if exists "Project members are readable" on public.project_members;
create policy "Project members are readable" on public.project_members
  for select using (true);

drop policy if exists "Project members can be created for MVP" on public.project_members;
create policy "Project members can be created for MVP" on public.project_members
  for insert with check (wallet_address = lower(wallet_address));

drop policy if exists "Campaigns are readable" on public.campaigns;
create policy "Campaigns are readable" on public.campaigns
  for select using (true);

drop policy if exists "Campaigns can be created for MVP" on public.campaigns;
create policy "Campaigns can be created for MVP" on public.campaigns
  for insert with check (true);

drop policy if exists "Campaigns can be updated for MVP" on public.campaigns;
create policy "Campaigns can be updated for MVP" on public.campaigns
  for update using (true) with check (true);

drop policy if exists "Campaign partners are readable" on public.campaign_partners;
create policy "Campaign partners are readable" on public.campaign_partners
  for select using (true);

drop policy if exists "Campaign partners can be created for MVP" on public.campaign_partners;
create policy "Campaign partners can be created for MVP" on public.campaign_partners
  for insert with check (true);

drop policy if exists "Campaign partners can be updated for MVP" on public.campaign_partners;
create policy "Campaign partners can be updated for MVP" on public.campaign_partners
  for update using (true) with check (true);

drop policy if exists "Campaign partners can be deleted for MVP" on public.campaign_partners;
create policy "Campaign partners can be deleted for MVP" on public.campaign_partners
  for delete using (true);

drop policy if exists "Events are readable" on public.events;
create policy "Events are readable" on public.events
  for select using (true);

drop policy if exists "Events can be created for MVP" on public.events;
create policy "Events can be created for MVP" on public.events
  for insert with check (true);

drop policy if exists "Events can be updated for MVP" on public.events;
create policy "Events can be updated for MVP" on public.events
  for update using (true) with check (true);

drop policy if exists "Users are readable" on public.users;
create policy "Users are readable" on public.users
  for select using (true);

drop policy if exists "Wallets can self-register" on public.users;
create policy "Wallets can self-register" on public.users
  for insert with check (wallet_address = lower(wallet_address));

drop policy if exists "Users can update profile for MVP" on public.users;
create policy "Users can update profile for MVP" on public.users
  for update using (true) with check (wallet_address = lower(wallet_address));

drop policy if exists "Quests are readable" on public.quests;
create policy "Quests are readable" on public.quests
  for select using (true);

drop policy if exists "Quests can be created for MVP" on public.quests;
create policy "Quests can be created for MVP" on public.quests
  for insert with check (true);

drop policy if exists "User quests are readable" on public.user_quests;
create policy "User quests are readable" on public.user_quests
  for select using (true);

drop policy if exists "Quest completions can be created" on public.user_quests;
drop policy if exists "Quest submissions can be created" on public.user_quests;
create policy "Quest submissions can be created" on public.user_quests
  for insert with check (status = 'submitted');

drop policy if exists "Quest submissions can be reviewed for MVP" on public.user_quests;
create policy "Quest submissions can be reviewed for MVP" on public.user_quests
  for update using (true) with check (status in ('submitted', 'approved', 'rejected'));

drop policy if exists "Badges are readable" on public.badges;
create policy "Badges are readable" on public.badges
  for select using (true);

drop policy if exists "Badges can be created for MVP" on public.badges;
create policy "Badges can be created for MVP" on public.badges
  for insert with check (true);

drop policy if exists "User badges are readable" on public.user_badges;
create policy "User badges are readable" on public.user_badges
  for select using (true);

drop policy if exists "User badges can be awarded for MVP" on public.user_badges;
create policy "User badges can be awarded for MVP" on public.user_badges
  for insert with check (true);

drop policy if exists "Notifications are readable for MVP" on public.notifications;
create policy "Notifications are readable for MVP" on public.notifications
  for select using (true);

drop policy if exists "Notifications can be created for MVP" on public.notifications;
create policy "Notifications can be created for MVP" on public.notifications
  for insert with check (recipient_wallet_address = lower(recipient_wallet_address));

drop policy if exists "Notifications can be updated for MVP" on public.notifications;
create policy "Notifications can be updated for MVP" on public.notifications
  for update using (true) with check (recipient_wallet_address = lower(recipient_wallet_address));

insert into public.projects (name, slug, description, project_type, status, is_verified, is_featured, featured_rank)
values
  ('Questora', 'questora', 'Starter Base community quest hub.', 'Social', 'active', true, true, 1),
  ('Builder Guild', 'builder-guild', 'A project for builders learning and shipping on Base.', 'Education', 'active', false, true, 2)
on conflict do nothing;

insert into public.campaigns (project_id, slug, name, description, purpose, status)
values ((select id from public.projects where slug = 'questora'), 'questora-season-one', 'Questora Season One', 'Starter campaign for Base community quests.', 'Community rewards', 'active')
on conflict do nothing;

insert into public.project_members (project_id, wallet_address, role)
select id, owner_wallet_address, 'owner'
from public.projects
where owner_wallet_address is not null
on conflict do nothing;

-- Optional cleanup for MVP testing:
-- If non-platform users created projects before approval flow existed,
-- run this after inserting your platform admin wallet to make those projects pending again.
-- update public.projects p
-- set status = 'draft'
-- where p.owner_wallet_address is not null
-- and not exists (
--   select 1
--   from public.platform_admins pa
--   where pa.wallet_address = p.owner_wallet_address
-- );

-- Optional setup:
-- Replace the wallet below with your own lowercase wallet address to make yourself platform admin.
-- insert into public.platform_admins (wallet_address)
-- values ('0xyourwalletaddress')
-- on conflict do nothing;

update public.quests
set project_id = (select id from public.projects where slug = 'questora')
where project_id is null;

insert into public.quests (project_id, title, description, task_url, instructions, proof_type, proof_placeholder, proof_example, quest_type, difficulty, xp_reward, global_xp_reward, status, category, ends_at)
values
  ((select id from public.projects where slug = 'questora'), 'Join the Base community', 'Join the official community channel and introduce yourself to other builders.', null, 'Join Discord, introduce yourself, then paste your Discord username here.', 'discord', 'yourname#1234 or @username', '@basebuilder', 'join_discord', 'medium', 50, 15, 'active', 'Community', null),
  ((select id from public.projects where slug = 'questora'), 'Complete a Base transaction', 'Complete a simple onchain action on Base and submit transaction proof.', 'https://bridge.base.org/', 'Complete the requested Base action and paste a transaction link or hash.', 'wallet', 'Transaction hash or Base explorer URL', '0x1234... or https://basescan.org/tx/...', 'onchain', 'medium', 300, 100, 'active', 'Onchain', null),
  ((select id from public.projects where slug = 'builder-guild'), 'Share your Base build idea', 'Post a short build idea and tag the community so members can discover it.', 'https://x.com/', 'Post your idea on X, tag the project, then submit the tweet URL.', 'tweet', 'https://x.com/yourname/status/...', 'https://x.com/base/status/123', 'post_x', 'hard', 175, 45, 'active', 'Social', null),
  ((select id from public.projects where slug = 'builder-guild'), 'Complete the gas primer', 'Read a short primer on L2 gas fees and mark the task complete when finished.', null, 'Read the primer and write one sentence about what you learned.', 'text', 'One sentence summary', 'Base fees are lower because execution is batched on L2.', 'learn', 'medium', 100, 30, 'active', 'Learning', null)
on conflict do nothing;

insert into public.badges (name, description)
values
  ('Base Starter', 'Connected a wallet and joined the first campaign.'),
  ('Quest Sprinter', 'Completed multiple community quests.'),
  ('Community Signal', 'Shared or submitted community activity.')
on conflict do nothing;
