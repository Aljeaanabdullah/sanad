// Sanad — register the bound phone's signing key (PRD 4.7).
// Body: {
//   "nonce": string,              // from rpc device_challenge('bind_key')
//   "public_key": string,         // base64: SPKI DER (Android) or 65-byte P-256 point (iOS)
//   "attestation": string[]       // Android: Key Attestation chain, leaf first (base64 DER). iOS: omitted.
// }
// The phone must already be bound (rpc bind_device) and have no key yet: a new key needs the admin to
// unbind the phone first, so a stolen session cannot swap the key.
// Env: ANDROID_PACKAGE_NAME (default com.sanad.hr), ANDROID_SIGNING_CERT_SHA256 (comma list, optional).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { b64encode } from "../_shared/der.ts";
import { normalizePublicKey } from "../_shared/device-key.ts";
import { revokedFromStatus, verifyAndroidAttestation } from "../_shared/android-attestation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const STATUS_URL = "https://android.googleapis.com/attestation/status";
let revokedCache: { at: number; set: Set<string> } | null = null;

/** Google's revocation list, cached for an hour. Null when it cannot be read (the check is then skipped and recorded). */
async function revokedSerials(): Promise<Set<string> | null> {
  if (revokedCache && Date.now() - revokedCache.at < 3_600_000) return revokedCache.set;
  try {
    const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const set = revokedFromStatus(await res.json());
    if (set) revokedCache = { at: Date.now(), set };
    return set;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "not_signed_in" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json(401, { error: "not_signed_in" });
  const { data: me } = await db.from("employees").select("id, is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!me || !me.is_active) return json(403, { error: "account_disabled" });

  let body: { nonce?: unknown; public_key?: unknown; attestation?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const publicKey = normalizePublicKey(body.public_key);
  if (typeof body.nonce !== "string" || body.nonce.length > 200 || !publicKey) return json(400, { error: "invalid_body" });

  const { data: device } = await db
    .from("devices").select("id, platform, public_key").eq("employee_id", me.id).maybeSingle();
  if (!device) return json(409, { error: "no_device" });
  if (device.public_key) return json(409, { error: "key_exists" });

  const { data: challenge } = await db.rpc("consume_device_challenge", { p_employee: me.id, p_purpose: "bind_key", p_nonce: body.nonce });
  if (challenge !== "ok") return json(400, { error: "challenge_expired" });

  const { data: settings } = await db
    .from("punch_security_settings").select("allow_unattested_ios").maybeSingle();

  let attested = false;
  let summary: Record<string, unknown> | null = null;
  if (device.platform === "android") {
    // The platform comes from the binding row, not from this request: an Android phone cannot claim to be an iPhone.
    const result = await verifyAndroidAttestation({
      chain: body.attestation,
      publicKey,
      challenge: body.nonce,
      packageName: Deno.env.get("ANDROID_PACKAGE_NAME") || "com.sanad.hr",
      signingDigests: (Deno.env.get("ANDROID_SIGNING_CERT_SHA256") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      revokedSerials: await revokedSerials(),
    });
    if (!result.ok) {
      console.warn("device-key: attestation refused", me.id, result.error, result.detail ?? "");
      return json(422, { error: result.error });
    }
    attested = true;
    summary = result.summary;
  } else if (settings?.allow_unattested_ios === false) {
    return json(422, { error: "attestation_required" });
  }

  // Only a phone with no key gets one (the filter makes a race between two requests harmless).
  const { data: saved, error } = await db
    .from("devices")
    .update({
      public_key: b64encode(publicKey),
      key_attested: attested,
      key_attestation: summary,
      key_registered_at: new Date().toISOString(),
    })
    .eq("id", device.id)
    .is("public_key", null)
    .select("id");
  if (error) return json(500, { error: "save_failed" });
  if (!saved || saved.length === 0) return json(409, { error: "key_exists" });

  return json(200, { result: attested ? "attested" : "unattested" });
});
