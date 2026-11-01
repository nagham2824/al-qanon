-- PROPOSED ONLY — do not run until reviewed and explicitly approved.
-- Adds a single-current-session pointer for volunteer application access.
alter table public.volunteers
  add column if not exists current_session_id uuid;

-- Check that the supplied Auth session still exists and belongs to the user.
-- SECURITY DEFINER is required to read auth.sessions through the Data API.
-- Execution is restricted both by GRANT and by an explicit service_role claim check.
create or replace function public.volunteer_auth_session_exists(
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
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
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

revoke all on function public.volunteer_auth_session_exists(uuid, uuid) from public;
revoke all on function public.volunteer_auth_session_exists(uuid, uuid) from anon, authenticated;
grant execute on function public.volunteer_auth_session_exists(uuid, uuid) to service_role;

comment on column public.volunteers.current_session_id is
  'Supabase Auth session UUID currently authorized for this volunteer application account.';
