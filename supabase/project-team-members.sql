alter table public.project_members add column if not exists status text not null default 'active';

update public.project_members
set status = 'active'
where status is null;

update public.project_members
set role = 'community_manager'
where role in ('admin', 'reviewer');

alter table public.project_members drop constraint if exists project_members_role_check;
alter table public.project_members add constraint project_members_role_check
  check (role in ('owner', 'community_manager'));

alter table public.project_members drop constraint if exists project_members_status_check;
alter table public.project_members add constraint project_members_status_check
  check (status in ('pending', 'active', 'rejected'));

create index if not exists project_members_wallet_status_idx
  on public.project_members (wallet_address, status);

create index if not exists project_members_project_status_idx
  on public.project_members (project_id, status);

drop policy if exists "Project members can be updated for MVP" on public.project_members;
create policy "Project members can be updated for MVP" on public.project_members
  for update using (true) with check (
    wallet_address = lower(wallet_address)
    and role in ('owner', 'community_manager')
    and status in ('pending', 'active', 'rejected')
  );

drop policy if exists "Project members can be deleted for MVP" on public.project_members;
create policy "Project members can be deleted for MVP" on public.project_members
  for delete using (true);

do $$
begin
  if exists (
    select 1
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'notifications'
      and constraint_name = 'notifications_type_check'
  ) then
    alter table public.notifications drop constraint notifications_type_check;
    alter table public.notifications add constraint notifications_type_check
      check (type in (
        'submission_created',
        'submission_approved',
        'submission_rejected',
        'project_approved',
        'project_rejected',
        'campaign_partner_invited',
        'campaign_partner_accepted',
        'campaign_partner_rejected',
        'project_team_invited',
        'project_team_accepted',
        'project_team_rejected'
      ));
  end if;
end $$;
