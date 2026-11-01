-- PROPOSED ONLY — do not run until reviewed and explicitly approved.
-- Adds a single-current-session pointer for volunteer application access.
alter table public.volunteers
  add column if not exists current_session_id uuid;

-- Keep the privileged lookup in the existing non-exposed private schema.
-- The public RPC is SECURITY INVOKER and is executable only by service_role.
create or replace function private.volunteer_auth_session_exists_internal(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce((coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role'), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role is required';
  end if;

  return exists (
    select 1
    from auth.sessions as s
    where s.id = p_session_id
      and s.user_id = p_user_id
  );
end;
$function$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke all on function private.volunteer_auth_session_exists_internal(uuid, uuid) from public, anon, authenticated;
grant execute on function private.volunteer_auth_session_exists_internal(uuid, uuid) to service_role;

create or replace function public.volunteer_auth_session_exists(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.volunteer_auth_session_exists_internal(p_session_id, p_user_id);
$function$;

revoke all on function public.volunteer_auth_session_exists(uuid, uuid) from public, anon, authenticated;
grant execute on function public.volunteer_auth_session_exists(uuid, uuid) to service_role;

comment on column public.volunteers.current_session_id is
  'Supabase Auth session UUID currently authorized for this volunteer application account.';
