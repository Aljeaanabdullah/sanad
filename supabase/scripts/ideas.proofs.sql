-- Phase S8 SQL proofs (ideas box). Run the whole file in the Supabase SQL editor (or psql):
-- everything happens inside one transaction that is ROLLED BACK, so nothing stays in the database.
-- Each row of the final result is one check; every "ok" must be true.
-- Makes its own throw-away accounts (file numbers 799800-799899), so it needs no demo data.
begin;
create temp table r(n serial, step text, ok boolean, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
create temp table ids(k text primary key, v uuid);
grant all on ids to authenticated;

-- Accounts: author A, voter B, supervisor S, HR H, admin M, and 60 extra voters.
do $$
declare
  rec record;
  u uuid;
begin
  for rec in select * from (values
      ('A', 799800, 'employee'), ('B', 799801, 'employee'), ('S', 799802, 'supervisor'),
      ('H', 799803, 'hr'), ('M', 799804, 'admin')) x(k, fn, role)
    union all select 'V' || g, 799810 + g, 'employee' from generate_series(1, 60) g
  loop
    u := gen_random_uuid();
    insert into auth.users (id, email, aud, role) values (u, rec.fn || '@jahez.local', 'authenticated', 'authenticated');
    insert into public.employees (file_number, user_id, full_name_ar, full_name_en, role, must_change_password)
    values (rec.fn, u, 'اختبار ' || rec.k, 'Test ' || rec.k, rec.role::public.app_role, false);
    insert into ids values ('u' || rec.k, u),
      ('e' || rec.k, (select id from public.employees where file_number = rec.fn));
  end loop;
end $$;

-- Acts as that account (both claim settings, for old and new versions of auth.uid()).
create function pg_temp.login(k text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select v from ids where ids.k = 'u' || login.k), 'role', 'authenticated')::text, true);
  select set_config('request.jwt.claim.sub', (select v::text from ids where ids.k = 'u' || login.k), true);
$$;
grant execute on function pg_temp.login(text) to authenticated;

set local role authenticated;

-- Direct table access is closed for all 4 roles.
do $$ declare k text; begin
  foreach k in array array['A', 'S', 'H', 'M'] loop
    perform pg_temp.login(k);
    begin
      perform 1 from public.ideas limit 1;
      insert into r(step, ok, info) values ('direct select on ideas refused: ' || k, false, 'read!');
    exception when insufficient_privilege then
      insert into r(step, ok, info) values ('direct select on ideas refused: ' || k, true, sqlerrm);
    end;
    begin
      perform 1 from public.idea_votes limit 1;
      insert into r(step, ok, info) values ('direct select on idea_votes refused: ' || k, false, 'read!');
    exception when insufficient_privilege then
      insert into r(step, ok, info) values ('direct select on idea_votes refused: ' || k, true, sqlerrm);
    end;
  end loop;
end $$;

-- A submits one anonymous and one named idea.
select pg_temp.login('A');
do $$ begin
  insert into ids values ('anon', public.idea_submit('تحسين مواقف السيارات أمام المبنى', 'إضافة مظلات ومواقف أكثر للموظفين أمام المبنى الرئيسي', 'work_environment', true));
  insert into ids values ('named', public.idea_submit('طباعة على الوجهين', 'جعل الطابعات تطبع على الوجهين افتراضيًا لتوفير الورق', 'savings', false));
  insert into r(step, ok, info) values ('employee submits ideas', true, null);
end $$;
do $$ begin
  perform public.idea_submit('قصير', 'وصف قصير', 'other');
  insert into r(step, ok, info) values ('too-short idea refused', false, 'accepted!');
exception when others then insert into r(step, ok, info) values ('too-short idea refused', sqlerrm = 'idea_title_invalid', sqlerrm); end $$;

-- Before review nobody else sees them.
select pg_temp.login('B');
insert into r(step, ok, info)
select 'new idea hidden from other employees (list)', count(*) = 0, count(*)::text
from public.ideas_list('all') l where l.id in (select v from ids where k in ('anon', 'named'));
insert into r(step, ok, info)
select 'new idea hidden from other employees (detail)', count(*) = 0, count(*)::text
from public.idea_get((select v from ids where k = 'anon'));

