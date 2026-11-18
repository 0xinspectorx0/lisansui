// Runs the real migrations against embedded PostgreSQL with a minimal Auth schema.
// It exercises SQL/RLS, not the hosted Supabase Auth service or the React UI.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { citext, pgcrypto } });
const userId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const claims = (id, email) => JSON.stringify({ sub: id, email });
const setClaims = async value => db.query("select set_config('request.jwt.claims', $1, false)", [value]);
try {
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await setClaims('{}');
  for (const name of ['0001_init.sql', '0002_fix_member_write_format.sql', '0003_approval_queue.sql', '0006_fix_content_delete.sql', '0007_safeupdate_tips.sql', '0009_personal_test_keys.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
  }
  // Existing configuration cannot disable the approval requirement.
  await db.exec('update public.membership_policy set "requireApproval" = false');
  await db.exec(`insert into auth.users values ('${userId}', 'learner@example.com', null, '{"display_name":"Learner"}');`);
  assert.equal((await db.query('select count(*)::int as n from public.members')).rows[0].n, 0, 'unconfirmed email is not queued');
  await db.exec(`update auth.users set email_confirmed_at=now() where id='${userId}';`);
  await db.exec(`update auth.users set email_confirmed_at=now() where id='${userId}';`);
  const member = (await db.query('select status, "displayName", "authUid" from public.members')).rows;
  assert.deepEqual(member, [{ status: 'pending', displayName: 'Learner', authUid: userId }]);
  await db.exec('set role authenticated');
  await setClaims(claims(userId, 'learner@example.com'));
  assert.equal((await db.query('select public.kpss_is_admin() as allowed')).rows[0].allowed, false);
  await assert.rejects(db.exec("update public.members set status='active' where email='learner@example.com'"), /admin-only/);
  await assert.rejects(db.exec(`insert into public.user_data ("userId", "kind", "payload") values ('${userId}', 'favorites', '[]'::jsonb)`), /row-level security/);
  await assert.rejects(db.exec("insert into public.admins(email) values ('learner@example.com')"), /row-level security/);
  await db.exec('reset role');
  await db.exec("insert into public.admins(email) values ('admin@example.com')");
  await setClaims(claims(adminId, 'admin@example.com'));
  await db.exec("set role authenticated; update public.members set status='active' where email='learner@example.com'");
  assert.equal((await db.query('select public.kpss_is_admin() as allowed')).rows[0].allowed, true);
  // Replacing a nonempty tips list must actually delete the old rows first.
  await db.query("select public.kpss_write_doc('daily_tips/main', $1::jsonb)", [JSON.stringify({list:['İlk bilgi'], schemaVersion:1})]);
  await db.query("select public.kpss_write_doc('daily_tips/main', $1::jsonb)", [JSON.stringify({list:['Yeni bilgi', 'İkinci'], schemaVersion:1})]);
  assert.deepEqual((await db.query('select "body" from public.tips order by "ord"')).rows.map(x => x.body), ['Yeni bilgi', 'İkinci']);
  await db.query("select public.kpss_write_doc('daily_tips/main', $1::jsonb)", [JSON.stringify({list:[], schemaVersion:1})]);
  assert.equal((await db.query('select count(*)::int as n from public.tips')).rows[0].n, 0);
  await db.query("select public.kpss_write_doc('daily_tips/main', $1::jsonb)", [JSON.stringify({list:['Silinecek bilgi'], schemaVersion:1})]);
  await db.query("select public.kpss_delete_doc('daily_tips/main')");
  assert.equal((await db.query('select count(*)::int as n from public.tips')).rows[0].n, 0);
  const migration = readFileSync('supabase/migrations/0007_safeupdate_tips.sql', 'utf8');
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(tips|admins)\s*;/i, 'safeupdate forbids unqualified DELETE');
  assert.match(migration, /delete from public\.tips where "ord" >= 0/i);
  await setClaims(claims(userId, 'learner@example.com'));
  await assert.rejects(db.query("select public.kpss_write_doc('daily_tips/main', $1::jsonb)", [JSON.stringify({list:['Yetkisiz'], schemaVersion:1})]), /row-level security|permission denied/i);
  await db.exec(`insert into public.user_data ("userId", "kind", "payload") values ('${userId}', 'favorites', '[]'::jsonb)`);
  assert.equal((await db.query('select count(*)::int as n from public.user_data')).rows[0].n, 1);
  // Equal topic/test keys belong to different accounts and cannot overwrite each other.
  const otherId = '33333333-3333-4333-8333-333333333333';
  await db.exec('reset role');
  await setClaims(claims(adminId, 'admin@example.com'));
  await db.exec(`insert into auth.users values ('${otherId}', 'other@example.com', now(), '{}')`);
  await db.exec("set role authenticated; update public.members set status='active' where email='other@example.com'");
  await setClaims(claims(userId, 'learner@example.com'));
  await db.exec(`insert into public.user_tests ("key","memberEmail","userId","courseId") values ('same-test','learner@example.com','${userId}','tarih')`);
  await db.exec(`insert into public.user_tests ("key","memberEmail","userId","courseId") select 'history-' || i, 'learner@example.com', '${userId}', 'tarih' from generate_series(1, 501) i`);
  const history = await db.query("select jsonb_array_length(public.kpss_pull_tests('learner@example.com')->'rows') as n");
  assert.equal(history.rows[0].n, 502, 'all results are returned, including history past 500');
  await setClaims(claims(otherId, 'other@example.com'));
  await db.exec(`insert into public.user_tests ("key","memberEmail","userId","courseId") values ('same-test','other@example.com','${otherId}','turkce')`);
  assert.deepEqual((await db.query('select "courseId" from public.user_tests')).rows, [{courseId:'turkce'}]);
  await assert.rejects(db.exec(`insert into public.user_tests ("key","memberEmail","userId","courseId") values ('forged','learner@example.com','${userId}','tarih')`), /row-level security/);
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int as n from public.user_tests where key='same-test'")).rows[0].n, 2);
  // Founder must already have a confirmed Auth identity; migration does not invent one.
  const founderId = '44444444-4444-4444-8444-444444444444';
  const founderMigration = readFileSync('supabase/migrations/0010_founder_protection.sql', 'utf8');
  await assert.rejects(db.exec(founderMigration), /existing, verified/);
  await setClaims('{}');
  await db.exec(`insert into auth.users values ('${founderId}', 'gokhntekin@gmail.com', now(), '{}')`);
  await db.exec(founderMigration);
  await db.exec(founderMigration); // migration can be safely rerun
  const founder = (await db.query("select role,status,\"authUid\" from public.members where email='gokhntekin@gmail.com'")).rows[0];
  assert.deepEqual(founder, {role:'owner', status:'active', authUid:founderId});
  await db.exec('set role authenticated');
  await setClaims(claims(adminId, 'admin@example.com'));
  await assert.rejects(db.exec("update public.members set role='user' where email='gokhntekin@gmail.com'"), /Founder identity, role and status/);
  await assert.rejects(db.exec("update public.members set status='banned' where email='gokhntekin@gmail.com'"), /Founder identity, role and status/);
  await assert.rejects(db.exec("update public.members set \"authUid\"='fake' where email='gokhntekin@gmail.com'"), /Founder identity, role and status/);
  await assert.rejects(db.exec("delete from public.members where email='gokhntekin@gmail.com'"), /Founder account cannot be deleted/);
  await assert.rejects(db.exec(`update public.admins set "userId"='${adminId}' where email='gokhntekin@gmail.com'`), /Founder admin identity|permission denied/);
  await db.exec("delete from public.admins where email='gokhntekin@gmail.com'");
  assert.equal((await db.query("select count(*)::int as n from public.admins where email='gokhntekin@gmail.com'")).rows[0].n,1);
  await db.query("select public.kpss_write_doc('meta/admins', $1::jsonb)", [JSON.stringify({emails:['admin@example.com','gokhntekin@gmail.com']})]);
  await db.query("select public.kpss_write_doc('meta/admins', $1::jsonb)", [JSON.stringify({emails:['admin@example.com']})]);
  assert.equal((await db.query("select count(*)::int as n from public.admins where email='gokhntekin@gmail.com'")).rows[0].n,1, 'replacing admin list cannot remove founder');
  await setClaims(claims(adminId, 'gokhntekin@gmail.com'));
  assert.equal((await db.query('select public.kpss_is_admin() as allowed')).rows[0].allowed,false,'email claim alone must not impersonate founder');
  await setClaims(claims(founderId, 'gokhntekin@gmail.com'));
  assert.equal((await db.query('select public.kpss_is_admin() as allowed')).rows[0].allowed,true);
  await db.exec("update public.members set \"displayName\"='Kurucu' where email='gokhntekin@gmail.com'");
  await db.exec('reset role');
  await assert.rejects(db.exec(`delete from auth.users where id='${founderId}'`), /Founder Auth account cannot be deleted/);
  await assert.rejects(db.exec(`update auth.users set email='changed@example.com' where id='${founderId}'`), /Founder Auth email and verification/);
  await assert.rejects(db.exec(`update auth.users set email_confirmed_at=null where id='${founderId}'`), /Founder Auth email and verification/);
  await db.exec(`update auth.users set raw_user_meta_data='{}' where id='${founderId}'`);
  console.log('✓ Founder UID, role, status and admin-list protections');
  console.log('✓ PostgreSQL approval, personal data RLS and independent test keys');
} finally {
  await db.close();
}
