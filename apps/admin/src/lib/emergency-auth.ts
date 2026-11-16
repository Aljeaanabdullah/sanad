import "server-only";
import { redirect } from "next/navigation";
import { requireStaff } from "./auth";

/** Emergency screens: system admin and supervisors only (PRD 8.3). The database functions check the role again. */
export async function requireEmergencyStaff() {
  const me = await requireStaff();
  if (me.role !== "admin" && me.role !== "supervisor") redirect("/");
  return me;
}
