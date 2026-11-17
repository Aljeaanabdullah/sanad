-- Sanad phase S8: صندوق الأفكار (ideas box). Owner decisions of 2026-11-17.
--
-- Flow: an employee submits (title, description, category, optional photo, named or anonymous)
--   -> new (HR reviews within 2 days; review only blocks insults, personal attacks or naming colleagues)
--   -> published, or review_rejected (reason sent to the author; never public)
--   -> 50 «أؤيد» votes -> awaiting_response automatically (HR must respond within 14 days; overdue = alert to admins)
--   -> under_study -> accepted -> in_progress -> implemented, or rejected (reason required). HR responds.
-- Author and every voter are notified on each status change (Phase 9 queue: private.enqueue_notification).
-- Limit: 3 ideas per employee per calendar month (Kuwait time). Never linked to the bonus.
--
-- Anonymity is enforced HERE, not in the apps:
--   * ideas / idea_votes / idea_events have RLS on and NO policies, and no table privileges for anon or
--     authenticated: no client role (employee, supervisor, HR, admin) reads them directly. Every read goes
--     through the SECURITY DEFINER functions below, which return the author only for named ideas.
--   * The system admin can reveal an anonymous author with idea_reveal_author(id, reason) only; each reveal
--     writes an audit_log row (who, which idea, why). The revealed identity is NOT copied into the log.
--   * Audit rows of ideas never carry author_id, and the actor of an anonymous submission is not recorded.
--   * Idea photos: random file names, and the uploader (storage.objects.owner) is cleared when the photo is
--     attached, so storage metadata does not name the author either.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Types and rules
-- ---------------------------------------------------------------------------
create type public.idea_category as enum ('work_environment', 'savings', 'safety', 'services', 'other');
create type public.idea_status as enum (
  'new', 'published', 'awaiting_response', 'under_study', 'accepted', 'in_progress', 'implemented',
  'rejected', 'review_rejected');

-- One place for the numbers the owner chose.
create function private.idea_rules()
returns table (vote_threshold integer, response_days integer, review_days integer, monthly_limit integer)
language sql immutable set search_path = '' as $$
  select 50, 14, 2, 3
$$;

-- Order of the forward path (used to refuse going backwards).
create function private.idea_status_rank(p public.idea_status) returns integer
language sql immutable set search_path = '' as $$
  select case p
    when 'new' then 0 when 'published' then 1 when 'awaiting_response' then 2 when 'under_study' then 3
    when 'accepted' then 4 when 'in_progress' then 5 when 'implemented' then 6
    when 'rejected' then 7 when 'review_rejected' then 7 end
$$;

-- Statuses every employee can see.
create function private.idea_is_public(p public.idea_status) returns boolean
language sql immutable set search_path = '' as $$
  select p not in ('new', 'review_rejected')
$$;

-- Statuses that still accept votes.
create function private.idea_open_for_votes(p public.idea_status) returns boolean
language sql immutable set search_path = '' as $$
  select p in ('published', 'awaiting_response', 'under_study', 'accepted', 'in_progress')
$$;

create function private.idea_status_label(p public.idea_status, p_en boolean) returns text
language sql immutable set search_path = '' as $$
  select case when p_en then case p
      when 'new' then 'Under review' when 'published' then 'Published' when 'awaiting_response' then 'Awaiting management reply'
      when 'under_study' then 'Under study' when 'accepted' then 'Accepted' when 'in_progress' then 'In progress'
      when 'implemented' then 'Implemented' when 'rejected' then 'Rejected' when 'review_rejected' then 'Not published' end
    else case p
      when 'new' then 'جديدة' when 'published' then 'منشورة' when 'awaiting_response' then 'بانتظار رد الإدارة'
      when 'under_study' then 'قيد الدراسة' when 'accepted' then 'مقبولة' when 'in_progress' then 'قيد التنفيذ'
      when 'implemented' then 'نُفّذت' when 'rejected' then 'مرفوضة' when 'review_rejected' then 'لم تُنشر' end
    end
