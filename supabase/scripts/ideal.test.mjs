// S9 permission tests: ideal employee of the month (nominations private, winners public).
// Self-contained: creates a throw-away department with its own supervisor, employee and HR account, and removes
// them at the end. It never approves a winner (that would notify every employee); the approval rules are proven
// by ideal.proofs.sql, which runs inside a transaction that is rolled back.
// It expects no approved winner yet for the current month (otherwise nominations are closed and those tests fail).
// Run with: npm run test:ideal
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serviceClient, publicClient, signInAs, createTempAccount } from './lib.mjs';

const db = serviceClient();
const accounts = {};
const sessions = {};
const ids = {};
let departmentId;

const REASON = 'أنهى مشروع الأرشفة قبل موعده وساعد زملاءه';

before(async () => {
  const { data: dep, error } = await db.from('departments')
    .insert({ name_ar: 'قسم اختبار الموظف المثالي', name_en: 'Ideal employee test department' })
    .select('id').single();
  if (error) throw error;
  departmentId = dep.id;
  for (const [key, fileNumber, role] of [
    ['supervisor', 799821, 'supervisor'], ['employee', 799822, 'employee'], ['hr', 799823, 'hr'], ['other', 799824, 'supervisor'],
  ]) {
    accounts[key] = await createTempAccount(fileNumber, role);
    const { data } = await db.from('employees').update({ department_id: key === 'other' ? null : departmentId })
      .eq('file_number', fileNumber).select('id').single();
    ids[key] = data.id;
    sessions[key] = await signInAs(fileNumber, accounts[key].password);
  }
  await db.from('departments').update({ supervisor_id: ids.supervisor }).eq('id', departmentId);
});

after(async () => {
  if (departmentId) {
    await db.from('ideal_employee_nominations').delete().eq('department_id', departmentId);
    await db.from('departments').delete().eq('id', departmentId);
  }
  for (const a of Object.values(accounts)) await a.remove();
});

test('ideal: the supervisor sees only their own department to nominate for', async () => {
  const { data, error } = await sessions.supervisor.rpc('ideal_my_departments');
  assert.equal(error, null);
  assert.deepEqual(data.map((d) => d.department_id), [departmentId]);
  const other = await sessions.other.rpc('ideal_my_departments');
  assert.ok(!other.data.some((d) => d.department_id === departmentId));
});

test('ideal: candidates are the department\'s employees, never the supervisor', async () => {
  const { data, error } = await sessions.supervisor.rpc('ideal_candidates', { p_department: departmentId });
  assert.equal(error, null);
  assert.ok(data.some((c) => c.id === ids.employee));
  assert.ok(!data.some((c) => c.id === ids.supervisor));
  const denied = await sessions.other.rpc('ideal_candidates', { p_department: departmentId });
  assert.match(denied.error?.message ?? '', /not_allowed/);
});

test('ideal: nobody nominates themself, and a reason is required', async () => {
  const self = await sessions.supervisor.rpc('ideal_nominate', { p_department: departmentId, p_nominee: ids.supervisor, p_reason: REASON });
  assert.match(self.error?.message ?? '', /cannot_nominate_self/);
  const short = await sessions.supervisor.rpc('ideal_nominate', { p_department: departmentId, p_nominee: ids.employee, p_reason: 'ممتاز' });
  assert.match(short.error?.message ?? '', /reason_too_short/);
});

test('ideal: employees and other supervisors cannot nominate for the department', async () => {
  for (const who of ['employee', 'other']) {
    const res = await sessions[who].rpc('ideal_nominate', { p_department: departmentId, p_nominee: ids.hr, p_reason: REASON });
    assert.match(res.error?.message ?? '', /not_allowed/, who);
  }
});

test('ideal: the supervisor nominates; changing it keeps one nomination', async () => {
  const first = await sessions.supervisor.rpc('ideal_nominate', { p_department: departmentId, p_nominee: ids.hr, p_reason: REASON });
  assert.equal(first.error, null);
  const second = await sessions.supervisor.rpc('ideal_nominate', { p_department: departmentId, p_nominee: ids.employee, p_reason: REASON });
  assert.equal(second.error, null);
  const { data } = await db.from('ideal_employee_nominations').select('nominee_id').eq('department_id', departmentId);
  assert.deepEqual(data.map((n) => n.nominee_id), [ids.employee]);
});

test('ideal: clients cannot write the tables directly', async () => {
  const insert = await sessions.supervisor.from('ideal_employee_nominations').insert({
    month: '2026-11-01', department_id: departmentId, nominee_id: ids.employee, nominator_id: ids.supervisor, reason: REASON,
  });
  assert.ok(insert.error);
  const winner = await sessions.hr.from('ideal_employee_winners').insert({
    month: '2026-11-01', employee_id: ids.employee, name_ar: 'x', name_en: 'x', reason: REASON,
  });
  assert.ok(winner.error);
});

test('ideal: nominations are private (HR and the nominator only)', async () => {
  const mine = await sessions.supervisor.from('ideal_employee_nominations').select('id').eq('department_id', departmentId);
  assert.equal(mine.data.length, 1);
  const hr = await sessions.hr.from('ideal_employee_nominations').select('id').eq('department_id', departmentId);
  assert.equal(hr.data.length, 1);
  for (const who of ['employee', 'other']) {
    const { data } = await sessions[who].from('ideal_employee_nominations').select('id').eq('department_id', departmentId);
    assert.equal(data.length, 0, who);
  }
  const anon = await publicClient().from('ideal_employee_nominations').select('id').limit(1);
  assert.ok(anon.error || anon.data.length === 0);
});

test('ideal: only HR / admin can approve', async () => {
  const { data: n } = await db.from('ideal_employee_nominations').select('id').eq('department_id', departmentId).single();
  for (const who of ['employee', 'supervisor', 'other']) {
    const res = await sessions[who].rpc('ideal_approve', { p_nomination: n.id });
    assert.match(res.error?.message ?? '', /not_allowed/, who);
  }
});

test('ideal: winners are readable by every signed-in employee, not by visitors', async () => {
  const signedIn = await sessions.employee.from('ideal_employee_winners').select('month').limit(1);
  assert.equal(signedIn.error, null);
  const anon = await publicClient().from('ideal_employee_winners').select('month').limit(1);
  assert.ok(anon.error || anon.data.length === 0);
});

test('ideal: the supervisor can withdraw while the month is open', async () => {
  const res = await sessions.supervisor.rpc('ideal_withdraw', { p_department: departmentId });
  assert.equal(res.error, null);
  const { data } = await db.from('ideal_employee_nominations').select('id').eq('department_id', departmentId);
  assert.equal(data.length, 0);
});
