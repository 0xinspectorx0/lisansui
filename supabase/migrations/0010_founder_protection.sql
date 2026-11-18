-- Bind the founder to an EXISTING confirmed Supabase Auth UID, not merely an
-- email claim. Run only after checking Email confirmation is enabled and the
-- owner has verified control of this account. Never create an Auth account here.
do $$
declare founder_uid uuid;
begin
  select id into founder_uid from auth.users
   where lower(trim(email)) = 'gokhntekin@gmail.com' and email_confirmed_at is not null;
  if founder_uid is null then
    raise exception 'Founder setup requires an existing, verified gokhntekin@gmail.com Auth account';
  end if;
  perform set_config('request.jwt.claims', '{"app_admin":true}', true);
  insert into public.admins(email, "userId", "addedBy")
    values ('gokhntekin@gmail.com', founder_uid, 'founder migration')
    on conflict (email) do update set "userId" = excluded."userId";
  insert into public.members ("id", "email", "emailNormalized", "authUid", "algo", "role", "status")
    values ('gokhntekin@gmail.com', 'gokhntekin@gmail.com', 'gokhntekin@gmail.com', founder_uid::text, 'supabase-auth', 'owner', 'active')
    on conflict ("email") do update set "authUid" = excluded."authUid", "role" = 'owner', "status" = 'active';
end $$;

-- Founder access must match the pinned UID, never a bare email claim.
create or replace function public.kpss_is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'app_admin') = 'true'
    or exists (
      select 1 from public.admins a
      where (auth.uid() is not null and a."userId" = auth.uid())
         or (a.email::text <> 'gokhntekin@gmail.com' and kpss_session_email() <> '' and a.email::text = kpss_session_email())
    ), false);
$$;

-- The old admin-list RPC replaces the list. Skip deletion and duplicate insert
-- of the protected row so updating the other administrators still works.
create or replace function public.kpss_founder_admin_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and (old.email::text = 'gokhntekin@gmail.com'
       or (auth.uid() is not null and (old."userId" = auth.uid() or old.email::text = public.kpss_session_email()))) then
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.email::text = 'gokhntekin@gmail.com' or new.email::text = 'gokhntekin@gmail.com') then
    if old.email is distinct from new.email or old."userId" is distinct from new."userId" then
      raise exception 'Founder admin identity cannot be changed' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' and new.email::text = 'gokhntekin@gmail.com' then
    if exists (select 1 from public.admins where email = 'gokhntekin@gmail.com') then return null; end if;
    raise exception 'Founder admin identity is protected' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null and new.email::text = public.kpss_session_email()
     and exists (select 1 from public.admins where email = new.email) then return null; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists kpss_founder_admin_guard on public.admins;
create trigger kpss_founder_admin_guard before insert or update or delete on public.admins
for each row execute function public.kpss_founder_admin_guard();

create or replace function public.kpss_founder_member_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.email::text = 'gokhntekin@gmail.com' then
    raise exception 'Founder account cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.email::text = 'gokhntekin@gmail.com' then
    if new.email is distinct from old.email or new.id is distinct from old.id
       or new."emailNormalized" is distinct from old."emailNormalized"
       or new."authUid" is distinct from old."authUid"
       or new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Founder identity, role and status cannot be changed' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.email::text = 'gokhntekin@gmail.com' and old.email::text <> 'gokhntekin@gmail.com' then
    raise exception 'Founder identity is protected' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists a_kpss_founder_member_guard on public.members;
create trigger a_kpss_founder_member_guard before update or delete on public.members
for each row execute function public.kpss_founder_member_guard();

-- Protect the actual Auth identity too; changing unrelated Auth fields (tokens,
-- sign-in timestamps, password) remains possible. Privileged DB owners can
-- still alter or disable database triggers, as with any database rule.
create or replace function public.kpss_founder_auth_guard()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare founder_uid uuid;
begin
  select "userId" into founder_uid from public.admins where email::text = 'gokhntekin@gmail.com';
  if old.id = founder_uid then
    if tg_op = 'DELETE' then
      raise exception 'Founder Auth account cannot be deleted' using errcode = '42501';
    end if;
    if new.email is distinct from old.email or new.email_confirmed_at is null then
      raise exception 'Founder Auth email and verification cannot be changed' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.kpss_founder_auth_guard() from public, anon, authenticated;
drop trigger if exists kpss_founder_auth_guard on auth.users;
create trigger kpss_founder_auth_guard before update or delete on auth.users
for each row execute function public.kpss_founder_auth_guard();
