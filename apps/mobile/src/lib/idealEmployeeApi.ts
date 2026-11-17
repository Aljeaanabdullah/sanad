// «الموظف المثالي» (S9): server calls. Rules live on the server (SECURITY DEFINER functions + RLS).
import { toCandidate, toMyDepartment, toWinner, type Candidate, type MyDepartment, type Winner } from './idealEmployee';
import { supabase } from './supabase';

/** Approved winners, newest first (public to every signed-in employee). */
export async function idealWinners(limit = 36): Promise<Winner[]> {
  const { data, error } = await supabase
    .from('ideal_employee_winners')
    .select('month, name_ar, name_en, job_title, department_ar, department_en, reason, citation')
    .order('month', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toWinner);
}

/** Departments I nominate for this month (supervisor; the admin for departments without one). */
export async function idealMyDepartments(): Promise<MyDepartment[]> {
  const { data, error } = await supabase.rpc('ideal_my_departments');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toMyDepartment);
}

export async function idealCandidates(departmentId: string): Promise<Candidate[]> {
  const { data, error } = await supabase.rpc('ideal_candidates', { p_department: departmentId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toCandidate);
}

export async function idealNominate(departmentId: string, nomineeId: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('ideal_nominate', { p_department: departmentId, p_nominee: nomineeId, p_reason: reason.trim() });
  if (error) throw error;
  return String(data);
}

export async function idealWithdraw(departmentId: string): Promise<void> {
  const { error } = await supabase.rpc('ideal_withdraw', { p_department: departmentId });
  if (error) throw error;
}
