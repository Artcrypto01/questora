alter table public.quests drop constraint if exists quests_quest_type_check;

alter table public.quests
add constraint quests_quest_type_check
check (quest_type in ('follow_x', 'retweet_x', 'join_discord', 'post_x', 'submit_proof', 'onchain', 'learn', 'feedback', 'custom'));
