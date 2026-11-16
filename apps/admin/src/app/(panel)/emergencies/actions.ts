"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireEmergencyStaff } from "@/lib/emergency-auth";
import { createClient } from "@/lib/supabase/server";

type State = { error?: string; ok?: boolean; count?: number };
const KNOWN = [
  "not_allowed", "site_not_found", "invalid_buildings", "departments_required", "message_too_long",
  "already_active", "no_targets", "not_active", "invalid_request",
];
const code = (message: string) => KNOWN.find((k) => message.includes(k)) ?? "generic";

export type LaunchInput = {
  site: string;
  hazard: "fire" | "gas_leak" | "other";
  danger: string[];
  safe: string;
  mode: "present" | "site" | "department";
  departments: string[];
  messageAr: string;
  messageEn: string;
  drill: boolean;
};

/** How many employees the launch would alert (shown in the confirm step). */
export async function previewTargets(input: Pick<LaunchInput, "site" | "mode" | "departments">): Promise<State> {
  await requireEmergencyStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emergency_preview_targets", {
    p_site: input.site,
    p_mode: input.mode,
    p_departments: input.mode === "department" ? input.departments : [],
  });
  if (error) return { error: code(error.message) };
  return { ok: true, count: Number(data ?? 0) };
}

/** Launches the alert, then opens its live board. Written to the audit log by the database. */
export async function launchEmergency(input: LaunchInput): Promise<State> {
  await requireEmergencyStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emergency_launch", {
    p_site: input.site,
    p_hazard: input.hazard,
    p_danger_buildings: input.danger,
    p_safe_building: input.safe,
    p_mode: input.mode,
    p_departments: input.mode === "department" ? input.departments : [],
    p_message_ar: input.messageAr.trim() || null,
    p_message_en: input.messageEn.trim() || null,
    p_is_drill: input.drill,
  });
  if (error) return { error: code(error.message) };
  revalidatePath("/emergencies");
  redirect(`/emergencies/${(data as { id: string }).id}`);
}

export async function closeEmergency(id: string): Promise<State> {
  await requireEmergencyStaff();
  const supabase = await createClient();
  const { error } = await supabase.rpc("emergency_close", { p_emergency: id });
  if (error) return { error: code(error.message) };
  revalidatePath(`/emergencies/${id}`);
  revalidatePath("/emergencies");
  return { ok: true };
}

/** Queues alerts that could not be queued at launch (before the notifications service existed). */
export async function resendPush(id: string): Promise<State> {
  await requireEmergencyStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emergency_resend_push", { p_emergency: id });
  if (error) return { error: code(error.message) };
  revalidatePath(`/emergencies/${id}`);
  return { ok: true, count: Number(data ?? 0) };
}