-- Supervisor and employee have no HR powers.
do $$ declare k text; begin
  foreach k in array array['B', 'S'] loop
    perform pg_temp.login(k);
    begin
      perform public.idea_review((select v from ids where ids.k = 'anon'), true);
      insert into r(step, ok, info) values ('cannot review: ' || k, false, 'reviewed!');
    exception when others then insert into r(step, ok, info) values ('cannot review: ' || k, sqlerrm = 'not_allowed', sqlerrm); end;
    begin
      perform * from public.ideas_admin_list('all');
      insert into r(step, ok, info) values ('no admin list: ' || k, false, 'listed!');
    exception when others then insert into r(step, ok, info) values ('no admin list: ' || k, sqlerrm = 'not_allowed', sqlerrm); end;
  end loop;
end $$;

-- HR sees the review queue without the anonymous author.
select pg_temp.login('H');
insert into r(step, ok, info)
select 'HR review queue: anonymous author hidden', author_name_ar is null and author_file_number is null, coalesce(author_name_ar, 'null')
from public.ideas_admin_list('review') where id = (select v from ids where k = 'anon');
insert into r(step, ok, info)
select 'HR review queue: named author shown', author_file_number = 799800, author_file_number::text
from public.ideas_admin_list('review') where id = (select v from ids where k = 'named');
do $$ begin
  perform public.idea_review((select v from ids where k = 'named'), false, '');
  insert into r(step, ok, info) values ('review rejection needs a reason', false, 'rejected!');
exception when others then insert into r(step, ok, info) values ('review rejection needs a reason', sqlerrm = 'reason_required', sqlerrm); end $$;
do $$ begin
  perform public.idea_review((select v from ids where k = 'anon'), true);
  perform public.idea_review((select v from ids where k = 'named'), false, 'تذكر اسم زميل');
  insert into r(step, ok, info) values ('HR publishes / refuses', true, null);
end $$;

reset role;
insert into r(step, ok, info)
select 'review rejection reason sent to the author', count(*) = 1, max(body_ar)
from public.notifications
where employee_id = (select v from ids where k = 'eA') and kind = 'idea_status'
  and data ->> 'idea_id' = (select v::text from ids where k = 'named') and body_ar like '%تذكر اسم زميل%';
set local role authenticated;

-- Published: everyone sees it, author hidden; refused idea stays private.
select pg_temp.login('B');
insert into r(step, ok, info)
select 'employee sees published anonymous idea without author', author_name_ar is null and not is_mine and is_anonymous, coalesce(author_name_ar, 'null')
from public.ideas_list('all') where id = (select v from ids where k = 'anon');
insert into r(step, ok, info)
select 'refused idea not public', count(*) = 0, count(*)::text from public.idea_get((select v from ids where k = 'named'));
select pg_temp.login('A');
insert into r(step, ok, info)
select 'author sees own refused idea and reason', reject_reason = 'تذكر اسم زميل', reject_reason
from public.idea_get((select v from ids where k = 'named'));
insert into r(step, ok, info)
select 'author sees own anonymous idea as mine', is_mine, is_mine::text from public.ideas_list('mine') where id = (select v from ids where k = 'anon');

-- Voting: one per person, no own vote, can withdraw.
do $$ begin
  perform public.idea_vote((select v from ids where k = 'anon'));
  insert into r(step, ok, info) values ('author cannot vote own idea', false, 'voted!');
exception when others then insert into r(step, ok, info) values ('author cannot vote own idea', sqlerrm = 'idea_own_vote', sqlerrm); end $$;
select pg_temp.login('B');
do $$ declare n1 int; n2 int; n3 int; begin
  n1 := public.idea_vote((select v from ids where k = 'anon'));
  n2 := public.idea_vote((select v from ids where k = 'anon'));
  insert into r(step, ok, info) values ('one vote per employee', n1 = 1 and n2 = 1, n1 || ',' || n2);
  n3 := public.idea_vote((select v from ids where k = 'anon'), false);
  insert into r(step, ok, info) values ('vote can be withdrawn', n3 = 0, n3::text);
  perform public.idea_vote((select v from ids where k = 'anon'));
