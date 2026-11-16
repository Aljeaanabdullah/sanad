import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kuwaitDayRange, safeIds, subjectEmployeeId, type AuditEntry, type AuditFilters } from "./audit-log";

// Database side of the audit log screen. Runs as the signed-in admin: RLS lets only the admin read audit_log.

const COLUMNS = "id, actor_user_id, action, table_name, record_id, old_data, new_data, created_at";

export type Person = { fileNumber: number | null; nameAr: string; nameEn: string; deleted: boolean };

type EmpRow = { id: string; user_id: string | null; file_number: number; full_name_ar: string; full_name_en: string };
type LogData = Record<string, unknown> | null;

const personOf = (d: Record<string, unknown>, deleted: boolean): Person => ({
  fileNumber: typeof d.file_number === "number" ? d.file_number : null,
  nameAr: String(d.full_name_ar ?? ""),
  nameEn: String(d.full_name_en ?? ""),
  deleted,
});

/**
 * Employee ids / login ids for a file number. When the employee no longer exists, falls back to
 * the log itself, so the history of a removed employee (end of service keeps only the audit log)
 * can still be found.
 */
async function resolveFileNumber(sb: SupabaseClient, file: number, want: "id" | "user_id"): Promise<string[]> {
  const { data } = await sb.from("employees").select("id, user_id").eq("file_number", file);
  const found = (data ?? []).map((r) => (want === "id" ? r.id : r.user_id) as string | null);
  if (safeIds(found).length) return safeIds(found);
  const { data: logged } = await sb
    .from("audit_log")
    .select("record_id, old_data, new_data")
    .eq("table_name", "employees")
    .in("action", ["insert", "delete"])
    .or(`new_data->>file_number.eq.${file},old_data->>file_number.eq.${file}`)
    .limit(50);
  for (const r of logged ?? []) {
    const d = (r.new_data ?? r.old_data) as LogData;
    found.push(want === "id" ? r.record_id : ((d?.user_id as string | null) ?? null));
  }
  return safeIds(found);
}

export type AuditQueryResult = {
  rows: AuditEntry[];
  hasOlder: boolean;
  hasNewer: boolean;
  noActor: boolean;
  noEmployee: boolean;
};

/**
 * One page of the log, newest first, keyset-paginated on id (uses the primary key index;
 * the actor filter uses audit_log_actor_idx, the employee filter the audit_log_about RPC).
 */
export async function queryAuditLog(sb: SupabaseClient, f: AuditFilters, limit: number): Promise<AuditQueryResult> {
  const empty = { rows: [], hasOlder: false, hasNewer: false, noActor: false, noEmployee: false };

  let actorIds: string[] | null = null;
  if (f.actor) {
    actorIds = await resolveFileNumber(sb, f.actor, "user_id");
    if (actorIds.length === 0) return { ...empty, noActor: true };
  }
  let employeeIds: string[] | null = null;
  if (f.employee) {
    employeeIds = await resolveFileNumber(sb, f.employee, "id");
    if (employeeIds.length === 0) return { ...empty, noEmployee: true };
  }

  // Employee concerned: admin-only RPC (migration audit_log_about_employee) so the jsonb
  // employee_id indexes are used; under RLS a direct ->> filter would scan the whole table.
  let q = employeeIds
    ? sb.rpc("audit_log_about", { p_employee_ids: employeeIds }).select(COLUMNS)
    : sb.from("audit_log").select(COLUMNS);
  const range = kuwaitDayRange(f.from, f.to);
  if (range.gte) q = q.gte("created_at", range.gte);
  if (range.lt) q = q.lt("created_at", range.lt);
  if (actorIds) q = q.in("actor_user_id", actorIds);
  else if (f.system) q = q.is("actor_user_id", null);
  if (f.table) q = q.eq("table_name", f.table);
  if (f.action === "export") q = q.like("action", "export%");
  else if (f.action) q = q.eq("action", f.action);

  const newerPage = !!f.after;
  if (f.before) q = q.lt("id", f.before);
  if (f.after) q = q.gt("id", f.after);
  q = q.order("id", { ascending: newerPage }).limit(limit + 1);

  const { data, error } = await q;
  if (error) throw new Error(`audit_log query failed: ${error.message}`);
  const all = (data ?? []) as AuditEntry[];
  const more = all.length > limit;
  const rows = all.slice(0, limit);
  if (newerPage) rows.reverse();
  return {
    rows,
    hasOlder: newerPage ? true : more,
    hasNewer: newerPage ? more : !!f.before,
    noActor: false,
    noEmployee: false,
  };
}

