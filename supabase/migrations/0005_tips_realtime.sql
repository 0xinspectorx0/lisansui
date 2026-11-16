-- Hap bilgi yazımları mevcut RPC ile public.tips tablosuna yapılır.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tips'
     ) then
    alter publication supabase_realtime add table public.tips;
  end if;
end $$;
