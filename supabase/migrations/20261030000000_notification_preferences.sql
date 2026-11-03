-- Keep preferences separate from the circle directory. Activity filters can be added here later.
create table public.notification_preferences (
  person_id uuid primary key references public.people(id) on delete cascade,
  enabled boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
create policy own_preferences_select on public.notification_preferences for select to authenticated using (person_id = auth.uid());
create policy own_preferences_insert on public.notification_preferences for insert to authenticated with check (person_id = auth.uid());
create policy own_preferences_update on public.notification_preferences for update to authenticated using (person_id = auth.uid()) with check (person_id = auth.uid());

create function public.filter_plan_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.notification_preferences where person_id = new.recipient_id and not enabled) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.filter_plan_notification() from public, anon, authenticated;
create trigger filter_plan_notification before insert on public.notification_deliveries
for each row execute function public.filter_plan_notification();
