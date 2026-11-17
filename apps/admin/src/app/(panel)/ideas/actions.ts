"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canManageIdeas, canRevealAuthor, ideaError, IDEA_STATUSES, type IdeaStatus } from "@/lib/ideas";

export type IdeaActionState = { error?: string; ok?: boolean; author?: { file_number: number; full_name_ar: string; full_name_en: string } | null };

async function staff() {
  const me = await requireStaff();
  return canManageIdeas(me.role) ? me : null;
}

/** HR review before publishing. The database checks the role and sends the reason to the author. */
export async function reviewIdea(ideaId: string, _prev: IdeaActionState, formData: FormData): Promise<IdeaActionState> {
  if (!(await staff())) return { error: "not_allowed" };
  const approve = formData.get("decision") === "publish";
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("idea_review", { p_idea: ideaId, p_approve: approve, p_reason: reason || null });
  if (error) return { error: ideaError(error.message) };
  revalidatePath("/ideas");
  return { ok: true };
}

/** Management reply / progress. Author and every supporter are notified by the database. */
export async function setIdeaStatus(ideaId: string, _prev: IdeaActionState, formData: FormData): Promise<IdeaActionState> {
  if (!(await staff())) return { error: "not_allowed" };
  const status = String(formData.get("status") ?? "") as IdeaStatus;
  if (!(IDEA_STATUSES as readonly string[]).includes(status)) return { error: "idea_status_invalid" };
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.rpc("idea_set_status", { p_idea: ideaId, p_status: status, p_reason: reason || null });
  if (error) return { error: ideaError(error.message) };
  revalidatePath("/ideas");
  return { ok: true };
}

/** System admin only: who wrote an anonymous idea. The database writes every call to the audit log. */
export async function revealAuthor(ideaId: string, _prev: IdeaActionState, formData: FormData): Promise<IdeaActionState> {
  const me = await requireStaff();
  if (!canRevealAuthor(me.role)) return { error: "not_allowed" };
  if (formData.get("confirm") !== "yes") return { error: "reason_required" };
  const reason = String(formData.get("reason") ?? "").trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("idea_reveal_author", { p_idea: ideaId, p_reason: reason });
  if (error) return { error: ideaError(error.message) };
  const row = (data as IdeaActionState["author"][] | null)?.[0] ?? null;
  return { ok: true, author: row };
}
