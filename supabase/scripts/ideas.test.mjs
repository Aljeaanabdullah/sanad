// Ideas box (phase S8) through the real API, for the 4 roles. Uses throw-away accounts only.
// Run after the ideas_box migration is applied: npm run test:ideas
// The 50-vote threshold, the overdue alert and the photo rules are proved in ideas.proofs.sql
// (they need 50+ accounts or a changed clock, which this test does not create).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serviceClient, signInAs, createTempAccount } from './lib.mjs';

const db = serviceClient();
const acc = {};
const s = {};
const made = [];

before(async () => {
  for (const [k, fn, role] of [
    ['author', 799901, 'employee'], ['voter', 799902, 'employee'], ['supervisor', 799903, 'supervisor'],
    ['hr', 799904, 'hr'], ['admin', 799905, 'admin'],
  ]) {
    acc[k] = await createTempAccount(fn, role);
    s[k] = await signInAs(fn, acc[k].password);
  }
});

after(async () => {
  if (made.length) await db.from('ideas').delete().in('id', made);
  await db.from('notifications').delete().like('dedupe_key', 'idea_%').in('employee_id',
    (await db.from('employees').select('id').gte('file_number', 799901).lte('file_number', 799905)).data?.map((r) => r.id) ?? []);
  for (const a of Object.values(acc)) await a.remove();
});

const submit = async (client, anonymous, title) => {
  const { data, error } = await client.rpc('idea_submit', {
    p_title: title, p_description: 'وصف كافٍ لهذه الفكرة لأغراض الاختبار فقط', p_category: 'other', p_anonymous: anonymous,
  });
  if (error) throw error;
  made.push(data);
  return data;
};

let anonId;

test('no role reads the ideas tables directly', async () => {
  for (const k of ['author', 'supervisor', 'hr', 'admin']) {
    for (const table of ['ideas', 'idea_votes', 'idea_events']) {
      const { data, error } = await s[k].from(table).select('*').limit(1);
      assert.ok(error || data.length === 0, `${k} read ${table}`);
    }
  }
});

test('employee submits an anonymous idea; nobody else sees it before review', async () => {
  anonId = await submit(s.author, true, 'فكرة مجهولة للاختبار');
  const { data } = await s.voter.rpc('idea_get', { p_idea: anonId });
  assert.equal(data.length, 0);
});

test('only HR / admin review; the queue hides the anonymous author', async () => {
  for (const k of ['voter', 'supervisor']) {
    const { error } = await s[k].rpc('idea_review', { p_idea: anonId, p_approve: true });
    assert.match(error?.message ?? '', /not_allowed/);
  }
  const { data: queue, error } = await s.hr.rpc('ideas_admin_list', { p_filter: 'review' });
  assert.equal(error, null);
  const row = queue.find((r) => r.id === anonId);
  assert.ok(row);
  assert.equal(row.author_name_ar, null);
  assert.equal(row.author_file_number, null);
  const ok = await s.hr.rpc('idea_review', { p_idea: anonId, p_approve: true });
  assert.equal(ok.error, null);
});

test('published anonymous idea: author hidden from employee, supervisor, HR and admin lists', async () => {
  for (const k of ['voter', 'supervisor', 'hr', 'admin']) {
    const { data, error } = await s[k].rpc('ideas_list', { p_scope: 'all' });
    assert.equal(error, null);
    const row = data.find((r) => r.id === anonId);
    assert.ok(row, `${k} sees the idea`);
    assert.equal(row.author_name_ar, null);
    assert.equal(row.author_name_en, null);
    assert.equal(row.is_mine, false);
  }
  const { data: mine } = await s.author.rpc('ideas_list', { p_scope: 'mine' });
  assert.ok(mine.find((r) => r.id === anonId)?.is_mine);
});

test('one vote per employee, withdrawable; no own vote', async () => {
  const own = await s.author.rpc('idea_vote', { p_idea: anonId, p_support: true });
  assert.match(own.error?.message ?? '', /idea_own_vote/);
  assert.equal((await s.voter.rpc('idea_vote', { p_idea: anonId, p_support: true })).data, 1);
  assert.equal((await s.voter.rpc('idea_vote', { p_idea: anonId, p_support: true })).data, 1);
  assert.equal((await s.voter.rpc('idea_vote', { p_idea: anonId, p_support: false })).data, 0);
});

test('reveal: admin only, needs a reason, written to the audit log', async () => {
  const hr = await s.hr.rpc('idea_reveal_author', { p_idea: anonId, p_reason: 'إساءة واضحة لزميل' });
  assert.match(hr.error?.message ?? '', /not_allowed/);
  const short = await s.admin.rpc('idea_reveal_author', { p_idea: anonId, p_reason: 'x' });
  assert.match(short.error?.message ?? '', /reason_required/);
  const { data, error } = await s.admin.rpc('idea_reveal_author', { p_idea: anonId, p_reason: 'إساءة واضحة لزميل في النص' });
  assert.equal(error, null);
  assert.equal(data[0].file_number, 799901);
  const { data: log } = await db.from('audit_log').select('id').eq('action', 'reveal_author').eq('record_id', anonId);
  assert.equal(log.length, 1);
});

test('the audit log never names the author of an anonymous idea', async () => {
  const { data: author } = await db.from('employees').select('id, user_id').eq('file_number', 799901).single();
  const { data: rows } = await db.from('audit_log').select('actor_user_id, old_data, new_data').eq('table_name', 'ideas').eq('record_id', anonId);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.notEqual(r.actor_user_id, author.user_id);
    assert.ok(!JSON.stringify(r.new_data ?? {}).includes(author.id));
    assert.ok(!JSON.stringify(r.old_data ?? {}).includes(author.id));
  }
});

test('monthly limit: 3 ideas per employee', async () => {
  await submit(s.author, false, 'فكرة ثانية للاختبار');
  await submit(s.author, false, 'فكرة ثالثة للاختبار');
  const { error } = await s.author.rpc('idea_submit', {
    p_title: 'فكرة رابعة للاختبار', p_description: 'وصف كافٍ لهذه الفكرة لأغراض الاختبار فقط', p_category: 'other',
  });
  assert.match(error?.message ?? '', /idea_monthly_limit/);
});

test('management reply: HR only, rejection needs a reason, stats for HR only', async () => {
  const emp = await s.voter.rpc('idea_set_status', { p_idea: anonId, p_status: 'under_study' });
  assert.match(emp.error?.message ?? '', /not_allowed/);
  const noReason = await s.hr.rpc('idea_set_status', { p_idea: anonId, p_status: 'rejected' });
  assert.match(noReason.error?.message ?? '', /reason_required/);
  assert.equal((await s.hr.rpc('idea_set_status', { p_idea: anonId, p_status: 'under_study' })).error, null);
  assert.match((await s.supervisor.rpc('ideas_stats')).error?.message ?? '', /not_allowed/);
  assert.equal((await s.admin.rpc('ideas_stats')).error, null);
});
