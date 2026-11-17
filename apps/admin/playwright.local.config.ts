import { defineConfig, devices } from "@playwright/test";
import { localEnv } from "./e2e-local/local-env";

// Smoke tests of the web panel against a LOCAL Supabase only (never the live project).
// Easiest: supabase/tests/run-local.sh (starts the local stack and sets the values below).
// The panel runs on port 3100 with the local values, which win over apps/admin/.env.local.
const env = localEnv(); // throws unless the Supabase URL is 127.0.0.1 / localhost
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e-local",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  outputDir: "test-results-local",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e-local/global-setup.ts",
  globalTeardown: "./e2e-local/global-teardown.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "ar-KW" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build is faster to click through than `next dev`; CI builds it first (SMOKE_BUILT=1).
    command: process.env.SMOKE_BUILT ? `npx next start --port ${PORT}` : `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    // Never reuse a running server: it may be connected to the live project.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
      SUPABASE_SECRET_KEY: env.secretKey,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
