-- AuthLog: administrators and the access log view
--
-- Administrators can read the access log from the mobile app, with the name of
-- the person behind each attempt. Everyone else still reads nothing: `logs`
-- keeps its deny-all RLS, and the only way in is the function below, which
-- checks membership before returning a single row.

-- ---------------------------------------------------------------------------
-- Administrators
-- ---------------------------------------------------------------------------
--
-- A separate table, not a flag on `profiles`: profiles are updatable by their
-- owner, so a column there would let any user promote themselves. Nobody can
-- write here through the API; an administrator is added from the dashboard.

create table if not exists public.admins (
  uuid        uuid primary key references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Lets the app ask "am I an administrator?" and learn nothing about anyone else.
create policy "admin membership is readable by its owner"
  on public.admins for select
  using (auth.uid() = uuid);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where uuid = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Access log for administrators
-- ---------------------------------------------------------------------------
--
-- Joins each attempt to the profile that presented it. Denied attempts can
-- carry a UUID that belongs to no profile; they are kept, with no name, because
-- those are the ones an administrator most needs to see.
--
-- Pagination is keyset on (log_time, id): stable while new attempts arrive,
-- unlike an offset, which would shift every page by one per new row.

create or replace function public.admin_access_logs(
  p_limit        integer     default 50,
  p_before_time  timestamptz default null,
  p_before_id    bigint      default null
)
returns table (
  id         bigint,
  log_time   timestamptz,
  granted    boolean,
  uuid_auth  uuid,
  nome       text,
  cognome    text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select l.id, l.log_time, l.granted, l.uuid_auth, p.nome, p.cognome
    from public.logs l
    left join public.profiles p on p.id = l.uuid_auth
    where p_before_time is null
       or (l.log_time, l.id) < (p_before_time, coalesce(p_before_id, 9223372036854775807))
    order by l.log_time desc, l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Supabase grants EXECUTE on new functions to `anon` by default. Neither
-- function has anything to say to a visitor who is not signed in.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.admin_access_logs(integer, timestamptz, bigint) from public, anon;
grant execute on function public.admin_access_logs(integer, timestamptz, bigint) to authenticated;
