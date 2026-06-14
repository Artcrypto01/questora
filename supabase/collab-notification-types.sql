alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'submission_created',
      'submission_approved',
      'submission_rejected',
      'project_approved',
      'project_rejected',
      'campaign_partner_invited',
      'campaign_partner_accepted',
      'campaign_partner_rejected'
    )
  );
