// Sanad — delete punch photos older than 3 months (PRD 4.4 and 11). Phase 12.
//
// Called once a day by pg_cron (job `punch-photos-purge`, migration punch_photo_retention) through pg_net.
// Not for apps or users: deployed with verify_jwt = false and protected by a shared secret that lives
// only in Supabase Vault. The cron job sends it in the `x-purge-secret` header; the database RPCs
// check it (they are executable by service_role only).
//
// Steps: ask the database for old photo paths -> remove them with the Storage API (deleting rows in
// storage.objects from SQL is blocked by Supabase and would orphan the files) -> tell the database which
// are gone, so it clears attendance_punches.photo_path (the punch rows stay) and writes one audit_log row.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "punch-photos";
const BATCH = 1000; // Storage API limit per remove() call
const MAX_ROUNDS = 50; // at most 50,000 photos per run; the rest go on the next day

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const secret = req.headers.get("x-purge-secret") ?? "";
  if (secret.length < 32 || secret.length > 256) return json(401, { error: "not_allowed" });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const removed: string[] = [];
  let failed = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await db.rpc("punch_photo_purge_candidates", { p_secret: secret, p_limit: BATCH });
    if (error) {
      if (error.code === "42501") return json(401, { error: "not_allowed" });
      return json(500, { error: "candidates_failed" });
    }
    const paths = ((data ?? []) as { path: string }[]).map((r) => r.path);
    if (paths.length === 0) break;

    const { data: gone, error: removeError } = await db.storage.from(BUCKET).remove(paths);
    if (removeError) {
      failed += paths.length;
      break;
    }
    const goneNames = (gone ?? []).map((o) => o.name);
    removed.push(...goneNames);
    // Anything not removed would come back as a candidate forever: stop and report it.
    if (goneNames.length < paths.length) {
      failed += paths.length - goneNames.length;
      break;
    }
    if (paths.length < BATCH) break;
  }

  const { data: summary, error: finishError } = await db.rpc("punch_photo_purge_finish", {
    p_secret: secret,
    p_removed: removed,
    p_failed: failed,
  });
  if (finishError) return json(500, { error: "finish_failed", removed: removed.length });

  return json(200, { ok: true, ...(summary as Record<string, unknown>) });
}

Deno.serve(handle);
