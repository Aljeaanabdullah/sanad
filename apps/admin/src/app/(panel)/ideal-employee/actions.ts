"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { approvalError, checkApproval } from "@/lib/ideal-employee";

type State = { error?: string; ok?: boolean };

/** Approve one nomination as the month's ideal employee. The database decides who may (HR / admin, never self). */
export async function approveWinner(nominationId: string, _prev: State, formData: FormData): Promise<State> {
  const me = await requireStaff();
  if (me.role !== "hr" && me.role !== "admin") return { error: "not_allowed" };
  const checked = checkApproval({
    reason: formData.get("reason"),
    citation: formData.get("citation"),
    confirm: formData.get("confirm"),
  });
  if (!checked.ok) return { error: checked.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ideal_approve", {
    p_nomination: nominationId,
    p_reason: checked.value.reason,
    p_citation: checked.value.citation,
  });
  if (error) return { error: approvalError(error.message) };
  revalidatePath("/ideal-employee");
  return { ok: true };
}
