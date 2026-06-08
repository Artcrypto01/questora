-- Questora pre-live audit
-- Safe to run in Supabase SQL Editor. This does not change data or policies.

select
  'platform_admins' as check_name,
  count(*)::text as result
from platform_admins;

select
  'public_projects_by_status' as check_name,
  status,
  count(*) as total
from projects
group by status
order by status;

select
  'active_quests_without_deadline' as check_name,
  count(*)::text as result
from quests
where status = 'active' and ends_at is null;

select
  'pending_submissions' as check_name,
  count(*)::text as result
from user_quests
where status = 'submitted';

select
  'anon_write_policies_to_review' as check_name,
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and roles::text ilike '%anon%'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
order by tablename, policyname;