end $$;
do $$ begin
  perform public.idea_vote((select v from ids where k = 'named'));
  insert into r(step, ok, info) values ('cannot vote on unpublished idea', false, 'voted!');
exception when others then insert into r(step, ok, info) values ('cannot vote on unpublished idea', sqlerrm = 'idea_not_found', sqlerrm); end $$;

-- Similar ideas before submitting.
insert into r(step, ok, info)
select 'similar ideas found (pg_trgm, Arabic)', count(*) >= 1, string_agg(title || ' ' || round(score::numeric, 2), ' | ')
from public.idea_similar('مواقف السيارات', 'نحتاج مواقف أكثر') where id = (select v from ids where k = 'anon');

-- 48 more votes = 49: still published. The 50th moves it to awaiting_response.
do $$ declare g int; begin
  for g in 1..48 loop
    perform pg_temp.login('V' || g);
    perform public.idea_vote((select v from ids where k = 'anon'));
  end loop;
end $$;
select pg_temp.login('B');
insert into r(step, ok, info)
select '49 votes: still published', status = 'published' and vote_count = 49, status || ' ' || vote_count
from public.idea_get((select v from ids where k = 'anon'));
select pg_temp.login('V49');
select public.idea_vote((select v from ids where k = 'anon')) is not null as voted;
insert into r(step, ok, info)
select '50 votes: awaiting management reply, due in 14 days',
  status = 'awaiting_response' and vote_count = 50 and response_due_at between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour',
  status || ' ' || vote_count || ' ' || response_due_at
from public.idea_get((select v from ids where k = 'anon'));

reset role;
insert into r(step, ok, info)
select 'author + every voter notified at the threshold', count(distinct employee_id) = 51, count(distinct employee_id)::text
from public.notifications where kind = 'idea_status' and data ->> 'status' = 'awaiting_response'
  and data ->> 'idea_id' = (select v::text from ids where k = 'anon');
insert into r(step, ok, info)
select 'HR told about the threshold', count(*) >= 1, count(*)::text
from public.notifications where kind = 'idea_awaiting' and employee_id = (select v from ids where k = 'eH');
set local role authenticated;

-- Monthly limit: A has 2; the 3rd is fine, the 4th is refused.
select pg_temp.login('A');
do $$ begin
  perform public.idea_submit('فكرة ثالثة لهذا الشهر', 'وصف كافٍ لفكرة ثالثة لهذا الشهر للاختبار', 'other', false);
  insert into r(step, ok, info) values ('3rd idea this month accepted', true, null);
end $$;
do $$ begin
  perform public.idea_submit('فكرة رابعة لهذا الشهر', 'وصف كافٍ لفكرة رابعة لهذا الشهر للاختبار', 'other', false);
  insert into r(step, ok, info) values ('4th idea this month refused', false, 'accepted!');
exception when others then insert into r(step, ok, info) values ('4th idea this month refused', sqlerrm = 'idea_monthly_limit', sqlerrm); end $$;
insert into r(step, ok, info) select 'quota shows 0 left', remaining = 0, used || '/' || monthly_limit from public.idea_quota();

-- Reveal: admin only, reason required, logged; the log never names the author.
select pg_temp.login('H');
do $$ begin
  perform public.idea_reveal_author((select v from ids where k = 'anon'), 'إساءة واضحة في النص');
  insert into r(step, ok, info) values ('HR cannot reveal', false, 'revealed!');
