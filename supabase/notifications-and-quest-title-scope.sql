alter table public.quests drop constraint if exists quests_project_id_title_key;
drop index if exists public.quests_project_campaign_title_unique_idx;
drop index if exists public.quests_project_uncampaigned_title_unique_idx;

create unique index if not exists quests_project_campaign_title_unique_idx
  on public.quests (project_id, campaign_id, lower(trim(title)))
  where campaign_id is not null;

create unique index if not exists quests_project_uncampaigned_title_unique_idx
  on public.quests (project_id, lower(trim(title)))
  where campaign_id is null;

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

alter table public.notifications enable row level security;

drop policy if exists "Notifications are readable for MVP" on public.notifications;
create policy "Notifications are readable for MVP" on public.notifications
  for select using (true);

drop policy if exists "Notifications can be created for MVP" on public.notifications;
create policy "Notifications can be created for MVP" on public.notifications
  for insert with check (recipient_wallet_address = lower(recipient_wallet_address));

drop policy if exists "Notifications can be updated for MVP" on public.notifications;
create policy "Notifications can be updated for MVP" on public.notifications
  for update using (true) with check (recipient_wallet_address = lower(recipient_wallet_address));
