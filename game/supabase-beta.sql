-- משחק הקווים · גרסת בטא: רק שני הנרשמים הראשונים מקבלים גישה
create table if not exists public.beta_testers (
  user_id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);
create table if not exists public.beta_waitlist (
  user_id uuid primary key references auth.users on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);
alter table public.beta_testers enable row level security;
alter table public.beta_waitlist enable row level security;

create policy "own row read"  on public.beta_testers  for select to authenticated using (user_id = auth.uid());
create policy "own row add"   on public.beta_testers  for insert to authenticated with check (user_id = auth.uid());
create policy "own wait read" on public.beta_waitlist for select to authenticated using (user_id = auth.uid());
create policy "own wait add"  on public.beta_waitlist for insert to authenticated with check (user_id = auth.uid());

revoke all on public.beta_testers, public.beta_waitlist from anon;
grant select, insert on public.beta_testers, public.beta_waitlist to authenticated;

-- לא יותר משני בודקים
create or replace function public.beta_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(4242);
  if (select count(*) from public.beta_testers) >= 2 then
    raise exception 'beta full';
  end if;
  return new;
end $$;
drop trigger if exists beta_limit on public.beta_testers;
create trigger beta_limit before insert on public.beta_testers
  for each row execute function public.beta_limit();
