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

alter table public.campaign_partners enable row level security;

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
