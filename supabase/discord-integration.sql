alter table public.users add column if not exists discord_username text;
alter table public.users add column if not exists discord_user_id text;
alter table public.users add column if not exists discord_connected_at timestamptz;

create unique index if not exists users_discord_user_id_key
  on public.users (discord_user_id)
  where discord_user_id is not null;

drop view if exists public.leaderboard;
create view public.leaderboard as
select
  u.id,
  u.wallet_address,
  u.display_name,
  u.avatar_url,
  u.x_username,
  u.discord_username,
  u.discord_user_id,
  u.discord_connected_at,
  u.bio,
  coalesce(sum(q.global_xp_reward), 0)::integer as total_xp,
  count(uq.id)::integer as completed_quests,
  u.created_at
from public.users u
left join public.user_quests uq on uq.user_id = u.id and uq.status = 'approved' and uq.reviewed_at is not null
left join public.quests q on q.id = uq.quest_id
group by u.id, u.wallet_address, u.display_name, u.avatar_url, u.x_username, u.discord_username, u.discord_user_id, u.discord_connected_at, u.bio, u.created_at;
