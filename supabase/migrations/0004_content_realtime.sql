-- Topic writes and their question replacement commit in one transaction.  The
-- topic event is only a notification; clients re-read through the existing RPC.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'topics'
     ) then
    alter publication supabase_realtime add table public.topics;
  end if;
end $$;
