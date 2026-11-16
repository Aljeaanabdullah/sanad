-- Sanad Phase 9 (PRD 9): push notifications.
--
-- public.notifications is both the in-app list (read / unread) and the push outbox:
--   * every event is ONE row with a unique dedupe_key (kind + shift / request / record id), inserted with
--     ON CONFLICT DO NOTHING, so running a producer again never creates a second notification;
--   * push_status: pending -> sent | failed | not_configured (no FCM key yet) | no_token (recipient has no
--     phone registered) | skipped (history copied from the old read-only list, never pushed).
-- Producers: private.notify_produce() (pg_cron every 2 minutes) reads shifts, attendance_days, punches,
--   requests / approvals, leaves, penalties and bonus_lists by their timestamps. No triggers on bonus tables.
--   Other modules (Phase 11 emergency) call private.enqueue_notification(...).
-- Sender: the send-push edge function. pg_cron calls it through pg_net with the header x-push-secret, a random
--   value kept only in Supabase Vault (created below, never written in this file); the function checks it with
--   public.push_secret_ok() and then claims / reports rows with the service role.
-- Recipients are active employees who have an account (user_id). Supervisor = departments.supervisor_id.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Push tokens (native FCM / APNs token per phone)
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  employee_id uuid not null references public.employees (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  lang text not null default 'ar' check (lang in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_tokens_employee_idx on public.push_tokens (employee_id);
-- RLS on, no policies: no client role reads or writes tokens directly (only the RPCs below).
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Outbox columns on the notifications table
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column dedupe_key text,
  add column priority text not null default 'normal' check (priority in ('normal', 'high')),
  add column push_status text not null default 'pending'
    check (push_status in ('pending', 'sent', 'failed', 'not_configured', 'no_token', 'skipped')),
  add column push_attempts smallint not null default 0,
  add column push_error text,
  add column pushed_at timestamptz,
  add column next_attempt_at timestamptz not null default now();
update public.notifications set dedupe_key = 'legacy:' || id, push_status = 'skipped' where dedupe_key is null;
alter table public.notifications alter column dedupe_key set not null;
create unique index notifications_dedupe_key_idx on public.notifications (dedupe_key);
create index notifications_pending_idx on public.notifications (next_attempt_at) where push_status = 'pending';
create index notifications_unread_idx on public.notifications (employee_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- 3. Texts (Arabic + English), built once when the row is queued
-- ---------------------------------------------------------------------------
create function private.kw_hm(p_at timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_at at time zone 'Asia/Kuwait', 'HH24:MI')
$$;

-- English label of a leave / penalty type stored in Arabic.
create function private.type_en(p text) returns text
language sql immutable set search_path = '' as $$
  select case p
    when 'إجازة دورية' then 'Annual leave' when 'إجازة مرضية' then 'Sick leave'
    when 'إجازة طارئة' then 'Emergency leave' when 'إجازة بدون راتب' then 'Unpaid leave'
    when 'غياب' then 'Absence' when 'تأخير' then 'Late arrival'
    when 'إنذار' then 'Warning' when 'لفت نظر' then 'Notice' when 'خصم' then 'Deduction' when 'إيقاف' then 'Suspension'
    else coalesce(p, '') end
$$;

create function private.request_label(p_type text, p_leave text, p_en boolean) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_type = 'punch_correction' then case when p_en then 'Punch correction' else 'تصحيح بصمة' end
    when p_type = 'external_mission' then case when p_en then 'External mission' else 'مهمة عمل خارجية' end
    when p_en then coalesce(private.type_en(p_leave), 'Leave')
    else coalesce(p_leave, 'إجازة') end
$$;

create function private.range_text(p_from text, p_to text, p_en boolean) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_from is null then ''
    when p_to is null or p_to = p_from then case when p_en then 'On ' else 'يوم ' end || p_from
    when p_en then format('From %s to %s', p_from, p_to)
    else format('من %s إلى %s', p_from, p_to) end
$$;

create function private.notification_text(p_kind text, d jsonb)
returns table (title_ar text, title_en text, body_ar text, body_en text)
language plpgsql
stable
set search_path = ''
as $$
declare
  hm text := private.kw_hm((d ->> 'shift_start')::timestamptz);
  grace text := private.kw_hm((d ->> 'grace_end')::timestamptz);
  closes text := private.kw_hm((d ->> 'checkout_closes')::timestamptz);
  day text := d ->> 'date';
  n text := d ->> 'count';
  what_ar text := private.request_label(d ->> 'request_type', d ->> 'leave_type', false);
  what_en text := private.request_label(d ->> 'request_type', d ->> 'leave_type', true);
  note text := nullif(btrim(coalesce(d ->> 'note', '')), '');
begin
  case p_kind
  when 'shift_reminder' then
    return query select format('تذكير: ورديتك تبدأ الساعة %s', hm), format('Reminder: your shift starts at %s', hm),
      'لا تنسَ بصمة الدخول.', 'Remember to punch in.';
  when 'late_warning' then
    return query select 'لم تسجّل بصمة الدخول بعد', 'You have not punched in yet',
      format('بدأت ورديتك الساعة %s. بصّم الآن؛ التأخير يُحسب بعد الساعة %s.', hm, grace),
      format('Your shift started at %s. Punch in now; lateness counts after %s.', hm, grace);
  when 'checkout_reminder' then
    return query select 'تذكير: بصمة الخروج', 'Reminder: punch out',
      format('نافذة بصمة الخروج تُغلق الساعة %s.', closes), format('The check-out window closes at %s.', closes);
  when 'missing_checkout' then
    return query select 'خروج مفقود', 'Missing check-out',
      format('لم تُسجَّل بصمة خروج لوردية %s. تقدر تقدّم طلب تصحيح بصمة.', day),
      format('No check-out was recorded for your shift on %s. You can send a punch correction request.', day);
  when 'sup_not_in' then
    return query select 'موظفون لم يحضروا بعد مهلة السماح', 'Not in after the grace period',
      format('وردية %s %s. عددهم %s: %s', day, hm, n, d ->> 'names_ar'),
      format('Shift %s %s. %s employee(s): %s', day, hm, n, d ->> 'names_en');
  when 'sup_absent' then
    return query select 'غياب موظفين', 'Absence',
      format('انتهت وردية %s دون بصمة دخول. عددهم %s: %s', day, n, d ->> 'names_ar'),
      format('The shift on %s ended with no check-in. %s employee(s): %s', day, n, d ->> 'names_en');
  when 'sup_missing_checkout' then
    return query select 'خروج مفقود لموظفين', 'Missing check-outs',
      format('انتهت وردية %s دون بصمة خروج. عددهم %s: %s', day, n, d ->> 'names_ar'),
      format('The shift on %s ended with no check-out. %s employee(s): %s', day, n, d ->> 'names_en');
  when 'sup_failed_verification' then
    return query select 'تكرار فشل التحقق', 'Repeated failed verification',
      format('%s (%s): %s محاولات تبصيم متتالية رُفضت لفشل التحقق.', d ->> 'name_ar', d ->> 'file_number', n),
      format('%s (%s): %s punches in a row were rejected for failed verification.', d ->> 'name_en', d ->> 'file_number', n);
  when 'request_decided' then
    return query select
      case when d ->> 'decision' = 'rejected' then 'تم رفض طلبك'
           when d ->> 'stage' = 'hr' then 'تمت الموافقة على طلبك' else 'وافق المشرف على طلبك' end,
      case when d ->> 'decision' = 'rejected' then 'Your request was rejected'
           when d ->> 'stage' = 'hr' then 'Your request was approved' else 'Your supervisor approved your request' end,
      concat_ws(E'\n', what_ar || ' — ' || private.range_text(day, d ->> 'to', false),
        case when d ->> 'decision' = 'approved' and d ->> 'stage' = 'supervisor' then 'بانتظار موافقة الموارد البشرية.' end, note),
      concat_ws(E'\n', what_en || ' — ' || private.range_text(day, d ->> 'to', true),
        case when d ->> 'decision' = 'approved' and d ->> 'stage' = 'supervisor' then 'Waiting for HR approval.' end, note);
  when 'request_to_approve' then
    return query select 'طلب بانتظار موافقتك', 'A request needs your approval',
      format('%s: %s — %s', d ->> 'name_ar', what_ar, private.range_text(day, d ->> 'to', false)),
      format('%s: %s — %s', d ->> 'name_en', what_en, private.range_text(day, d ->> 'to', true));
  when 'leave_recorded' then
    return query select format('تم تسجيل %s', d ->> 'type'), format('%s recorded', private.type_en(d ->> 'type')),
      private.range_text(d ->> 'from', d ->> 'to', false), private.range_text(d ->> 'from', d ->> 'to', true);
  when 'penalty_recorded' then
    return query select format('تم تسجيل عقوبة: %s', d ->> 'type'), format('Penalty recorded: %s', private.type_en(d ->> 'type')),
      concat_ws(' · ', 'بتاريخ ' || (d ->> 'date'), nullif(d ->> 'reason', '')),
      concat_ws(' · ', 'On ' || (d ->> 'date'), nullif(d ->> 'reason', ''));
  when 'bonus_list' then
    return query select format('صدر كشف المكافأة لشهر %s', d ->> 'month'), format('The bonus list for %s is out', d ->> 'month'),
      case when d ->> 'eligibility' = 'مستحق' then 'أنت مستحق للمكافأة.'
           else concat_ws(': ', 'غير مستحق', nullif(d ->> 'reason', '')) end,
      case when d ->> 'eligibility' = 'مستحق' then 'You are eligible for the bonus.'
           else concat_ws(': ', 'Not eligible', nullif(d ->> 'reason', '')) end;
  when 'late' then
    return query select 'تأخير', 'Late arrival',
      format('%s · %s دقيقة', day, d ->> 'minutes'), format('%s · %s min', day, d ->> 'minutes');
  when 'emergency_alert' then
    return query select coalesce(d ->> 'title_ar', 'تنبيه طوارئ'), coalesce(d ->> 'title_en', d ->> 'title_ar', 'Emergency alert'),
      coalesce(d ->> 'body_ar', d ->> 'message_ar', ''), coalesce(d ->> 'body_en', d ->> 'message_en', d ->> 'body_ar', d ->> 'message_ar', '');
  else
    return query select coalesce(d ->> 'title_ar', 'سند'), coalesce(d ->> 'title_en', 'Sanad'),
      coalesce(d ->> 'body_ar', ''), coalesce(d ->> 'body_en', d ->> 'body_ar', '');
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Vault secret + the call to the edge function (pg_net; sent only after the transaction commits)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'send_push_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'send_push_secret',
      'Sanad: x-push-secret header that the database sends to the send-push edge function');
  end if;
end $$;

-- Rows that cannot be pushed are closed here, so the edge function is called only when there is work.
create function private.push_housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Old reminders are useless: nothing is pushed more than 12 hours late.
  update public.notifications set push_status = 'failed', push_error = 'expired'
  where push_status = 'pending' and created_at < now() - interval '12 hours';
  update public.notifications n set push_status = 'no_token'
  where n.push_status = 'pending'
    and not exists (select 1 from public.push_tokens t where t.employee_id = n.employee_id);
end;
$$;

create function private.push_kick()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'send_push_secret';
  if v_secret is null then return false; end if;
  perform net.http_post(
    url := 'https://etaetoflotynlmgrehuu.supabase.co/functions/v1/send-push',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 60000);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The one entry point that queues a notification (also used by Phase 11 emergency, kind 'emergency_alert').
--    Same p_dedupe twice = nothing new. High priority is pushed right away (no wait for the next cron run).
-- ---------------------------------------------------------------------------
create function private.enqueue_notification(
  p_employee uuid, p_kind text, p_data jsonb, p_dedupe text, p_priority text default 'normal')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
begin
  if p_employee is null or p_kind is null or btrim(p_kind) = '' or p_dedupe is null or btrim(p_dedupe) = ''
     or coalesce(p_priority, '') not in ('normal', 'high') then
    raise exception 'invalid_notification' using errcode = '22023';
  end if;
  select * into t from private.notification_text(p_kind, v_data);
  insert into public.notifications (employee_id, kind, title_ar, title_en, body_ar, body_en, data, dedupe_key, priority)
  values (p_employee, p_kind, t.title_ar, t.title_en, nullif(t.body_ar, ''), nullif(t.body_en, ''), v_data, p_dedupe, p_priority)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  if v_id is not null and p_priority = 'high'
     and exists (select 1 from public.push_tokens k where k.employee_id = p_employee) then
    perform private.push_kick();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Producers
-- ---------------------------------------------------------------------------
-- Shifts of every active employee touching [p_from, p_to]. Shifts depend only on the work pattern (and the
-- cycle start for rotations), so they are computed once per group, not 3,500 times.
create function private.notify_shifts(p_from timestamptz, p_to timestamptz)
returns table (employee_id uuid, shift_date date, shift_start timestamptz, shift_end timestamptz,
               grace_end timestamptz, checkout_closes timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with emp as materialized (
    select e.id, e.work_pattern_id, e.created_at,
           coalesce(case when w.kind in ('one_on_two_off', 'two_on_four_off') then e.cycle_start_date end,
                    date '0001-01-01') as cyc
    from public.employees e join public.work_patterns w on w.id = e.work_pattern_id
    where e.is_active
  ),
  -- materialized: employee_shifts runs once per group (about 16 calls), never once per employee
  gs as materialized (
    select g.work_pattern_id, g.cyc, s.*
    from (select x.work_pattern_id, x.cyc, (array_agg(x.id order by x.id))[1] as rep
          from emp x group by x.work_pattern_id, x.cyc) g
    cross join lateral private.employee_shifts(g.rep, p_from, p_to) s
  )
  select emp.id, gs.shift_date, gs.shift_start, gs.shift_end, gs.grace_end, gs.checkout_closes
  from gs join emp on emp.work_pattern_id = gs.work_pattern_id and emp.cyc = gs.cyc
  where gs.shift_start >= emp.created_at
$$;

-- Can receive notifications: active, has an account.
create function private.notify_can_receive(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees e where e.id = p_employee and e.is_active and e.user_id is not null)
$$;

-- The department supervisor who should hear about p_employee (null if none, not reachable, or the same person).
create function private.notify_supervisor_of(p_employee uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select d.supervisor_id
  from public.employees e
  join public.departments d on d.id = e.department_id
  join public.employees s on s.id = d.supervisor_id
  where e.id = p_employee and s.id <> e.id and s.is_active and s.user_id is not null
$$;

-- Not expected at work that day: on leave (any "إجازة ..." row covering the day) or not on duty.
create function private.notify_excused(p_employee uuid, p_day date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees e where e.id = p_employee and e.employment_status <> 'على رأس العمل')
      or exists (select 1 from public.leaves l
                 where l.employee_id = p_employee and l.leave_type like 'إجازة%'
                   and p_day between l.from_date and coalesce(l.to_date, l.from_date))
$$;

create function private.notify_produce(p_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_since timestamptz := p_at - interval '3 days';
begin
  -- ===== Employee, time based =====
  for r in
    select s.*, a.check_in_at
    from private.notify_shifts(p_at - interval '7 hours', p_at + interval '1 hour') s
    join public.employees e on e.id = s.employee_id and e.user_id is not null
    left join public.attendance_days a on a.employee_id = s.employee_id and a.shift_start = s.shift_start
    where a.check_in_at is null and not private.notify_excused(s.employee_id, s.shift_date)
  loop
    -- 30 minutes before the shift starts.
    if p_at >= r.shift_start - interval '30 minutes' and p_at < r.shift_start then
      perform private.enqueue_notification(r.employee_id, 'shift_reminder',
        jsonb_build_object('shift_start', r.shift_start, 'date', r.shift_date),
        format('shift_reminder:%s:%s', r.employee_id, extract(epoch from r.shift_start)::bigint));
    end if;
    -- 10 minutes after the start with no check-in (for at most 6 hours, never after the shift).
    if p_at >= r.shift_start + interval '10 minutes' and p_at < least(r.shift_end, r.shift_start + interval '6 hours') then
      perform private.enqueue_notification(r.employee_id, 'late_warning',
        jsonb_build_object('shift_start', r.shift_start, 'grace_end', r.grace_end, 'date', r.shift_date),
        format('late_warning:%s:%s', r.employee_id, extract(epoch from r.shift_start)::bigint));
    end if;
  end loop;

  -- 20 minutes before the check-out window closes: checked in, not out yet.
  for r in
    select a.* from public.attendance_days a join public.employees e on e.id = a.employee_id
    where a.shift_date >= (p_at at time zone 'Asia/Kuwait')::date - 4 and a.departure = 'pending' and a.check_in_at is not null and a.check_out_at is null
      and a.checkout_closes > p_at and a.checkout_closes <= p_at + interval '20 minutes'
      and e.is_active and e.user_id is not null
  loop
    perform private.enqueue_notification(r.employee_id, 'checkout_reminder',
      jsonb_build_object('shift_start', r.shift_start, 'checkout_closes', r.checkout_closes, 'date', r.shift_date),
      format('checkout_reminder:%s:%s', r.employee_id, extract(epoch from r.shift_start)::bigint));
  end loop;

  -- Missing check-out (window closed in the last 6 hours): the employee ...
  for r in
    select a.* from public.attendance_days a join public.employees e on e.id = a.employee_id
    where a.shift_date >= (p_at at time zone 'Asia/Kuwait')::date - 4 and a.departure = 'missing'
      and a.checkout_closes > p_at - interval '6 hours' and a.checkout_closes <= p_at
      and e.is_active and e.user_id is not null
  loop
    perform private.enqueue_notification(r.employee_id, 'missing_checkout',
      jsonb_build_object('shift_start', r.shift_start, 'date', r.shift_date),
      format('missing_checkout:%s:%s', r.employee_id, extract(epoch from r.shift_start)::bigint));
  end loop;

  -- ===== Supervisor: one notification per supervisor and shift, listing the employees =====
  for r in
    with subj as (
      -- not in after the grace period (shift still running, grace ended in the last 6 hours)
      select 'sup_not_in'::text as kind, s.employee_id, s.shift_date, s.shift_start
      from private.notify_shifts(p_at - interval '7 hours', p_at) s
      left join public.attendance_days a on a.employee_id = s.employee_id and a.shift_start = s.shift_start
      where a.check_in_at is null and s.grace_end <= p_at and s.grace_end > p_at - interval '6 hours' and p_at < s.shift_end
        and not private.notify_excused(s.employee_id, s.shift_date)
      union all
      -- absent: shift over with no check-in. 20 minutes after the end, so the 10-minute finalize job has run.
      select 'sup_absent', a.employee_id, a.shift_date, a.shift_start
      from public.attendance_days a
      where a.shift_date >= (p_at at time zone 'Asia/Kuwait')::date - 4 and a.arrival = 'absent' and a.shift_end <= p_at - interval '20 minutes' and a.shift_end > p_at - interval '6 hours'
        and not private.notify_excused(a.employee_id, a.shift_date)
      union all
      select 'sup_missing_checkout', a.employee_id, a.shift_date, a.shift_start
      from public.attendance_days a
      where a.shift_date >= (p_at at time zone 'Asia/Kuwait')::date - 4 and a.departure = 'missing'
        and a.checkout_closes > p_at - interval '6 hours' and a.checkout_closes <= p_at
    ),
    tagged as (
      select x.*, private.notify_supervisor_of(x.employee_id) as sup, e.file_number, e.full_name_ar, e.full_name_en
      from subj x join public.employees e on e.id = x.employee_id and e.is_active
    )
    select t.kind, t.sup, t.shift_date, t.shift_start, count(*)::integer as n,
           (array_agg(t.full_name_ar order by t.file_number))[1:5] as names_ar,
           (array_agg(t.full_name_en order by t.file_number))[1:5] as names_en,
           jsonb_agg(jsonb_build_object('id', t.employee_id, 'file_number', t.file_number,
                     'name_ar', t.full_name_ar, 'name_en', t.full_name_en) order by t.file_number) as employees
    from tagged t where t.sup is not null
    group by t.kind, t.sup, t.shift_date, t.shift_start
  loop
    perform private.enqueue_notification(r.sup, r.kind,
      jsonb_build_object('shift_start', r.shift_start, 'date', r.shift_date, 'count', r.n,
        'names_ar', array_to_string(r.names_ar, '، ') || case when r.n > 5 then format(' و%s غيرهم', r.n - 5) else '' end,
        'names_en', array_to_string(r.names_en, ', ') || case when r.n > 5 then format(' and %s more', r.n - 5) else '' end,
        'employees', case when jsonb_array_length(r.employees) > 50
                          then (select jsonb_agg(v) from jsonb_array_elements(r.employees) with ordinality j(v, i) where i <= 50)
                          else r.employees end),
      format('%s:%s:%s', r.kind, r.sup, extract(epoch from r.shift_start)::bigint));
  end loop;

  -- Repeated failed verification: 3+ punches rejected for verification since the last accepted one (12 h).
  -- One notification per streak (keyed by the streak's first rejected punch).
  for r in
    with last_ok as (
      select p.employee_id, max(p.punched_at) as at from public.attendance_punches p
      where p.punched_at > p_at - interval '12 hours' and p.result = 'accepted' group by p.employee_id
    ),
    fails as (
      select p.employee_id, p.id, p.punched_at from public.attendance_punches p
      left join last_ok o on o.employee_id = p.employee_id
      where p.punched_at > p_at - interval '12 hours' and p.punched_at <= p_at and p.result = 'rejected'
        and p.reject_reason in ('biometric_failed', 'liveness_failed', 'face_mismatch', 'not_enrolled', 'signature_invalid')
        and (o.at is null or p.punched_at > o.at)
    )
    select f.employee_id, (array_agg(f.id order by f.punched_at))[1] as first_id, count(*)::integer as n,
           private.notify_supervisor_of(f.employee_id) as sup
    from fails f group by f.employee_id having count(*) >= 3
  loop
    continue when r.sup is null;
    perform private.enqueue_notification(r.sup, 'sup_failed_verification',
      (select jsonb_build_object('employee_id', e.id, 'file_number', e.file_number, 'name_ar', e.full_name_ar,
              'name_en', e.full_name_en, 'count', r.n)
       from public.employees e where e.id = r.employee_id),
      format('sup_failed_verification:%s', r.first_id));
  end loop;

  -- ===== Events, read by timestamp (last 3 days) =====
  -- A decision on my request.
  for r in
    select a.id, a.stage, a.decision, a.note, rq.id as request_id, rq.employee_id, rq.request_type, rq.shift_date,
           rq.leave_to, rq.leave_type
    from public.request_approvals a join public.requests rq on rq.id = a.request_id
    where a.decided_at > v_since and private.notify_can_receive(rq.employee_id)
  loop
    perform private.enqueue_notification(r.employee_id, 'request_decided',
      jsonb_build_object('request_id', r.request_id, 'request_type', r.request_type, 'stage', r.stage,
        'decision', r.decision,
        'status', case when r.decision = 'rejected' then 'rejected' when r.stage = 'hr' then 'approved' else 'pending_hr' end,
        'date', r.shift_date, 'to', r.leave_to, 'leave_type', r.leave_type, 'note', r.note),
      format('request_decided:%s', r.id));
  end loop;

  -- The next approver: a new request (supervisor stage) or one the supervisor approved (HR stage).
  for r in
    select rq.id, rq.status, rq.request_type, rq.shift_date, rq.leave_to, rq.leave_type,
           e.full_name_ar, e.full_name_en, e.file_number, x.id as approver
    from public.requests rq
    join public.employees e on e.id = rq.employee_id
    join public.employees x on x.is_active and x.user_id is not null and x.role in ('supervisor', 'hr', 'admin')
    where rq.status in ('pending_supervisor', 'pending_hr')
      and greatest(rq.created_at, coalesce((select max(a.decided_at) from public.request_approvals a where a.request_id = rq.id),
                                           rq.created_at)) > v_since
      and private.can_decide(x.id, rq.id)
  loop
    perform private.enqueue_notification(r.approver, 'request_to_approve',
      jsonb_build_object('request_id', r.id, 'request_type', r.request_type, 'stage',
        case when r.status = 'pending_supervisor' then 'supervisor' else 'hr' end,
        'date', r.shift_date, 'to', r.leave_to, 'leave_type', r.leave_type,
        'name_ar', r.full_name_ar, 'name_en', r.full_name_en, 'file_number', r.file_number),
      format('request_to_approve:%s:%s:%s', r.id, r.status, r.approver));
  end loop;

  -- Leave recorded (by HR / the agents). A leave from my own approved app request is already told by request_decided.
  for r in
    select l.* from public.leaves l
    where l.created_at > v_since and coalesce(l.source, '') <> 'طلب من التطبيق' and private.notify_can_receive(l.employee_id)
  loop
    perform private.enqueue_notification(r.employee_id, 'leave_recorded',
      jsonb_build_object('leave_id', r.id, 'type', r.leave_type, 'from', r.from_date, 'to', r.to_date, 'source', r.source),
      format('leave_recorded:%s', r.id));
  end loop;

  for r in
    select p.* from public.penalties p where p.created_at > v_since and private.notify_can_receive(p.employee_id)
  loop
    perform private.enqueue_notification(r.employee_id, 'penalty_recorded',
      jsonb_build_object('penalty_id', r.id, 'type', r.penalty_type, 'date', r.penalty_date, 'reason', r.reason),
      format('penalty_recorded:%s', r.id));
  end loop;

  -- The bonus list is out (locked; a locked row never changes again).
  for r in
    select b.* from public.bonus_lists b
    where b.status = 'مقفل' and b.updated_at > v_since and b.employee_id is not null and private.notify_can_receive(b.employee_id)
  loop
    perform private.enqueue_notification(r.employee_id, 'bonus_list',
      jsonb_build_object('month', r.month, 'list_kind', r.kind, 'eligibility', r.eligibility, 'reason', r.reason),
      format('bonus_list:%s', r.id));
  end loop;
end;
$$;

-- The cron job: produce, close what cannot be pushed, then wake the sender if there is work.
create function private.notify_run(p_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_kicked boolean := false;
begin
  perform private.notify_produce(p_at);
  select coalesce(jsonb_object_agg(kind, n), '{}') into v_new
  from (select kind, count(*) as n from public.notifications where created_at = now() group by kind) x;
  perform private.push_housekeeping();
  if exists (select 1 from public.notifications where push_status = 'pending' and next_attempt_at <= now()) then
    v_kicked := private.push_kick();
  end if;
  return jsonb_build_object('new', v_new, 'kicked', v_kicked);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. For the send-push edge function (service role only)
-- ---------------------------------------------------------------------------
create function public.push_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_secret is not null and length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'send_push_secret'
      and extensions.digest(s.decrypted_secret, 'sha256') = extensions.digest(p_secret, 'sha256')), false)
$$;

-- Take up to p_limit due rows (a 5-minute lease so two runs never send the same row).
create function public.push_claim(p_limit integer default 100)
returns table (id uuid, kind text, priority text, title_ar text, title_en text, body_ar text, body_en text,
               data jsonb, tokens jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.push_housekeeping();
  return query
  with c as (
    select n.id from public.notifications n
    where n.push_status = 'pending' and n.next_attempt_at <= now()
    order by (n.priority = 'high') desc, n.created_at
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  ),
  u as (
    update public.notifications n
    set push_attempts = n.push_attempts + 1, next_attempt_at = now() + interval '5 minutes'
    from c where n.id = c.id
    returning n.*
  )
  select u.id, u.kind, u.priority, u.title_ar, u.title_en, u.body_ar, u.body_en, u.data,
         coalesce((select jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform, 'lang', t.lang))
                   from public.push_tokens t where t.employee_id = u.employee_id), '[]'::jsonb)
  from u;
end;
$$;

-- Results: [{id, status: sent | retry | failed | not_configured | no_token, error}] and tokens FCM refused.
create function public.push_report(p_results jsonb, p_invalid_tokens text[] default '{}')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.push_tokens where token = any (coalesce(p_invalid_tokens, '{}'));
  update public.notifications x set
    push_status = case
      when r.status in ('sent', 'failed', 'not_configured', 'no_token') then r.status
      when r.status = 'retry' and x.push_attempts < 5 then 'pending'
      else 'failed' end,
    push_error = left(r.error, 500),
    pushed_at = case when r.status = 'sent' then now() else x.pushed_at end,
    next_attempt_at = case when r.status = 'retry'
      then now() + make_interval(mins => (2 ^ least(x.push_attempts, 6))::integer) else x.next_attempt_at end
  from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as r(id uuid, status text, error text)
  where x.id = r.id and x.push_status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. For the app (signed-in employee)
-- ---------------------------------------------------------------------------
create function public.register_push_token(p_token text, p_platform text, p_lang text default 'ar')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 or p_platform not in ('android', 'ios') then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  -- A phone signed in by someone else now belongs to me (one token = one person).
  insert into public.push_tokens (token, employee_id, platform, lang)
  values (p_token, v_me, p_platform, case when p_lang = 'en' then 'en' else 'ar' end)
  on conflict (token) do update set employee_id = excluded.employee_id, platform = excluded.platform,
    lang = excluded.lang, updated_at = now();
  -- At most 5 phones per person (the newest).
  delete from public.push_tokens t
  where t.employee_id = v_me and t.token in (
    select k.token from public.push_tokens k where k.employee_id = v_me order by k.updated_at desc offset 5);
end;
$$;

create function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and employee_id = private.current_employee_id()
$$;

drop function public.my_notifications(integer);
create function public.my_notifications(p_limit integer default 40)
returns table (id uuid, kind text, at timestamptz, data jsonb, read_at timestamptz,
               title_ar text, title_en text, body_ar text, body_en text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
  select n.id, n.kind, n.created_at, n.data, n.read_at, n.title_ar, n.title_en, n.body_ar, n.body_en
  from public.notifications n
  where n.employee_id = v_me and n.created_at > now() - interval '60 days'
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;

-- Mark mine as read: the given ids, or all of them when p_ids is null. Returns how many changed.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  n integer;
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.notifications set read_at = now()
  where employee_id = v_me and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications
  where employee_id = private.current_employee_id() and read_at is null and created_at > now() - interval '60 days'
$$;

-- ---------------------------------------------------------------------------
-- 9. History: the old read-only list (last 60 days) becomes rows, never pushed. Same dedupe keys as the
--    producers, so these events are not sent again. Older than 3 days = already read.
-- ---------------------------------------------------------------------------
create function private.notify_backfill()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '60 days';
  n integer;
begin
  with src as (
    select rq.employee_id, 'request_decided'::text as kind, a.decided_at as at, 'request_decided:' || a.id as key,
           jsonb_build_object('request_id', rq.id, 'request_type', rq.request_type, 'stage', a.stage, 'decision', a.decision,
             'status', case when a.decision = 'rejected' then 'rejected' when a.stage = 'hr' then 'approved' else 'pending_hr' end,
             'date', rq.shift_date, 'to', rq.leave_to, 'leave_type', rq.leave_type, 'note', a.note) as data
    from public.request_approvals a join public.requests rq on rq.id = a.request_id where a.decided_at > v_since
    union all
    select d.employee_id, 'late', d.shift_start, 'late:' || d.id,
           jsonb_build_object('date', d.shift_date, 'minutes', d.late_minutes)
    from public.attendance_days d where d.arrival = 'late' and d.shift_start > v_since
    union all
    select l.employee_id, 'leave_recorded', l.created_at, 'leave_recorded:' || l.id,
           jsonb_build_object('leave_id', l.id, 'type', l.leave_type, 'from', l.from_date, 'to', l.to_date, 'source', l.source)
    from public.leaves l where l.created_at > v_since and coalesce(l.source, '') <> 'طلب من التطبيق'
    union all
    select p.employee_id, 'penalty_recorded', p.created_at, 'penalty_recorded:' || p.id,
           jsonb_build_object('penalty_id', p.id, 'type', p.penalty_type, 'date', p.penalty_date, 'reason', p.reason)
    from public.penalties p where p.created_at > v_since
    union all
    select b.employee_id, 'bonus_list', b.updated_at, 'bonus_list:' || b.id,
           jsonb_build_object('month', b.month, 'list_kind', b.kind, 'eligibility', b.eligibility, 'reason', b.reason)
    from public.bonus_lists b where b.status = 'مقفل' and b.updated_at > v_since and b.employee_id is not null
  )
  insert into public.notifications (employee_id, kind, title_ar, title_en, body_ar, body_en, data, dedupe_key,
                                    push_status, created_at, read_at)
  select s.employee_id, s.kind, t.title_ar, t.title_en, nullif(t.body_ar, ''), nullif(t.body_en, ''), s.data, s.key,
         'skipped', s.at, case when s.at < now() - interval '3 days' then now() end
  from src s
  join public.employees e on e.id = s.employee_id and e.user_id is not null
  cross join lateral private.notification_text(s.kind, s.data) t
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
select private.notify_backfill();

-- ---------------------------------------------------------------------------
-- 10. Permissions and the job
-- ---------------------------------------------------------------------------
revoke all on function private.kw_hm(timestamptz), private.type_en(text), private.request_label(text, text, boolean),
  private.range_text(text, text, boolean), private.notification_text(text, jsonb), private.push_housekeeping(),
  private.push_kick(), private.enqueue_notification(uuid, text, jsonb, text, text),
  private.notify_shifts(timestamptz, timestamptz), private.notify_can_receive(uuid), private.notify_supervisor_of(uuid),
  private.notify_excused(uuid, date), private.notify_produce(timestamptz), private.notify_run(timestamptz),
  private.notify_backfill()
  from public, anon, authenticated;

revoke all on function public.push_secret_ok(text), public.push_claim(integer), public.push_report(jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.push_secret_ok(text), public.push_claim(integer), public.push_report(jsonb, text[])
  to service_role;

revoke all on function public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.my_notifications(integer), public.mark_notifications_read(uuid[]), public.unread_notification_count()
  from public, anon;
grant execute on function public.register_push_token(text, text, text), public.unregister_push_token(text),
  public.my_notifications(integer), public.mark_notifications_read(uuid[]), public.unread_notification_count()
  to authenticated;

select cron.schedule('notify-run', '1-59/2 * * * *', $job$select private.notify_run(now())$job$);
