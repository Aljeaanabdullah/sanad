// Sanad Phase 9 (PRD 9) — send queued push notifications with FCM HTTP v1.
//
// Who calls it: the database (pg_cron job `notify-run`, and private.enqueue_notification for high priority)
// through pg_net, with the header `x-push-secret`. That value lives only in Supabase Vault; it is checked with
// rpc push_secret_ok (service role). Deployed with verify_jwt = false because the caller has no user JWT.
//
// Body: {} = send what is due.   {"validate": true} = prove the FCM key works: get an OAuth token and call
// messages:send with validate_only (to a topic, so no phone is needed). Nothing is delivered.
//
// Secret FCM_SERVICE_ACCOUNT (Edge Function secret): the Firebase service-account JSON. project_id is read
// from it. Missing -> rows are closed as `not_configured` (nothing sent). No secret is ever logged.
// iOS: the app stores the APNs token, which FCM cannot use, so iOS-only rows are `not_configured`
// (error ios_needs_apns) until APNs sending is added. Android is the first target.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

export type PushToken = { token: string; platform: string; lang: string };
export type OutboxRow = {
  id: string;
  kind: string;
  priority: string;
  title_ar: string;
  title_en: string;
  body_ar: string | null;
  body_en: string | null;
  data: Record<string, unknown> | null;
  tokens: PushToken[] | null;
};
export type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri: string };
export type RowStatus = "sent" | "retry" | "failed" | "no_token" | "not_configured";
export type Outcome = "ok" | "invalid_token" | "retry" | "fail";

/** Android channels created by the app (src/lib/push.ts). */
export const CHANNEL_NORMAL = "sanad";
export const CHANNEL_EMERGENCY = "sanad-emergency";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const BATCH = 100;
const MAX_BATCHES = 5;
const CONCURRENCY = 20;
// FCM refuses these data keys.
const RESERVED = new Set(["from", "notification", "message_type", "collapse_key"]);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    if (typeof v?.project_id !== "string" || typeof v?.client_email !== "string" || typeof v?.private_key !== "string") {
      return null;
    }
    return {
      project_id: v.project_id,
      client_email: v.client_email,
      private_key: v.private_key,
      token_uri: typeof v.token_uri === "string" ? v.token_uri : "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}

export function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** RS256 JWT for Google's OAuth token endpoint (service-account flow), signed with Web Crypto. */
export async function signJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat: nowSec, exp: nowSec + 3600 }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

let cached: { email: string; token: string; until: number } | null = null;
export function clearTokenCache() {
  cached = null;
}

/** OAuth access token for FCM, cached until 5 minutes before it expires. */
export async function accessToken(sa: ServiceAccount, nowMs = Date.now()): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.until > nowMs) return cached.token;
  const assertion = await signJwt(sa, Math.floor(nowMs / 1000));
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body?.access_token !== "string") {
    throw new Error(`oauth_failed_${res.status}`);
  }
  const ttl = Number(body.expires_in ?? 3600);
  cached = { email: sa.client_email, token: body.access_token, until: nowMs + Math.max(60, ttl - 300) * 1000 };
  return body.access_token;
}

/** FCM data values must be strings; nested values (e.g. the employees list) stay in the app's list only. */
export function flatData(row: OutboxRow): Record<string, string> {
  const out: Record<string, string> = { kind: row.kind, notification_id: row.id, priority: row.priority };
  for (const [k, v] of Object.entries(row.data ?? {})) {
    if (RESERVED.has(k) || k.startsWith("google") || k.startsWith("gcm") || k in out) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v).slice(0, 200);
  }
  return out;
}

export function buildMessage(row: OutboxRow, t: PushToken) {
  const en = t.lang === "en";
  const high = row.priority === "high";
  return {
    message: {
      token: t.token,
      notification: { title: en ? row.title_en : row.title_ar, body: (en ? row.body_en : row.body_ar) ?? "" },
      data: flatData(row),
      android: {
        priority: "HIGH",
        notification: { channel_id: high ? CHANNEL_EMERGENCY : CHANNEL_NORMAL, sound: "default", tag: row.id },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default", ...(high ? { "interruption-level": "time-sensitive" } : {}) } },
      },
    },
  };
}

/** What an FCM response means for this token. */
export function classify(status: number, body: unknown): Outcome {
  if (status >= 200 && status < 300) return "ok";
  const err = (body as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } })?.error;
  const codes = (err?.details ?? []).map((d) => d?.errorCode).filter(Boolean);
  if (status === 404 || codes.includes("UNREGISTERED") || err?.status === "NOT_FOUND") return "invalid_token";
  if (status === 403 && codes.includes("SENDER_ID_MISMATCH")) return "invalid_token";
  if (status === 400 && /registration token/i.test(err?.message ?? "")) return "invalid_token";
  if (status === 401 || status === 429 || status >= 500) return "retry";
  return "fail";
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

