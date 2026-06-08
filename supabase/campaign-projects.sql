alter table public.campaigns add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.campaigns add column if not exists slug text;
alter table public.campaigns add column if not exists purpose text;
alter table public.campaigns drop constraint if exists campaigns_name_key;

update public.campaigns
set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
where slug is null or slug = '';

alter table public.campaigns alter column slug set not null;

alter table public.campaigns drop constraint if exists campaigns_project_slug_unique;
alter table public.campaigns add constraint campaigns_project_slug_unique unique (project_id, slug);

create index if not exists campaigns_project_status_idx on public.campaigns (project_id, status, created_at);

drop policy if exists "Campaigns can be updated for MVP" on public.campaigns;
create policy "Campaigns can be updated for MVP" on public.campaigns
  for update using (true) with check (true);
