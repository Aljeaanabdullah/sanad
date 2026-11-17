import { describe, expect, it } from "vitest";
import { idealText } from "./i18n-ideal";
import {
  approvalError, canApprove, checkApproval, CITATION_MAX, kuwaitMonth, monthName, pickMonth, REASON_MAX, REASON_MIN, shiftMonth,
} from "./ideal-employee";

describe("month of the page", () => {
  it("Kuwait month, also across midnight UTC", () => {
    // 2026-11-30 22:30 UTC is already 1 December in Kuwait (UTC+3).
    expect(kuwaitMonth(new Date("2026-11-30T22:30:00Z"))).toBe("2026-12");
    expect(kuwaitMonth(new Date("2026-11-30T20:59:00Z"))).toBe("2026-11");
  });
  it("valid ?month= is used, a future or bad one falls back to the current month", () => {
    expect(pickMonth("2026-10", "2026-11")).toBe("2026-10");
    expect(pickMonth(["2026-09"], "2026-11")).toBe("2026-09");
    expect(pickMonth("2026-12", "2026-11")).toBe("2026-11");
    expect(pickMonth("2026-13", "2026-11")).toBe("2026-11");
    expect(pickMonth("x", "2026-11")).toBe("2026-11");
    expect(pickMonth(undefined, "2026-11")).toBe("2026-11");
  });
  it("previous / next month across the year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });
  it("month names in both languages", () => {
    expect(monthName("2026-11-01", "en")).toBe("November 2026");
    expect(monthName("2026-11", "ar")).toContain("2026");
  });
});

describe("approval form (same limits as the server)", () => {
  const good = { reason: "  أنهى مشروع الأرشفة قبل موعده  ", citation: "", confirm: "yes" };
  it("needs the explicit confirmation (it notifies every employee)", () => {
    expect(checkApproval({ ...good, confirm: null })).toEqual({ ok: false, error: "confirm_required" });
  });
  it("reason: 10 to 500 characters after trimming", () => {
    expect(checkApproval({ ...good, reason: "ممتاز" })).toEqual({ ok: false, error: "reason_too_short" });
    expect(checkApproval({ ...good, reason: "a".repeat(REASON_MIN) }).ok).toBe(true);
    expect(checkApproval({ ...good, reason: "a".repeat(REASON_MAX + 1) })).toEqual({ ok: false, error: "reason_too_long" });
  });
  it("citation is optional, up to 200 characters", () => {
    expect(checkApproval(good)).toEqual({ ok: true, value: { reason: "أنهى مشروع الأرشفة قبل موعده", citation: null } });
    expect(checkApproval({ ...good, citation: " قدوة " })).toEqual({ ok: true, value: { reason: "أنهى مشروع الأرشفة قبل موعده", citation: "قدوة" } });
    expect(checkApproval({ ...good, citation: "a".repeat(CITATION_MAX + 1) })).toEqual({ ok: false, error: "citation_too_long" });
  });
});

describe("who approves", () => {
  const n = { nominee_id: "e1" };
  it("HR and admin approve, while the month is open", () => {
    expect(canApprove(n, { meId: "h1", role: "hr", decided: false })).toBe(true);
    expect(canApprove(n, { meId: "a1", role: "admin", decided: false })).toBe(true);
    expect(canApprove(n, { meId: "h1", role: "hr", decided: true })).toBe(false);
  });
  it("supervisors never approve, and nobody approves their own nomination", () => {
    expect(canApprove(n, { meId: "s1", role: "supervisor", decided: false })).toBe(false);
    expect(canApprove(n, { meId: "e1", role: "hr", decided: false })).toBe(false);
  });
});

describe("errors and texts", () => {
  it("every server refusal has a text in both languages", () => {
    for (const code of ["not_allowed", "not_found", "cannot_approve_self", "month_in_future", "reason_too_short", "reason_too_long", "citation_too_long", "already_decided", "nominee_inactive"]) {
      expect(approvalError(`ERROR: ${code}`)).toBe(code);
      expect(idealText.ar.errors[code]).toBeTruthy();
      expect(idealText.en.errors[code]).toBeTruthy();
    }
    expect(approvalError("network down")).toBe("generic");
    expect(approvalError(undefined)).toBe("generic");
    expect(idealText.ar.errors.confirm_required).toBeTruthy();
  });
  it("Arabic and English texts have the same keys", () => {
    expect(Object.keys(idealText.ar).sort()).toEqual(Object.keys(idealText.en).sort());
    expect(Object.keys(idealText.ar.errors).sort()).toEqual(Object.keys(idealText.en.errors).sort());
  });
});
