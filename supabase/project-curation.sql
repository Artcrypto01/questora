alter table public.projects add column if not exists is_verified boolean not null default false;
alter table public.projects add column if not exists verified_at timestamptz;
alter table public.projects add column if not exists is_featured boolean not null default false;
alter table public.projects add column if not exists featured_rank integer;
alter table public.projects add column if not exists featured_until timestamptz;

alter table public.projects drop constraint if exists projects_featured_rank_check;
alter table public.projects add constraint projects_featured_rank_check
  check (featured_rank is null or (featured_rank >= 1 and featured_rank <= 5));

create index if not exists projects_featured_sort_idx
  on public.projects (is_featured, featured_rank, featured_until, is_verified, created_at);