/** Sends every row to every token of its recipient. */
export async function sendRows(rows: OutboxRow[], sa: ServiceAccount) {
  const token = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  const outcomes = new Map<string, { o: Outcome; err?: string }[]>();
  const invalid = new Set<string>();
  // iOS phones register an APNs token (expo-notifications), which FCM cannot use; they wait for APNs sending.
  const jobs = rows.flatMap((r) => (r.tokens ?? []).filter((t) => t.platform !== "ios").map((t) => ({ r, t })));
  let authFailed = false;
  await pool(jobs, CONCURRENCY, async ({ r, t }) => {
    let o: Outcome;
    let err: string | undefined;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildMessage(r, t)),
      });
      const body = await res.json().catch(() => ({}));
      o = classify(res.status, body);
      if (o !== "ok") err = `${res.status} ${(body as { error?: { status?: string } })?.error?.status ?? ""}`.trim();
      if (res.status === 401) authFailed = true;
    } catch {
      o = "retry";
      err = "network";
    }
    if (o === "invalid_token") invalid.add(t.token);
    const list = outcomes.get(r.id) ?? [];
    list.push({ o, err });
    outcomes.set(r.id, list);
  });
  if (authFailed) clearTokenCache();

  const results = rows.map((r) => {
    const list = outcomes.get(r.id) ?? [];
    let status: RowStatus;
    const iosOnly = list.length === 0 && (r.tokens ?? []).some((t) => t.platform === "ios");
    if (iosOnly) status = "not_configured";
    else if (list.length === 0) status = "no_token";
    else if (list.some((x) => x.o === "ok")) status = "sent";
    else if (list.some((x) => x.o === "retry")) status = "retry";
    else if (list.every((x) => x.o === "invalid_token")) status = "no_token";
    else status = "failed";
    const error = status === "sent" ? null
      : iosOnly ? "ios_needs_apns"
      : list.map((x) => x.err).filter(Boolean).join("; ") || null;
    return { id: r.id, status, error };
  });
  return { results, invalid: [...invalid] };
}

/** validate_only call: proves the OAuth token and the Firebase project, delivers nothing. */
export async function validate(sa: ServiceAccount) {
  const token = await accessToken(sa);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      validate_only: true,
      message: { topic: "sanad-validate", notification: { title: "سند", body: "validate" }, android: { notification: { channel_id: CHANNEL_NORMAL } } },
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, fcm_status: (body as { error?: { status?: string } })?.error?.status ?? null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secret = req.headers.get("x-push-secret");
  if (!secret) return json(401, { error: "unauthorized" });
  const { data: ok } = await db.rpc("push_secret_ok", { p_secret: secret });
  if (ok !== true) return json(401, { error: "unauthorized" });

  const body = await req.json().catch(() => ({}));
  const sa = parseServiceAccount(Deno.env.get("FCM_SERVICE_ACCOUNT"));

  if (body?.validate === true) {
    if (!sa) return json(200, { configured: false });
    try {
      return json(200, { configured: true, project_id: sa.project_id, ...(await validate(sa)) });
    } catch (e) {
      return json(200, { configured: true, project_id: sa.project_id, ok: false, error: (e as Error).message });
    }
  }

  const summary = { claimed: 0, sent: 0, retry: 0, failed: 0, no_token: 0, not_configured: 0, invalid_tokens: 0 };
  for (let b = 0; b < MAX_BATCHES; b++) {
    const { data: rows, error } = await db.rpc("push_claim", { p_limit: BATCH });
    if (error) return json(500, { error: "claim_failed", ...summary });
    const list = (rows ?? []) as OutboxRow[];
    if (list.length === 0) break;
    summary.claimed += list.length;

    let results: { id: string; status: RowStatus; error: string | null }[];
    let invalid: string[] = [];
    if (!sa) {
      results = list.map((r) => ({ id: r.id, status: "not_configured" as const, error: "FCM_SERVICE_ACCOUNT missing" }));
    } else {
      try {
        ({ results, invalid } = await sendRows(list, sa));
      } catch (e) {
        // OAuth failed: keep the rows for a later try.
        results = list.map((r) => ({ id: r.id, status: "retry" as const, error: (e as Error).message }));
      }
    }
    for (const r of results) summary[r.status] += 1;
    summary.invalid_tokens += invalid.length;
    await db.rpc("push_report", { p_results: results, p_invalid_tokens: invalid });
    if (list.length < BATCH) break;
  }
  return json(200, summary);
});
