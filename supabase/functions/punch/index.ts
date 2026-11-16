// Jahez — punch in / out (Phases 6–8). Every attempt is checked here, on the server, and recorded.
// Body: {
//   "device_identifier": string,
//   "location": { "lat": number, "lng": number, "accuracy": number },
//   "report": { "vpn": bool, "mock_location": bool, "rooted": bool,
//               "liveness": { "challenge": string, "passed": bool } },
//   "descriptor": number[128],          // computed on the phone (owner decision, Phase 6)
//   "model_version": "dlib-resnet-v1/align-v1",
//   "photo": string                     // JPEG, base64, kept for review
// }
// Sanad (PRD 4.6, owner decision 2026-11-16): a second way to verify, for the Expo app:
//   "verification": "device_biometric",
//   "report": { "vpn", "mock_location", "rooted", "biometric": { "passed": bool, "type": string } }
//   no "descriptor" / "model_version". The phone's Face ID / fingerprint proves the owner of the bound
//   phone; the review photo is still required and kept. The face-descriptor path above is unchanged.
// Sanad S3 (PRD 4.7): the device-biometric punch is signed by the phone's key (Face ID / fingerprint unlocks it):
//   "signature": { "nonce": string,   // rpc device_challenge('punch'), valid 60 s, used once
//                  "value": string }  // base64 DER ECDSA P-256 / SHA-256 over punchSigningPayload(...)
//   Checked and recorded always; refused only when punch_security_settings.require_device_signature is on.
//   VPN is recorded, not refused (PRD 5.4, version 1.11). The face-descriptor path can be switched off.
// The server decides in/out from the shift windows (rules engine, Phase 7), uses its own clock,
// and returns the result with a reason.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { punchSigningPayload, sha256b64, verifyDeviceSignature } from "../_shared/device-key.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const MODEL_VERSION = "dlib-resnet-v1/align-v1";
/** Same person if the distance to the enrolled face is at most this. */
export const FACE_MAX_DISTANCE = 0.5;
/** GPS readings less precise than this are refused. */
export const MAX_ACCURACY_M = 100;
/** PRD 4.3: 5 failed attempts in a row lock punching for 5 minutes. */
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 5;
const MAX_PHOTO_BYTES = 600 * 1024;

/** Result of the signature check, recorded with every device-biometric attempt. */
export type SignatureStatus = "ok" | "no_key" | "unattested" | "missing" | "expired" | "invalid";
/** Refusal reason for each failed signature status (only when the owner turned the requirement on). */
export const SIGNATURE_REASON: Record<Exclude<SignatureStatus, "ok">, string> = {
  no_key: "device_key_missing",
  unattested: "device_key_missing",
  missing: "signature_missing",
  expired: "challenge_expired",
  invalid: "signature_invalid",
};
const DEFAULT_SETTINGS = { require_device_signature: false, allow_face_descriptor: true, allow_unattested_ios: true };

type Body = {
  verification?: unknown;
  device_identifier?: unknown;
  location?: { lat?: unknown; lng?: unknown; accuracy?: unknown };
  report?: {
    vpn?: unknown;
    mock_location?: unknown;
    rooted?: unknown;
    liveness?: { challenge?: unknown; passed?: unknown };
    biometric?: { passed?: unknown; type?: unknown };
  };
  descriptor?: unknown;
  model_version?: unknown;
  photo?: unknown;
  signature?: { nonce?: unknown; value?: unknown };
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Kuwait calendar date of an instant (used for refused attempts that belong to no shift). */
export function kuwaitDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait" }).format(d);
}

