-- PROPOSED ONLY — do not run until reviewed and explicitly approved.
-- Adds a single-current-session pointer for volunteer application access.
alter table public.volunteers
  add column if not exists current_session_id uuid;

-- Verify the JWT session still exists in Supabase Auth.
-- The function is callable only by service_role (used server-side by the Edge Function).
create or replace function public.volunteer_auth_session_exists(
  p_session_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from auth.sessions as s
    where s.id = p_session_id
      and s.user_id = p_user_id
  );
$function$;

revoke all on function public.volunteer_auth_session_exists(uuid, uuid) from public;
revoke all on function public.volunteer_auth_session_exists(uuid, uuid) from anon, authenticated;
grant execute on function public.volunteer_auth_session_exists(uuid, uuid) to service_role;

comment on column public.volunteers.current_session_id is
  'Supabase Auth session UUID currently authorized for this volunteer application account.';
