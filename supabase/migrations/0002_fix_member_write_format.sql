-- Repair existing deployments without changing any data or permissions.
-- Keep this definition in sync with 0001_init.sql.
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
                          else format('%I = excluded.%I', a.attname, a.attname) end, ', ' order by a.attnum)
      into v_cols, v_sets
      from pg_attribute a
     where a.attrelid = 'public.members'::regclass
       and a.attnum > 0 and not a.attisdropped
       and a.attname <> 'id'
       and (v_doc ? a.attname or a.attname = 'email');
    if v_cols is null or v_sets is null then
      return jsonb_build_object('status', 400, 'error', 'nothing writable in document');
    end if;
    if kpss_session_email() = '' and p_mode = 'replace' then
      execute 'insert into public.members (' || v_cols || ') select ' || v_cols
           || ' from jsonb_populate_record(null::public.members, $1) x'
        using v_doc;
    else
      execute 'insert into public.members (' || v_cols || ') select ' || v_cols
           || ' from jsonb_populate_record(null::public.members, $1) x'
           || ' on conflict ("email") do update set ' || v_sets
        using v_doc;
    end if;
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
