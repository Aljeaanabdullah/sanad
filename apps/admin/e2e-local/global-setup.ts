import { chromium, type FullConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { localServiceClient, SMOKE, smokeAuthFile, type SmokeRole } from "./local-env";
import { cleanUpSmoke, seedSmoke } from "./seed";

// Seeds the LOCAL database, then signs in once per staff role and saves the browser sessions.
export default async function globalSetup(config: FullConfig) {
  const db = localServiceClient(); // throws unless the Supabase URL is local
  await cleanUpSmoke(db);
  const password = `Sm${randomBytes(9).toString("base64url")}7`;
  process.env.SANAD_SMOKE_PASSWORD = password;
  await seedSmoke(db, password);

  mkdirSync(path.dirname(smokeAuthFile("admin")), { recursive: true });
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  for (const role of ["admin", "supervisor", "hr"] as SmokeRole[]) {
    const page = await browser.newPage({ baseURL });
    await page.goto("/login");
    await page.locator('input[name="fileNumber"]').fill(String(SMOKE[role]));
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').last().click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 120_000 });
    await page.context().storageState({ path: smokeAuthFile(role) });
    await page.close();
  }
  await browser.close();
}
