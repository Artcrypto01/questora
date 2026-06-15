create table if not exists public.project_launches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  launch_type text not null default 'other',
  launch_url text,
  price text,
  supply text,
  network text,
  cover_image_url text,
  starts_at timestamptz,
  status text not null default 'active',
  is_featured boolean not null default false,
  featured_rank integer,
  created_at timestamptz not null default now(),
  constraint project_launches_status_check check (status in ('active', 'draft', 'archived')),
  constraint project_launches_type_check check (launch_type in ('nft_mint', 'token_launch', 'beta_launch', 'game_launch', 'whitelist', 'airdrop', 'other')),
  constraint project_launches_featured_rank_check check (featured_rank is null or (featured_rank >= 1 and featured_rank <= 5))
);

create unique index if not exists project_launches_project_slug_unique
  on public.project_launches (project_id, slug);

create index if not exists project_launches_status_date_idx
  on public.project_launches (status, starts_at, created_at);

create index if not exists project_launches_project_idx
  on public.project_launches (project_id, status, created_at desc);

create index if not exists project_launches_featured_sort_idx
  on public.project_launches (is_featured, featured_rank, starts_at);

alter table public.project_launches enable row level security;

drop policy if exists "Project launches are readable" on public.project_launches;
create policy "Project launches are readable" on public.project_launches
  for select using (true);

drop policy if exists "Project launches can be created for MVP" on public.project_launches;
create policy "Project launches can be created for MVP" on public.project_launches
  for insert with check (true);

drop policy if exists "Project launches can be updated for MVP" on public.project_launches;
create policy "Project launches can be updated for MVP" on public.project_launches
  for update using (true) with check (true);
