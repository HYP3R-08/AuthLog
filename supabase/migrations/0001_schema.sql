-- AuthLog — database schema
--
-- Defines the tables and the Row Level Security policies the system relies on.
-- The schema is versioned here because the access rules are part of the system:
-- without them the project cannot be reviewed or reproduced.
--
-- Applying this to a project that already holds data is destructive. Diff it
-- against `supabase db dump` and plan a migration first.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Accounts created through the mobile app.
--
-- Passwords are NOT stored here. Authentication is delegated to Supabase Auth
-- (auth.users), which hashes credentials and manages sessions; this table only
-- holds profile data, keyed by the auth user id.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text        not null,
  cognome     text        not null,
  created_at  timestamptz not null default now()
);

-- Users cleared for physical access. An administrator promotes a profile by
-- inserting its uuid here; membership in this table is what opens the door.
create table if not exists public.authorized (
  uuid          uuid primary key references public.profiles (id) on delete cascade,
  authorized_at timestamptz not null default now()
);

-- One row per access attempt.
--
-- `uuid_auth` is nullable and carries no foreign key: a denied attempt may
-- present a UUID that exists in no table, and those are exactly the attempts
-- worth recording. A log that can only store successes cannot show someone
-- probing the door.
create table if not exists public.logs (
  id         bigint generated always as identity primary key,
  uuid_auth  uuid,
  granted    boolean     not null,
  log_time   timestamptz not null default now()
);

create index if not exists logs_log_time_idx on public.logs (log_time desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Every table denies by default. No policy is granted to `anon`, so the mobile
-- app's publishable key can read nothing on its own.
--
-- The gateway does not appear here: it never talks to the database. It calls
-- the verify-access Edge Function, which uses the service role key and bypasses
-- RLS by design — that is why the key must stay in the function environment and
-- never ship inside firmware or an APK.

alter table public.profiles   enable row level security;
alter table public.authorized enable row level security;
alter table public.logs       enable row level security;

-- A signed-in user may read and update only their own profile.
create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- The app needs to know whether the signed-in user is authorized, and nothing
-- about anyone else.
create policy "authorization is readable by its owner"
  on public.authorized for select
  using (auth.uid() = uuid);

-- Nobody reads or writes logs through the API. They are written by the Edge
-- Function (service role) and read by an administrator in the dashboard.
-- Deliberately no policy: RLS denies everything that is not explicitly allowed.

-- ---------------------------------------------------------------------------
-- Profile creation
-- ---------------------------------------------------------------------------
--
-- Created by trigger rather than by the client, so a profile row cannot be
-- forged for an id that has no matching auth user.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, cognome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.raw_user_meta_data ->> 'cognome', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
