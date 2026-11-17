-- The test database is local and cut off from the live project; every table is protected by RLS.
begin;
select plan(6);

select is((select count(*)::int from cron.job), 0, 'no cron job runs on the test database (nothing calls the live project)');
select is((select count(*)::int from vault.secrets where name in ('send_push_secret', 'punch_photo_purge_secret')), 0,
  'no push / purge secret: private.push_kick() never calls pg_net');
select is((select count(*)::int from net.http_request_queue), 0, 'no outgoing HTTP call is queued');
select is(
  (select coalesce(string_agg(c.relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'every table in public has row level security turned on');
-- TRUNCATE skips RLS. Phase 12 removed it from every table except the 4 bonus tables (left for the agents project).
select is(
  (select coalesce(string_agg(distinct table_name, ', '), '') from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE'
      and table_name not in ('leaves', 'penalties', 'bonus_lists', 'agent_log')),
  '', 'no app role can TRUNCATE (skip RLS on) any core table');
select todo('Open item for the agents project (migration 20261116231523): TRUNCATE still granted on the bonus tables', 1);
select is(
  (select coalesce(string_agg(distinct table_name, ', ' order by table_name), '') from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'TRUNCATE'),
  '', 'no app role can TRUNCATE any table (bonus tables included)');
select * from finish();
rollback;
