-- =============================================================================
-- KPSS Asistanı — Supabase (Postgres): şema, kısıtlar, yetki kuralları (RLS)
-- =============================================================================
-- Uygulamanın TEK veri sözleşmesi. Firebase (Firestore + REST kuralları) bırakıldı;
-- yetki denetimi artık burada: RLS politikaları + yazma bekçileri (trigger) +
-- CHECK kısıtları + alan-seti denetimi. `firestore.rules` diye bir şey yok.
--
-- Yayına alma (geliştirici işi — depoda CI yok, git push SQL uygulamaz):
--   A) Supabase Dashboard → SQL Editor → bu dosyanın TAM metnini yapıştır → Run
--   B) npm run db:push        (supabase CLI; token yalnız senin terminalinde)
-- Panelde “SQL'i kopyala” düğmesi bu dosyayı panoya alır (config/supabaseSqlCopy.ts,
-- güncellemek için: npm run sync:sql).
--
-- Katmanlar — “her ders ayrı, her konu ayrı, her test ayrı, her soru ayrı”:
--   courses ─▶ topics ─▶ questions            (içerik; HER SORU BİR SATIR)
--   user_tests                                (çözülen her test = bir satır)
--   members + membership_policy + admins + locks   (üyelik)
--   user_data                                 (uygulamadaki diğer her şey)
--
-- Alan adları bilerek camelCase: belge biçimiyle (lib/membership.ts,
-- lib/contentDoc.ts) birebir aynı, böylece “kolon ↔ alan” çevirisi yok — tek
-- kaynağın adı neyse tabloda da o. Cihazda kopya tutulmaz; yerel anahtarlar
-- yalnız okuma önbelleğidir.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

/* ============================================================ oturum yardımcıları */

create or replace function kpss_signed_in()
returns boolean
language sql
stable
as $$
  select coalesce(auth.uid() is not null, false);
$$;

/** Oturum e-postası (normalize). JWT claim'i yoksa boş metin. */
create or replace function kpss_session_email()
returns text
language sql
stable
as $$
  select coalesce(
    lower(nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '')),
    ''
  );
$$;

/** Yönetici: public.admins'ta e-posta/user_id kaydı ya da JWT'de app_admin claim'i. */
create or replace function kpss_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'app_admin') = 'true'
    or (
      (
        kpss_session_email() <> ''
        and exists (select 1 from public.admins a where a.email::text = kpss_session_email())
      )
      or (
        auth.uid() is not null
        and exists (select 1 from public.admins a where a."userId" = auth.uid())
      )
    ),
    false
  );
$$;

/**
 * Üyelik kilidi = panelin “kayıtlar dursun” anahtarı (eski meta/membership_lockdown
 * BELGESİNİN yeri). Artık var-yok hilesi değil, politika satırında bir alan.
 */
create or replace function kpss_membership_locked()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select p."membershipLockdown" from public.membership_policy p where p.id = 1 limit 1),
    false
  );
$$;

/** İçerik kilidi (eski meta/content_lock): açıkken hiçbir istemci içerik yazamaz. */
create or replace function kpss_content_locked()
returns boolean
language sql
stable
as $$
  select coalesce(
    (select p."contentLock" from public.membership_policy p where p.id = 1 limit 1),
    false
  );
$$;

/** jsonb nesnesinin anahtar sayısı (CHECK içinde alt sorgu kullanılamaz). */
create or replace function kpss_jsonb_key_count(j jsonb)
returns int
language sql
immutable
as $$
  select case
    when j is null or jsonb_typeof(j) <> 'object' then 0
    else (select count(*) from jsonb_object_keys(j))
  end;
$$;