$$;

-- Arabic-aware text for similarity: one form of alef / yaa / taa marbuta, no diacritics or tatweel, lower case.
create function private.idea_norm(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'أإآٱىةـ', 'اااايه'),
    '[ً-ٰٟ]|[^[:alnum:][:space:]]', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables (RLS on, no policies: only the functions below read or write them)
-- ---------------------------------------------------------------------------
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  -- Null after the author's record is deleted (termination); the idea itself stays.
  author_id uuid references public.employees (id) on delete set null,
  is_anonymous boolean not null default false,
  title text not null check (char_length(btrim(title)) between 5 and 120),
  description text not null check (char_length(btrim(description)) between 20 and 2000),
  category public.idea_category not null,
  -- Object name in the idea-photos bucket (random uuid + extension, no folder).
  photo_path text unique check (photo_path ~ '^[0-9a-f-]{36}\.(jpg|webp)$'),
  status public.idea_status not null default 'new',
  vote_count integer not null default 0 check (vote_count >= 0),
  search_text text generated always as (private.idea_norm(title || ' ' || description)) stored,
  created_at timestamptz not null default now(),
  review_due_at timestamptz not null default now() + interval '2 days',
  reviewed_at timestamptz,
  published_at timestamptz,
  -- Set when the idea reaches the vote threshold; HR must respond before response_due_at.
  threshold_at timestamptz,
  response_due_at timestamptz,
  responded_at timestamptz,
  overdue_alerted_at timestamptz,
  -- Reason of the last rejection (review or management). Required for both.
  reject_reason text,
  updated_at timestamptz not null default now(),
  constraint ideas_reject_reason_check check (
    status not in ('rejected', 'review_rejected') or char_length(btrim(coalesce(reject_reason, ''))) >= 3)
);
create index ideas_author_created_idx on public.ideas (author_id, created_at desc);
create index ideas_status_idx on public.ideas (status, published_at desc);
create index ideas_votes_idx on public.ideas (vote_count desc, published_at desc) where status not in ('new', 'review_rejected');
create index ideas_due_idx on public.ideas (response_due_at) where status = 'awaiting_response';
create index ideas_search_trgm_idx on public.ideas using gin (search_text extensions.gin_trgm_ops);

create table public.idea_votes (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, employee_id)
);
create index idea_votes_employee_idx on public.idea_votes (employee_id);