function decodeJpeg(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || b64.length > MAX_PHOTO_BYTES * 1.4) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 ? bytes : null;
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
  const now = new Date();

  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return json(401, { error: "not_signed_in" });
  const { data: me } = await db
    .from("employees").select("id, is_active").eq("user_id", auth.user.id).maybeSingle();
  if (!me || !me.is_active) return json(403, { error: "account_disabled" });

  // Lock after 5 refused attempts in a row, for 5 minutes after the last one.
  const { data: recent } = await db
    .from("attendance_punches")
    .select("result, punched_at")
    .eq("employee_id", me.id)
    .order("punched_at", { ascending: false })
    .limit(LOCK_AFTER);
  if (recent && recent.length === LOCK_AFTER && recent.every((p) => p.result === "rejected")) {
    const unlockAt = new Date(new Date(recent[0].punched_at).getTime() + LOCK_MINUTES * 60_000);
    if (unlockAt > now) return json(429, { error: "locked", unlock_at: unlockAt.toISOString() });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const lat = num(body.location?.lat);
  const lng = num(body.location?.lng);
  const accuracy = num(body.location?.accuracy);
  const biometricMode = body.verification === "device_biometric";
  if (body.verification !== undefined && !biometricMode) return json(400, { error: "invalid_body" });
  const descriptor = body.descriptor;
  const validDescriptor =
    Array.isArray(descriptor) && descriptor.length === 128 && descriptor.every((v) => num(v) !== null);
  if (lat === null || lng === null || accuracy === null || (!biometricMode && !validDescriptor) ||
      typeof body.device_identifier !== "string") {
    return json(400, { error: "invalid_body" });
  }
  const photo = decodeJpeg(body.photo);
  if (!photo) return json(400, { error: "invalid_photo" });

  // ----- checks, in order; the first failure is the recorded reason
  let reason: string | null = null;
  let siteId: string | null = null;
  let site: { name_ar: string; name_en: string } | null = null;
  let distanceM: number | null = null;
  let faceDistance: number | null = null;

  const { data: device } = await db
    .from("devices").select("id, device_identifier, public_key, key_attested").eq("employee_id", me.id).maybeSingle();
  const { count: consents } = await db
    .from("consents").select("id", { count: "exact", head: true }).eq("employee_id", me.id);
  const { data: settingsRow } = await db
    .from("punch_security_settings")
    .select("require_device_signature, allow_face_descriptor, allow_unattested_ios")
    .maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) };
  const rightDevice = !!device && device.device_identifier === body.device_identifier;

  // The signature: made on the bound phone, by its key, after Face ID / fingerprint, for this nonce and these values.
  let signature: SignatureStatus | null = null;
  if (biometricMode && device && rightDevice) {
    const sig = body.signature;
    if (!device.public_key) signature = "no_key";
    else if (!device.key_attested && !settings.allow_unattested_ios) signature = "unattested";
    else if (typeof sig?.nonce !== "string" || typeof sig?.value !== "string" || sig.nonce.length > 200) signature = "missing";
    else {
      const { data: used } = await db.rpc("consume_device_challenge", { p_employee: me.id, p_purpose: "punch", p_nonce: sig.nonce });
      if (used !== "ok") signature = "expired";
      else {
        const payload = punchSigningPayload({
          nonce: sig.nonce,
          lat,
          lng,
          accuracy,
          photoSha256: await sha256b64(body.photo as string),
          vpn: body.report?.vpn === true,
          mockLocation: body.report?.mock_location === true,
          rooted: body.report?.rooted === true,
        });
        signature = (await verifyDeviceSignature(device.public_key, payload, sig.value)) ? "ok" : "invalid";
      }
    }
  }

  if (!consents) reason = "no_consent";
  else if (!rightDevice) reason = "wrong_device";
  else if (!biometricMode && !settings.allow_face_descriptor) reason = "method_disabled";
  else if (signature && signature !== "ok" && settings.require_device_signature) reason = SIGNATURE_REASON[signature];
  // VPN is recorded in client_report, not refused (PRD 5.4, version 1.11).
  else if (body.report?.mock_location === true) reason = "mock_location";
  else if (body.report?.rooted === true) reason = "rooted";
  else if (biometricMode && body.report?.biometric?.passed !== true) reason = "biometric_failed";
  else if (!biometricMode && body.report?.liveness?.passed !== true) reason = "liveness_failed";
  else if (accuracy > MAX_ACCURACY_M) reason = "weak_gps";
  else if (!biometricMode && body.model_version !== MODEL_VERSION) reason = "wrong_model_version";

  // In or out, and for which shift: decided by the rules engine from the shift windows.
  const { data: slots, error: slotError } = await db.rpc("punch_slot", { p_employee: me.id, p_at: now.toISOString() });
  const slot = Array.isArray(slots) ? slots[0] : null;
  if (slotError || !slot) return json(500, { error: "rules_failed" });
  const punchType: string = slot.punch_type ?? "check_in";

  // Enabled sites, plus a site of an approved external mission for this shift's date (Phase 8).
  const shiftDate: string = slot.shift_date ?? kuwaitDate(now);
  let byMission = false;
  if (!reason) {
    const { data: near } = await db.rpc("sites_near", { p_employee_id: me.id, p_lat: lat, p_lng: lng, p_on: shiftDate });
    const nearest = Array.isArray(near) ? near[0] : null;
    if (!nearest) reason = "no_site";
    else {
      distanceM = Math.round(nearest.distance_m);
      site = { name_ar: nearest.name_ar, name_en: nearest.name_en };
      if (nearest.distance_m > nearest.radius_m) reason = "outside_site";
      else {
        siteId = nearest.site_id;
        byMission = nearest.by_mission === true;
      }
    }
  }

  if (!reason && !biometricMode) {
    const { data: dist, error } = await db.rpc("face_distance", {
      p_employee_id: me.id,
      p_embedding: `[${(descriptor as number[]).join(",")}]`,
    });
    if (error || dist === null || dist === undefined) reason = "not_enrolled";
    else {
      faceDistance = Number(dist);
      if (faceDistance > FACE_MAX_DISTANCE) reason = "face_mismatch";
    }
  }

  if (!reason && slot.reason) reason = slot.reason;

  // Keep the photo of every attempt for review (deleted after 3 months, Phase 12).
  const photoPath = `${me.id}/${now.getTime()}.jpg`;
  const { error: uploadError } = await db.storage
    .from("punch-photos").upload(photoPath, photo, { contentType: "image/jpeg" });

  const { data: saved, error: insertError } = await db.from("attendance_punches").insert({
    employee_id: me.id,
    punch_type: punchType,
    punched_at: now.toISOString(),
    shift_date: shiftDate,
    site_id: siteId,
    latitude: lat,
    longitude: lng,
    accuracy_m: accuracy,
    device_id: device?.id ?? null,
    result: reason ? "rejected" : "accepted",
    reject_reason: reason,
    face_score: faceDistance,
    liveness_passed: body.report?.liveness?.passed === true,
    photo_path: uploadError ? null : photoPath,
    client_report: {
      ...(body.report ?? {}),
      // The device id is not stored: the employee can read this report (S3).
      by_mission: byMission,
      verification: biometricMode ? "device_biometric" : "face_descriptor",
      ...(biometricMode ? { signature: signature ?? "not_checked", key_attested: device?.key_attested === true } : {}),
    },
  }).select("id").single();
  if (insertError || !saved) return json(500, { error: "save_failed" });

  // Accepted: update the day's record (on time / late minutes, or check-out / early-leave minutes).
  let day: Record<string, unknown> | null = null;
  if (!reason) {
    const { error: applyError } = await db.rpc("attendance_apply_punch", { p_punch_id: saved.id, p_shift_start: slot.shift_start });
    if (applyError) return json(500, { error: "rules_failed" });
    const { data: row } = await db.from("attendance_days")
      .select("arrival, departure, late_minutes, early_leave_minutes, shift_start, shift_end")
      .eq("employee_id", me.id).eq("shift_start", slot.shift_start).maybeSingle();
    day = row;
  }

  return json(200, {
    result: reason ? "rejected" : "accepted",
    reason,
    punch_type: punchType,
    punched_at: now.toISOString(),
    site,
    distance_m: distanceM,
    day,
  });
});
