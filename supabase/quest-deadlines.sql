alter table public.quests
add column if not exists ends_at timestamptz;
