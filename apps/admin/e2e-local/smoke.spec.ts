import { expect, test, type Page } from "@playwright/test";
import { SMOKE, smokeAuthFile, smokePassword, type SmokeRole } from "./local-env";

// Web panel smoke tests (phase 13) on the LOCAL database seeded by global-setup.ts:
// sign-in page, the menu of each role, employees search, approvals (department scope), reports, emergencies.

const nav = (page: Page) => page.getByRole("navigation", { name: "لوحة التحكم" }).first();
const navLinks = async (page: Page) =>
  (await nav(page).getByRole("link").allTextContents()).map((s) => s.trim()).filter(Boolean);

test.describe("sign-in page", () => {
  test("renders in Arabic, right to left, with the two fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByLabel("رقم الملف الوظيفي")).toBeVisible();
    await expect(page.getByLabel("كلمة المرور")).toBeVisible();
    await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
  });

  test("signed-out visitors are sent to the sign-in page", async ({ page }) => {
    await page.goto("/employees");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a wrong password is refused", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("رقم الملف الوظيفي").fill(String(SMOKE.admin));
    await page.getByLabel("كلمة المرور").fill("not-the-password-1");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("رقم الملف أو كلمة المرور غير صحيحة.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an employee account cannot use the web panel", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("رقم الملف الوظيفي").fill(String(SMOKE.employee));
    await page.getByLabel("كلمة المرور").fill(smokePassword());
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText("حسابك حساب موظف. استخدم تطبيق الجوال للتبصيم.");
  });
});

// The menu of each role (PRD 2; apps/admin/src/app/(panel)/layout.tsx). S8/S9 added the ideas box and the
// ideal employee for HR and the admin. Update this list whenever the menu changes on purpose.
const MENUS: Record<SmokeRole, string[]> = {
  supervisor: ["الرئيسية", "اللوحة المباشرة", "الموافقات", "سجل موظف", "التقارير", "الطوارئ"],
  hr: ["الرئيسية", "اللوحة المباشرة", "الموافقات", "سجل موظف", "التقارير", "تسجيل الوجه", "صندوق الأفكار", "الموظف المثالي"],
  admin: ["الرئيسية", "اللوحة المباشرة", "الموافقات", "سجل موظف", "التقارير", "الموظفون", "تسجيل الوجه", "الهيكل التنظيمي", "الطوارئ", "صندوق الأفكار", "الموظف المثالي", "سجل العمليات"],
};

for (const role of ["admin", "supervisor", "hr"] as SmokeRole[]) {
  test.describe(`${role}`, () => {
    test.use({ storageState: smokeAuthFile(role) });

    test(`sidebar shows exactly the ${role} menu`, async ({ page }) => {
      await page.goto("/");
      await expect(nav(page)).toBeVisible();
      expect(await navLinks(page)).toEqual(MENUS[role]);
      await expect(page.getByText(String(SMOKE[role]), { exact: true })).toBeVisible();
    });

    test("reports page opens with its tabs and exports", async ({ page }) => {
      await page.goto("/");
      await nav(page).getByRole("link", { name: "التقارير" }).click();
      await expect(page).toHaveURL(/\/reports/);
      await expect(page.getByRole("heading", { level: 1, name: "التقارير" })).toBeVisible();
      await expect(page.getByTestId("report-tabs")).toBeVisible();
      await expect(page.getByTestId("export-xlsx")).toBeVisible();
      await expect(page.getByTestId("export-pdf")).toBeVisible();
    });
  });
}

test.describe("admin", () => {
  test.use({ storageState: smokeAuthFile("admin") });

  test("employees list: search by file number and by name", async ({ page }) => {
    await page.goto("/");
    await nav(page).getByRole("link", { name: "الموظفون" }).click();
    await expect(page.getByTestId("result-count")).toContainText("موظف");

    await page.getByLabel("بحث برقم الملف أو الاسم").fill(String(SMOKE.itEmployee));
    await page.getByRole("button", { name: "بحث" }).click();
    await expect(page.getByTestId("result-count")).toHaveText("1 موظف");
    await expect(page.getByRole("row", { name: new RegExp(String(SMOKE.itEmployee)) })).toBeVisible();

    await page.getByLabel("بحث برقم الملف أو الاسم").fill("عمليات الفحص");
    await page.getByRole("button", { name: "بحث" }).click();
    await expect(page.getByRole("row", { name: new RegExp(String(SMOKE.employee)) })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(String(SMOKE.itEmployee)) })).toHaveCount(0);
  });

  test("approvals: the departments' requests go to their supervisors, not to the admin", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByRole("heading", { level: 1, name: "الموافقات" })).toBeVisible();
    await expect(page.getByTestId("inbox-item").filter({ hasText: String(SMOKE.employee) })).toHaveCount(0);
    await expect(page.getByTestId("inbox-item").filter({ hasText: String(SMOKE.itEmployee) })).toHaveCount(0);
  });

  test("emergencies page lists the past drill", async ({ page }) => {
    await page.goto("/");
    await nav(page).getByRole("link", { name: "الطوارئ" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "الطوارئ" })).toBeVisible();
    await expect(page.getByTestId("launch-link")).toBeVisible();
    await expect(page.getByRole("row", { name: /موقع الفحص/ })).toBeVisible();
  });
});

test.describe("supervisor", () => {
  test.use({ storageState: smokeAuthFile("supervisor") });

  test("approvals: sees only their own department's request", async ({ page }) => {
    await page.goto("/");
    await nav(page).getByRole("link", { name: "الموافقات" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "الموافقات" })).toBeVisible();
    const items = page.getByTestId("inbox-item");
    await expect(items.filter({ hasText: String(SMOKE.employee) })).toHaveCount(1);
    await expect(items.filter({ hasText: String(SMOKE.itEmployee) })).toHaveCount(0);
  });

  test("cannot open the employees screen (admin only)", async ({ page }) => {
    await page.goto("/employees");
    await expect(page).toHaveURL(/\/$/);
  });

  test("emergencies page opens", async ({ page }) => {
    await page.goto("/emergencies");
    await expect(page.getByRole("heading", { level: 1, name: "الطوارئ" })).toBeVisible();
  });
});

test.describe("hr", () => {
  test.use({ storageState: smokeAuthFile("hr") });

  test("approvals: nothing waits for HR before the supervisor decides", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByTestId("inbox-empty")).toBeVisible();
  });

  test("cannot open emergencies (admin and supervisors only)", async ({ page }) => {
    await page.goto("/emergencies");
    await expect(page).toHaveURL(/\/$/);
  });
});