/** Names for the people on a page: who did it (by login id) and whom it was about (by employee id). */
export async function loadPeople(sb: SupabaseClient, rows: AuditEntry[]) {
  const actorIds = safeIds(rows.map((r) => r.actor_user_id));
  const subjectIds = safeIds(rows.map(subjectEmployeeId));
  const actors = new Map<string, Person>();
  const subjects = new Map<string, Person>();

  const [{ data: byUser }, { data: byId }] = await Promise.all([
    actorIds.length
      ? sb.from("employees").select("id, user_id, file_number, full_name_ar, full_name_en").in("user_id", actorIds)
      : Promise.resolve({ data: [] as EmpRow[] }),
    subjectIds.length
      ? sb.from("employees").select("id, user_id, file_number, full_name_ar, full_name_en").in("id", subjectIds)
      : Promise.resolve({ data: [] as EmpRow[] }),
  ]);
  for (const e of (byUser ?? []) as EmpRow[]) actors.set(e.user_id!, personOf(e, false));
  for (const e of (byId ?? []) as EmpRow[]) subjects.set(e.id, personOf(e, false));

  // Removed employees: their last known name is in the log (employees rows keep the full row).
  const goneSubjects = subjectIds.filter((id) => !subjects.has(id));
  const goneActors = actorIds.filter((id) => !actors.has(id));
  if (goneSubjects.length || goneActors.length) {
    const fromLog = (filter: string) =>
      sb
        .from("audit_log")
        .select("record_id, old_data, new_data")
        .eq("table_name", "employees")
        .in("action", ["insert", "delete"])
        .or(filter)
        .order("id", { ascending: false })
        .limit(200);
    const list = goneActors.join(",");
    const [bySubject, byActor] = await Promise.all([
      // record_id uses audit_log_record_idx.
      goneSubjects.length ? fromLog(`record_id.in.(${goneSubjects.join(",")})`) : Promise.resolve({ data: [] }),
      // Rare (an actor whose employee row was removed): a scan of the employees rows of the log.
      goneActors.length
        ? fromLog(`new_data->>user_id.in.(${list}),old_data->>user_id.in.(${list})`)
        : Promise.resolve({ data: [] }),
    ]);
    const logged = [...(bySubject.data ?? []), ...(byActor.data ?? [])] as {
      record_id: string | null;
      old_data: LogData;
      new_data: LogData;
    }[];
    for (const r of logged) {
      const d = (r.new_data ?? r.old_data) as LogData;
      if (!d) continue;
      if (r.record_id && goneSubjects.includes(r.record_id) && !subjects.has(r.record_id)) {
        subjects.set(r.record_id, personOf(d, true));
      }
      const uid = d.user_id as string | undefined;
      if (uid && goneActors.includes(uid) && !actors.has(uid)) actors.set(uid, personOf(d, true));
    }
  }
  // For rows about an employee, the employees row itself names the subject even without a lookup.
  for (const r of rows) {
    const d = r.new_data ?? r.old_data;
    if (r.table_name === "employees" && r.record_id && !subjects.has(r.record_id) && d?.full_name_ar) {
      subjects.set(r.record_id, personOf(d, r.action === "delete"));
    }
  }
  return { actors, subjects };
}
