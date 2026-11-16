-- Sanad Phase 9: wake the send-push function at most once per transaction.
-- An emergency queued for hundreds of people (one enqueue_notification call each) must make ONE pg_net call,
-- not hundreds. One call drains everything due (5 batches of 100; the next cron run takes the rest).
-- If send-push is missing (404) or down, rows simply stay pending: the cron calls at most once every 2 minutes,
-- and rows older than 12 hours are closed as failed/expired, so nothing grows without bound.
create or replace function private.push_kick()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if current_setting('sanad.push_kicked', true) = 'on' then return true; end if;
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'send_push_secret';
  if v_secret is null then return false; end if;
  perform net.http_post(
    url := 'https://etaetoflotynlmgrehuu.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 60000);
  perform set_config('sanad.push_kicked', 'on', true);
  return true;
end;
$$;
revoke all on function private.push_kick() from public, anon, authenticated;
