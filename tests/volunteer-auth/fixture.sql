-- Test-only schema. This file is applied only to a disposable local Supabase stack in CI.
create schema if not exists private;

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  member_code_hash text not null unique,
  member_code_hint text,
  display_name text not null,
  status text not null check (status in ('invited', 'active', 'suspended')),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz,
  activated_at timestamptz,
  last_login_at timestamptz,
  session_started_at timestamptz,
  session_expires_at timestamptz
);

alter table public.volunteers enable row level security;
grant all on public.volunteers to service_role;

create table private.volunteer_auth_attempts (
  bucket_key text primary key,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default pg_catalog.now()
);

alter table private.volunteer_auth_attempts enable row level security;

create or replace function public.consume_volunteer_auth_attempt(
  p_bucket_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_attempt_count integer;
  v_window_started_at timestamptz;
begin
  insert into private.volunteer_auth_attempts (bucket_key, attempt_count, window_started_at)
  values (p_bucket_key, 0, pg_catalog.now())
  on conflict (bucket_key) do nothing;

  select attempt_count, window_started_at
    into v_attempt_count, v_window_started_at
    from private.volunteer_auth_attempts
    where bucket_key = p_bucket_key
    for update;

  if v_window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds) then
    update private.volunteer_auth_attempts
      set attempt_count = 0, window_started_at = pg_catalog.now()
      where bucket_key = p_bucket_key;
    v_attempt_count := 0;
  end if;

  if v_attempt_count >= p_max_attempts then
    return false;
  end if;

  update private.volunteer_auth_attempts
    set attempt_count = attempt_count + 1
    where bucket_key = p_bucket_key;

  return true;
end;
$$;

create or replace function public.clear_volunteer_auth_attempts(p_bucket_keys text[])
returns void
language sql
security definer
set search_path = pg_catalog, private
as $$
  delete from private.volunteer_auth_attempts
  where bucket_key = any(p_bucket_keys);
$$;

revoke all on function public.consume_volunteer_auth_attempt(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_volunteer_auth_attempts(text[]) from public, anon, authenticated;
grant execute on function public.consume_volunteer_auth_attempt(text, integer, integer) to service_role;
grant execute on function public.clear_volunteer_auth_attempts(text[]) to service_role;

create or replace function private.integration_test_claim_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status = 'invited' and new.status = 'active' and new.display_name = 'IT_ZERO_ROW' then
    return null;
  end if;

  if old.status = 'invited' and new.status = 'active' and new.display_name = 'IT_DB_ERROR' then
    raise exception 'intentional integration-test update failure';
  end if;

  return new;
end;
$$;

create trigger volunteer_claim_integration_test_guard
before update on public.volunteers
for each row execute function private.integration_test_claim_guard();
