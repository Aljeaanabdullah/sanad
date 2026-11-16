-- Sanad S4 (PRD 18.1, version 1.12): log of «اسأل سند» questions sent to the AI assistant.
-- The relay (sanad-ask on the company server) writes one row per question with the employee's own
-- session, through log_assistant_question(). Only the system admin reads the log.

create table public.assistant_log (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees (id) on delete cascade,
  asked_at timestamptz not null default now(),
  question text not null check (char_length(question) between 1 and 500),
  answer text check (answer is null or char_length(answer) <= 4000),
  -- answered = the agent replied; the others are the relay's refusal / failure keys.
  status text not null check (status in ('answered', 'bad', 'limit', 'nodata', 'busy', 'error')),
  model text check (model is null or char_length(model) <= 100)
);

create index assistant_log_employee_asked on public.assistant_log (employee_id, asked_at desc);
create index assistant_log_asked on public.assistant_log (asked_at desc);

alter table public.assistant_log enable row level security;

-- Read: system admin only. No insert / update / delete policies: rows come only from the function below.
create policy assistant_log_admin_read on public.assistant_log
  for select to authenticated
  using (private.has_role(array['admin']::public.app_role[]));

revoke all on public.assistant_log from anon, authenticated;
grant select on public.assistant_log to authenticated;

-- Writes one row for the signed-in employee (never for anyone else).
create function public.log_assistant_question(
  p_question text,
  p_answer text,
  p_status text,
  p_model text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_id bigint;
begin
  if v_me is null then
    raise exception 'not_an_employee' using errcode = '42501';
  end if;
  insert into public.assistant_log (employee_id, question, answer, status, model)
  values (v_me, left(p_question, 500), left(p_answer, 4000), p_status, left(p_model, 100))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_assistant_question(text, text, text, text) from public, anon;
grant execute on function public.log_assistant_question(text, text, text, text) to authenticated;
