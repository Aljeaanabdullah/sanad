import { createClient } from "@supabase/supabase-js";
import path from "node:path";

// Smoke tests talk ONLY to a local Supabase (`supabase start`), never to the live project.
// The values come from `supabase status -o env` (see supabase/tests/run-local.sh); apps/admin/.env.local is never read.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function localEnv() {
  const url = process.env.SANAD_LOCAL_SUPABASE_URL ?? "";
  const publishableKey = process.env.SANAD_LOCAL_PUBLISHABLE_KEY ?? "";
  const secretKey = process.env.SANAD_LOCAL_SECRET_KEY ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}
  if (!LOCAL_HOSTS.has(host) || url.includes("supabase.co")) {
    throw new Error(
      `Smoke tests run against a LOCAL Supabase only; SANAD_LOCAL_SUPABASE_URL is "${url || "(empty)"}". ` +
        "Start one with `supabase start` and use supabase/tests/run-local.sh.",
    );
  }
  if (!publishableKey || !secretKey) throw new Error("SANAD_LOCAL_PUBLISHABLE_KEY and SANAD_LOCAL_SECRET_KEY must be set.");
  return { url, publishableKey, secretKey };
}

/** Service client for the LOCAL database (throws for any other address). */
export function localServiceClient() {
  const { url, secretKey } = localEnv();
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Test accounts, local database only. File numbers 799821-799829 are reserved for the smoke tests.
export const SMOKE = {
  admin: 799821,
  supervisor: 799822, // supervisor of "Smoke Ops"
  hr: 799823,
  employee: 799824, // in "Smoke Ops"
  itEmployee: 799825, // in "Smoke IT"
  itSupervisor: 799826, // supervisor of "Smoke IT"
} as const;
export type SmokeRole = "admin" | "supervisor" | "hr";

export const smokeAuthFile = (role: SmokeRole) => path.resolve(__dirname, `.auth/${role}.json`);
export const emailFor = (n: number) => `${n}@jahez.local`;
/** Random per run (set by global-setup.ts, inherited by the test workers); never printed or stored. */
export const smokePassword = () => {
  const p = process.env.SANAD_SMOKE_PASSWORD;
  if (!p) throw new Error("SANAD_SMOKE_PASSWORD is set by global-setup.ts");
  return p;
};
