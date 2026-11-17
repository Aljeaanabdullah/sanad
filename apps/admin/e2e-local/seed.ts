import type { SupabaseClient } from "@supabase/supabase-js";
import { emailFor, SMOKE } from "./local-env";

type Db = SupabaseClient;

const one = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> => {
  const { data, error } = await p;
  if (error || !data) throw new Error(`${what}: ${error?.message ?? "no data"}`);
  return data;
};

/** Removes everything the smoke tests create. Pass only the client from localServiceClient(). */
export async function cleanUpSmoke(db: Db) {
  const numbers = Object.values(SMOKE) as number[];
  const { data: emps } = await db.from("employees").select("id").in("file_number", numbers);
  const ids = (emps ?? []).map((e) => e.id as string);
  if (ids.length) {
    await db.from("emergencies").delete().in("started_by", ids);
    await db.from("request_approvals").delete().in("approver_id", ids);
    await db.from("requests").delete().in("employee_id", ids);
    await db.from("attendance_punches").delete().in("employee_id", ids);
    await db.from("departments").update({ supervisor_id: null }).in("supervisor_id", ids);
    await db.from("employees").delete().in("id", ids);
  }
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) if (numbers.some((n) => u.email === emailFor(n))) await db.auth.admin.deleteUser(u.id);
  await db.from("departments").delete().like("name_en", "Smoke %");
  await db.from("sites").delete().like("name_en", "Smoke %");
}

/**
 * A small known world: one site, departments "Smoke Ops" and "Smoke IT" (each with a supervisor and an employee),
 * an admin and an HR officer, one pending request per employee, one punch today, and one closed fire drill.
 */
export async function seedSmoke(db: Db, password: string) {
  const users: Record<number, string> = {};
  for (const n of Object.values(SMOKE)) {
    const { data, error } = await db.auth.admin.createUser({ email: emailFor(n), password, email_confirm: true });
    if (error) throw new Error(`createUser ${n}: ${error.message}`);
    users[n] = data.user.id;
  }

  const site = await one(
    db.from("sites").insert({ name_ar: "موقع الفحص", name_en: "Smoke site", latitude: 29.3759, longitude: 47.9774, radius_m: 200 }).select("id").single(),
    "site",
  );
  const depts = await one(
    db.from("departments").insert([
      { name_ar: "عمليات الفحص", name_en: "Smoke Ops" },
      { name_ar: "تقنية الفحص", name_en: "Smoke IT" },
    ]).select("id, name_en"),
    "departments",
  );
  const ops = depts.find((d) => d.name_en === "Smoke Ops")!.id;
  const it = depts.find((d) => d.name_en === "Smoke IT")!.id;

  const people = [
    { n: SMOKE.admin, role: "admin", ar: "مدير الفحص", en: "Smoke admin", dept: null },
    { n: SMOKE.supervisor, role: "supervisor", ar: "مشرف عمليات الفحص", en: "Smoke Ops supervisor", dept: ops },
    { n: SMOKE.hr, role: "hr", ar: "موارد الفحص", en: "Smoke HR", dept: null },
    { n: SMOKE.employee, role: "employee", ar: "موظف عمليات الفحص", en: "Smoke Ops employee", dept: ops },
    { n: SMOKE.itEmployee, role: "employee", ar: "موظف تقنية الفحص", en: "Smoke IT employee", dept: it },
    { n: SMOKE.itSupervisor, role: "supervisor", ar: "مشرف تقنية الفحص", en: "Smoke IT supervisor", dept: it },
  ];
  const emps = await one(
    db.from("employees").insert(
      people.map((p) => ({
        file_number: p.n, user_id: users[p.n], full_name_ar: p.ar, full_name_en: p.en, role: p.role,
        department_id: p.dept, must_change_password: false,
      })),
    ).select("id, file_number"),
    "employees",
  );
  const id = (n: number) => emps.find((e) => e.file_number === n)!.id as string;
  await one(db.from("departments").update({ supervisor_id: id(SMOKE.supervisor) }).eq("id", ops).select("id"), "Ops supervisor");
  await one(db.from("departments").update({ supervisor_id: id(SMOKE.itSupervisor) }).eq("id", it).select("id"), "IT supervisor");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(new Date());
  await one(
    db.from("requests").insert([SMOKE.employee, SMOKE.itEmployee].map((n) => ({
      employee_id: id(n), request_type: "external_mission", status: "pending_supervisor", shift_date: today,
      reason: `مهمة فحص ${n}`, mission_site_id: site.id,
    }))).select("id"),
    "requests",
  );
  await one(
    db.from("attendance_punches").insert({
      employee_id: id(SMOKE.employee), punch_type: "check_in", punched_at: new Date(Date.now() - 600_000).toISOString(),
      shift_date: today, result: "accepted", site_id: site.id,
    }).select("id"),
    "punch",
  );
  await one(
    db.from("emergencies").insert({
      site_id: site.id, hazard: "fire", status: "closed", is_drill: true, started_by: id(SMOKE.admin),
      started_at: new Date(Date.now() - 3_600_000).toISOString(), closed_by: id(SMOKE.admin), closed_at: new Date().toISOString(),
    }).select("id"),
    "emergency",
  );
}
