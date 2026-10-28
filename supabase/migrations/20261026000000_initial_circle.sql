-- Hosted schema foundation. The local app uses SQLite until the hosted adapter is connected.
-- Create real auth users and circle memberships administratively. No public signup or invitations.

create table public.people (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  timezone text not null default 'America/Los_Angeles'
);
create table public.circles (id uuid primary key default gen_random_uuid(), name text not null);
create table public.circle_memberships (
  circle_id uuid not null references public.circles on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  primary key (circle_id, person_id)
);
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles,
  activity text not null check (char_length(trim(activity)) between 2 and 100),
  category text not null check (category in ('bike','library','walk','park','coffee','other')),
  company text not null check (company in ('adults','with_kids','anyone')),
  company_detail text not null default '' check (char_length(company_detail) <= 140),
  place text not null check (char_length(trim(place)) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  end_was_default boolean not null default false,
  timezone text not null,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'shared' check (status in ('shared','withdrawn')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.participations (
  plan_id uuid not null references public.plans on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  companions text not null default '',
  primary key (plan_id, person_id)
);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans,
  recipient_id uuid not null references public.people,
  plan_version integer not null,
  kind text not null check (kind in ('new','change','joined','left')),
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  provider_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (plan_id, recipient_id, plan_version, kind)
);
create table public.incoming_messages (
  provider_id text primary key,
  person_id uuid not null references public.people,
  body text not null,
  received_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','processed','failed'))
);
create table public.draft_conversations (
  person_id uuid primary key references public.people,
  draft jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index plans_by_circle_start on public.plans(circle_id, starts_at) where status = 'shared';
create index participation_person on public.participations(person_id);
create index pending_deliveries on public.notification_deliveries(next_attempt_at) where status in ('pending','failed');

-- These helpers avoid recursive membership policies and never trust a client-supplied person ID.
create function public.in_circle(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circle_memberships where circle_id = target and person_id = auth.uid());
$$;
create function public.attending(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.participations p join public.plans pl on pl.id=p.plan_id
    where p.plan_id=target and p.person_id=auth.uid() and public.in_circle(pl.circle_id));
$$;

alter table public.people enable row level security;
alter table public.circles enable row level security;
alter table public.circle_memberships enable row level security;
alter table public.plans enable row level security;
alter table public.participations enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.incoming_messages enable row level security;
alter table public.draft_conversations enable row level security;

create policy people_same_circle on public.people for select to authenticated using (
  exists (select 1 from public.circle_memberships m where m.person_id = people.id and public.in_circle(m.circle_id))
);
create policy circle_members_only on public.circles for select to authenticated using (public.in_circle(id));
create policy memberships_same_circle on public.circle_memberships for select to authenticated using (public.in_circle(circle_id));
create policy plans_same_circle on public.plans for select to authenticated using (public.in_circle(circle_id));
create policy participants_same_circle on public.participations for select to authenticated using (
  exists (select 1 from public.plans p where p.id = participations.plan_id and public.in_circle(p.circle_id))
);
create policy own_deliveries on public.notification_deliveries for select to authenticated using (recipient_id = auth.uid());
-- Inbox and drafts remain server-only. No authenticated policies or grants.

-- Mutations go through transactions below. Direct table edits cannot bypass notifications or checks.
revoke all on public.people, public.circles, public.circle_memberships, public.plans,
  public.participations, public.notification_deliveries, public.incoming_messages, public.draft_conversations from public, anon, authenticated;
grant select on public.people, public.circles, public.circle_memberships, public.plans,
  public.participations, public.notification_deliveries to authenticated;

create function public.share_plan(target_circle uuid, details jsonb) returns public.plans
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
  insert into public.plans(circle_id,activity,category,company,company_detail,place,starts_at,ends_at,end_was_default,timezone,note)
  values (target_circle,details->>'activity',details->>'category',details->>'company',coalesce(details->>'company_detail',''),details->>'place',start_time,end_time,(details->>'ends_at') is null,zone,coalesce(details->>'note','')) returning * into p;
  insert into public.participations(plan_id,person_id) values(p.id,auth.uid());
  insert into public.notification_deliveries(plan_id,recipient_id,plan_version,kind)
    select p.id,m.person_id,p.version,'new' from public.circle_memberships m where m.circle_id=target_circle and m.person_id<>auth.uid();
  return p;
end;
$$;

create function public.set_participation(target uuid, coming boolean) returns public.plans
language plpgsql security definer set search_path = '' as $$
declare p public.plans; already boolean;
begin
  select * into p from public.plans where id=target for update;
  if p.id is null or not public.in_circle(p.circle_id) then raise exception 'Plan unavailable' using errcode='42501'; end if;
  if p.status<>'shared' or p.ends_at<=now() then raise exception 'This plan has ended'; end if;
  select exists(select 1 from public.participations where plan_id=target and person_id=auth.uid()) into already;
  if already=coming then return p; end if;
  if coming then insert into public.participations(plan_id,person_id) values(target,auth.uid());
  else delete from public.participations where plan_id=target and person_id=auth.uid(); end if;
  update public.plans set version=version+1,
    status=case when exists(select 1 from public.participations where plan_id=target) then 'shared' else 'withdrawn' end
    where id=target returning * into p;
  insert into public.notification_deliveries(plan_id,recipient_id,plan_version,kind)
    select target,pa.person_id,p.version,case when coming then 'joined' else 'left' end
    from public.participations pa join public.circle_memberships m on m.person_id=pa.person_id and m.circle_id=p.circle_id
    where pa.plan_id=target and pa.person_id<>auth.uid();
  return p;
end;
$$;

create function public.edit_plan(target uuid, expected_version integer, details jsonb) returns public.plans
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
  update public.plans set activity=details->>'activity',category=details->>'category',company=details->>'company',
    company_detail=coalesce(details->>'company_detail',''),place=details->>'place',starts_at=start_time,ends_at=end_time,
    end_was_default=(details->>'ends_at') is null,timezone=zone,note=coalesce(details->>'note',''),version=version+1
    where id=target returning * into p;
  insert into public.notification_deliveries(plan_id,recipient_id,plan_version,kind)
    select target,pa.person_id,p.version,'change' from public.participations pa
    join public.circle_memberships m on m.person_id=pa.person_id and m.circle_id=p.circle_id
    where pa.plan_id=target and pa.person_id<>auth.uid();
  return p;
end;
$$;

revoke all on function public.in_circle(uuid), public.attending(uuid), public.share_plan(uuid,jsonb), public.set_participation(uuid,boolean), public.edit_plan(uuid,integer,jsonb) from public;
grant execute on function public.in_circle(uuid), public.attending(uuid), public.share_plan(uuid,jsonb), public.set_participation(uuid,boolean), public.edit_plan(uuid,integer,jsonb) to authenticated;
