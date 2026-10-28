-- The flag describes whether children are coming. It does not restrict attendance.
-- Existing "everyone welcome" plans become "no kids" as agreed for the trial.
alter table public.plans drop constraint plans_company_check;
update public.plans set company = 'no_kids' where company in ('adults', 'anyone');
alter table public.plans add constraint plans_company_check
  check (company in ('no_kids', 'with_kids'));
update public.draft_conversations
  set draft = jsonb_set(draft, '{company}', '"no_kids"'::jsonb)
  where draft->>'company' in ('adults', 'anyone');
