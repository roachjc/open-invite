-- Age groups describe who is attending, not who may join.
alter table public.plans add column age_groups text[];
update public.plans set age_groups = case when company = 'with_kids' then ARRAY['kids','adults'] else ARRAY['adults'] end;
alter table public.plans alter column age_groups set not null;
alter table public.plans add constraint plans_age_groups_check check (
  cardinality(age_groups) > 0 and age_groups <@ ARRAY['kids','adults']::text[]
  and array_position(age_groups, null) is null
);
alter table public.plans drop column company;
alter table public.plans rename column company_detail to attendee_detail;
update public.draft_conversations set draft = jsonb_set(draft, '{ageGroups}',
  case when draft->>'company' = 'with_kids' then '["kids","adults"]'::jsonb else '["adults"]'::jsonb end)
  where not draft ? 'ageGroups' and draft->>'company' in ('with_kids','no_kids','adults','anyone');
update public.draft_conversations set draft = jsonb_set(draft, '{attendeeDetail}', draft->'companyDetail')
  where draft ? 'companyDetail';
update public.draft_conversations set draft = draft - 'company' - 'companyDetail';

create or replace function public.share_plan(target_circle uuid, details jsonb) returns public.plans
language plpgsql security definer set search_path = '' as $$
declare p public.plans; start_time timestamptz; end_time timestamptz; zone text;
begin
  if not public.in_circle(target_circle) then raise exception 'Not a member of this circle' using errcode='42501'; end if;
  zone := details->>'timezone';
  if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Invalid time zone'; end if;
  start_time := (details->>'starts_at')::timestamptz;
  if start_time < now() - interval '5 minutes' then raise exception 'The start time has passed'; end if;
  end_time := coalesce((details->>'ends_at')::timestamptz,
    (date_trunc('day', start_time at time zone zone) + interval '1 day') at time zone zone);
  insert into public.plans(circle_id,activity,category,age_groups,attendee_detail,place,starts_at,ends_at,end_was_default,timezone,note)
  values (target_circle,details->>'activity',details->>'category',ARRAY(select jsonb_array_elements_text(details->'age_groups')),coalesce(details->>'attendee_detail',''),details->>'place',start_time,end_time,(details->>'ends_at') is null,zone,coalesce(details->>'note','')) returning * into p;
  insert into public.participations(plan_id,person_id) values(p.id,auth.uid());
  insert into public.notification_deliveries(plan_id,recipient_id,plan_version,kind)
    select p.id,m.person_id,p.version,'new' from public.circle_memberships m where m.circle_id=target_circle and m.person_id<>auth.uid();
  return p;
end;
$$;

create or replace function public.edit_plan(target uuid, expected_version integer, details jsonb) returns public.plans
language plpgsql security definer set search_path = '' as $$
declare p public.plans; start_time timestamptz; end_time timestamptz; zone text;
begin
  select * into p from public.plans where id=target for update;
  if p.id is null or not public.attending(target) then raise exception 'Only participants can edit' using errcode='42501'; end if;
  if p.status<>'shared' or p.ends_at<=now() then raise exception 'This plan has ended'; end if;
  if p.version<>expected_version then raise exception 'Plan changed, reload before editing' using errcode='40001'; end if;
  zone := details->>'timezone';
  if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Invalid time zone'; end if;
  start_time := (details->>'starts_at')::timestamptz;
  end_time := coalesce((details->>'ends_at')::timestamptz,
    (date_trunc('day', start_time at time zone zone) + interval '1 day') at time zone zone);
  update public.plans set activity=details->>'activity',category=details->>'category',age_groups=ARRAY(select jsonb_array_elements_text(details->'age_groups')),
    attendee_detail=coalesce(details->>'attendee_detail',''),place=details->>'place',starts_at=start_time,ends_at=end_time,
    end_was_default=(details->>'ends_at') is null,timezone=zone,note=coalesce(details->>'note',''),version=version+1
    where id=target returning * into p;
  insert into public.notification_deliveries(plan_id,recipient_id,plan_version,kind)
    select target,pa.person_id,p.version,'change' from public.participations pa
    join public.circle_memberships m on m.person_id=pa.person_id and m.circle_id=p.circle_id
    where pa.plan_id=target and pa.person_id<>auth.uid();
  return p;
end;
$$;
