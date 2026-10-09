-- AuthLog: the primary administrator
--
-- One administrator is the primary: the first one. Only the primary can make
-- other users administrators, and only users who are not administrators yet.
-- Nobody can remove an administrator or change who the primary is through the
-- API; those stay dashboard operations.
--
-- As in 0002, `admins` has no write policy. Every change goes through the
-- security definer functions below, which check the caller first.

-- ---------------------------------------------------------------------------
-- Primary flag
-- ---------------------------------------------------------------------------

alter table public.admins
  add column if not exists is_primary boolean not null default false;

-- At most one primary. A partial unique index rather than a trigger: the
-- database itself refuses a second one.
create unique index if not exists admins_single_primary
  on public.admins (is_primary)
  where is_primary;

-- The earliest administrator becomes the primary, if there is none yet.
update public.admins
set is_primary = true
where uuid = (
    select uuid from public.admins
    order by created_at asc, uuid asc
    limit 1
  )
  and not exists (select 1 from public.admins where is_primary);

create or replace function public.is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where uuid = auth.uid() and is_primary
  );
$$;

-- ---------------------------------------------------------------------------
-- Functions for the primary administrator
-- ---------------------------------------------------------------------------

-- Users who could be promoted: everyone with a profile who is not an
-- administrator. The email comes from auth.users, which the API cannot read
-- directly; it is shown so two people with the same name can be told apart.
create or replace function public.admin_candidates()
returns table (
  id          uuid,
  nome        text,
  cognome     text,
  email       text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select p.id, p.nome, p.cognome, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where not exists (select 1 from public.admins a where a.uuid = p.id)
    order by p.cognome, p.nome;
end;
$$;

create or replace function public.admin_members()
returns table (
  id          uuid,
  nome        text,
  cognome     text,
  email       text,
  is_primary  boolean,
  since       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
    select p.id, p.nome, p.cognome, u.email::text, a.is_primary, a.created_at
    from public.admins a
    join public.profiles p on p.id = a.uuid
    join auth.users u on u.id = a.uuid
    order by a.is_primary desc, a.created_at;
end;
$$;

-- Promotes one user. Refuses anyone who is not the primary, an unknown user,
-- and a user who is already an administrator.
create or replace function public.grant_admin(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_primary_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'unknown user' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.admins where uuid = p_user) then
    raise exception 'already an administrator' using errcode = '23505';
  end if;

  insert into public.admins (uuid) values (p_user);
end;
$$;

revoke all on function public.is_primary_admin() from public, anon;
grant execute on function public.is_primary_admin() to authenticated;

revoke all on function public.admin_candidates() from public, anon;
grant execute on function public.admin_candidates() to authenticated;

revoke all on function public.admin_members() from public, anon;
grant execute on function public.admin_members() to authenticated;

revoke all on function public.grant_admin(uuid) from public, anon;
grant execute on function public.grant_admin(uuid) to authenticated;