exception when others then insert into r(step, ok, info) values ('HR cannot reveal', sqlerrm = 'not_allowed', sqlerrm); end $$;
select pg_temp.login('M');
insert into r(step, ok, info)
select 'admin list hides anonymous author too', author_name_ar is null, coalesce(author_name_ar, 'null')
from public.ideas_admin_list('all') where id = (select v from ids where k = 'anon');
do $$ begin
  perform public.idea_reveal_author((select v from ids where k = 'anon'), 'قصير');
  insert into r(step, ok, info) values ('reveal needs a reason', false, 'revealed!');
exception when others then insert into r(step, ok, info) values ('reveal needs a reason', sqlerrm = 'reason_required', sqlerrm); end $$;
do $$ begin
  perform public.idea_reveal_author((select v from ids where k = 'named'), 'إساءة واضحة في النص');
  insert into r(step, ok, info) values ('named idea has nothing to reveal', false, 'revealed!');
exception when others then insert into r(step, ok, info) values ('named idea has nothing to reveal', sqlerrm = 'idea_not_anonymous', sqlerrm); end $$;
insert into r(step, ok, info)
select 'admin reveal returns the author', file_number = 799800, file_number::text
from public.idea_reveal_author((select v from ids where k = 'anon'), 'إساءة واضحة لزميل في النص');

reset role;
insert into r(step, ok, info)
select 'reveal written to audit log', count(*) = 1, count(*)::text
from public.audit_log where action = 'reveal_author' and record_id = (select v::text from ids where k = 'anon')
  and actor_user_id = (select v from ids where k = 'uM') and new_data ->> 'reason' like 'إساءة%';
insert into r(step, ok, info)
select 'no audit row about ideas names the author', count(*) = 0, count(*)::text
from public.audit_log a
where a.table_name = 'ideas' and a.record_id = (select v::text from ids where k = 'anon')
  and (a.actor_user_id = (select v from ids where k = 'uA')
       or coalesce(a.new_data::text, '') like '%' || (select v::text from ids where k = 'eA') || '%'
       or coalesce(a.old_data::text, '') like '%' || (select v::text from ids where k = 'eA') || '%');
insert into r(step, ok, info)
select 'submission event has no actor', actor_id is null, coalesce(actor_id::text, 'null')
from public.idea_events where idea_id = (select v from ids where k = 'anon') and status = 'new';
set local role authenticated;

-- Management reply: forward only, rejection needs a reason, voters notified.
select pg_temp.login('H');
do $$ begin
  perform public.idea_set_status((select v from ids where k = 'anon'), 'published');
  insert into r(step, ok, info) values ('cannot move back', false, 'moved!');
exception when others then insert into r(step, ok, info) values ('cannot move back', sqlerrm = 'idea_status_invalid', sqlerrm); end $$;
do $$ begin
  perform public.idea_set_status((select v from ids where k = 'anon'), 'rejected', null);
  insert into r(step, ok, info) values ('rejection needs a reason', false, 'rejected!');
exception when others then insert into r(step, ok, info) values ('rejection needs a reason', sqlerrm = 'reason_required', sqlerrm); end $$;
select public.idea_set_status((select v from ids where k = 'anon'), 'under_study', 'نراجع الميزانية');
insert into r(step, ok, info)
select 'reply stops the countdown', status = 'under_study' and responded_at is not null, status::text
from public.idea_get((select v from ids where k = 'anon'));
reset role;
insert into r(step, ok, info)
select 'voters notified of the reply', count(distinct employee_id) = 51, count(distinct employee_id)::text
from public.notifications where kind = 'idea_status' and data ->> 'status' = 'under_study'
  and data ->> 'idea_id' = (select v::text from ids where k = 'anon');
set local role authenticated;

-- Overdue: a second idea at the threshold, deadline passed -> admins alerted once.
reset role;
do $$ declare v_id uuid; begin
  -- A is at the limit; submit as B.
  perform pg_temp.login('B');
  v_id := public.idea_submit('ساعة حائط في كل قاعة', 'تركيب ساعة حائط واضحة في كل قاعة اجتماعات بالمبنى', 'services', false);
  insert into ids values ('late', v_id);
  update public.ideas set status = 'awaiting_response', published_at = now() - interval '20 days',
    threshold_at = now() - interval '15 days', response_due_at = now() - interval '1 day' where id = v_id;