-- Status history for the timeline. actor_id is HR/admin; it is never recorded for the submission.
create table public.idea_events (
  id bigint generated always as identity primary key,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  status public.idea_status not null,
  reason text,
  actor_id uuid references public.employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index idea_events_idea_idx on public.idea_events (idea_id, id);
create index idea_events_actor_idx on public.idea_events (actor_id);

alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;
alter table public.idea_events enable row level security;
revoke all on public.ideas, public.idea_votes, public.idea_events from anon, authenticated;

create trigger set_updated_at before update on public.ideas for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Audit (author never written; anonymous submissions have no actor)
-- ---------------------------------------------------------------------------
create function private.audit_idea_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ideas := coalesce(new, old);
  strip text[] := array['author_id', 'search_text', 'description'];
begin
  -- Only lifecycle changes are logged (votes only move vote_count).
  if tg_op = 'UPDATE' and new.status = old.status and new.photo_path is not distinct from old.photo_path then
    return new;
  end if;
  insert into public.audit_log (actor_user_id, action, table_name, record_id, old_data, new_data)
  values (
    case when tg_op = 'INSERT' and v_row.is_anonymous then null else auth.uid() end,
    lower(tg_op), 'ideas', v_row.id::text,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - strip end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - strip end);
  return coalesce(new, old);
end;
$$;
create trigger audit after insert or update or delete on public.ideas for each row execute function private.audit_idea_change();

-- ---------------------------------------------------------------------------
-- 4. Votes keep vote_count; the threshold moves the idea to awaiting_response
-- ---------------------------------------------------------------------------
create function private.idea_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea public.ideas;
begin
  if tg_op = 'INSERT' then
    update public.ideas set vote_count = vote_count + 1 where id = new.idea_id returning * into v_idea;
    perform private.idea_check_threshold(v_idea.id);
    return new;
  end if;
  -- Withdrawn vote (or a deleted voter). Reaching the threshold is not undone.
  update public.ideas set vote_count = greatest(vote_count - 1, 0) where id = old.idea_id;
  return old;
end;
$$;

-- published + enough votes -> awaiting_response, deadline, notifications. Returns true when it moved.
create function private.idea_check_threshold(p_idea uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ideas;
  r record;
begin
  select * into r from private.idea_rules();
  select * into v from public.ideas where id = p_idea for update;
  if not found or v.status <> 'published' or v.vote_count < r.vote_threshold then
    return false;
  end if;
  update public.ideas set status = 'awaiting_response', threshold_at = now(),
    response_due_at = now() + make_interval(days => r.response_days)
  where id = p_idea;
  insert into public.idea_events (idea_id, status, reason) values (p_idea, 'awaiting_response', null);
  perform private.idea_notify(p_idea, 'awaiting_response', null);
  perform private.idea_notify_staff(p_idea, 'idea_awaiting', array['hr', 'admin']::public.app_role[]);
  return true;
end;
$$;

create trigger vote_count after insert or delete on public.idea_votes for each row execute function private.idea_vote_count();

-- ---------------------------------------------------------------------------
-- 5. Notifications (Phase 9 queue; texts are carried in data, so the push code needs no change)
-- ---------------------------------------------------------------------------
-- Author + every voter, once per idea and status.
create function private.idea_notify(p_idea uuid, p_status public.idea_status, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ideas;
  v_data jsonb;
  n integer := 0;
  r record;
begin
  if to_regprocedure('private.enqueue_notification(uuid,text,jsonb,text,text)') is null then return 0; end if;
  select * into v from public.ideas where id = p_idea;
  if not found then return 0; end if;
  for r in
    select x.employee_id, bool_or(x.is_author) as is_author
    from (
      select v.author_id as employee_id, true as is_author where v.author_id is not null
      union all
      select iv.employee_id, false from public.idea_votes iv where iv.idea_id = p_idea
    ) x
    join public.employees e on e.id = x.employee_id and e.is_active and e.user_id is not null
    group by x.employee_id
  loop
    v_data := jsonb_build_object(
      'idea_id', v.id, 'status', p_status,
      'title_ar', case when r.is_author then 'تحديث على فكرتك' else 'تحديث على فكرة أيّدتها' end,
      'title_en', case when r.is_author then 'An update on your idea' else 'An update on an idea you support' end,
      'body_ar', concat_ws(E'\n', format('«%s»: %s', left(v.title, 80), private.idea_status_label(p_status, false)),
        nullif(btrim(coalesce(p_reason, '')), '')),
      'body_en', concat_ws(E'\n', format('"%s": %s', left(v.title, 80), private.idea_status_label(p_status, true)),
        nullif(btrim(coalesce(p_reason, '')), '')));
    perform private.enqueue_notification(r.employee_id, 'idea_status', v_data,
      format('idea_status:%s:%s:%s', v.id, p_status, r.employee_id));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- HR / admins (threshold reached, overdue). Never says who wrote the idea.
create function private.idea_notify_staff(p_idea uuid, p_kind text, p_roles public.app_role[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ideas;
  n integer := 0;
  r record;
begin
  if to_regprocedure('private.enqueue_notification(uuid,text,jsonb,text,text)') is null then return 0; end if;
  select * into v from public.ideas where id = p_idea;
  if not found then return 0; end if;
  for r in select e.id from public.employees e
           where e.is_active and e.user_id is not null and e.role = any (p_roles) loop
    perform private.enqueue_notification(r.id, p_kind, jsonb_build_object(
      'idea_id', v.id,
      'title_ar', case p_kind when 'idea_overdue' then 'تأخر رد الإدارة على فكرة' else 'فكرة وصلت 50 تأييدًا' end,
      'title_en', case p_kind when 'idea_overdue' then 'Management reply to an idea is overdue' else 'An idea reached 50 supporters' end,
      'body_ar', case p_kind when 'idea_overdue'
        then format('«%s»: انتهت مهلة الرد (14 يومًا).', left(v.title, 80))
        else format('«%s»: يجب الرد خلال 14 يومًا.', left(v.title, 80)) end,
      'body_en', case p_kind when 'idea_overdue'
        then format('"%s": the 14-day reply window has passed.', left(v.title, 80))
        else format('"%s": a reply is due within 14 days.', left(v.title, 80)) end),
      format('%s:%s:%s', p_kind, v.id, r.id),
      case when p_kind = 'idea_overdue' then 'high' else 'normal' end);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Who may see what
-- ---------------------------------------------------------------------------
create function private.is_idea_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(array['hr', 'admin']::public.app_role[])
$$;

-- Visible = public status, or my own idea, or HR / admin.
create function private.idea_visible(p public.ideas) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_employee_id() is not null and (
    private.idea_is_public(p.status) or p.author_id = private.current_employee_id() or private.is_idea_staff())
$$;

-- Photo of an idea the caller can see (storage policy).
create function private.idea_photo_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ideas i where i.photo_path = p_name and private.idea_visible(i))
$$;

-- ---------------------------------------------------------------------------
-- 7. Employee functions
-- ---------------------------------------------------------------------------
-- How many ideas I can still submit this month (Kuwait time).
create function public.idea_quota()
returns table (used integer, monthly_limit integer, remaining integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_limit integer := (select x.monthly_limit from private.idea_rules() x);
  v_used integer;
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select count(*) into v_used from public.ideas i
  where i.author_id = v_me
    and i.created_at >= (date_trunc('month', now() at time zone 'Asia/Kuwait') at time zone 'Asia/Kuwait');
  return query select v_used, v_limit, greatest(v_limit - v_used, 0);
end;
$$;

-- Ideas like the one being written (shown before submitting, to vote instead). Public ideas only.
create function public.idea_similar(p_title text, p_description text default '')
returns table (id uuid, title text, category public.idea_category, status public.idea_status, vote_count integer,
               score real, i_voted boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  q text := private.idea_norm(coalesce(p_title, '') || ' ' || coalesce(p_description, ''));
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(q) < 4 then return; end if;
  return query
  select i.id, i.title, i.category, i.status, i.vote_count,
         greatest(extensions.similarity(i.search_text, q), extensions.word_similarity(private.idea_norm(p_title), i.search_text))::real as s,
         exists (select 1 from public.idea_votes v where v.idea_id = i.id and v.employee_id = v_me)
  from public.ideas i
  where private.idea_is_public(i.status) and i.status <> 'rejected'
    and (i.search_text operator(extensions.%) q
         or private.idea_norm(p_title) operator(extensions.<%) i.search_text)
  order by s desc, i.vote_count desc
  limit 5;
end;
$$;

-- Submit. Returns the new id. photo_path: an object I uploaded to idea-photos and that is not used yet.
create function public.idea_submit(p_title text, p_description text, p_category public.idea_category,
                                   p_anonymous boolean default false, p_photo_path text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_id uuid;
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 5 and 120 then raise exception 'idea_title_invalid' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 20 and 2000 then raise exception 'idea_description_invalid' using errcode = '22023'; end if;
  if p_category is null then raise exception 'idea_category_invalid' using errcode = '22023'; end if;
  -- One submission at a time per person, so two quick taps cannot pass the monthly limit.
  perform pg_advisory_xact_lock(hashtextextended('idea_submit:' || v_me, 0));
  if (select q.remaining from public.idea_quota() q) <= 0 then
    raise exception 'idea_monthly_limit' using errcode = 'P0001';
  end if;
  if v_photo is not null then
    if v_photo !~ '^[0-9a-f-]{36}\.(jpg|webp)$' or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'idea-photos' and o.name = v_photo and o.owner_id = auth.uid()::text)
       or exists (select 1 from public.ideas i where i.photo_path = v_photo) then
      raise exception 'idea_photo_invalid' using errcode = '22023';
    end if;
    -- The uploader is no longer recorded on the file (anonymity).
    update storage.objects set owner = null, owner_id = null where bucket_id = 'idea-photos' and name = v_photo;
  end if;
  insert into public.ideas (author_id, is_anonymous, title, description, category, photo_path,
                            review_due_at)
  values (v_me, coalesce(p_anonymous, false), btrim(p_title), btrim(p_description), p_category, v_photo,
          now() + make_interval(days => (select x.review_days from private.idea_rules() x)))
  returning id into v_id;
  insert into public.idea_events (idea_id, status) values (v_id, 'new');
  return v_id;
end;
$$;

-- Support or withdraw support. Returns the new vote count.
create function public.idea_vote(p_idea uuid, p_support boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v public.ideas;
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v from public.ideas where id = p_idea;
  if not found or not private.idea_is_public(v.status) then raise exception 'idea_not_found' using errcode = 'P0002'; end if;
  if not private.idea_open_for_votes(v.status) then raise exception 'idea_voting_closed' using errcode = 'P0001'; end if;
  if v.author_id = v_me then raise exception 'idea_own_vote' using errcode = 'P0001'; end if;
  if coalesce(p_support, true) then
    insert into public.idea_votes (idea_id, employee_id) values (p_idea, v_me) on conflict do nothing;
  else
    delete from public.idea_votes where idea_id = p_idea and employee_id = v_me;
  end if;
  return (select i.vote_count from public.ideas i where i.id = p_idea);
end;
$$;

-- The list. p_scope: all (public ideas) | mine | implemented («أفكار صارت حقيقة»). p_sort: top | new.
create function public.ideas_list(p_scope text default 'all', p_sort text default 'top',
                                  p_category public.idea_category default null, p_limit integer default 50,
                                  p_offset integer default 0)
returns table (id uuid, title text, description text, category public.idea_category, status public.idea_status,
               vote_count integer, i_voted boolean, is_mine boolean, is_anonymous boolean,
               author_name_ar text, author_name_en text, has_photo boolean, created_at timestamptz,
               published_at timestamptz, response_due_at timestamptz, responded_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(p_scope, '') not in ('all', 'mine', 'implemented') then raise exception 'invalid_request' using errcode = '22023'; end if;
  return query
  select i.id, i.title, left(i.description, 280), i.category, i.status, i.vote_count,
         exists (select 1 from public.idea_votes v where v.idea_id = i.id and v.employee_id = v_me),
         i.author_id is not distinct from v_me, i.is_anonymous,
         case when i.is_anonymous then null else e.full_name_ar end,
         case when i.is_anonymous then null else e.full_name_en end,
         i.photo_path is not null, i.created_at, i.published_at, i.response_due_at, i.responded_at, i.updated_at
  from public.ideas i
  left join public.employees e on e.id = i.author_id
  where case p_scope
          when 'mine' then i.author_id = v_me
          when 'implemented' then i.status = 'implemented'
          else private.idea_is_public(i.status) end
    and (p_category is null or i.category = p_category)
  order by
    case when p_sort = 'new' then null else i.vote_count end desc nulls last,
    coalesce(i.published_at, i.created_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One idea with its timeline. Null (no row) when the caller cannot see it.
create function public.idea_get(p_idea uuid)
returns table (id uuid, title text, description text, category public.idea_category, status public.idea_status,
               vote_count integer, vote_threshold integer, i_voted boolean, is_mine boolean, is_anonymous boolean,
               author_name_ar text, author_name_en text, photo_path text, reject_reason text,
               created_at timestamptz, review_due_at timestamptz, published_at timestamptz, threshold_at timestamptz,
               response_due_at timestamptz, responded_at timestamptz, timeline jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := private.current_employee_id();
  v_staff boolean := private.is_idea_staff();
begin
  if v_me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return query
  select i.id, i.title, i.description, i.category, i.status, i.vote_count,
         (select x.vote_threshold from private.idea_rules() x),
         exists (select 1 from public.idea_votes v where v.idea_id = i.id and v.employee_id = v_me),
         i.author_id is not distinct from v_me, i.is_anonymous,
         case when i.is_anonymous then null else e.full_name_ar end,
         case when i.is_anonymous then null else e.full_name_en end,
         i.photo_path, i.reject_reason, i.created_at, i.review_due_at, i.published_at, i.threshold_at,
         i.response_due_at, i.responded_at,
         coalesce((select jsonb_agg(jsonb_build_object(
             'status', ev.status, 'reason', ev.reason, 'at', ev.created_at,
             -- HR / admin see who acted (never the author of a submission: actor is null for it).
             'actor_ar', case when v_staff then a.full_name_ar end,
             'actor_en', case when v_staff then a.full_name_en end) order by ev.id)
           from public.idea_events ev left join public.employees a on a.id = ev.actor_id
           where ev.idea_id = i.id), '[]'::jsonb)
  from public.ideas i
  left join public.employees e on e.id = i.author_id
  where i.id = p_idea and private.idea_visible(i);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. HR / admin functions
-- ---------------------------------------------------------------------------
-- Review before publishing: approve -> published; refuse -> review_rejected with a reason sent to the author.
create function public.idea_review(p_idea uuid, p_approve boolean, p_reason text default null)
returns public.idea_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ideas;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new public.idea_status := case when p_approve then 'published' else 'review_rejected' end;
begin
  if not private.is_idea_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v from public.ideas where id = p_idea for update;
  if not found then raise exception 'idea_not_found' using errcode = 'P0002'; end if;
  if v.status <> 'new' then raise exception 'idea_already_reviewed' using errcode = 'P0001'; end if;
  if not p_approve and char_length(coalesce(v_reason, '')) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if char_length(coalesce(v_reason, '')) > 500 then raise exception 'note_too_long' using errcode = '22023'; end if;
  update public.ideas set status = v_new, reviewed_at = now(),
    published_at = case when p_approve then now() end,
    reject_reason = case when p_approve then null else v_reason end
  where id = p_idea;
  insert into public.idea_events (idea_id, status, reason, actor_id)
  values (p_idea, v_new, case when p_approve then null else v_reason end, private.current_employee_id());
  perform private.idea_notify(p_idea, v_new, case when p_approve then null else v_reason end);
  -- Votes cannot exist before publishing, but keep the rule in one place.
  if p_approve then perform private.idea_check_threshold(p_idea); end if;
  return v_new;
end;
$$;

-- Management reply / progress. Forward only; rejected needs a reason; implemented and rejected are final.
create function public.idea_set_status(p_idea uuid, p_status public.idea_status, p_reason text default null)
returns public.idea_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ideas;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.is_idea_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v from public.ideas where id = p_idea for update;
  if not found then raise exception 'idea_not_found' using errcode = 'P0002'; end if;
  if p_status not in ('under_study', 'accepted', 'in_progress', 'implemented', 'rejected')
     or v.status not in ('published', 'awaiting_response', 'under_study', 'accepted', 'in_progress')
     or (p_status <> 'rejected' and private.idea_status_rank(p_status) <= private.idea_status_rank(v.status)) then
    raise exception 'idea_status_invalid' using errcode = '22023';
  end if;
  if p_status = 'rejected' and char_length(coalesce(v_reason, '')) < 3 then raise exception 'reason_required' using errcode = '22023'; end if;
  if char_length(coalesce(v_reason, '')) > 500 then raise exception 'note_too_long' using errcode = '22023'; end if;
  update public.ideas set status = p_status,
    responded_at = coalesce(responded_at, now()),
    reject_reason = case when p_status = 'rejected' then v_reason else reject_reason end
  where id = p_idea;
  insert into public.idea_events (idea_id, status, reason, actor_id)
  values (p_idea, p_status, v_reason, private.current_employee_id());
  perform private.idea_notify(p_idea, p_status, v_reason);
  return p_status;
end;
$$;

-- The panel list. p_filter: review (new) | threshold (awaiting_response) | overdue | open | all.
create function public.ideas_admin_list(p_filter text default 'all', p_limit integer default 100, p_offset integer default 0)
returns table (id uuid, title text, description text, category public.idea_category, status public.idea_status,
               vote_count integer, is_anonymous boolean, author_name_ar text, author_name_en text, author_file_number integer,
               has_photo boolean, created_at timestamptz, review_due_at timestamptz, published_at timestamptz,
               threshold_at timestamptz, response_due_at timestamptz, responded_at timestamptz, reject_reason text,
               review_overdue boolean, response_overdue boolean, photo_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_idea_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(p_filter, '') not in ('review', 'threshold', 'overdue', 'open', 'all') then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  return query
  select i.id, i.title, i.description, i.category, i.status, i.vote_count, i.is_anonymous,
         case when i.is_anonymous then null else e.full_name_ar end,
         case when i.is_anonymous then null else e.full_name_en end,
         case when i.is_anonymous then null else e.file_number end,
         i.photo_path is not null, i.created_at, i.review_due_at, i.published_at, i.threshold_at,
         i.response_due_at, i.responded_at, i.reject_reason,
         i.status = 'new' and i.review_due_at < now(),
         i.status = 'awaiting_response' and i.response_due_at < now(),
         i.photo_path
  from public.ideas i
  left join public.employees e on e.id = i.author_id
  where case p_filter
          when 'review' then i.status = 'new'
          when 'threshold' then i.status = 'awaiting_response'
          when 'overdue' then (i.status = 'awaiting_response' and i.response_due_at < now())
                           or (i.status = 'new' and i.review_due_at < now())
          when 'open' then i.status in ('published', 'awaiting_response', 'under_study', 'accepted', 'in_progress')
          else true end
  order by
    (i.status = 'awaiting_response' and i.response_due_at < now()) desc,
    case when p_filter = 'review' then i.created_at end asc nulls last,
    case when p_filter = 'threshold' or p_filter = 'overdue' then i.response_due_at end asc nulls last,
    i.vote_count desc, i.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Counts for the panel.
create function public.ideas_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_idea_staff() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'submitted', count(*),
      'implemented', count(*) filter (where status = 'implemented'),
      'waiting_review', count(*) filter (where status = 'new'),
      'awaiting_response', count(*) filter (where status = 'awaiting_response'),
      'overdue', count(*) filter (where status = 'awaiting_response' and response_due_at < now()),
      'rejected', count(*) filter (where status in ('rejected', 'review_rejected')),
      'votes', coalesce(sum(vote_count), 0),
      'by_category', coalesce((
        select jsonb_object_agg(c.category, jsonb_build_object('submitted', c.n, 'implemented', c.done))
        from (select category, count(*) as n, count(*) filter (where status = 'implemented') as done
              from public.ideas group by category) c), '{}'::jsonb))
    from public.ideas);
end;
$$;

-- System admin only: who wrote an anonymous idea (for abuse). Every call is written to audit_log.
create function public.idea_reveal_author(p_idea uuid, p_reason text)
returns table (file_number integer, full_name_ar text, full_name_en text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ideas;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.has_role(array['admin']::public.app_role[]) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into v from public.ideas where id = p_idea;
  if not found then raise exception 'idea_not_found' using errcode = 'P0002'; end if;
  if not v.is_anonymous then raise exception 'idea_not_anonymous' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_reason, '')) < 10 then raise exception 'reason_required' using errcode = '22023'; end if;
  if char_length(v_reason) > 500 then raise exception 'note_too_long' using errcode = '22023'; end if;
  insert into public.audit_log (actor_user_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), 'reveal_author', 'ideas', v.id::text, null,
          jsonb_build_object('idea_id', v.id, 'reason', v_reason, 'title', v.title));
  return query select e.file_number, e.full_name_ar, e.full_name_en from public.employees e where e.id = v.author_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Hourly job: overdue replies alert the admins once; safety net for the threshold
-- ---------------------------------------------------------------------------
create function private.ideas_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_overdue integer := 0;
  v_moved integer := 0;
begin
  for r in select i.id from public.ideas i
           where i.status = 'published' and i.vote_count >= (select x.vote_threshold from private.idea_rules() x) loop
    if private.idea_check_threshold(r.id) then v_moved := v_moved + 1; end if;
  end loop;
  for r in select i.id from public.ideas i
           where i.status = 'awaiting_response' and i.response_due_at < now() and i.overdue_alerted_at is null
           for update skip locked loop
    perform private.idea_notify_staff(r.id, 'idea_overdue', array['admin']::public.app_role[]);
    update public.ideas set overdue_alerted_at = now() where id = r.id;
    v_overdue := v_overdue + 1;
  end loop;
  return jsonb_build_object('threshold', v_moved, 'overdue_alerts', v_overdue);
end;
$$;

select cron.schedule('ideas-tick', '17 * * * *', $job$select private.ideas_tick()$job$);

-- ---------------------------------------------------------------------------
-- 10. Photos: private bucket, random names, readable only with the idea
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-photos', 'idea-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "employees upload idea photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'idea-photos'
    and name ~ '^[0-9a-f-]{36}\.(jpg|webp)$'
    and (select private.current_employee_id()) is not null);

create policy "read idea photos with the idea" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'idea-photos'
    and (owner_id = (select auth.uid())::text or (select private.idea_photo_visible(name))));

-- ---------------------------------------------------------------------------
-- 11. Permissions
-- ---------------------------------------------------------------------------
revoke all on function private.idea_rules(), private.idea_status_rank(public.idea_status),
  private.idea_is_public(public.idea_status), private.idea_open_for_votes(public.idea_status),
  private.idea_status_label(public.idea_status, boolean), private.idea_norm(text), private.audit_idea_change(),
  private.idea_vote_count(), private.idea_check_threshold(uuid), private.idea_notify(uuid, public.idea_status, text),
  private.idea_notify_staff(uuid, text, public.app_role[]), private.is_idea_staff(), private.idea_visible(public.ideas),
  private.idea_photo_visible(text), private.ideas_tick()
  from public, anon, authenticated;
-- The storage policy runs as the caller.
grant execute on function private.idea_photo_visible(text) to authenticated;

revoke all on function public.idea_quota(), public.idea_similar(text, text),
  public.idea_submit(text, text, public.idea_category, boolean, text), public.idea_vote(uuid, boolean),
  public.ideas_list(text, text, public.idea_category, integer, integer), public.idea_get(uuid),
  public.idea_review(uuid, boolean, text), public.idea_set_status(uuid, public.idea_status, text),
  public.ideas_admin_list(text, integer, integer), public.ideas_stats(), public.idea_reveal_author(uuid, text)
  from public, anon;
grant execute on function public.idea_quota(), public.idea_similar(text, text),
  public.idea_submit(text, text, public.idea_category, boolean, text), public.idea_vote(uuid, boolean),
  public.ideas_list(text, text, public.idea_category, integer, integer), public.idea_get(uuid),
  public.idea_review(uuid, boolean, text), public.idea_set_status(uuid, public.idea_status, text),
  public.ideas_admin_list(text, integer, integer), public.ideas_stats(), public.idea_reveal_author(uuid, text)
  to authenticated;
