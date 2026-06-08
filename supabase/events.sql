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

alter table public.events enable row level security;

drop policy if exists "Events are readable" on public.events;
create policy "Events are readable" on public.events
  for select using (true);

drop policy if exists "Events can be created for MVP" on public.events;
create policy "Events can be created for MVP" on public.events
  for insert with check (true);

drop policy if exists "Events can be updated for MVP" on public.events;
create policy "Events can be updated for MVP" on public.events
  for update using (true) with check (true);
