-- =============================================================================
-- Sanad bonus module (merged from the Notion-based agents project).
-- Adds: employee HR fields, leaves, penalties, bonus lists, agent log,
-- agent access by header token, and attendance summary for the bonus period.
-- Rules: agents never delete; employees read only their own rows; staff read all.
-- =============================================================================

-- 1) HR fields on employees ----------------------------------------------------
alter table public.employees
  add column if not exists job_title text,
  add column if not exists hire_date date,
  add column if not exists employment_status text not null default 'على رأس العمل'
    check (employment_status in ('على رأس العمل', 'في إجازة', 'منقول', 'منتهي الخدمة'));

-- 2) Agent access ---------------------------------------------------------------
-- Agents call PostgREST with the publishable key plus header `x-agent-token`.
-- Only the SHA-256 of each token is stored. A token maps to one agent name.
create table private.agent_tokens (
  token_hash text primary key,
  agent text not null,
  created_at timestamptz not null default now()
);

create function private.current_agent()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.agent
  from private.agent_tokens t
  where t.token_hash = encode(
    extensions.digest(
      coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-agent-token', ''),
      'sha256'),
    'hex')
$$;

create function private.is_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_agent() is not null
$$;

grant usage on schema private to anon, authenticated;
revoke execute on function private.current_agent(), private.is_agent() from public;
grant execute on function private.current_agent(), private.is_agent() to anon, authenticated;

-- Agents may read the organisation data they need.
create policy "agents read employees" on public.employees
  for select to anon using ((select private.is_agent()));
create policy "agents read departments" on public.departments
  for select to anon using ((select private.is_agent()));
create policy "agents read attendance" on public.attendance_days
  for select to anon using ((select private.is_agent()));
grant select on public.employees, public.departments, public.attendance_days to anon;

-- 3) Leaves ---------------------------------------------------------------------
create table public.leaves (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type text not null check (leave_type in
    ('إجازة دورية', 'إجازة مرضية', 'إجازة طارئة', 'إجازة بدون راتب', 'غياب', 'تأخير')),
  from_date date not null,
  to_date date,
  return_recorded boolean not null default false,
  source text,
  note text,
  created_by text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (to_date is null or to_date >= from_date)
);
create index leaves_employee_idx on public.leaves (employee_id, from_date);

-- 4) Penalties ------------------------------------------------------------------
create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  penalty_type text not null check (penalty_type in ('إنذار', 'لفت نظر', 'خصم', 'إيقاف')),
  penalty_date date not null,
  reason text,
  created_by text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index penalties_employee_idx on public.penalties (employee_id, penalty_date);

-- 5) Bonus lists (one row per employee per list) --------------------------------
create table public.bonus_lists (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  kind text not null default 'شهري' check (kind in ('شهري', 'سنوي')),
  file_number integer not null,
  employee_id uuid references public.employees (id) on delete set null,
  full_name_ar text,
  department text,
  eligibility text check (eligibility in ('مستحق', 'غير مستحق')),
  reason text,
  conflict text not null default '',
  leave_days integer,
  late_count integer,
  status text not null default 'مسودة' check (status in ('مسودة', 'مقفل')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, kind, file_number)
);
create index bonus_lists_employee_idx on public.bonus_lists (employee_id);
create trigger set_updated_at before update on public.bonus_lists
  for each row execute function private.set_updated_at();

-- A locked list can never change again.
create function private.bonus_lists_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'bonus list rows are never deleted';
  end if;
  if old.status = 'مقفل' then
    raise exception 'list % is locked', old.month;
  end if;
  return new;
end;
$$;
create trigger bonus_lists_guard before update or delete on public.bonus_lists
  for each row execute function private.bonus_lists_guard();

-- 6) Agent log --------------------------------------------------------------------
create table public.agent_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  action text not null,
  agent text not null,
  result text,
  reason text,
  file_number integer,
  employee_id uuid references public.employees (id) on delete set null,
  is_demo boolean not null default false
);
create index agent_log_action_idx on public.agent_log (action);
create index agent_log_file_idx on public.agent_log (file_number);

-- 7) RLS ----------------------------------------------------------------------------
alter table public.leaves enable row level security;
alter table public.penalties enable row level security;
alter table public.bonus_lists enable row level security;
alter table public.agent_log enable row level security;

-- Employees read their own rows; staff read all.
create policy "own or staff read leaves" on public.leaves for select to authenticated
  using (employee_id = (select private.current_employee_id()) or (select private.is_staff()));
create policy "own or staff read penalties" on public.penalties for select to authenticated
  using (employee_id = (select private.current_employee_id()) or (select private.is_staff()));
create policy "own or staff read bonus" on public.bonus_lists for select to authenticated
  using (employee_id = (select private.current_employee_id()) or (select private.is_staff()));
create policy "hr admin read log" on public.agent_log for select to authenticated
  using ((select private.has_role(array['hr', 'admin']::public.app_role[])));

