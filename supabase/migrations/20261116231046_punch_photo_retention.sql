-- Phase 12: punch photos are deleted automatically after 3 months (PRD 4.4 and 11, CLAUDE.md).
--
-- How it works:
--   pg_cron (daily, 01:30 Kuwait time) --pg_net--> edge function `purge-punch-photos`
--   --> asks the database for photos older than 3 months --> deletes them with the Storage API
--   --> tells the database which ones are gone: their attendance_punches.photo_path is cleared
--   (the punch rows stay) and one row is written to audit_log with the counts.
--
-- Why an edge function: Supabase blocks DELETE on storage.objects from SQL (trigger
-- storage.protect_delete), and deleting the metadata row would orphan the file anyway.
-- Files must be removed through the Storage API.
--
-- Auth between cron and the function: a random shared secret, made here inside the database and
-- kept only in Vault (never in the repo). Cron sends it in the `x-purge-secret` header; the function
-- passes it to the RPCs below, which check it against Vault. The RPCs are callable by service_role only.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'punch_photo_purge_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'punch_photo_purge_secret',
      'Shared secret: pg_cron -> edge function purge-punch-photos (Phase 12)');
  end if;
end $$;

create function private.punch_photo_purge_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32, false) and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'punch_photo_purge_secret' and s.decrypted_secret = p_secret)
$$;
revoke execute on function private.punch_photo_purge_secret_ok(text) from public, anon, authenticated;

-- Up to 1000 photo paths (the Storage API limit per call) older than 3 months, oldest first.
create function public.punch_photo_purge_candidates(p_secret text, p_limit integer default 1000)
returns table (path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.punch_photo_purge_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select o.name
    from storage.objects o
    where o.bucket_id = 'punch-photos'
      and o.created_at < now() - interval '3 months'
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 1000), 1), 1000);
end;
$$;

-- After the Storage API call: clear photo_path for photos that are really gone (and for punches older
-- than 3 months whose photo is missing), then log the run. Returns the counts.
create function public.punch_photo_purge_finish(p_secret text, p_removed text[], p_failed integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - interval '3 months';
  v_deleted integer;
  v_cleared integer;
  v_summary jsonb;
begin
  if not private.punch_photo_purge_secret_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select count(*) into v_deleted
  from unnest(coalesce(p_removed, '{}')) r(path)
  where not exists (select 1 from storage.objects o where o.bucket_id = 'punch-photos' and o.name = r.path);

  update public.attendance_punches p
     set photo_path = null
   where p.photo_path is not null
     and (p.photo_path = any (coalesce(p_removed, '{}')) or p.punched_at < v_cutoff)
     and not exists (select 1 from storage.objects o where o.bucket_id = 'punch-photos' and o.name = p.photo_path);
  get diagnostics v_cleared = row_count;

  v_summary := jsonb_build_object(
    'photos_deleted', v_deleted,
    'punch_paths_cleared', v_cleared,
    'failed', coalesce(p_failed, 0),
    'cutoff', v_cutoff,
    'rule', 'PRD 11: punch photos are deleted after 3 months');

  insert into public.audit_log (actor_user_id, action, table_name, record_id, old_data, new_data)
  values (null, 'retention_purge', 'attendance_punches', 'punch-photos', null, v_summary);

  return v_summary;
end;
$$;

revoke execute on function public.punch_photo_purge_candidates(text, integer) from public, anon, authenticated;
revoke execute on function public.punch_photo_purge_finish(text, text[], integer) from public, anon, authenticated;
grant execute on function public.punch_photo_purge_candidates(text, integer) to service_role;
grant execute on function public.punch_photo_purge_finish(text, text[], integer) to service_role;

-- Daily at 22:30 UTC = 01:30 Kuwait time. The secret is read from Vault at run time.
select cron.schedule(
  'punch-photos-purge',
  '30 22 * * *',
  $cron$
  select net.http_post(
    url := 'https://etaetoflotynlmgrehuu.supabase.co/functions/v1/purge-punch-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'punch_photo_purge_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
  $cron$
);
