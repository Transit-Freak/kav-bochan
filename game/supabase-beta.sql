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
-- רק משתמש רשום (לא אנונימי) יכול לתפוס מקום בבטא
create policy "own row add"   on public.beta_testers  for insert to authenticated with check (user_id = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);
create policy "own wait read" on public.beta_waitlist for select to authenticated using (user_id = auth.uid());
create policy "own wait add"  on public.beta_waitlist for insert to authenticated with check (user_id = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false);

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

-- שמירה בענן במשחק: שמירה אחת בכל שם לכל משתמש
create unique index if not exists saves_user_name on public.saves (user_id, name);

-- דף הבית: רק מספר הנרשמים לבטא (בלי שמות), כדי לכתוב בכרטיס כשההרשמה נסגרה
create or replace function public.beta_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.beta_testers
$$;
revoke all on function public.beta_count() from public;
grant execute on function public.beta_count() to anon, authenticated;

-- ===== 09.11.2026: שני בודקים חדשים בכל שבוע (השבוע מתחיל ביום ראשון, שעון ישראל) =====
create or replace function public.beta_week_start() returns timestamptz
language sql stable set search_path = public as $$
  select ((date_trunc('week', (now() at time zone 'Asia/Jerusalem') + interval '1 day') - interval '1 day')
          at time zone 'Asia/Jerusalem')
$$;

create or replace function public.beta_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(4242);
  if (select count(*) from public.beta_testers where created_at >= public.beta_week_start()) >= 2 then
    raise exception 'beta full';
  end if;
  return new;
end $$;

-- כמה נרשמו השבוע (מספר בלבד) — לדף הבית ולמסך הכניסה
create or replace function public.beta_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.beta_testers where created_at >= public.beta_week_start()
$$;
revoke all on function public.beta_count() from public;
grant execute on function public.beta_count() to anon, authenticated;
