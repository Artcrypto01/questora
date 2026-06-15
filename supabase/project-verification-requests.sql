create table if not exists public.project_verification_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  requester_wallet_address text not null,
  reason text not null,
  proof_url text,
  status text not null default 'submitted',
  review_note text,
  reviewed_by_wallet_address text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint project_verification_requests_status_check check (status in ('submitted', 'approved', 'rejected')),
  constraint project_verification_requests_requester_lowercase check (requester_wallet_address = lower(requester_wallet_address)),
  constraint project_verification_requests_reviewer_lowercase check (reviewed_by_wallet_address is null or reviewed_by_wallet_address = lower(reviewed_by_wallet_address))
);

create index if not exists project_verification_requests_project_idx on public.project_verification_requests (project_id, status, created_at desc);
create index if not exists project_verification_requests_status_idx on public.project_verification_requests (status, created_at desc);

alter table public.project_verification_requests enable row level security;

drop policy if exists "Verification requests are readable for MVP" on public.project_verification_requests;
create policy "Verification requests are readable for MVP" on public.project_verification_requests
  for select using (true);

drop policy if exists "Verification requests can be created for MVP" on public.project_verification_requests;
create policy "Verification requests can be created for MVP" on public.project_verification_requests
  for insert with check (requester_wallet_address = lower(requester_wallet_address));

drop policy if exists "Verification requests can be updated for MVP" on public.project_verification_requests;
create policy "Verification requests can be updated for MVP" on public.project_verification_requests
  for update using (true) with check (
    requester_wallet_address = lower(requester_wallet_address)
    and (reviewed_by_wallet_address is null or reviewed_by_wallet_address = lower(reviewed_by_wallet_address))
  );