/** courseUsage haritası: her değer tam sayı ve 0..999. */
create or replace function kpss_jsonb_counters_ok(j jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when j is null or jsonb_typeof(j) <> 'object' then false
    else not exists (
      select 1 from jsonb_each_text(j) e
      where e.value !~ '^-?[0-9]+$' or (e.value)::int < 0 or (e.value)::int > 999
    )
  end;
$$;

/**
 * Eski `contentWriteOk` / `memberShapeOk` / `membershipPolicyOk` kurallarının yeri:
 * istemci YALNIZ buradaki alanları yazabilir. `*` ile biten liste “sadece bunlar”.
 */
create or replace function kpss_doc_keys_ok(p_kind text, p_doc jsonb)
returns boolean
language sql
stable
as $$
  select case p_kind
    when 'member' then
      -- create: zorunlu alanlar da burada (memberShapeOk'un aynası)
      not exists (
        select 1 from jsonb_object_keys(p_doc) k
        where k not in ('id','email','emailNormalized','displayName','verifier','salt','iterations',
                        'algo','authUid','role','status','vip','vipPlan','vipExpiresAt','createdAt',
                        'lastLoginAt','city','exam','note','testsCompleted','questionsSolved','netSum',
                        'courseUsage','schemaVersion')
      )
      and p_doc ?& array['email','status','role']
    when 'memberPatch' then
      not exists (
        select 1 from jsonb_object_keys(p_doc) k
        where k not in ('emailNormalized','displayName','verifier','salt','iterations','algo','authUid',
                        'role','status','vip','vipPlan','vipExpiresAt','lastLoginAt','city','exam','note',
                        'testsCompleted','questionsSolved','netSum','courseUsage','schemaVersion')
      )
      -- kimlik/createdAt/algoritmaya PATCH ile dokunulamaz
      and not (p_doc ?| array['id','email','createdAt'])
    when 'policy' then
      not exists (
        select 1 from jsonb_object_keys(p_doc) k
        where k not in ('enforce','freeTestsPerCourse','cloudVip','cloudMembers','defaultTrialDays',
                        'requireApproval','registrationOpen','updatedAt','schemaVersion')
      )
      and jsonb_typeof(p_doc -> 'requireApproval') = 'boolean'
      and jsonb_typeof(p_doc -> 'registrationOpen') = 'boolean'
      and jsonb_typeof(p_doc -> 'freeTestsPerCourse') in ('number','string')
    when 'topic' then
      not exists (
        select 1 from jsonb_object_keys(p_doc) k
        where k not in ('id','name','courseId','order','questionCount','questions','updatedAt','schemaVersion')
      )
      and (not (p_doc ? 'questions') or jsonb_typeof(p_doc -> 'questions') = 'array')
      and (not (p_doc ? 'questionCount') or jsonb_typeof(p_doc -> 'questionCount') = 'number')
    when 'course' then
      not exists (
        select 1 from jsonb_object_keys(p_doc) k
        where k not in ('id','title','icon','order','hidden','updatedAt','schemaVersion')
      )
    when 'tips' then
      not exists (select 1 from jsonb_object_keys(p_doc) k where k not in ('list','updatedAt','schemaVersion'))
      and jsonb_typeof(p_doc -> 'list') = 'array'
    when 'admins' then
      not exists (select 1 from jsonb_object_keys(p_doc) k where k not in ('emails','updatedAt','schemaVersion'))
      and jsonb_typeof(p_doc -> 'emails') = 'array'
    else true
  end;
$$;

/* ============================================================== üyelik politikası */

/**
 * Panelin üyelik ayarları — cihazda değil, burada. require_approval varsayılan
 * AÇIK: admin onayı olmadan üyelik aktif olmaz (hangi cihazdan kayıt olursa olsun).
 */
create table if not exists public.membership_policy (
  id                   int primary key default 1 check (id = 1),
  "requireApproval"    boolean not null default true,
  "registrationOpen"   boolean not null default true,
  "enforce"            boolean not null default false,
  "freeTestsPerCourse" int     not null default 1 check ("freeTestsPerCourse" between 0 and 100),
  "defaultTrialDays"   int     not null default 7   check ("defaultTrialDays" between 0 and 3650),
  "cloudVip"           boolean not null default false,
  "cloudMembers"       boolean not null default false,
  "membershipLockdown" boolean not null default false,
  "contentLock"        boolean not null default false,
  "schemaVersion"      int     not null default 1 check ("schemaVersion" = 1),
  "updatedAt"          text    not null default to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

insert into public.membership_policy (id) values (1) on conflict (id) do nothing;

/** Yönetici listesi (eski meta/admins belgesi): satır = bir e-posta. */
create table if not exists public.admins (
  email    citext primary key check (position('@' in email::text) > 1),
  "userId" uuid,
  "addedAt" timestamptz not null default now(),
  "addedBy" text
);
create unique index if not exists admins_userid_key on public.admins ("userId") where "userId" is not null;

/* ========================================================================= üyeler */

/**
 * Üyelik belgesinin tek kaynağı. Kimlik = e-posta (küçük harf); tıpkı eski
 * memberships/{e-posta} belge kimliği gibi. Parola burada DEĞİL — Supabase Auth'ta.
 * verifier/salt/iterations yalnız Supabase Auth öncesi cihaz hesaplarının
 * okunabilmesi için durur; yeni kayıtlarda boştur.
 */
create table if not exists public.members (
  "id"               text not null default '',
  "email"            citext not null primary key,
  "emailNormalized"  text not null default '',
  "displayName"      text not null default '' check (char_length("displayName") <= 80),
  "city"             text not null default '' check (char_length("city") <= 60),
  "exam"             text not null default '' check (char_length("exam") <= 40),
  "note"             text not null default '' check (char_length("note") <= 500),
  "verifier"         text not null default '',
  "salt"             text not null default '',
  "iterations"       int  not null default 0 check ("iterations" between 0 and 2000000),
  "algo"             text not null default 'pbkdf2-sha256',
  "authUid"          text,
  "role"             text not null default 'user' check ("role" in ('user','editor','admin','owner')),
  "status"           text not null default 'pending' check ("status" in ('pending','active','suspended','banned')),
  "vip"              boolean not null default false,
  "vipPlan"          text not null default 'free' check ("vipPlan" in ('free','monthly','yearly','lifetime')),
  "vipExpiresAt"     text not null default '',
  "createdAt"        text not null default to_char(current_date, 'YYYY-MM-DD'),
  "lastLoginAt"      text not null default '',
  "testsCompleted"   int not null default 0 check ("testsCompleted" between 0 and 1000000),
  "questionsSolved"  int not null default 0 check ("questionsSolved" between 0 and 100000000),
  "netSum"           numeric(10,1) not null default 0 check ("netSum" between -100000 and 100000000),
  "courseUsage"      jsonb not null default '{}'::jsonb,
  "schemaVersion"    int not null default 1 check ("schemaVersion" = 1),
  "updatedAt"        timestamptz not null default now(),
  constraint members_id_is_email check ("id" = "email"::text),
  constraint members_usage_object check (jsonb_typeof("courseUsage") = 'object'),
  constraint members_usage_keys check (kpss_jsonb_key_count("courseUsage") <= 12),
  constraint members_usage_values check (kpss_jsonb_counters_ok("courseUsage")),
  constraint members_email_lower check ("email"::text = lower("email"::text))
);
create index if not exists members_authuid_idx on public.members (("authUid"));
create index if not exists members_status_idx on public.members ("status");

/* ======================================================================= içerik */

create table if not exists public.courses (
  "id"            text primary key,
  "title"         text not null,
  "icon"          text not null default 'book-outline',
  "order"         int not null default 0,
  "hidden"        boolean not null default false,
  "updatedAt"     text not null default '',
  "schemaVersion" int not null default 1 check ("schemaVersion" = 1)
);

create table if not exists public.topics (
  "courseId"      text not null references public.courses("id") on delete cascade,
  "docId"         text not null,
  "id"            text not null default '',
  "name"          text not null,
  "order"         int not null default 0,
  "questionCount" int not null default 0 check ("questionCount" >= 0),
  "updatedAt"     text not null default '',
  "schemaVersion" int not null default 1 check ("schemaVersion" = 1),
  primary key ("courseId", "docId")
);
create index if not exists topics_course_order_idx on public.topics ("courseId", "order");

/** HER SORU AYRI SATIR. `ord` belge sırasıdır; `num` yok — sıra satırın kendisidir. */
create table if not exists public.questions (
  "id"          text primary key,
  "docId"       text not null,
  "courseId"    text not null,
  "ord"         int not null default 0 check ("ord" >= 0),
  "question"    text not null,
  "options"     jsonb not null check (jsonb_typeof("options") = 'array'),
  "answer"      int not null default 0 check ("answer" >= 0),
  "explanation" text not null default '',
  constraint questions_options_count check (jsonb_array_length("options") between 2 and 8),
  constraint questions_answer_range check ("answer" < jsonb_array_length("options"))
);
create index if not exists questions_doc_idx on public.questions ("docId", "ord");
create index if not exists questions_course_idx on public.questions ("courseId");

/** Çözülen her test ayrı satır (eski @kpss_results_v2 artık bulutta). */
create table if not exists public.user_tests (
  "key"         text primary key,
  "memberEmail" citext not null,
  "userId"      uuid,
  "courseId"    text not null,
  "topicDocId"  text,
  "title"       text not null default '',
  "correct"     int not null default 0 check ("correct" >= 0),
  "wrong"       int not null default 0 check ("wrong" >= 0),
  "blank"       int not null default 0 check ("blank" >= 0),
  "total"       int not null default 0 check ("total" >= 0),
  "net"         numeric(6,2) not null default 0,
  "durationSec" int not null default 0 check ("durationSec" >= 0),
  "completedAt" timestamptz not null default now()
);
create index if not exists user_tests_member_idx on public.user_tests ("memberEmail", "completedAt" desc);

/** Hap bilgiler (eski daily_tips/main belgesinin `list` dizisi). */
create table if not exists public.tips (
  "ord"  int not null primary key check ("ord" >= 0),
  "body" text not null check (char_length("body") between 1 and 600)
);

/** Uygulamadaki diğer her şey: seri, favoriler, yanlış defteri, ayarlar... */
create table if not exists public.user_data (
  "userId"    uuid not null,
  "kind"      text not null check ("kind" in (
      'favorites','mistakes','studiedTopics','streak','dailyStats','focusTotal',
      'learnedTips','savedTips','settings','theme'
    )),
  "payload"   jsonb not null,
  "updatedAt" timestamptz not null default now(),
  primary key ("userId", "kind")
);

/* ============================================================== alan seti bekçisi */

/* ==================================================== üye satırı yazma bekçileri */

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
      if coalesce(v_policy."requireApproval", true) is true and new."status" <> 'pending' then
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
  if coalesce(v_policy."requireApproval", true) is true
     and old."status" = 'pending' and new."status" = 'active' then
    raise exception 'approval is admin-only' using errcode = '42501';
  end if;
  if not kpss_signed_in() and kpss_membership_locked() then
    raise exception 'membership lockdown is on' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists members_write_guard on public.members;
create trigger members_write_guard
  before insert or update on public.members
  for each row execute function kpss_guard_member_write();

/** id = e-posta kuralını tetikleyici de zorlar (istemci `id` göndermese bile). */
create or replace function kpss_member_fill_id()
returns trigger
language plpgsql
as $$
begin
  new."id" := new."email"::text;
  if new."emailNormalized" = '' then
    new."emailNormalized" := new."email"::text;
  end if;
  new."updatedAt" := now();
  return new;
end;
$$;

drop trigger if exists members_fill_id on public.members;
create trigger members_fill_id
  before insert or update on public.members
  for each row execute function kpss_member_fill_id();

/* ==================================================== içerik yazma bekçileri */

create or replace function kpss_guard_content_write()
returns trigger
language plpgsql
as $$
begin
  if kpss_content_locked() then
    raise exception 'content is locked (membership_policy.contentLock)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['courses','topics','tips']
  loop
    execute format(
      'drop trigger if exists %I_write_guard on public.%I;
       create trigger %I_write_guard before insert or update or delete on public.%I
       for each row execute function kpss_guard_content_write();', t, t, t, t);
  end loop;
end $$;

/** Soru satırları yalnız konu satırıyla tanımlı ders/belge altına yazılabilir. */
create or replace function kpss_guard_question_write()
returns trigger
language plpgsql
as $$
declare v_course text; v_doc text;
begin
  if kpss_content_locked() then
    raise exception 'content is locked (membership_policy.contentLock)'
      using errcode = '42501';
  end if;
  select t."courseId", t."docId" into v_course, v_doc
    from public.topics t where t."docId" = new."docId";
  if v_course is null then
    raise exception 'question without a topic' using errcode = '23503';
  end if;
  new."courseId" := v_course;
  return new;
end;
$$;

drop trigger if exists questions_write_guard on public.questions;
create trigger questions_write_guard
  before insert or update on public.questions
  for each row execute function kpss_guard_question_write();

/* ============================================ belge alanı okuma yardımcıları */

/**
 * JSON alanından boolean. Katı `::boolean` cast'i panelden/yedekten gelen
 * `"1"`, `"on"`, `0`, `true` (metin) gibi değerlerde "invalid input syntax"
 * ile TÜM yazmayı patlatıyordu; burada tanınan her biçim çevrilir, bilinmeyen
 * değer fallback'e düşer (yani mevcut kolon değeri korunur).
 */
create or replace function kpss_as_bool(p_val jsonb, p_fallback boolean default null)
returns boolean
language sql
immutable
as $$
  select case
    when p_val is null or jsonb_typeof(p_val) = 'null' then p_fallback
    when jsonb_typeof(p_val) = 'boolean' then (p_val #>> '{}')::boolean
    when jsonb_typeof(p_val) = 'number'  then (p_val #>> '{}')::numeric <> 0
    when jsonb_typeof(p_val) = 'string' then case
      when lower(btrim(p_val #>> '{}')) in
        ('true','1','yes','y','on','open','aktif','acik','açık','evet') then true
      when lower(btrim(p_val #>> '{}')) in
        ('false','0','no','n','off','closed','kapali','kapalı','hayir','hayır') then false
      else p_fallback
    end
    else p_fallback
  end;
$$;

/** JSON alanından int: ondalık gelirse kesilir, boş/uyumsuz metin fallback. */
create or replace function kpss_as_int(p_val jsonb, p_fallback int default null)
returns int
language sql
immutable
as $$
  select case
    when p_val is null or jsonb_typeof(p_val) = 'null' then p_fallback
    when jsonb_typeof(p_val) = 'number'  then trunc((p_val #>> '{}')::numeric)::int
    when jsonb_typeof(p_val) = 'boolean' then case when (p_val #>> '{}')::boolean then 1 else 0 end
    when jsonb_typeof(p_val) = 'string'
         and btrim(p_val #>> '{}') ~ '^-?[0-9]+([.][0-9]+)?$'
      then trunc(btrim(p_val #>> '{}')::numeric)::int
    else p_fallback
  end;
$$;

/** JSON alanından numeric (net gibi ondalık değerler için). */
create or replace function kpss_as_num(p_val jsonb, p_fallback numeric default 0)
returns numeric
language sql
immutable
as $$
  select case
    when p_val is null or jsonb_typeof(p_val) = 'null' then p_fallback
    when jsonb_typeof(p_val) = 'number' then (p_val #>> '{}')::numeric
    when jsonb_typeof(p_val) = 'string'
         and btrim(p_val #>> '{}') ~ '^-?[0-9]+([.][0-9]+)?$'
      then btrim(p_val #>> '{}')::numeric
    else p_fallback
  end;
$$;

/* ============================================== belge geçidi (doc gateway) */

/**
 * Uygulamanın konuştuğu tek kapı. Yollar eskisiyle aynı:
 *   memberships/{e-posta} · courses/{c} · courses/{c}/topics/{t}
 *   courses/{c}/topics (liste) · daily_tips/main · meta/membership_policy
 *   meta/admins · meta/membership_lockdown · meta/content_lock
 * Geri dönen şey {status, body} zarfıdır; yetki redleri RLS/bekçi tarafından
 * 42501 ile FIRLATILIR (istemci bunu “kural reddetti” olarak sınıflandırır).
 */
create or replace function kpss_doc_kind(p_path text)
returns text
language sql
immutable
as $$
  select case
    when p_path ~ '^memberships/[^/]+$'                  then 'member'
    when p_path ~ '^courses/[^/]+$'                      then 'course'
    when p_path ~ '^courses/[^/]+/topics/[^/]+$'         then 'topic'
    when p_path = 'daily_tips/main'                      then 'tips'
    when p_path = 'meta/membership_policy'                then 'policy'
    when p_path = 'meta/admins'                          then 'admins'
    when p_path = 'meta/membership_lockdown'             then 'lockMembership'
    when p_path = 'meta/content_lock'                    then 'lockContent'
    else null
  end;
$$;

create or replace function kpss_doc_name(p_path text)
returns text
language sql
immutable
as $$
  -- son segment (topics/liste yollarında liste yolu döner)
  select case
    when p_path = 'courses' or p_path ~ '^courses/[^/]+/topics$' then '*'
    else split_part(p_path, '/', array_length(string_to_array(p_path, '/'), 1))
  end;
$$;

create or replace function kpss_doc_parent(p_path text)
returns text
language sql
immutable
as $$
  select case
    when p_path like '%/%' then left(p_path, length(p_path) - length(split_part(p_path, '/', array_length(string_to_array(p_path, '/'), 1))) - 1)
    else ''
  end;
$$;

create or replace function kpss_read_doc(p_path text)
returns jsonb
language plpgsql
stable
security invoker
as $$
declare v_kind text := kpss_doc_kind(p_path); v_name text; v_doc jsonb;
begin
  if v_kind is null then
    return jsonb_build_object('status', 400, 'error', 'unknown document path');
  end if;
  v_name := kpss_doc_name(p_path);

  if v_kind = 'member' then
    select to_jsonb(m) into v_doc from public.members m where m."email"::text = lower(v_name);
  elsif v_kind = 'course' then
    select to_jsonb(c) into v_doc from public.courses c where c."id" = v_name;
  elsif v_kind = 'topic' then
    select jsonb_build_object(
      'id', t."id", 'name', t."name", 'courseId', t."courseId", 'order', t."order",
      'questionCount', t."questionCount", 'updatedAt', t."updatedAt", 'schemaVersion', 1,
      'questions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', q."id", 'question', q."question", 'options', q."options",
          'answer', q."answer", 'explanation', q."explanation"
        ) order by q."ord")
        from public.questions q where q."docId" = t."docId"
      ), '[]'::jsonb)
    ) into v_doc
    from public.topics t
    where t."courseId" = split_part(kpss_doc_parent(p_path), '/', 2)
      and t."docId" = v_name;
  elsif v_kind = 'tips' then
    select jsonb_build_object(
      'list', coalesce((select jsonb_agg(jsonb_build_array("body") -> 0) from (
                 select "body" from public.tips order by "ord") x), '[]'::jsonb),
      'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'schemaVersion', 1
    ) into v_doc;
    if not exists (select 1 from public.tips) then
      return jsonb_build_object('status', 404, 'error', 'NOT_FOUND');
    end if;
  elsif v_kind = 'policy' then
    select jsonb_build_object(
      'enforce', p."enforce", 'freeTestsPerCourse', p."freeTestsPerCourse",
      'cloudVip', p."cloudVip", 'cloudMembers', p."cloudMembers",
      'defaultTrialDays', p."defaultTrialDays", 'requireApproval', p."requireApproval",
      'registrationOpen', p."registrationOpen", 'updatedAt', p."updatedAt",
      'schemaVersion', 1
    ) into v_doc from public.membership_policy p where p.id = 1;
  elsif v_kind = 'admins' then
    select jsonb_build_object(
      'emails', coalesce((select jsonb_agg(a.email::text order by a.email) from public.admins a), '[]'::jsonb),
      'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'schemaVersion', 1
    ) into v_doc;
  elsif v_kind = 'lockMembership' then
    return case when kpss_membership_locked()
      then jsonb_build_object('status', 200, 'found', true)
      else jsonb_build_object('status', 404, 'error', 'NOT_FOUND') end;
  elsif v_kind = 'lockContent' then
    return case when kpss_content_locked()
      then jsonb_build_object('status', 200, 'found', true)
      else jsonb_build_object('status', 404, 'error', 'NOT_FOUND') end;
  end if;

  if v_doc is null then
    return jsonb_build_object('status', 404, 'error', 'NOT_FOUND');
  end if;
  return jsonb_build_object('status', 200, 'name', p_path, 'fields', v_doc);
end;
$$;

/** Belge yazımı: replace = tam belge, merge = kısmi güncelleme (eski PATCH). */
create or replace function kpss_write_doc(p_path text, p_doc jsonb, p_mode text default 'replace')
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_kind text := kpss_doc_kind(p_path);
  v_name text := kpss_doc_name(p_path);
  v_parent text := kpss_doc_parent(p_path);
  v_doc jsonb;
  v_q jsonb;
  v_ord int;
  v_topic text;
  v_sets text;
  v_cols text;
begin
  if v_kind is null then
    return jsonb_build_object('status', 400, 'error', 'unknown document path');
  end if;
  if jsonb_typeof(p_doc) <> 'object' then
    return jsonb_build_object('status', 400, 'error', 'document body must be an object');
  end if;

  -- Alan seti denetimi (eski *Ok kurallarının yaptığı iş).
  if v_kind = 'member' and p_mode = 'replace' and not kpss_doc_keys_ok('member', p_doc) then
    raise exception 'member document has unknown or missing fields' using errcode = '42501';
  end if;
  if v_kind = 'member' and p_mode = 'merge' and not kpss_doc_keys_ok('memberPatch', p_doc) then
    raise exception 'member patch has fields that are not writable' using errcode = '42501';
  end if;
  if v_kind = 'policy'  and not kpss_doc_keys_ok('policy', p_doc) then
    raise exception 'policy document has unknown fields' using errcode = '42501';
  end if;
  if v_kind = 'topic'   and not kpss_doc_keys_ok('topic', p_doc) then
    raise exception 'content document has unknown fields' using errcode = '42501';
  end if;
  if v_kind = 'course'  and not kpss_doc_keys_ok('course', p_doc) then
    raise exception 'content document has unknown fields' using errcode = '42501';
  end if;
  if v_kind = 'tips'    and not kpss_doc_keys_ok('tips', p_doc) then
    raise exception 'tips document has unknown fields' using errcode = '42501';
  end if;
  if v_kind = 'admins'    and not kpss_doc_keys_ok('admins', p_doc) then
    raise exception 'admins document has unknown fields' using errcode = '42501';
  end if;

  ---------------------------------------------------------------- memberships
  if v_kind = 'member' then
    if p_mode = 'merge' then
      select coalesce(to_jsonb(m), '{}'::jsonb) || p_doc into v_doc
        from public.members m where m."email"::text = lower(v_name);
      -- belge hiç yoksa PATCH bir create sayılır; e-posta yine yoldan gelir
      v_doc := coalesce(v_doc, '{}'::jsonb) || jsonb_build_object('email', lower(v_name));
    else
      v_doc := p_doc || jsonb_build_object('email', lower(v_name));
    end if;
    if v_doc ->> 'schemaVersion' is null then
      v_doc := v_doc || jsonb_build_object('schemaVersion', 1);
    end if;
    if coalesce(v_doc ->> 'email', '') = '' then
      return jsonb_build_object('status', 400, 'error', 'email required');
    end if;

    /* KOLON LİSTESİ = kataloğun BELGEDE OLAN alanları.
     * Eskiden `select x.*` ile tüm kolonlar yazılıyor, belgede bulunmayan
     * alanlar NULL sayılıyor ve tablo DEFAULT'u hiç devreye girmiyordu —
     * yani eksik alanlı bir create "null value in column violates not-null
     * constraint" ile patlıyordu. `id` de listede değil: bekçi
     * (kpss_member_fill_id) onu e-postadan doldurur, `email` ise PK olduğu
     * için DO UPDATE kümesine giremez. */
    select string_agg(format('%I', a.attname), ', ' order by a.attnum),
           string_agg(case when a.attname = 'email' then null
                          else format('%I = excluded.%I', a.attname) end, ', ' order by a.attnum)
      into v_cols, v_sets
      from pg_attribute a
     where a.attrelid = 'public.members'::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname <> 'id'
       and (v_doc ? a.attname or a.attname = 'email');
    if v_cols is null or v_sets is null then
      return jsonb_build_object('status', 400, 'error', 'nothing writable in document');
    end if;
    execute 'insert into public.members (' || v_cols || ') select ' || v_cols
         || ' from jsonb_populate_record(null::public.members, $1) x'
         || ' on conflict ("email") do update set ' || v_sets
      using v_doc;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  ---------------------------------------------------------------- courses
  if v_kind = 'course' then
    insert into public.courses ("id","title","icon","order","hidden","updatedAt","schemaVersion")
    values (
      v_name,
      coalesce(p_doc ->> 'title', v_name),
      coalesce(p_doc ->> 'icon', 'book-outline'),
      coalesce(kpss_as_int(p_doc -> 'order'), 0),
      coalesce(kpss_as_bool(p_doc -> 'hidden'), false),
      coalesce(p_doc ->> 'updatedAt', ''),
      1
    )
    on conflict ("id") do update
      set "title" = coalesce(nullif(p_doc ->> 'title',''), courses."title"),
          "icon" = coalesce(nullif(p_doc ->> 'icon',''), courses."icon"),
          "order" = coalesce(kpss_as_int(p_doc -> 'order', courses."order"), courses."order"),
          "hidden" = coalesce(kpss_as_bool(p_doc -> 'hidden', courses."hidden"), courses."hidden"),
          "updatedAt" = coalesce(nullif(p_doc ->> 'updatedAt',''), courses."updatedAt");
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  ---------------------------------------------------------------- topics + soruları
  if v_kind = 'topic' then
    v_topic := v_name;
    insert into public.topics ("courseId","docId","id","name","order","questionCount","updatedAt","schemaVersion")
    values (
      split_part(v_parent, '/', 2), v_topic,
      coalesce(p_doc ->> 'id', v_topic),
      coalesce(nullif(p_doc ->> 'name',''), v_topic),
      coalesce(kpss_as_int(p_doc -> 'order'), 0),
      0, coalesce(p_doc ->> 'updatedAt', ''), 1
    )
    on conflict ("courseId","docId") do update
      set "name" = excluded."name",
          "order" = excluded."order",
          "updatedAt" = excluded."updatedAt",
          "id" = excluded."id";

    -- questions alanı YOKSA sorulara dokunulmaz (konu başlığı/sırası güncellemesi).
    if p_doc ? 'questions' then
      delete from public.questions where "docId" = v_topic;
      v_ord := 0;
      for v_q in select * from jsonb_array_elements(p_doc -> 'questions') loop
        insert into public.questions ("id","docId","courseId","ord","question","options","answer","explanation")
        values (
          coalesce(v_q ->> 'id', v_topic || '::' || v_ord::text),
          v_topic,
          split_part(v_parent, '/', 2),
          v_ord,
          coalesce(v_q ->> 'question', ''),
          coalesce(case when jsonb_typeof(v_q -> 'options') = 'array' then v_q -> 'options' end, '[]'::jsonb),
          coalesce(kpss_as_int(v_q -> 'answer'), 0),
          coalesce(v_q ->> 'explanation', '')
        );
        v_ord := v_ord + 1;
      end loop;
      update public.topics set "questionCount" = v_ord where "docId" = v_topic;
    end if;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  ---------------------------------------------------------------- tips
  if v_kind = 'tips' then
    delete from public.tips;
    v_ord := 0;
    for v_q in select * from jsonb_array_elements_text(p_doc -> 'list') loop
      insert into public.tips ("ord","body") values (v_ord, v_q);
      v_ord := v_ord + 1;
    end loop;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  ---------------------------------------------------------------- admins
  if v_kind = 'admins' then
    if not kpss_is_admin() then
      raise exception 'only an admin may rewrite the admin list' using errcode = '42501';
    end if;
    delete from public.admins;
    insert into public.admins (email)
      select distinct lower(trim(x.e)) from jsonb_array_elements_text(p_doc -> 'emails') x(e)
      where position('@' in x.e) > 1;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  ---------------------------------------------------------------- politika
  if v_kind = 'policy' then
    if not kpss_is_admin() and not kpss_signed_in() then
      raise exception 'only an admin may change the membership policy' using errcode = '42501';
    end if;
    update public.membership_policy set
      "enforce"            = coalesce(kpss_as_bool(p_doc -> 'enforce', "enforce"), "enforce"),
      "freeTestsPerCourse" = coalesce(kpss_as_int(p_doc -> 'freeTestsPerCourse', "freeTestsPerCourse"), "freeTestsPerCourse"),
      "cloudVip"           = coalesce(kpss_as_bool(p_doc -> 'cloudVip', "cloudVip"), "cloudVip"),
      "cloudMembers"       = coalesce(kpss_as_bool(p_doc -> 'cloudMembers', "cloudMembers"), "cloudMembers"),
      "defaultTrialDays"   = coalesce(kpss_as_int(p_doc -> 'defaultTrialDays', "defaultTrialDays"), "defaultTrialDays"),
      "requireApproval"     = coalesce(kpss_as_bool(p_doc -> 'requireApproval', "requireApproval"), "requireApproval"),
      "registrationOpen"    = coalesce(kpss_as_bool(p_doc -> 'registrationOpen', "registrationOpen"), "registrationOpen"),
      "updatedAt"           = coalesce(nullif(p_doc ->> 'updatedAt',''), "updatedAt"),
      "schemaVersion"       = 1
    where id = 1;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  ---------------------------------------------------------------- kilitler
  if v_kind = 'lockMembership' then
    if not kpss_is_admin() then
      raise exception 'only an admin may toggle the membership lockdown' using errcode = '42501';
    end if;
    update public.membership_policy set "membershipLockdown" = true where id = 1;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;
  if v_kind = 'lockContent' then
    if not kpss_is_admin() then
      raise exception 'only an admin may toggle the content lock' using errcode = '42501';
    end if;
    update public.membership_policy set "contentLock" = true where id = 1;
    return jsonb_build_object('status', 200, 'name', p_path);
  end if;

  return jsonb_build_object('status', 400, 'error', 'unhandled document kind');
end;
$$;

/** Belge silme (kilit belgeleri = bayrağı kapat; konu = soruları cascade siler). */
create or replace function kpss_delete_doc(p_path text)
returns jsonb
language plpgsql
security invoker
as $$
declare v_kind text := kpss_doc_kind(p_path); v_name text := kpss_doc_name(p_path);
begin
  if v_kind is null then
    return jsonb_build_object('status', 400, 'error', 'unknown document path');
  end if;
  if v_kind = 'member' then
    if not kpss_is_admin() then
      raise exception 'only an admin may delete a membership' using errcode = '42501';
    end if;
    delete from public.members where "email"::text = lower(v_name);
  elsif v_kind = 'topic' then
    delete from public.topics
      where "docId" = v_name and "courseId" = split_part(kpss_doc_parent(p_path), '/', 2);
  elsif v_kind = 'course' then
    delete from public.courses where "id" = v_name;
  elsif v_kind = 'tips' then
    delete from public.tips;
  elsif v_kind = 'lockMembership' then
    if not kpss_is_admin() then
      raise exception 'only an admin may unlock signups' using errcode = '42501';
    end if;
    update public.membership_policy set "membershipLockdown" = false where id = 1;
  elsif v_kind = 'lockContent' then
    if not kpss_is_admin() then
      raise exception 'only an admin may unlock content' using errcode = '42501';
    end if;
    update public.membership_policy set "contentLock" = false where id = 1;
  else
    return jsonb_build_object('status', 400, 'error', 'this document kind cannot be deleted');
  end if;
  return jsonb_build_object('status', 200, 'name', p_path);
end;
$$;

/** Liste: courses/{c}/topics ve memberships (yalnız yönetici) — belge zarfıyla. */
create or replace function kpss_list_docs(p_prefix text, p_page_size int default 100, p_page_token text default '')
returns jsonb
language plpgsql
stable
security invoker
as $$
declare
  v_rows jsonb;
  v_offset int := greatest(0, coalesce(nullif(p_page_token, '')::int, 0));
  v_limit int := greatest(1, least(p_page_size, 300));
begin
  if p_prefix = 'courses' then
    select jsonb_agg(jsonb_build_object(
      'name', 'courses/' || c."id",
      'fields', to_jsonb(c)
    ) order by c."order", c."id") into v_rows
    from (
      select * from public.courses order by "order", "id" limit v_limit offset v_offset
    ) c;
  elsif p_prefix ~ '^courses/[^/]+/topics$' then
    select jsonb_agg(jsonb_build_object(
      'name', t."courseId" || '/topics/' || t."docId",
      'fields', jsonb_build_object(
        'id', t."id", 'name', t."name", 'courseId', t."courseId",
        'order', t."order", 'questionCount', t."questionCount",
        'schemaVersion', 1
      )
    ) order by t."order", t."docId") into v_rows
    from (
      select * from public.topics
      where "courseId" = split_part(p_prefix, '/', 2)
      order by "order", "docId"
      limit v_limit offset v_offset
    ) t;
  elsif p_prefix = 'memberships' then
    if not kpss_is_admin() then
      raise exception 'only an admin may list memberships' using errcode = '42501';
    end if;
    select jsonb_agg(jsonb_build_object(
      'name', 'memberships/' || m."email",
      'fields', to_jsonb(m)
    ) order by m."email") into v_rows
    from (
      select * from public.members order by "email" limit v_limit offset v_offset
    ) m;
  else
    return jsonb_build_object('status', 400, 'error', 'unsupported list path');
  end if;

  return jsonb_build_object(
    'status', 200,
    'documents', coalesce(v_rows, '[]'::jsonb),
    'nextPageToken', case
      when coalesce(jsonb_array_length(coalesce(v_rows, '[]'::jsonb)), 0) = v_limit
        then (v_offset + v_limit)::text else '' end
  );
end;
$$;

/**
 * Çözülen testleri BÜTÜNÜYLE değiştirir: panel/uygulama listeyi gönderir, biz
 * de satırları senkronlarız (listede olmayan silinir). security invoker → RLS
 * "yalnız kendi satırların" kuralı aynen geçerlidir.
 */
create or replace function kpss_replace_tests(p_member_email text, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare v_email text := lower(trim(coalesce(p_member_email, kpss_session_email()))); r jsonb; v_n int := 0;
begin
  if v_email = '' then
    raise exception 'member email required to store test results' using errcode = '42501';
  end if;
  if kpss_session_email() <> '' and kpss_session_email() <> v_email and not kpss_is_admin() then
    raise exception 'test results may only be written for the session member'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('status', 400, 'error', 'rows must be an array');
  end if;

  delete from public.user_tests t where t."memberEmail"::text = v_email;

  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.user_tests (
      "key", "memberEmail", "userId", "courseId", "topicDocId", "title",
      "correct", "wrong", "blank", "total", "net", "durationSec", "completedAt"
    )
    values (
      coalesce(r ->> 'key', v_email || '_' || v_n::text),
      v_email,
      auth.uid(),
      coalesce(r ->> 'courseId', 'genel'),
      nullif(r ->> 'topicDocId', ''),
      coalesce(r ->> 'title', ''),
      greatest(0, coalesce(kpss_as_int(r -> 'correct'), 0)),
      greatest(0, coalesce(kpss_as_int(r -> 'wrong'), 0)),
      greatest(0, coalesce(kpss_as_int(r -> 'blank'), 0)),
      greatest(0, coalesce(kpss_as_int(r -> 'total'), 0)),
      coalesce(kpss_as_num(r -> 'net'), 0),
      greatest(0, coalesce(kpss_as_int(r -> 'durationSec'), 0)),
      coalesce(nullif(r ->> 'completedAt', ''), now())::timestamptz
    )
    on conflict ("key") do update
      set "correct" = excluded."correct",
          "wrong" = excluded."wrong",
          "blank" = excluded."blank",
          "total" = excluded."total",
          "net" = excluded."net",
          "durationSec" = excluded."durationSec";
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('status', 200, 'count', v_n, 'memberEmail', v_email);
end;
$$;

/** Bir üyenin test satırları (cihaz önbelleği buna göre yenilenir). */
create or replace function kpss_pull_tests(p_member_email text)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'status', 200,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', t."key", 'courseId', t."courseId", 'topicDocId', coalesce(t."topicDocId", ''),
        'title', t."title", 'correct', t."correct", 'wrong', t."wrong", 'blank', t."blank",
        'total', t."total", 'net', t."net", 'durationSec', t."durationSec",
        'completedAt', to_char(t."completedAt" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'memberId', t."memberEmail"
      ) order by t."completedAt" desc)
      from (
        select * from public.user_tests
        where "memberEmail"::text = lower(trim(coalesce(nullif(p_member_email, ''), kpss_session_email())))
        order by "completedAt" desc
        limit 500
      ) t
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.kpss_replace_tests(text, jsonb) to authenticated;
grant execute on function public.kpss_pull_tests(text) to authenticated;

/* ========================================================================== RLS */

alter table public.membership_policy enable row level security;
alter table public.admins            enable row level security;
alter table public.members           enable row level security;
alter table public.courses           enable row level security;
alter table public.topics            enable row level security;
alter table public.questions         enable row level security;
alter table public.user_tests        enable row level security;
alter table public.tips              enable row level security;
alter table public.user_data         enable row level security;

/* --- içerik ve politika herkese OKUNABİLİR (kayıt anında politika okunmalı) */

drop policy if exists policy_read on public.membership_policy;
create policy policy_read on public.membership_policy for select using (true);
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select using (true);
drop policy if exists topics_read on public.topics;
create policy topics_read on public.topics for select using (true);
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select using (true);
drop policy if exists tips_read on public.tips;
create policy tips_read on public.tips for select using (true);
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select using (true);

/* --- üyeler: herkes yalnız kendisini; yönetici tümünü görür. Anon listeleme yok. */

drop policy if exists members_self_select on public.members;
create policy members_self_select on public.members for select
  using (kpss_is_admin() or "email"::text = kpss_session_email());

drop policy if exists members_self_insert on public.members;
create policy members_self_insert on public.members for insert
  with check (kpss_is_admin() or (not kpss_membership_locked() and "role" = 'user'));

drop policy if exists members_self_update on public.members;
create policy members_self_update on public.members for update
  using (kpss_is_admin() or "email"::text = kpss_session_email())
  with check (kpss_is_admin() or "email"::text = kpss_session_email());

drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete on public.members for delete using (kpss_is_admin());

/* --- içerik/politika/admin yazmaları yalnız yönetici (kilitler bekçide) */

drop policy if exists policy_write on public.membership_policy;
create policy policy_write on public.membership_policy for update
  using (kpss_is_admin()) with check (kpss_is_admin());

drop policy if exists admins_insert on public.admins;
create policy admins_insert on public.admins for insert
  with check (kpss_is_admin() or not exists (select 1 from public.admins));
drop policy if exists admins_delete on public.admins;
create policy admins_delete on public.admins for delete using (kpss_is_admin());

drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all
  using (kpss_is_admin()) with check (kpss_is_admin());
drop policy if exists topics_write on public.topics;
create policy topics_write on public.topics for all
  using (kpss_is_admin()) with check (kpss_is_admin());
drop policy if exists questions_write on public.questions;
create policy questions_write on public.questions for all
  using (kpss_is_admin()) with check (kpss_is_admin());
drop policy if exists tips_write on public.tips;
create policy tips_write on public.tips for all
  using (kpss_is_admin()) with check (kpss_is_admin());

/* --- kullanıcı verisi: yalnız kendi satırların */

drop policy if exists user_tests_self on public.user_tests;
create policy user_tests_self on public.user_tests for all
  using (
    kpss_is_admin()
    or "memberEmail"::text = kpss_session_email()
    or (auth.uid() is not null and "userId" = auth.uid())
  )
  with check (
    "memberEmail"::text = kpss_session_email()
    or (auth.uid() is not null and "userId" = auth.uid())
  );

drop policy if exists user_data_self on public.user_data;
create policy user_data_self on public.user_data for all
  using (auth.uid() is not null and "userId" = auth.uid())
  with check (auth.uid() is not null and "userId" = auth.uid());

/* ======================================================================= yetkiler */

grant usage on schema public to anon, authenticated;
grant select on public.courses, public.topics, public.questions, public.tips,
  public.membership_policy, public.admins to anon, authenticated;
grant select, insert, update on public.members to anon, authenticated;
grant delete on public.members to authenticated;
grant insert, update, delete on public.courses, public.topics, public.questions,
  public.tips, public.membership_policy to authenticated;
grant insert, delete on public.admins to anon, authenticated;
grant select, insert, update, delete on public.user_tests, public.user_data to authenticated;
grant execute on function public.kpss_as_bool(jsonb, boolean) to anon, authenticated;
grant execute on function public.kpss_as_int(jsonb, int) to anon, authenticated;
grant execute on function public.kpss_as_num(jsonb, numeric) to anon, authenticated;

grant execute on function
  public.kpss_read_doc(text),
  public.kpss_write_doc(text, jsonb, text),
  public.kpss_delete_doc(text),
  public.kpss_list_docs(text, int, text),
  public.kpss_member_exists(text)
  to anon, authenticated;

/**
 * “Bu e-posta kayıtlı mı?” — oturum olmadan da sorulabilir ama yanıt yalnız bir
 * boolean'dır; hiçbir üye alanı sızmaz (security definer, sabit search_path).
 */
create or replace function kpss_member_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members m where m."email"::text = lower(trim(p_email)));
$$;
grant execute on function public.kpss_member_exists(text) to anon, authenticated;

-- =============================================================================
-- BİTTİ. Bu dosyayı değiştirdiysen:  npm run sync:sql
-- (panelin “SQL'i kopyala” düğmesi config/supabaseSqlCopy.ts'i kullanır; test:db
--  bayat kopyayı ve RLS'te eksik politikayı yakalar.)
-- =============================================================================
