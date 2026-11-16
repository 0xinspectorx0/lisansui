-- Require approval for all new self-registrations on existing installations.
create or replace function kpss_guard_member_write()
returns trigger
language plpgsql
as $$
declare
  -- Politika tek satırda durur (id = 1); hüküm yazmanın olduğu yerde okunur.
  v_policy public.membership_policy%rowtype;
begin
  select * into v_policy from public.membership_policy where id = 1 limit 1;

  if tg_op = 'INSERT' then
    -- Kimliksiz kayıt (uygulama kendi hesabını açıyor). Politika TEK karar
    -- vericidir ve burada, sunucuda okunur: arayüz denetimi yeterli değildir.
    if not kpss_is_admin() then
      if kpss_membership_locked() then
        raise exception 'membership lockdown is on: new signups are closed'
          using errcode = '42501';
      end if;
      if coalesce(v_policy."registrationOpen", true) is not true then
        raise exception 'registration is closed by the admin' using errcode = '42501';
      end if;
      if new."role" <> 'user' then
        raise exception 'role must be user on self signup' using errcode = '42501';
      end if;
      if new."status" not in ('pending','active') then
        raise exception 'status must be pending or active on self signup'
          using errcode = '42501';
      end if;
      -- ONAY: “admin onayı olmadan üyelik aktif olmaz” kuralı burada uygulanır.
      if new."status" <> 'pending' then
        raise exception 'new members stay pending until an admin approves'
          using errcode = '42501';
      end if;
      -- Hak alanları İSTEMCİYE bırakılmaz: deneme VIP'ini politika verir, istemcinin
      -- gönderdiği değer yok sayılır. (Eskiden "vip:true" gönderen kayıt red yiyordu;
      --  bu, deneme süresi ayarlı projelerde kaydı tamamen engelliyordu.)
      new."vip" := false;
      new."vipPlan" := 'free';
      new."vipExpiresAt" := '';
      if coalesce(v_policy."defaultTrialDays", 0) > 0 then
        new."vip" := true;
        new."vipPlan" := 'monthly';
        -- uygulama bu alanı YYYY-MM-DD olarak okur (daysLeft); tam zaman damgası
        -- yazılırsa süre hesabı bozulurdu — aynı biçim burada da geçerli.
        new."vipExpiresAt" := to_char(
          now() + make_interval(days => v_policy."defaultTrialDays"), 'YYYY-MM-DD');
      end if;
      if new."testsCompleted" <> 0 or new."questionsSolved" <> 0 or new."netSum" <> 0 then
        raise exception 'counters start at zero' using errcode = '42501';
      end if;
      if kpss_session_email() <> '' and new."email"::text <> kpss_session_email() then
        raise exception 'email must match the session' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if kpss_is_admin() then
    return new;
  end if;
  -- Kendi satırını güncelleyen üye: hak/rol/kişilik alanları dokunulamaz.
  if new."email" is distinct from old."email"
     or new."createdAt" is distinct from old."createdAt"
     or new."id" is distinct from old."id" then
    raise exception 'id, email and createdAt are not writable' using errcode = '42501';
  end if;
  if new."role" is distinct from old."role"
     or new."status" is distinct from old."status"
     or new."vip" is distinct from old."vip"
     or new."vipPlan" is distinct from old."vipPlan"
     or new."vipExpiresAt" is distinct from old."vipExpiresAt" then
    raise exception 'role/status/vip are admin-only' using errcode = '42501';
  end if;
  if new."testsCompleted" < old."testsCompleted"
     or new."questionsSolved" < old."questionsSolved" then
    raise exception 'counters never decrease' using errcode = '42501';
  end if;
  -- Parola malzemesi (pbkdf2 kalıntısı) kendi satırından yazılamaz: doğrulama
  -- Supabase Auth’dan yapılır; alanı yalnız yönetici/tohumlama doldurur.
  if new."verifier" is distinct from old."verifier"
     or new."salt" is distinct from old."salt"
     or new."iterations" is distinct from old."iterations" then
    raise exception 'password material is written only by an admin' using errcode = '42501';
  end if;
  if old."status" = 'pending' and new."status" = 'active' then
    raise exception 'approval is admin-only' using errcode = '42501';
  end if;
  if not kpss_signed_in() and kpss_membership_locked() then
    raise exception 'membership lockdown is on' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- No anonymous or cross-account membership creation; initial admins must be
-- provisioned with privileged SQL, not by an unauthenticated client.
drop policy if exists members_self_insert on public.members;
create policy members_self_insert on public.members for insert
  with check (kpss_is_admin() or (kpss_signed_in() and "email"::text = kpss_session_email() and not kpss_membership_locked() and "role" = 'user'));
drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins for insert with check (kpss_is_admin());

-- Provision a pending member at the source of truth, independent of the
-- browser, device, redirect URL or email client that confirms the address.
-- Only Auth row changes can invoke this trigger, not client RPC calls.
create or replace function public.kpss_auth_confirmed_member()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.email_confirmed_at is null or new.email is null or trim(new.email) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;
  insert into public.members ("email", "emailNormalized", "displayName", "city", "exam", "authUid", "algo", "role", "status")
  values (lower(trim(new.email)), lower(trim(new.email)),
          left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80),
          left(coalesce(new.raw_user_meta_data ->> 'city', ''), 60),
          left(coalesce(new.raw_user_meta_data ->> 'exam', ''), 40),
          new.id::text, 'supabase-auth', 'user', 'pending')
  on conflict ("email") do nothing;
  return new;
end;
$$;
revoke all on function public.kpss_auth_confirmed_member() from public, anon, authenticated;

drop trigger if exists kpss_auth_confirmed_member on auth.users;
create trigger kpss_auth_confirmed_member
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.kpss_auth_confirmed_member();

-- Pending or suspended users cannot use member data even with an Auth token.
create or replace function public.kpss_member_is_active()
returns boolean language sql stable security invoker
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.members m
                 where m."email"::text = public.kpss_session_email()
                   and m."status" = 'active');
$$;

drop policy if exists user_tests_self on public.user_tests;
create policy user_tests_self on public.user_tests for all
  using (
    kpss_is_admin() or (public.kpss_member_is_active() and (
      "memberEmail"::text = kpss_session_email()
      or (auth.uid() is not null and "userId" = auth.uid())
    ))
  )
  with check (
    (kpss_is_admin() or public.kpss_member_is_active()) and (
      "memberEmail"::text = kpss_session_email()
      or (auth.uid() is not null and "userId" = auth.uid())
    )
  );

drop policy if exists user_data_self on public.user_data;
create policy user_data_self on public.user_data for all
  using ((kpss_is_admin() or public.kpss_member_is_active()) and auth.uid() is not null and "userId" = auth.uid())
  with check ((kpss_is_admin() or public.kpss_member_is_active()) and auth.uid() is not null and "userId" = auth.uid());

