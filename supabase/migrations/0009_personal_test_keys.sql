-- Each user's result keys are scoped to their own account.
-- Existing rows are retained; no table data is cleared by this migration.
alter table public.user_tests drop constraint if exists user_tests_pkey;
alter table public.user_tests add primary key ("memberEmail", "key");

-- Keep legacy app versions compatible with the composite key.
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
    on conflict ("memberEmail", "key") do update
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

-- All results are returned; the previous 500-row cap hid older history.
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
      ) t
    ), '[]'::jsonb)
  );
$$;