end $$;
select private.ideas_tick() as tick1;
select private.ideas_tick() as tick2;
insert into r(step, ok, info)
select 'overdue alert to the admin, once', count(*) = 1, count(*)::text
from public.notifications where kind = 'idea_overdue' and employee_id = (select v from ids where k = 'eM')
  and data ->> 'idea_id' = (select v::text from ids where k = 'late');
insert into r(step, ok, info)
select 'overdue alert not sent to HR or employees', count(*) = 0, count(*)::text
from public.notifications where kind = 'idea_overdue' and employee_id in (select v from ids where k in ('eH', 'eA', 'eB'))
  and data ->> 'idea_id' = (select v::text from ids where k = 'late');
set local role authenticated;
select pg_temp.login('H');
insert into r(step, ok, info)
select 'overdue shown in the panel list', response_overdue, response_overdue::text
from public.ideas_admin_list('overdue') where id = (select v from ids where k = 'late');

-- «أفكار صارت حقيقة»: implemented ideas, author hidden when anonymous.
select public.idea_set_status((select v from ids where k = 'anon'), 'implemented');
select pg_temp.login('B');
insert into r(step, ok, info)
select 'implemented list shows the idea without the anonymous author', count(*) = 1 and bool_and(author_name_ar is null), count(*)::text
from public.ideas_list('implemented') where id = (select v from ids where k = 'anon');
do $$ begin
  perform public.idea_vote((select v from ids where k = 'anon'), false);
  insert into r(step, ok, info) values ('no vote changes after implemented', false, 'changed!');
exception when others then insert into r(step, ok, info) values ('no vote changes after implemented', sqlerrm = 'idea_voting_closed', sqlerrm); end $$;
select pg_temp.login('H');
insert into r(step, ok, info)
select 'stats count submissions and implemented', (s ->> 'implemented')::int >= 1 and (s ->> 'submitted')::int >= 4, s::text
from public.ideas_stats() s;

-- Photo: the uploader is cleared from storage when attached; visible only with the idea.
reset role;
insert into storage.objects (bucket_id, name, owner, owner_id)
values ('idea-photos', '11111111-2222-4333-8444-555555555555.jpg', (select v from ids where k = 'uV1'), (select v from ids where k = 'uV1')::text);
set local role authenticated;
select pg_temp.login('V1');
select public.idea_submit('إنارة أفضل في الممرات', 'تغيير إنارة الممرات إلى إنارة موفّرة وأقوى للسلامة', 'safety', true,
  '11111111-2222-4333-8444-555555555555.jpg') is not null as with_photo;
reset role;
insert into r(step, ok, info)
select 'photo uploader cleared after attaching', owner is null and owner_id is null, coalesce(owner_id, 'null')
from storage.objects where name = '11111111-2222-4333-8444-555555555555.jpg';
set local role authenticated;
select pg_temp.login('B');
insert into r(step, ok, info)
select 'photo of an unreviewed idea hidden from others', not private.idea_photo_visible('11111111-2222-4333-8444-555555555555.jpg'), null;
select pg_temp.login('H');
insert into r(step, ok, info)
select 'HR sees the photo while reviewing', private.idea_photo_visible('11111111-2222-4333-8444-555555555555.jpg'), null;
do $$ begin
  perform pg_temp.login('V2');
  perform public.idea_submit('صورة ليست لي', 'محاولة استعمال صورة رفعها موظف آخر في فكرتي', 'other', false,
    '11111111-2222-4333-8444-555555555555.jpg');
  insert into r(step, ok, info) values ('cannot attach someone else''s photo', false, 'attached!');
exception when others then insert into r(step, ok, info) values ('cannot attach someone else''s photo', sqlerrm = 'idea_photo_invalid', sqlerrm); end $$;

reset role;
select n, step, ok, info from r order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok or ok is null) as failed from r;
rollback;
