alter table public.quests add column if not exists quest_type text not null default 'submit_proof';
alter table public.quests add column if not exists difficulty text not null default 'medium';
alter table public.quests add column if not exists global_xp_reward integer not null default 1;

alter table public.quests drop constraint if exists quests_quest_type_check;
alter table public.quests add constraint quests_quest_type_check check (quest_type in ('follow_x', 'retweet_x', 'join_discord', 'post_x', 'submit_proof', 'onchain', 'learn', 'feedback', 'custom'));

alter table public.quests drop constraint if exists quests_difficulty_check;
alter table public.quests add constraint quests_difficulty_check check (difficulty in ('easy', 'medium', 'hard'));

alter table public.quests drop constraint if exists quests_global_xp_reward_check;
alter table public.quests add constraint quests_global_xp_reward_check check (global_xp_reward > 0);

alter table public.user_quests add column if not exists global_xp_awarded integer not null default 1;

alter table public.user_quests drop constraint if exists user_quests_global_xp_awarded_check;
alter table public.user_quests add constraint user_quests_global_xp_awarded_check check (global_xp_awarded > 0);

update public.quests
set
  quest_type = case
    when proof_type = 'tweet' then 'post_x'
    when proof_type = 'discord' then 'join_discord'
    when proof_type = 'wallet' then 'onchain'
    when category = 'Learning' then 'learn'
    else 'submit_proof'
  end,
  difficulty = case
    when xp_reward <= 75 then 'easy'
    when xp_reward >= 200 then 'hard'
    else 'medium'
  end,
  global_xp_reward = least(greatest(round(xp_reward * 0.35), 1), case
    when proof_type = 'wallet' then 175
    when proof_type = 'tweet' then 45
    when proof_type = 'discord' then 20
    when category = 'Learning' then 50
    else 75
  end)
where global_xp_reward = 1;

update public.user_quests uq
set global_xp_awarded = q.global_xp_reward
from public.quests q
where q.id = uq.quest_id
and uq.global_xp_awarded = 1;

drop view if exists public.leaderboard;
create view public.leaderboard as
select
  u.id,
  u.wallet_address,
  u.display_name,
  u.avatar_url,
  u.x_username,
  u.discord_username,
  u.bio,
  coalesce(sum(q.global_xp_reward), 0)::integer as total_xp,
  count(uq.id)::integer as completed_quests,
  u.created_at
from public.users u
left join public.user_quests uq on uq.user_id = u.id and uq.status = 'approved' and uq.reviewed_at is not null
left join public.quests q on q.id = uq.quest_id
group by u.id, u.wallet_address, u.display_name, u.avatar_url, u.x_username, u.discord_username, u.bio, u.created_at;