-- HR / admin write leaves and penalties from the panel (no delete).
create policy "hr admin insert leaves" on public.leaves for insert to authenticated
  with check ((select private.has_role(array['hr', 'admin']::public.app_role[])));
create policy "hr admin update leaves" on public.leaves for update to authenticated
  using ((select private.has_role(array['hr', 'admin']::public.app_role[])))
  with check ((select private.has_role(array['hr', 'admin']::public.app_role[])));
create policy "hr admin insert penalties" on public.penalties for insert to authenticated
  with check ((select private.has_role(array['hr', 'admin']::public.app_role[])));

-- Agents: read everything in the module, insert and update, never delete.
create policy "agents read leaves" on public.leaves for select to anon using ((select private.is_agent()));
create policy "agents insert leaves" on public.leaves for insert to anon with check ((select private.is_agent()));
create policy "agents read penalties" on public.penalties for select to anon using ((select private.is_agent()));
create policy "agents insert penalties" on public.penalties for insert to anon with check ((select private.is_agent()));
create policy "agents read bonus" on public.bonus_lists for select to anon using ((select private.is_agent()));
create policy "agents insert bonus" on public.bonus_lists for insert to anon with check ((select private.is_agent()));
create policy "agents update bonus" on public.bonus_lists for update to anon
  using ((select private.is_agent())) with check ((select private.is_agent()));
create policy "agents read log" on public.agent_log for select to anon using ((select private.is_agent()));
create policy "agents insert log" on public.agent_log for insert to anon with check ((select private.is_agent()));

grant select, insert on public.leaves, public.penalties, public.agent_log to anon;
grant select, insert, update on public.bonus_lists to anon;
grant select on public.leaves, public.penalties, public.bonus_lists, public.agent_log to authenticated;
grant insert, update on public.leaves to authenticated;
grant insert on public.penalties to authenticated;
revoke delete on public.leaves, public.penalties, public.bonus_lists, public.agent_log from anon, authenticated;

-- 8) Agent RPCs for employee changes (agents have no direct write on employees) -------
create function public.agent_hire(
  p_file_number integer, p_name_ar text, p_name_en text, p_job_title text,
  p_department text, p_hire_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_dept uuid; v_id uuid;
begin
  if private.current_agent() is distinct from 'affairs' then raise exception 'not allowed'; end if;
  select id into v_dept from public.departments where name_ar = p_department;
  if v_dept is null then raise exception 'unknown department %', p_department; end if;
  insert into public.employees (file_number, full_name_ar, full_name_en, job_title, department_id,
                                hire_date, employment_status, is_demo)
  values (p_file_number, p_name_ar, coalesce(nullif(p_name_en, ''), p_name_ar), p_job_title, v_dept,
          p_hire_date, 'على رأس العمل', true)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.agent_set_status(p_file_number integer, p_status text, p_department text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_dept uuid;
begin
  if coalesce(private.current_agent(), '') not in ('affairs', 'leaves') then raise exception 'not allowed'; end if;
  if private.current_agent() = 'leaves' and p_status <> 'في إجازة' then raise exception 'not allowed'; end if;
  if p_department is not null then
    select id into v_dept from public.departments where name_ar = p_department;
    if v_dept is null then raise exception 'unknown department %', p_department; end if;
  end if;
  update public.employees
     set employment_status = p_status,
         is_active = p_status in ('على رأس العمل', 'في إجازة'),
         department_id = coalesce(v_dept, department_id)
   where file_number = p_file_number;
  if not found then raise exception 'unknown file %', p_file_number; end if;
end;
$$;

-- 9) Attendance summary for a bonus period (one row per employee) -------------------
create function public.bonus_attendance(p_from date, p_to date)
returns table (employee_id uuid, file_number integer, shifts integer, present integer,
               late integer, absent integer, late_dates date[])
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.file_number,
         count(a.*)::integer,
         count(*) filter (where a.arrival in ('on_time', 'late'))::integer,
         count(*) filter (where a.arrival = 'late')::integer,
         count(*) filter (where a.arrival = 'absent')::integer,
         coalesce(array_agg(a.shift_date order by a.shift_date) filter (where a.arrival = 'late'), '{}')
  from public.employees e
  join public.attendance_days a on a.employee_id = e.id
  where a.shift_date between p_from and p_to
    and (private.is_agent() or private.is_staff())
  group by e.id, e.file_number
$$;

revoke execute on function public.agent_hire(integer, text, text, text, text, date) from public;
revoke execute on function public.agent_set_status(integer, text, text) from public;
revoke execute on function public.bonus_attendance(date, date) from public;
grant execute on function public.agent_hire(integer, text, text, text, text, date) to anon;
grant execute on function public.agent_set_status(integer, text, text) to anon;
grant execute on function public.bonus_attendance(date, date) to anon, authenticated;
